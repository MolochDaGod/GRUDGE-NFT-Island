// ═══════════════════════════════════════════════════════════════════
// ENTITY MANAGER
//
// Central registry for all world entities: remote players, NPCs,
// and mobs. Each entity owns a Three.js Group, an optional
// AnimationStateMachine, a CombatSystem, and a hurtbox.
//
// The game loop calls entityManager.update() each frame to:
//   1. Interpolate network positions smoothly
//   2. Tick animation state machines
//   3. Update hurtbox positions for the HitboxSystem
//   4. Frustum-cull distant entities
//
// FLOW:
//   WebSocket → EntityManager.spawn/updateState/despawn
//   Game loop → EntityManager.update(dt, camera)
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { AnimationStateMachine, AnimState } from './AnimationStateMachine.js';
import type { AnimationInput } from './AnimationStateMachine.js';
import type { LoadedCharacter } from '../assets/AssetLoader.js';
import { assetLoader } from '../assets/AssetLoader.js';
import type { HitboxSystem } from '../combat/HitboxSystem.js';

// ── Entity Types ──────────────────────────────────────────────────

export type EntityType = 'player' | 'npc' | 'mob';

export interface EntityState {
  position: { x: number; y: number; z: number };
  yaw: number;
  health: number;
  maxHealth: number;
  animState?: string;
  /** Server timestamp of this snapshot (ms) */
  timestamp?: number;
}

// ── Entity ────────────────────────────────────────────────────────

export class Entity {
  readonly id: string;
  readonly type: EntityType;
  readonly group: THREE.Group;

  // Display
  name: string;
  level = 1;
  faction = 'NEUTRAL';
  race = 'human';

  // Health
  health = 250;
  maxHealth = 250;

  // Animation
  character: LoadedCharacter | null = null;
  animSM: AnimationStateMachine | null = null;

  // Network interpolation — two most recent server snapshots
  private prevSnapshot: EntityState | null = null;
  private nextSnapshot: EntityState | null = null;
  private interpElapsed = 0;
  /** Expected time between snapshots (seconds) — matches server broadcast rate */
  private interpDuration = 0.1; // 10 Hz default, updated dynamically

  // Current interpolated values
  readonly position = new THREE.Vector3();
  yaw = 0;

  // Hurtbox
  readonly hurtboxRadius = 0.5;

  // Visibility
  visible = true;

  constructor(id: string, type: EntityType, name: string) {
    this.id = id;
    this.type = type;
    this.name = name;
    this.group = new THREE.Group();
    this.group.name = `entity_${id}`;
  }

  // ── Model Attachment ────────────────────────────────────────

  /** Attach a loaded character model + animation state machine */
  attachCharacter(char: LoadedCharacter): void {
    // Remove any existing children
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    this.group.add(char.group);
    this.character = char;
    this.animSM = new AnimationStateMachine(char);
  }

  /** Attach a simple placeholder mesh (used before model loads) */
  attachPlaceholder(): void {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 1.2, 4, 8),
      new THREE.MeshLambertMaterial({ color: 0xcc6633 }),
    );
    body.position.y = 0.9;
    body.castShadow = true;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0xddaa77 }),
    );
    head.position.y = 1.7;
    head.castShadow = true;

    this.group.add(body, head);
  }

  // ── Network State Push ──────────────────────────────────────

  /**
   * Receive a new state snapshot from the server.
   * Shifts the old "next" into "prev" and sets the new one.
   */
  pushState(state: EntityState): void {
    // Dynamically estimate snapshot interval
    if (this.nextSnapshot?.timestamp && state.timestamp) {
      const dt = (state.timestamp - this.nextSnapshot.timestamp) / 1000;
      if (dt > 0.01 && dt < 1.0) {
        // Smooth the estimate
        this.interpDuration = this.interpDuration * 0.7 + dt * 0.3;
      }
    }

    this.prevSnapshot = this.nextSnapshot;
    this.nextSnapshot = state;
    this.interpElapsed = 0;

    // Update health from server
    this.health = state.health;
    this.maxHealth = state.maxHealth;

    // If we don't have a previous snapshot yet, teleport
    if (!this.prevSnapshot) {
      this.position.set(state.position.x, state.position.y, state.position.z);
      this.yaw = state.yaw;
      this.group.position.copy(this.position);
      this.group.rotation.y = this.yaw;
    }
  }

  // ── Update (called every frame) ─────────────────────────────

  update(dt: number): void {
    // 1. Interpolate position between snapshots
    this.interpolate(dt);

    // 2. Sync group transform
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;

    // 3. Tick animation
    if (this.animSM) {
      const animInput = this.buildAnimInput();
      this.animSM.update(dt, animInput);
    }
  }

  private interpolate(dt: number): void {
    if (!this.prevSnapshot || !this.nextSnapshot) return;

    this.interpElapsed += dt;
    // Allow slight extrapolation (up to 1.2×) for smoothness
    const t = Math.min(this.interpElapsed / this.interpDuration, 1.2);

    const prev = this.prevSnapshot;
    const next = this.nextSnapshot;

    this.position.set(
      prev.position.x + (next.position.x - prev.position.x) * t,
      prev.position.y + (next.position.y - prev.position.y) * t,
      prev.position.z + (next.position.z - prev.position.z) * t,
    );

    // Yaw interpolation (handle wrap-around)
    let yawDiff = next.yaw - prev.yaw;
    if (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.yaw = prev.yaw + yawDiff * Math.min(t, 1.0);
  }

  /** Derive AnimationInput from network state (simplified for remote entities) */
  private buildAnimInput(): AnimationInput {
    const dx = this.nextSnapshot
      ? this.nextSnapshot.position.x - (this.prevSnapshot?.position.x ?? this.nextSnapshot.position.x)
      : 0;
    const dz = this.nextSnapshot
      ? this.nextSnapshot.position.z - (this.prevSnapshot?.position.z ?? this.nextSnapshot.position.z)
      : 0;
    const moveSpeed = Math.sqrt(dx * dx + dz * dz) / this.interpDuration;

    return {
      moveSpeed,
      movingBack: false,
      sprinting: moveSpeed > 8,
      onGround: true,        // Assume grounded (server doesn't send airborne yet)
      velocityY: 0,
      attackPressed: false,   // Server will send explicit anim state later
      blockHeld: false,
      dodgePressed: false,
      castPressed: false,
      isDead: this.health <= 0,
      wasHit: false,
    };
  }

  // ── Query ───────────────────────────────────────────────────

  /** Distance to a world position (horizontal only) */
  distanceTo(pos: THREE.Vector3): number {
    const dx = this.position.x - pos.x;
    const dz = this.position.z - pos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** Distance to a world position (3D) */
  distance3D(pos: THREE.Vector3): number {
    return this.position.distanceTo(pos);
  }

  get isDead(): boolean { return this.health <= 0; }
}

// ── Entity Manager ────────────────────────────────────────────────

export class EntityManager {
  private entities = new Map<string, Entity>();
  private scene: THREE.Scene;
  private hitboxSystem: HitboxSystem | null = null;

  /** Frustum for visibility culling */
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Connect to the hitbox system for auto-managing hurtboxes */
  setHitboxSystem(hbs: HitboxSystem): void {
    this.hitboxSystem = hbs;
  }

  // ── Spawn / Despawn ─────────────────────────────────────────

  /**
   * Spawn a new entity into the world.
   * Immediately creates a placeholder model; real model loads async.
   */
  spawn(
    id: string,
    type: EntityType,
    name: string,
    initialState: EntityState,
    race = 'human',
  ): Entity {
    // Don't double-spawn
    if (this.entities.has(id)) {
      return this.entities.get(id)!;
    }

    const entity = new Entity(id, type, name);
    entity.race = race;
    entity.pushState(initialState);
    entity.attachPlaceholder();

    this.entities.set(id, entity);
    this.scene.add(entity.group);

    // Register hurtbox
    this.hitboxSystem?.registerHurtbox(id, entity.position, entity.hurtboxRadius);

    // Async: load real character model
    this.loadEntityModel(entity, race);

    return entity;
  }

  /** Remove an entity from the world */
  despawn(id: string): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    this.scene.remove(entity.group);
    this.hitboxSystem?.removeHurtbox(id);
    this.entities.delete(id);
  }

  /** Push a new state snapshot for an entity (from server) */
  updateState(id: string, state: EntityState): void {
    const entity = this.entities.get(id);
    if (entity) {
      entity.pushState(state);
    }
  }

  // ── Update (call every frame) ───────────────────────────────

  update(dt: number, camera: THREE.Camera): void {
    // Update frustum for culling
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    for (const entity of this.entities.values()) {
      entity.update(dt);

      // Update hurtbox position
      this.hitboxSystem?.updateHurtbox(entity.id, entity.position);

      // Frustum culling
      const inFrustum = this.frustum.containsPoint(entity.position);
      const closeEnough = entity.distance3D(camera.position as THREE.Vector3) < 200;
      entity.visible = inFrustum || closeEnough;
      entity.group.visible = entity.visible;
    }
  }

  // ── Queries ─────────────────────────────────────────────────

  get(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  /** Get all entities */
  getAll(): Entity[] {
    return Array.from(this.entities.values());
  }

  /** Get entities within a distance of a point, sorted by distance */
  getNearby(pos: THREE.Vector3, maxDist: number): Entity[] {
    const result: Entity[] = [];
    for (const entity of this.entities.values()) {
      if (entity.distanceTo(pos) <= maxDist) {
        result.push(entity);
      }
    }
    result.sort((a, b) => a.distanceTo(pos) - b.distanceTo(pos));
    return result;
  }

  /** Number of active entities */
  get count(): number { return this.entities.size; }

  // ── Internal ────────────────────────────────────────────────

  private async loadEntityModel(entity: Entity, race: string): Promise<void> {
    try {
      const char = await assetLoader.loadToonCharacter(race as any);

      // Entity may have been despawned while loading
      if (!this.entities.has(entity.id)) return;

      entity.attachCharacter(char);
    } catch (e) {
      console.warn(`[EntityManager] Failed to load model for ${entity.id}:`, e);
      // Keep placeholder — it's already attached
    }
  }

  // ── Debug ───────────────────────────────────────────────────

  getDebugInfo(): string {
    return `Entities: ${this.entities.size}`;
  }
}
