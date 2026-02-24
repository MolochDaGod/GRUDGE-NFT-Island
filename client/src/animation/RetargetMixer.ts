// ═══════════════════════════════════════════════════════════════════
// RETARGET MIXER — AnimationMixer wrapper with auto-retargeting
//
// Drop-in enhancement over THREE.AnimationMixer. When a clip is
// added or played, it is automatically retargeted to match the
// model's skeleton type (detected on construction).
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import type { SkeletonType } from '@grudge/shared';
import { inspectSkeleton } from './SkeletonInspector.js';
import { retargetClip } from './AnimationRetargeter.js';

export class RetargetMixer {
  readonly mixer: THREE.AnimationMixer;
  readonly skeletonType: SkeletonType;
  private actions = new Map<string, THREE.AnimationAction>();

  constructor(root: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(root);
    const { type } = inspectSkeleton(root);
    this.skeletonType = type;
  }

  /**
   * Add a clip, auto-retargeting if the clip's skeleton differs
   * from this mixer's model skeleton.
   */
  addClip(clip: THREE.AnimationClip, sourceType?: SkeletonType): THREE.AnimationAction {
    const remapped = retargetClip(clip, this.skeletonType, sourceType);
    const action = this.mixer.clipAction(remapped);
    this.actions.set(clip.name, action);
    return action;
  }

  /**
   * Play a clip by name. If the clip hasn't been added yet,
   * pass it as the second argument to auto-add it.
   */
  play(
    name: string,
    clip?: THREE.AnimationClip,
    opts?: { fadeIn?: number; loop?: THREE.AnimationActionLoopStyles; clampWhenFinished?: boolean },
  ): THREE.AnimationAction | null {
    let action = this.actions.get(name);
    if (!action && clip) {
      action = this.addClip(clip);
    }
    if (!action) return null;

    if (opts?.loop !== undefined) action.setLoop(opts.loop, Infinity);
    if (opts?.clampWhenFinished) action.clampWhenFinished = true;

    action.reset().fadeIn(opts?.fadeIn ?? 0.2).play();
    return action;
  }

  /** Cross-fade from the currently playing action to a new one */
  crossFade(
    fromName: string,
    toName: string,
    duration: number = 0.3,
    toClip?: THREE.AnimationClip,
  ): THREE.AnimationAction | null {
    const from = this.actions.get(fromName);
    const to = this.actions.get(toName) ?? (toClip ? this.addClip(toClip) : null);
    if (!to) return null;

    if (from) {
      from.fadeOut(duration);
    }
    to.reset().fadeIn(duration).play();
    return to;
  }

  /** Stop all actions and reset */
  stopAll(): void {
    this.mixer.stopAllAction();
  }

  /** Update the mixer — call once per frame with delta time */
  update(dt: number): void {
    this.mixer.update(dt);
  }

  /** Get an existing action by clip name */
  getAction(name: string): THREE.AnimationAction | undefined {
    return this.actions.get(name);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.actions.clear();
  }
}
