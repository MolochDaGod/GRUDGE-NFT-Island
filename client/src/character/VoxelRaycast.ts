// ═══════════════════════════════════════════════════════════════════
// VOXEL RAYCAST — Replaces cannon.js raycasting for ground detection
// Steps downward from the character capsule center to find ground.
// Returns the hit distance and whether a hit occurred.
// ═══════════════════════════════════════════════════════════════════

/** Callback to test if a world-space block is solid */
export type BlockQuery = (wx: number, wy: number, wz: number) => boolean;

export interface VoxelRayResult {
  hasHit: boolean;
  /** Y position of the ground surface (top of the block) */
  hitPointY: number;
  /** Distance from start to hit point */
  hitDistance: number;
}

/**
 * Cast a ray downward from (x, startY, z) for up to `maxDist` blocks.
 * Returns the Y of the first solid block's top surface.
 * Step size of 0.1 gives good precision for voxels.
 */
export function voxelRaycastDown(
  x: number, startY: number, z: number,
  maxDist: number, isSolid: BlockQuery, stepSize = 0.1,
): VoxelRayResult {
  for (let d = 0; d < maxDist; d += stepSize) {
    const testY = startY - d;
    const blockY = Math.floor(testY);

    if (isSolid(x, blockY, z)) {
      // Top of the solid block
      const hitPointY = blockY + 1;
      return { hasHit: true, hitPointY, hitDistance: startY - hitPointY };
    }
  }

  return { hasHit: false, hitPointY: 0, hitDistance: maxDist };
}
