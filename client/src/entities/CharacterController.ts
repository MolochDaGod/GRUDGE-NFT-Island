// ═══════════════════════════════════════════════════════════════════
// CHARACTER CONTROLLER
// Handles player movement, physics, and collision against the voxel
// world. Decoupled from rendering — takes a blockQuery callback so
// it doesn't need to know about chunk storage.
//
// PATTERN: The controller owns position/velocity/rotation and
// exposes read-only state for the camera and animation systems.
//
// Movement model ported from grudge-studio NPM CharacterController:
//   - Acceleration-based (not instant velocity snap)
//   - Ground drag / air drag for smooth stop
//   - Coyote time + jump buffering
//   - A/D = turn, Q/E = strafe, W/S = forward/back
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import {
  PLAYER_SPEED, SPRINT_MULTIPLIER, JUMP_VELOCITY, GRAVITY,
  PLAYER_EYE_HEIGHT, PLAYER_ACCELERATION, PLAYER_GROUND_DRAG,
  PLAYER_AIR_DRAG, PLAYER_TURN_SPEED, COYOTE_TIME, JUMP_BUFFER_TIME,
  PLAYER_WIDTH, PLAYER_HEIGHT, AABB,
} from '@grudge/shared';
import type { MovementInput } from '../input/InputManager.js';

// ── Types ─────────────────────────────────────────────────────────

/** Callback to test if a world-space block is solid */
export type BlockQuery = (wx: number, wy: number, wz: number) => boolean;

/** Read-only snapshot of controller state for other systems */
export interface ControllerState {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly yaw: number;
  readonly onGround: boolean;
  readonly isMoving: boolean;
  readonly isSprinting: boolean;
  readonly moveSpeed: number;
  readonly movingBack: boolean;
  /** Normal of last wall hit (useful for effects/animation). Zero if no collision. */
  readonly hitNormal: THREE.Vector3;
}

// ── Controller ────────────────────────────────────────────────────

export class CharacterController {
  // Position & physics
  readonly position = new THREE.Vector3(0, 80, 0);
  readonly velocity = new THREE.Vector3(0, 0, 0);

  // Character facing direction (radians)
  yaw = 0;

  // State flags
  onGround = false;
  spawnReady = false;

  // Movement state (computed each frame, read by camera + AnimationStateMachine)
  isMoving = false;
  isSprinting = false;
  moveSpeed = 0;
  movingBack = false;

  /** Is the controller locked out of movement? (e.g., during attack animation) */
  movementLocked = false;

  /** Admin fly mode — no gravity, no collision, ascend/descend with Space/Ctrl */
  adminFly = false;
  private readonly FLY_SPEED = 20;
  private readonly FLY_SPRINT_MULT = 3;
  private readonly FLY_VERTICAL_SPEED = 15;

  // ── Coyote time + jump buffer ──────────────────────────────
  private wasGrounded = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private isJumping = false;

  // Collision callback
  private isSolid: BlockQuery;

  /** Last hit normal from collision (for wall-sliding feedback) */
  readonly hitNormal = new THREE.Vector3();

  // Reusable vectors (avoid GC)
  private _forward = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _moveDir = new THREE.Vector3();
  private _horizontal = new THREE.Vector3();

  constructor(isSolid: BlockQuery) {
    this.isSolid = isSolid;
  }

  // ── Spawn ─────────────────────────────────────────────────────

  /** Set spawn position (from server WELCOME message) */
  setSpawn(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
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
   * Run one frame of physics.
   * @param dt      Delta time (seconds)
   * @param move    Movement intent from InputManager
   */
  update(dt: number, move: MovementInput): ControllerState {
    // Wait for terrain before applying physics
    if (!this.checkSpawnReady()) {
      return this.getState();
    }

    // ── Admin fly mode ── no gravity, no collision, free 3D movement
    if (this.adminFly) {
      return this.updateFly(dt, move);
    }

    // ── Coyote / jump buffer timers ──
    this.wasGrounded = this.onGround;
    // (onGround is updated at end of applyCollision)

    if (this.wasGrounded && !this.onGround) {
      this.coyoteTimer = COYOTE_TIME;
    }
    if (this.coyoteTimer > 0) this.coyoteTimer -= dt;
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

    // Land detection
    if (!this.wasGrounded && this.onGround && this.isJumping) {
      this.isJumping = false;
    }

    // ── Turning (A/D rotate character yaw) ──
    if (!this.movementLocked) {
      if (move.turnLeft)  this.yaw += PLAYER_TURN_SPEED * dt;
      if (move.turnRight) this.yaw -= PLAYER_TURN_SPEED * dt;
    }

    // ── Movement direction ──
    this.isSprinting = move.sprint;
    const targetSpeed = move.sprint ? PLAYER_SPEED * SPRINT_MULTIPLIER : PLAYER_SPEED;

    // Forward/right relative to character facing
    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this._moveDir.set(0, 0, 0);
    if (!this.movementLocked) {
      if (move.forward)      this._moveDir.add(this._forward);
      if (move.back)         this._moveDir.sub(this._forward);
      if (move.strafeLeft)   this._moveDir.sub(this._right);
      if (move.strafeRight)  this._moveDir.add(this._right);
    }

    this.movingBack = move.back && !move.forward;

    // ── Acceleration-based horizontal movement ──
    const drag = this.onGround ? PLAYER_GROUND_DRAG : PLAYER_AIR_DRAG;

    if (this._moveDir.lengthSq() > 0) {
      this._moveDir.normalize();

      // Accelerate toward move direction
      this.velocity.x += this._moveDir.x * PLAYER_ACCELERATION * dt;
      this.velocity.z += this._moveDir.z * PLAYER_ACCELERATION * dt;

      // Clamp horizontal speed to target
      this._horizontal.set(this.velocity.x, 0, this.velocity.z);
      if (this._horizontal.length() > targetSpeed) {
        this._horizontal.normalize().multiplyScalar(targetSpeed);
        this.velocity.x = this._horizontal.x;
        this.velocity.z = this._horizontal.z;
      }
    } else {
      // Apply drag to stop
      this.velocity.x -= this.velocity.x * drag * dt;
      this.velocity.z -= this.velocity.z * drag * dt;
    }

    // Compute speed for animation system
    this.moveSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    this.isMoving = this.moveSpeed > 0.3;

    // ── Jump (with coyote time + buffer) ──
    if (move.jump && !this.movementLocked) {
      if (this.onGround || this.coyoteTimer > 0) {
        this.velocity.y = JUMP_VELOCITY;
        this.isJumping = true;
        this.onGround = false;
        this.coyoteTimer = 0;
      } else {
        this.jumpBufferTimer = JUMP_BUFFER_TIME;
      }
    }

    // Buffered jump fires on land
    if (this.onGround && this.jumpBufferTimer > 0) {
      this.velocity.y = JUMP_VELOCITY;
      this.isJumping = true;
      this.onGround = false;
      this.jumpBufferTimer = 0;
    }

    // ── Gravity ──
    if (!this.onGround) {
      this.velocity.y += GRAVITY * dt;
    } else if (this.velocity.y < 0) {
      this.velocity.y = 0;
    }

    // ── Apply velocity with swept AABB collision (5 substeps for stability) ──
    this.applySweptCollision(dt);

    return this.getState();
  }

  // ── Admin Fly ─────────────────────────────────────────

  private updateFly(dt: number, move: MovementInput): ControllerState {
    // Turning
    if (move.turnLeft)  this.yaw += PLAYER_TURN_SPEED * dt;
    if (move.turnRight) this.yaw -= PLAYER_TURN_SPEED * dt;

    const speed = move.sprint ? this.FLY_SPEED * this.FLY_SPRINT_MULT : this.FLY_SPEED;

    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this._moveDir.set(0, 0, 0);
    if (move.forward)      this._moveDir.add(this._forward);
    if (move.back)         this._moveDir.sub(this._forward);
    if (move.strafeLeft)   this._moveDir.sub(this._right);
    if (move.strafeRight)  this._moveDir.add(this._right);
    if (this._moveDir.lengthSq() > 0) this._moveDir.normalize();

    // Horizontal
    this.position.x += this._moveDir.x * speed * dt;
    this.position.z += this._moveDir.z * speed * dt;

    // Vertical — Space = up, Ctrl = down
    if (move.ascend)  this.position.y += this.FLY_VERTICAL_SPEED * (move.sprint ? this.FLY_SPRINT_MULT : 1) * dt;
    if (move.descend) this.position.y -= this.FLY_VERTICAL_SPEED * (move.sprint ? this.FLY_SPRINT_MULT : 1) * dt;

    this.velocity.set(0, 0, 0);
    this.onGround = false;
    this.moveSpeed = this._moveDir.lengthSq() > 0 ? speed : 0;
    this.isMoving = this.moveSpeed > 0.3;
    this.isSprinting = move.sprint;
    this.movingBack = move.back && !move.forward;

    return this.getState();
  }

  // ── Swept AABB Collision (replaces old point-check method) ───
  //
  // Uses AABB.sweepVoxels() with 5 substeps per tick for stability,
  // matching the pattern from Three.js games_fps example.

  private static readonly COLLISION_SUBSTEPS = 5;

  private applySweptCollision(dt: number): void {
    const substepDt = dt / CharacterController.COLLISION_SUBSTEPS;
    this.hitNormal.set(0, 0, 0);

    for (let i = 0; i < CharacterController.COLLISION_SUBSTEPS; i++) {
      // Build AABB from current position (feet at position.y)
      const box = AABB.fromFeet(
        this.position.x, this.position.y, this.position.z,
        PLAYER_WIDTH, PLAYER_HEIGHT,
      );

      const result = box.sweepVoxels(
        this.velocity.x, this.velocity.y, this.velocity.z,
        substepDt,
        this.isSolid,
        1.01, // step-up height
      );

      // Apply resolved position
      this.position.set(result.x, result.y, result.z);

      // Update velocity from collision response
      this.velocity.x = result.vx;
      this.velocity.y = result.vy;
      this.velocity.z = result.vz;

      // Track ground state
      if (result.onGround) this.onGround = true;

      // Track hit normal (last non-zero wins)
      if (result.hitNormalX !== 0 || result.hitNormalY !== 0 || result.hitNormalZ !== 0) {
        this.hitNormal.set(result.hitNormalX, result.hitNormalY, result.hitNormalZ);
      }
    }

    // Head-hit detection: raycast upward from center to cancel jump
    // (from ThirdPersonPack HeadHittingDetect pattern)
    if (this.isJumping && this.velocity.y > 0) {
      const headY = this.position.y + PLAYER_HEIGHT + 0.1;
      if (this.isSolid(this.position.x, headY, this.position.z)) {
        this.velocity.y = 0;
        this.isJumping = false;
      }
    }
  }

  // ── State Snapshot ────────────────────────────────────────────

  getState(): ControllerState {
    return {
      position: this.position,
      velocity: this.velocity,
      yaw: this.yaw,
      onGround: this.onGround,
      isMoving: this.isMoving,
      isSprinting: this.isSprinting,
      moveSpeed: this.moveSpeed,
      movingBack: this.movingBack,
      hitNormal: this.hitNormal,
    };
  }
}
