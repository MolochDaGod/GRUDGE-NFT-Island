// ═══════════════════════════════════════════════════════════════════
// COMBAT STATE — Bridge between SketchCharacter states and the
// existing AnimationStateMachine combat system.
//
// When a combat action triggers (attack, block, dodge, cast), the
// character transitions to this state. It locks movement, plays the
// combat animation via setAnimation, and returns to Idle when done.
// ═══════════════════════════════════════════════════════════════════

import { CharacterStateBase } from '../CharacterStateBase.js';
import type { SketchCharacter } from '../../SketchCharacter.js';

export type CombatAction = 'attack' | 'block' | 'dodge' | 'cast';

/** Map combat actions to animation clip names */
const COMBAT_CLIPS: Record<CombatAction, { clip: string; fadeIn: number; speed: number }> = {
  attack: { clip: 'attack_1', fadeIn: 0.08, speed: 1.0 },
  block:  { clip: 'block',    fadeIn: 0.08, speed: 1.0 },
  dodge:  { clip: 'dodge',    fadeIn: 0.05, speed: 1.0 },
  cast:   { clip: 'cast_1h',  fadeIn: 0.10, speed: 1.0 },
};

export class CombatState extends CharacterStateBase {
  private readonly action: CombatAction;

  constructor(character: SketchCharacter, action: CombatAction) {
    super(character);
    this.action = action;

    // Lock movement during combat
    character.setArcadeVelocityTarget(0);
    character.velocitySimulator.damping = 0.6;
    character.velocitySimulator.mass = 10;

    const config = COMBAT_CLIPS[action];
    this.animationLength = character.setAnimation(config.clip, config.fadeIn);
  }

  update(dt: number): void {
    super.update(dt);

    if (this.animationEnded(dt)) {
      const { Idle: I } = require('../Idle.js');
      this.character.setState(new I(this.character));
    }
  }

  // Combat states don't respond to movement input (locked)
  onInputChange(): void {
    // No transitions while in combat animation
  }
}
