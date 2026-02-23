// ═══════════════════════════════════════════════════════════════════
// ANIMATION STATE MACHINE
// State-driven animation blending for souls-like combat.
//
// PATTERN: Each state declares its clip name, loop mode, blend-in
// duration, and whether it can be interrupted. The machine evaluates
// conditions every frame and crossfades between states automatically.
//
// Weapon packs can be hot-swapped at runtime — the state machine
// resolves clip names against the active weapon's animation set.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { assetLoader } from '../assets/AssetLoader.js';
import type { LoadedCharacter, GLBAnimPackName } from '../assets/AssetLoader.js';
import { AnimEventDispatcher } from './AnimationEvents.js';
export type { AnimEventDef, AnimEventCallback } from './AnimationEvents.js';
export { AnimEventType, AnimEventDispatcher } from './AnimationEvents.js';

// ── Animation States ──────────────────────────────────────────────

export enum AnimState {
  // Locomotion
  IDLE       = 'idle',
  WALK       = 'walk',
  WALK_BACK  = 'walk_back',
  RUN        = 'run',
  RUN_BACK   = 'run_back',
  SPRINT     = 'sprint',

  // Airborne
  JUMP       = 'jump',
  FALL       = 'fall',
  LAND       = 'land',

  // Combat — melee
  ATTACK_1   = 'attack_1',
  ATTACK_2   = 'attack_2',
  ATTACK_3   = 'attack_3',
  COMBO_1    = 'combo_1',
  COMBO_2    = 'combo_2',

  // Combat — defense
  DODGE      = 'dodge',
  BLOCK      = 'block',
  BLOCK_IDLE = 'block_idle',
  PARRY      = 'parry',

  // Combat — ranged/magic
  CAST_1H    = 'cast_1h',
  CAST_2H    = 'cast_2h',
  SPELL      = 'spell',

  // Weapon transitions
  DRAW       = 'draw',
  SHEATH     = 'sheath',

  // Reactions
  HIT        = 'hit',
  DEATH      = 'death',
}

// ── State Configuration ───────────────────────────────────────────

interface StateConfig {
  /** Which animation clip to play (resolved against active weapon pack) */
  clip: string;
  /** Loop or play once? */
  loop: boolean;
  /** Crossfade duration (seconds) to blend into this state */
  blendIn: number;
  /** Can this state be interrupted by another transition? */
  canInterrupt: boolean;
  /** For one-shot states: which state to auto-transition to when clip finishes */
  returnTo?: AnimState;
  /** Playback speed multiplier (default 1.0) */
  speed?: number;
  /** Priority — higher wins when multiple transitions are valid */
  priority?: number;
}

/** Default state configs. Combat states use weapon pack clip names. */
const STATE_CONFIGS: Record<AnimState, StateConfig> = {
  // Locomotion
  [AnimState.IDLE]:       { clip: 'idle',       loop: true,  blendIn: 0.25, canInterrupt: true },
  [AnimState.WALK]:       { clip: 'walk',       loop: true,  blendIn: 0.20, canInterrupt: true },
  [AnimState.WALK_BACK]:  { clip: 'walk_back',  loop: true,  blendIn: 0.20, canInterrupt: true },
  [AnimState.RUN]:        { clip: 'run',        loop: true,  blendIn: 0.15, canInterrupt: true },
  [AnimState.RUN_BACK]:   { clip: 'run_back',   loop: true,  blendIn: 0.15, canInterrupt: true },
  [AnimState.SPRINT]:     { clip: 'run',        loop: true,  blendIn: 0.15, canInterrupt: true, speed: 1.4 },

  // Airborne
  [AnimState.JUMP]:       { clip: 'jump',       loop: false, blendIn: 0.10, canInterrupt: false, returnTo: AnimState.FALL },
  [AnimState.FALL]:       { clip: 'jump',       loop: true,  blendIn: 0.10, canInterrupt: true,  speed: 0.3 },
  [AnimState.LAND]:       { clip: 'idle',       loop: false, blendIn: 0.05, canInterrupt: true,  returnTo: AnimState.IDLE },

  // Combat — melee
  [AnimState.ATTACK_1]:   { clip: 'attack_1',   loop: false, blendIn: 0.08, canInterrupt: false, returnTo: AnimState.IDLE, priority: 5 },
  [AnimState.ATTACK_2]:   { clip: 'attack_2',   loop: false, blendIn: 0.08, canInterrupt: false, returnTo: AnimState.IDLE, priority: 5 },
  [AnimState.ATTACK_3]:   { clip: 'attack_3',   loop: false, blendIn: 0.08, canInterrupt: false, returnTo: AnimState.IDLE, priority: 5 },
  [AnimState.COMBO_1]:    { clip: 'combo_1',    loop: false, blendIn: 0.05, canInterrupt: false, returnTo: AnimState.IDLE, priority: 6 },
  [AnimState.COMBO_2]:    { clip: 'combo_2',    loop: false, blendIn: 0.05, canInterrupt: false, returnTo: AnimState.IDLE, priority: 6 },

  // Combat — defense
  [AnimState.DODGE]:      { clip: 'dodge',      loop: false, blendIn: 0.05, canInterrupt: false, returnTo: AnimState.IDLE, priority: 8 },
  [AnimState.BLOCK]:      { clip: 'block',      loop: false, blendIn: 0.08, canInterrupt: true,  returnTo: AnimState.BLOCK_IDLE, priority: 4 },
  [AnimState.BLOCK_IDLE]: { clip: 'block_idle', loop: true,  blendIn: 0.10, canInterrupt: true,  priority: 3 },
  [AnimState.PARRY]:      { clip: 'block',      loop: false, blendIn: 0.05, canInterrupt: false, returnTo: AnimState.IDLE, priority: 9, speed: 1.5 },

  // Combat — magic
  [AnimState.CAST_1H]:    { clip: 'cast_1h',    loop: false, blendIn: 0.10, canInterrupt: false, returnTo: AnimState.IDLE, priority: 5 },
  [AnimState.CAST_2H]:    { clip: 'cast_2h',    loop: false, blendIn: 0.10, canInterrupt: false, returnTo: AnimState.IDLE, priority: 5 },
  [AnimState.SPELL]:      { clip: 'spell_cast', loop: false, blendIn: 0.10, canInterrupt: false, returnTo: AnimState.IDLE, priority: 5 },

  // Weapon transitions
  [AnimState.DRAW]:       { clip: 'draw',       loop: false, blendIn: 0.15, canInterrupt: false, returnTo: AnimState.IDLE, priority: 2 },
  [AnimState.SHEATH]:     { clip: 'sheath',     loop: false, blendIn: 0.15, canInterrupt: false, returnTo: AnimState.IDLE, priority: 2 },

  // Reactions
  [AnimState.HIT]:        { clip: 'death',      loop: false, blendIn: 0.05, canInterrupt: false, returnTo: AnimState.IDLE, priority: 7 },
  [AnimState.DEATH]:      { clip: 'death',      loop: false, blendIn: 0.10, canInterrupt: false, priority: 10 },
};

// ── Input Signals ─────────────────────────────────────────────────
// The game loop feeds these signals each frame so the state machine
// can evaluate transitions without knowing about input directly.

export interface AnimationInput {
  /** Horizontal movement speed (0 = stationary) */
  moveSpeed: number;
  /** Moving backward? */
  movingBack: boolean;
  /** Sprint held? */
  sprinting: boolean;
  /** Character on solid ground? */
  onGround: boolean;
  /** Vertical velocity (positive = rising, negative = falling) */
  velocityY: number;
  /** Attack pressed this frame? (rising edge) */
  attackPressed: boolean;
  /** Block held? */
  blockHeld: boolean;
  /** Dodge pressed this frame? (rising edge) */
  dodgePressed: boolean;
  /** Cast pressed this frame? */
  castPressed: boolean;
  /** Is the character dead? */
  isDead: boolean;
  /** Was the character hit this frame? */
  wasHit: boolean;
}

// ── Weapon Pack Mapping ───────────────────────────────────────────
// Maps weapon types to their GLB animation pack and clip name overrides.
// When a weapon pack is active, combat states resolve clips from it.

interface WeaponAnimSet {
  /** Which GLB animation pack to use */
  pack: GLBAnimPackName;
  /** Override clip names for combat states */
  clips: Partial<Record<AnimState, string>>;
}

const WEAPON_ANIM_SETS: Record<string, WeaponAnimSet> = {
  'unarmed': {
    pack: 'unarmed',
    clips: {
      [AnimState.ATTACK_1]: 'martelo',
      [AnimState.ATTACK_2]: 'armada',
      [AnimState.ATTACK_3]: 'meia_lua',
      [AnimState.COMBO_1]:  'capoeira',
      [AnimState.DODGE]:    'esquiva',
      [AnimState.IDLE]:     'ginga_fwd',
    },
  },
  'sword-shield': {
    pack: 'sword-shield',
    clips: {
      [AnimState.ATTACK_1]: 'attack_1',
      [AnimState.ATTACK_2]: 'attack_2',
      [AnimState.ATTACK_3]: 'attack_3',
      [AnimState.BLOCK]:    'block',
      [AnimState.BLOCK_IDLE]: 'block_idle',
      [AnimState.DRAW]:     'draw',
      [AnimState.SHEATH]:   'sheath',
      [AnimState.IDLE]:     'idle',
      [AnimState.RUN]:      'run',
      [AnimState.WALK]:     'walk',
    },
  },
  'greatsword': {
    pack: 'greatsword',
    clips: {
      [AnimState.ATTACK_1]: 'attack',
      [AnimState.ATTACK_2]: 'slash_1',
      [AnimState.ATTACK_3]: 'slash_2',
      [AnimState.COMBO_1]:  'spin_attack',
      [AnimState.COMBO_2]:  'slide_attack',
      [AnimState.BLOCK]:    'block',
      [AnimState.DRAW]:     'draw',
      [AnimState.IDLE]:     'idle',
      [AnimState.RUN]:      'run',
      [AnimState.WALK]:     'walk',
    },
  },
  'magic': {
    pack: 'magic',
    clips: {
      [AnimState.CAST_1H]:  'cast_1h',
      [AnimState.CAST_2H]:  'cast_2h',
      [AnimState.ATTACK_1]: 'attack_1h_1',
      [AnimState.ATTACK_2]: 'attack_1h_2',
      [AnimState.ATTACK_3]: 'attack_1h_3',
      [AnimState.SPELL]:    'spell_cast',
    },
  },
  'axe': {
    pack: 'axe',
    clips: {
      [AnimState.ATTACK_1]: 'attack_horizontal',
      [AnimState.ATTACK_2]: 'attack_downward',
      [AnimState.ATTACK_3]: 'attack_backhand',
      [AnimState.COMBO_1]:  'combo_1',
      [AnimState.COMBO_2]:  'combo_2',
    },
  },
};

// ── Animation State Machine ───────────────────────────────────────

export class AnimationStateMachine {
  private character: LoadedCharacter;
  private currentState: AnimState = AnimState.IDLE;
  private currentAction: THREE.AnimationAction | null = null;
  private activeWeapon: string = 'unarmed';
  private comboIndex = 0;
  private comboTimer = 0;

  /** Time remaining on current one-shot animation */
  private oneShotTimer = 0;

  /** Animation event dispatcher — fires footstep, hit-frame, VFX, sound events */
  readonly events: AnimEventDispatcher;

  /** External read: what state are we in? */
  get state(): AnimState { return this.currentState; }

  /** External read: is a one-shot (attack, dodge, etc.) playing? */
  get isLocked(): boolean {
    const config = STATE_CONFIGS[this.currentState];
    return !config.canInterrupt && this.oneShotTimer > 0;
  }

  constructor(character: LoadedCharacter) {
    this.character = character;
    this.events = new AnimEventDispatcher();

    // Listen for animation finished events (for one-shot → returnTo)
    character.mixer.addEventListener('finished', (e: any) => {
      this.onAnimationFinished(e.action);
    });
  }

  // ── Core Update (call every frame) ────────────────────────────

  /**
   * Evaluate transitions and update the animation mixer.
   * Call this once per frame from the game loop.
   */
  update(dt: number, input: AnimationInput): void {
    this.character.mixer.update(dt);

    // Tick animation events (fires footstep/hit-frame/VFX callbacks)
    this.events.tick(dt);

    // Count down one-shot timer
    if (this.oneShotTimer > 0) {
      this.oneShotTimer -= dt;
    }

    // Combo window timer
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboIndex = 0;
    }

    // Don't evaluate transitions if locked into a one-shot
    if (this.isLocked) return;

    // Evaluate transitions (highest priority first)
    const nextState = this.evaluateTransitions(input);
    if (nextState !== this.currentState) {
      this.transitionTo(nextState);
    }
  }

  // ── Weapon Pack Management ────────────────────────────────────

  /**
   * Switch the active weapon animation set. This determines which
   * clips combat states resolve to.
   *
   * Call this when the player equips a different weapon.
   * The GLB animation pack must be loaded first via AssetLoader.
   */
  setWeapon(weaponType: string): void {
    if (this.activeWeapon === weaponType) return;

    const set = WEAPON_ANIM_SETS[weaponType];
    if (!set) {
      console.warn(`[AnimSM] Unknown weapon type: ${weaponType}, falling back to unarmed`);
      this.activeWeapon = 'unarmed';
      return;
    }

    this.activeWeapon = weaponType;
    this.comboIndex = 0;
    console.log(`[AnimSM] Weapon set → ${weaponType}`);
  }

  /** Force transition to a specific state (for external triggers like taking damage) */
  forceState(state: AnimState): void {
    this.transitionTo(state);
  }

  // ── Transition Evaluation ─────────────────────────────────────

  private evaluateTransitions(input: AnimationInput): AnimState {
    // Death overrides everything
    if (input.isDead) return AnimState.DEATH;

    // Hit reaction
    if (input.wasHit && this.currentState !== AnimState.DEATH) {
      return AnimState.HIT;
    }

    // Dodge (highest combat priority — i-frames)
    if (input.dodgePressed && input.onGround) {
      return AnimState.DODGE;
    }

    // Attack (with combo chaining)
    if (input.attackPressed && input.onGround) {
      return this.resolveAttack();
    }

    // Cast
    if (input.castPressed && input.onGround) {
      return AnimState.CAST_1H;
    }

    // Block
    if (input.blockHeld && input.onGround) {
      return this.currentState === AnimState.BLOCK_IDLE
        ? AnimState.BLOCK_IDLE
        : AnimState.BLOCK;
    }

    // Airborne
    if (!input.onGround) {
      return input.velocityY > 0 ? AnimState.JUMP : AnimState.FALL;
    }

    // Landing (was airborne, now grounded)
    if (input.onGround && (this.currentState === AnimState.FALL || this.currentState === AnimState.JUMP)) {
      return AnimState.LAND;
    }

    // Locomotion
    if (input.moveSpeed > 0.1) {
      if (input.sprinting) return AnimState.SPRINT;
      if (input.moveSpeed > 3.0) {
        return input.movingBack ? AnimState.RUN_BACK : AnimState.RUN;
      }
      return input.movingBack ? AnimState.WALK_BACK : AnimState.WALK;
    }

    return AnimState.IDLE;
  }

  private resolveAttack(): AnimState {
    // Combo chain: 1 → 2 → 3 within timing window
    if (this.comboTimer > 0 && this.comboIndex > 0) {
      if (this.comboIndex === 1) { this.comboIndex = 2; this.comboTimer = 0.8; return AnimState.ATTACK_2; }
      if (this.comboIndex === 2) { this.comboIndex = 3; this.comboTimer = 0.8; return AnimState.ATTACK_3; }
      // After 3, check for combo finisher
      if (this.comboIndex === 3) { this.comboIndex = 0; this.comboTimer = 0; return AnimState.COMBO_1; }
    }

    // Start new combo
    this.comboIndex = 1;
    this.comboTimer = 0.8; // 800ms window to continue combo
    return AnimState.ATTACK_1;
  }

  // ── State Transitions ─────────────────────────────────────────

  private transitionTo(newState: AnimState): void {
    const config = STATE_CONFIGS[newState];
    const clipName = this.resolveClipName(newState, config);

    // Find the action from the character's action map
    const action = this.findAction(clipName);
    if (!action) {
      // Fallback: try the base clip name from config
      const fallback = this.findAction(config.clip);
      if (!fallback) {
        // Can't play this state — stay in current
        return;
      }
      this.performTransition(newState, config, fallback);
      return;
    }

    this.performTransition(newState, config, action);
  }

  private performTransition(newState: AnimState, config: StateConfig, action: THREE.AnimationAction): void {
    const oldAction = this.currentAction;

    // Configure the new action
    action.reset();
    action.setEffectiveTimeScale(config.speed ?? 1.0);
    action.setEffectiveWeight(1);

    // Compute effective clip duration for event system
    const rawDuration = action.getClip()?.duration ?? 0;
    const effectiveDuration = rawDuration / (config.speed ?? 1.0);

    if (config.loop) {
      action.setLoop(THREE.LoopRepeat, Infinity);
    } else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;

      // Set one-shot timer from clip duration
      this.oneShotTimer = effectiveDuration;
    }

    // Notify event dispatcher of the new state
    this.events.setState(newState, effectiveDuration, config.loop);

    // Crossfade from old action
    if (oldAction && oldAction !== action) {
      action.crossFadeFrom(oldAction, config.blendIn, true);
    }

    action.play();
    this.currentAction = action;
    this.currentState = newState;
  }

  // ── Clip Resolution ───────────────────────────────────────────

  /**
   * Resolve the actual clip name for a state.
   * Checks weapon-specific overrides first, then falls back to default.
   */
  private resolveClipName(state: AnimState, config: StateConfig): string {
    const weaponSet = WEAPON_ANIM_SETS[this.activeWeapon];
    if (weaponSet?.clips[state]) {
      return weaponSet.clips[state]!;
    }
    return config.clip;
  }

  /**
   * Find a THREE.AnimationAction by clip name.
   * Searches: character actions → GLB pack cache → FBX pack cache.
   */
  private findAction(clipName: string): THREE.AnimationAction | null {
    // 1. Direct match in character's action map
    const direct = this.character.actions.get(clipName);
    if (direct) return direct;

    // 2. Try weapon pack prefix (e.g., "glb:sword-shield/attack_1")
    const weaponSet = WEAPON_ANIM_SETS[this.activeWeapon];
    if (weaponSet) {
      const packPrefix = `glb:${weaponSet.pack}`;
      const clip = assetLoader.getClip(packPrefix, clipName)
                ?? assetLoader.getClip(weaponSet.pack, clipName);
      if (clip) {
        // Create action from clip and cache it
        const action = this.character.mixer.clipAction(clip);
        this.character.actions.set(clipName, action);
        return action;
      }
    }

    // 3. Try base pack
    const baseClip = assetLoader.getClip('glb:base', clipName)
                  ?? assetLoader.getClip('base', clipName)
                  ?? assetLoader.getClip('locomotion', clipName)
                  ?? assetLoader.getClip('core', clipName);
    if (baseClip) {
      const action = this.character.mixer.clipAction(baseClip);
      this.character.actions.set(clipName, action);
      return action;
    }

    return null;
  }

  // ── Event Handlers ────────────────────────────────────────────

  private onAnimationFinished(action: THREE.AnimationAction): void {
    const config = STATE_CONFIGS[this.currentState];
    if (config.returnTo && action === this.currentAction) {
      this.oneShotTimer = 0;
      this.transitionTo(config.returnTo);
    }
  }

  // ── Debug ─────────────────────────────────────────────────────

  getDebugInfo(): string {
    return `[${this.currentState}] weapon=${this.activeWeapon} combo=${this.comboIndex} locked=${this.isLocked} ${this.events.getDebugInfo()}`;
  }
}
