// ═══════════════════════════════════════════════════════════════════
// SHARED TYPES - Used by both client and server
// ═══════════════════════════════════════════════════════════════════

import { CHUNK_SIZE, CHUNK_HEIGHT } from './constants.js';

// --- Math ---
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// --- Chunks ---
export interface ChunkCoord {
  cx: number;
  cz: number;
}

/** Raw chunk data: flat array of block IDs */
export type ChunkData = Uint8Array; // length = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT

/** Convert local (x, y, z) within a chunk to array index */
export function blockIndex(x: number, y: number, z: number): number {
  return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
}

/** Convert world position to chunk coord */
export function worldToChunk(wx: number, wz: number): ChunkCoord {
  return {
    cx: Math.floor(wx / CHUNK_SIZE),
    cz: Math.floor(wz / CHUNK_SIZE),
  };
}

/** Convert world position to local block coord within chunk */
export function worldToLocal(wx: number, wy: number, wz: number): Vec3 {
  return {
    x: ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
    y: wy,
    z: ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
  };
}

// --- Network Protocol ---
export enum MessageType {
  // Client -> Server
  JOIN = 'join',
  INPUT = 'input',
  BLOCK_BREAK = 'block_break',
  BLOCK_PLACE = 'block_place',
  CHAT = 'chat',

  // Server -> Client
  WELCOME = 'welcome',
  CHUNK = 'chunk',
  PLAYER_JOIN = 'player_join',
  PLAYER_LEAVE = 'player_leave',
  PLAYER_STATE = 'player_state',
  WORLD_STATE = 'world_state',
  BLOCK_UPDATE = 'block_update',
  MOB_STATE = 'mob_state',
  CHAT_MSG = 'chat_msg',
}

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  yaw: number;
  pitch: number;
  seq: number; // sequence number for reconciliation
}

export interface PlayerState {
  id: string;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
}

export interface NetworkMessage {
  type: MessageType;
  data: unknown;
}

// --- Factions (from your existing system) ---
export enum Faction {
  CRUSADE = 'CRUSADE',
  FABLED = 'FABLED',
  LEGION = 'LEGION',
  PIRATES = 'PIRATES',
  NEUTRAL = 'NEUTRAL',
}

// --- Classes ---
export enum PlayerClass {
  WARRIOR = 'WARRIOR',
  RANGER = 'RANGER',
  MAGE = 'MAGE',
  WORGE = 'WORGE',
}

// --- Races ---
export enum Race {
  HUMAN = 'HUMAN',
  ORC = 'ORC',
  ELF = 'ELF',
  DWARF = 'DWARF',
  BARBARIAN = 'BARBARIAN',
  UNDEAD = 'UNDEAD',
}
