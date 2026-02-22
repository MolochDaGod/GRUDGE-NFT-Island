// ═══════════════════════════════════════════════════════════════════
// PARRY SYSTEM
// Ported from: parry_system.js
//
// Timing-based parry mechanic with two tiers:
//   Perfect Parry (first 200ms): 100% block, stun attacker 2s, riposte
//   Normal Parry (200-800ms):    70% block, minor knockback, riposte (weaker)
//
// Parrying has a 2-second cooldown. Riposte window lasts 2 seconds
// after a successful parry — attacking in that window does bonus damage.
// ═══════════════════════════════════════════════════════════════════

// ── Parry Result ──────────────────────────────────────────────────

export type ParryTier = 'perfect' | 'normal' | 'none';

export interface ParryResult {
  tier: ParryTier;
  /** Damage multiplier applied to incoming hit (0 = fully blocked) */
  damageMultiplier: number;
  /** Duration attacker is stunned (seconds) */
  stunDuration: number;
  /** Whether a riposte opportunity was created */
  riposteAvailable: boolean;
  /** Elemental effect to apply (if weapon has one) */
  element: string | null;
}

export interface RiposteResult {
  success: boolean;
  damageMultiplier: number;
  type: string;
}

// ── Parry Weapon Definitions ──────────────────────────────────────

export interface ParryWeaponDef {
  name: string;
  /** Total parry window in ms */
  parryWindow: number;
  /** Perfect parry window (subset of parryWindow) in ms */
  perfectParryWindow: number;
  /** Elemental type for special effects */
  element: 'shadow' | 'bleed' | 'none';
  /** Riposte type on normal parry */
  riposteAttack: string;
  /** Riposte type on perfect parry */
  perfectRiposte: string;
  /** Normal parry damage reduction (0.7 = 70% blocked) */
  damageReduction: number;
}

/** Default parry stats (no special weapon) */
const DEFAULT_PARRY: ParryWeaponDef = {
  name: 'Parry',
  parryWindow: 800,
  perfectParryWindow: 200,
  element: 'none',
  riposteAttack: 'riposte',
  perfectRiposte: 'perfect_riposte',
  damageReduction: 0.7,
};

/** Named parry weapons from the original system */
export const PARRY_WEAPONS: Record<string, ParryWeaponDef> = {
  shadow_fang: {
    name: 'Shadow Fang',
    parryWindow: 800,
    perfectParryWindow: 200,
    element: 'shadow',
    riposteAttack: 'shadow_riposte',
    perfectRiposte: 'phantom_counter',
    damageReduction: 0.7,
  },
  primal_howl: {
    name: 'Primal Howl',
    parryWindow: 1000,
    perfectParryWindow: 300,
    element: 'bleed',
    riposteAttack: 'savage_riposte',
    perfectRiposte: 'feral_counter',
    damageReduction: 0.7,
  },
};

// ── Parry System ──────────────────────────────────────────────────

export class ParrySystem {
  // State
  private _isParrying = false;
  private _parryStartTime = 0;
  private _cooldownEndTime = 0;
  private _riposteEndTime = 0;
  private _riposteType = '';
  private _activeWeapon: ParryWeaponDef = DEFAULT_PARRY;

  /** Cooldown between parries (ms) */
  private readonly COOLDOWN_MS = 2000;

  /** Riposte window duration (ms) */
  private readonly RIPOSTE_WINDOW_MS = 2000;

  // ── Public State ────────────────────────────────────────────────

  get isParrying(): boolean { return this._isParrying; }
  get isOnCooldown(): boolean { return performance.now() < this._cooldownEndTime; }
  get hasRiposte(): boolean { return performance.now() < this._riposteEndTime; }
  get riposteType(): string { return this._riposteType; }

  get cooldownRemaining(): number {
    return Math.max(0, this._cooldownEndTime - performance.now()) / 1000;
  }

  // ── Parry Weapon ────────────────────────────────────────────────

  /** Set the active parry weapon (or null for default) */
  setParryWeapon(weaponKey: string | null): void {
    this._activeWeapon = weaponKey && PARRY_WEAPONS[weaponKey]
      ? PARRY_WEAPONS[weaponKey]
      : DEFAULT_PARRY;
  }

  // ── Start Parry ─────────────────────────────────────────────────

  /**
   * Begin a parry attempt. Returns false if on cooldown.
   * The parry window auto-closes after the weapon's parryWindow ms.
   */
  startParry(): boolean {
    if (this.isOnCooldown) return false;
    if (this._isParrying) return false;

    this._isParrying = true;
    this._parryStartTime = performance.now();
    return true;
  }

  // ── Process Incoming Damage ─────────────────────────────────────

  /**
   * Called when the player takes damage while the parry window is open.
   * Returns the parry result with damage multiplier and effects.
   */
  processHit(incomingDamage: number): ParryResult {
    if (!this._isParrying) {
      return { tier: 'none', damageMultiplier: 1, stunDuration: 0, riposteAvailable: false, element: null };
    }

    const now = performance.now();
    const elapsed = now - this._parryStartTime;
    const weapon = this._activeWeapon;

    // Close the parry window
    this.endParryWindow(true);

    // Perfect parry?
    if (elapsed <= weapon.perfectParryWindow) {
      this._riposteEndTime = now + this.RIPOSTE_WINDOW_MS;
      this._riposteType = weapon.perfectRiposte;
      return {
        tier: 'perfect',
        damageMultiplier: 0,          // Full block
        stunDuration: 2.0,            // 2s stun on attacker
        riposteAvailable: true,
        element: weapon.element !== 'none' ? weapon.element : null,
      };
    }

    // Normal parry (within full window)
    if (elapsed <= weapon.parryWindow) {
      this._riposteEndTime = now + 1500; // Shorter window for normal parry
      this._riposteType = weapon.riposteAttack;
      return {
        tier: 'normal',
        damageMultiplier: 1 - weapon.damageReduction,  // 30% damage taken
        stunDuration: 0.5,                               // Brief stagger
        riposteAvailable: true,
        element: weapon.element !== 'none' ? weapon.element : null,
      };
    }

    // Missed the window (shouldn't happen if auto-close works, but safety)
    return { tier: 'none', damageMultiplier: 1, stunDuration: 0, riposteAvailable: false, element: null };
  }

  // ── Riposte ─────────────────────────────────────────────────────

  /**
   * Attempt a riposte attack. Returns the riposte result.
   * Call this when the player attacks during the riposte window.
   */
  attemptRiposte(): RiposteResult {
    if (!this.hasRiposte) {
      return { success: false, damageMultiplier: 1, type: '' };
    }

    const type = this._riposteType;
    this._riposteEndTime = 0; // Consume the riposte

    // Riposte damage multipliers by type
    const multipliers: Record<string, number> = {
      riposte: 1.5,
      perfect_riposte: 2.0,
      shadow_riposte: 2.5,
      phantom_counter: 3.0,
      savage_riposte: 2.2,
      feral_counter: 2.8,
    };

    return {
      success: true,
      damageMultiplier: multipliers[type] ?? 1.5,
      type,
    };
  }

  // ── Update (call each frame) ────────────────────────────────────

  update(_dt: number): void {
    if (!this._isParrying) return;

    const elapsed = performance.now() - this._parryStartTime;
    if (elapsed >= this._activeWeapon.parryWindow) {
      this.endParryWindow(false);
    }
  }

  // ── Internal ────────────────────────────────────────────────────

  private endParryWindow(wasSuccessful: boolean): void {
    if (!this._isParrying) return;
    this._isParrying = false;
    this._cooldownEndTime = performance.now() + this.COOLDOWN_MS;

    if (!wasSuccessful) {
      // Failed parry — no riposte
    }
  }

  // ── Debug ───────────────────────────────────────────────────────

  getDebugInfo(): string {
    if (this._isParrying) {
      const elapsed = Math.floor(performance.now() - this._parryStartTime);
      return `PARRYING ${elapsed}ms/${this._activeWeapon.parryWindow}ms`;
    }
    if (this.hasRiposte) return `RIPOSTE (${this._riposteType})`;
    if (this.isOnCooldown) return `CD ${this.cooldownRemaining.toFixed(1)}s`;
    return 'ready';
  }
}
