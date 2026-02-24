import { CharacterStateBase } from './CharacterStateBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class Idle extends CharacterStateBase {
  constructor(character: SketchCharacter) {
    super(character);
    character.velocitySimulator.damping = 0.6;
    character.velocitySimulator.mass = 10;
    character.setArcadeVelocityTarget(0);
    this.playAnimation('idle', 0.1);
  }

  update(dt: number): void {
    super.update(dt);
    this.fallInAir();
  }

  onInputChange(): void {
    super.onInputChange();
    if (this.character.actions.jump.justPressed) {
      const { JumpIdle: J } = require('./JumpIdle.js');
      this.character.setState(new J(this.character));
    }
    if (this.anyDirection()) {
      if (this.character.velocity.length() > 0.5) {
        const { Walk: W } = require('./Walk.js');
        this.character.setState(new W(this.character));
      } else {
        this.setAppropriateStartWalkState();
      }
    }
  }
}
