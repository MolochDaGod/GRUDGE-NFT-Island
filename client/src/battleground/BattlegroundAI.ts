// ═══════════════════════════════════════════════════════════════════
// BATTLEGROUND AI — NPC unit behavior controller
//
// Simple state machine: IDLE → PATROL → ENGAGE → RETREAT → DEAD
// Units seek enemies within aggro range, attack in melee/ranged,
// retreat below health threshold, and respawn after a delay.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import type { BattlegroundEffects } from './BattlegroundEffects.js';

export type AIState = 'idle' | 'patrol' | 'engage' | 'retreat' | 'dead';
export type Faction = 'crusader' | 'orc' | 'neutral';

/** Faction colors for effects */
export const FACTION_COLORS: Record<Faction, number> = {
  crusader: 0x4a90d9,
  orc: 0xd94a4a,
  neutral: 0x88aa44,
};

export interface BattleUnit {
  id: string;
  faction: Faction;
  group: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  clips: Map<string, THREE.AnimationClip>;
  currentAction: THREE.AnimationAction | null;

  // Stats
  health: number;
  maxHealth: number;
  damage: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldown: number;

  // AI state
  aiState: AIState;
  target: BattleUnit | null;
  patrolOrigin: THREE.Vector3;
  patrolTarget: THREE.Vector3;
  attackTimer: number;
  stateTimer: number;
  respawnTimer: number;
  healthBar: THREE.Sprite | null;
}

// ── AI Constants ─────────────────────────────────────────────────

const PATROL_RADIUS = 12;
const RETREAT_THRESHOLD = 0.25;  // retreat below 25% HP
const RESPAWN_TIME = 8;
const IDLE_DURATION = 2;

const _dir = new THREE.Vector3();
const _targetPos = new THREE.Vector3();

// ── AI Tick ──────────────────────────────────────────────────────

export function tickAI(unit: BattleUnit, allUnits: BattleUnit[], dt: number, fx?: BattlegroundEffects): void {
  if (unit.aiState === 'dead') {
    unit.respawnTimer -= dt;
    if (unit.respawnTimer <= 0) respawn(unit, fx);
    return;
  }

  unit.stateTimer += dt;
  unit.attackTimer = Math.max(0, unit.attackTimer - dt);

  switch (unit.aiState) {
    case 'idle':
      if (unit.stateTimer > IDLE_DURATION) {
        pickPatrolTarget(unit);
        setState(unit, 'patrol');
      }
      // Still scan for enemies while idle
      if (findTarget(unit, allUnits)) setState(unit, 'engage');
      break;

    case 'patrol':
      moveToward(unit, unit.patrolTarget, dt);
      if (distXZ(unit.group.position, unit.patrolTarget) < 1.5) {
        setState(unit, 'idle');
      }
      if (findTarget(unit, allUnits)) setState(unit, 'engage');
      break;

    case 'engage': {
      if (!unit.target || unit.target.aiState === 'dead') {
        unit.target = null;
        if (!findTarget(unit, allUnits)) setState(unit, 'idle');
        break;
      }
      // Retreat check
      if (unit.health / unit.maxHealth < RETREAT_THRESHOLD) {
        setState(unit, 'retreat');
        break;
      }
      const dist = distXZ(unit.group.position, unit.target.group.position);
      if (dist > unit.aggroRange * 1.5) {
        // Target fled
        unit.target = null;
        setState(unit, 'idle');
      } else if (dist > unit.attackRange) {
        moveToward(unit, unit.target.group.position, dt);
      } else {
        // In attack range — face target and attack
        faceTarget(unit, unit.target.group.position);
        if (unit.attackTimer <= 0) {
          attack(unit, unit.target, fx);
        }
      }
      break;
    }

    case 'retreat':
      // Move back toward patrol origin
      moveToward(unit, unit.patrolOrigin, dt, 1.3);
      if (distXZ(unit.group.position, unit.patrolOrigin) < 3) {
        // Heal partially on reaching base
        unit.health = Math.min(unit.maxHealth, unit.health + unit.maxHealth * 0.3);
        setState(unit, 'idle');
      }
      break;
  }

  updateHealthBar(unit);
}

// ── State transitions ────────────────────────────────────────────

function setState(unit: BattleUnit, state: AIState): void {
  unit.aiState = state;
  unit.stateTimer = 0;

  // Play animation
  const animName =
    state === 'idle' ? 'idle' :
    state === 'patrol' ? 'walk' :
    state === 'engage' ? 'run' :
    state === 'retreat' ? 'run' :
    'death';

  playAnim(unit, animName);
}

function playAnim(unit: BattleUnit, name: string): void {
  if (!unit.mixer) return;
  // Try exact name first, then Blender-style "Armature|Name|baselayer"
  let clip = unit.clips.get(name);
  if (!clip) {
    for (const [key, c] of unit.clips) {
      if (key.toLowerCase().includes(name.toLowerCase())) { clip = c; break; }
    }
  }
  if (!clip) return;

  const action = unit.mixer.clipAction(clip);
  if (unit.currentAction && unit.currentAction !== action) {
    unit.currentAction.fadeOut(0.25);
  }
  action.reset().fadeIn(0.25).play();
  unit.currentAction = action;
}

// ── Combat ───────────────────────────────────────────────────────

function attack(unit: BattleUnit, target: BattleUnit, fx?: BattlegroundEffects): void {
  unit.attackTimer = unit.attackCooldown;
  playAnim(unit, 'attack');

  // Deal damage
  const dmg = unit.damage * (0.8 + Math.random() * 0.4); // ±20% variance
  target.health -= dmg;

  // VFX
  if (fx) {
    const hitPos = target.group.position.clone();
    hitPos.y += 1;
    fx.hitSparks(hitPos, FACTION_COLORS[unit.faction]);
    fx.attackSlash(unit.group.position, unit.group.rotation.y, FACTION_COLORS[unit.faction]);
  }

  if (target.health <= 0) {
    target.health = 0;
    kill(target, fx);
  }
}

function kill(unit: BattleUnit, fx?: BattlegroundEffects): void {
  unit.aiState = 'dead';
  unit.target = null;
  unit.respawnTimer = RESPAWN_TIME;
  playAnim(unit, 'death');

  // Make the unit "fall" (set action clamp)
  if (unit.currentAction) {
    unit.currentAction.setLoop(THREE.LoopOnce, 1);
    unit.currentAction.clampWhenFinished = true;
  }

  // Death VFX
  if (fx) {
    fx.deathSmoke(unit.group.position.clone());
  }
}

function respawn(unit: BattleUnit, fx?: BattlegroundEffects): void {
  unit.health = unit.maxHealth;
  unit.group.position.copy(unit.patrolOrigin);
  unit.group.position.y = 0;
  unit.target = null;
  setState(unit, 'idle');
  unit.group.visible = true;

  if (fx) {
    fx.spawnGlow(unit.group.position.clone(), FACTION_COLORS[unit.faction]);
  }
}

// ── Movement ─────────────────────────────────────────────────────

function moveToward(unit: BattleUnit, target: THREE.Vector3, dt: number, speedMul = 1): void {
  _dir.copy(target).sub(unit.group.position);
  _dir.y = 0;
  const dist = _dir.length();
  if (dist < 0.5) return;

  _dir.normalize();
  const step = unit.speed * speedMul * dt;
  unit.group.position.addScaledVector(_dir, Math.min(step, dist));
  faceTarget(unit, target);
}

function faceTarget(unit: BattleUnit, target: THREE.Vector3): void {
  _dir.copy(target).sub(unit.group.position);
  _dir.y = 0;
  if (_dir.lengthSq() > 0.01) {
    unit.group.rotation.y = Math.atan2(_dir.x, _dir.z);
  }
}

// ── Target finding ───────────────────────────────────────────────

function findTarget(unit: BattleUnit, allUnits: BattleUnit[]): boolean {
  let closest: BattleUnit | null = null;
  let closestDist = unit.aggroRange;

  for (const other of allUnits) {
    if (other === unit) continue;
    if (other.aiState === 'dead') continue;
    if (!isEnemy(unit, other)) continue;

    const dist = distXZ(unit.group.position, other.group.position);
    if (dist < closestDist) {
      closest = other;
      closestDist = dist;
    }
  }

  if (closest) {
    unit.target = closest;
    return true;
  }
  return false;
}

function isEnemy(a: BattleUnit, b: BattleUnit): boolean {
  if (a.faction === 'neutral' || b.faction === 'neutral') return true;
  return a.faction !== b.faction;
}

// ── Patrol ───────────────────────────────────────────────────────

function pickPatrolTarget(unit: BattleUnit): void {
  const angle = Math.random() * Math.PI * 2;
  const radius = 3 + Math.random() * PATROL_RADIUS;
  unit.patrolTarget.set(
    unit.patrolOrigin.x + Math.cos(angle) * radius,
    0,
    unit.patrolOrigin.z + Math.sin(angle) * radius,
  );
}

// ── Health bar ───────────────────────────────────────────────────

export function createHealthBar(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.NearestFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.5, 0.2, 1);
  sprite.position.y = 2.5;
  return sprite;
}

function updateHealthBar(unit: BattleUnit): void {
  if (!unit.healthBar) return;
  const mat = unit.healthBar.material as THREE.SpriteMaterial;
  const tex = mat.map as THREE.CanvasTexture;
  const ctx = tex.image.getContext('2d') as CanvasRenderingContext2D;
  const w = tex.image.width;
  const h = tex.image.height;

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, w, h);

  // Health fill
  const pct = unit.health / unit.maxHealth;
  ctx.fillStyle = pct > 0.5 ? '#4CAF50' : pct > 0.25 ? '#FF9800' : '#F44336';
  ctx.fillRect(0, 0, w * pct, h);

  tex.needsUpdate = true;
  unit.healthBar.visible = unit.aiState !== 'dead';
}

// ── Util ─────────────────────────────────────────────────────────

function distXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
