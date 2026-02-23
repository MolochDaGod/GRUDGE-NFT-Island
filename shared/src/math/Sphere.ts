// ═══════════════════════════════════════════════════════════════════
// SPHERE — Collision Primitive
//
// Used for projectiles, AoE effects, hitboxes, and hurtboxes.
// Provides sphere-sphere overlap, sphere-AABB overlap, and
// elastic collision response (from Three.js games_fps example).
// ═══════════════════════════════════════════════════════════════════

import { AABB } from './AABB.js';

export interface ElasticResult {
  v1x: number; v1y: number; v1z: number;
  v2x: number; v2y: number; v2z: number;
}

export class Sphere {
  constructor(
    public cx: number, public cy: number, public cz: number,
    public radius: number,
  ) {}

  // ── Factories ─────────────────────────────────────────────────

  static create(x: number, y: number, z: number, r: number): Sphere {
    return new Sphere(x, y, z, r);
  }

  clone(): Sphere {
    return new Sphere(this.cx, this.cy, this.cz, this.radius);
  }

  // ── Overlap Tests ─────────────────────────────────────────────

  /** Test if this sphere overlaps another sphere */
  overlaps(other: Sphere): boolean {
    const dx = this.cx - other.cx;
    const dy = this.cy - other.cy;
    const dz = this.cz - other.cz;
    const r = this.radius + other.radius;
    return dx * dx + dy * dy + dz * dz < r * r;
  }

  /** Squared distance between centers */
  distanceSq(other: Sphere): number {
    const dx = this.cx - other.cx;
    const dy = this.cy - other.cy;
    const dz = this.cz - other.cz;
    return dx * dx + dy * dy + dz * dz;
  }

  /** Distance between centers */
  distanceTo(other: Sphere): number {
    return Math.sqrt(this.distanceSq(other));
  }

  /** Test if this sphere overlaps an AABB using closest-point method */
  overlapAABB(box: AABB): boolean {
    // Find the closest point on the AABB to the sphere center
    const cx = Math.max(box.minX, Math.min(this.cx, box.maxX));
    const cy = Math.max(box.minY, Math.min(this.cy, box.maxY));
    const cz = Math.max(box.minZ, Math.min(this.cz, box.maxZ));

    const dx = this.cx - cx;
    const dy = this.cy - cy;
    const dz = this.cz - cz;

    return dx * dx + dy * dy + dz * dz < this.radius * this.radius;
  }

  /** Test if a point is inside this sphere */
  containsPoint(x: number, y: number, z: number): boolean {
    const dx = this.cx - x;
    const dy = this.cy - y;
    const dz = this.cz - z;
    return dx * dx + dy * dy + dz * dz <= this.radius * this.radius;
  }

  // ── Movement ──────────────────────────────────────────────────

  /** Move the sphere center by a scaled velocity */
  addScaledVector(vx: number, vy: number, vz: number, scale: number): this {
    this.cx += vx * scale;
    this.cy += vy * scale;
    this.cz += vz * scale;
    return this;
  }

  /** Set position directly */
  setPosition(x: number, y: number, z: number): this {
    this.cx = x; this.cy = y; this.cz = z;
    return this;
  }

  // ── Elastic Collision Response ────────────────────────────────
  // Directly from Three.js games_fps `spheresCollisions()` pattern.
  // Given two overlapping spheres with velocities, compute the
  // post-collision velocities using conservation of momentum
  // (equal mass assumption).

  /**
   * Compute elastic collision response between two spheres.
   * Also separates them by pushing each out by half the overlap.
   *
   * @returns New velocities for both spheres
   */
  static elasticResponse(
    a: Sphere, v1x: number, v1y: number, v1z: number,
    b: Sphere, v2x: number, v2y: number, v2z: number,
  ): ElasticResult {
    const dx = a.cx - b.cx;
    const dy = a.cy - b.cy;
    const dz = a.cz - b.cz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 1e-8) {
      // Degenerate case — push apart arbitrarily
      return { v1x, v1y, v1z, v2x, v2y, v2z };
    }

    // Normal from b to a
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    // Project velocities onto normal
    const v1n = v1x * nx + v1y * ny + v1z * nz;
    const v2n = v2x * nx + v2y * ny + v2z * nz;

    // Swap normal components (elastic, equal mass)
    const out1x = v1x - v1n * nx + v2n * nx;
    const out1y = v1y - v1n * ny + v2n * ny;
    const out1z = v1z - v1n * nz + v2n * nz;

    const out2x = v2x - v2n * nx + v1n * nx;
    const out2y = v2y - v2n * ny + v1n * ny;
    const out2z = v2z - v2n * nz + v1n * nz;

    // Separate overlapping spheres
    const overlap = (a.radius + b.radius - dist) / 2;
    if (overlap > 0) {
      a.cx += nx * overlap;
      a.cy += ny * overlap;
      a.cz += nz * overlap;
      b.cx -= nx * overlap;
      b.cy -= ny * overlap;
      b.cz -= nz * overlap;
    }

    return {
      v1x: out1x, v1y: out1y, v1z: out1z,
      v2x: out2x, v2y: out2y, v2z: out2z,
    };
  }
}
