// ═══════════════════════════════════════════════════════════════════
// MESH WORKER — Off-main-thread chunk meshing
//
// Receives chunk data + neighbor data, runs greedy meshing,
// returns typed array buffers via transferable objects.
// ═══════════════════════════════════════════════════════════════════

import { meshChunkData } from './meshChunkData.js';
import type { NeighborData } from './meshChunkData.js';

export interface MeshWorkerRequest {
  id: number;
  cx: number;
  cz: number;
  data: Uint8Array;
  neighbors: {
    px?: Uint8Array;
    nx?: Uint8Array;
    pz?: Uint8Array;
    nz?: Uint8Array;
  };
}

export interface MeshWorkerResponse {
  id: number;
  cx: number;
  cz: number;
  /** null if chunk produced no geometry (all air) */
  positions: Float32Array | null;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  colors: Float32Array | null;
  indices: Uint32Array | null;
}

self.onmessage = (e: MessageEvent<MeshWorkerRequest>) => {
  const { id, cx, cz, data, neighbors } = e.data;

  const neighborData: NeighborData = {
    px: neighbors.px,
    nx: neighbors.nx,
    pz: neighbors.pz,
    nz: neighbors.nz,
  };

  const result = meshChunkData(data, neighborData);

  if (!result) {
    const resp: MeshWorkerResponse = {
      id, cx, cz,
      positions: null, normals: null, uvs: null, colors: null, indices: null,
    };
    (self as unknown as Worker).postMessage(resp);
    return;
  }

  const resp: MeshWorkerResponse = {
    id, cx, cz,
    positions: result.positions,
    normals: result.normals,
    uvs: result.uvs,
    colors: result.colors,
    indices: result.indices,
  };

  // Transfer typed array buffers (zero-copy)
  (self as unknown as Worker).postMessage(resp, [
    result.positions.buffer,
    result.normals.buffer,
    result.uvs.buffer,
    result.colors.buffer,
    result.indices.buffer,
  ]);
};
