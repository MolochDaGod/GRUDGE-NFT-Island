// ═══════════════════════════════════════════════════════════════════
// PROJECTILE SYSTEM
//
// Pool-based projectile physics directly from the Three.js games_fps
// example pattern. Manages sphere colliders with gravity, voxel
// collision (via DDA ray), sphere-sphere elastic response, and
// player-sphere interaction.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { Sphere, castVoxelRay } from '@grudge/shared';
import type { GetBlockFn } from '@grudge/shared';

// ── Config ──────────────────────────────────────────────────────

const MAX_PROJECTILES  = 100;
const PROJECTILE_RADIUS = 0.2;
const GRAVITY           = 30;   // Match games_fps
const DAMPING_FACTOR    = 1.5;  // Exponential drag coefficient

// ── Projectile Data ─────────────────────────────────────────────

interface Projectile {
  mesh: THREE.Mesh;
  collider: Sphere;
  vx: number; vy: number; vz: number;
  alive: boolean;
  /** Time-to-live in seconds (auto-despawn) */
  ttl: number;
  /** Damage this projectile deals on hit */
  damage: number;
  /** Owner entity ID (prevents self-hit) */
  ownerId: string;
}

// ── Hit Callback ────────────────────────────────────────────────

export interface ProjectileHit {
  projectileIndex: number;
  entityId?: string;
  hitPosition: THREE.Vector3;
  damage: number;
}

export type ProjectileHitCallback = (hit: ProjectileHit) => void;

// ── System ──────────────────────────────────────────────────────

export class ProjectileSystem {
  private pool: Projectile[] = [];
  private nextIdx = 0;
  private scene: THREE.Scene;
  private getBlock: GetBlockFn;
  private onHit: ProjectileHitCallback | null = null;

  // Shared geometry + material for all projectiles
  private readonly geo: THREE.IcosahedronGeometry;
  private readonly mat: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, getBlock: GetBlockFn) {
    this.scene = scene;
    this.getBlock = getBlock;

    this.geo = new THREE.IcosahedronGeometry(PROJECTILE_RADIUS, 2);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xdede8d });

    // Pre-allocate pool
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      scene.add(mesh);

      this.pool.push({
        mesh,
        collider: new Sphere(0, -100, 0, PROJECTILE_RADIUS),
        vx: 0, vy: 0, vz: 0,
        alive: false,
        ttl: 0,
        damage: 0,
        ownerId: '',
      });
    }
  }

  /** Register a callback for when a projectile hits something */
  setHitCallback(cb: ProjectileHitCallback): void {
    this.onHit = cb;
  }

  // ── Spawn ─────────────────────────────────────────────────────

  /**
   * Launch a projectile from a position in a direction.
   * @param ox, oy, oz   Origin position
   * @param dx, dy, dz   Direction (will be normalized then scaled by speed)
   * @param speed         Launch speed (blocks/sec)
   * @param damage        Damage on hit
   * @param ownerId       Entity ID of the shooter
   * @param ttl           Time to live (seconds, default 5)
   */
  spawn(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    speed: number,
    damage: number,
    ownerId: string,
    ttl = 5,
  ): void {
    const p = this.pool[this.nextIdx];
    this.nextIdx = (this.nextIdx + 1) % MAX_PROJECTILES;

    // Normalize direction
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return;
    const nx = dx / len, ny = dy / len, nz = dz / len;

    p.collider.setPosition(ox, oy, oz);
    p.vx = nx * speed;
    p.vy = ny * speed;
    p.vz = nz * speed;
    p.alive = true;
    p.ttl = ttl;
    p.damage = damage;
    p.ownerId = ownerId;
    p.mesh.visible = true;
    p.mesh.position.set(ox, oy, oz);
  }

  // ── Update (call each frame) ──────────────────────────────────

  update(dt: number): void {
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;

      // TTL
      p.ttl -= dt;
      if (p.ttl <= 0) {
        this._kill(p);
        continue;
      }

      // Move
      p.collider.cx += p.vx * dt;
      p.collider.cy += p.vy * dt;
      p.collider.cz += p.vz * dt;

      // Gravity
      p.vy -= GRAVITY * dt;

      // Voxel collision (DDA ray from previous to current position)
      const blockId = this.getBlock(
        Math.floor(p.collider.cx),
        Math.floor(p.collider.cy),
        Math.floor(p.collider.cz),
      );
      if (blockId > 0 && blockId !== 5 && blockId !== 17) {
        // Hit solid terrain
        this._emitHit(i, p, undefined);
        this._kill(p);
        continue;
      }

      // Exponential damping (air resistance)
      const damping = Math.exp(-DAMPING_FACTOR * dt) - 1;
      p.vx += p.vx * damping;
      p.vz += p.vz * damping;

      // Sync mesh
      p.mesh.position.set(p.collider.cx, p.collider.cy, p.collider.cz);
    }

    // Sphere-sphere collision between projectiles
    this._resolveProjectileCollisions();
  }

  // ── Entity Collision (call from game loop with entity positions) ──

  /**
   * Check all alive projectiles against an entity sphere.
   * @returns Array of projectile indices that hit
   */
  checkEntityHit(
    entityId: string,
    ex: number, ey: number, ez: number,
    entityRadius: number,
  ): number[] {
    const hits: number[] = [];
    const target = new Sphere(ex, ey, ez, entityRadius);

    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const p = this.pool[i];
      if (!p.alive || p.ownerId === entityId) continue;

      if (p.collider.overlaps(target)) {
        hits.push(i);
        this._emitHit(i, p, entityId);
        this._kill(p);
      }
    }

    return hits;
  }

  // ── Internals ─────────────────────────────────────────────────

  private _kill(p: Projectile): void {
    p.alive = false;
    p.mesh.visible = false;
    p.collider.setPosition(0, -100, 0);
  }

  private _emitHit(index: number, p: Projectile, entityId?: string): void {
    if (this.onHit) {
      this.onHit({
        projectileIndex: index,
        entityId,
        hitPosition: new THREE.Vector3(p.collider.cx, p.collider.cy, p.collider.cz),
        damage: p.damage,
      });
    }
  }

  /** Elastic sphere-sphere collision between alive projectiles */
  private _resolveProjectileCollisions(): void {
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const a = this.pool[i];
      if (!a.alive) continue;

      for (let j = i + 1; j < MAX_PROJECTILES; j++) {
        const b = this.pool[j];
        if (!b.alive) continue;

        if (a.collider.overlaps(b.collider)) {
          const result = Sphere.elasticResponse(
            a.collider, a.vx, a.vy, a.vz,
            b.collider, b.vx, b.vy, b.vz,
          );
          a.vx = result.v1x; a.vy = result.v1y; a.vz = result.v1z;
          b.vx = result.v2x; b.vy = result.v2y; b.vz = result.v2z;
        }
      }
    }
  }

  // ── Query ─────────────────────────────────────────────────────

  get aliveCount(): number {
    let count = 0;
    for (const p of this.pool) if (p.alive) count++;
    return count;
  }

  getDebugInfo(): string {
    return `Projectiles: ${this.aliveCount}/${MAX_PROJECTILES}`;
  }
}
