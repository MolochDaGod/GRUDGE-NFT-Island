// ═══════════════════════════════════════════════════════════════════
// COMBAT FORMULAS — Shared between client (prediction) and server (authority)
//
// Ported from: grudge_attributes.js, ai_combat_brain.js
// Source of truth for all combat math in Grudge Warlords.
//
// 8 attributes × 160 total points (8 per level, 20 levels)
// Each attribute feeds multiple derived stats via a gains table.
// Diminishing returns kick in after 50 points in a single attribute.
// ═══════════════════════════════════════════════════════════════════

// ── Configuration ─────────────────────────────────────────────────

export const COMBAT_CONFIG = {
  MAX_LEVEL: 20,
  POINTS_PER_LEVEL: 8,
  TOTAL_POINTS: 160,
  MAX_ATTRIBUTE_POINTS: 160,
  DIMINISHING_THRESHOLD: 50,

  /** XP required to reach each level (index = current level) */
  XP_PER_LEVEL: [
    0, 100, 250, 500, 850, 1300, 1900, 2650, 3550, 4600,
    5850, 7300, 8950, 10850, 13000, 15450, 18200, 21300, 24800, 28750,
  ] as readonly number[],
} as const;

// ── Attribute Names ───────────────────────────────────────────────

export type AttributeName =
  | 'strength' | 'intellect' | 'vitality' | 'dexterity'
  | 'endurance' | 'wisdom' | 'agility' | 'tactics';

export const ATTRIBUTE_NAMES: readonly AttributeName[] = [
  'strength', 'intellect', 'vitality', 'dexterity',
  'endurance', 'wisdom', 'agility', 'tactics',
];

// ── Attribute Gains Table ─────────────────────────────────────────
// Each point in an attribute grants these derived stat bonuses.
// Ported directly from grudge_attributes.js ATTRIBUTES definition.

export interface AttributeGains {
  health?: number;
  mana?: number;
  stamina?: number;
  damage?: number;
  defense?: number;
  block?: number;
  blockEffect?: number;
  evasion?: number;
  accuracy?: number;
  criticalChance?: number;
  criticalDamage?: number;
  attackSpeed?: number;
  movementSpeed?: number;
  resistance?: number;
  armor?: number;
  damageReduction?: number;
  healthRegen?: number;
  manaRegen?: number;
  cooldownReduction?: number;
  spellAccuracy?: number;
  stagger?: number;
  drainHealth?: number;
  abilityCost?: number;
  armorPenetration?: number;
  blockPenetration?: number;
  defenseBreak?: number;
  dodge?: number;
  reflexTime?: number;
  ccResistance?: number;
  bleedResist?: number;
  statusEffect?: number;
  spellblock?: number;
  criticalEvasion?: number;
  fallDamage?: number;
  comboCooldownRed?: number;
}

export interface AttributeDef {
  name: string;
  color: string;
  gains: AttributeGains;
  /** Tactics special: 0.5% global bonus to non-resource stats per point */
  globalBonus?: number;
}

export const ATTRIBUTES: Record<AttributeName, AttributeDef> = {
  strength: {
    name: 'Strength', color: '#cc3333',
    gains: {
      health: 5, damage: 1.25, defense: 4, block: 0.2, drainHealth: 0.075,
      stagger: 0.04, mana: 1, stamina: 0.8, accuracy: 0.08,
      healthRegen: 0.02, damageReduction: 0.02,
    },
  },
  intellect: {
    name: 'Intellect', color: '#aa33aa',
    gains: {
      mana: 9, damage: 1.5, defense: 2, manaRegen: 0.04,
      cooldownReduction: 0.075, spellAccuracy: 0.15,
      health: 3, stamina: 0.4, accuracy: 0.1, abilityCost: 0.05,
    },
  },
  vitality: {
    name: 'Vitality', color: '#33aa33',
    gains: {
      health: 25, defense: 1.5, healthRegen: 0.06, damageReduction: 0.04,
      bleedResist: 0.15, mana: 1.5, stamina: 1, resistance: 0.08, armor: 0.2,
    },
  },
  dexterity: {
    name: 'Dexterity', color: '#cccc33',
    gains: {
      damage: 0.9, criticalChance: 0.3, accuracy: 0.25, attackSpeed: 0.2,
      evasion: 0.125, criticalDamage: 0.2, defense: 1.2, stamina: 0.6,
      movementSpeed: 0.08, reflexTime: 0.03, health: 3,
    },
  },
  endurance: {
    name: 'Endurance', color: '#cc8833',
    gains: {
      stamina: 6, defense: 5, blockEffect: 0.175, ccResistance: 0.1,
      armor: 0.6, health: 8, mana: 1, healthRegen: 0.02, block: 0.12,
    },
  },
  wisdom: {
    name: 'Wisdom', color: '#33aacc',
    gains: {
      mana: 6, defense: 5.5, resistance: 0.25, statusEffect: 0.075,
      spellblock: 0.125, health: 4, stamina: 0.5,
      damageReduction: 0.03, spellAccuracy: 0.1,
    },
  },
  agility: {
    name: 'Agility', color: '#338888',
    gains: {
      movementSpeed: 0.15, evasion: 0.225, dodge: 0.15, reflexTime: 0.04,
      criticalEvasion: 0.25, fallDamage: 0.2, stamina: 1,
      accuracy: 0.1, attackSpeed: 0.05, damage: 0.3, health: 3,
    },
  },
  tactics: {
    name: 'Tactics', color: '#cc33cc',
    gains: {
      stamina: 3, abilityCost: 0.075, armorPenetration: 0.2,
      blockPenetration: 0.175, defenseBreak: 0.1, comboCooldownRed: 0.125,
      damage: 0.4, defense: 1, mana: 1.5, cooldownReduction: 0.05, health: 3,
    },
    globalBonus: 0.5,
  },
};

// ── Derived Stats ─────────────────────────────────────────────────

export interface DerivedStats {
  health: number;
  mana: number;
  stamina: number;
  damage: number;
  defense: number;
  block: number;
  blockEffect: number;
  evasion: number;
  accuracy: number;
  criticalChance: number;
  criticalDamage: number;
  attackSpeed: number;
  movementSpeed: number;
  resistance: number;
  armor: number;
  damageReduction: number;
  healthRegen: number;
  manaRegen: number;
  cooldownReduction: number;
  spellAccuracy: number;
  stagger: number;
  drainHealth: number;
  abilityCost: number;
  armorPenetration: number;
  blockPenetration: number;
  defenseBreak: number;
  dodge: number;
  reflexTime: number;
  ccResistance: number;
  bleedResist: number;
  statusEffect: number;
  spellblock: number;
  criticalEvasion: number;
  fallDamage: number;
  comboCooldownRed: number;
}

export const BASE_STATS: DerivedStats = {
  health: 250, mana: 100, stamina: 100,
  damage: 0, defense: 0, block: 0, blockEffect: 0,
  evasion: 0, accuracy: 0, criticalChance: 0, criticalDamage: 0,
  attackSpeed: 0, movementSpeed: 0, resistance: 0, armor: 0,
  damageReduction: 0, healthRegen: 0, manaRegen: 0,
  cooldownReduction: 0, spellAccuracy: 0, stagger: 0, drainHealth: 0,
  abilityCost: 0, armorPenetration: 0, blockPenetration: 0,
  defenseBreak: 0, dodge: 0, reflexTime: 0, ccResistance: 0,
  bleedResist: 0, statusEffect: 0, spellblock: 0,
  criticalEvasion: 0, fallDamage: 0, comboCooldownRed: 0,
};

// ── Attribute Point Allocation ────────────────────────────────────

export type AttributeMap = Record<AttributeName, number>;

export function createEmptyAttributes(): AttributeMap {
  return {
    strength: 0, intellect: 0, vitality: 0, dexterity: 0,
    endurance: 0, wisdom: 0, agility: 0, tactics: 0,
  };
}

// ── Diminishing Returns ───────────────────────────────────────────

/** Beyond the threshold, each point is worth 50% less */
export function applyDiminishingReturns(points: number): number {
  const threshold = COMBAT_CONFIG.DIMINISHING_THRESHOLD;
  if (points <= threshold) return points;
  return threshold + (points - threshold) * 0.5;
}

// ── Derived Stat Calculation ──────────────────────────────────────

/**
 * Calculate all derived stats from an attribute allocation.
 * This is THE formula — same on client and server.
 */
export function calculateDerivedStats(attributes: AttributeMap): DerivedStats {
  const stats = { ...BASE_STATS };

  for (const attrName of ATTRIBUTE_NAMES) {
    const attrDef = ATTRIBUTES[attrName];
    const rawPoints = attributes[attrName];
    const effectivePoints = applyDiminishingReturns(rawPoints);

    for (const [statName, gainPerPoint] of Object.entries(attrDef.gains)) {
      const key = statName as keyof DerivedStats;
      if (key in stats) {
        (stats[key] as number) += (gainPerPoint as number) * effectivePoints;
      }
    }
  }

  // Tactics global bonus: +0.5% per point to all non-resource stats
  const tacticsPoints = attributes.tactics;
  if (tacticsPoints > 0 && ATTRIBUTES.tactics.globalBonus) {
    const multiplier = 1 + (tacticsPoints * ATTRIBUTES.tactics.globalBonus / 100);
    for (const key of Object.keys(stats) as (keyof DerivedStats)[]) {
      if (key !== 'health' && key !== 'mana' && key !== 'stamina') {
        (stats[key] as number) *= multiplier;
      }
    }
  }

  return stats;
}

// ── Combat Power ──────────────────────────────────────────────────

/**
 * Single-number combat rating.
 * EHP = Health × (1 + Defense/100) × (1 + Resistance/100)
 * DPS = (Damage + 10) × (1 + CritChance × CritDamage / 10000) × (1 + AttackSpeed/100)
 * Utility = CDR×2 + ManaRegen×10 + MoveSpeed×2
 * CP = (EHP × 0.4) + (DPS × 2.5) + (Utility × 5)
 */
export function calculateCombatPower(stats: DerivedStats): number {
  const ehp = stats.health * (1 + stats.defense / 100) * (1 + stats.resistance / 100);
  const dps = (stats.damage + 10)
    * (1 + (stats.criticalChance * stats.criticalDamage) / 10000)
    * (1 + stats.attackSpeed / 100);
  const utility = (stats.cooldownReduction * 2)
    + (stats.manaRegen * 10)
    + (stats.movementSpeed * 2);
  return Math.floor((ehp * 0.4) + (dps * 2.5) + (utility * 5));
}

// ── Damage Calculation ────────────────────────────────────────────

export interface DamageResult {
  rawDamage: number;
  finalDamage: number;
  isCrit: boolean;
  isHit: boolean;
  blocked: number;
  mitigated: number;
}

/**
 * Calculate damage from attacker to defender.
 * Both sides use the same derived stats structure.
 */
export function calculateDamage(
  attackerStats: DerivedStats,
  defenderStats: DerivedStats,
  weaponBaseDamage: number,
  options: {
    isParryable?: boolean;
    armorPenetrationBonus?: number;
    damageMultiplier?: number;
  } = {},
): DamageResult {
  // Hit check: accuracy vs evasion
  const hitChance = calculateHitChance(attackerStats, defenderStats);
  const isHit = Math.random() < hitChance;
  if (!isHit) {
    return { rawDamage: 0, finalDamage: 0, isCrit: false, isHit: false, blocked: 0, mitigated: 0 };
  }

  // Base damage
  let rawDamage = weaponBaseDamage + attackerStats.damage;
  rawDamage *= (options.damageMultiplier ?? 1);

  // Crit check
  const isCrit = Math.random() < (attackerStats.criticalChance / 100);
  if (isCrit) {
    rawDamage *= 1.5 + (attackerStats.criticalDamage / 100);
  }

  // Armor mitigation
  const effectiveArmor = Math.max(0, defenderStats.armor - (attackerStats.armorPenetration + (options.armorPenetrationBonus ?? 0)));
  const armorReduction = effectiveArmor / (effectiveArmor + 100); // Diminishing formula
  let mitigated = rawDamage * armorReduction;

  // Defense flat reduction
  mitigated += defenderStats.defense * 0.5;

  // Damage reduction percentage
  const drPercent = Math.min(defenderStats.damageReduction / 100, 0.75); // Cap at 75%
  mitigated += rawDamage * drPercent;

  // Block (if defender is blocking)
  const blocked = 0; // Handled by ParrySystem separately

  const finalDamage = Math.max(1, rawDamage - mitigated - blocked);

  return { rawDamage, finalDamage, isCrit, isHit, blocked, mitigated };
}

// ── Hit Chance ────────────────────────────────────────────────────

/**
 * Accuracy vs Evasion hit chance formula.
 * Ported from ai_combat_brain.js calculateHitChance.
 */
export function calculateHitChance(
  attackerStats: DerivedStats,
  defenderStats: DerivedStats,
): number {
  let missChance = 0.12; // 12% base miss rate
  missChance -= attackerStats.accuracy * 0.005;
  missChance += defenderStats.evasion * 0.01;
  missChance = Math.max(0.02, Math.min(0.50, missChance));
  return 1 - missChance;
}

// ── AI Attribute Generation ───────────────────────────────────────
// Used by server to generate NPC stat blocks.

export type NPCClass = 'warrior' | 'mage' | 'ranger' | 'worge';
export type NPCRace = 'human' | 'orc' | 'elf' | 'dwarf' | 'barbarian' | 'undead';
export type NPCRole = 'captain' | 'first_mate' | 'veteran' | 'scout' | 'recruit';

const CLASS_WEIGHTS: Record<NPCClass, Partial<AttributeMap>> = {
  warrior: { strength: 3, vitality: 3, endurance: 2, dexterity: 1, agility: 1 },
  mage:    { intellect: 4, wisdom: 3, vitality: 1, agility: 1, tactics: 1 },
  ranger:  { dexterity: 4, agility: 3, tactics: 2, strength: 1 },
  worge:   { vitality: 2, strength: 2, agility: 2, endurance: 2, wisdom: 2 },
};

const RACE_MODIFIERS: Record<NPCRace, Partial<Record<AttributeName, number>>> = {
  barbarian: { strength: 1.2, vitality: 1.1 },
  dwarf:     { endurance: 1.3, strength: 1.1 },
  elf:       { intellect: 1.2, agility: 1.2, dexterity: 1.1 },
  human:     {},
  orc:       { strength: 1.3, vitality: 1.1 },
  undead:    { intellect: 1.2, wisdom: 1.1 },
};

/** AI difficulty by crew role (0-1 scale) */
export const DIFFICULTY_BY_ROLE: Record<NPCRole, number> = {
  captain: 0.85,
  first_mate: 0.75,
  veteran: 0.70,
  scout: 0.55,
  recruit: 0.40,
};

/**
 * Generate a complete attribute allocation for an AI NPC.
 * Same formula as players: level * 8 points, distributed by class weights.
 */
export function generateAIAttributes(
  level: number,
  npcClass: NPCClass,
  race: NPCRace,
): AttributeMap {
  const attributes = createEmptyAttributes();
  const totalPoints = level * COMBAT_CONFIG.POINTS_PER_LEVEL;

  const weights = CLASS_WEIGHTS[npcClass] ?? CLASS_WEIGHTS.warrior;
  const raceMod = RACE_MODIFIERS[race] ?? {};

  let totalWeight = 0;
  for (const w of Object.values(weights)) totalWeight += w ?? 0;

  for (const [attr, weight] of Object.entries(weights)) {
    if (!weight) continue;
    let points = Math.floor((weight / totalWeight) * totalPoints);

    const raceMultiplier = raceMod[attr as AttributeName];
    if (raceMultiplier) points = Math.floor(points * raceMultiplier);

    // ±15% randomness
    points = Math.floor(points * (0.85 + Math.random() * 0.30));
    attributes[attr as AttributeName] = points;
  }

  return attributes;
}

// ── XP & Leveling Helpers ─────────────────────────────────────────

export function xpForNextLevel(currentLevel: number): number {
  if (currentLevel >= COMBAT_CONFIG.MAX_LEVEL) return 0;
  return COMBAT_CONFIG.XP_PER_LEVEL[currentLevel] ?? 0;
}

export function totalXpToLevel(targetLevel: number): number {
  let total = 0;
  for (let i = 1; i < targetLevel && i < COMBAT_CONFIG.XP_PER_LEVEL.length; i++) {
    total += COMBAT_CONFIG.XP_PER_LEVEL[i];
  }
  return total;
}
