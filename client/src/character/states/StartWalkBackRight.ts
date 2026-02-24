import { StartWalkBase } from './StartWalkBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class StartWalkBackRight extends StartWalkBase {
  constructor(character: SketchCharacter) {
    super(character);
    this.animationLength = character.setAnimation('start_back_right', 0.1) || character.setAnimation('run', 0.1);
  }
}
