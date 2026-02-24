import { CharacterStateBase } from './CharacterStateBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class Sprint extends CharacterStateBase {
  constructor(character: SketchCharacter) {
    super(character);
    character.velocitySimulator.mass = 10;
    character.rotationSimulator.damping = 0.8;
    character.rotationSimulator.mass = 50;
    character.setArcadeVelocityTarget(1.4);
    this.playAnimation('sprint', 0.1);
  }

  update(dt: number): void {
    super.update(dt);
    this.character.setCameraRelativeOrientationTarget();
    this.fallInAir();
  }

  onInputChange(): void {
    super.onInputChange();
    if (!this.character.actions.run.isPressed) {
      const { Walk: W } = require('./Walk.js');
      this.character.setState(new W(this.character));
    }
    if (this.character.actions.jump.justPressed) {
      const { JumpRunning: J } = require('./JumpRunning.js');
      this.character.setState(new J(this.character));
    }
    if (this.noDirection()) {
      const { EndWalk: E } = require('./EndWalk.js');
      this.character.setState(new E(this.character));
    }
  }
}
