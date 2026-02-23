// ═══════════════════════════════════════════════════════════════════
// COMBAT SYSTEM — Orchestrator
//
// Central hub that connects:
//   StaminaSystem  — gates actions by resource cost
//   ParrySystem    — timing-based parry with riposte windows
//   CombatFormulas — shared damage / stat calculation
//   AnimStateMachine — animation state triggers
//
// The game loop calls combatSystem.update() each frame between
// CharacterController and AnimStateMachine. This system decides
// whether combat inputs are allowed (stamina gate), manages health,
// and processes incoming/outgoing damage.
//
// FLOW:  InputManager → Controller → CombatSystem → AnimStateMachine
// ═══════════════════════════════════════════════════════════════════

import { ParrySystem } from './ParrySystem.js';
import type { ParryResult, RiposteResult } from './ParrySystem.js';
import { StaminaSystem } from './StaminaSystem.js';
import type { CombatInput } from '../input/InputManager.js';
import type { ControllerState } from '../entities/CharacterController.js';
import {
  calculateDerivedStats, calculateDamage, createEmptyAttributes,
  BASE_STATS,
} from '@grudge/shared';
import type { DerivedStats, AttributeMap } from '@grudge/shared';

// ── Combat Events (emitted for UI / sound / VFX) ─────────────────

export type CombatEventType =
  | 'attack'      // Player swung
  | 'dodge'       // Player dodged
  | 'block_start' // Block began
  | 'block_end'   // Block released
  | 'parry'       // Parry attempt started
  | 'perfect_parry'
  | 'normal_parry'
  | 'riposte'     // Riposte triggered
  | 'hit_taken'   // Player took damage
  | 'hit_dealt'   // Player dealt damage
  | 'stamina_fail' // Action rejected — not enough resource
  | 'death';

export interface CombatEvent {
  type: CombatEventType;
  value?: number;   // damage amount, etc.
  detail?: string;  // extra info (parry tier, riposte type, etc.)
}

// ── Combat State Snapshot ─────────────────────────────────────────

export interface CombatState {
  /** Current health */
  health: number;
  maxHealth: number;

  /** Resource (stamina/mana/focus/primal) */
  resource: number;
  maxResource: number;
  resourceName: string;
  resourceIcon: string;
  resourceColor: string;

  /** Was a combat action allowed this frame? (gates anim input) */
  attackAllowed: boolean;
  dodgeAllowed: boolean;
  blockAllowed: boolean;
  castAllowed: boolean;

  /** Was the player hit this frame? */
  wasHit: boolean;
  /** Is the player dead? */
  isDead: boolean;
  /** Is the player actively blocking? */
  isBlocking: boolean;
  /** Is the player in a parry window? */
  isParrying: boolean;
  /** Is a riposte available? */
  hasRiposte: boolean;

  /** Events that occurred this frame (for UI/SFX) */
  events: CombatEvent[];
}

// ── Combat System ─────────────────────────────────────────────────

export class CombatSystem {
  // Sub-systems
  readonly stamina: StaminaSystem;
  readonly parry: ParrySystem;

  // Player stats
  private _attributes: AttributeMap;
  private _derivedStats: DerivedStats;
  private _health: number;
  private _maxHealth: number;
  private _isDead = false;

  // Per-frame state
  private _isBlocking = false;
  private _wasBlockingLastFrame = false;
  private _events: CombatEvent[] = [];

  // Gated action results (read by main.ts to feed AnimationInput)
  private _attackAllowed = false;
  private _dodgeAllowed = false;
  private _blockAllowed = false;
  private _castAllowed = false;
  private _wasHit = false;

  // Weapon base damage (set externally when equipping weapons)
  private _weaponBaseDamage = 10;

  constructor(playerClass: string = 'WARRIOR', attributes?: AttributeMap) {
    this.stamina = new StaminaSystem(playerClass);
    this.parry = new ParrySystem();

    this._attributes = attributes ?? createEmptyAttributes();
    this._derivedStats = calculateDerivedStats(this._attributes);

    // Initialize health from derived stats
    this._maxHealth = this._derivedStats.health;
    this._health = this._maxHealth;

    // Sync stamina max from derived stats
    this.stamina.setMaxFromStats(this._derivedStats.stamina);
  }

  // ── Public State ────────────────────────────────────────────────

  get health(): number { return this._health; }
  get maxHealth(): number { return this._maxHealth; }
  get isDead(): boolean { return this._isDead; }
  get isBlocking(): boolean { return this._isBlocking; }
  get derivedStats(): DerivedStats { return this._derivedStats; }

  // ── Attribute / Stat Updates ────────────────────────────────────

  /** Recalculate all derived stats from new attribute allocation */
  setAttributes(attributes: AttributeMap): void {
    this._attributes = { ...attributes };
    this._derivedStats = calculateDerivedStats(this._attributes);
    this._maxHealth = this._derivedStats.health;
    this._health = Math.min(this._health, this._maxHealth);
    this.stamina.setMaxFromStats(this._derivedStats.stamina);
  }

  /** Set weapon base damage (called when equipping a weapon) */
  setWeaponDamage(baseDamage: number): void {
    this._weaponBaseDamage = baseDamage;
  }

  /** Set parry weapon profile (called when equipping a weapon) */
  setParryWeapon(weaponKey: string | null): void {
    this.parry.setParryWeapon(weaponKey);
  }

  // ── Core Update (call every frame) ─────────────────────────────

  /**
   * Process combat logic for one frame.
   * Call between CharacterController.update() and AnimStateMachine.update().
   *
   * @returns CombatState snapshot used to modify AnimationInput
   */
  update(dt: number, combat: CombatInput, controller: ControllerState): CombatState {
    // Reset per-frame state
    this._events = [];
    this._attackAllowed = false;
    this._dodgeAllowed = false;
    this._blockAllowed = false;
    this._castAllowed = false;
    this._wasHit = false;
    this._wasBlockingLastFrame = this._isBlocking;

    if (this._isDead) {
      return this.getState();
    }

    // ── 1. Update sub-system timers ──
    this.stamina.update(dt);
    this.parry.update(dt);

    // ── 2. Sprint stamina drain ──
    if (controller.isSprinting && controller.isMoving) {
      if (!this.stamina.drain('sprint', dt)) {
        // Out of stamina — sprint should fail
        // (CharacterController reads this externally if needed)
      }
    }

    // ── 3. Block / Parry logic ──
    //   RMB held = block. RMB + attack = parry attempt.
    if (combat.blockHeld && controller.onGround) {
      // Parry: block + attack on same frame
      if (combat.attackPressed && this.stamina.canAfford('parry')) {
        this.stamina.spend('parry');
        const started = this.parry.startParry();
        if (started) {
          this._events.push({ type: 'parry' });
          // Parry overrides block for this frame
          this._isBlocking = false;
          this._attackAllowed = false;
        }
      } else {
        // Sustained block — drain per second
        if (this.stamina.drain('block', dt)) {
          this._isBlocking = true;
          this._blockAllowed = true;
          if (!this._wasBlockingLastFrame) {
            this._events.push({ type: 'block_start' });
          }
        } else {
          // Can't afford to keep blocking
          this._isBlocking = false;
          this._events.push({ type: 'stamina_fail', detail: 'block' });
        }
      }
    } else {
      // Released block
      if (this._wasBlockingLastFrame) {
        this._events.push({ type: 'block_end' });
      }
      this._isBlocking = false;
    }

    // ── 4. Attack (only if not blocking/parrying) ──
    if (combat.attackPressed && !this._isBlocking && !this.parry.isParrying) {
      // Check for riposte first (attacks during riposte window get bonus)
      if (this.parry.hasRiposte) {
        const riposte = this.parry.attemptRiposte();
        if (riposte.success) {
          this._attackAllowed = true;
          this._events.push({
            type: 'riposte',
            value: riposte.damageMultiplier,
            detail: riposte.type,
          });
        }
      } else if (this.stamina.canAfford('attack')) {
        this.stamina.spend('attack');
        this._attackAllowed = true;
        this._events.push({ type: 'attack' });
      } else {
        this._events.push({ type: 'stamina_fail', detail: 'attack' });
      }
    }

    // ── 5. Dodge ──
    if (combat.dodgePressed && controller.onGround) {
      if (this.stamina.canAfford('dodge')) {
        this.stamina.spend('dodge');
        this._dodgeAllowed = true;
        this._events.push({ type: 'dodge' });
      } else {
        this._events.push({ type: 'stamina_fail', detail: 'dodge' });
      }
    }

    // ── 6. Cast ──
    if (combat.castPressed && controller.onGround) {
      if (this.stamina.canAfford('skill1')) {
        this.stamina.spend('skill1');
        this._castAllowed = true;
      } else {
        this._events.push({ type: 'stamina_fail', detail: 'cast' });
      }
    }

    // ── 7. Health regen (out of combat) ──
    if (!this.stamina.inCombat && this._health < this._maxHealth) {
      this._health = Math.min(
        this._maxHealth,
        this._health + this._derivedStats.healthRegen * dt,
      );
    }

    return this.getState();
  }

  // ── Incoming Damage ─────────────────────────────────────────────

  /**
   * Process an incoming hit against this player.
   * Routes through parry → block → CombatFormulas damage calc.
   *
   * Call this from HitboxSystem or server reconciliation.
   */
  receiveHit(attackerStats: DerivedStats, weaponBaseDamage: number): {
    finalDamage: number;
    parryResult: ParryResult;
    blocked: boolean;
  } {
    // 1. Check parry
    const parryResult = this.parry.processHit(weaponBaseDamage);

    if (parryResult.tier === 'perfect') {
      this.stamina.gain('onPerfectParry');
      this._events.push({ type: 'perfect_parry', value: 0 });
      return { finalDamage: 0, parryResult, blocked: false };
    }

    if (parryResult.tier === 'normal') {
      this.stamina.gain('onNormalParry');
      // Partial damage gets through
      const reduced = weaponBaseDamage * parryResult.damageMultiplier;
      this.applyDamage(reduced);
      this._events.push({ type: 'normal_parry', value: reduced });
      return { finalDamage: reduced, parryResult, blocked: false };
    }

    // 2. Check block
    if (this._isBlocking) {
      this.stamina.gain('onBlock');
      // Block reduces damage by block stat percentage
      const blockReduction = Math.min(this._derivedStats.block / 100, 0.8);
      const blocked = weaponBaseDamage * blockReduction;
      const remaining = weaponBaseDamage - blocked;

      // Run remaining through full damage calc
      const result = calculateDamage(attackerStats, this._derivedStats, remaining);
      this.applyDamage(result.finalDamage);
      this._events.push({ type: 'hit_taken', value: result.finalDamage, detail: 'blocked' });
      return { finalDamage: result.finalDamage, parryResult, blocked: true };
    }

    // 3. Full damage calc (no parry, no block)
    const result = calculateDamage(attackerStats, this._derivedStats, weaponBaseDamage);

    if (result.isHit) {
      this.applyDamage(result.finalDamage);
      this._wasHit = true;
      this._events.push({ type: 'hit_taken', value: result.finalDamage });
    }

    return { finalDamage: result.finalDamage, parryResult, blocked: false };
  }

  /**
   * Calculate outgoing damage from this player to a target.
   * Uses riposte multiplier if active.
   */
  calculateOutgoingDamage(
    defenderStats: DerivedStats,
    riposteMultiplier = 1,
  ): { finalDamage: number; isCrit: boolean; isHit: boolean } {
    const result = calculateDamage(
      this._derivedStats,
      defenderStats,
      this._weaponBaseDamage,
      { damageMultiplier: riposteMultiplier },
    );

    if (result.isHit) {
      // Award stamina on hit
      this.stamina.gain('onHit');
      if (result.isCrit) {
        this.stamina.gain('onCrit');
      }
      this._events.push({ type: 'hit_dealt', value: result.finalDamage });
    }

    return {
      finalDamage: result.finalDamage,
      isCrit: result.isCrit,
      isHit: result.isHit,
    };
  }

  /** Award kill resource gain */
  onKill(): void {
    this.stamina.gain('onKill');
  }

  // ── Health Management ───────────────────────────────────────────

  private applyDamage(amount: number): void {
    this._health = Math.max(0, this._health - amount);
    this._wasHit = true;
    if (this._health <= 0) {
      this._isDead = true;
      this._events.push({ type: 'death' });
    }
  }

  /** Heal the player (potions, abilities, etc.) */
  heal(amount: number): void {
    if (this._isDead) return;
    this._health = Math.min(this._maxHealth, this._health + amount);
  }

  /** Respawn — reset health and resource */
  respawn(): void {
    this._health = this._maxHealth;
    this._isDead = false;
    this._isBlocking = false;
    this.stamina.addRaw(this.stamina.max);
  }

  // ── State Snapshot ──────────────────────────────────────────────

  getState(): CombatState {
    return {
      health: this._health,
      maxHealth: this._maxHealth,
      resource: this.stamina.current,
      maxResource: this.stamina.max,
      resourceName: this.stamina.poolName,
      resourceIcon: this.stamina.poolIcon,
      resourceColor: this.stamina.poolColor,
      attackAllowed: this._attackAllowed,
      dodgeAllowed: this._dodgeAllowed,
      blockAllowed: this._blockAllowed,
      castAllowed: this._castAllowed,
      wasHit: this._wasHit,
      isDead: this._isDead,
      isBlocking: this._isBlocking,
      isParrying: this.parry.isParrying,
      hasRiposte: this.parry.hasRiposte,
      events: this._events,
    };
  }

  // ── Debug ───────────────────────────────────────────────────────

  getDebugInfo(): string {
    const hp = `HP:${Math.floor(this._health)}/${this._maxHealth}`;
    const res = this.stamina.getDebugInfo();
    const par = this.parry.getDebugInfo();
    const blk = this._isBlocking ? ' BLOCK' : '';
    return `${hp} ${res} parry=${par}${blk}`;
  }
}
