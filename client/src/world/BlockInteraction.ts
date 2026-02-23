// ═══════════════════════════════════════════════════════════════════
// BLOCK INTERACTION
//
// Handles player interaction with the voxel world:
//   1. DDA raycast from camera to find targeted block + face
//   2. Wireframe outline on the targeted block
//   3. Left-click hold = progressive mining (break timer)
//   4. Right-click = place block on the adjacent face
//
// Sends BLOCK_BREAK / BLOCK_PLACE messages to the server.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, MessageType, getBlock as getBlockDef } from '@grudge/shared';

// ── Types ─────────────────────────────────────────────────────────

/** Block query callback: returns block ID at world position */
export type BlockQueryFn = (wx: number, wy: number, wz: number) => number;

/** WebSocket send callback */
export type SendFn = (msg: { type: string; data: unknown }) => void;

export interface RaycastHit {
  /** World position of the hit block */
  blockPos: THREE.Vector3;
  /** Block ID at hit position */
  blockId: number;
  /** Normal of the face that was hit (for placement) */
  normal: THREE.Vector3;
  /** Exact world position of the ray intersection */
  hitPoint: THREE.Vector3;
}

// ── DDA Voxel Raycast ─────────────────────────────────────────────

/**
 * Cast a ray through the voxel grid using the DDA (Digital Differential Analyzer)
 * algorithm. Returns the first non-air, non-liquid block hit.
 */
export function voxelRaycast(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  getBlockId: BlockQueryFn,
  maxDist = 8,
): RaycastHit | null {
  // Normalize direction
  const dx = direction.x, dy = direction.y, dz = direction.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-10) return null;
  const idx = dx / len, idy = dy / len, idz = dz / len;

  // Current voxel position
  let ix = Math.floor(origin.x);
  let iy = Math.floor(origin.y);
  let iz = Math.floor(origin.z);

  // Step direction (+1 or -1)
  const stepX = idx > 0 ? 1 : -1;
  const stepY = idy > 0 ? 1 : -1;
  const stepZ = idz > 0 ? 1 : -1;

  // Distance along ray to next voxel boundary
  const tDeltaX = Math.abs(1 / idx);
  const tDeltaY = Math.abs(1 / idy);
  const tDeltaZ = Math.abs(1 / idz);

  let tMaxX = idx > 0
    ? (ix + 1 - origin.x) / idx
    : (origin.x - ix) / -idx;
  let tMaxY = idy > 0
    ? (iy + 1 - origin.y) / idy
    : (origin.y - iy) / -idy;
  let tMaxZ = idz > 0
    ? (iz + 1 - origin.z) / idz
    : (origin.z - iz) / -idz;

  // Track which face was hit (normal)
  const normal = new THREE.Vector3();
  let t = 0;

  for (let i = 0; i < maxDist * 3; i++) {
    // Check current voxel
    if (iy >= 0 && iy < CHUNK_HEIGHT) {
      const blockId = getBlockId(ix, iy, iz);
      if (blockId > 0) {
        const def = getBlockDef(blockId);
        if (def.solid) {
          return {
            blockPos: new THREE.Vector3(ix, iy, iz),
            blockId,
            normal: normal.clone(),
            hitPoint: new THREE.Vector3(
              origin.x + idx * t,
              origin.y + idy * t,
              origin.z + idz * t,
            ),
          };
        }
      }
    }

    // Advance to next voxel boundary
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        t = tMaxX;
        ix += stepX;
        tMaxX += tDeltaX;
        normal.set(-stepX, 0, 0);
      } else {
        t = tMaxZ;
        iz += stepZ;
        tMaxZ += tDeltaZ;
        normal.set(0, 0, -stepZ);
      }
    } else {
      if (tMaxY < tMaxZ) {
        t = tMaxY;
        iy += stepY;
        tMaxY += tDeltaY;
        normal.set(0, -stepY, 0);
      } else {
        t = tMaxZ;
        iz += stepZ;
        tMaxZ += tDeltaZ;
        normal.set(0, 0, -stepZ);
      }
    }

    if (t > maxDist) break;
  }

  return null;
}

// ── Block Interaction System ──────────────────────────────────────

export class BlockInteraction {
  private getBlockId: BlockQueryFn;
  private sendFn: SendFn | null = null;

  // Raycast state
  private _hit: RaycastHit | null = null;

  // Wireframe outline
  private outline: THREE.LineSegments;
  private outlineMaterial: THREE.LineBasicMaterial;

  // Mining state
  private miningTarget: THREE.Vector3 | null = null;
  private miningProgress = 0;
  private miningBlockId = 0;

  // Mining progress bar (HTML overlay)
  private progressBar: HTMLDivElement;
  private progressFill: HTMLDivElement;

  // Reusable
  private _rayDir = new THREE.Vector3();

  /** Max interaction distance (blocks) */
  readonly maxReach = 8;

  constructor(scene: THREE.Scene, getBlockId: BlockQueryFn) {
    this.getBlockId = getBlockId;

    // Create wireframe outline (unit cube at 0,0,0, moved per frame)
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.005, 1.005, 1.005));
    this.outlineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    this.outline = new THREE.LineSegments(edges, this.outlineMaterial);
    this.outline.visible = false;
    this.outline.renderOrder = 999;
    scene.add(this.outline);

    // Mining progress bar
    this.progressBar = document.createElement('div');
    this.progressBar.style.cssText = `
      position: absolute; pointer-events: none; z-index: 15;
      width: 60px; height: 6px; background: rgba(0,0,0,0.6);
      border: 1px solid rgba(255,255,255,0.2); border-radius: 3px;
      overflow: hidden; display: none;
      transform: translate(-50%, -100%);
    `;
    this.progressFill = document.createElement('div');
    this.progressFill.style.cssText = 'width: 0%; height: 100%; background: #d4a843; border-radius: 2px; transition: width 0.05s;';
    this.progressBar.appendChild(this.progressFill);
    document.body.appendChild(this.progressBar);
  }

  /** Set the network send function */
  setSendFn(fn: SendFn): void {
    this.sendFn = fn;
  }

  /** Currently targeted block (or null) */
  get hit(): RaycastHit | null { return this._hit; }

  // ── Update (call every frame) ───────────────────────────────

  update(
    dt: number,
    camera: THREE.Camera,
    playerPos: THREE.Vector3,
    mining: boolean,
    placing: boolean,
    screenWidth: number,
    screenHeight: number,
  ): void {
    // Cast ray from camera center
    this._rayDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this._hit = voxelRaycast(camera.position, this._rayDir, this.getBlockId, this.maxReach);

    // Update outline
    if (this._hit) {
      this.outline.visible = true;
      this.outline.position.set(
        this._hit.blockPos.x + 0.5,
        this._hit.blockPos.y + 0.5,
        this._hit.blockPos.z + 0.5,
      );
    } else {
      this.outline.visible = false;
    }

    // Mining logic
    if (mining && this._hit) {
      const bp = this._hit.blockPos;

      // Check if we're still mining the same block
      if (this.miningTarget && this.miningTarget.equals(bp)) {
        // Continue mining
        const def = getBlockDef(this.miningBlockId);
        const breakTime = Math.max(0.1, def.hardness * 1.5); // seconds to break
        this.miningProgress += dt / breakTime;

        if (this.miningProgress >= 1) {
          // Block broken!
          this.sendFn?.({
            type: MessageType.BLOCK_BREAK,
            data: { x: bp.x, y: bp.y, z: bp.z },
          });
          this.resetMining();
        }
      } else {
        // Started mining a new block
        this.miningTarget = bp.clone();
        this.miningBlockId = this._hit.blockId;
        this.miningProgress = 0;
      }

      // Update progress bar position
      this.updateProgressBar(camera, bp, screenWidth, screenHeight);
    } else {
      this.resetMining();
    }

    // Block placement (right-click / single press)
    if (placing && this._hit) {
      const placePos = this._hit.blockPos.clone().add(this._hit.normal);

      // Don't place inside the player
      const px = Math.floor(playerPos.x);
      const py = Math.floor(playerPos.y);
      const pz = Math.floor(playerPos.z);
      if (
        placePos.x === px && placePos.z === pz &&
        (placePos.y === py || placePos.y === py + 1)
      ) {
        return; // Would place inside player
      }

      // Place a cobblestone block (default, later: selected from hotbar)
      this.sendFn?.({
        type: MessageType.BLOCK_PLACE,
        data: {
          x: placePos.x, y: placePos.y, z: placePos.z,
          blockId: 8, // cobblestone
        },
      });
    }
  }

  private resetMining(): void {
    this.miningTarget = null;
    this.miningProgress = 0;
    this.miningBlockId = 0;
    this.progressBar.style.display = 'none';
  }

  private updateProgressBar(
    camera: THREE.Camera,
    blockPos: THREE.Vector3,
    sw: number,
    sh: number,
  ): void {
    // Project block center to screen
    const screenPos = new THREE.Vector3(
      blockPos.x + 0.5,
      blockPos.y + 1.2,
      blockPos.z + 0.5,
    ).project(camera);

    if (screenPos.z > 1) {
      this.progressBar.style.display = 'none';
      return;
    }

    this.progressBar.style.display = '';
    const x = (screenPos.x * 0.5 + 0.5) * sw;
    const y = (-screenPos.y * 0.5 + 0.5) * sh;
    this.progressBar.style.left = `${x}px`;
    this.progressBar.style.top = `${y}px`;
    this.progressFill.style.width = `${Math.min(100, this.miningProgress * 100)}%`;
  }

  // ── Cleanup ─────────────────────────────────────────────────

  dispose(): void {
    this.outline.geometry.dispose();
    this.outlineMaterial.dispose();
    this.progressBar.remove();
  }
}
