// ═══════════════════════════════════════════════════════════════════
// PROFESSION SYSTEM — Shared between client and server
//
// 6 professions: mining, herbalism, woodcutting, fishing, smithing, alchemy.
// Each has 20 levels with increasing XP requirements.
// Higher-tier resource nodes require higher profession levels.
// Block harvesting awards profession XP via BlockRegistry resource data.
// ═══════════════════════════════════════════════════════════════════

// ── Profession Names ──────────────────────────────────────────────

export type ProfessionName =
  | 'mining' | 'herbalism' | 'woodcutting'
  | 'fishing' | 'smithing' | 'alchemy';

export const PROFESSION_NAMES: readonly ProfessionName[] = [
  'mining', 'herbalism', 'woodcutting', 'fishing', 'smithing', 'alchemy',
];

// ── Profession Config ─────────────────────────────────────────────

export interface ProfessionDef {
  name: string;
  icon: string;
  color: string;
  description: string;
  /** Which resource types this profession gathers */
  gatherType: 'ore' | 'herb' | 'wood' | 'fish' | 'craft' | 'brew';
}

export const PROFESSIONS: Record<ProfessionName, ProfessionDef> = {
  mining: {
    name: 'Mining', icon: '⛏', color: '#94a3b8',
    description: 'Extract ores and minerals from the earth.',
    gatherType: 'ore',
  },
  herbalism: {
    name: 'Herbalism', icon: '🌿', color: '#22c55e',
    description: 'Gather herbs and plants for alchemy.',
    gatherType: 'herb',
  },
  woodcutting: {
    name: 'Woodcutting', icon: '🪓', color: '#a16207',
    description: 'Fell trees and collect wood.',
    gatherType: 'wood',
  },
  fishing: {
    name: 'Fishing', icon: '🎣', color: '#3b82f6',
    description: 'Catch fish from rivers, lakes, and oceans.',
    gatherType: 'fish',
  },
  smithing: {
    name: 'Smithing', icon: '🔨', color: '#ef4444',
    description: 'Forge weapons and armor from raw materials.',
    gatherType: 'craft',
  },
  alchemy: {
    name: 'Alchemy', icon: '⚗', color: '#a855f7',
    description: 'Brew potions and elixirs from herbs.',
    gatherType: 'brew',
  },
};

// ── XP Curve ──────────────────────────────────────────────────────

export const MAX_PROFESSION_LEVEL = 20;

/** XP required to reach each level (index = current level, so [0] = XP to reach level 1) */
export const PROFESSION_XP_TABLE: readonly number[] = [
  0, 50, 125, 250, 425, 650, 950, 1325, 1775, 2300,
  2925, 3650, 4475, 5425, 6500, 7725, 9100, 10650, 12375, 14300,
];

/** Get the XP needed to reach the next level from the current level */
export function xpForLevel(level: number): number {
  if (level >= MAX_PROFESSION_LEVEL) return Infinity;
  return PROFESSION_XP_TABLE[level] ?? Infinity;
}

// ── Tier Gating ───────────────────────────────────────────────────
// Resource nodes have a baseTier (from BlockRegistry).
// The player's profession level must meet a minimum to harvest.

/** Minimum profession level required for each resource tier */
export const TIER_LEVEL_REQ: readonly number[] = [
  0,   // Tier 0: no requirement
  1,   // Tier 1: level 1
  5,   // Tier 2: level 5
  10,  // Tier 3: level 10
  14,  // Tier 4: level 14
  17,  // Tier 5: level 17
];

/** Can a player at this profession level harvest a node of this tier? */
export function canHarvest(profLevel: number, nodeTier: number): boolean {
  const req = TIER_LEVEL_REQ[nodeTier] ?? 20;
  return profLevel >= req;
}

// ── XP Multiplier ─────────────────────────────────────────────────
// Higher-tier nodes give more XP. Nodes at or below your level give less.

/** XP multiplier based on level difference (positive = node above level) */
export function xpMultiplier(profLevel: number, nodeTier: number): number {
  const levelForTier = TIER_LEVEL_REQ[nodeTier] ?? 20;
  const diff = levelForTier - profLevel;

  if (diff >= 5)  return 1.5;  // Way above level
  if (diff >= 2)  return 1.25; // Above level
  if (diff >= 0)  return 1.0;  // At level
  if (diff >= -3) return 0.75; // Slightly below
  return 0.5;                  // Way below
}

// ── Profession State ──────────────────────────────────────────────

export interface ProfessionState {
  level: number;
  xp: number;
}

export type ProfessionMap = Record<ProfessionName, ProfessionState>;

/** Create a fresh profession map (all at level 1, 0 XP) */
export function createEmptyProfessions(): ProfessionMap {
  const map = {} as ProfessionMap;
  for (const name of PROFESSION_NAMES) {
    map[name] = { level: 1, xp: 0 };
  }
  return map;
}

/**
 * Award XP to a profession. Returns true if the player leveled up.
 */
export function awardProfessionXP(
  state: ProfessionState,
  baseXP: number,
  profLevel: number,
  nodeTier: number,
): boolean {
  if (state.level >= MAX_PROFESSION_LEVEL) return false;

  const mult = xpMultiplier(profLevel, nodeTier);
  const xp = Math.round(baseXP * mult);
  state.xp += xp;

  // Check for level up (can level multiple times from one big XP dump)
  let leveledUp = false;
  while (state.level < MAX_PROFESSION_LEVEL && state.xp >= xpForLevel(state.level)) {
    state.xp -= xpForLevel(state.level);
    state.level++;
    leveledUp = true;
  }

  return leveledUp;
}

/**
 * Get the XP progress toward next level as a percentage (0–100).
 */
export function professionProgress(state: ProfessionState): number {
  if (state.level >= MAX_PROFESSION_LEVEL) return 100;
  const needed = xpForLevel(state.level);
  if (needed <= 0) return 100;
  return Math.min(100, (state.xp / needed) * 100);
}
