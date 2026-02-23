// ═══════════════════════════════════════════════════════════════════
// AABB — Axis-Aligned Bounding Box
//
// Core spatial primitive for collision detection in the voxel world.
// Provides swept AABB vs. voxel grid resolution (per-axis with step-up),
// overlap tests, point containment, Minkowski expansion, and ray
// intersection via the slab method.
// ═══════════════════════════════════════════════════════════════════

/** Callback to test if a world-space block position is solid */
export type IsSolidFn = (bx: number, by: number, bz: number) => boolean;

export interface SweepResult {
  /** Final position after collision resolution */
  x: number; y: number; z: number;
  /** Remaining velocity after collision */
  vx: number; vy: number; vz: number;
  /** Whether the bottom of the AABB is resting on a solid surface */
  onGround: boolean;
  /** Normal of the last surface hit (0,0,0 if no collision) */
  hitNormalX: number; hitNormalY: number; hitNormalZ: number;
}

export interface RayAABBResult {
  hit: boolean;
  /** Parametric distance along ray to entry point */
  tMin: number;
  /** Normal of the face hit */
  normalX: number; normalY: number; normalZ: number;
}

export class AABB {
  constructor(
    public minX: number, public minY: number, public minZ: number,
    public maxX: number, public maxY: number, public maxZ: number,
  ) {}

  // ── Factories ─────────────────────────────────────────────────

  /** Create an AABB from a center point and full dimensions (width, height, depth) */
  static fromCenterSize(cx: number, cy: number, cz: number, w: number, h: number, d: number): AABB {
    const hw = w / 2, hd = d / 2;
    return new AABB(cx - hw, cy, cz - hd, cx + hw, cy + h, cz + hd);
  }

  /** Create from a position (feet) with player-like dimensions */
  static fromFeet(x: number, y: number, z: number, width: number, height: number): AABB {
    const hw = width / 2;
    return new AABB(x - hw, y, z - hw, x + hw, y + height, z + hw);
  }

  // ── Queries ───────────────────────────────────────────────────

  /** Test overlap with another AABB (strict inequality — touching = no overlap) */
  overlaps(o: AABB): boolean {
    return this.minX < o.maxX && this.maxX > o.minX
        && this.minY < o.maxY && this.maxY > o.minY
        && this.minZ < o.maxZ && this.maxZ > o.minZ;
  }

  /** Test if a point is inside this AABB (inclusive) */
  contains(x: number, y: number, z: number): boolean {
    return x >= this.minX && x <= this.maxX
        && y >= this.minY && y <= this.maxY
        && z >= this.minZ && z <= this.maxZ;
  }

  get width():  number { return this.maxX - this.minX; }
  get height(): number { return this.maxY - this.minY; }
  get depth():  number { return this.maxZ - this.minZ; }
  get centerX(): number { return (this.minX + this.maxX) / 2; }
  get centerY(): number { return (this.minY + this.maxY) / 2; }
  get centerZ(): number { return (this.minZ + this.maxZ) / 2; }

  /** Clone this AABB */
  clone(): AABB {
    return new AABB(this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ);
  }

  /** Translate in place */
  translate(dx: number, dy: number, dz: number): this {
    this.minX += dx; this.maxX += dx;
    this.minY += dy; this.maxY += dy;
    this.minZ += dz; this.maxZ += dz;
    return this;
  }

  // ── Minkowski Expansion ───────────────────────────────────────

  /** Return a new AABB expanded by (dx, dy, dz) in the direction of velocity.
   *  Used to find which voxels a moving AABB could possibly touch. */
  expand(dx: number, dy: number, dz: number): AABB {
    const out = this.clone();
    if (dx > 0) out.maxX += dx; else out.minX += dx;
    if (dy > 0) out.maxY += dy; else out.minY += dy;
    if (dz > 0) out.maxZ += dz; else out.minZ += dz;
    return out;
  }

  // ── Swept AABB vs Voxel Grid ──────────────────────────────────

  /**
   * Resolve an AABB moving by (vx*dt, vy*dt, vz*dt) against the voxel grid.
   * Uses per-axis sweep: Y first (gravity), then X, then Z.
   * Includes step-up logic: if X or Z is blocked at feet but clear at feet+1,
   * auto-step up one block.
   *
   * @param vx, vy, vz  Velocity in blocks/second
   * @param dt           Timestep in seconds
   * @param isSolid      Callback to query block solidity
   * @param stepHeight   Max height the entity can auto-step (default 1.01)
   */
  sweepVoxels(
    vx: number, vy: number, vz: number,
    dt: number,
    isSolid: IsSolidFn,
    stepHeight = 1.01,
  ): SweepResult {
    let dx = vx * dt;
    let dy = vy * dt;
    let dz = vz * dt;

    let onGround = false;
    let hnx = 0, hny = 0, hnz = 0;

    // ── Y axis first (gravity / jump) ───────────────────────────
    if (dy !== 0) {
      const resolved = this._sweepAxis(1, dy, isSolid);
      this.translate(0, resolved, 0);
      if (Math.abs(resolved) < Math.abs(dy) - 1e-6) {
        if (dy < 0) { onGround = true; hny = 1; }
        else { hny = -1; }
        vy = 0;
      }
    }

    // ── X axis ──────────────────────────────────────────────────
    if (dx !== 0) {
      const resolved = this._sweepAxis(0, dx, isSolid);
      if (Math.abs(resolved) < Math.abs(dx) - 1e-6) {
        // Try step-up: move up by stepHeight, try X again, settle down
        const stepped = this._tryStepUp(0, dx, isSolid, stepHeight);
        if (stepped !== null) {
          // Step-up succeeded
          this.translate(stepped.dx, stepped.dy, 0);
        } else {
          // Blocked — wall slide
          this.translate(resolved, 0, 0);
          hnx = dx > 0 ? -1 : 1;
          vx = 0;
        }
      } else {
        this.translate(resolved, 0, 0);
      }
    }

    // ── Z axis ──────────────────────────────────────────────────
    if (dz !== 0) {
      const resolved = this._sweepAxis(2, dz, isSolid);
      if (Math.abs(resolved) < Math.abs(dz) - 1e-6) {
        const stepped = this._tryStepUp(2, dz, isSolid, stepHeight);
        if (stepped !== null) {
          this.translate(0, stepped.dy, stepped.dz);
        } else {
          this.translate(0, 0, resolved);
          hnz = dz > 0 ? -1 : 1;
          vz = 0;
        }
      } else {
        this.translate(0, 0, resolved);
      }
    }

    return {
      x: this.minX + this.width / 2,
      y: this.minY,
      z: this.minZ + this.depth / 2,
      vx, vy, vz,
      onGround,
      hitNormalX: hnx, hitNormalY: hny, hitNormalZ: hnz,
    };
  }

  // ── Per-axis sweep against voxel grid ─────────────────────────

  private _sweepAxis(axis: number, delta: number, isSolid: IsSolidFn): number {
    if (delta === 0) return 0;

    const step = delta > 0 ? 1 : -1;
    const leading = axis === 0
      ? (step > 0 ? this.maxX : this.minX)
      : axis === 1
        ? (step > 0 ? this.maxY : this.minY)
        : (step > 0 ? this.maxZ : this.minZ);

    const target = leading + delta;
    const startBlock = Math.floor(leading + (step > 0 ? 0 : -1e-6));
    const endBlock = Math.floor(target + (step > 0 ? 0 : -1e-6));

    // Iterate through each block plane the leading face crosses
    for (let b = startBlock + step; step > 0 ? b <= endBlock : b >= endBlock; b += step) {
      const edge = step > 0 ? b : b + 1;

      // Check all blocks the AABB cross-section overlaps
      if (this._checkPlane(axis, edge, isSolid)) {
        // Blocked — stop just before this block
        const resolved = edge - leading + (step > 0 ? -1e-4 : 1e-4);
        return resolved;
      }
    }

    return delta; // No collision
  }

  /** Check if any solid block exists at a given plane perpendicular to `axis` */
  private _checkPlane(axis: number, _edge: number, isSolid: IsSolidFn): boolean {
    // Determine the two cross-axes and their block ranges
    const ranges = this._crossRanges(axis);

    for (let a = ranges.aMin; a <= ranges.aMax; a++) {
      for (let b = ranges.bMin; b <= ranges.bMax; b++) {
        const bx = axis === 0 ? Math.floor(_edge + (0)) : axis === 2 ? b : a;
        const by = axis === 1 ? Math.floor(_edge + (0)) : axis === 0 ? b : a;
        const bz = axis === 2 ? Math.floor(_edge + (0)) : axis === 0 ? a : b;

        // For axis 0: edge is X, cross = (Z, Y) → bx=edge, by=b, bz=a
        // For axis 1: edge is Y, cross = (X, Z) → bx=a, by=edge, bz=b
        // For axis 2: edge is Z, cross = (X, Y) → bx=a, by=b, bz=edge
        let qx: number, qy: number, qz: number;
        if (axis === 0) { qx = Math.floor(_edge); qy = b; qz = a; }
        else if (axis === 1) { qx = a; qy = Math.floor(_edge); qz = b; }
        else { qx = a; qy = b; qz = Math.floor(_edge); }

        if (isSolid(qx, qy, qz)) return true;
      }
    }
    return false;
  }

  /** Get block ranges for the two axes perpendicular to `axis` */
  private _crossRanges(axis: number): { aMin: number; aMax: number; bMin: number; bMax: number } {
    if (axis === 0) {
      // X-axis: cross = Z, Y
      return {
        aMin: Math.floor(this.minZ), aMax: Math.floor(this.maxZ - 1e-6),
        bMin: Math.floor(this.minY), bMax: Math.floor(this.maxY - 1e-6),
      };
    } else if (axis === 1) {
      // Y-axis: cross = X, Z
      return {
        aMin: Math.floor(this.minX), aMax: Math.floor(this.maxX - 1e-6),
        bMin: Math.floor(this.minZ), bMax: Math.floor(this.maxZ - 1e-6),
      };
    } else {
      // Z-axis: cross = X, Y
      return {
        aMin: Math.floor(this.minX), aMax: Math.floor(this.maxX - 1e-6),
        bMin: Math.floor(this.minY), bMax: Math.floor(this.maxY - 1e-6),
      };
    }
  }

  // ── Step-Up Logic ─────────────────────────────────────────────

  /** Try stepping up to clear an obstacle on the horizontal axis.
   *  Returns {dx/dz, dy} if successful, null if still blocked. */
  private _tryStepUp(
    axis: 0 | 2, delta: number, isSolid: IsSolidFn, stepHeight: number,
  ): { dx: number; dy: number; dz: number } | null {
    const test = this.clone();

    // 1. Move up by stepHeight
    const upResolved = test._sweepAxis(1, stepHeight, isSolid);
    test.translate(0, upResolved, 0);
    if (upResolved < 0.1) return null; // Can't move up at all

    // 2. Try horizontal movement again
    const hResolved = test._sweepAxis(axis, delta, isSolid);
    if (Math.abs(hResolved) < Math.abs(delta) * 0.5) return null; // Still mostly blocked
    test.translate(
      axis === 0 ? hResolved : 0,
      0,
      axis === 2 ? hResolved : 0,
    );

    // 3. Settle back down
    const downResolved = test._sweepAxis(1, -stepHeight - 0.01, isSolid);
    test.translate(0, downResolved, 0);

    // Return the net displacement
    return {
      dx: axis === 0 ? (test.minX - this.minX) : 0,
      dy: test.minY - this.minY,
      dz: axis === 2 ? (test.minZ - this.minZ) : 0,
    };
  }

  // ── Ray Intersection (Slab Method) ────────────────────────────

  /**
   * Test a ray against this AABB using the slab method.
   * @param ox, oy, oz  Ray origin
   * @param dx, dy, dz  Ray direction (does not need to be normalized)
   */
  intersectsRay(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
  ): RayAABBResult {
    let tMin = -Infinity, tMax = Infinity;
    let nx = 0, ny = 0, nz = 0;

    // X slab
    if (Math.abs(dx) > 1e-10) {
      let t1 = (this.minX - ox) / dx;
      let t2 = (this.maxX - ox) / dx;
      let n = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = 1; }
      if (t1 > tMin) { tMin = t1; nx = n * Math.sign(dx) * -1; ny = 0; nz = 0; }
      if (t2 < tMax) tMax = t2;
    } else if (ox < this.minX || ox > this.maxX) {
      return { hit: false, tMin: Infinity, normalX: 0, normalY: 0, normalZ: 0 };
    }

    // Y slab
    if (Math.abs(dy) > 1e-10) {
      let t1 = (this.minY - oy) / dy;
      let t2 = (this.maxY - oy) / dy;
      let n = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = 1; }
      if (t1 > tMin) { tMin = t1; nx = 0; ny = n * Math.sign(dy) * -1; nz = 0; }
      if (t2 < tMax) tMax = t2;
    } else if (oy < this.minY || oy > this.maxY) {
      return { hit: false, tMin: Infinity, normalX: 0, normalY: 0, normalZ: 0 };
    }

    // Z slab
    if (Math.abs(dz) > 1e-10) {
      let t1 = (this.minZ - oz) / dz;
      let t2 = (this.maxZ - oz) / dz;
      let n = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = 1; }
      if (t1 > tMin) { tMin = t1; nx = 0; ny = 0; nz = n * Math.sign(dz) * -1; }
      if (t2 < tMax) tMax = t2;
    } else if (oz < this.minZ || oz > this.maxZ) {
      return { hit: false, tMin: Infinity, normalX: 0, normalY: 0, normalZ: 0 };
    }

    if (tMin > tMax || tMax < 0) {
      return { hit: false, tMin: Infinity, normalX: 0, normalY: 0, normalZ: 0 };
    }

    return { hit: true, tMin: Math.max(tMin, 0), normalX: nx, normalY: ny, normalZ: nz };
  }
}
