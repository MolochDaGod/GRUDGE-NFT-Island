import { CharacterStateBase } from './CharacterStateBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class JumpRunning extends CharacterStateBase {
  private alreadyJumped = false;

  constructor(character: SketchCharacter) {
    super(character);
    character.velocitySimulator.mass = 100;
    this.playAnimation('jump', 0.03);
  }

  update(dt: number): void {
    super.update(dt);
    this.character.setCameraRelativeOrientationTarget();

    if (this.alreadyJumped) {
      this.character.setArcadeVelocityTarget(this.anyDirection() ? 0.8 : 0);
    }

    if (this.timer > 0.13 && !this.alreadyJumped) {
      this.character.jump(4);
      this.alreadyJumped = true;
      this.character.rotationSimulator.damping = 0.3;
      this.character.arcadeVelocityIsAdditive = true;
      this.character.setArcadeVelocityInfluence(0.05, 0, 0.05);
    } else if (this.timer > 0.24 && this.character.rayHasHit) {
      this.setAppropriateDropState();
    } else if (this.animationEnded(dt)) {
      const { Falling: F } = require('./Falling.js');
      this.character.setState(new F(this.character));
    }
  }
}
