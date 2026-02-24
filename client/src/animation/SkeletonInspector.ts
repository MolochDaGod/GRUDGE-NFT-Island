// ═══════════════════════════════════════════════════════════════════
// SKELETON INSPECTOR — Runtime skeleton analysis for loaded models
//
// Walks a THREE.Object3D scene graph, collects every Bone name,
// and feeds them into the shared SkeletonRegistry to auto-detect
// the skeleton type. Used by the asset loader and retarget mixer
// to decide whether animation remapping is needed.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import {
  type SkeletonType,
  detectSkeletonType,
  getMapping,
  getReverseMapping,
} from '@grudge/shared';

export interface InspectionResult {
  /** Detected skeleton rig type */
  type: SkeletonType;
  /** All bone names found in the hierarchy */
  boneNames: string[];
  /** The first THREE.Skeleton found (if any) */
  skeleton: THREE.Skeleton | null;
}

/**
 * Inspect a loaded model to determine its skeleton type.
 *
 * Walks the full scene graph looking for Bone objects and
 * SkinnedMesh instances. Works with GLB, FBX, or any format
 * that Three.js loads into an Object3D tree.
 */
export function inspectSkeleton(root: THREE.Object3D): InspectionResult {
  const boneNames: string[] = [];
  let skeleton: THREE.Skeleton | null = null;

  root.traverse((node) => {
    if ((node as THREE.Bone).isBone) {
      boneNames.push(node.name);
    }
    if (!skeleton && (node as THREE.SkinnedMesh).isSkinnedMesh) {
      skeleton = (node as THREE.SkinnedMesh).skeleton;
    }
  });

  const type = detectSkeletonType(boneNames);
  return { type, boneNames, skeleton };
}

/**
 * Extract bone names from an AnimationClip's tracks.
 * Useful when you have a clip but not the model (e.g., animation-only FBX).
 *
 * Track names follow the pattern "boneName.property" —
 * we strip the property suffix to get the bone name.
 */
export function boneNamesFromClip(clip: THREE.AnimationClip): string[] {
  const names = new Set<string>();
  for (const track of clip.tracks) {
    // Track name format: "boneName.position" / "boneName.quaternion" / "boneName.scale"
    const dot = track.name.lastIndexOf('.');
    if (dot > 0) {
      names.add(track.name.substring(0, dot));
    }
  }
  return Array.from(names);
}

/**
 * Detect skeleton type directly from an AnimationClip.
 */
export function detectClipSkeletonType(clip: THREE.AnimationClip): SkeletonType {
  return detectSkeletonType(boneNamesFromClip(clip));
}

// Re-export shared helpers for convenience
export { getMapping, getReverseMapping, detectSkeletonType };
