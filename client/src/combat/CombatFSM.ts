// ═══════════════════════════════════════════════════════════════════
// COMBAT FSM — Lightweight tagged state machine
//
// Mirrors annihilate's XState-style pattern without the dependency:
//   • Tagged states  (canDamage, canMove, canFacing, canLaunch, knockDown)
//   • Nested states  (attack.main → attack.prepareNext → fist)
//   • Entry / exit   actions fired on transition
//   • Delayed "after" transitions (e.g. dash → idle after 300ms)
//   • send() / matches() / hasTag() API
//
// Usage:
//   const fsm = new CombatFSM(MELEE_STATES, actions);
//   fsm.send('attack');
//   if (fsm.hasTag('canDamage')) { ... }
// ═══════════════════════════════════════════════════════════════════

// ── Type definitions ─────────────────────────────────────────────

export interface StateNode {
  /** entry action name(s) to call on entering this state */
  entry?: string | string[];
  /** exit action name(s) to call on leaving this state */
  exit?: string | string[];
  /** event → target state ID */
  on?: Record<string, string | TransitionDef>;
  /** tags attached to this state (e.g. 'canDamage', 'canMove') */
  tags?: string[];
  /** auto-transition after N ms: { [ms]: targetStateId } */
  after?: Record<number, string>;
  /** nested child states (for combo chains) */
  states?: Record<string, StateNode>;
  /** which child state to enter by default */
  initial?: string;
  /** if true, this is a terminal state (no exit) */
  type?: 'final';
}

export interface TransitionDef {
  target: string;
  /** optional guard function name */
  cond?: string;
}

export interface FSMConfig {
  id: string;
  initial: string;
  states: Record<string, StateNode>;
}

/** Actions map: actionName → callback(context?, event?) */
export type ActionMap = Record<string, (ctx?: any, event?: any) => void>;
/** Guards map: guardName → () => boolean */
export type GuardMap = Record<string, () => boolean>;

// ── Helpers ──────────────────────────────────────────────────────

function resolveTarget(target: string): { root: string; child?: string } {
  // Handle absolute targets like "#maria.idle" → just "idle"
  if (target.startsWith('#')) {
    const dotIdx = target.indexOf('.');
    if (dotIdx >= 0) return { root: target.slice(dotIdx + 1) };
    return { root: target.slice(1) };
  }
  const parts = target.split('.');
  if (parts.length === 1) return { root: parts[0] };
  return { root: parts[0], child: parts[1] };
}

// ═══════════════════════════════════════════════════════════════════

export class CombatFSM {
  readonly id: string;
  private config: FSMConfig;
  private actions: ActionMap;
  private guards: GuardMap;

  /** Current top-level state ID */
  private _state: string;
  /** Current child state ID (if nested) */
  private _child: string | null = null;
  /** Active delayed-transition timer */
  private _timer: ReturnType<typeof setTimeout> | null = null;

  /** Callback fired on every transition (for debugging) */
  onTransition?: (state: string, child: string | null) => void;

  constructor(config: FSMConfig, actions: ActionMap = {}, guards: GuardMap = {}) {
    this.id = config.id;
    this.config = config;
    this.actions = actions;
    this.guards = guards;
    this._state = config.initial;

    // Enter initial state
    const initNode = this.getNode(this._state);
    if (initNode) {
      this.fireEntry(initNode);
      this.enterChild(initNode);
      this.scheduleAfter(initNode);
    }
  }

  // ── Public API ─────────────────────────────────────────────────

  /** Current state value, e.g. 'attack' or 'attack.prepareNext' */
  get value(): string {
    return this._child ? `${this._state}.${this._child}` : this._state;
  }

  /** Get the top-level state name */
  get state(): string {
    return this._state;
  }

  /** Check if current state matches the given name (supports nested: 'attack.main') */
  matches(name: string): boolean {
    if (name === this._state) return true;
    if (this._child && name === `${this._state}.${this._child}`) return true;
    return false;
  }

  /** Check if current state (or its parent) has the given tag */
  hasTag(tag: string): boolean {
    const node = this.getNode(this._state);
    if (!node) return false;
    if (node.tags?.includes(tag)) return true;
    // Also check child state tags
    if (this._child && node.states?.[this._child]) {
      const childNode = node.states[this._child];
      if (childNode.tags?.includes(tag)) return true;
    }
    return false;
  }

  /** Send an event to trigger a state transition */
  send(event: string, payload?: any): void {
    // 1. Check child state transitions first (more specific)
    if (this._child) {
      const parentNode = this.getNode(this._state);
      const childNode = parentNode?.states?.[this._child];
      if (childNode?.on) {
        const transition = childNode.on[event];
        if (transition) {
          const target = typeof transition === 'string' ? transition : transition.target;
          const guard = typeof transition === 'string' ? undefined : transition.cond;
          if (guard && this.guards[guard] && !this.guards[guard]()) return;

          this.transitionTo(target, payload);
          return;
        }
      }
    }

    // 2. Check parent state transitions
    const node = this.getNode(this._state);
    if (node?.on) {
      const transition = node.on[event];
      if (transition) {
        const target = typeof transition === 'string' ? transition : transition.target;
        const guard = typeof transition === 'string' ? undefined : transition.cond;
        if (guard && this.guards[guard] && !this.guards[guard]()) return;

        this.transitionTo(target, payload);
        return;
      }
    }

    // Event not handled — silently ignore (like XState)
  }

  /** Force-reset to a specific state (for respawn, etc.) */
  reset(stateId?: string): void {
    this.clearTimer();
    const target = stateId ?? this.config.initial;
    this._state = target;
    this._child = null;
    const node = this.getNode(this._state);
    if (node) {
      this.fireEntry(node);
      this.enterChild(node);
      this.scheduleAfter(node);
    }
  }

  /** Stop the FSM (clear timers) */
  dispose(): void {
    this.clearTimer();
  }

  // ── Internal ───────────────────────────────────────────────────

  private transitionTo(target: string, payload?: any): void {
    const resolved = resolveTarget(target);
    const oldState = this._state;
    const oldChild = this._child;
    const oldNode = this.getNode(oldState);

    // Exit child state
    if (oldChild && oldNode?.states?.[oldChild]) {
      this.fireExit(oldNode.states[oldChild], payload);
    }

    // Determine if we're transitioning to a different root state
    const newRoot = resolved.root;
    const isNewRoot = newRoot !== oldState;

    if (isNewRoot) {
      // Exit old root state
      if (oldNode) this.fireExit(oldNode, payload);
      this.clearTimer();

      // Enter new root state
      this._state = newRoot;
      this._child = null;
      const newNode = this.getNode(newRoot);
      if (newNode) {
        this.fireEntry(newNode, payload);
        // If target specifies a child, enter that; else enter default child
        if (resolved.child && newNode.states?.[resolved.child]) {
          this._child = resolved.child;
          this.fireEntry(newNode.states[resolved.child], payload);
          this.scheduleAfter(newNode.states[resolved.child]);
        } else {
          this.enterChild(newNode, payload);
        }
        this.scheduleAfter(newNode);
      }
    } else {
      // Same root — transition within nested states
      if (resolved.child && oldNode?.states?.[resolved.child]) {
        this._child = resolved.child;
        this.fireEntry(oldNode.states[resolved.child], payload);
        this.scheduleAfter(oldNode.states[resolved.child]);
      } else if (!resolved.child) {
        // Transitioning to the root itself (re-enter)
        this._child = null;
        this.clearTimer();
        if (oldNode) {
          this.fireEntry(oldNode, payload);
          this.enterChild(oldNode, payload);
          this.scheduleAfter(oldNode);
        }
      }
    }

    this.onTransition?.(this._state, this._child);
  }

  private getNode(stateId: string): StateNode | undefined {
    return this.config.states[stateId];
  }

  private enterChild(node: StateNode, payload?: any): void {
    if (node.states && node.initial) {
      this._child = node.initial;
      const childNode = node.states[node.initial];
      if (childNode) {
        this.fireEntry(childNode, payload);
        this.scheduleAfter(childNode);
      }
    }
  }

  private fireEntry(node: StateNode, payload?: any): void {
    if (!node.entry) return;
    const names = Array.isArray(node.entry) ? node.entry : [node.entry];
    for (const name of names) {
      this.actions[name]?.(undefined, payload);
    }
  }

  private fireExit(node: StateNode, payload?: any): void {
    if (!node.exit) return;
    const names = Array.isArray(node.exit) ? node.exit : [node.exit];
    for (const name of names) {
      this.actions[name]?.(undefined, payload);
    }
  }

  private scheduleAfter(node: StateNode): void {
    if (!node.after) return;
    // Only schedule the first delay (multiple not supported in this lightweight impl)
    const entries = Object.entries(node.after);
    if (entries.length === 0) return;
    const [msStr, target] = entries[0];
    const ms = parseInt(msStr, 10);
    if (isNaN(ms)) return;

    this._timer = setTimeout(() => {
      this._timer = null;
      this.transitionTo(target);
    }, ms);
  }

  private clearTimer(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}
