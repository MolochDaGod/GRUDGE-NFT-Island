import { StartWalkBase } from './StartWalkBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class StartWalkBackLeft extends StartWalkBase {
  constructor(character: SketchCharacter) {
    super(character);
    this.animationLength = character.setAnimation('start_back_left', 0.1) || character.setAnimation('run', 0.1);
  }
}
