// ═══════════════════════════════════════════════════════════════════
// THIRD-PERSON CAMERA
// Over-the-shoulder camera with Unity-style smooth damp, voxel
// collision, LMB free-look orbit, and optional lock-on target.
//
// Ported from grudge-studio NPM → controllers/character/ThirdPersonController.js
// Adapted for voxel-world block collision instead of raycaster meshes.
//
// USAGE:
//   const cam = new ThirdPersonCamera(camera, isSolid);
//   // In game loop:
//   cam.update(dt, playerPosition, playerYaw, isFreeLooking, mouseDelta);
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';

/** Callback to test if a world-space block is solid (for camera collision) */
export type BlockQuery = (wx: number, wy: number, wz: number) => boolean;

export interface ThirdPersonCameraOptions {
  distance?: number;
  height?: number;
  lookAtHeight?: number;
  shoulderOffset?: number;
  minDistance?: number;
  maxDistance?: number;
  smoothTime?: number;
  sensitivity?: number;
  minPitch?: number;
  maxPitch?: number;
  collisionPadding?: number;
  collisionStepSize?: number;
  lockOnSpeed?: number;
}

export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  private isSolid: BlockQuery;

  // ── Configurable parameters ────────────────────────────────
  distance: number;
  height: number;
  lookAtHeight: number;
  shoulderOffset: number;
  minDistance: number;
  maxDistance: number;
  smoothTime: number;
  sensitivity: number;
  minPitch: number;
  maxPitch: number;
  collisionPadding: number;
  collisionStepSize: number;
  lockOnSpeed: number;

  // ── Orbit state ────────────────────────────────────────────
  /** Camera yaw — during free-look this diverges from player yaw */
  yaw = 0;
  /** Camera pitch (vertical orbit angle) */
  pitch = 0.3;

  // ── Smooth damp state ──────────────────────────────────────
  private currentPosition: THREE.Vector3;
  private velocity = new THREE.Vector3();
  private currentDistance: number;

  // ── Lock-on ────────────────────────────────────────────────
  lockOnTarget: THREE.Object3D | THREE.Vector3 | null = null;

  // ── Reusable vectors (avoid GC) ────────────────────────────
  private _targetPos = new THREE.Vector3();
  private _idealOffset = new THREE.Vector3();
  private _euler = new THREE.Euler();

  constructor(
    camera: THREE.PerspectiveCamera,
    isSolid: BlockQuery,
    options: ThirdPersonCameraOptions = {},
  ) {
    this.camera = camera;
    this.isSolid = isSolid;

    this.distance = options.distance ?? 3.5;
    this.height = options.height ?? 2.0;
    this.lookAtHeight = options.lookAtHeight ?? 1.5;
    this.shoulderOffset = options.shoulderOffset ?? 0.6;
    this.minDistance = options.minDistance ?? 0.8;
    this.maxDistance = options.maxDistance ?? 8.0;
    this.smoothTime = options.smoothTime ?? 0.1;
    this.sensitivity = options.sensitivity ?? 0.002;
    this.minPitch = options.minPitch ?? -Math.PI / 4;
    this.maxPitch = options.maxPitch ?? Math.PI / 3;
    this.collisionPadding = options.collisionPadding ?? 0.3;
    this.collisionStepSize = options.collisionStepSize ?? 0.3;
    this.lockOnSpeed = options.lockOnSpeed ?? 5;

    this.currentPosition = camera.position.clone();
    this.currentDistance = this.distance;
  }

  // ── Main Update ────────────────────────────────────────────

  /**
   * Update the camera for one frame.
   * @param dt       Delta time (seconds)
   * @param playerPos   Player world position (feet)
   * @param playerYaw   Player facing direction (radians)
   * @param isFreeLooking  Is LMB held? (orbit freely)
   * @param mouseDelta   Mouse movement this frame {dx, dy} in pixels
   * @param wheelDelta   Scroll wheel delta (positive = zoom out)
   */
  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerYaw: number,
    isFreeLooking: boolean,
    mouseDelta: { dx: number; dy: number },
    wheelDelta: number,
  ): void {
    // ── Zoom ──
    if (wheelDelta !== 0) {
      this.distance += wheelDelta * 0.002;
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    }

    // ── Camera orbit ──
    if (isFreeLooking) {
      // Free-look: mouse orbits the camera freely around the player
      this.yaw -= mouseDelta.dx * this.sensitivity;
      this.pitch += mouseDelta.dy * this.sensitivity;
      this.pitch = clamp(this.pitch, this.minPitch, this.maxPitch);
    } else {
      // Auto-follow: camera smoothly returns behind the player
      const targetYaw = playerYaw;
      const diff = angleDiff(this.yaw, targetYaw);
      this.yaw += diff * Math.min(1, 6 * dt);

      // Pitch returns toward default
      this.pitch += (0.3 - this.pitch) * Math.min(1, 3 * dt);
    }

    // ── Lock-on target override ──
    if (this.lockOnTarget) {
      const lockPos = new THREE.Vector3();
      if ((this.lockOnTarget as THREE.Object3D).getWorldPosition) {
        (this.lockOnTarget as THREE.Object3D).getWorldPosition(lockPos);
      } else {
        lockPos.copy(this.lockOnTarget as THREE.Vector3);
      }

      this._targetPos.set(playerPos.x, playerPos.y + this.lookAtHeight, playerPos.z);
      const dirToTarget = lockPos.clone().sub(this._targetPos);
      dirToTarget.y = 0;
      const lockYaw = Math.atan2(dirToTarget.x, dirToTarget.z);
      const diff = angleDiff(this.yaw, lockYaw);
      this.yaw += diff * Math.min(1, this.lockOnSpeed * dt);
    }

    // ── Compute ideal camera position ──
    // The look-at point is at player feet + lookAtHeight
    this._targetPos.set(playerPos.x, playerPos.y + this.lookAtHeight, playerPos.z);

    // Ideal offset: (shoulderOffset, height delta, distance) rotated by yaw+pitch
    this._idealOffset.set(
      this.shoulderOffset,
      this.height - this.lookAtHeight,
      this.distance,
    );
    this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this._idealOffset.applyEuler(this._euler);

    // ── Camera collision (voxel raycast) ──
    const direction = this._idealOffset.clone().normalize();
    const maxDist = this._idealOffset.length();
    const safeDist = this.checkCollision(this._targetPos, direction, maxDist);

    // Smooth current distance toward safe distance
    this.currentDistance += (safeDist - this.currentDistance) * (1 - Math.exp(-10 * dt));

    // Scale offset to safe distance
    const scaledOffset = direction.multiplyScalar(this.currentDistance);
    const desiredPosition = this._targetPos.clone().add(scaledOffset);

    // ── Smooth damp toward desired position ──
    smoothDampVector(
      this.currentPosition,
      desiredPosition,
      this.velocity,
      this.smoothTime,
      50,  // maxSpeed
      dt,
    );

    // ── Apply to camera ──
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this._targetPos);
  }

  // ── Camera collision (voxel block stepping) ────────────────

  private checkCollision(origin: THREE.Vector3, direction: THREE.Vector3, maxDist: number): number {
    const step = this.collisionStepSize;

    for (let d = step; d < maxDist; d += step) {
      const rx = origin.x + direction.x * d;
      const ry = origin.y + direction.y * d;
      const rz = origin.z + direction.z * d;

      if (this.isSolid(rx, ry, rz)) {
        return Math.max(this.minDistance, d - this.collisionPadding);
      }
    }

    return maxDist;
  }

  // ── Teleport (skip smooth damp) ────────────────────────────

  /** Instantly move camera to behind the player (skip interpolation) */
  teleport(playerPos: THREE.Vector3, playerYaw: number): void {
    this.yaw = playerYaw;
    this.pitch = 0.3;

    this._targetPos.set(playerPos.x, playerPos.y + this.lookAtHeight, playerPos.z);
    this._idealOffset.set(this.shoulderOffset, this.height - this.lookAtHeight, this.distance);
    this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this._idealOffset.applyEuler(this._euler);

    this.currentPosition.copy(this._targetPos).add(this._idealOffset);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this._targetPos);
    this.velocity.set(0, 0, 0);
    this.currentDistance = this.distance;
  }
}

// ═══════════════════════════════════════════════════════════════════
// MATH UTILITIES
// ═══════════════════════════════════════════════════════════════════

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Shortest signed angle difference (wraps around ±π) */
function angleDiff(from: number, to: number): number {
  return ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
}

/**
 * Unity-style SmoothDamp for THREE.Vector3 (critically-damped spring).
 * Ported from grudge-studio NPM ThirdPersonController.smoothDampVector().
 * Mutates `current` and `velocity` in place.
 */
function smoothDampVector(
  current: THREE.Vector3,
  target: THREE.Vector3,
  velocity: THREE.Vector3,
  smoothTime: number,
  maxSpeed: number,
  dt: number,
): void {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  let changeX = current.x - target.x;
  let changeY = current.y - target.y;
  let changeZ = current.z - target.z;

  const maxChange = maxSpeed * smoothTime;
  const sqrLen = changeX * changeX + changeY * changeY + changeZ * changeZ;

  if (sqrLen > maxChange * maxChange) {
    const len = Math.sqrt(sqrLen);
    changeX = changeX / len * maxChange;
    changeY = changeY / len * maxChange;
    changeZ = changeZ / len * maxChange;
  }

  const tempX = (velocity.x + omega * changeX) * dt;
  const tempY = (velocity.y + omega * changeY) * dt;
  const tempZ = (velocity.z + omega * changeZ) * dt;

  velocity.x = (velocity.x - omega * tempX) * exp;
  velocity.y = (velocity.y - omega * tempY) * exp;
  velocity.z = (velocity.z - omega * tempZ) * exp;

  current.x = target.x + (changeX + tempX) * exp;
  current.y = target.y + (changeY + tempY) * exp;
  current.z = target.z + (changeZ + tempZ) * exp;
}
