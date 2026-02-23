// ═══════════════════════════════════════════════════════════════════
// MOB SPAWNER — Server-side
//
// Manages AI mob lifecycle: spawning, AI state ticking, and
// broadcasting mob states to connected clients.
//
// SPAWN RULES:
//   - Mobs spawn 20-60 blocks from any player
//   - Biome determines which mob types can appear
//   - Max mobs per chunk region to prevent overcrowding
//   - Despawn when no players are within 80 blocks
//
// AI STATES: idle → patrol → chase → attack → return
// ═══════════════════════════════════════════════════════════════════

import type { Vec3 } from '../../../shared/src/index.js';
import { CHUNK_SIZE, SEA_LEVEL } from '../../../shared/src/index.js';
import type { WorldState } from '../world/WorldState.js';

// ── Mob Types ─────────────────────────────────────────────────────

export type MobType = 'skeleton' | 'wolf' | 'spider' | 'piglin';

export interface MobDef {
  type: MobType;
  name: string;
  health: number;
  damage: number;
  speed: number;          // blocks/sec
  aggroRange: number;     // blocks
  attackRange: number;    // blocks
  attackCooldown: number; // seconds
  xpReward: number;
  level: number;
}

const MOB_DEFS: Record<MobType, MobDef> = {
  skeleton: {
    type: 'skeleton', name: 'Skeleton Warrior',
    health: 80, damage: 8, speed: 3.5, aggroRange: 15,
    attackRange: 2, attackCooldown: 1.2, xpReward: 15, level: 2,
  },
  wolf: {
    type: 'wolf', name: 'Dire Wolf',
    health: 60, damage: 12, speed: 5.0, aggroRange: 20,
    attackRange: 1.5, attackCooldown: 0.8, xpReward: 12, level: 3,
  },
  spider: {
    type: 'spider', name: 'Cave Spider',
    health: 45, damage: 6, speed: 4.0, aggroRange: 12,
    attackRange: 1.8, attackCooldown: 1.0, xpReward: 10, level: 1,
  },
  piglin: {
    type: 'piglin', name: 'Piglin Brute',
    health: 150, damage: 18, speed: 3.0, aggroRange: 25,
    attackRange: 2.5, attackCooldown: 1.5, xpReward: 35, level: 5,
  },
};

// ── Biome → Mob Mapping ───────────────────────────────────────────
// Biome names from ChunkGenerator.ts

const BIOME_MOBS: Record<string, MobType[]> = {
  DESERT:       ['skeleton'],
  GRASSLAND:    ['wolf'],
  FOREST:       ['wolf', 'spider'],
  DARK_FOREST:  ['piglin', 'spider'],
  SNOW:         ['skeleton', 'wolf'],
  MOUNTAIN:     ['skeleton'],
  SWAMP:        ['spider'],
  BEACH:        [],
  OCEAN:        [],
};

// ── AI State ──────────────────────────────────────────────────────

export type AIState = 'idle' | 'patrol' | 'chase' | 'attack' | 'return' | 'dead';

// ── Mob Instance ──────────────────────────────────────────────────

export interface Mob {
  id: string;
  def: MobDef;
  position: Vec3;
  yaw: number;
  health: number;
  maxHealth: number;
  aiState: AIState;

  // Spawn origin (for return + leash range)
  spawnPos: Vec3;

  // AI timers
  stateTimer: number;
  attackTimer: number;

  // Patrol waypoint
  patrolTarget: Vec3 | null;

  // Chase target (player ID)
  targetId: string | null;

  // Leash range: how far from spawn before returning
  leashRange: number;
}

// ── Mob State for Network Broadcast ───────────────────────────────

export interface MobNetState {
  id: string;
  type: MobType;
  name: string;
  level: number;
  position: Vec3;
  yaw: number;
  health: number;
  maxHealth: number;
  aiState: string;
}

// ── Mob Spawner ───────────────────────────────────────────────────

let mobIdCounter = 0;

export class MobSpawner {
  private mobs = new Map<string, Mob>();
  private world: WorldState;

  /** Maximum total mobs in the world */
  readonly maxMobs = 100;

  /** Spawn check interval (ticks) */
  readonly spawnInterval = 40; // every 2 seconds at 20 tps
  private spawnTick = 0;

  constructor(world: WorldState) {
    this.world = world;
  }

  // ── Tick (called every server tick) ─────────────────────────

  tick(dt: number, playerPositions: Map<string, Vec3>): void {
    this.spawnTick++;

    // Periodic spawn check
    if (this.spawnTick % this.spawnInterval === 0) {
      this.trySpawn(playerPositions);
    }

    // Update all mobs
    for (const mob of this.mobs.values()) {
      this.updateMob(mob, dt, playerPositions);
    }

    // Despawn mobs far from all players
    this.despawnDistant(playerPositions);
  }

  // ── Spawning ────────────────────────────────────────────────

  private trySpawn(playerPositions: Map<string, Vec3>): void {
    if (this.mobs.size >= this.maxMobs) return;
    if (playerPositions.size === 0) return;

    // Pick a random player to spawn near
    const positions = Array.from(playerPositions.values());
    const anchor = positions[Math.floor(Math.random() * positions.length)];

    // Random offset 20-60 blocks away
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 40;
    const wx = Math.floor(anchor.x + Math.cos(angle) * dist);
    const wz = Math.floor(anchor.z + Math.sin(angle) * dist);

    // Find ground height
    let wy = -1;
    for (let y = 100; y > SEA_LEVEL; y--) {
      if (this.world.getBlock(wx, y, wz) !== 0 && this.world.getBlock(wx, y + 1, wz) === 0) {
        wy = y + 1;
        break;
      }
    }
    if (wy < 0) return; // No ground found

    // Determine biome from height/position (simplified — use a noise check)
    const biome = this.guessBiome(wx, wy, wz);
    const mobTypes = BIOME_MOBS[biome];
    if (!mobTypes || mobTypes.length === 0) return;

    // Check mob density in this region (max 5 per 32×32 area)
    const regionKey = `${Math.floor(wx / CHUNK_SIZE)},${Math.floor(wz / CHUNK_SIZE)}`;
    let regionCount = 0;
    for (const mob of this.mobs.values()) {
      const mk = `${Math.floor(mob.position.x / CHUNK_SIZE)},${Math.floor(mob.position.z / CHUNK_SIZE)}`;
      if (mk === regionKey) regionCount++;
    }
    if (regionCount >= 5) return;

    // Spawn!
    const mobType = mobTypes[Math.floor(Math.random() * mobTypes.length)];
    this.spawnMob(mobType, { x: wx, y: wy, z: wz });
  }

  spawnMob(type: MobType, position: Vec3): Mob {
    const def = MOB_DEFS[type];
    const id = `mob_${++mobIdCounter}`;

    const mob: Mob = {
      id,
      def,
      position: { ...position },
      yaw: Math.random() * Math.PI * 2,
      health: def.health,
      maxHealth: def.health,
      aiState: 'idle',
      spawnPos: { ...position },
      stateTimer: 2 + Math.random() * 3,
      attackTimer: 0,
      patrolTarget: null,
      targetId: null,
      leashRange: 40,
    };

    this.mobs.set(id, mob);
    return mob;
  }

  // ── AI Update ───────────────────────────────────────────────

  private updateMob(mob: Mob, dt: number, players: Map<string, Vec3>): void {
    if (mob.aiState === 'dead') return;

    mob.stateTimer -= dt;
    mob.attackTimer -= dt;

    switch (mob.aiState) {
      case 'idle':
        this.aiIdle(mob, dt, players);
        break;
      case 'patrol':
        this.aiPatrol(mob, dt, players);
        break;
      case 'chase':
        this.aiChase(mob, dt, players);
        break;
      case 'attack':
        this.aiAttack(mob, dt, players);
        break;
      case 'return':
        this.aiReturn(mob, dt);
        break;
    }
  }

  private aiIdle(mob: Mob, _dt: number, players: Map<string, Vec3>): void {
    // Check for nearby players to aggro
    const target = this.findTarget(mob, players);
    if (target) {
      mob.targetId = target;
      mob.aiState = 'chase';
      return;
    }

    // After idle timer, start patrol
    if (mob.stateTimer <= 0) {
      mob.patrolTarget = {
        x: mob.spawnPos.x + (Math.random() - 0.5) * 16,
        y: mob.position.y,
        z: mob.spawnPos.z + (Math.random() - 0.5) * 16,
      };
      mob.aiState = 'patrol';
      mob.stateTimer = 3 + Math.random() * 4;
    }
  }

  private aiPatrol(mob: Mob, dt: number, players: Map<string, Vec3>): void {
    // Check for aggro
    const target = this.findTarget(mob, players);
    if (target) {
      mob.targetId = target;
      mob.aiState = 'chase';
      return;
    }

    // Move toward patrol target
    if (mob.patrolTarget) {
      this.moveToward(mob, mob.patrolTarget, mob.def.speed * 0.5, dt);

      const dist = this.dist2D(mob.position, mob.patrolTarget);
      if (dist < 1 || mob.stateTimer <= 0) {
        mob.aiState = 'idle';
        mob.stateTimer = 2 + Math.random() * 3;
        mob.patrolTarget = null;
      }
    } else {
      mob.aiState = 'idle';
      mob.stateTimer = 1;
    }
  }

  private aiChase(mob: Mob, dt: number, players: Map<string, Vec3>): void {
    if (!mob.targetId) { mob.aiState = 'idle'; return; }

    const targetPos = players.get(mob.targetId);
    if (!targetPos) {
      mob.targetId = null;
      mob.aiState = 'return';
      mob.stateTimer = 0;
      return;
    }

    // Leash check
    if (this.dist2D(mob.position, mob.spawnPos) > mob.leashRange) {
      mob.targetId = null;
      mob.aiState = 'return';
      return;
    }

    const dist = this.dist2D(mob.position, targetPos);

    // In attack range?
    if (dist <= mob.def.attackRange) {
      mob.aiState = 'attack';
      return;
    }

    // Chase
    this.moveToward(mob, targetPos, mob.def.speed, dt);
    this.faceTarget(mob, targetPos);
  }

  private aiAttack(mob: Mob, dt: number, players: Map<string, Vec3>): void {
    if (!mob.targetId) { mob.aiState = 'idle'; return; }

    const targetPos = players.get(mob.targetId);
    if (!targetPos) {
      mob.targetId = null;
      mob.aiState = 'return';
      return;
    }

    const dist = this.dist2D(mob.position, targetPos);
    this.faceTarget(mob, targetPos);

    // Target moved out of range? Chase again
    if (dist > mob.def.attackRange * 1.5) {
      mob.aiState = 'chase';
      return;
    }

    // Attack on cooldown
    if (mob.attackTimer <= 0) {
      // TODO: Actually deal damage to the player (needs server-side combat)
      // For now, just reset the cooldown and the client will see the attack state
      mob.attackTimer = mob.def.attackCooldown;
    }
  }

  private aiReturn(mob: Mob, dt: number): void {
    this.moveToward(mob, mob.spawnPos, mob.def.speed, dt);

    const dist = this.dist2D(mob.position, mob.spawnPos);
    if (dist < 2) {
      mob.aiState = 'idle';
      mob.stateTimer = 1;
      // Heal on return
      mob.health = mob.maxHealth;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  private findTarget(mob: Mob, players: Map<string, Vec3>): string | null {
    let closest: string | null = null;
    let closestDist = mob.def.aggroRange;

    for (const [id, pos] of players) {
      const d = this.dist2D(mob.position, pos);
      if (d < closestDist) {
        closestDist = d;
        closest = id;
      }
    }

    return closest;
  }

  private moveToward(mob: Mob, target: Vec3, speed: number, dt: number): void {
    const dx = target.x - mob.position.x;
    const dz = target.z - mob.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.1) return;

    const step = Math.min(speed * dt, dist);
    mob.position.x += (dx / dist) * step;
    mob.position.z += (dz / dist) * step;

    // Simple ground snapping
    for (let y = Math.floor(mob.position.y) + 2; y > SEA_LEVEL; y--) {
      if (this.world.getBlock(Math.floor(mob.position.x), y, Math.floor(mob.position.z)) !== 0 &&
          this.world.getBlock(Math.floor(mob.position.x), y + 1, Math.floor(mob.position.z)) === 0) {
        mob.position.y = y + 1;
        break;
      }
    }
  }

  private faceTarget(mob: Mob, target: Vec3): void {
    const dx = target.x - mob.position.x;
    const dz = target.z - mob.position.z;
    mob.yaw = Math.atan2(-dx, -dz);
  }

  private dist2D(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private despawnDistant(playerPositions: Map<string, Vec3>): void {
    const positions = Array.from(playerPositions.values());
    for (const mob of this.mobs.values()) {
      let nearPlayer = false;
      for (const pos of positions) {
        if (this.dist2D(mob.position, pos) < 80) {
          nearPlayer = true;
          break;
        }
      }
      if (!nearPlayer) {
        this.mobs.delete(mob.id);
      }
    }
  }

  /** Simplified biome guess based on height */
  private guessBiome(wx: number, wy: number, _wz: number): string {
    if (wy < SEA_LEVEL + 2) return 'BEACH';
    if (wy > 80) return 'MOUNTAIN';
    if (wy > 70) return 'SNOW';
    // Default variety
    const hash = ((wx * 73856093) ^ (_wz * 19349663)) & 0x7fffffff;
    const pick = hash % 4;
    if (pick === 0) return 'FOREST';
    if (pick === 1) return 'GRASSLAND';
    if (pick === 2) return 'DARK_FOREST';
    return 'DESERT';
  }

  // ── Damage (called from server combat) ──────────────────────

  damageMob(mobId: string, damage: number): boolean {
    const mob = this.mobs.get(mobId);
    if (!mob || mob.aiState === 'dead') return false;

    mob.health = Math.max(0, mob.health - damage);
    if (mob.health <= 0) {
      mob.aiState = 'dead';
      // Remove after a short delay (so client sees death anim)
      setTimeout(() => this.mobs.delete(mobId), 3000);
      return true; // killed
    }
    return false;
  }

  // ── Network State ───────────────────────────────────────────

  /** Get all mob states for broadcasting to clients */
  getAllStates(): MobNetState[] {
    const states: MobNetState[] = [];
    for (const mob of this.mobs.values()) {
      states.push({
        id: mob.id,
        type: mob.def.type,
        name: mob.def.name,
        level: mob.def.level,
        position: { ...mob.position },
        yaw: mob.yaw,
        health: mob.health,
        maxHealth: mob.maxHealth,
        aiState: mob.aiState,
      });
    }
    return states;
  }

  /** Get mob states near a specific position (for per-player broadcast) */
  getStatesNear(pos: Vec3, range = 80): MobNetState[] {
    const states: MobNetState[] = [];
    for (const mob of this.mobs.values()) {
      if (this.dist2D(mob.position, pos) <= range) {
        states.push({
          id: mob.id,
          type: mob.def.type,
          name: mob.def.name,
          level: mob.def.level,
          position: { ...mob.position },
          yaw: mob.yaw,
          health: mob.health,
          maxHealth: mob.maxHealth,
          aiState: mob.aiState,
        });
      }
    }
    return states;
  }

  get count(): number { return this.mobs.size; }
}
