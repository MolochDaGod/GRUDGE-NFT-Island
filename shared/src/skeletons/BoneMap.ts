// ═══════════════════════════════════════════════════════════════════
// BONE MAPS — Per-skeleton-type mappings to CanonicalBone
//
// Each map translates CanonicalBone → the actual bone name string
// found in that skeleton rig's hierarchy. Discovered by inspecting
// every asset pack under D:\Grudge\1\extracted\.
// ═══════════════════════════════════════════════════════════════════

import { CanonicalBone, type BoneMapping, type SkeletonType } from './CanonicalBones.js';

// ── Mixamo (orc__warrior, elf_guardian, racalvin GLTFs + 300 anim clips) ──
export const MIXAMO_MAP: BoneMapping = {
  [CanonicalBone.Hips]:          'mixamorig:Hips',
  [CanonicalBone.Spine]:         'mixamorig:Spine',
  [CanonicalBone.Spine1]:        'mixamorig:Spine1',
  [CanonicalBone.Spine2]:        'mixamorig:Spine2',
  [CanonicalBone.Neck]:          'mixamorig:Neck',
  [CanonicalBone.Head]:          'mixamorig:Head',
  [CanonicalBone.LeftShoulder]:  'mixamorig:LeftShoulder',
  [CanonicalBone.LeftUpperArm]:  'mixamorig:LeftArm',
  [CanonicalBone.LeftLowerArm]:  'mixamorig:LeftForeArm',
  [CanonicalBone.LeftHand]:      'mixamorig:LeftHand',
  [CanonicalBone.RightShoulder]: 'mixamorig:RightShoulder',
  [CanonicalBone.RightUpperArm]: 'mixamorig:RightArm',
  [CanonicalBone.RightLowerArm]: 'mixamorig:RightForeArm',
  [CanonicalBone.RightHand]:     'mixamorig:RightHand',
  [CanonicalBone.LeftUpperLeg]:  'mixamorig:LeftUpLeg',
  [CanonicalBone.LeftLowerLeg]:  'mixamorig:LeftLeg',
  [CanonicalBone.LeftFoot]:      'mixamorig:LeftFoot',
  [CanonicalBone.LeftToes]:      'mixamorig:LeftToeBase',
  [CanonicalBone.RightUpperLeg]: 'mixamorig:RightUpLeg',
  [CanonicalBone.RightLowerLeg]: 'mixamorig:RightLeg',
  [CanonicalBone.RightFoot]:     'mixamorig:RightFoot',
  [CanonicalBone.RightToes]:     'mixamorig:RightToeBase',
  [CanonicalBone.LeftThumb1]:    'mixamorig:LeftHandThumb1',
  [CanonicalBone.LeftIndex1]:    'mixamorig:LeftHandIndex1',
  [CanonicalBone.RightThumb1]:   'mixamorig:RightHandThumb1',
  [CanonicalBone.RightIndex1]:   'mixamorig:RightHandIndex1',
};

// ── Toon-RTS / Bip001 (existing 6-race toon models) ──
export const TOON_RTS_MAP: BoneMapping = {
  [CanonicalBone.Hips]:          'Bip001 Pelvis',
  [CanonicalBone.Spine]:         'Bip001 Spine',
  [CanonicalBone.Spine1]:        'Bip001 Spine1',
  [CanonicalBone.Spine2]:        'Bip001 Spine2',
  [CanonicalBone.Neck]:          'Bip001 Neck',
  [CanonicalBone.Head]:          'Bip001 Head',
  [CanonicalBone.LeftShoulder]:  'Bip001 L Clavicle',
  [CanonicalBone.LeftUpperArm]:  'Bip001 L UpperArm',
  [CanonicalBone.LeftLowerArm]:  'Bip001 L Forearm',
  [CanonicalBone.LeftHand]:      'Bip001 L Hand',
  [CanonicalBone.RightShoulder]: 'Bip001 R Clavicle',
  [CanonicalBone.RightUpperArm]: 'Bip001 R UpperArm',
  [CanonicalBone.RightLowerArm]: 'Bip001 R Forearm',
  [CanonicalBone.RightHand]:     'Bip001 R Hand',
  [CanonicalBone.LeftUpperLeg]:  'Bip001 L Thigh',
  [CanonicalBone.LeftLowerLeg]:  'Bip001 L Calf',
  [CanonicalBone.LeftFoot]:      'Bip001 L Foot',
  [CanonicalBone.LeftToes]:      'Bip001 L Toe0',
  [CanonicalBone.RightUpperLeg]: 'Bip001 R Thigh',
  [CanonicalBone.RightLowerLeg]: 'Bip001 R Calf',
  [CanonicalBone.RightFoot]:     'Bip001 R Foot',
  [CanonicalBone.RightToes]:     'Bip001 R Toe0',
  [CanonicalBone.LeftThumb1]:    'Bip001 L Finger0',
  [CanonicalBone.LeftIndex1]:    'Bip001 L Finger1',
  [CanonicalBone.RightThumb1]:   'Bip001 R Finger0',
  [CanonicalBone.RightIndex1]:   'Bip001 R Finger1',
};

// ── Polygonr (elf/human FBX packs — Unreal-style naming) ──
export const POLYGONR_MAP: BoneMapping = {
  [CanonicalBone.Hips]:          'Pelvis',
  [CanonicalBone.Spine]:         'Spine_01',
  [CanonicalBone.Spine1]:        'Spine_02',
  [CanonicalBone.Spine2]:        'Spine_03',
  [CanonicalBone.Neck]:          'Neck_01',
  [CanonicalBone.Head]:          'Head',
  [CanonicalBone.LeftShoulder]:  'Clavicle_L',
  [CanonicalBone.LeftUpperArm]:  'Upperarm_L',
  [CanonicalBone.LeftLowerArm]:  'Lowerarm_L',
  [CanonicalBone.LeftHand]:      'Hand_L',
  [CanonicalBone.RightShoulder]: 'Clavicle_R',
  [CanonicalBone.RightUpperArm]: 'Upperarm_R',
  [CanonicalBone.RightLowerArm]: 'Lowerarm_R',
  [CanonicalBone.RightHand]:     'Hand_R',
  [CanonicalBone.LeftUpperLeg]:  'Thigh_L',
  [CanonicalBone.LeftLowerLeg]:  'Calf_L',
  [CanonicalBone.LeftFoot]:      'Foot_L',
  [CanonicalBone.LeftToes]:      'Toe_L',
  [CanonicalBone.RightUpperLeg]: 'Thigh_R',
  [CanonicalBone.RightLowerLeg]: 'Calf_R',
  [CanonicalBone.RightFoot]:     'Foot_R',
  [CanonicalBone.RightToes]:     'Toe_R',
  [CanonicalBone.LeftThumb1]:    'Thumb_01_L',
  [CanonicalBone.LeftIndex1]:    'Index_01_L',
  [CanonicalBone.RightThumb1]:   'Thumb_01_R',
  [CanonicalBone.RightIndex1]:   'Index_01_R',
};

// ── Orc-custom (orc_grunt GLTF — Blender-style naming, 60 joints) ──
export const ORC_CUSTOM_MAP: BoneMapping = {
  [CanonicalBone.Hips]:          'Bone',
  [CanonicalBone.Spine]:         'Spine',
  [CanonicalBone.Spine1]:        'Spine.001',
  [CanonicalBone.Spine2]:        'Spine.002',
  [CanonicalBone.Neck]:          'Neck',
  [CanonicalBone.Head]:          'Head',
  [CanonicalBone.LeftShoulder]:  'Shoulder.L',
  [CanonicalBone.LeftUpperArm]:  'Upper_Arm.L',
  [CanonicalBone.LeftLowerArm]:  'Lower_Arm.L',
  [CanonicalBone.LeftHand]:      'Hand.L',
  [CanonicalBone.RightShoulder]: 'Shoulder.R',
  [CanonicalBone.RightUpperArm]: 'Upper_Arm.R',
  [CanonicalBone.RightLowerArm]: 'Lower_Arm.R',
  [CanonicalBone.RightHand]:     'Hand.R',
  [CanonicalBone.LeftUpperLeg]:  'Thigh.L',
  [CanonicalBone.LeftLowerLeg]:  'Shin.L',
  [CanonicalBone.LeftFoot]:      'Foot.L',
  [CanonicalBone.LeftToes]:      'Toe.L',
  [CanonicalBone.RightUpperLeg]: 'Thigh.R',
  [CanonicalBone.RightLowerLeg]: 'Shin.R',
  [CanonicalBone.RightFoot]:     'Foot.R',
  [CanonicalBone.RightToes]:     'Toe.R',
  [CanonicalBone.LeftThumb1]:    'Thumb1.L',
  [CanonicalBone.LeftIndex1]:    'Index1.L',
  [CanonicalBone.RightThumb1]:   'Thumb1.R',
  [CanonicalBone.RightIndex1]:   'Index1.R',
};

/** Look up the bone map for a known skeleton type */
export const BONE_MAPS: Record<Exclude<SkeletonType, 'unknown'>, BoneMapping> = {
  'mixamo':     MIXAMO_MAP,
  'toon-rts':   TOON_RTS_MAP,
  'polygonr':   POLYGONR_MAP,
  'orc-custom': ORC_CUSTOM_MAP,
};

/**
 * Fingerprint strings used to auto-detect skeleton type from bone names.
 * Order matters — first match wins.
 */
export const SKELETON_FINGERPRINTS: { type: SkeletonType; marker: string }[] = [
  { type: 'mixamo',     marker: 'mixamorig:' },
  { type: 'toon-rts',   marker: 'Bip001' },
  { type: 'polygonr',   marker: 'Spine_01' },
  { type: 'orc-custom', marker: 'KneeIK' },
];
