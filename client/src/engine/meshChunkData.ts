// ═══════════════════════════════════════════════════════════════════
// CHUNK MESHING — Pure Data (no Three.js)
//
// Greedy mesh algorithm that produces raw typed arrays.
// Used by both the main thread (fallback) and Web Workers.
// ═══════════════════════════════════════════════════════════════════

import {
  CHUNK_SIZE, CHUNK_HEIGHT, blockIndex, getBlock,
} from '@grudge/shared';
import type { ChunkData } from '@grudge/shared';

// ── Constants ─────────────────────────────────────────────────────

const ATLAS_SIZE = 16;
const TEX_UNIT = 1 / ATLAS_SIZE;
const TEX_PAD = 0.002;
const DIMS = [CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE] as const;

const FACE_DEFS = [
  { axis: 1, sign:  1, texIdx: 0, u: 0, v: 2 },
  { axis: 1, sign: -1, texIdx: 1, u: 0, v: 2 },
  { axis: 2, sign: -1, texIdx: 2, u: 0, v: 1 },
  { axis: 2, sign:  1, texIdx: 3, u: 0, v: 1 },
  { axis: 0, sign:  1, texIdx: 4, u: 2, v: 1 },
  { axis: 0, sign: -1, texIdx: 5, u: 2, v: 1 },
] as const;

// ── Helpers ───────────────────────────────────────────────────────

export type NeighborData = {
  px?: ChunkData; nx?: ChunkData;
  pz?: ChunkData; nz?: ChunkData;
};

function getBlockAt(
  data: ChunkData, x: number, y: number, z: number,
  neighbors?: NeighborData,
): number {
  if (y < 0 || y >= CHUNK_HEIGHT) return 0;
  if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
    return data[blockIndex(x, y, z)];
  }
  if (x < 0 && neighbors?.nx) return neighbors.nx[blockIndex(CHUNK_SIZE - 1, y, z)];
  if (x >= CHUNK_SIZE && neighbors?.px) return neighbors.px[blockIndex(0, y, z)];
  if (z < 0 && neighbors?.nz) return neighbors.nz[blockIndex(x, y, CHUNK_SIZE - 1)];
  if (z >= CHUNK_SIZE && neighbors?.pz) return neighbors.pz[blockIndex(x, y, 0)];
  return 0;
}

function solidAt(data: ChunkData, x: number, y: number, z: number, n?: NeighborData): boolean {
  return getBlock(getBlockAt(data, x, y, z, n)).solid;
}

function vertexAO(s1: boolean, s2: boolean, corner: boolean): number {
  if (s1 && s2) return 0;
  return 3 - (s1 ? 1 : 0) - (s2 ? 1 : 0) - (corner ? 1 : 0);
}

// ── Result ────────────────────────────────────────────────────────

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

// ── Greedy Mesh ───────────────────────────────────────────────────

export function meshChunkData(
  data: ChunkData,
  neighborData?: NeighborData,
): MeshData | null {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const maskSize = Math.max(CHUNK_SIZE * CHUNK_SIZE, CHUNK_SIZE * CHUNK_HEIGHT);
  const mask = new Int32Array(maskSize);

  for (const face of FACE_DEFS) {
    const { axis, sign, texIdx, u: uAxis, v: vAxis } = face;
    const uSize = DIMS[uAxis];
    const vSize = DIMS[vAxis];

    const nd: [number, number, number] = [0, 0, 0];
    nd[axis] = sign;

    for (let slice = 0; slice < DIMS[axis]; slice++) {
      let mi = 0;
      for (let vv = 0; vv < vSize; vv++) {
        for (let uu = 0; uu < uSize; uu++) {
          const pos: [number, number, number] = [0, 0, 0];
          pos[axis] = slice;
          pos[uAxis] = uu;
          pos[vAxis] = vv;

          const blockId = data[blockIndex(pos[0], pos[1], pos[2])];
          if (blockId === 0) { mask[mi++] = 0; continue; }

          const blk = getBlock(blockId);
          if (!blk.solid && !blk.liquid) { mask[mi++] = 0; continue; }

          const nId = getBlockAt(data, pos[0] + nd[0], pos[1] + nd[1], pos[2] + nd[2], neighborData);
          const nb = getBlock(nId);

          if (nb.solid) { mask[mi++] = 0; continue; }
          if (blk.liquid && nId === blockId) { mask[mi++] = 0; continue; }

          mask[mi++] = blockId;
        }
      }

      for (let vv = 0; vv < vSize; vv++) {
        for (let uu = 0; uu < uSize;) {
          const idx = vv * uSize + uu;
          const bId = mask[idx];
          if (bId === 0) { uu++; continue; }

          let w = 1;
          while (uu + w < uSize && mask[idx + w] === bId) w++;

          let h = 1;
          let canGrow = true;
          while (vv + h < vSize && canGrow) {
            for (let k = 0; k < w; k++) {
              if (mask[(vv + h) * uSize + uu + k] !== bId) { canGrow = false; break; }
            }
            if (canGrow) h++;
          }

          for (let dv = 0; dv < h; dv++) {
            for (let du = 0; du < w; du++) {
              mask[(vv + dv) * uSize + uu + du] = 0;
            }
          }

          const blk = getBlock(bId);
          const tIdx = blk.textures[texIdx];
          const tU = (tIdx % ATLAS_SIZE) * TEX_UNIT;
          const tV = Math.floor(tIdx / ATLAS_SIZE) * TEX_UNIT;

          const c: [number, number, number][] = [];
          for (const [du, dv] of [[0, 0], [w, 0], [w, h], [0, h]]) {
            const p: [number, number, number] = [0, 0, 0];
            p[axis] = sign > 0 ? slice + 1 : slice;
            p[uAxis] = uu + du;
            p[vAxis] = vv + dv;
            c.push(p);
          }

          const ao: number[] = [];
          for (let ci = 0; ci < 4; ci++) {
            const [cx, cy, cz] = c[ci];
            const uOff = (ci === 0 || ci === 3) ? -1 : 0;
            const vOff = (ci === 0 || ci === 1) ? -1 : 0;

            const bx = cx + (sign > 0 ? 0 : -1) * (axis === 0 ? 1 : 0);
            const by = cy + (sign > 0 ? 0 : -1) * (axis === 1 ? 1 : 0);
            const bz = cz + (sign > 0 ? 0 : -1) * (axis === 2 ? 1 : 0);

            const su: [number, number, number] = [bx, by, bz];
            su[uAxis] += uOff;
            const sv: [number, number, number] = [bx, by, bz];
            sv[vAxis] += vOff;
            const sc: [number, number, number] = [bx, by, bz];
            sc[uAxis] += uOff;
            sc[vAxis] += vOff;

            ao.push(vertexAO(
              solidAt(data, su[0], su[1], su[2], neighborData),
              solidAt(data, sv[0], sv[1], sv[2], neighborData),
              solidAt(data, sc[0], sc[1], sc[2], neighborData),
            ));
          }

          const vi = positions.length / 3;
          const order = sign > 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];

          for (const oi of order) {
            positions.push(c[oi][0], c[oi][1], c[oi][2]);
            normals.push(nd[0], nd[1], nd[2]);
          }
          const oao = order.map(i => ao[i]);

          uvs.push(
            tU + TEX_PAD,             tV + TEX_PAD,
            tU + TEX_UNIT - TEX_PAD,  tV + TEX_PAD,
            tU + TEX_UNIT - TEX_PAD,  tV + TEX_UNIT - TEX_PAD,
            tU + TEX_PAD,             tV + TEX_UNIT - TEX_PAD,
          );

          for (const a of oao) {
            const b = 0.5 + a * 0.166;
            colors.push(b, b, b);
          }

          if (oao[0] + oao[2] > oao[1] + oao[3]) {
            indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
          } else {
            indices.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
          }

          uu += w;
        }
      }
    }
  }

  if (positions.length === 0) return null;

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}
