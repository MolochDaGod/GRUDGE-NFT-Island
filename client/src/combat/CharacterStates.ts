// ═══════════════════════════════════════════════════════════════════
// CHARACTER STATES — FSM config definitions for combat characters
//
// Defines the state graph for a generic melee fighter, directly
// ported from annihilate's Maria.js / Mutant.js patterns but
// mapped to our 12 animation GLBs.
//
// Animation clip mapping (GLB → FSM action name):
//   Idle              → idle
//   Walking           → walk
//   Running           → run
//   Thrust_Slash      → attack (punch)
//   Weapon_Combo_2    → fist
//   Axe_Spin_Attack   → whirlwind / strike
//   Hit_Reaction_1    → hit
//   Shot_in_Back_Fall → knockDown / death
//   Roll_Dodge        → dodge
//   Jump_Run          → jump
//   Sprint_Stop       → dash
//   Stand_Dodge       → block
// ═══════════════════════════════════════════════════════════════════

import type { FSMConfig } from './CombatFSM.js';

// ── Animation name constants (match our clip names from loader) ──

export const ANIM = {
  idle:       'idle',
  walk:       'walk',
  run:        'run',
  attack:     'attack',     // Thrust_Slash
  combo:      'combo',      // Weapon_Combo_2
  axespin:    'axespin',    // Axe_Spin_Attack
  hit:        'hit',        // Hit_Reaction_1
  death:      'death',      // Shot_in_Back_Fall
  dodge:      'dodge',      // Roll_Dodge
  jump:       'jump',       // Jump_Run
  sprint:     'sprint',     // Sprint_and_Sudden_Stop
  standdodge: 'standdodge', // Stand_Dodge
} as const;

// ═══════════════════════════════════════════════════════════════════
// MELEE COMBAT STATES — Generic melee fighter (annihilate-style)
//
// State graph:
//   idle ↔ run ↔ attack → fist → strike → idle
//                       ↘ (combo chain with prepareNext)
//   idle → jump → fall → idle (air states)
//   idle → dash → idle (300ms)
//   idle → block → idle (on key release)
//   any  → hit → idle
//   any  → knockDown → idle | dead
//   idle → whirlwind → idle
// ═══════════════════════════════════════════════════════════════════

export const MELEE_STATES: FSMConfig = {
  id: 'melee',
  initial: 'idle',
  states: {
    // ── Core locomotion ──────────────────────────────────────────

    idle: {
      entry: 'playIdle',
      on: {
        run:       'run',
        attack:    'attackStart',
        bash:      'bashStart',
        jump:      'jump',
        hit:       'hit',
        knockDown: 'knockDown',
        dash:      'dash',
        block:     'block',
        dead:      'dead',
      },
      tags: ['canFacing'],
    },

    run: {
      entry: 'playRun',
      on: {
        stop:      'idle',
        attack:    'attackStart',
        bash:      'bashStart',
        jump:      'jump',
        hit:       'hit',
        knockDown: 'knockDown',
        dash:      'dash',
        block:     'block',
        dead:      'dead',
      },
      tags: ['canMove', 'canFacing'],
    },

    // ── Attack combo chain: attack → fist → strike ───────────────

    attackStart: {
      entry: 'playAttackStart',
      on: {
        finish:    'attack',
        hit:       'hit',
        knockDown: 'knockDown',
        dash:      'dash',
        dead:      'dead',
      },
    },

    attack: {
      entry: 'playAttack',
      on: {
        hit:       'hit',
        knockDown: 'knockDown',
        dash:      'dash',
        dead:      'dead',
      },
      tags: ['canDamage'],
      initial: 'main',
      states: {
        main: {
          on: {
            finish: '#melee.idle',
            attack: 'prepareNext',
          },
        },
        prepareNext: {
          on: {
            finish: '#melee.fistStart',
          },
        },
      },
    },

    fistStart: {
      entry: 'playFistStart',
      on: {
        finish:    'fist',
        hit:       'hit',
        knockDown: 'knockDown',
        dash:      'dash',
        dead:      'dead',
      },
    },

    fist: {
      entry: 'playFist',
      on: {
        hit:       'hit',
        knockDown: 'knockDown',
        dash:      'dash',
        dead:      'dead',
      },
      tags: ['canDamage'],
      initial: 'main',
      states: {
        main: {
          on: {
            finish: '#melee.idle',
            attack: 'prepareNext',
          },
        },
        prepareNext: {
          on: {
            finish: '#melee.strikeStart',
          },
        },
      },
    },

    strikeStart: {
      entry: 'playStrikeStart',
      on: {
        finish:    'strike',
        hit:       'hit',
        knockDown: 'knockDown',
        dash:      'dash',
        dead:      'dead',
      },
    },

    strike: {
      entry: 'playStrike',
      on: {
        finish:    'strikeEnd',
        hit:       'hit',
        knockDown: 'knockDown',
        dash:      'dash',
        dead:      'dead',
      },
      tags: ['canDamage', 'knockDown'],
    },

    strikeEnd: {
      entry: 'playStrikeEnd',
      on: {
        finish:    'idle',
        hit:       'hit',
        knockDown: 'knockDown',
        dash:      'dash',
        dead:      'dead',
      },
    },

    // ── Bash / Whirlwind ─────────────────────────────────────────

    bashStart: {
      entry: 'playBashStart',
      on: {
        finish:    'whirlwind',
        hit:       'hit',
        knockDown: 'knockDown',
        dash:      'dash',
        dead:      'dead',
      },
    },

    whirlwind: {
      entry: 'playWhirlwind',
      exit:  'exitWhirlwind',
      on: {
        stop:      'attack',
        hit:       'hit',
        knockDown: 'knockDown',
        dash:      'dash',
        dead:      'dead',
      },
      tags: ['canDamage'],
      // Auto-stop after 2 seconds for AI units
      after: { 2000: 'idle' },
    },

    // ── Air states ───────────────────────────────────────────────

    jump: {
      entry: ['playJump', 'doJump'],
      on: {
        land:      'idle',
        attack:    'airAttack',
        bash:      'airBash',
        jump:      'doubleJump',
        hit:       'hit',
        dash:      'airDash',
        dead:      'dead',
      },
      tags: ['canMove'],
    },

    doubleJump: {
      entry: ['playJump', 'doJump'],
      on: {
        land:      'idle',
        attack:    'airAttack',
        bash:      'airBash',
        hit:       'hit',
        dash:      'airDash',
        dead:      'dead',
      },
      tags: ['canMove'],
    },

    fall: {
      entry: 'playFall',
      on: {
        land:      'idle',
        attack:    'airAttack',
        jump:      'doubleJump',
        hit:       'hit',
        dash:      'airDash',
        dead:      'dead',
      },
      tags: ['canMove'],
    },

    airAttack: {
      entry: 'playAirAttack',
      on: {
        finish:    'fall',
        land:      'idle',
        hit:       'hit',
        dead:      'dead',
      },
      tags: ['canDamage'],
    },

    airBash: {
      entry: 'playAirBash',
      on: {
        finish:    'fall',
        land:      'idle',
        hit:       'hit',
        dead:      'dead',
      },
      tags: ['canDamage', 'knockDown'],
    },

    airDash: {
      entry: 'playAirDash',
      on: {
        finish:    'fall',
        land:      'idle',
        hit:       'hit',
        dead:      'dead',
      },
      after: { 500: 'fall' },
    },

    // ── Defensive ────────────────────────────────────────────────

    block: {
      entry: 'playBlock',
      on: {
        release:   'idle',
        hit:       'hit',
        knockDown: 'knockDown',
        dead:      'dead',
      },
      tags: ['canBlock'],
    },

    dash: {
      entry: 'playDash',
      on: {
        attack:    'dashAttack',
        dead:      'dead',
      },
      after: { 300: 'idle' },
    },

    dashAttack: {
      entry: 'playDashAttack',
      on: {
        finish:    'idle',
        hit:       'hit',
        knockDown: 'knockDown',
        dead:      'dead',
      },
      tags: ['canDamage'],
    },

    // ── Reactive ─────────────────────────────────────────────────

    hit: {
      entry: 'playHit',
      on: {
        hit:       'hit',       // can be re-hit (stunlock)
        knockDown: 'knockDown',
        finish:    'idle',
        dead:      'dead',
      },
    },

    knockDown: {
      entry: 'playKnockDown',
      on: {
        finish: 'idle',
        dead:   'dead',
      },
    },

    dead: {
      entry: 'playDead',
      type:  'final',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════
// AI COOLDOWN STATES — Per-AI-type attack pacing
//
// Prevents AI from spamming attacks. Each personality has
// different cooldowns and patterns.
// ═══════════════════════════════════════════════════════════════════

/** Aggressive AI: attacks frequently, short cooldown */
export const AGGRESSIVE_AI_STATES: FSMConfig = {
  id: 'aggressiveAi',
  initial: 'canAttack',
  states: {
    canAttack: {
      on: {
        attack: 'cooldown',
      },
    },
    cooldown: {
      after: { 1500: 'canAttack' },
    },
  },
};

/** Defensive AI: longer cooldown, more cautious */
export const DEFENSIVE_AI_STATES: FSMConfig = {
  id: 'defensiveAi',
  initial: 'canAttack',
  states: {
    canAttack: {
      on: {
        attack: 'cooldown',
      },
    },
    cooldown: {
      after: { 3500: 'canAttack' },
    },
  },
};

/** Tank AI: slow but relentless */
export const TANK_AI_STATES: FSMConfig = {
  id: 'tankAi',
  initial: 'canAttack',
  states: {
    canAttack: {
      on: {
        attack: 'cooldown',
      },
    },
    cooldown: {
      after: { 4000: 'canAttack' },
    },
  },
};
