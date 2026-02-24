import { CharacterStateBase } from './CharacterStateBase.js';
import type { SketchCharacter } from '../SketchCharacter.js';

export class Falling extends CharacterStateBase {
  constructor(character: SketchCharacter) {
    super(character);
    character.velocitySimulator.mass = 100;
    character.rotationSimulator.damping = 0.3;
    character.arcadeVelocityIsAdditive = true;
    character.setArcadeVelocityInfluence(0.05, 0, 0.05);
    this.playAnimation('jump', 0.3);
  }

  update(dt: number): void {
    super.update(dt);
    this.character.setCameraRelativeOrientationTarget();
    this.character.setArcadeVelocityTarget(this.anyDirection() ? 0.8 : 0);

    if (this.character.rayHasHit) {
      this.setAppropriateDropState();
    }
  }
}
