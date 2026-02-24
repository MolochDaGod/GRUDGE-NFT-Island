// ═══════════════════════════════════════════════════════════════════
// SKETCH CHARACTER — Sketchbook-style spring controller for voxel worlds
//
// Combines Sketchbook's spring-based velocity/rotation simulation with
// our existing AABB swept voxel collision. States drive velocity targets
// and animations; springs smooth everything; voxel collision resolves.
//
// Ported from swift502/Sketchbook Character.ts — MIT License
// Adapted: cannon.js → voxel raycast, KeyBinding → CharacterActions
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import {
  PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_EYE_HEIGHT, GRAVITY,
  JUMP_VELOCITY, AABB, COYOTE_TIME, JUMP_BUFFER_TIME,
} from '@grudge/shared';
import { VectorSpringSimulator } from './spring/VectorSpringSimulator.js';
import { RelativeSpringSimulator } from './spring/RelativeSpringSimulator.js';
import { applyVectorMatrixXZ, getSignedAngleBetweenVectors } from './spring/SpringMath.js';
import { voxelRaycastDown, type BlockQuery, type VoxelRayResult } from './VoxelRaycast.js';
import type { ICharacterState, CharacterActions } from './ICharacterState.js';
import { createDefaultActions } from './ICharacterState.js';
import type { LoadedCharacter } from '../assets/AssetLoader.js';

// ── Types ─────────────────────────────────────────────────────────

/** Read-only snapshot for external systems (camera, HUD, network) */
export interface CharacterSnapshot {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly yaw: number;
  readonly onGround: boolean;
  readonly isMoving: boolean;
  readonly isSprinting: boolean;
  readonly moveSpeed: number;
  readonly movingBack: boolean;
}

// ── SketchCharacter ───────────────────────────────────────────────

export class SketchCharacter extends THREE.Object3D {
  // ── Visual hierarchy (Sketchbook pattern) ──
  readonly tiltContainer: THREE.Group;
  readonly modelContainer: THREE.Group;

  // ── Spring simulation ──
  readonly velocitySimulator: VectorSpringSimulator;
  readonly rotationSimulator: RelativeSpringSimulator;

  // Default spring params (states override per-state)
  defaultVelocitySimulatorDamping = 0.8;
  defaultVelocitySimulatorMass = 50;
  defaultRotationSimulatorDamping = 0.5;
  defaultRotationSimulatorMass = 10;

  // ── Movement ──
  readonly acceleration = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly velocityTarget = new THREE.Vector3();
  readonly arcadeVelocityInfluence = new THREE.Vector3(1, 0, 1);
  arcadeVelocityIsAdditive = false;
  moveSpeed = 4; // blocks per second base speed
  angularVelocity = 0;

  // ── Orientation ──
  readonly orientation = new THREE.Vector3(0, 0, 1);
  readonly orientationTarget = new THREE.Vector3(0, 0, 1);
  readonly viewVector = new THREE.Vector3();

  // ── Ground detection (voxel raycast) ──
  rayHasHit = false;
  rayCastLength = 0.57;
  raySafeOffset = 0.03;
  private lastRayResult: VoxelRayResult = { hasHit: false, hitPointY: 0, hitDistance: 0 };

  // ── Jump / coyote time ──
  wantsToJump = false;
  initJumpSpeed = -1;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private wasGrounded = false;

  /** Ground impact velocity for landing states */
  readonly groundImpactData = { velocity: new THREE.Vector3() };

  // ── State machine ──
  charState!: ICharacterState;
  readonly actions: CharacterActions;

  // ── World / physics ──
  readonly worldPosition = new THREE.Vector3(0, 80, 0);
  private readonly worldVelocity = new THREE.Vector3();
  onGround = false;
  spawnReady = false;
  private isSolid: BlockQuery;

  // ── Animation ──
  private character: LoadedCharacter | null = null;

  // ── Admin fly ──
  adminFly = false;
  private readonly FLY_SPEED = 20;
  private readonly FLY_SPRINT_MULT = 3;
  private readonly FLY_VERTICAL_SPEED = 15;

  // ── Reusable vectors ──
  private readonly _forward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _moveDir = new THREE.Vector3();

  constructor(isSolid: BlockQuery) {
    super();

    this.isSolid = isSolid;
    this.actions = createDefaultActions();

    // Visual hierarchy: this → tiltContainer → modelContainer → model
    this.tiltContainer = new THREE.Group();
    this.add(this.tiltContainer);

    this.modelContainer = new THREE.Group();
    this.modelContainer.position.y = -0.57;
    this.tiltContainer.add(this.modelContainer);

    // Spring simulators
    this.velocitySimulator = new VectorSpringSimulator(
      60, this.defaultVelocitySimulatorMass, this.defaultVelocitySimulatorDamping,
    );
    this.rotationSimulator = new RelativeSpringSimulator(
      60, this.defaultRotationSimulatorMass, this.defaultRotationSimulatorDamping,
    );
  }

  // ── Model Attachment ────────────────────────────────────────

  /** Attach a loaded character model into the container hierarchy */
  attachModel(char: LoadedCharacter): void {
    // Clear old model
    while (this.modelContainer.children.length > 0) {
      this.modelContainer.remove(this.modelContainer.children[0]);
    }
    this.modelContainer.add(char.group);
    this.character = char;
  }

  // ── State Machine ──────────────────────────────────────────

  setState(state: ICharacterState): void {
    this.charState = state;
    this.charState.onInputChange();
  }

  // ── Arcade Velocity Setters (called by states) ─────────────

  setArcadeVelocityTarget(velZ: number, velX = 0, velY = 0): void {
    this.velocityTarget.set(velX, velY, velZ);
  }

  setArcadeVelocityInfluence(x: number, y = x, z = x): void {
    this.arcadeVelocityInfluence.set(x, y, z);
  }

  // ── Orientation (called by states) ─────────────────────────

  setOrientation(vector: THREE.Vector3, instantly = false): void {
    const look = new THREE.Vector3().copy(vector).setY(0).normalize();
    if (look.lengthSq() < 0.001) return;
    this.orientationTarget.copy(look);
    if (instantly) this.orientation.copy(look);
  }

  resetOrientation(): void {
    this.setOrientation(this.orientation, true);
  }

  setViewVector(vector: THREE.Vector3): void {
    this.viewVector.copy(vector).normalize();
  }

  // ── Camera-Relative Movement (the Sketchbook secret sauce) ──

  /** WASD → local direction vector (not yet camera-relative) */
  getLocalMovementDirection(): THREE.Vector3 {
    const px = this.actions.right.isPressed ? -1 : 0;
    const nx = this.actions.left.isPressed ? 1 : 0;
    const pz = this.actions.up.isPressed ? 1 : 0;
    const nz = this.actions.down.isPressed ? -1 : 0;
    return new THREE.Vector3(px + nx, 0, pz + nz).normalize();
  }

  /** Transform local WASD into camera-relative world direction */
  getCameraRelativeMovementVector(): THREE.Vector3 {
    const localDir = this.getLocalMovementDirection();
    const flatView = new THREE.Vector3(this.viewVector.x, 0, this.viewVector.z).normalize();
    return applyVectorMatrixXZ(flatView, localDir);
  }

  /** Orient toward camera-relative movement direction */
  setCameraRelativeOrientationTarget(): void {
    const moveVec = this.getCameraRelativeMovementVector();
    if (moveVec.x === 0 && moveVec.z === 0) {
      this.setOrientation(this.orientation);
    } else {
      this.setOrientation(moveVec);
    }
  }

  // ── Jump ────────────────────────────────────────────────────

  jump(initSpeed = -1): void {
    this.wantsToJump = true;
    this.initJumpSpeed = initSpeed;
  }

  // ── Spawn ──────────────────────────────────────────────────

  setSpawn(x: number, y: number, z: number): void {
    this.worldPosition.set(x, y, z);
    this.worldVelocity.set(0, 0, 0);
    this.spawnReady = false;
  }

  checkSpawnReady(): boolean {
    if (this.spawnReady) return true;
    const hasTerrain = this.isSolid(this.worldPosition.x, 1, this.worldPosition.z)
                    || this.isSolid(this.worldPosition.x, 40, this.worldPosition.z);
    if (!hasTerrain) return false;
    for (let y = 100; y > 0; y--) {
      if (this.isSolid(this.worldPosition.x, y, this.worldPosition.z) &&
          !this.isSolid(this.worldPosition.x, y + 1, this.worldPosition.z)) {
        this.worldPosition.y = y + 1;
        break;
      }
    }
    this.spawnReady = true;
    return true;
  }

  // ── Animation ──────────────────────────────────────────────

  /** Play a named animation clip. Returns clip duration. */
  setAnimation(clipName: string, fadeIn: number): number {
    if (!this.character) return 0;

    // Look up from character's action map or asset loader
    const action = this.character.actions.get(clipName);
    if (!action) return 0;

    this.character.mixer.stopAllAction();
    action.fadeIn(fadeIn);
    action.play();
    return action.getClip().duration;
  }

  // ── Core Update ────────────────────────────────────────────

  update(dt: number): CharacterSnapshot {
    if (!this.checkSpawnReady()) return this.getSnapshot();

    if (this.adminFly) return this.updateFly(dt);

    // ── Coyote / jump buffer ──
    this.wasGrounded = this.onGround;
    if (this.coyoteTimer > 0) this.coyoteTimer -= dt;
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

    // ── State update ──
    if (this.charState) this.charState.update(dt);

    // ── Spring simulation ──
    this.springMovement(dt);
    this.springRotation(dt);
    this.rotateModel();

    // ── Animation mixer ──
    if (this.character) this.character.mixer.update(dt);

    // ── Build world velocity from spring output ──
    // Spring gives us "arcade" velocity in local space → transform to world
    const arcadeVel = new THREE.Vector3().copy(this.velocity).multiplyScalar(this.moveSpeed);
    const worldArcade = applyVectorMatrixXZ(this.orientation, arcadeVel);

    if (this.arcadeVelocityIsAdditive) {
      // In air: add arcade influence to existing physics velocity
      this.worldVelocity.x += worldArcade.x * this.arcadeVelocityInfluence.x * dt * 60;
      this.worldVelocity.z += worldArcade.z * this.arcadeVelocityInfluence.z * dt * 60;
    } else {
      // On ground: lerp toward arcade velocity
      this.worldVelocity.x = THREE.MathUtils.lerp(
        this.worldVelocity.x, worldArcade.x, this.arcadeVelocityInfluence.x,
      );
      this.worldVelocity.z = THREE.MathUtils.lerp(
        this.worldVelocity.z, worldArcade.z, this.arcadeVelocityInfluence.z,
      );
    }

    // ── Feet raycast (voxel) ──
    this.feetRaycast();

    // ── Ground handling ──
    if (this.rayHasHit) {
      // Stick to ground
      if (!this.wantsToJump && this.worldVelocity.y <= 0) {
        this.worldVelocity.y = 0;
        this.worldPosition.y = this.lastRayResult.hitPointY;
        this.onGround = true;
      }
    } else {
      this.onGround = false;
    }

    // ── Coyote time ──
    if (this.wasGrounded && !this.onGround) {
      this.coyoteTimer = COYOTE_TIME;
    }

    // ── Jump handling ──
    if (this.wantsToJump) {
      if (this.onGround || this.coyoteTimer > 0) {
        if (this.initJumpSpeed > -1) {
          // Running jump: preserve momentum
          const speed = Math.max(
            this.velocitySimulator.position.length() * 4,
            this.initJumpSpeed,
          );
          this.worldVelocity.x = this.orientation.x * speed;
          this.worldVelocity.z = this.orientation.z * speed;
        }
        this.worldVelocity.y = JUMP_VELOCITY;
        this.onGround = false;
        this.coyoteTimer = 0;
      } else {
        this.jumpBufferTimer = JUMP_BUFFER_TIME;
      }
      this.wantsToJump = false;
    }

    // Buffered jump
    if (this.onGround && this.jumpBufferTimer > 0) {
      this.worldVelocity.y = JUMP_VELOCITY;
      this.onGround = false;
      this.jumpBufferTimer = 0;
    }

    // ── Gravity ──
    if (!this.onGround) {
      this.worldVelocity.y += GRAVITY * dt;
    }

    // ── Save in-air velocity for landing states ──
    if (!this.onGround) {
      this.groundImpactData.velocity.copy(this.worldVelocity);
    }

    // ── AABB swept voxel collision (5 substeps) ──
    this.applySweptCollision(dt);

    // ── Sync Object3D position ──
    this.position.copy(this.worldPosition);
    this.updateMatrixWorld();

    return this.getSnapshot();
  }

  // ── Spring Movement ────────────────────────────────────────

  private springMovement(dt: number): void {
    this.velocitySimulator.target.copy(this.velocityTarget);
    this.velocitySimulator.simulate(dt);
    this.velocity.copy(this.velocitySimulator.position);
    this.acceleration.copy(this.velocitySimulator.velocity);
  }

  // ── Spring Rotation ────────────────────────────────────────

  private springRotation(dt: number): void {
    const angle = getSignedAngleBetweenVectors(this.orientation, this.orientationTarget);
    this.rotationSimulator.target = angle;
    this.rotationSimulator.simulate(dt);
    const rot = this.rotationSimulator.position;
    this.orientation.applyAxisAngle(_Y_AXIS, rot);
    this.angularVelocity = this.rotationSimulator.velocity;
  }

  // ── Model Rotation + Tilt ──────────────────────────────────

  private rotateModel(): void {
    // Face orientation direction
    this.lookAt(
      this.position.x + this.orientation.x,
      this.position.y + this.orientation.y,
      this.position.z + this.orientation.z,
    );
    // Tilt into turns (lean effect)
    const tiltAmount = -this.angularVelocity * 2.3 * this.velocity.length();
    this.tiltContainer.rotation.z = tiltAmount;
    this.tiltContainer.position.setY(
      (Math.cos(Math.abs(tiltAmount)) / 2) - 0.5,
    );
  }

  // ── Feet Raycast (Voxel) ───────────────────────────────────

  private feetRaycast(): void {
    const result = voxelRaycastDown(
      this.worldPosition.x,
      this.worldPosition.y,
      this.worldPosition.z,
      this.rayCastLength + this.raySafeOffset,
      this.isSolid,
    );
    this.rayHasHit = result.hasHit;
    this.lastRayResult = result;
  }

  // ── AABB Swept Collision ───────────────────────────────────

  private static readonly COLLISION_SUBSTEPS = 5;

  private applySweptCollision(dt: number): void {
    const substepDt = dt / SketchCharacter.COLLISION_SUBSTEPS;

    for (let i = 0; i < SketchCharacter.COLLISION_SUBSTEPS; i++) {
      const box = AABB.fromFeet(
        this.worldPosition.x, this.worldPosition.y, this.worldPosition.z,
        PLAYER_WIDTH, PLAYER_HEIGHT,
      );

      const result = box.sweepVoxels(
        this.worldVelocity.x, this.worldVelocity.y, this.worldVelocity.z,
        substepDt, this.isSolid, 1.01,
      );

      this.worldPosition.set(result.x, result.y, result.z);
      this.worldVelocity.x = result.vx;
      this.worldVelocity.y = result.vy;
      this.worldVelocity.z = result.vz;

      if (result.onGround) this.onGround = true;
    }
  }

  // ── Admin Fly ──────────────────────────────────────────────

  private updateFly(dt: number): CharacterSnapshot {
    const speed = this.actions.run.isPressed
      ? this.FLY_SPEED * this.FLY_SPRINT_MULT : this.FLY_SPEED;

    const moveVec = this.getCameraRelativeMovementVector();
    this.worldPosition.x += moveVec.x * speed * dt;
    this.worldPosition.z += moveVec.z * speed * dt;

    const vertSpeed = this.FLY_VERTICAL_SPEED * (this.actions.run.isPressed ? this.FLY_SPRINT_MULT : 1);
    if (this.actions.jump.isPressed) this.worldPosition.y += vertSpeed * dt;
    // Ctrl = descend (we'll handle this via a descend action or direct key)

    this.worldVelocity.set(0, 0, 0);
    this.onGround = false;
    this.position.copy(this.worldPosition);
    this.updateMatrixWorld();

    return this.getSnapshot();
  }

  // ── Snapshot ───────────────────────────────────────────────

  getSnapshot(): CharacterSnapshot {
    const hSpeed = Math.sqrt(
      this.worldVelocity.x ** 2 + this.worldVelocity.z ** 2,
    );
    return {
      position: this.worldPosition,
      velocity: this.worldVelocity,
      yaw: Math.atan2(this.orientation.x, this.orientation.z),
      onGround: this.onGround,
      isMoving: hSpeed > 0.3,
      isSprinting: this.actions.run.isPressed,
      moveSpeed: hSpeed,
      movingBack: this.actions.down.isPressed && !this.actions.up.isPressed,
    };
  }
}

// Reusable
const _Y_AXIS = new THREE.Vector3(0, 1, 0);
