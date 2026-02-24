// ═══════════════════════════════════════════════════════════════════
// RELATIVE SPRING SIMULATOR — 1D spring for smooth rotation
// Outputs relative (delta) position each frame, perfect for applying
// incremental rotation without accumulating absolute error.
// Ported from Sketchbook (swift502/Sketchbook) — MIT License
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { SimulatorBase } from './SimulatorBase.js';
import { SimulationFrame } from './SimulationFrame.js';
import { spring } from './SpringMath.js';

export class RelativeSpringSimulator extends SimulatorBase {
  position: number;
  velocity: number;
  target: number;
  lastLerp: number;
  cache: SimulationFrame[];

  constructor(
    fps: number, mass: number, damping: number,
    startPosition = 0, startVelocity = 0,
  ) {
    super(fps, mass, damping);
    this.position = startPosition;
    this.velocity = startVelocity;
    this.target = 0;
    this.lastLerp = 0;
    this.cache = [];
    for (let i = 0; i < 2; i++) {
      this.cache.push(new SimulationFrame(startPosition, startVelocity));
    }
  }

  simulate(timeStep: number): void {
    this.generateFrames(timeStep);
    const t = this.offset / this.frameTime;
    const lerp = THREE.MathUtils.lerp(0, this.cache[1].position, t);
    this.position = lerp - this.lastLerp;
    this.lastLerp = lerp;
    this.velocity = THREE.MathUtils.lerp(this.cache[0].velocity, this.cache[1].velocity, t);
  }

  getFrame(isLastFrame: boolean): SimulationFrame {
    const last = this.lastFrame() as SimulationFrame;
    const frame = new SimulationFrame(last.position, last.velocity);

    if (isLastFrame) {
      frame.position = 0;
      this.lastLerp = this.lastLerp - last.position;
    }

    return spring(frame.position, this.target, frame.velocity, this.mass, this.damping);
  }
}
