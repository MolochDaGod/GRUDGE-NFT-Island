// ═══════════════════════════════════════════════════════════════════
// WORLD STATE
// Manages all chunk data. Generates on demand, caches in memory.
// Chunks are keyed by "cx,cz" string for fast lookup.
// ═══════════════════════════════════════════════════════════════════

import {
  CHUNK_SIZE, CHUNK_HEIGHT, SERVER_LOAD_DISTANCE,
  blockIndex, worldToChunk, worldToLocal,
} from '../../../shared/src/index.js';
import type { ChunkData, ChunkCoord } from '../../../shared/src/index.js';
import { ChunkGenerator } from './ChunkGenerator.js';

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export class WorldState {
  private chunks = new Map<string, ChunkData>();
  private generator: ChunkGenerator;

  constructor(seed = 42069) {
    this.generator = new ChunkGenerator(seed);
  }

  /** Get or generate a chunk */
  getChunk(cx: number, cz: number): ChunkData {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.generator.generate(cx, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /** Check if a chunk is loaded */
  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  /** Get block at world position */
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return 0;
    const { cx, cz } = worldToChunk(wx, wz);
    const chunk = this.getChunk(cx, cz);
    const local = worldToLocal(wx, wy, wz);
    return chunk[blockIndex(Math.floor(local.x), wy, Math.floor(local.z))];
  }

  /** Set block at world position */
  setBlock(wx: number, wy: number, wz: number, blockId: number): boolean {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    const { cx, cz } = worldToChunk(wx, wz);
    const chunk = this.getChunk(cx, cz);
    const local = worldToLocal(wx, wy, wz);
    chunk[blockIndex(Math.floor(local.x), wy, Math.floor(local.z))] = blockId;
    return true;
  }

  /** Ensure all chunks around a position are loaded */
  loadChunksAround(wx: number, wz: number, radius = SERVER_LOAD_DISTANCE): ChunkCoord[] {
    const center = worldToChunk(wx, wz);
    const loaded: ChunkCoord[] = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        // Circular loading (not square)
        if (dx * dx + dz * dz > radius * radius) continue;

        const cx = center.cx + dx;
        const cz = center.cz + dz;
        if (!this.hasChunk(cx, cz)) {
          this.getChunk(cx, cz); // generate on demand
          loaded.push({ cx, cz });
        }
      }
    }

    return loaded;
  }

  /** Unload chunks far from all active positions */
  unloadDistantChunks(activePositions: Array<{ x: number; z: number }>, maxDistance = SERVER_LOAD_DISTANCE + 4): void {
    const keepChunks = new Set<string>();

    for (const pos of activePositions) {
      const center = worldToChunk(pos.x, pos.z);
      for (let dx = -maxDistance; dx <= maxDistance; dx++) {
        for (let dz = -maxDistance; dz <= maxDistance; dz++) {
          if (dx * dx + dz * dz <= maxDistance * maxDistance) {
            keepChunks.add(chunkKey(center.cx + dx, center.cz + dz));
          }
        }
      }
    }

    for (const key of this.chunks.keys()) {
      if (!keepChunks.has(key)) {
        this.chunks.delete(key);
      }
    }
  }

  /** Get number of loaded chunks (for debugging) */
  get loadedChunkCount(): number {
    return this.chunks.size;
  }

  /** Serialize a chunk for network transfer (compressed) */
  serializeChunk(cx: number, cz: number): Uint8Array {
    const chunk = this.getChunk(cx, cz);
    // Simple RLE compression for network transfer
    // Most chunks are mostly air/stone, so RLE compresses very well
    const output: number[] = [];
    let i = 0;
    while (i < chunk.length) {
      const value = chunk[i];
      let count = 1;
      while (i + count < chunk.length && chunk[i + count] === value && count < 255) {
        count++;
      }
      output.push(value, count);
      i += count;
    }
    return new Uint8Array(output);
  }
}
