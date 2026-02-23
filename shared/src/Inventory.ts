// ═══════════════════════════════════════════════════════════════════
// INVENTORY & ITEM SYSTEM — Shared between client and server
//
// Defines item types, rarities, equipment slots, and a bag-style
// inventory with stacking, equip/unequip, and slot validation.
//
// ITEM TYPES: weapon, armor, shield, consumable, resource, relic, cape
// EQUIPMENT SLOTS: 9 slots matching EquipmentSystem bone attachment
// RARITIES: common → legendary (affects stat scaling)
// ═══════════════════════════════════════════════════════════════════

// ── Item Rarity ───────────────────────────────────────────────────

export enum Rarity {
  COMMON    = 'common',
  UNCOMMON  = 'uncommon',
  RARE      = 'rare',
  EPIC      = 'epic',
  LEGENDARY = 'legendary',
}

export const RARITY_COLORS: Record<Rarity, string> = {
  [Rarity.COMMON]:    '#9ca3af',
  [Rarity.UNCOMMON]:  '#22c55e',
  [Rarity.RARE]:      '#3b82f6',
  [Rarity.EPIC]:      '#a855f7',
  [Rarity.LEGENDARY]: '#f97316',
};

// ── Item Type ─────────────────────────────────────────────────────

export type ItemType =
  | 'weapon' | 'armor' | 'shield'
  | 'consumable' | 'resource'
  | 'relic' | 'cape' | 'curio';

// ── Weapon Type (maps to AnimStateMachine weapon packs) ───────────

export type WeaponType =
  | 'sword' | '2h_sword' | 'axe' | '2h_axe' | 'mace' | 'hammer'
  | 'dagger' | 'spear' | 'staff' | 'bow' | 'crossbow' | 'gun'
  | 'wand' | 'tome' | 'shield' | 'off_hand_relic' | 'unarmed';

// ── Armor Slot ────────────────────────────────────────────────────

export type ArmorSlot = 'head' | 'chest' | 'legs' | 'boots';
export type ArmorWeight = 'cloth' | 'leather' | 'metal';

// ── Equipment Slot ────────────────────────────────────────────────

export type EquipSlot =
  | 'mainHand' | 'offHand'
  | 'head' | 'chest' | 'legs' | 'boots'
  | 'cape' | 'relic1' | 'relic2';

// ── Curio Slot (soulbound, non-droppable) ─────────────────────────

export type CurioSlot = 'harvestTool' | 'spellBook' | 'racialTrinket';

export const CURIO_SLOT_NAMES: Record<CurioSlot, string> = {
  harvestTool:    'Harvest Tool',
  spellBook:      'Spell Book',
  racialTrinket:  'Racial Trinket',
};

export const EQUIP_SLOT_NAMES: Record<EquipSlot, string> = {
  mainHand: 'Main Hand',
  offHand:  'Off Hand',
  head:     'Head',
  chest:    'Chest',
  legs:     'Legs',
  boots:    'Boots',
  cape:     'Cape',
  relic1:   'Relic 1',
  relic2:   'Relic 2',
};

// ── Item Stats ────────────────────────────────────────────────────

export interface ItemStats {
  damage?: number;
  defense?: number;
  health?: number;
  mana?: number;
  stamina?: number;
  criticalChance?: number;
  criticalDamage?: number;
  attackSpeed?: number;
  movementSpeed?: number;
  block?: number;
  resistance?: number;
  cooldownReduction?: number;
}

// ── Item Definition ───────────────────────────────────────────────

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  rarity: Rarity;
  /** Which slot(s) this item can equip to */
  equipSlot?: EquipSlot;
  /** For weapons: what weapon type (determines anim pack) */
  weaponType?: WeaponType;
  /** For armor: weight class */
  armorWeight?: ArmorWeight;
  /** Stat bonuses */
  stats: ItemStats;
  /** Max stack size (default 1 for equipment, 64 for resources) */
  maxStack: number;
  /** Level requirement */
  levelReq: number;
  /** Description text */
  description: string;
  /** Asset filename (for 3D model in EquipmentSystem) */
  modelFile?: string;
  /** Icon atlas index (for UI) */
  iconIndex: number;
  /** Cape cooldown in seconds (for cape active effect) */
  capeCooldown?: number;
  /** Relic active ability (if any) */
  relicAbility?: string;
  /** Is this a soulbound curio? (cannot be dropped, traded, or unequipped) */
  isCurio?: boolean;
  /** Which curio slot this occupies */
  curioSlot?: CurioSlot;
}

// ── Inventory Slot ────────────────────────────────────────────────

export interface InvSlot {
  itemId: string;
  count: number;
}

// ── Item Database (starter set) ───────────────────────────────────

export const ITEMS: Record<string, ItemDef> = {
  // === WEAPONS ===
  'iron_sword': {
    id: 'iron_sword', name: 'Iron Sword', type: 'weapon', rarity: Rarity.COMMON,
    equipSlot: 'mainHand', weaponType: 'sword',
    stats: { damage: 12, attackSpeed: 1.0 }, maxStack: 1, levelReq: 1,
    description: 'A sturdy iron blade.', iconIndex: 0,
  },
  'steel_greatsword': {
    id: 'steel_greatsword', name: 'Steel Greatsword', type: 'weapon', rarity: Rarity.UNCOMMON,
    equipSlot: 'mainHand', weaponType: '2h_sword',
    stats: { damage: 22, attackSpeed: 0.7, criticalDamage: 10 }, maxStack: 1, levelReq: 5,
    description: 'A heavy two-handed blade.', iconIndex: 1,
  },
  'hunting_bow': {
    id: 'hunting_bow', name: 'Hunting Bow', type: 'weapon', rarity: Rarity.COMMON,
    equipSlot: 'mainHand', weaponType: 'bow',
    stats: { damage: 9, attackSpeed: 1.2 }, maxStack: 1, levelReq: 1,
    description: 'A simple wooden bow.', iconIndex: 2,
  },
  'oak_staff': {
    id: 'oak_staff', name: 'Oak Staff', type: 'weapon', rarity: Rarity.COMMON,
    equipSlot: 'mainHand', weaponType: 'staff',
    stats: { damage: 8, mana: 20, cooldownReduction: 3 }, maxStack: 1, levelReq: 1,
    description: 'A gnarled oak staff humming with faint energy.', iconIndex: 3,
  },
  'iron_axe': {
    id: 'iron_axe', name: 'Iron Axe', type: 'weapon', rarity: Rarity.COMMON,
    equipSlot: 'mainHand', weaponType: 'axe',
    stats: { damage: 14, attackSpeed: 0.9 }, maxStack: 1, levelReq: 1,
    description: 'A sharp iron axe.', iconIndex: 4,
  },

  // === SHIELDS ===
  'wooden_shield': {
    id: 'wooden_shield', name: 'Wooden Shield', type: 'shield', rarity: Rarity.COMMON,
    equipSlot: 'offHand', weaponType: 'shield',
    stats: { defense: 8, block: 12 }, maxStack: 1, levelReq: 1,
    description: 'A simple wooden shield.', iconIndex: 10,
  },
  'iron_shield': {
    id: 'iron_shield', name: 'Iron Shield', type: 'shield', rarity: Rarity.UNCOMMON,
    equipSlot: 'offHand', weaponType: 'shield',
    stats: { defense: 15, block: 20, health: 25 }, maxStack: 1, levelReq: 5,
    description: 'A reinforced iron kite shield.', iconIndex: 11,
  },

  // === ARMOR ===
  'leather_cap': {
    id: 'leather_cap', name: 'Leather Cap', type: 'armor', rarity: Rarity.COMMON,
    equipSlot: 'head', armorWeight: 'leather',
    stats: { defense: 4, health: 10 }, maxStack: 1, levelReq: 1,
    description: 'A simple leather helmet.', iconIndex: 20,
  },
  'iron_chestplate': {
    id: 'iron_chestplate', name: 'Iron Chestplate', type: 'armor', rarity: Rarity.UNCOMMON,
    equipSlot: 'chest', armorWeight: 'metal',
    stats: { defense: 18, health: 30 }, maxStack: 1, levelReq: 5,
    description: 'Heavy iron chest armor.', iconIndex: 21,
  },
  'cloth_robe': {
    id: 'cloth_robe', name: 'Cloth Robe', type: 'armor', rarity: Rarity.COMMON,
    equipSlot: 'chest', armorWeight: 'cloth',
    stats: { defense: 3, mana: 25, resistance: 5 }, maxStack: 1, levelReq: 1,
    description: 'A simple mage\'s robe.', iconIndex: 22,
  },
  'leather_pants': {
    id: 'leather_pants', name: 'Leather Pants', type: 'armor', rarity: Rarity.COMMON,
    equipSlot: 'legs', armorWeight: 'leather',
    stats: { defense: 6, stamina: 10 }, maxStack: 1, levelReq: 1,
    description: 'Sturdy leather legwear.', iconIndex: 23,
  },
  'iron_boots': {
    id: 'iron_boots', name: 'Iron Boots', type: 'armor', rarity: Rarity.COMMON,
    equipSlot: 'boots', armorWeight: 'metal',
    stats: { defense: 5, movementSpeed: -2 }, maxStack: 1, levelReq: 3,
    description: 'Heavy iron boots. Slow but protective.', iconIndex: 24,
  },

  // === CAPES ===
  'traveler_cloak': {
    id: 'traveler_cloak', name: 'Traveler\'s Cloak', type: 'cape', rarity: Rarity.COMMON,
    equipSlot: 'cape',
    stats: { movementSpeed: 5 }, maxStack: 1, levelReq: 1,
    description: 'A light cloak that quickens your step.', iconIndex: 30,
    capeCooldown: 30,
  },

  // === RELICS ===
  'ruby_pendant': {
    id: 'ruby_pendant', name: 'Ruby Pendant', type: 'relic', rarity: Rarity.RARE,
    equipSlot: 'relic1',
    stats: { damage: 5, criticalChance: 3 }, maxStack: 1, levelReq: 5,
    description: 'A glowing ruby that sharpens your strikes.', iconIndex: 40,
    relicAbility: 'fire_burst',
  },

  // === CONSUMABLES ===
  'health_potion': {
    id: 'health_potion', name: 'Health Potion', type: 'consumable', rarity: Rarity.COMMON,
    stats: { health: 50 }, maxStack: 20, levelReq: 1,
    description: 'Restores 50 health.', iconIndex: 50,
  },
  'mana_potion': {
    id: 'mana_potion', name: 'Mana Potion', type: 'consumable', rarity: Rarity.COMMON,
    stats: { mana: 40 }, maxStack: 20, levelReq: 1,
    description: 'Restores 40 mana.', iconIndex: 51,
  },

  // === RESOURCES ===
  'iron_ore_item': {
    id: 'iron_ore_item', name: 'Iron Ore', type: 'resource', rarity: Rarity.COMMON,
    stats: {}, maxStack: 64, levelReq: 0,
    description: 'Raw iron ore. Can be smelted.', iconIndex: 60,
  },
  'gold_ore_item': {
    id: 'gold_ore_item', name: 'Gold Ore', type: 'resource', rarity: Rarity.UNCOMMON,
    stats: {}, maxStack: 64, levelReq: 0,
    description: 'Raw gold ore. Valuable.', iconIndex: 61,
  },
  'wood_plank': {
    id: 'wood_plank', name: 'Wood Plank', type: 'resource', rarity: Rarity.COMMON,
    stats: {}, maxStack: 64, levelReq: 0,
    description: 'A plank of cut wood.', iconIndex: 62,
  },
  'herb_bundle': {
    id: 'herb_bundle', name: 'Herb Bundle', type: 'resource', rarity: Rarity.COMMON,
    stats: {}, maxStack: 64, levelReq: 0,
    description: 'A bundle of gathered herbs.', iconIndex: 63,
  },

  // ═══════════════════════════════════════════════════════════════
  // CURIOS — Soulbound, non-droppable class/race items
  // ═══════════════════════════════════════════════════════════════

  // === HARVEST TOOLS (one per class) ===
  'warrior_pickaxe': {
    id: 'warrior_pickaxe', name: 'War Pickaxe', type: 'curio', rarity: Rarity.UNCOMMON,
    stats: { attackSpeed: 1.0 }, maxStack: 1, levelReq: 1,
    description: 'A heavy military-grade pickaxe. Mines ores with brute force.',
    iconIndex: 100, isCurio: true, curioSlot: 'harvestTool',
  },
  'ranger_skinning_knife': {
    id: 'ranger_skinning_knife', name: 'Skinning Knife', type: 'curio', rarity: Rarity.UNCOMMON,
    stats: { attackSpeed: 1.2 }, maxStack: 1, levelReq: 1,
    description: 'A razor-sharp blade for harvesting herbs and skinning pelts.',
    iconIndex: 101, isCurio: true, curioSlot: 'harvestTool',
  },
  'mage_crystal_lens': {
    id: 'mage_crystal_lens', name: 'Crystal Lens', type: 'curio', rarity: Rarity.UNCOMMON,
    stats: { attackSpeed: 0.8, mana: 10 }, maxStack: 1, levelReq: 1,
    description: 'A focusing lens that fractures stone with arcane resonance.',
    iconIndex: 102, isCurio: true, curioSlot: 'harvestTool',
  },
  'worge_claws': {
    id: 'worge_claws', name: 'Primal Claws', type: 'curio', rarity: Rarity.UNCOMMON,
    stats: { attackSpeed: 1.4 }, maxStack: 1, levelReq: 1,
    description: 'Retractable beast claws. Tear through earth and bark alike.',
    iconIndex: 103, isCurio: true, curioSlot: 'harvestTool',
  },

  // === SPELL BOOKS (one per class) ===
  'warrior_battle_manual': {
    id: 'warrior_battle_manual', name: 'Battle Manual', type: 'curio', rarity: Rarity.UNCOMMON,
    stats: { damage: 2, stamina: 5 }, maxStack: 1, levelReq: 1,
    description: 'Tactical combat doctrines of the war colleges. Teaches weapon skills.',
    iconIndex: 110, isCurio: true, curioSlot: 'spellBook',
  },
  'ranger_fieldcraft_tome': {
    id: 'ranger_fieldcraft_tome', name: 'Fieldcraft Tome', type: 'curio', rarity: Rarity.UNCOMMON,
    stats: { criticalChance: 2, movementSpeed: 1 }, maxStack: 1, levelReq: 1,
    description: 'Survival and tracking techniques of the ranger guilds.',
    iconIndex: 111, isCurio: true, curioSlot: 'spellBook',
  },
  'mage_arcane_grimoire': {
    id: 'mage_arcane_grimoire', name: 'Arcane Grimoire', type: 'curio', rarity: Rarity.UNCOMMON,
    stats: { mana: 15, cooldownReduction: 2 }, maxStack: 1, levelReq: 1,
    description: 'A tome of arcane incantations and spell formulae.',
    iconIndex: 112, isCurio: true, curioSlot: 'spellBook',
  },
  'worge_primal_codex': {
    id: 'worge_primal_codex', name: 'Primal Codex', type: 'curio', rarity: Rarity.UNCOMMON,
    stats: { health: 10, stamina: 5 }, maxStack: 1, levelReq: 1,
    description: 'Ancient rites of the shapeshifters. Channels primal fury.',
    iconIndex: 113, isCurio: true, curioSlot: 'spellBook',
  },

  // === RACIAL TRINKETS (one per race) ===
  'human_signet': {
    id: 'human_signet', name: 'Human Signet Ring', type: 'curio', rarity: Rarity.RARE,
    stats: { damage: 1, defense: 1, health: 5 }, maxStack: 1, levelReq: 1,
    description: 'A balanced signet of the human kingdoms. Jack of all trades.',
    iconIndex: 120, isCurio: true, curioSlot: 'racialTrinket',
  },
  'orc_warbone': {
    id: 'orc_warbone', name: 'Orc Warbone Tusk', type: 'curio', rarity: Rarity.RARE,
    stats: { damage: 3, health: 8 }, maxStack: 1, levelReq: 1,
    description: 'A trophy tusk that pulses with orcish battle rage.',
    iconIndex: 121, isCurio: true, curioSlot: 'racialTrinket',
  },
  'elf_moonstone': {
    id: 'elf_moonstone', name: 'Elven Moonstone', type: 'curio', rarity: Rarity.RARE,
    stats: { mana: 10, cooldownReduction: 1, movementSpeed: 1 }, maxStack: 1, levelReq: 1,
    description: 'A luminous gem attuned to the elven leylines.',
    iconIndex: 122, isCurio: true, curioSlot: 'racialTrinket',
  },
  'dwarf_anvilcharm': {
    id: 'dwarf_anvilcharm', name: 'Dwarf Anvilcharm', type: 'curio', rarity: Rarity.RARE,
    stats: { defense: 3, stamina: 8 }, maxStack: 1, levelReq: 1,
    description: 'A miniature anvil charm blessed by the forge-fathers.',
    iconIndex: 123, isCurio: true, curioSlot: 'racialTrinket',
  },
  'barbarian_totem': {
    id: 'barbarian_totem', name: 'Barbarian War Totem', type: 'curio', rarity: Rarity.RARE,
    stats: { damage: 2, health: 10 }, maxStack: 1, levelReq: 1,
    description: 'A bone totem carved by tribal shamans. Radiates ferocity.',
    iconIndex: 124, isCurio: true, curioSlot: 'racialTrinket',
  },
  'undead_phylactery': {
    id: 'undead_phylactery', name: 'Undead Phylactery', type: 'curio', rarity: Rarity.RARE,
    stats: { mana: 8, resistance: 3 }, maxStack: 1, levelReq: 1,
    description: 'A dark vessel binding soul to flesh. Resists holy and arcane.',
    iconIndex: 125, isCurio: true, curioSlot: 'racialTrinket',
  },
};

/** Look up an item definition by ID */
export function getItemDef(id: string): ItemDef | undefined {
  return ITEMS[id];
}

// ── Starter Curio Mapping ─────────────────────────────────────────

const CLASS_HARVEST_TOOL: Record<string, string> = {
  WARRIOR: 'warrior_pickaxe',
  RANGER:  'ranger_skinning_knife',
  MAGE:    'mage_crystal_lens',
  WORGE:   'worge_claws',
};

const CLASS_SPELL_BOOK: Record<string, string> = {
  WARRIOR: 'warrior_battle_manual',
  RANGER:  'ranger_fieldcraft_tome',
  MAGE:    'mage_arcane_grimoire',
  WORGE:   'worge_primal_codex',
};

const RACE_TRINKET: Record<string, string> = {
  HUMAN:     'human_signet',
  ORC:       'orc_warbone',
  ELF:       'elf_moonstone',
  DWARF:     'dwarf_anvilcharm',
  BARBARIAN: 'barbarian_totem',
  UNDEAD:    'undead_phylactery',
};

/** Get the starter curio item IDs for a class + race combination */
export function getStarterCurios(
  playerClass: string,
  race: string,
): { harvestTool: string; spellBook: string; racialTrinket: string } {
  return {
    harvestTool:   CLASS_HARVEST_TOOL[playerClass.toUpperCase()] ?? CLASS_HARVEST_TOOL.WARRIOR,
    spellBook:     CLASS_SPELL_BOOK[playerClass.toUpperCase()] ?? CLASS_SPELL_BOOK.WARRIOR,
    racialTrinket: RACE_TRINKET[race.toUpperCase()] ?? RACE_TRINKET.HUMAN,
  };
}

// ── Hotbar Constants ────────────────────────────────────────────

/** Hotbar = first N bag slots (Minecraft pattern: bag[0..7] = hotbar) */
export const HOTBAR_SIZE = 8;

// ── Inventory Class ───────────────────────────────────────────────

export class Inventory {
  /** Bag slots (fixed size). Slots 0..HOTBAR_SIZE-1 = hotbar row. */
  readonly slots: (InvSlot | null)[];
  readonly size: number;

  /** Equipment slots */
  readonly equipment: Partial<Record<EquipSlot, InvSlot>> = {};

  /** Curio slots (soulbound, non-droppable) */
  readonly curios: Partial<Record<CurioSlot, InvSlot>> = {};

  /** Currently selected hotbar slot (0-based, 0..HOTBAR_SIZE-1) */
  selectedHotbar = 0;

  constructor(size = 40) {
    this.size = size;
    this.slots = new Array(size).fill(null);
  }

  // ── Hotbar Operations ────────────────────────────────────────

  /** Get the item in a hotbar slot (0-based index) */
  getHotbarItem(index: number): ItemDef | undefined {
    if (index < 0 || index >= HOTBAR_SIZE) return undefined;
    const slot = this.slots[index];
    return slot ? ITEMS[slot.itemId] : undefined;
  }

  /** Get the item in the currently selected hotbar slot */
  getSelectedItem(): ItemDef | undefined {
    return this.getHotbarItem(this.selectedHotbar);
  }

  /**
   * Use a consumable from a hotbar slot. Removes 1 from the stack.
   * Returns the item definition if successful, undefined if not consumable.
   */
  useConsumable(index: number): ItemDef | undefined {
    if (index < 0 || index >= HOTBAR_SIZE) return undefined;
    const slot = this.slots[index];
    if (!slot) return undefined;

    const def = ITEMS[slot.itemId];
    if (!def || def.type !== 'consumable') return undefined;

    slot.count -= 1;
    if (slot.count <= 0) this.slots[index] = null;
    return def;
  }

  // ── Bag Operations ──────────────────────────────────────────

  /**
   * Add an item to the inventory. Tries to stack first, then finds
   * an empty slot. Returns the number of items that couldn't fit.
   */
  addItem(itemId: string, count = 1): number {
    const def = ITEMS[itemId];
    if (!def) return count;

    let remaining = count;

    // Try stacking into existing slots
    if (def.maxStack > 1) {
      for (let i = 0; i < this.size && remaining > 0; i++) {
        const slot = this.slots[i];
        if (slot && slot.itemId === itemId && slot.count < def.maxStack) {
          const canAdd = Math.min(remaining, def.maxStack - slot.count);
          slot.count += canAdd;
          remaining -= canAdd;
        }
      }
    }

    // Fill empty slots
    while (remaining > 0) {
      const emptyIdx = this.slots.indexOf(null);
      if (emptyIdx === -1) break; // Inventory full

      const stackSize = Math.min(remaining, def.maxStack);
      this.slots[emptyIdx] = { itemId, count: stackSize };
      remaining -= stackSize;
    }

    return remaining;
  }

  /**
   * Remove items from the inventory by item ID.
   * Returns the number of items actually removed.
   */
  removeItem(itemId: string, count = 1): number {
    let toRemove = count;

    for (let i = this.size - 1; i >= 0 && toRemove > 0; i--) {
      const slot = this.slots[i];
      if (slot && slot.itemId === itemId) {
        const remove = Math.min(toRemove, slot.count);
        slot.count -= remove;
        toRemove -= remove;
        if (slot.count <= 0) this.slots[i] = null;
      }
    }

    return count - toRemove;
  }

  /** Count total of an item across all slots */
  countItem(itemId: string): number {
    let total = 0;
    for (const slot of this.slots) {
      if (slot?.itemId === itemId) total += slot.count;
    }
    return total;
  }

  /** Check if inventory has space for an item */
  hasSpace(itemId: string, count = 1): boolean {
    const def = ITEMS[itemId];
    if (!def) return false;

    let remaining = count;

    // Check existing stacks
    if (def.maxStack > 1) {
      for (const slot of this.slots) {
        if (slot && slot.itemId === itemId) {
          remaining -= (def.maxStack - slot.count);
          if (remaining <= 0) return true;
        }
      }
    }

    // Check empty slots
    for (const slot of this.slots) {
      if (!slot) {
        remaining -= def.maxStack;
        if (remaining <= 0) return true;
      }
    }

    return remaining <= 0;
  }

  /** Swap two bag slots */
  swapSlots(a: number, b: number): void {
    if (a < 0 || a >= this.size || b < 0 || b >= this.size) return;
    const temp = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = temp;
  }

  // ── Equipment Operations ────────────────────────────────────

  /**
   * Equip an item from a bag slot. Returns the previously equipped
   * item (if any) back to the bag slot.
   */
  equip(bagIndex: number): boolean {
    const slot = this.slots[bagIndex];
    if (!slot) return false;

    const def = ITEMS[slot.itemId];
    if (!def?.equipSlot) return false;

    // For relic2: if relic1 is full and this is a relic, use relic2
    let targetSlot = def.equipSlot;
    if (def.type === 'relic' && this.equipment.relic1 && targetSlot === 'relic1') {
      targetSlot = 'relic2';
    }

    // Swap: put currently equipped item back in bag
    const currentEquip = this.equipment[targetSlot];
    if (currentEquip) {
      this.slots[bagIndex] = { itemId: currentEquip.itemId, count: 1 };
    } else {
      this.slots[bagIndex] = null;
    }

    this.equipment[targetSlot] = { itemId: slot.itemId, count: 1 };
    return true;
  }

  /** Unequip from an equipment slot back to inventory. Returns false if bag is full. */
  unequip(slot: EquipSlot): boolean {
    const equipped = this.equipment[slot];
    if (!equipped) return false;

    // Find empty bag slot
    const emptyIdx = this.slots.indexOf(null);
    if (emptyIdx === -1) return false; // Bag full

    this.slots[emptyIdx] = { itemId: equipped.itemId, count: 1 };
    delete this.equipment[slot];
    return true;
  }

  /** Get the equipped item def for a slot */
  getEquipped(slot: EquipSlot): ItemDef | undefined {
    const inv = this.equipment[slot];
    return inv ? ITEMS[inv.itemId] : undefined;
  }

  // ── Curio Operations (soulbound — no bag interaction) ────────

  /** Set a curio in a slot. Permanent — no unequip to bag. */
  setCurio(slot: CurioSlot, itemId: string): void {
    const def = ITEMS[itemId];
    if (!def?.isCurio) return;
    this.curios[slot] = { itemId, count: 1 };
  }

  /** Get the curio item def for a slot */
  getCurio(slot: CurioSlot): ItemDef | undefined {
    const inv = this.curios[slot];
    return inv ? ITEMS[inv.itemId] : undefined;
  }

  // ── Serialization ───────────────────────────────────────────

  toJSON(): {
    slots: (InvSlot | null)[];
    equipment: Partial<Record<EquipSlot, InvSlot>>;
    curios: Partial<Record<CurioSlot, InvSlot>>;
  } {
    return {
      slots: this.slots.map(s => s ? { ...s } : null),
      equipment: { ...this.equipment },
      curios: { ...this.curios },
    };
  }

  fromJSON(data: {
    slots: (InvSlot | null)[];
    equipment: Partial<Record<EquipSlot, InvSlot>>;
    curios?: Partial<Record<CurioSlot, InvSlot>>;
  }): void {
    for (let i = 0; i < this.size; i++) {
      this.slots[i] = data.slots[i] ? { ...data.slots[i]! } : null;
    }
    // Clear and repopulate equipment
    for (const key of Object.keys(this.equipment) as EquipSlot[]) {
      delete this.equipment[key];
    }
    for (const [key, val] of Object.entries(data.equipment)) {
      if (val) this.equipment[key as EquipSlot] = { ...val };
    }
    // Clear and repopulate curios
    for (const key of Object.keys(this.curios) as CurioSlot[]) {
      delete this.curios[key];
    }
    if (data.curios) {
      for (const [key, val] of Object.entries(data.curios)) {
        if (val) this.curios[key as CurioSlot] = { ...val };
      }
    }
  }
}
