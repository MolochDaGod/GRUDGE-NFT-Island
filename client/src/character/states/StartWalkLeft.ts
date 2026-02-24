import { StartWalkBase } from './StartWalkBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class StartWalkLeft extends StartWalkBase {
  constructor(character: SketchCharacter) {
    super(character);
    this.animationLength = character.setAnimation('start_left', 0.1) || character.setAnimation('run', 0.1);
  }
}
