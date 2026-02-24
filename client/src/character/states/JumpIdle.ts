import { CharacterStateBase } from './CharacterStateBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class JumpIdle extends CharacterStateBase {
  private alreadyJumped = false;

  constructor(character: SketchCharacter) {
    super(character);
    character.velocitySimulator.mass = 50;
    character.setArcadeVelocityTarget(0);
    this.playAnimation('jump', 0.1);
  }

  update(dt: number): void {
    super.update(dt);

    if (this.alreadyJumped) {
      this.character.setCameraRelativeOrientationTarget();
      this.character.setArcadeVelocityTarget(this.anyDirection() ? 0.8 : 0);
    }

    // Physically jump after short wind-up
    if (this.timer > 0.2 && !this.alreadyJumped) {
      this.character.jump();
      this.alreadyJumped = true;
      this.character.velocitySimulator.mass = 100;
      this.character.rotationSimulator.damping = 0.3;
      this.character.setArcadeVelocityInfluence(0.3, 0, 0.3);
    } else if (this.timer > 0.3 && this.character.rayHasHit) {
      this.setAppropriateDropState();
    } else if (this.animationEnded(dt)) {
      const { Falling: F } = require('./Falling.js');
      this.character.setState(new F(this.character));
    }
  }
}
