// ═══════════════════════════════════════════════════════════════════
// CHARACTER STATE INTERFACE
// Every character state (Idle, Walk, Attack, etc.) implements this.
// Ported from Sketchbook ICharacterState — adapted for combat.
// ═══════════════════════════════════════════════════════════════════

export interface ICharacterState {
  /** Called every physics tick */
  update(timeStep: number): void;
  /** Called when any action key changes (pressed/released) */
  onInputChange(): void;
}

/**
 * Action binding — mirrors Sketchbook's KeyBinding pattern.
 * Maps action names to their current pressed/justPressed/justReleased state.
 * Fed from InputManager each frame.
 */
export interface ActionState {
  isPressed: boolean;
  justPressed: boolean;
  justReleased: boolean;
}

/** The full set of actions the character controller reads */
export interface CharacterActions {
  up: ActionState;      // W — forward
  down: ActionState;    // S — backward
  left: ActionState;    // A — turn left / strafe
  right: ActionState;   // D — turn right / strafe
  run: ActionState;     // Shift — sprint
  jump: ActionState;    // Space — jump
  // Combat
  attack: ActionState;  // LMB — attack
  block: ActionState;   // RMB — block
  dodge: ActionState;   // Dodge key
  cast: ActionState;    // Cast key
}

/** Create a fresh action state (all false) */
export function createActionState(): ActionState {
  return { isPressed: false, justPressed: false, justReleased: false };
}

/** Create the full set of default actions */
export function createDefaultActions(): CharacterActions {
  return {
    up: createActionState(),
    down: createActionState(),
    left: createActionState(),
    right: createActionState(),
    run: createActionState(),
    jump: createActionState(),
    attack: createActionState(),
    block: createActionState(),
    dodge: createActionState(),
    cast: createActionState(),
  };
}
