// ═══════════════════════════════════════════════════════════════════
// GRUDGE VOXEL - GAME SERVER
// Authoritative server: world state, physics validation, chunk streaming.
// Game loop at 20 ticks/sec. WebSocket for real-time communication.
// ═══════════════════════════════════════════════════════════════════

import { WebSocketServer, WebSocket } from 'ws';
import {
  TICK_MS, CHUNK_SIZE, RENDER_DISTANCE, SEA_LEVEL,
  MessageType,
} from '../../shared/src/index.js';
import type { PlayerState, InputState, Vec3, ChunkCoord } from '../../shared/src/index.js';
import { WorldState } from './world/WorldState.js';

const PORT = 3000;
const WORLD_SEED = 42069;

// --- Player connection state ---
interface ConnectedPlayer {
  ws: WebSocket;
  id: string;
  name: string;
  state: PlayerState;
  loadedChunks: Set<string>;
  lastInput: InputState | null;
}

// --- Server state ---
const world = new WorldState(WORLD_SEED);
const players = new Map<string, ConnectedPlayer>();
let tickCount = 0;

// --- WebSocket Server ---
const wss = new WebSocketServer({ port: PORT });

console.log(`[Grudge Voxel Server] Starting on port ${PORT}...`);
console.log(`[Grudge Voxel Server] World seed: ${WORLD_SEED}`);
console.log(`[Grudge Voxel Server] Tick rate: ${1000 / TICK_MS} tps`);

wss.on('connection', (ws: WebSocket) => {
  const playerId = crypto.randomUUID();
  console.log(`[Server] Player connected: ${playerId}`);

  // Spawn at world center, above sea level
  const spawnY = findSpawnHeight(0, 0);

  const player: ConnectedPlayer = {
    ws,
    id: playerId,
    name: `Player_${playerId.slice(0, 4)}`,
    state: {
      id: playerId,
      position: { x: 0, y: spawnY, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      onGround: false,
      health: 250,
      maxHealth: 250,
      stamina: 100,
      maxStamina: 100,
    },
    loadedChunks: new Set(),
    lastInput: null,
  };

  players.set(playerId, player);

  // Send welcome with player ID and spawn
  send(ws, {
    type: MessageType.WELCOME,
    data: {
      playerId,
      spawn: player.state.position,
      seed: WORLD_SEED,
    },
  });

  // Notify others
  broadcastExcept(playerId, {
    type: MessageType.PLAYER_JOIN,
    data: { id: playerId, name: player.name, position: player.state.position },
  });

  // Send existing players to new player
  for (const [id, other] of players) {
    if (id !== playerId) {
      send(ws, {
        type: MessageType.PLAYER_JOIN,
        data: { id, name: other.name, position: other.state.position },
      });
    }
  }

  // Handle messages
  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Update player name/auth from JOIN data
      if (msg.type === MessageType.JOIN && msg.data) {
        if (msg.data.name) player.name = msg.data.name;
        if (msg.data.puterId) (player as any).puterId = msg.data.puterId;
        if (msg.data.token) (player as any).token = msg.data.token;
        console.log(`[Server] Player identified: ${player.name}${msg.data.puterId ? ' (Puter: ' + msg.data.puterId.slice(0, 8) + '...)' : ''}`);
      }
      handleMessage(playerId, msg);
    } catch (e) {
      console.error(`[Server] Bad message from ${playerId}:`, e);
    }
  });

  ws.on('close', () => {
    console.log(`[Server] Player disconnected: ${playerId}`);
    players.delete(playerId);
    broadcast({
      type: MessageType.PLAYER_LEAVE,
      data: { id: playerId },
    });
  });
});

// --- Find safe spawn height ---
function findSpawnHeight(wx: number, wz: number): number {
  for (let y = 100; y > SEA_LEVEL; y--) {
    if (world.getBlock(wx, y, wz) !== 0 && world.getBlock(wx, y + 1, wz) === 0) {
      return y + 1;
    }
  }
  return SEA_LEVEL + 10;
}

// --- Message handling ---
function handleMessage(playerId: string, msg: { type: string; data: unknown }) {
  const player = players.get(playerId);
  if (!player) return;

  switch (msg.type) {
    case MessageType.INPUT: {
      player.lastInput = msg.data as InputState;
      // For now, trust client position (add server-side validation later)
      break;
    }
    case MessageType.BLOCK_BREAK: {
      const { x, y, z } = msg.data as Vec3;
      world.setBlock(Math.floor(x), Math.floor(y), Math.floor(z), 0);
      broadcast({
        type: MessageType.BLOCK_UPDATE,
        data: { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), blockId: 0 },
      });
      break;
    }
    case MessageType.BLOCK_PLACE: {
      const { x, y, z, blockId } = msg.data as Vec3 & { blockId: number };
      world.setBlock(Math.floor(x), Math.floor(y), Math.floor(z), blockId);
      broadcast({
        type: MessageType.BLOCK_UPDATE,
        data: { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), blockId },
      });
      break;
    }
  }
}

// --- Chunk streaming ---
function streamChunksToPlayer(player: ConnectedPlayer) {
  const pos = player.state.position;
  const centerCX = Math.floor(pos.x / CHUNK_SIZE);
  const centerCZ = Math.floor(pos.z / CHUNK_SIZE);

  // Send chunks in spiral order from center (closest first)
  const toSend: ChunkCoord[] = [];

  for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      if (dx * dx + dz * dz > RENDER_DISTANCE * RENDER_DISTANCE) continue;

      const cx = centerCX + dx;
      const cz = centerCZ + dz;
      const key = `${cx},${cz}`;

      if (!player.loadedChunks.has(key)) {
        toSend.push({ cx, cz });
      }
    }
  }

  // Sort by distance to player (send closest first)
  toSend.sort((a, b) => {
    const da = (a.cx - centerCX) ** 2 + (a.cz - centerCZ) ** 2;
    const db = (b.cx - centerCX) ** 2 + (b.cz - centerCZ) ** 2;
    return da - db;
  });

  // Send up to 4 chunks per tick (throttle to avoid flooding)
  const batchSize = 4;
  for (let i = 0; i < Math.min(batchSize, toSend.length); i++) {
    const { cx, cz } = toSend[i];
    const compressed = world.serializeChunk(cx, cz);
    const key = `${cx},${cz}`;
    player.loadedChunks.add(key);

    send(player.ws, {
      type: MessageType.CHUNK,
      data: {
        cx, cz,
        // Convert Uint8Array to base64 for JSON transport
        blocks: Buffer.from(compressed).toString('base64'),
      },
    });
  }

  // Unload chunks too far away from client tracking
  for (const key of player.loadedChunks) {
    const [cx, cz] = key.split(',').map(Number);
    const dx = cx - centerCX;
    const dz = cz - centerCZ;
    if (dx * dx + dz * dz > (RENDER_DISTANCE + 2) ** 2) {
      player.loadedChunks.delete(key);
    }
  }
}

// --- Game loop ---
function gameTick() {
  tickCount++;

  // Update player positions (for now, accept client positions)
  // TODO: Server-side physics validation

  // Stream chunks to all players
  for (const player of players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      streamChunksToPlayer(player);
    }
  }

  // Broadcast player states (every other tick = 10 updates/sec)
  if (tickCount % 2 === 0) {
    const states: PlayerState[] = [];
    for (const player of players.values()) {
      states.push(player.state);
    }

    for (const player of players.values()) {
      if (player.ws.readyState === WebSocket.OPEN) {
        send(player.ws, {
          type: MessageType.WORLD_STATE,
          data: {
            players: states.filter(s => s.id !== player.id),
            tick: tickCount,
          },
        });
      }
    }
  }

  // Periodic chunk cleanup (every 10 seconds)
  if (tickCount % (20 * 10) === 0) {
    const activePositions = Array.from(players.values()).map(p => ({
      x: p.state.position.x,
      z: p.state.position.z,
    }));
    world.unloadDistantChunks(activePositions);
    console.log(`[Server] Tick ${tickCount} | Players: ${players.size} | Chunks: ${world.loadedChunkCount}`);
  }
}

// --- Utilities ---
function send(ws: WebSocket, msg: { type: string; data: unknown }) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(msg: { type: string; data: unknown }) {
  const payload = JSON.stringify(msg);
  for (const player of players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(payload);
    }
  }
}

function broadcastExcept(excludeId: string, msg: { type: string; data: unknown }) {
  const payload = JSON.stringify(msg);
  for (const [id, player] of players) {
    if (id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(payload);
    }
  }
}

// Start game loop
setInterval(gameTick, TICK_MS);

console.log(`[Grudge Voxel Server] Ready! Listening on ws://localhost:${PORT}`);
