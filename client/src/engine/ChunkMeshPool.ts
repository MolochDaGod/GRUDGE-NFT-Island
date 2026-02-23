// ═══════════════════════════════════════════════════════════════════
// CHUNK MESH POOL
//
// Manages a pool of Web Workers for parallel off-main-thread
// chunk meshing. Tasks are queued and distributed round-robin.
//
// Usage:
//   const pool = new ChunkMeshPool(scene, material, chunkData);
//   pool.requestMesh(cx, cz);  // async — mesh appears in scene when ready
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { CHUNK_SIZE } from '@grudge/shared';
import type { ChunkData } from '@grudge/shared';
import type { MeshWorkerRequest, MeshWorkerResponse } from './MeshWorker.js';

// ── Pool ──────────────────────────────────────────────────────────

export class ChunkMeshPool {
  private workers: Worker[] = [];
  private nextWorker = 0;
  private nextId = 0;

  private scene: THREE.Scene;
  private material: THREE.Material;
  private chunkData: Map<string, ChunkData>;
  private chunkMeshes: Map<string, THREE.Mesh>;

  /** Tasks awaiting completion */
  private pending = new Map<number, { cx: number; cz: number }>();

  constructor(
    scene: THREE.Scene,
    material: THREE.Material,
    chunkData: Map<string, ChunkData>,
    chunkMeshes: Map<string, THREE.Mesh>,
    workerCount = Math.min(navigator.hardwareConcurrency || 2, 4),
  ) {
    this.scene = scene;
    this.material = material;
    this.chunkData = chunkData;
    this.chunkMeshes = chunkMeshes;

    // Spawn workers
    for (let i = 0; i < workerCount; i++) {
      const w = new Worker(
        new URL('./MeshWorker.ts', import.meta.url),
        { type: 'module' },
      );
      w.onmessage = (e: MessageEvent<MeshWorkerResponse>) => this.onResult(e.data);
      this.workers.push(w);
    }

    console.log(`[ChunkMeshPool] ${workerCount} workers ready`);
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Request meshing for a chunk (non-blocking) */
  requestMesh(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    const data = this.chunkData.get(key);
    if (!data) return;

    const id = this.nextId++;
    this.pending.set(id, { cx, cz });

    // Gather neighbor data (may be undefined if neighbors aren't loaded)
    const neighbors: MeshWorkerRequest['neighbors'] = {
      px: this.chunkData.get(`${cx + 1},${cz}`),
      nx: this.chunkData.get(`${cx - 1},${cz}`),
      pz: this.chunkData.get(`${cx},${cz + 1}`),
      nz: this.chunkData.get(`${cx},${cz - 1}`),
    };

    const msg: MeshWorkerRequest = { id, cx, cz, data, neighbors };

    // Round-robin dispatch
    const worker = this.workers[this.nextWorker % this.workers.length];
    this.nextWorker++;
    worker.postMessage(msg);
  }

  /** How many tasks are currently in-flight */
  get pendingCount(): number { return this.pending.size; }

  /** Clean up all workers */
  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers.length = 0;
  }

  // ── Internal ────────────────────────────────────────────────────

  private onResult(resp: MeshWorkerResponse): void {
    this.pending.delete(resp.id);

    const key = `${resp.cx},${resp.cz}`;

    // Remove old mesh
    const oldMesh = this.chunkMeshes.get(key);
    if (oldMesh) {
      this.scene.remove(oldMesh);
      oldMesh.geometry.dispose();
      this.chunkMeshes.delete(key);
    }

    // No geometry (all-air chunk)
    if (!resp.positions) return;

    // Build BufferGeometry from transferred typed arrays
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(resp.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(resp.normals!, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(resp.uvs!, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(resp.colors!, 3));
    geo.setIndex(new THREE.BufferAttribute(resp.indices!, 1));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(resp.cx * CHUNK_SIZE, 0, resp.cz * CHUNK_SIZE);
    mesh.frustumCulled = true;

    this.scene.add(mesh);
    this.chunkMeshes.set(key, mesh);
  }
}
