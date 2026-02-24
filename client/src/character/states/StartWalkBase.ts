import { CharacterStateBase } from './CharacterStateBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class StartWalkBase extends CharacterStateBase {
  constructor(character: SketchCharacter) {
    super(character);
    character.rotationSimulator.mass = 20;
    character.rotationSimulator.damping = 0.7;
    character.setArcadeVelocityTarget(0.8);
  }

  update(dt: number): void {
    super.update(dt);
    if (this.animationEnded(dt)) {
      const { Walk: W } = require('./Walk.js');
      this.character.setState(new W(this.character));
    }
    this.character.setCameraRelativeOrientationTarget();
    this.fallInAir();
  }

  onInputChange(): void {
    super.onInputChange();
    if (this.character.actions.jump.justPressed) {
      const { JumpRunning: J } = require('./JumpRunning.js');
      this.character.setState(new J(this.character));
    }
    if (this.noDirection()) {
      const { Idle: I } = require('./Idle.js');
      this.character.setState(new I(this.character));
    }
    if (this.character.actions.run.justPressed) {
      const { Sprint: S } = require('./Sprint.js');
      this.character.setState(new S(this.character));
    }
  }
}
