// ═══════════════════════════════════════════════════════════════════
// ANIMATION RETARGETER — Remap clip bone tracks between rigs
//
// Given a clip authored for skeleton A and a target skeleton B,
// produces a new clip with track names remapped so it drives B's
// bones correctly. Results are cached so repeated calls with the
// same clip + target pair return instantly.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { type SkeletonType, buildRetargetMap } from '@grudge/shared';
import { detectClipSkeletonType } from './SkeletonInspector.js';

/** Cache key: "clipUUID→targetType" */
const retargetCache = new Map<string, THREE.AnimationClip>();

/**
 * Retarget an AnimationClip to a different skeleton type.
 *
 * @param clip       - Source animation clip
 * @param targetType - The skeleton type the clip should drive
 * @param sourceType - (Optional) Override auto-detection of the clip's skeleton type
 * @returns A new clip with remapped track names, or the original clip
 *          if no remapping is needed (same skeleton, or unknown types).
 */
export function retargetClip(
  clip: THREE.AnimationClip,
  targetType: SkeletonType,
  sourceType?: SkeletonType,
): THREE.AnimationClip {
  const src = sourceType ?? detectClipSkeletonType(clip);

  // Fast-path: same skeleton type — no remapping needed
  if (src === targetType) return clip;

  // Check cache
  const cacheKey = `${clip.uuid}→${targetType}`;
  const cached = retargetCache.get(cacheKey);
  if (cached) return cached;

  // Build the bone-name remapping table
  const remap = buildRetargetMap(src, targetType);
  if (!remap) return clip; // can't remap (unknown type, etc.)

  // Clone tracks with remapped names
  const newTracks: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    if (dot <= 0) {
      newTracks.push(track.clone());
      continue;
    }

    const boneName = track.name.substring(0, dot);
    const property = track.name.substring(dot); // includes the dot
    const mappedBone = remap[boneName];

    if (mappedBone) {
      const cloned = track.clone();
      cloned.name = mappedBone + property;
      newTracks.push(cloned);
    }
    // Tracks with no mapping are dropped (bone doesn't exist on target)
  }

  const retargeted = new THREE.AnimationClip(
    clip.name,
    clip.duration,
    newTracks,
    clip.blendMode,
  );

  retargetCache.set(cacheKey, retargeted);
  return retargeted;
}

/**
 * Retarget multiple clips in one call. Returns a Map keyed by clip name.
 */
export function retargetClips(
  clips: THREE.AnimationClip[],
  targetType: SkeletonType,
  sourceType?: SkeletonType,
): Map<string, THREE.AnimationClip> {
  const result = new Map<string, THREE.AnimationClip>();
  for (const clip of clips) {
    result.set(clip.name, retargetClip(clip, targetType, sourceType));
  }
  return result;
}

/** Clear the retarget cache (e.g., on hot-reload or level transition) */
export function clearRetargetCache(): void {
  retargetCache.clear();
}
