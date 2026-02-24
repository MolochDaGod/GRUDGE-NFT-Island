import { CharacterStateBase } from './CharacterStateBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class DropIdle extends CharacterStateBase {
  constructor(character: SketchCharacter) {
    super(character);
    character.velocitySimulator.damping = 0.5;
    character.velocitySimulator.mass = 7;
    character.setArcadeVelocityTarget(0);
    this.playAnimation('idle', 0.1);  // 'drop_idle' fallback to 'idle'

    if (this.anyDirection()) {
      const { StartWalkForward: S } = require('./StartWalkForward.js');
      character.setState(new S(character));
    }
  }

  update(dt: number): void {
    super.update(dt);
    this.character.setCameraRelativeOrientationTarget();
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
      const { StartWalkForward: S } = require('./StartWalkForward.js');
      this.character.setState(new S(this.character));
    }
  }
}
