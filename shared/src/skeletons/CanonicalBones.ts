// ═══════════════════════════════════════════════════════════════════
// CANONICAL BONES — Universal humanoid skeleton definition
//
// Every skeleton type (mixamo, toon-rts, polygonr, etc.) maps its
// bone names to these canonical slots. This enables cross-skeleton
// animation retargeting — a mixamo clip can drive a polygonr model
// by remapping bone tracks through the canonical layer.
//
// 25 core slots cover bipedal humanoids. Finger bones beyond thumb/
// index root are handled by suffix convention (e.g., LeftThumb2).
// ═══════════════════════════════════════════════════════════════════

/** Standard humanoid bone slots */
export const enum CanonicalBone {
  // ── Torso ──
  Hips          = 'Hips',
  Spine         = 'Spine',
  Spine1        = 'Spine1',
  Spine2        = 'Spine2',

  // ── Head ──
  Neck          = 'Neck',
  Head          = 'Head',

  // ── Left arm ──
  LeftShoulder  = 'LeftShoulder',
  LeftUpperArm  = 'LeftUpperArm',
  LeftLowerArm  = 'LeftLowerArm',
  LeftHand      = 'LeftHand',

  // ── Right arm ──
  RightShoulder = 'RightShoulder',
  RightUpperArm = 'RightUpperArm',
  RightLowerArm = 'RightLowerArm',
  RightHand     = 'RightHand',

  // ── Left leg ──
  LeftUpperLeg  = 'LeftUpperLeg',
  LeftLowerLeg  = 'LeftLowerLeg',
  LeftFoot      = 'LeftFoot',
  LeftToes      = 'LeftToes',

  // ── Right leg ──
  RightUpperLeg = 'RightUpperLeg',
  RightLowerLeg = 'RightLowerLeg',
  RightFoot     = 'RightFoot',
  RightToes     = 'RightToes',

  // ── Fingers (roots only — children use suffix) ──
  LeftThumb1    = 'LeftThumb1',
  LeftIndex1    = 'LeftIndex1',
  RightThumb1   = 'RightThumb1',
  RightIndex1   = 'RightIndex1',
}

/** All canonical bone values as a runtime array */
export const ALL_CANONICAL_BONES: CanonicalBone[] = [
  CanonicalBone.Hips,
  CanonicalBone.Spine,
  CanonicalBone.Spine1,
  CanonicalBone.Spine2,
  CanonicalBone.Neck,
  CanonicalBone.Head,
  CanonicalBone.LeftShoulder,
  CanonicalBone.LeftUpperArm,
  CanonicalBone.LeftLowerArm,
  CanonicalBone.LeftHand,
  CanonicalBone.RightShoulder,
  CanonicalBone.RightUpperArm,
  CanonicalBone.RightLowerArm,
  CanonicalBone.RightHand,
  CanonicalBone.LeftUpperLeg,
  CanonicalBone.LeftLowerLeg,
  CanonicalBone.LeftFoot,
  CanonicalBone.LeftToes,
  CanonicalBone.RightUpperLeg,
  CanonicalBone.RightLowerLeg,
  CanonicalBone.RightFoot,
  CanonicalBone.RightToes,
  CanonicalBone.LeftThumb1,
  CanonicalBone.LeftIndex1,
  CanonicalBone.RightThumb1,
  CanonicalBone.RightIndex1,
];

/** Known skeleton rig types across all game assets */
export type SkeletonType = 'mixamo' | 'toon-rts' | 'polygonr' | 'orc-custom' | 'unknown';

/** Mapping from canonical bone → actual bone name in a specific rig */
export type BoneMapping = Partial<Record<CanonicalBone, string>>;
