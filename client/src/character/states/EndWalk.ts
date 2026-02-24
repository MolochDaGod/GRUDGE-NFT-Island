import { CharacterStateBase } from './CharacterStateBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class EndWalk extends CharacterStateBase {
  constructor(character: SketchCharacter) {
    super(character);
    character.setArcadeVelocityTarget(0);
    // 'stop' clip — falls back to 'idle' if not available
    this.animationLength = character.setAnimation('stop', 0.1) || character.setAnimation('idle', 0.1);
  }

  update(dt: number): void {
    super.update(dt);
    if (this.animationEnded(dt)) {
      const { Idle: I } = require('./Idle.js');
      this.character.setState(new I(this.character));
    }
    this.fallInAir();
  }

  onInputChange(): void {
    super.onInputChange();
    if (this.character.actions.jump.justPressed) {
      const { JumpIdle: J } = require('./JumpIdle.js');
      this.character.setState(new J(this.character));
    }
    if (this.anyDirection()) {
      if (this.character.actions.run.isPressed) {
        const { Sprint: S } = require('./Sprint.js');
        this.character.setState(new S(this.character));
      } else if (this.character.velocity.length() > 0.5) {
        const { Walk: W } = require('./Walk.js');
        this.character.setState(new W(this.character));
      } else {
        this.setAppropriateStartWalkState();
      }
    }
  }
}
