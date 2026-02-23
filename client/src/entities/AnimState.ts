// ═══════════════════════════════════════════════════════════════════
// ANIMATION STATES — Shared enum
// Extracted to its own module to avoid circular imports between
// AnimationStateMachine ↔ AnimationEvents.
// ═══════════════════════════════════════════════════════════════════

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
