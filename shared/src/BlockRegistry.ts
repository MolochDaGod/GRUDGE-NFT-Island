// ═══════════════════════════════════════════════════════════════════
// BLOCK REGISTRY
// Every block type in the voxel world.
// Block ID 0 = air. IDs are uint8 (0-255) for memory efficiency.
// Each chunk stores blocks as a flat Uint8Array of CHUNK_SIZE^2 * CHUNK_HEIGHT.
// ═══════════════════════════════════════════════════════════════════

export interface BlockDef {
  id: number;
  name: string;
  solid: boolean;
  transparent: boolean;
  liquid: boolean;
  /** Texture indices for [top, bottom, north, south, east, west] in the atlas */
  textures: [number, number, number, number, number, number];
  /** Light emission level 0-15 */
  light: number;
  /** Hardness (0 = instant break, -1 = unbreakable) */
  hardness: number;
  /** Resource node info (if this block is harvestable) */
  resource?: {
    profession: string;
    baseTier: number;
    xp: number;
  };
}

// Texture atlas indices (row-major in a 16x16 atlas)
const T = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  WOOD_SIDE: 6,
  WOOD_TOP: 7,
  LEAVES: 8,
  IRON_ORE: 9,
  GOLD_ORE: 10,
  DIAMOND_ORE: 11,
  COAL_ORE: 12,
  GRAVEL: 13,
  CLAY: 14,
  SNOW: 15,
  COBBLESTONE: 16,
  PLANKS: 17,
  SANDSTONE: 18,
  DARK_STONE: 19,
  MOSSY_STONE: 20,
  LAVA: 21,
  ICE: 22,
  DEEPSLATE: 23,
  COPPER_ORE: 24,
  EMERALD_ORE: 25,
  NETHERITE_ORE: 26,
  HERB_PLANT: 27,
  TALL_GRASS: 28,
  FLOWER_RED: 29,
  FLOWER_YELLOW: 30,
  MUSHROOM: 31,
} as const;

function solid(
  id: number,
  name: string,
  textures: [number, number, number, number, number, number],
  hardness = 1,
  light = 0,
): BlockDef {
  return { id, name, solid: true, transparent: false, liquid: false, textures, hardness, light };
}

function transparent(
  id: number,
  name: string,
  textures: [number, number, number, number, number, number],
  hardness = 0.5,
): BlockDef {
  return { id, name, solid: false, transparent: true, liquid: false, textures, hardness, light: 0 };
}

function liquid(
  id: number,
  name: string,
  textures: [number, number, number, number, number, number],
): BlockDef {
  return { id, name, solid: false, transparent: true, liquid: true, textures, hardness: -1, light: 0 };
}

function ore(
  id: number,
  name: string,
  tex: number,
  hardness: number,
  profession: string,
  baseTier: number,
  xp: number,
): BlockDef {
  const b = solid(id, name, [tex, tex, tex, tex, tex, tex], hardness);
  b.resource = { profession, baseTier, xp };
  return b;
}

const ALL = [T.GRASS_SIDE, T.GRASS_SIDE, T.GRASS_SIDE, T.GRASS_SIDE, T.GRASS_SIDE, T.GRASS_SIDE] as const;

/** Block definitions indexed by ID */
export const BLOCKS: BlockDef[] = [];

// === TERRAIN BLOCKS ===
BLOCKS[0]  = { id: 0, name: 'air', solid: false, transparent: true, liquid: false, textures: [0,0,0,0,0,0], hardness: 0, light: 0 };
BLOCKS[1]  = solid(1,  'grass',       [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE, T.GRASS_SIDE, T.GRASS_SIDE, T.GRASS_SIDE], 0.6);
BLOCKS[2]  = solid(2,  'dirt',        [T.DIRT, T.DIRT, T.DIRT, T.DIRT, T.DIRT, T.DIRT], 0.5);
BLOCKS[3]  = solid(3,  'stone',       [T.STONE, T.STONE, T.STONE, T.STONE, T.STONE, T.STONE], 1.5);
BLOCKS[4]  = solid(4,  'sand',        [T.SAND, T.SAND, T.SAND, T.SAND, T.SAND, T.SAND], 0.5);
BLOCKS[5]  = liquid(5, 'water',       [T.WATER, T.WATER, T.WATER, T.WATER, T.WATER, T.WATER]);
BLOCKS[6]  = solid(6,  'wood',        [T.WOOD_TOP, T.WOOD_TOP, T.WOOD_SIDE, T.WOOD_SIDE, T.WOOD_SIDE, T.WOOD_SIDE], 2);
BLOCKS[7]  = transparent(7, 'leaves', [T.LEAVES, T.LEAVES, T.LEAVES, T.LEAVES, T.LEAVES, T.LEAVES], 0.2);
BLOCKS[8]  = solid(8,  'cobblestone', [T.COBBLESTONE, T.COBBLESTONE, T.COBBLESTONE, T.COBBLESTONE, T.COBBLESTONE, T.COBBLESTONE], 2);
BLOCKS[9]  = solid(9,  'planks',      [T.PLANKS, T.PLANKS, T.PLANKS, T.PLANKS, T.PLANKS, T.PLANKS], 2);
BLOCKS[10] = solid(10, 'sandstone',   [T.SANDSTONE, T.SANDSTONE, T.SANDSTONE, T.SANDSTONE, T.SANDSTONE, T.SANDSTONE], 1.2);
BLOCKS[11] = solid(11, 'gravel',      [T.GRAVEL, T.GRAVEL, T.GRAVEL, T.GRAVEL, T.GRAVEL, T.GRAVEL], 0.6);
BLOCKS[12] = solid(12, 'clay',        [T.CLAY, T.CLAY, T.CLAY, T.CLAY, T.CLAY, T.CLAY], 0.6);
BLOCKS[13] = solid(13, 'snow',        [T.SNOW, T.DIRT, T.SNOW, T.SNOW, T.SNOW, T.SNOW], 0.2);
BLOCKS[14] = solid(14, 'dark_stone',  [T.DARK_STONE, T.DARK_STONE, T.DARK_STONE, T.DARK_STONE, T.DARK_STONE, T.DARK_STONE], 3);
BLOCKS[15] = solid(15, 'mossy_stone', [T.MOSSY_STONE, T.MOSSY_STONE, T.MOSSY_STONE, T.MOSSY_STONE, T.MOSSY_STONE, T.MOSSY_STONE], 1.5);
BLOCKS[16] = solid(16, 'deepslate',   [T.DEEPSLATE, T.DEEPSLATE, T.DEEPSLATE, T.DEEPSLATE, T.DEEPSLATE, T.DEEPSLATE], 3);
BLOCKS[17] = liquid(17, 'lava',       [T.LAVA, T.LAVA, T.LAVA, T.LAVA, T.LAVA, T.LAVA]);
BLOCKS[18] = solid(18, 'ice',         [T.ICE, T.ICE, T.ICE, T.ICE, T.ICE, T.ICE], 0.5);

// === RESOURCE ORES (match your T1-T8 node_harvesting.js) ===
BLOCKS[32] = ore(32, 'coal_ore',     T.COAL_ORE,     1.5, 'mining', 1, 3);
BLOCKS[33] = ore(33, 'copper_ore',   T.COPPER_ORE,   1.5, 'mining', 1, 4);
BLOCKS[34] = ore(34, 'iron_ore',     T.IRON_ORE,     2.0, 'mining', 1, 5);
BLOCKS[35] = ore(35, 'gold_ore',     T.GOLD_ORE,     2.5, 'mining', 2, 8);
BLOCKS[36] = ore(36, 'diamond_ore',  T.DIAMOND_ORE,  3.0, 'mining', 3, 15);
BLOCKS[37] = ore(37, 'emerald_ore',  T.EMERALD_ORE,  3.0, 'mining', 4, 20);
BLOCKS[38] = ore(38, 'netherite_ore',T.NETHERITE_ORE, 4.0, 'mining', 5, 50);

// === VEGETATION ===
BLOCKS[48] = transparent(48, 'tall_grass',    [T.TALL_GRASS, T.TALL_GRASS, T.TALL_GRASS, T.TALL_GRASS, T.TALL_GRASS, T.TALL_GRASS]);
BLOCKS[49] = transparent(49, 'flower_red',    [T.FLOWER_RED, T.FLOWER_RED, T.FLOWER_RED, T.FLOWER_RED, T.FLOWER_RED, T.FLOWER_RED]);
BLOCKS[50] = transparent(50, 'flower_yellow', [T.FLOWER_YELLOW, T.FLOWER_YELLOW, T.FLOWER_YELLOW, T.FLOWER_YELLOW, T.FLOWER_YELLOW, T.FLOWER_YELLOW]);
BLOCKS[51] = transparent(51, 'herb_plant',    [T.HERB_PLANT, T.HERB_PLANT, T.HERB_PLANT, T.HERB_PLANT, T.HERB_PLANT, T.HERB_PLANT]);
BLOCKS[52] = transparent(52, 'mushroom',      [T.MUSHROOM, T.MUSHROOM, T.MUSHROOM, T.MUSHROOM, T.MUSHROOM, T.MUSHROOM]);

/** Look up a block definition by ID (defaults to air) */
export function getBlock(id: number): BlockDef {
  return BLOCKS[id] ?? BLOCKS[0];
}

/** Get block ID by name */
export function getBlockId(name: string): number {
  for (const b of BLOCKS) {
    if (b && b.name === name) return b.id;
  }
  return 0;
}
