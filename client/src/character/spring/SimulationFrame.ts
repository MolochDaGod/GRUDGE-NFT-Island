// ═══════════════════════════════════════════════════════════════════
// SIMULATION FRAME — Cache types for spring simulators
// Ported from Sketchbook (swift502/Sketchbook) — MIT License
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';

/** Scalar simulation frame (1D position + velocity) */
export class SimulationFrame {
  position: number;
  velocity: number;

  constructor(position: number, velocity: number) {
    this.position = position;
    this.velocity = velocity;
  }
}

/** Vector simulation frame (3D position + velocity) */
export class SimulationFrameVector {
  position: THREE.Vector3;
  velocity: THREE.Vector3;

  constructor(position: THREE.Vector3, velocity: THREE.Vector3) {
    this.position = position;
    this.velocity = velocity;
  }
}
