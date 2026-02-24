import { StartWalkBase } from './StartWalkBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class StartWalkRight extends StartWalkBase {
  constructor(character: SketchCharacter) {
    super(character);
    this.animationLength = character.setAnimation('start_right', 0.1) || character.setAnimation('run', 0.1);
  }
}
