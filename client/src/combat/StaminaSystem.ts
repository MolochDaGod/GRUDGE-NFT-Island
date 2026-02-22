// ═══════════════════════════════════════════════════════════════════
// STAMINA / RESOURCE SYSTEM
// Ported from: epic_fight_weapon_skills.js CLASS_RESOURCES + warrior mechanics
//
// Each class has a different resource:
//   Warrior → Stamina (fills via parries, dodges, blocks)
//   Mage    → Mana (passive regen, spell costs)
//   Ranger  → Focus (combat gains on hit/crit/kill)
//   Worge   → Primal (fast regen, form-shift costs)
//
// All resources share the same interface so combat systems can be
// class-agnostic. Sprint always drains the resource.
// ═══════════════════════════════════════════════════════════════════

import type { PlayerClass } from '@grudge/shared';

// ── Resource Pool Definitions ─────────────────────────────────────

export interface ResourcePoolDef {
  name: string;
  icon: string;
  color: string;
  max: number;
  /** Passive regen per second (always ticking) */
  regenPerSec: number;
  /** Regen per second while in combat (may differ) */
  regenInCombat: number;
}

const RESOURCE_POOLS: Record<string, ResourcePoolDef> = {
  WARRIOR: { name: 'Stamina', icon: '⚡', color: '#cccc33', max: 100, regenPerSec: 5, regenInCombat: 2 },
  MAGE:    { name: 'Mana',    icon: '✦',  color: '#33aacc', max: 100, regenPerSec: 4, regenInCombat: 3 },
  RANGER:  { name: 'Focus',   icon: '◇',  color: '#33aa33', max: 100, regenPerSec: 3, regenInCombat: 0 },
  WORGE:   { name: 'Primal',  icon: '🔥', color: '#cc8833', max: 100, regenPerSec: 6, regenInCombat: 4 },
};

// ── Action Costs ──────────────────────────────────────────────────
// How much resource each action consumes.

export interface ActionCosts {
  attack:      number;
  heavyAttack: number;
  dodge:       number;
  block:       number;  // per second while blocking
  sprint:      number;  // per second while sprinting
  parry:       number;  // cost to initiate a parry
  skill1:      number;
  skill2:      number;
  skill3:      number;
  skill4:      number;
}

const DEFAULT_COSTS: ActionCosts = {
  attack: 10, heavyAttack: 20, dodge: 15,
  block: 5, sprint: 10, parry: 5,
  skill1: 15, skill2: 20, skill3: 30, skill4: 45,
};

const CLASS_COSTS: Record<string, Partial<ActionCosts>> = {
  WARRIOR: { attack: 8,  heavyAttack: 18, dodge: 12, sprint: 10, parry: 5 },
  MAGE:    { attack: 5,  heavyAttack: 15, dodge: 18, sprint: 12, parry: 8, skill1: 20, skill2: 25, skill3: 35, skill4: 50 },
  RANGER:  { attack: 6,  heavyAttack: 12, dodge: 8,  sprint: 6,  parry: 5 },
  WORGE:   { attack: 10, heavyAttack: 22, dodge: 14, sprint: 8,  parry: 6 },
};

// ── Combat Gains ──────────────────────────────────────────────────
// Resource gained from combat actions (mainly Warrior + Ranger)

export interface CombatGains {
  onHit:          number;
  onCrit:         number;
  onKill:         number;
  onPerfectParry: number;
  onNormalParry:  number;
  onPerfectDodge: number;
  onBlock:        number;
}

const DEFAULT_GAINS: CombatGains = {
  onHit: 0, onCrit: 0, onKill: 0,
  onPerfectParry: 0, onNormalParry: 0, onPerfectDodge: 0, onBlock: 0,
};

const CLASS_GAINS: Record<string, Partial<CombatGains>> = {
  WARRIOR: { onPerfectParry: 25, onNormalParry: 10, onPerfectDodge: 15, onBlock: 5, onHit: 3 },
  RANGER:  { onHit: 3, onCrit: 8, onKill: 20, onPerfectParry: 25, onBlock: 0 },
  WORGE:   { onHit: 2, onKill: 15, onPerfectParry: 20, onPerfectDodge: 10 },
};

// ── Stamina System ────────────────────────────────────────────────

export class StaminaSystem {
  private _current: number;
  private _max: number;
  private _pool: ResourcePoolDef;
  private _costs: ActionCosts;
  private _gains: CombatGains;
  private _inCombat = false;
  private _combatTimer = 0; // Seconds since last combat action

  /** How long after last combat action before "out of combat" regen kicks in */
  private readonly COMBAT_TIMEOUT = 5;

  constructor(playerClass: PlayerClass | string = 'WARRIOR') {
    const cls = playerClass.toUpperCase();
    this._pool = RESOURCE_POOLS[cls] ?? RESOURCE_POOLS.WARRIOR;
    this._costs = { ...DEFAULT_COSTS, ...(CLASS_COSTS[cls] ?? {}) };
    this._gains = { ...DEFAULT_GAINS, ...(CLASS_GAINS[cls] ?? {}) };
    this._max = this._pool.max;
    this._current = this._max;
  }

  // ── Public State ────────────────────────────────────────────────

  get current(): number { return this._current; }
  get max(): number { return this._max; }
  get percentage(): number { return this._current / this._max; }
  get poolName(): string { return this._pool.name; }
  get poolIcon(): string { return this._pool.icon; }
  get poolColor(): string { return this._pool.color; }
  get inCombat(): boolean { return this._inCombat; }

  // ── Max Pool Modifier ───────────────────────────────────────────

  /** Adjust max pool based on derived stats (stamina stat from attributes) */
  setMaxFromStats(staminaStat: number): void {
    this._max = this._pool.max + staminaStat;
    this._current = Math.min(this._current, this._max);
  }

  // ── Consumption ─────────────────────────────────────────────────

  /** Check if there's enough resource for an action */
  canAfford(action: keyof ActionCosts): boolean {
    return this._current >= this._costs[action];
  }

  /** Spend resource on an action. Returns false if insufficient. */
  spend(action: keyof ActionCosts): boolean {
    const cost = this._costs[action];
    if (this._current < cost) return false;
    this._current -= cost;
    this.touchCombat();
    return true;
  }

  /** Drain resource per second (for sprint, block hold) */
  drain(action: 'sprint' | 'block', dt: number): boolean {
    const costPerSec = this._costs[action];
    const cost = costPerSec * dt;
    if (this._current < cost) return false;
    this._current -= cost;
    this.touchCombat();
    return true;
  }

  // ── Gains ───────────────────────────────────────────────────────

  /** Award resource for a combat event */
  gain(event: keyof CombatGains): void {
    const amount = this._gains[event];
    if (amount > 0) {
      this._current = Math.min(this._max, this._current + amount);
    }
    this.touchCombat();
  }

  /** Raw gain (e.g., from potions, special abilities) */
  addRaw(amount: number): void {
    this._current = Math.min(this._max, this._current + amount);
  }

  // ── Update (call each frame) ────────────────────────────────────

  update(dt: number): void {
    // Combat timeout
    if (this._inCombat) {
      this._combatTimer += dt;
      if (this._combatTimer >= this.COMBAT_TIMEOUT) {
        this._inCombat = false;
      }
    }

    // Regen
    const regenRate = this._inCombat ? this._pool.regenInCombat : this._pool.regenPerSec;
    if (regenRate > 0 && this._current < this._max) {
      this._current = Math.min(this._max, this._current + regenRate * dt);
    }
  }

  // ── Internal ────────────────────────────────────────────────────

  private touchCombat(): void {
    this._inCombat = true;
    this._combatTimer = 0;
  }

  // ── Debug ───────────────────────────────────────────────────────

  getDebugInfo(): string {
    return `${this._pool.icon} ${Math.floor(this._current)}/${this._max} ${this._inCombat ? '(combat)' : ''}`;
  }
}
