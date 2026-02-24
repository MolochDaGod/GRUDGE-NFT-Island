// ═══════════════════════════════════════════════════════════════════
// SKELETON REGISTRY — Detection + retarget map generation
//
// Usage:
//   const type = detectSkeletonType(boneNames);
//   const map  = buildRetargetMap('mixamo', 'toon-rts');
//   // map['mixamorig:LeftArm'] → 'Bip001 L UpperArm'
// ═══════════════════════════════════════════════════════════════════

import { type CanonicalBone, type BoneMapping, type SkeletonType } from './CanonicalBones.js';
import { BONE_MAPS, SKELETON_FINGERPRINTS } from './BoneMap.js';

// ── Detection ────────────────────────────────────────────────────

/**
 * Detect skeleton type from a list of bone name strings.
 * Checks fingerprint markers against the full set of names.
 */
export function detectSkeletonType(boneNames: string[]): SkeletonType {
  const joined = boneNames.join('|');
  for (const { type, marker } of SKELETON_FINGERPRINTS) {
    if (joined.includes(marker)) return type;
  }
  return 'unknown';
}

// ── Mapping access ───────────────────────────────────────────────

/** Get canonical → actual bone name mapping for a skeleton type */
export function getMapping(type: SkeletonType): BoneMapping | null {
  if (type === 'unknown') return null;
  return BONE_MAPS[type] ?? null;
}

/** Build reverse mapping: actual bone name → canonical bone */
export function getReverseMapping(type: SkeletonType): Map<string, CanonicalBone> | null {
  const fwd = getMapping(type);
  if (!fwd) return null;

  const rev = new Map<string, CanonicalBone>();
  for (const [canon, actual] of Object.entries(fwd)) {
    if (actual) rev.set(actual, canon as CanonicalBone);
  }
  return rev;
}

// ── Retarget map ─────────────────────────────────────────────────

/**
 * Build a direct source-bone → target-bone name mapping.
 *
 * Given two skeleton types, produces a Record where:
 *   key   = bone name string in the SOURCE skeleton
 *   value = bone name string in the TARGET skeleton
 *
 * Bones that exist in the source but have no canonical match in
 * the target are silently skipped.
 *
 * Fast-path: returns null when source === target (no remapping needed).
 */
export function buildRetargetMap(
  sourceType: SkeletonType,
  targetType: SkeletonType,
): Record<string, string> | null {
  if (sourceType === targetType) return null; // fast-path, no remapping
  if (sourceType === 'unknown' || targetType === 'unknown') return null;

  const srcMap = BONE_MAPS[sourceType];
  const tgtMap = BONE_MAPS[targetType];
  if (!srcMap || !tgtMap) return null;

  const retarget: Record<string, string> = {};

  for (const [canon, srcBone] of Object.entries(srcMap)) {
    const tgtBone = tgtMap[canon as CanonicalBone];
    if (srcBone && tgtBone) {
      retarget[srcBone] = tgtBone;
    }
  }

  return Object.keys(retarget).length > 0 ? retarget : null;
}

/**
 * List all registered skeleton types (excluding 'unknown').
 */
export function registeredTypes(): SkeletonType[] {
  return Object.keys(BONE_MAPS) as SkeletonType[];
}
