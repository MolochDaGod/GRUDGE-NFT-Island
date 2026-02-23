// ═══════════════════════════════════════════════════════════════════
// VOXEL RENDERER
//
// Main-thread mesh builder (synchronous fallback) + texture atlas.
// The meshing algorithm lives in meshChunkData.ts and is shared
// with the Web Worker pool for off-thread meshing.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import type { ChunkData } from '@grudge/shared';
import { meshChunkData } from './meshChunkData.js';
import type { NeighborData } from './meshChunkData.js';

const ATLAS_SIZE = 16;

// ── Main-thread mesh builder (synchronous fallback) ───────────────

/**
 * Build a mesh for a single chunk using greedy meshing.
 * This runs on the main thread — prefer ChunkMeshPool for async.
 */
export function buildChunkMesh(
  data: ChunkData,
  neighborData?: NeighborData,
): THREE.BufferGeometry | null {
  const result = meshChunkData(data, neighborData);
  if (!result) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(result.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(result.uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(result.colors, 3));
  geo.setIndex(new THREE.BufferAttribute(result.indices, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  return geo;
}

// ── Texture Atlas ─────────────────────────────────────────────────

// ── Seeded RNG for deterministic tile art ─────────────────────────
function seedRNG(seed: number) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function hexToRGB(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

interface TileDef {
  base: string; detail?: string; pattern?: 'noise'|'brick'|'ore'|'grain'|'grass'|'cross'|'wave'|'speckle';
  detailChance?: number;
}

// Per-tile definitions: index → look
const TILE_DEFS: Record<number, TileDef> = {
  0:  { base: '#4a8f29', detail: '#5aad33', pattern: 'grass' },       // grass_top
  1:  { base: '#5a8f33', detail: '#4a7f23', pattern: 'grain' },       // grass_side (dirt+grass strip)
  2:  { base: '#8b6b3d', detail: '#7a5d30', pattern: 'noise' },       // dirt
  3:  { base: '#808080', detail: '#6e6e6e', pattern: 'brick' },       // stone
  4:  { base: '#d4c47c', detail: '#c4b46c', pattern: 'speckle' },     // sand
  5:  { base: '#2266cc', detail: '#4488dd', pattern: 'wave' },        // water
  6:  { base: '#6b4226', detail: '#5a3518', pattern: 'grain' },       // wood_side
  7:  { base: '#5a3a1a', detail: '#6b4a2a', pattern: 'noise' },       // wood_top (rings)
  8:  { base: '#2d7a2d', detail: '#1d6020', pattern: 'cross' },       // leaves
  9:  { base: '#a08070', detail: '#c09060', pattern: 'ore', detailChance: 0.15 }, // iron_ore
  10: { base: '#808080', detail: '#d4b040', pattern: 'ore', detailChance: 0.12 }, // gold_ore
  11: { base: '#707070', detail: '#40cccc', pattern: 'ore', detailChance: 0.10 }, // diamond_ore
  12: { base: '#606060', detail: '#202020', pattern: 'ore', detailChance: 0.20 }, // coal_ore
  13: { base: '#999999', detail: '#b0b0b0', pattern: 'noise' },       // gravel
  14: { base: '#b8a880', detail: '#a09070', pattern: 'noise' },       // clay
  15: { base: '#e8e8f0', detail: '#d0d0e0', pattern: 'speckle' },     // snow
  16: { base: '#707070', detail: '#606060', pattern: 'brick' },       // cobblestone
  17: { base: '#b8935a', detail: '#a88348', pattern: 'grain' },       // planks
  18: { base: '#d4c490', detail: '#c4b480', pattern: 'brick' },       // sandstone
  19: { base: '#252025', detail: '#1a151a', pattern: 'noise' },       // dark_stone
  20: { base: '#507050', detail: '#3a5a3a', pattern: 'speckle' },     // mossy_stone
  21: { base: '#dd4400', detail: '#ff8800', pattern: 'wave' },        // lava
  22: { base: '#a0d8f0', detail: '#c0e8ff', pattern: 'speckle' },     // ice
  23: { base: '#404048', detail: '#303038', pattern: 'brick' },       // deepslate
  24: { base: '#708070', detail: '#50b878', pattern: 'ore', detailChance: 0.14 }, // copper_ore
  25: { base: '#606860', detail: '#30d030', pattern: 'ore', detailChance: 0.10 }, // emerald_ore
  26: { base: '#382828', detail: '#603020', pattern: 'ore', detailChance: 0.08 }, // netherite_ore
  27: { base: '#309030', detail: '#50c050', pattern: 'cross' },       // herb_plant
  28: { base: '#509030', detail: '#70b040', pattern: 'cross' },       // tall_grass
  29: { base: '#309030', detail: '#dd2020', pattern: 'cross' },       // flower_red
  30: { base: '#309030', detail: '#dddd20', pattern: 'cross' },       // flower_yellow
  31: { base: '#705040', detail: '#c08060', pattern: 'cross' },       // mushroom
};

function paintTile(ctx: CanvasRenderingContext2D, tx: number, ty: number, ts: number, def: TileDef, seed: number) {
  const rng = seedRNG(seed);
  const [br, bg, bb] = hexToRGB(def.base);
  const [dr, dg, db] = def.detail ? hexToRGB(def.detail) : [br, bg, bb];
  const chance = def.detailChance ?? 0.3;

  // Fill base
  ctx.fillStyle = def.base;
  ctx.fillRect(tx, ty, ts, ts);

  // Pattern overlay
  const pat = def.pattern ?? 'noise';
  for (let py = 0; py < ts; py++) {
    for (let px = 0; px < ts; px++) {
      const r = rng();
      let draw = false;
      let cr = dr, cg = dg, cb = db, ca = 0.35;

      switch (pat) {
        case 'noise':
          if (r < 0.25) { ca = 0.12 + r * 0.3; draw = true; }
          break;
        case 'brick': {
          const row = py % 8;
          const offset = (Math.floor(py / 8) % 2) * 4;
          const col = (px + offset) % 8;
          if (row === 0 || col === 0) { cr = br * 0.7; cg = bg * 0.7; cb = bb * 0.7; ca = 0.5; draw = true; }
          else if (r < 0.08) { ca = 0.1; draw = true; }
          break;
        }
        case 'ore':
          if (r < chance) { ca = 0.7 + rng() * 0.3; draw = true; }
          else if (r < 0.1) { cr = br * 0.8; cg = bg * 0.8; cb = bb * 0.8; ca = 0.2; draw = true; }
          break;
        case 'grain': {
          const stripe = (px + Math.floor(rng() * 2)) % 4;
          if (stripe === 0) { ca = 0.15; draw = true; }
          else if (r < 0.08) { ca = 0.1; draw = true; }
          break;
        }
        case 'grass': {
          if (r < 0.35) { ca = 0.2 + rng() * 0.3; draw = true; }
          if (py < 3 && r < 0.4) { cr = dr; cg = dg + 30; cb = db; ca = 0.5; draw = true; } // blade tips
          break;
        }
        case 'cross': {
          // X shape for vegetation
          const cx = ts / 2, cy = ts / 2;
          const dx = Math.abs(px - cx), dy = Math.abs(py - cy);
          if ((Math.abs(dx - dy) < 2 || Math.abs(dx + dy - ts) < 2) && dy < ts * 0.45) {
            ca = 0.8; draw = true;
          }
          break;
        }
        case 'wave': {
          const wave = Math.sin((px + py * 0.5) * 0.8) * 0.5 + 0.5;
          if (wave > 0.6) { ca = 0.25; draw = true; }
          break;
        }
        case 'speckle':
          if (r < 0.15) { ca = 0.15 + rng() * 0.15; draw = true; }
          break;
      }

      if (draw) {
        ctx.fillStyle = `rgba(${Math.round(cr)},${Math.round(cg)},${Math.round(cb)},${ca})`;
        ctx.fillRect(tx + px, ty + py, 1, 1);
      }
    }
  }

  // Grass side special: top 3px are green grass blades on dirt
  if (seed === 1) {
    const grassRng = seedRNG(9999);
    ctx.fillStyle = def.base;
    ctx.fillRect(tx, ty, ts, ts);
    // Dirt body
    ctx.fillStyle = '#8b6b3d';
    ctx.fillRect(tx, ty + 3, ts, ts - 3);
    for (let py = 3; py < ts; py++) {
      for (let px = 0; px < ts; px++) {
        if (grassRng() < 0.2) {
          ctx.fillStyle = `rgba(122,93,48,${0.2 + grassRng() * 0.2})`;
          ctx.fillRect(tx + px, ty + py, 1, 1);
        }
      }
    }
    // Green top strip with irregular edge
    for (let px = 0; px < ts; px++) {
      const h = 2 + Math.floor(grassRng() * 3);
      ctx.fillStyle = '#4a8f29';
      ctx.fillRect(tx + px, ty, 1, h);
      if (grassRng() > 0.5) {
        ctx.fillStyle = '#5aad33';
        ctx.fillRect(tx + px, ty, 1, Math.max(1, h - 1));
      }
    }
  }
}

export function createPlaceholderAtlas(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const tileSize = size / ATLAS_SIZE;

  for (let i = 0; i < ATLAS_SIZE * ATLAS_SIZE; i++) {
    const tx = (i % ATLAS_SIZE) * tileSize;
    const ty = Math.floor(i / ATLAS_SIZE) * tileSize;
    const def = TILE_DEFS[i] ?? { base: '#555555', pattern: 'noise' as const };
    paintTile(ctx, tx, ty, tileSize, def, i);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipMapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

export function createVoxelMaterial(atlas: THREE.Texture): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    map: atlas,
    vertexColors: true,
    side: THREE.FrontSide,
    transparent: false,
  });
}

/**
 * Transparent water material — render in a separate pass after solid terrain.
 * Clone the atlas so UV offset animation doesn't affect solid blocks.
 */
export function createWaterMaterial(atlas: THREE.Texture): THREE.MeshLambertMaterial {
  const waterAtlas = atlas.clone();
  waterAtlas.needsUpdate = true;
  return new THREE.MeshLambertMaterial({
    map: waterAtlas,
    vertexColors: true,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
}

/** Call each frame to animate water UV scroll */
export function updateWaterMaterial(mat: THREE.MeshLambertMaterial, time: number): void {
  if (mat.map) {
    mat.map.offset.x = Math.sin(time * 0.3) * 0.005;
    mat.map.offset.y = time * 0.002;
  }
}
