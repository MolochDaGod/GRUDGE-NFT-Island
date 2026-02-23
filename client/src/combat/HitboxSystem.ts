// ═══════════════════════════════════════════════════════════════════
// HITBOX / HURTBOX SYSTEM
//
// Manages timed hitbox activation windows tied to attack animations.
// Uses sphere overlap tests against nearby entities to detect hits,
// then feeds damage results into the CombatSystem.
//
// PATTERN:
//   1. AnimStateMachine triggers an attack → creates a HitboxRequest
//   2. HitboxSystem activates spheres at defined offsets during
//      the attack's active frames
//   3. Each frame, overlap tests run against all hurtboxes
//   4. On hit, CombatSystem.receiveHit() is called on the target
//
// Hitboxes are defined per attack animation with:
//   - startTime / endTime (seconds into the animation)
//   - offset from character origin
//   - radius
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';

// ── Hitbox Definitions ────────────────────────────────────────────

export interface HitboxDef {
  /** Offset from the character's root position (local space) */
  offset: THREE.Vector3;
  /** Sphere radius (world units) */
  radius: number;
  /** When the hitbox becomes active (seconds into the animation) */
  startTime: number;
  /** When the hitbox deactivates (seconds into the animation) */
  endTime: number;
  /** Damage multiplier for this hitbox (1.0 = normal, >1 = heavy hit) */
  damageMultiplier: number;
}

/** Hitbox definitions per attack animation name */
export interface AttackDef {
  hitboxes: HitboxDef[];
  /** Can this attack hit the same target multiple times? */
  multiHit: boolean;
}

// ── Default Attack Hitbox Timings ─────────────────────────────────

const DEFAULT_ATTACKS: Record<string, AttackDef> = {
  attack_1: {
    hitboxes: [{
      offset: new THREE.Vector3(0, 1.0, -0.8),
      radius: 0.8,
      startTime: 0.15,
      endTime: 0.35,
      damageMultiplier: 1.0,
    }],
    multiHit: false,
  },
  attack_2: {
    hitboxes: [{
      offset: new THREE.Vector3(0, 1.0, -0.9),
      radius: 0.9,
      startTime: 0.12,
      endTime: 0.30,
      damageMultiplier: 1.1,
    }],
    multiHit: false,
  },
  attack_3: {
    hitboxes: [{
      offset: new THREE.Vector3(0, 1.2, -0.7),
      radius: 1.0,
      startTime: 0.20,
      endTime: 0.45,
      damageMultiplier: 1.3,
    }],
    multiHit: false,
  },
  combo_1: {
    hitboxes: [
      {
        offset: new THREE.Vector3(0, 1.0, -1.0),
        radius: 1.2,
        startTime: 0.10,
        endTime: 0.30,
        damageMultiplier: 1.5,
      },
      {
        // Second sweep
        offset: new THREE.Vector3(0.5, 0.8, -0.8),
        radius: 1.0,
        startTime: 0.35,
        endTime: 0.50,
        damageMultiplier: 1.2,
      },
    ],
    multiHit: true,
  },
  dodge: { hitboxes: [], multiHit: false },
};

// ── Hurtbox (target bounding volume) ──────────────────────────────

export interface Hurtbox {
  /** Unique entity ID */
  entityId: string;
  /** World-space center position */
  position: THREE.Vector3;
  /** Bounding sphere radius */
  radius: number;
}

// ── Hit Result ────────────────────────────────────────────────────

export interface HitResult {
  entityId: string;
  hitboxIndex: number;
  damageMultiplier: number;
  hitPosition: THREE.Vector3;
}

// ── Active Hitbox Instance ────────────────────────────────────────

interface ActiveHitbox {
  def: AttackDef;
  elapsed: number;
  /** Entity IDs already hit this swing (prevents double-hit) */
  hitEntities: Set<string>;
  /** Yaw of the attacker when attack started */
  attackerYaw: number;
}

// ── Hitbox System ─────────────────────────────────────────────────

export class HitboxSystem {
  private active: ActiveHitbox | null = null;
  private hurtboxes: Hurtbox[] = [];

  /** Accumulated hit results for this frame (consumed by game loop) */
  private frameHits: HitResult[] = [];

  // Reusable vectors to avoid GC
  private _worldPos = new THREE.Vector3();
  private _hitPoint = new THREE.Vector3();

  // ── Hurtbox Registration ──────────────────────────────────────

  /** Register a target entity's hurtbox for overlap testing */
  registerHurtbox(entityId: string, position: THREE.Vector3, radius = 0.5): void {
    // Update existing or add new
    const existing = this.hurtboxes.find(h => h.entityId === entityId);
    if (existing) {
      existing.position.copy(position);
      existing.radius = radius;
    } else {
      this.hurtboxes.push({ entityId, position: position.clone(), radius });
    }
  }

  /** Remove a hurtbox (entity left range or died) */
  removeHurtbox(entityId: string): void {
    const idx = this.hurtboxes.findIndex(h => h.entityId === entityId);
    if (idx >= 0) this.hurtboxes.splice(idx, 1);
  }

  /** Update a hurtbox position (call each frame for moving entities) */
  updateHurtbox(entityId: string, position: THREE.Vector3): void {
    const h = this.hurtboxes.find(hb => hb.entityId === entityId);
    if (h) h.position.copy(position);
  }

  // ── Attack Activation ─────────────────────────────────────────

  /**
   * Start a hitbox check for an attack animation.
   * Call this when the AnimStateMachine transitions to an attack state.
   */
  startAttack(animName: string, attackerYaw: number): void {
    const def = DEFAULT_ATTACKS[animName];
    if (!def || def.hitboxes.length === 0) return;

    this.active = {
      def,
      elapsed: 0,
      hitEntities: new Set(),
      attackerYaw,
    };
  }

  /** Register a custom attack definition (for weapon-specific hitboxes) */
  registerAttack(animName: string, def: AttackDef): void {
    DEFAULT_ATTACKS[animName] = def;
  }

  /** Cancel the current attack (e.g., if interrupted by a stagger) */
  cancelAttack(): void {
    this.active = null;
  }

  // ── Update (call every physics tick) ──────────────────────────

  /**
   * Advance hitbox timers and run overlap tests.
   * @param dt         Fixed timestep delta
   * @param attackerPos World position of the attacker
   * @param attackerYaw Current yaw (may have changed since attack started)
   * @returns Array of hit results for this frame
   */
  update(
    dt: number,
    attackerPos: THREE.Vector3,
    attackerYaw: number,
  ): HitResult[] {
    this.frameHits.length = 0;

    if (!this.active) return this.frameHits;

    this.active.elapsed += dt;

    // Check each hitbox in the attack
    for (let i = 0; i < this.active.def.hitboxes.length; i++) {
      const hb = this.active.def.hitboxes[i];

      // Is this hitbox in its active window?
      if (this.active.elapsed < hb.startTime || this.active.elapsed > hb.endTime) {
        continue;
      }

      // Compute world-space hitbox position (offset rotated by attacker yaw)
      const yaw = this.active.attackerYaw;
      this._worldPos.set(
        attackerPos.x + hb.offset.x * Math.cos(yaw) - hb.offset.z * Math.sin(yaw),
        attackerPos.y + hb.offset.y,
        attackerPos.z + hb.offset.x * Math.sin(yaw) + hb.offset.z * Math.cos(yaw),
      );

      // Test overlap against all hurtboxes
      for (const target of this.hurtboxes) {
        // Skip already-hit targets (unless multiHit)
        if (!this.active.def.multiHit && this.active.hitEntities.has(target.entityId)) {
          continue;
        }

        const dist = this._worldPos.distanceTo(target.position);
        if (dist < hb.radius + target.radius) {
          // HIT!
          this.active.hitEntities.add(target.entityId);
          this._hitPoint.lerpVectors(this._worldPos, target.position, 0.5);

          this.frameHits.push({
            entityId: target.entityId,
            hitboxIndex: i,
            damageMultiplier: hb.damageMultiplier,
            hitPosition: this._hitPoint.clone(),
          });
        }
      }
    }

    // Check if the attack is fully finished (past all hitbox end times)
    const maxEnd = Math.max(...this.active.def.hitboxes.map(h => h.endTime));
    if (this.active.elapsed > maxEnd + 0.1) {
      this.active = null;
    }

    return this.frameHits;
  }

  // ── Query ───────────────────────────────────────────────────────

  /** Is an attack currently active? */
  get isActive(): boolean { return this.active !== null; }

  /** How many hurtboxes are registered? */
  get hurtboxCount(): number { return this.hurtboxes.length; }

  // ── Debug ───────────────────────────────────────────────────────

  getDebugInfo(): string {
    if (!this.active) return 'idle';
    const t = this.active.elapsed.toFixed(2);
    return `atk ${t}s hits=${this.active.hitEntities.size} targets=${this.hurtboxes.length}`;
  }
}
