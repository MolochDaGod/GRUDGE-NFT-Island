// ═══════════════════════════════════════════════════════════════════
// CHARACTER STATE BASE — Shared logic for all states
// Ported from Sketchbook CharacterStateBase — MIT License
// ═══════════════════════════════════════════════════════════════════

import type { ICharacterState } from '../ICharacterState.js';
import type { SketchCharacter } from '../SketchCharacter.js';
import { getSignedAngleBetweenVectors } from '../spring/SpringMath.js';

// Forward-declare state types (resolved via lazy imports in methods)
import type { Falling } from './Falling.js';
import type { DropIdle } from './DropIdle.js';
import type { DropRunning } from './DropRunning.js';
import type { DropRolling } from './DropRolling.js';
import type { Sprint } from './Sprint.js';
import type { Walk } from './Walk.js';
import type { StartWalkForward } from './StartWalkForward.js';
import type { StartWalkLeft } from './StartWalkLeft.js';
import type { StartWalkRight } from './StartWalkRight.js';
import type { StartWalkBackLeft } from './StartWalkBackLeft.js';
import type { StartWalkBackRight } from './StartWalkBackRight.js';

export abstract class CharacterStateBase implements ICharacterState {
  character: SketchCharacter;
  timer = 0;
  animationLength: number | undefined;

  constructor(character: SketchCharacter) {
    this.character = character;

    // Reset simulator params to defaults (states can override)
    character.velocitySimulator.damping = character.defaultVelocitySimulatorDamping;
    character.velocitySimulator.mass = character.defaultVelocitySimulatorMass;
    character.rotationSimulator.damping = character.defaultRotationSimulatorDamping;
    character.rotationSimulator.mass = character.defaultRotationSimulatorMass;

    character.arcadeVelocityIsAdditive = false;
    character.setArcadeVelocityInfluence(1, 0, 1);
  }

  update(timeStep: number): void {
    this.timer += timeStep;
  }

  onInputChange(): void {
    // Base: no-op. Override in subclasses.
  }

  // ── Helpers ─────────────────────────────────────────────────

  noDirection(): boolean {
    const a = this.character.actions;
    return !a.up.isPressed && !a.down.isPressed && !a.left.isPressed && !a.right.isPressed;
  }

  anyDirection(): boolean {
    const a = this.character.actions;
    return a.up.isPressed || a.down.isPressed || a.left.isPressed || a.right.isPressed;
  }

  /** Transition to Falling if not on ground */
  fallInAir(): void {
    if (!this.character.rayHasHit) {
      // Lazy import to avoid circular dependency
      const { Falling: F } = require('./Falling.js');
      this.character.setState(new F(this.character));
    }
  }

  /** Check if the one-shot animation has finished */
  animationEnded(timeStep: number): boolean {
    if (this.animationLength === undefined) return true;
    return this.timer > this.animationLength - timeStep;
  }

  /** Choose appropriate landing state based on impact velocity */
  setAppropriateDropState(): void {
    const impactY = this.character.groundImpactData.velocity.y;

    if (impactY < -6) {
      const { DropRolling: DR } = require('./DropRolling.js');
      this.character.setState(new DR(this.character));
    } else if (this.anyDirection()) {
      if (impactY < -2) {
        const { DropRunning: DRun } = require('./DropRunning.js');
        this.character.setState(new DRun(this.character));
      } else {
        if (this.character.actions.run.isPressed) {
          const { Sprint: S } = require('./Sprint.js');
          this.character.setState(new S(this.character));
        } else {
          const { Walk: W } = require('./Walk.js');
          this.character.setState(new W(this.character));
        }
      }
    } else {
      const { DropIdle: DI } = require('./DropIdle.js');
      this.character.setState(new DI(this.character));
    }
  }

  /** Choose directional walk-start state based on angle to movement */
  setAppropriateStartWalkState(): void {
    const range = Math.PI;
    const angle = getSignedAngleBetweenVectors(
      this.character.orientation,
      this.character.getCameraRelativeMovementVector(),
    );

    if (angle > range * 0.8) {
      const { StartWalkBackLeft: S } = require('./StartWalkBackLeft.js');
      this.character.setState(new S(this.character));
    } else if (angle < -range * 0.8) {
      const { StartWalkBackRight: S } = require('./StartWalkBackRight.js');
      this.character.setState(new S(this.character));
    } else if (angle > range * 0.3) {
      const { StartWalkLeft: S } = require('./StartWalkLeft.js');
      this.character.setState(new S(this.character));
    } else if (angle < -range * 0.3) {
      const { StartWalkRight: S } = require('./StartWalkRight.js');
      this.character.setState(new S(this.character));
    } else {
      const { StartWalkForward: S } = require('./StartWalkForward.js');
      this.character.setState(new S(this.character));
    }
  }

  /** Play a named animation and store its length */
  protected playAnimation(animName: string, fadeIn: number): void {
    this.animationLength = this.character.setAnimation(animName, fadeIn);
  }
}
