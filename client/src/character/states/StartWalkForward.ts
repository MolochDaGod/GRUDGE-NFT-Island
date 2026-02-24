import { StartWalkBase } from './StartWalkBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class StartWalkForward extends StartWalkBase {
  constructor(character: SketchCharacter) {
    super(character);
    this.animationLength = character.setAnimation('start_forward', 0.1) || character.setAnimation('run', 0.1);
  }
}
