// ═══════════════════════════════════════════════════════════════════
// RAY — DDA Voxel Ray Traversal
//
// Casts a ray through the voxel grid using the Digital Differential
// Analyzer algorithm. Returns the first non-air block hit, along
// with the block position, face normal, and distance.
//
// Used by: BlockInteraction (mining/placement), TargetSystem,
// projectile collision, line-of-sight checks.
// ═══════════════════════════════════════════════════════════════════

/** Callback that returns the block ID at a world position (0 = air) */
export type GetBlockFn = (bx: number, by: number, bz: number) => number;

export interface VoxelRayResult {
  /** Whether the ray hit a non-air block */
  hit: boolean;
  /** Block coordinates of the hit block */
  blockX: number; blockY: number; blockZ: number;
  /** Normal of the face that was hit (+/-1 on one axis, 0 on others) */
  normalX: number; normalY: number; normalZ: number;
  /** Distance from ray origin to the hit point */
  distance: number;
  /** The block ID that was hit */
  blockId: number;
}

/**
 * Cast a ray through the voxel grid using DDA.
 *
 * @param ox, oy, oz    Ray origin (world space)
 * @param dx, dy, dz    Ray direction (does NOT need to be normalized)
 * @param maxDist       Maximum distance to search
 * @param getBlock      Callback returning block ID at integer coords
 * @param ignoreLiquid  If true, rays pass through water/lava (default true)
 */
export function castVoxelRay(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
  getBlock: GetBlockFn,
  ignoreLiquid = true,
): VoxelRayResult {
  const noHit: VoxelRayResult = {
    hit: false, blockX: 0, blockY: 0, blockZ: 0,
    normalX: 0, normalY: 0, normalZ: 0, distance: maxDist, blockId: 0,
  };

  // Normalize direction
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-10) return noHit;
  dx /= len; dy /= len; dz /= len;

  // Current voxel
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  // Step direction
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  // Distance along ray to next voxel boundary on each axis
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

  // Initial t to first boundary
  let tMaxX = stepX > 0 ? (x + 1 - ox) * tDeltaX : stepX < 0 ? (ox - x) * tDeltaX : Infinity;
  let tMaxY = stepY > 0 ? (y + 1 - oy) * tDeltaY : stepY < 0 ? (oy - y) * tDeltaY : Infinity;
  let tMaxZ = stepZ > 0 ? (z + 1 - oz) * tDeltaZ : stepZ < 0 ? (oz - z) * tDeltaZ : Infinity;

  let t = 0;
  let nx = 0, ny = 0, nz = 0;

  // Maximum iterations to prevent infinite loops
  const maxSteps = Math.ceil(maxDist) * 3 + 10;

  for (let i = 0; i < maxSteps && t <= maxDist; i++) {
    // Check current voxel
    const blockId = getBlock(x, y, z);
    if (blockId > 0) {
      // Skip liquids (block IDs 5=water, 17=lava) if requested
      if (!ignoreLiquid || (blockId !== 5 && blockId !== 17)) {
        return {
          hit: true,
          blockX: x, blockY: y, blockZ: z,
          normalX: nx, normalY: ny, normalZ: nz,
          distance: t,
          blockId,
        };
      }
    }

    // Advance to next voxel boundary (step along the axis with smallest tMax)
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        t = tMaxX;
        x += stepX;
        tMaxX += tDeltaX;
        nx = -stepX; ny = 0; nz = 0;
      } else {
        t = tMaxZ;
        z += stepZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        t = tMaxY;
        y += stepY;
        tMaxY += tDeltaY;
        nx = 0; ny = -stepY; nz = 0;
      } else {
        t = tMaxZ;
        z += stepZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    }
  }

  return noHit;
}
