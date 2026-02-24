import { CharacterStateBase } from './CharacterStateBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class DropRunning extends CharacterStateBase {
  constructor(character: SketchCharacter) {
    super(character);
    character.setArcadeVelocityTarget(0.8);
    this.playAnimation('run', 0.1);  // 'drop_running' fallback to 'run'
  }

  update(dt: number): void {
    super.update(dt);
    this.character.setCameraRelativeOrientationTarget();
    if (this.animationEnded(dt)) {
      const { Walk: W } = require('./Walk.js');
      this.character.setState(new W(this.character));
    }
  }

  onInputChange(): void {
    super.onInputChange();
    if (this.noDirection()) {
      const { EndWalk: E } = require('./EndWalk.js');
      this.character.setState(new E(this.character));
    }
    if (this.anyDirection() && this.character.actions.run.justPressed) {
      const { Sprint: S } = require('./Sprint.js');
      this.character.setState(new S(this.character));
    }
    if (this.character.actions.jump.justPressed) {
      const { JumpRunning: J } = require('./JumpRunning.js');
      this.character.setState(new J(this.character));
    }
  }
}
