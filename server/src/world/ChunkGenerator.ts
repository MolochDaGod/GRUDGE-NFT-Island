// ═══════════════════════════════════════════════════════════════════
// CHUNK GENERATOR
// Multi-octave simplex noise terrain with:
// - Island mask (circular falloff so worlds are archipelagos)
// - Biome blending (grasslands, desert, snow, dark_forest)
// - Cave carving (3D noise tunnels)
// - Ore vein placement by depth
// - Tree and vegetation scattering
// ═══════════════════════════════════════════════════════════════════

import {
  CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL,
  TERRAIN_MAX_HEIGHT, TERRAIN_MIN_HEIGHT,
  blockIndex,
} from '../../../shared/src/index.js';
import type { ChunkData } from '../../../shared/src/index.js';

// --- Simplex noise implementation (inline, no dependency issues) ---
// Using a seeded 2D/3D simplex noise based on open-simplex algorithm

const STRETCH_2D = -0.211324865405187;
const SQUISH_2D = 0.366025403784439;
const STRETCH_3D = -1.0 / 6;
const SQUISH_3D = 1.0 / 3;
const NORM_2D = 47;
const NORM_3D = 103;

const GRADIENTS_2D = [5,2, 2,5, -5,2, -2,5, 5,-2, 2,-5, -5,-2, -2,-5];
const GRADIENTS_3D = [
  -11,4,4, -4,11,4, -4,4,11, 11,4,4, 4,11,4, 4,4,11,
  -11,-4,4, -4,-11,4, -4,-4,11, 11,-4,4, 4,-11,4, 4,-4,11,
  -11,4,-4, -4,11,-4, -4,4,-11, 11,4,-4, 4,11,-4, 4,4,-11,
  -11,-4,-4, -4,-11,-4, -4,-4,-11, 11,-4,-4, 4,-11,-4, 4,-4,-11,
];

class SimplexNoise {
  private perm: Int16Array;
  private perm2D: Int16Array;
  private perm3D: Int16Array;

  constructor(seed: number) {
    const perm = new Int16Array(256);
    const source = new Int16Array(256);
    for (let i = 0; i < 256; i++) source[i] = i;

    let s = BigInt(seed);
    // LCG seed expansion
    s = s * 6364136223846793005n + 1442695040888963407n;
    s = s * 6364136223846793005n + 1442695040888963407n;
    s = s * 6364136223846793005n + 1442695040888963407n;

    for (let i = 255; i >= 0; i--) {
      s = s * 6364136223846793005n + 1442695040888963407n;
      let r = Number((s + 31n) % BigInt(i + 1));
      if (r < 0) r += i + 1;
      perm[i] = source[r];
      source[r] = source[i];
    }

    this.perm = perm;
    this.perm2D = new Int16Array(256);
    this.perm3D = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
      this.perm2D[i] = (perm[i] % (GRADIENTS_2D.length / 2)) * 2;
      this.perm3D[i] = (((perm[i] % (GRADIENTS_3D.length / 3)) + (GRADIENTS_3D.length / 3)) % (GRADIENTS_3D.length / 3)) * 3;
    }
  }

  noise2D(x: number, y: number): number {
    const stretchOffset = (x + y) * STRETCH_2D;
    const xs = x + stretchOffset;
    const ys = y + stretchOffset;

    let xsb = Math.floor(xs);
    let ysb = Math.floor(ys);

    const squishOffset = (xsb + ysb) * SQUISH_2D;
    const xb = xsb + squishOffset;
    const yb = ysb + squishOffset;

    const xins = xs - xsb;
    const yins = ys - ysb;
    const inSum = xins + yins;

    const dx0 = x - xb;
    const dy0 = y - yb;

    let value = 0;

    const dx1 = dx0 - 1 - SQUISH_2D;
    const dy1 = dy0 - 0 - SQUISH_2D;
    let attn1 = 2 - dx1 * dx1 - dy1 * dy1;
    if (attn1 > 0) {
      attn1 *= attn1;
      const i = this.perm2D[(this.perm[(xsb + 1) & 0xFF] + ysb) & 0xFF];
      value += attn1 * attn1 * (GRADIENTS_2D[i] * dx1 + GRADIENTS_2D[i + 1] * dy1);
    }

    const dx2 = dx0 - 0 - SQUISH_2D;
    const dy2 = dy0 - 1 - SQUISH_2D;
    let attn2 = 2 - dx2 * dx2 - dy2 * dy2;
    if (attn2 > 0) {
      attn2 *= attn2;
      const i = this.perm2D[(this.perm[xsb & 0xFF] + ysb + 1) & 0xFF];
      value += attn2 * attn2 * (GRADIENTS_2D[i] * dx2 + GRADIENTS_2D[i + 1] * dy2);
    }

    if (inSum <= 1) {
      const zins = 1 - inSum;
      if (zins > xins || zins > yins) {
        if (xins > yins) {
          const dx = dx0 - 1 - 2 * SQUISH_2D;
          const dy = dy0 - 1 - 2 * SQUISH_2D;
          // simplified
        }
      }
      let attn0 = 2 - dx0 * dx0 - dy0 * dy0;
      if (attn0 > 0) {
        attn0 *= attn0;
        const i = this.perm2D[(this.perm[xsb & 0xFF] + ysb) & 0xFF];
        value += attn0 * attn0 * (GRADIENTS_2D[i] * dx0 + GRADIENTS_2D[i + 1] * dy0);
      }
    } else {
      const zins = 2 - inSum;
      if (zins < xins || zins < yins) {
        if (xins > yins) {
          xsb += 1;
        } else {
          ysb += 1;
        }
      }
      const dx_ext = dx0 - 1 - 2 * SQUISH_2D;
      const dy_ext = dy0 - 1 - 2 * SQUISH_2D;
      let attn_ext = 2 - dx_ext * dx_ext - dy_ext * dy_ext;
      if (attn_ext > 0) {
        attn_ext *= attn_ext;
        const i = this.perm2D[(this.perm[(xsb + 1) & 0xFF] + ysb + 1) & 0xFF];
        value += attn_ext * attn_ext * (GRADIENTS_2D[i] * dx_ext + GRADIENTS_2D[i + 1] * dy_ext);
      }
    }

    return value / NORM_2D;
  }
}

// --- Simplified multi-octave noise ---
function fbm(noise: SimplexNoise, x: number, y: number, octaves: number, lacunarity = 2.0, gain = 0.5): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise.noise2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

// --- Seeded RNG for deterministic feature placement ---
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ═══════════════════════════════════════════════════════════════════
// BIOME SYSTEM
// ═══════════════════════════════════════════════════════════════════

enum Biome {
  OCEAN,
  BEACH,
  GRASSLAND,
  FOREST,
  DARK_FOREST,
  DESERT,
  SNOW,
  MOUNTAIN,
  SWAMP,
}

function getBiome(temperature: number, moisture: number, height: number): Biome {
  if (height < SEA_LEVEL - 2) return Biome.OCEAN;
  if (height < SEA_LEVEL + 2) return Biome.BEACH;
  if (height > TERRAIN_MAX_HEIGHT - 20) return Biome.MOUNTAIN;

  if (temperature > 0.6) {
    if (moisture < 0.3) return Biome.DESERT;
    if (moisture > 0.6) return Biome.SWAMP;
    return Biome.GRASSLAND;
  }

  if (temperature < 0.25) return Biome.SNOW;

  if (moisture > 0.55) return Biome.DARK_FOREST;
  if (moisture > 0.35) return Biome.FOREST;
  return Biome.GRASSLAND;
}

function getSurfaceBlock(biome: Biome): number {
  switch (biome) {
    case Biome.DESERT: return 4;  // sand
    case Biome.BEACH: return 4;   // sand
    case Biome.SNOW: return 13;   // snow
    case Biome.SWAMP: return 12;  // clay
    case Biome.DARK_FOREST: return 15; // mossy_stone
    default: return 1; // grass
  }
}

// ═══════════════════════════════════════════════════════════════════
// ISLAND MASK
// Creates archipelago shapes — high at island centers, 0 at edges
// ═══════════════════════════════════════════════════════════════════

function islandMask(
  noise: SimplexNoise,
  worldX: number,
  worldZ: number,
): number {
  // Large-scale island shapes using low-frequency noise
  const islandNoise = fbm(noise, worldX * 0.0008, worldZ * 0.0008, 3, 2.0, 0.6);

  // Distance from world center (gradual falloff for world boundary)
  const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);
  const worldRadius = 1800; // blocks — total playable world radius
  const edgeFalloff = Math.max(0, 1 - (distFromCenter / worldRadius) ** 2);

  // Combine: island shapes × edge falloff
  // Values > 0.1 = land, < 0.1 = ocean
  return (islandNoise * 0.5 + 0.5) * edgeFalloff;
}

// ═══════════════════════════════════════════════════════════════════
// CHUNK GENERATION
// ═══════════════════════════════════════════════════════════════════

export class ChunkGenerator {
  private terrainNoise: SimplexNoise;
  private caveNoise: SimplexNoise;
  private biomeTemp: SimplexNoise;
  private biomeMoist: SimplexNoise;
  private oreNoise: SimplexNoise;
  private treeNoise: SimplexNoise;
  private seed: number;

  constructor(seed = 42069) {
    this.seed = seed;
    this.terrainNoise = new SimplexNoise(seed);
    this.caveNoise = new SimplexNoise(seed + 1);
    this.biomeTemp = new SimplexNoise(seed + 2);
    this.biomeMoist = new SimplexNoise(seed + 3);
    this.oreNoise = new SimplexNoise(seed + 4);
    this.treeNoise = new SimplexNoise(seed + 5);
  }

  generate(cx: number, cz: number): ChunkData {
    const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    const worldX0 = cx * CHUNK_SIZE;
    const worldZ0 = cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = worldX0 + lx;
        const wz = worldZ0 + lz;

        // Island mask determines if this column is land or ocean
        const mask = islandMask(this.terrainNoise, wx, wz);

        // Biome determination
        const temp = fbm(this.biomeTemp, wx * 0.003, wz * 0.003, 3) * 0.5 + 0.5;
        const moist = fbm(this.biomeMoist, wx * 0.004, wz * 0.004, 3) * 0.5 + 0.5;

        // Terrain height from multi-octave noise
        const baseHeight = fbm(this.terrainNoise, wx * 0.005, wz * 0.005, 6, 2.0, 0.5);
        const detailHeight = fbm(this.terrainNoise, wx * 0.02, wz * 0.02, 3, 2.0, 0.4);

        // Combine base terrain with island mask
        const landHeight = TERRAIN_MIN_HEIGHT +
          (baseHeight * 0.5 + 0.5) * (TERRAIN_MAX_HEIGHT - TERRAIN_MIN_HEIGHT) * 0.7 +
          detailHeight * 12;

        // Apply island mask: land where mask > threshold, ocean floor elsewhere
        const surfaceHeight = mask > 0.15
          ? Math.floor(Math.max(SEA_LEVEL - 5, landHeight * mask))
          : Math.floor(TERRAIN_MIN_HEIGHT + mask * 30);

        const biome = getBiome(temp, moist, surfaceHeight);
        const surfaceBlock = getSurfaceBlock(biome);

        // Fill column
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const idx = blockIndex(lx, y, lz);

          if (y === 0) {
            // Bedrock equivalent (dark stone)
            data[idx] = 14; // dark_stone
          } else if (y < surfaceHeight - 4) {
            // Deep stone
            data[idx] = y < 32 ? 16 : 3; // deepslate below 32, stone above

            // Ore veins
            const oreVal = fbm(this.oreNoise, wx * 0.08, y * 0.08 + wz * 0.08, 2);
            if (oreVal > 0.65) {
              if (y < 16) data[idx] = 38;       // netherite (deep)
              else if (y < 24) data[idx] = 36;  // diamond
              else if (y < 40) data[idx] = 35;  // gold
              else if (y < 56) data[idx] = 34;  // iron
              else data[idx] = 32;               // coal
            } else if (oreVal > 0.55) {
              if (y < 48) data[idx] = 33;        // copper
              else data[idx] = 37;               // emerald (higher)
            }
          } else if (y < surfaceHeight - 1) {
            // Sub-surface (dirt/sand)
            data[idx] = biome === Biome.DESERT || biome === Biome.BEACH ? 4 : 2;
          } else if (y === surfaceHeight - 1) {
            // Surface block
            data[idx] = surfaceBlock;
          } else if (y < SEA_LEVEL && y >= surfaceHeight) {
            // Water fills between surface and sea level
            data[idx] = 5; // water
          } else {
            // Air
            data[idx] = 0;
          }

          // Cave carving (3D noise tunnels)
          if (y > 2 && y < surfaceHeight - 2) {
            const caveVal = fbm(this.caveNoise, wx * 0.03, (y * 0.03 + wz * 0.03), 2);
            const caveVal2 = fbm(this.caveNoise, (wx * 0.03 + 100), y * 0.04, 2);
            if (caveVal > 0.4 && caveVal2 > 0.4) {
              data[idx] = 0; // carve air
            }
          }
        }

        // Tree placement (deterministic based on position)
        if (surfaceHeight > SEA_LEVEL + 1 && mask > 0.25) {
          const treeVal = this.treeNoise.noise2D(wx * 0.5, wz * 0.5);
          if (treeVal > 0.6 && (biome === Biome.FOREST || biome === Biome.DARK_FOREST || biome === Biome.GRASSLAND)) {
            this.placeTree(data, lx, surfaceHeight, lz, biome);
          }

          // Vegetation
          if (treeVal > 0.2 && treeVal < 0.35 && biome !== Biome.DESERT) {
            const vegIdx = blockIndex(lx, surfaceHeight, lz);
            if (data[vegIdx] === 0) {
              data[vegIdx] = biome === Biome.SWAMP ? 52 : 48; // mushroom or tall_grass
            }
          }

          // Flowers
          if (treeVal > -0.1 && treeVal < -0.05 && biome === Biome.GRASSLAND) {
            const flowerIdx = blockIndex(lx, surfaceHeight, lz);
            if (data[flowerIdx] === 0) {
              data[flowerIdx] = treeVal > -0.08 ? 49 : 50; // red or yellow flower
            }
          }

          // Herb nodes (for herbalism profession)
          if (treeVal > 0.75 && biome !== Biome.DESERT && biome !== Biome.SNOW) {
            const herbIdx = blockIndex(lx, surfaceHeight, lz);
            if (data[herbIdx] === 0) {
              data[herbIdx] = 51; // herb_plant
            }
          }
        }
      }
    }

    return data;
  }

  private placeTree(data: ChunkData, lx: number, surfaceY: number, lz: number, biome: Biome): void {
    const trunkHeight = biome === Biome.DARK_FOREST ? 7 : 5;
    const leafRadius = biome === Biome.DARK_FOREST ? 3 : 2;

    // Only place if we have room and won't go out of chunk bounds
    if (lx < leafRadius || lx >= CHUNK_SIZE - leafRadius) return;
    if (lz < leafRadius || lz >= CHUNK_SIZE - leafRadius) return;
    if (surfaceY + trunkHeight + leafRadius >= CHUNK_HEIGHT) return;

    // Trunk
    for (let y = surfaceY; y < surfaceY + trunkHeight; y++) {
      data[blockIndex(lx, y, lz)] = 6; // wood
    }

    // Leaves (sphere-ish)
    const leafY = surfaceY + trunkHeight - 1;
    for (let dy = -1; dy <= leafRadius; dy++) {
      const r = dy === leafRadius ? 1 : leafRadius;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz + dy * dy <= leafRadius * leafRadius + 1) {
            const y = leafY + dy;
            const x = lx + dx;
            const z = lz + dz;
            if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y < CHUNK_HEIGHT) {
              const idx = blockIndex(x, y, z);
              if (data[idx] === 0) {
                data[idx] = 7; // leaves
              }
            }
          }
        }
      }
    }
  }
}
