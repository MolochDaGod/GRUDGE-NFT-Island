// ═══════════════════════════════════════════════════════════════════
// ANIMATION EVENT SYSTEM
//
// Timer-based event dispatch tied to animation state playback.
// Events fire at specific normalised times (0–1) within a clip and
// are de-duplicated per play-through so they never double-fire.
//
// Usage:
//   dispatcher.onEvent(AnimEventType.FOOTSTEP, (e) => playSound(e));
//   dispatcher.onEvent(AnimEventType.HIT_FRAME, (e) => hitbox.activate(e));
//
// The AnimationStateMachine drives the dispatcher each frame:
//   dispatcher.setState(newState, clipDuration);   // on transition
//   dispatcher.tick(dt);                           // every frame
// ═══════════════════════════════════════════════════════════════════

import { AnimState } from './AnimState.js';

// ── Event Types ───────────────────────────────────────────────────

export enum AnimEventType {
  /** Foot hits ground — play footstep sound / dust VFX */
  FOOTSTEP    = 'footstep',
  /** Attack hit-frame — activate hitbox for damage */
  HIT_FRAME   = 'hit_frame',
  /** Spawn a visual effect (particles, flash, trail) */
  VFX         = 'vfx',
  /** Play a one-shot sound (whoosh, grunt, clang) */
  SOUND       = 'sound',
  /** Generic hook for game-specific logic */
  CUSTOM      = 'custom',
}

// ── Event Definition ──────────────────────────────────────────────

export interface AnimEventDef {
  /** What kind of event this is */
  type: AnimEventType;
  /**
   * Normalised time within the clip (0 = start, 1 = end).
   * For looping clips this wraps every cycle.
   */
  time: number;
  /** Optional label (e.g. "left_foot", "slash_whoosh") */
  tag?: string;
  /** Arbitrary payload forwarded to listeners */
  data?: Record<string, unknown>;
}

/** Callback signature for event listeners */
export type AnimEventCallback = (event: AnimEventDef, state: AnimState) => void;

// ── Default Event Map ─────────────────────────────────────────────
// Keys are AnimState values. Events are defined at normalised time.

const DEFAULT_EVENTS: Partial<Record<AnimState, AnimEventDef[]>> = {
  // ── Locomotion ──────────────────────────────────────────────
  [AnimState.WALK]: [
    { type: AnimEventType.FOOTSTEP, time: 0.0,  tag: 'left_foot' },
    { type: AnimEventType.FOOTSTEP, time: 0.5,  tag: 'right_foot' },
  ],
  [AnimState.WALK_BACK]: [
    { type: AnimEventType.FOOTSTEP, time: 0.0,  tag: 'left_foot' },
    { type: AnimEventType.FOOTSTEP, time: 0.5,  tag: 'right_foot' },
  ],
  [AnimState.RUN]: [
    { type: AnimEventType.FOOTSTEP, time: 0.0,  tag: 'left_foot' },
    { type: AnimEventType.FOOTSTEP, time: 0.48, tag: 'right_foot' },
  ],
  [AnimState.RUN_BACK]: [
    { type: AnimEventType.FOOTSTEP, time: 0.0,  tag: 'left_foot' },
    { type: AnimEventType.FOOTSTEP, time: 0.48, tag: 'right_foot' },
  ],
  [AnimState.SPRINT]: [
    { type: AnimEventType.FOOTSTEP, time: 0.0,  tag: 'left_foot' },
    { type: AnimEventType.FOOTSTEP, time: 0.42, tag: 'right_foot' },
  ],

  // ── Airborne ────────────────────────────────────────────────
  [AnimState.JUMP]: [
    { type: AnimEventType.SOUND, time: 0.05, tag: 'jump_grunt' },
  ],
  [AnimState.LAND]: [
    { type: AnimEventType.SOUND,    time: 0.0, tag: 'land_thud' },
    { type: AnimEventType.VFX,      time: 0.0, tag: 'land_dust' },
  ],

  // ── Melee Attacks ───────────────────────────────────────────
  // Hit-frame times are aligned with HitboxSystem start times
  [AnimState.ATTACK_1]: [
    { type: AnimEventType.SOUND,     time: 0.05, tag: 'swing_whoosh' },
    { type: AnimEventType.HIT_FRAME, time: 0.20, tag: 'attack_1', data: { animName: 'attack_1' } },
  ],
  [AnimState.ATTACK_2]: [
    { type: AnimEventType.SOUND,     time: 0.04, tag: 'swing_whoosh' },
    { type: AnimEventType.HIT_FRAME, time: 0.17, tag: 'attack_2', data: { animName: 'attack_2' } },
  ],
  [AnimState.ATTACK_3]: [
    { type: AnimEventType.SOUND,     time: 0.08, tag: 'swing_whoosh_heavy' },
    { type: AnimEventType.HIT_FRAME, time: 0.25, tag: 'attack_3', data: { animName: 'attack_3' } },
  ],
  [AnimState.COMBO_1]: [
    { type: AnimEventType.SOUND,     time: 0.03, tag: 'combo_whoosh' },
    { type: AnimEventType.HIT_FRAME, time: 0.12, tag: 'combo_1', data: { animName: 'combo_1' } },
    { type: AnimEventType.HIT_FRAME, time: 0.40, tag: 'combo_1_b', data: { animName: 'combo_1' } },
    { type: AnimEventType.VFX,       time: 0.10, tag: 'combo_trail' },
  ],
  [AnimState.COMBO_2]: [
    { type: AnimEventType.SOUND,     time: 0.03, tag: 'combo_whoosh' },
    { type: AnimEventType.HIT_FRAME, time: 0.15, tag: 'combo_2', data: { animName: 'combo_2' } },
    { type: AnimEventType.VFX,       time: 0.12, tag: 'combo_trail' },
  ],

  // ── Defense ─────────────────────────────────────────────────
  [AnimState.DODGE]: [
    { type: AnimEventType.SOUND, time: 0.0,  tag: 'dodge_whoosh' },
    { type: AnimEventType.VFX,   time: 0.05, tag: 'dodge_afterimage' },
  ],
  [AnimState.BLOCK]: [
    { type: AnimEventType.SOUND, time: 0.0, tag: 'shield_raise' },
  ],
  [AnimState.PARRY]: [
    { type: AnimEventType.SOUND, time: 0.0,  tag: 'parry_clang' },
    { type: AnimEventType.VFX,   time: 0.02, tag: 'parry_sparks' },
  ],

  // ── Magic ───────────────────────────────────────────────────
  [AnimState.CAST_1H]: [
    { type: AnimEventType.SOUND, time: 0.10, tag: 'cast_charge' },
    { type: AnimEventType.VFX,   time: 0.15, tag: 'cast_glow' },
    { type: AnimEventType.VFX,   time: 0.55, tag: 'cast_release', data: { spawnProjectile: true } },
    { type: AnimEventType.SOUND, time: 0.55, tag: 'cast_release' },
  ],
  [AnimState.CAST_2H]: [
    { type: AnimEventType.SOUND, time: 0.08, tag: 'cast_charge_heavy' },
    { type: AnimEventType.VFX,   time: 0.12, tag: 'cast_glow_both' },
    { type: AnimEventType.VFX,   time: 0.60, tag: 'cast_release_heavy', data: { spawnProjectile: true } },
    { type: AnimEventType.SOUND, time: 0.60, tag: 'cast_release_heavy' },
  ],
  [AnimState.SPELL]: [
    { type: AnimEventType.VFX,   time: 0.20, tag: 'spell_circle' },
    { type: AnimEventType.VFX,   time: 0.50, tag: 'spell_burst', data: { spawnProjectile: true } },
    { type: AnimEventType.SOUND, time: 0.50, tag: 'spell_burst' },
  ],

  // ── Weapon transitions ──────────────────────────────────────
  [AnimState.DRAW]: [
    { type: AnimEventType.SOUND, time: 0.30, tag: 'draw_metal' },
  ],
  [AnimState.SHEATH]: [
    { type: AnimEventType.SOUND, time: 0.50, tag: 'sheath_click' },
  ],

  // ── Reactions ───────────────────────────────────────────────
  [AnimState.HIT]: [
    { type: AnimEventType.SOUND, time: 0.0, tag: 'hit_grunt' },
    { type: AnimEventType.VFX,   time: 0.0, tag: 'hit_flash' },
  ],
  [AnimState.DEATH]: [
    { type: AnimEventType.SOUND, time: 0.0, tag: 'death_cry' },
    { type: AnimEventType.VFX,   time: 0.3, tag: 'death_dissolve' },
  ],
};

// ── Animation Event Dispatcher ────────────────────────────────────

export class AnimEventDispatcher {
  /** Per-type listener lists */
  private listeners = new Map<AnimEventType, AnimEventCallback[]>();
  /** Wildcard listeners (receive all events) */
  private wildcardListeners: AnimEventCallback[] = [];

  /** Current state being tracked */
  private currentState: AnimState = AnimState.IDLE;
  /** Duration of the current clip (seconds) — 0 means no events */
  private clipDuration = 0;
  /** Is the current clip looping? */
  private looping = false;
  /** Elapsed time in the current clip (seconds) */
  private elapsed = 0;
  /** Indices of events that have already fired this play-through */
  private firedSet = new Set<number>();

  /** Custom event map (weapon/race overrides merge on top of defaults) */
  private customEvents = new Map<AnimState, AnimEventDef[]>();

  // ── Listener Registration ──────────────────────────────────

  /** Subscribe to a specific event type */
  onEvent(type: AnimEventType, cb: AnimEventCallback): () => void {
    let list = this.listeners.get(type);
    if (!list) {
      list = [];
      this.listeners.set(type, list);
    }
    list.push(cb);

    // Return unsubscribe function
    return () => {
      const arr = this.listeners.get(type);
      if (arr) {
        const idx = arr.indexOf(cb);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  /** Subscribe to all event types (useful for debug logging) */
  onAnyEvent(cb: AnimEventCallback): () => void {
    this.wildcardListeners.push(cb);
    return () => {
      const idx = this.wildcardListeners.indexOf(cb);
      if (idx >= 0) this.wildcardListeners.splice(idx, 1);
    };
  }

  // ── State Management ───────────────────────────────────────

  /**
   * Called by AnimationStateMachine when transitioning to a new state.
   * Resets elapsed time and clears fired event tracking.
   */
  setState(state: AnimState, clipDuration: number, looping: boolean): void {
    this.currentState = state;
    this.clipDuration = clipDuration;
    this.looping = looping;
    this.elapsed = 0;
    this.firedSet.clear();
  }

  /**
   * Register custom events for a state (e.g. weapon-specific overrides).
   * These replace the default events for that state.
   */
  setEvents(state: AnimState, events: AnimEventDef[]): void {
    this.customEvents.set(state, events);
  }

  /** Remove custom event overrides for a state */
  clearEvents(state: AnimState): void {
    this.customEvents.delete(state);
  }

  // ── Tick (called every frame from AnimStateMachine.update) ─

  tick(dt: number): void {
    if (this.clipDuration <= 0) return;

    const events = this.customEvents.get(this.currentState)
                ?? DEFAULT_EVENTS[this.currentState];
    if (!events || events.length === 0) return;

    const prevElapsed = this.elapsed;
    this.elapsed += dt;

    if (this.looping) {
      // Handle loop wrap-around
      const prevNorm = (prevElapsed % this.clipDuration) / this.clipDuration;
      const currNorm = (this.elapsed % this.clipDuration) / this.clipDuration;

      // Detect cycle wrap
      if (currNorm < prevNorm) {
        // Wrapped around — fire events from prevNorm→1.0, then 0.0→currNorm
        this.fireEventsInRange(events, prevNorm, 1.0);
        this.firedSet.clear(); // New cycle: allow re-firing
        this.fireEventsInRange(events, 0.0, currNorm);
      } else {
        this.fireEventsInRange(events, prevNorm, currNorm);
      }
    } else {
      // One-shot: normalise against full clip duration
      const prevNorm = Math.min(prevElapsed / this.clipDuration, 1.0);
      const currNorm = Math.min(this.elapsed / this.clipDuration, 1.0);
      this.fireEventsInRange(events, prevNorm, currNorm);
    }
  }

  // ── Internals ──────────────────────────────────────────────

  private fireEventsInRange(events: AnimEventDef[], from: number, to: number): void {
    for (let i = 0; i < events.length; i++) {
      if (this.firedSet.has(i)) continue;
      const ev = events[i];
      if (ev.time >= from && ev.time < to) {
        this.firedSet.add(i);
        this.dispatch(ev);
      }
    }
  }

  private dispatch(event: AnimEventDef): void {
    // Type-specific listeners
    const typed = this.listeners.get(event.type);
    if (typed) {
      for (const cb of typed) cb(event, this.currentState);
    }
    // Wildcard listeners
    for (const cb of this.wildcardListeners) cb(event, this.currentState);
  }

  // ── Debug ──────────────────────────────────────────────────

  getDebugInfo(): string {
    const events = this.customEvents.get(this.currentState)
                ?? DEFAULT_EVENTS[this.currentState];
    const total = events?.length ?? 0;
    const norm = this.clipDuration > 0
      ? ((this.elapsed % this.clipDuration) / this.clipDuration).toFixed(2)
      : '0.00';
    return `events=${this.firedSet.size}/${total} t=${norm}`;
  }
}
