// ═══════════════════════════════════════════════════════════════════
// CHARACTER CONTROLLER
// Handles player movement, physics, and collision against the voxel
// world. Decoupled from rendering — takes a blockQuery callback so
// it doesn't need to know about chunk storage.
//
// PATTERN: The controller owns position/velocity/rotation and
// exposes read-only state for the camera and animation systems.
// Main.ts calls update(dt, keys) each frame and reads the results.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import {
  PLAYER_SPEED, SPRINT_MULTIPLIER, JUMP_VELOCITY, GRAVITY,
  PLAYER_EYE_HEIGHT,
} from '@grudge/shared';

// ── Types ─────────────────────────────────────────────────────────

/** Callback to test if a world-space block is solid */
export type BlockQuery = (wx: number, wy: number, wz: number) => boolean;

/** Key state map from input system */
export type KeyMap = Record<string, boolean>;

/** Read-only snapshot of controller state for other systems */
export interface ControllerState {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly yaw: number;
  readonly pitch: number;
  readonly onGround: boolean;
  readonly isMoving: boolean;
  readonly isSprinting: boolean;
  readonly moveSpeed: number;
  readonly movingBack: boolean;
}

// ── Controller ────────────────────────────────────────────────────

export class CharacterController {
  // Position & physics
  readonly position = new THREE.Vector3(0, 80, 0);
  readonly velocity = new THREE.Vector3(0, 0, 0);

  // Rotation (managed by mouse input from main.ts)
  yaw = 0;
  pitch = 0;

  // State flags
  onGround = false;
  spawnReady = false;

  // Movement state (computed each frame, read by AnimationStateMachine)
  isMoving = false;
  isSprinting = false;
  moveSpeed = 0;
  movingBack = false;

  /** Is the controller locked out of movement? (e.g., during attack animation) */
  movementLocked = false;

  // Collision callback
  private isSolid: BlockQuery;

  // Reusable vectors (avoid GC)
  private _forward = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _moveDir = new THREE.Vector3();

  constructor(isSolid: BlockQuery) {
    this.isSolid = isSolid;
  }

  // ── Spawn ─────────────────────────────────────────────────────

  /** Set spawn position (from server WELCOME message) */
  setSpawn(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.spawnReady = false;
  }

  /** Check if the terrain under spawn is loaded; if so, drop to ground */
  checkSpawnReady(): boolean {
    if (this.spawnReady) return true;

    // Test if there's any solid block under spawn
    const hasTerrain = this.isSolid(this.position.x, 1, this.position.z)
                    || this.isSolid(this.position.x, 40, this.position.z);
    if (!hasTerrain) return false;

    // Find ground level
    for (let y = 100; y > 0; y--) {
      if (this.isSolid(this.position.x, y, this.position.z) &&
          !this.isSolid(this.position.x, y + 1, this.position.z)) {
        this.position.y = y + 1;
        break;
      }
    }

    this.spawnReady = true;
    return true;
  }

  // ── Core Update ───────────────────────────────────────────────

  /**
   * Run one frame of physics. Call from gameLoop.
   * Returns the controller state snapshot for camera/animation.
   */
  update(dt: number, keys: KeyMap): ControllerState {
    // Wait for terrain before applying physics
    if (!this.checkSpawnReady()) {
      return this.getState();
    }

    // Movement input
    const speed = keys['ShiftLeft'] ? PLAYER_SPEED * SPRINT_MULTIPLIER : PLAYER_SPEED;
    this.isSprinting = !!keys['ShiftLeft'];

    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this._moveDir.set(0, 0, 0);
    const fwd = !!keys['KeyW'];
    const back = !!keys['KeyS'];
    const left = !!keys['KeyA'];
    const right = !!keys['KeyD'];

    if (!this.movementLocked) {
      if (fwd)   this._moveDir.add(this._forward);
      if (back)  this._moveDir.sub(this._forward);
      if (left)  this._moveDir.sub(this._right);
      if (right) this._moveDir.add(this._right);
    }

    this.movingBack = back && !fwd;

    if (this._moveDir.lengthSq() > 0) {
      this._moveDir.normalize().multiplyScalar(speed);
    }

    this.velocity.x = this._moveDir.x;
    this.velocity.z = this._moveDir.z;
    this.moveSpeed = this._moveDir.length();
    this.isMoving = this.moveSpeed > 0.1;

    // Jump
    if (keys['Space'] && this.onGround && !this.movementLocked) {
      this.velocity.y = JUMP_VELOCITY;
      this.onGround = false;
    }

    // Gravity
    this.velocity.y += GRAVITY * dt;

    // Apply velocity with AABB collision
    this.applyCollision(dt);

    return this.getState();
  }

  // ── Collision ─────────────────────────────────────────────────

  private applyCollision(dt: number): void {
    const newX = this.position.x + this.velocity.x * dt;
    const newY = this.position.y + this.velocity.y * dt;
    const newZ = this.position.z + this.velocity.z * dt;

    const hw = 0.3; // half-width for AABB

    // X axis
    if (!this.isSolid(newX + hw, this.position.y, this.position.z) &&
        !this.isSolid(newX - hw, this.position.y, this.position.z) &&
        !this.isSolid(newX + hw, this.position.y + 1, this.position.z) &&
        !this.isSolid(newX - hw, this.position.y + 1, this.position.z)) {
      this.position.x = newX;
    } else {
      this.velocity.x = 0;
    }

    // Z axis
    if (!this.isSolid(this.position.x, this.position.y, newZ + hw) &&
        !this.isSolid(this.position.x, this.position.y, newZ - hw) &&
        !this.isSolid(this.position.x, this.position.y + 1, newZ + hw) &&
        !this.isSolid(this.position.x, this.position.y + 1, newZ - hw)) {
      this.position.z = newZ;
    } else {
      this.velocity.z = 0;
    }

    // Y axis (ground + ceiling)
    this.onGround = false;
    if (this.velocity.y < 0) {
      if (this.isSolid(this.position.x, newY - 0.01, this.position.z)) {
        this.position.y = Math.ceil(newY);
        this.velocity.y = 0;
        this.onGround = true;
      } else {
        this.position.y = newY;
      }
    } else {
      if (this.isSolid(this.position.x, newY + PLAYER_EYE_HEIGHT + 0.3, this.position.z)) {
        this.velocity.y = 0;
      } else {
        this.position.y = newY;
      }
    }
  }

  // ── State Snapshot ────────────────────────────────────────────

  getState(): ControllerState {
    return {
      position: this.position,
      velocity: this.velocity,
      yaw: this.yaw,
      pitch: this.pitch,
      onGround: this.onGround,
      isMoving: this.isMoving,
      isSprinting: this.isSprinting,
      moveSpeed: this.moveSpeed,
      movingBack: this.movingBack,
    };
  }
}
