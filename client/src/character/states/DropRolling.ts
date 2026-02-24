import { CharacterStateBase } from './CharacterStateBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class DropRolling extends CharacterStateBase {
  constructor(character: SketchCharacter) {
    super(character);
    character.velocitySimulator.mass = 1;
    character.velocitySimulator.damping = 0.6;
    character.setArcadeVelocityTarget(0.8);
    this.playAnimation('run', 0.03);  // 'drop_running_roll' fallback to 'run'
  }

  update(dt: number): void {
    super.update(dt);
    this.character.setCameraRelativeOrientationTarget();

    if (this.animationEnded(dt)) {
      if (this.anyDirection()) {
        const { Walk: W } = require('./Walk.js');
        this.character.setState(new W(this.character));
      } else {
        const { EndWalk: E } = require('./EndWalk.js');
        this.character.setState(new E(this.character));
      }
    }
  }
}
