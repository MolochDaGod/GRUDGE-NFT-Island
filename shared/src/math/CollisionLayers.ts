// ═══════════════════════════════════════════════════════════════════
// COLLISION LAYERS — Bitmask System
//
// Every collidable object has a `layer` (what it IS) and a
// `collisionMask` (what it collides WITH). Two objects only
// interact if (a.layer & b.mask) !== 0 || (b.layer & a.mask) !== 0.
// ═══════════════════════════════════════════════════════════════════

// ── Layer Bits ──────────────────────────────────────────────────

export const Layer = {
  NONE:       0,
  TERRAIN:    1 << 0,   // 1   — solid voxel blocks
  WATER:      1 << 1,   // 2   — liquid blocks (water, lava)
  PLAYER:     1 << 2,   // 4   — local + remote players
  MOB:        1 << 3,   // 8   — AI mobs
  NPC:        1 << 4,   // 16  — non-hostile NPCs
  PROJECTILE: 1 << 5,   // 32  — arrows, spells, thrown items
  TRIGGER:    1 << 6,   // 64  — invisible trigger zones (quests, portals)
  EFFECT:     1 << 7,   // 128 — AoE spell zones, fire patches
  ITEM:       1 << 8,   // 256 — dropped items on ground
  VEHICLE:    1 << 9,   // 512 — mounts, boats
  ALL:        0xFFFF,
} as const;

export type LayerFlag = number;

// ── Default Masks ───────────────────────────────────────────────

/** What each layer type collides with by default */
export const DefaultMask: Record<string, number> = {
  PLAYER:     Layer.TERRAIN | Layer.WATER | Layer.MOB | Layer.NPC | Layer.TRIGGER | Layer.ITEM,
  MOB:        Layer.TERRAIN | Layer.WATER | Layer.PLAYER | Layer.MOB,
  NPC:        Layer.TERRAIN | Layer.WATER | Layer.PLAYER,
  PROJECTILE: Layer.TERRAIN | Layer.PLAYER | Layer.MOB | Layer.NPC,
  TRIGGER:    Layer.PLAYER,
  EFFECT:     Layer.PLAYER | Layer.MOB | Layer.NPC,
  ITEM:       Layer.TERRAIN | Layer.PLAYER,
  VEHICLE:    Layer.TERRAIN | Layer.WATER | Layer.PLAYER | Layer.MOB,
};

// ── Helpers ─────────────────────────────────────────────────────

/** Check if two objects can collide based on their layers and masks */
export function collides(layerA: number, maskA: number, layerB: number, maskB: number): boolean {
  return (layerA & maskB) !== 0 || (layerB & maskA) !== 0;
}

/** Check if a single layer flag is set in a mask */
export function hasLayer(mask: number, layer: number): boolean {
  return (mask & layer) !== 0;
}

/** Combine multiple layer flags */
export function combineLayers(...layers: number[]): number {
  let result = 0;
  for (const l of layers) result |= l;
  return result;
}
