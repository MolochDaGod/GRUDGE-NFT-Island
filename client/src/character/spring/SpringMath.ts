// ═══════════════════════════════════════════════════════════════════
// SPRING MATH — Core math functions for spring simulation
// Ported from Sketchbook FunctionLibrary (swift502/Sketchbook) — MIT
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { SimulationFrame } from './SimulationFrame.js';

/** 1D spring step: returns new frame with updated position + velocity */
export function spring(
  source: number, dest: number, velocity: number,
  mass: number, damping: number,
): SimulationFrame {
  const acceleration = (dest - source) / mass;
  velocity = (velocity + acceleration) * damping;
  return new SimulationFrame(source + velocity, velocity);
}

/** 3D spring step: mutates source and velocity in-place */
export function springV(
  source: THREE.Vector3, dest: THREE.Vector3, velocity: THREE.Vector3,
  mass: number, damping: number,
): void {
  const ax = (dest.x - source.x) / mass;
  const ay = (dest.y - source.y) / mass;
  const az = (dest.z - source.z) / mass;
  velocity.x = (velocity.x + ax) * damping;
  velocity.y = (velocity.y + ay) * damping;
  velocity.z = (velocity.z + az) * damping;
  source.x += velocity.x;
  source.y += velocity.y;
  source.z += velocity.z;
}

/**
 * Constructs a 2D matrix from the first vector (Y replaced with global up)
 * and applies it to the second vector. Camera-relative movement core.
 * Ported from Sketchbook appplyVectorMatrixXZ.
 */
export function applyVectorMatrixXZ(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(
    a.x * b.z + a.z * b.x,
    b.y,
    a.z * b.z + -a.x * b.x,
  );
}

/** Unsigned angle between two vectors (radians) */
export function getAngleBetweenVectors(
  v1: THREE.Vector3, v2: THREE.Vector3, dotThreshold = 0.0005,
): number {
  const dot = v1.dot(v2);
  if (dot > 1 - dotThreshold) return 0;
  if (dot < -1 + dotThreshold) return Math.PI;
  return Math.acos(dot);
}

/** Signed angle between two vectors relative to Y-up normal */
export function getSignedAngleBetweenVectors(
  v1: THREE.Vector3, v2: THREE.Vector3,
  normal: THREE.Vector3 = _UP, dotThreshold = 0.0005,
): number {
  let angle = getAngleBetweenVectors(v1, v2, dotThreshold);
  const cross = _crossTemp.crossVectors(v1, v2);
  if (normal.dot(cross) < 0) angle = -angle;
  return angle;
}

// Reusable temporaries
const _UP = new THREE.Vector3(0, 1, 0);
const _crossTemp = new THREE.Vector3();
