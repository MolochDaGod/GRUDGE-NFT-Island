// ═══════════════════════════════════════════════════════════════════
// COMBAT AI — Enhanced NPC behavior controller
//
// Ported from annihilate's Ai.js + MutantAi.js / PaladinAi.js:
//   • Distance-based aggro detection (replaces cannon-es detector sphere)
//   • Face → run → attack loop (checks FSM tags before acting)
//   • Return-to-origin when no target
//   • Per-personality cooldown FSM (aggressive/defensive/tank)
//   • Damage dealing during canDamage states
//
// Usage:
//   const ai = new CombatAI(character, allChars, 'aggressive');
//   ai.update(dt, fx);
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { CombatFSM } from './CombatFSM.js';
import {
  AGGRESSIVE_AI_STATES,
  DEFENSIVE_AI_STATES,
  TANK_AI_STATES,
} from './CharacterStates.js';
import { CombatCharacter, FACTION_COLORS } from './CombatCharacter.js';
import type { BattlegroundEffects } from '../battleground/BattlegroundEffects.js';

// ── Types ────────────────────────────────────────────────────────

export type AIPersonality = 'aggressive' | 'defensive' | 'tank';

// ── Constants ────────────────────────────────────────────────────

const PATROL_RADIUS = 12;
const RETURN_TOLERANCE_SQ = 2 * 2;   // distance² to consider "at origin"
const IDLE_DURATION = 2;             // seconds before picking new patrol point
const RESPAWN_TIME = 8;
// ═══
// ═══════════════════════════════════════════════════════════════════

export class CombatAI {
  readonly character: CombatCharacter;
  private allCharacters: CombatCharacter[];
  private personality: AIPersonality;

  // Target tracking
  private target: CombatCharacter | null = null;
  private enabled = true;

  // Attack cooldown FSM
  private cooldownFSM: CombatFSM;

  // Patrol state
  private idleTimer = 0;
  private patrolTarget = new THREE.Vector3();

  // Damage tracking (prevent multi-hit per attack)
  private damageDealt = new Set<string>();

  // Reusable vectors
  private tmpVec2 = new THREE.Vector2();

  constructor(
    character: CombatCharacter,
    allCharacters: CombatCharacter[],
    personality: AIPersonality = 'aggressive',
  ) {
    this.character = character;
    this.allCharacters = allCharacters;
    this.personality = personality;

    // Create cooldown FSM based on personality
    const cooldownConfig =
      personality === 'aggressive' ? AGGRESSIVE_AI_STATES :
      personality === 'defensive' ? DEFENSIVE_AI_STATES :
      TANK_AI_STATES;

    this.cooldownFSM = new CombatFSM(cooldownConfig, {});
    this.patrolTarget.copy(character.patrolOrigin);
  }

  /** Set character list (for when units are added/removed) */
  setCharacters(chars: CombatCharacter[]): void {
    this.allCharacters = chars;
  }

  /** Main AI update — call each frame */
  update(dt: number, fx?: BattlegroundEffects): void {
    const char = this.character;

    // ── Dead: handle respawn timer ──
    if (char.isDead) {
      char.respawnTimer += dt;
      if (char.respawnTimer >= RESPAWN_TIME) {
        char.respawn(fx);
        this.target = null;
        this.damageDealt.clear();
      }
      return;
    }

    if (!this.enabled) return;

    // ── Clear damage tracking when leaving canDamage state ──
    if (!char.fsm.hasTag('canDamage')) {
      this.damageDealt.clear();
    }

    // ── Deal damage to enemies in range during canDamage ──
    if (char.fsm.hasTag('canDamage')) {
      this.doDamage(fx);
    }

    // ── Find target ──
    this.findTarget();

    if (this.target && this.target.isAlive) {
      // ── Has target: face → approach → attack ──
      this.engageTarget(dt, fx);
    } else {
      this.target = null;
      // ── No target: return to origin or idle ──
      this.returnToOrigin(dt);
    }

    // Update health bar
    this.updateHealthBar();
  }

  dispose(): void {
    this.cooldownFSM.dispose();
  }

  // ── Target finding (replaces cannon-es detector sphere) ────────

  private findTarget(): void {
    // If we have a valid target, keep it
    if (this.target && this.target.isAlive) {
      const dist = this.distXZ(this.character.group.position, this.target.group.position);
      if (dist <= this.character.aggroRange * 1.5) return; // still in range
      this.target = null; // fled
    }

    // Scan for nearest enemy
    let closest: CombatCharacter | null = null;
    let closestDist = this.character.aggroRange;

    for (const other of this.allCharacters) {
      if (other === this.character) continue;
      if (!other.isAlive) continue;
      if (!this.isEnemy(this.character, other)) continue;

      const dist = this.distXZ(this.character.group.position, other.group.position);
      if (dist < closestDist) {
        closest = other;
        closestDist = dist;
      }
    }

    this.target = closest;
  }

  // ── Engage target (annihilate's Ai.js update with target) ──────

  private engageTarget(dt: number, fx?: BattlegroundEffects): void {
    const char = this.character;
    const target = this.target!;

    // Direction to target
    char.direction.set(
      target.group.position.x - char.group.position.x,
      target.group.position.z - char.group.position.z,
    );

    // Face target (if FSM allows)
    if (char.fsm.hasTag('canFacing')) {
      char.facing.copy(char.direction);
      char.group.rotation.y = -char.facing.angle() + Math.PI / 2;
    }

    const dist = char.direction.length();

    if (dist > char.attackRange) {
      // ── Move toward target ──
      char.fsm.send('run');

      char.direction.normalize().multiplyScalar(char.speed * dt * 60);
      if (char.fsm.hasTag('canMove')) {
        char.group.position.x += char.direction.x;
        char.group.position.z += char.direction.y;
      }
    } else {
      // ── In attack range: attack! ──
      this.tryAttack();
    }
  }

  // ── Attack with cooldown (annihilate's MutantAi pattern) ───────

  private tryAttack(): void {
    if (this.cooldownFSM.matches('canAttack')) {
      // Send attack to cooldown FSM (starts cooldown timer)
      this.cooldownFSM.send('attack');
      // Send attack to character FSM (triggers animation + canDamage)
      this.character.fsm.send('attack');
    } else {
      // On cooldown — stop moving but stay facing target
      this.character.fsm.send('stop');
    }
  }

  // ── Deal damage during canDamage frames ────────────────────────

  private doDamage(fx?: BattlegroundEffects): void {
    const char = this.character;

    for (const other of this.allCharacters) {
      if (other === char) continue;
      if (!other.isAlive) continue;
      if (!this.isEnemy(char, other)) continue;
      if (this.damageDealt.has(other.id)) continue; // already hit this attack

      const dist = this.distXZ(char.group.position, other.group.position);
      if (dist > char.attackRange * 1.2) continue; // slightly generous for melee

      // Deal damage!
      const dmg = char.damage * (0.8 + Math.random() * 0.4); // ±20% variance
      const isKnockDown = char.fsm.hasTag('knockDown');
      other.hit(dmg, isKnockDown, fx);
      this.damageDealt.add(other.id);

      // Attack VFX
      if (fx) {
        fx.attackSlash(char.group.position, char.group.rotation.y, FACTION_COLORS[char.faction]);
      }
    }
  }

  // ── Return to origin (annihilate's Ai.js no-target behavior) ───

  private returnToOrigin(dt: number): void {
    const char = this.character;

    this.tmpVec2.set(
      char.group.position.x - char.patrolOrigin.x,
      char.group.position.z - char.patrolOrigin.z,
    );

    if (this.tmpVec2.lengthSq() > RETURN_TOLERANCE_SQ) {
      // Run back to origin
      char.direction.set(
        char.patrolOrigin.x - char.group.position.x,
        char.patrolOrigin.z - char.group.position.z,
      );

      char.fsm.send('run');
      char.facing.copy(char.direction);

      if (char.fsm.hasTag('canMove')) {
        char.group.rotation.y = -char.facing.angle() + Math.PI / 2;
        char.direction.normalize().multiplyScalar(char.speed * dt * 60);
        char.group.position.x += char.direction.x;
        char.group.position.z += char.direction.y;
      }
    } else {
      // At origin — idle or patrol
      this.idleTimer += dt;
      char.fsm.send('stop');

      if (this.idleTimer > IDLE_DURATION) {
        this.idleTimer = 0;
        this.pickPatrolTarget();
      }
    }
  }

  private pickPatrolTarget(): void {
    const angle = Math.random() * Math.PI * 2;
    const radius = 3 + Math.random() * PATROL_RADIUS;
    this.patrolTarget.set(
      this.character.patrolOrigin.x + Math.cos(angle) * radius,
      0,
      this.character.patrolOrigin.z + Math.sin(angle) * radius,
    );
  }

  // ── Helpers ────────────────────────────────────────────────────

  private isEnemy(a: CombatCharacter, b: CombatCharacter): boolean {
    if (a.faction === 'neutral' || b.faction === 'neutral') return true;
    return a.faction !== b.faction;
  }

  private distXZ(a: THREE.Vector3, b: THREE.Vector3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private updateHealthBar(): void {
    const char = this.character;
    if (!char.healthBar) return;
    const mat = char.healthBar.material as THREE.SpriteMaterial;
    const tex = mat.map as THREE.CanvasTexture;
    const ctx = tex.image.getContext('2d') as CanvasRenderingContext2D;
    const w = tex.image.width;
    const h = tex.image.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, w, h);

    const pct = char.health / char.maxHealth;
    ctx.fillStyle = pct > 0.5 ? '#4CAF50' : pct > 0.25 ? '#FF9800' : '#F44336';
    ctx.fillRect(0, 0, w * pct, h);

    tex.needsUpdate = true;
    char.healthBar.visible = !char.isDead;
  }
}
