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

export function createPlaceholderAtlas(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const tileSize = size / ATLAS_SIZE;

  const tileColors: Record<number, string> = {
    0: '#4a8f29', 1: '#5a9e33', 2: '#8b6b3d', 3: '#808080',
    4: '#d4c47c', 5: '#3366aa', 6: '#6b4226', 7: '#5a3a1a',
    8: '#2d7a2d', 9: '#a08070', 10: '#c8b040', 11: '#7ccccc',
    12: '#404040', 13: '#999999', 14: '#b8a880', 15: '#e8e8f0',
    16: '#707070', 17: '#b8935a', 18: '#d4c490', 19: '#303030',
    20: '#507050', 21: '#cc4400', 22: '#a0d0e8', 23: '#404048',
    24: '#80a070', 25: '#40b040', 26: '#483030', 27: '#40a040',
    28: '#60a840', 29: '#cc3333', 30: '#cccc33', 31: '#a07050',
  };

  for (let i = 0; i < ATLAS_SIZE * ATLAS_SIZE; i++) {
    const tx = (i % ATLAS_SIZE) * tileSize;
    const ty = Math.floor(i / ATLAS_SIZE) * tileSize;

    ctx.fillStyle = tileColors[i] ?? '#555555';
    ctx.fillRect(tx, ty, tileSize, tileSize);

    for (let px = 0; px < tileSize; px += 2) {
      for (let py = 0; py < tileSize; py += 2) {
        const noise = (Math.random() - 0.5) * 20;
        ctx.fillStyle = `rgba(${noise > 0 ? 255 : 0},${noise > 0 ? 255 : 0},${noise > 0 ? 255 : 0},${Math.abs(noise) / 255})`;
        ctx.fillRect(tx + px, ty + py, 2, 2);
      }
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.strokeRect(tx, ty, tileSize, tileSize);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipMapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

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
