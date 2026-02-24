// ═══════════════════════════════════════════════════════════════════
// VECTOR SPRING SIMULATOR — 3D spring for velocity smoothing
// Ported from Sketchbook (swift502/Sketchbook) — MIT License
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { SimulatorBase } from './SimulatorBase.js';
import { SimulationFrameVector } from './SimulationFrame.js';
import { springV } from './SpringMath.js';

export class VectorSpringSimulator extends SimulatorBase {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  target: THREE.Vector3;
  cache: SimulationFrameVector[];

  constructor(fps: number, mass: number, damping: number) {
    super(fps, mass, damping);
    this.init();
  }

  init(): void {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.cache = [];
    for (let i = 0; i < 2; i++) {
      this.cache.push(new SimulationFrameVector(new THREE.Vector3(), new THREE.Vector3()));
    }
  }

  simulate(timeStep: number): void {
    this.generateFrames(timeStep);
    const t = this.offset / this.frameTime;
    this.position.lerpVectors(this.cache[0].position, this.cache[1].position, t);
    this.velocity.lerpVectors(this.cache[0].velocity, this.cache[1].velocity, t);
  }

  getFrame(_isLastFrame: boolean): SimulationFrameVector {
    const last = this.lastFrame() as SimulationFrameVector;
    const frame = new SimulationFrameVector(last.position.clone(), last.velocity.clone());
    springV(frame.position, this.target, frame.velocity, this.mass, this.damping);
    return frame;
  }
}
