// ═══════════════════════════════════════════════════════════════════
// COMBAT CHARACTER — Shared character class for the combat system
//
// Ports annihilate's Maria.js / Mutant.js interface into a single
// TypeScript class that works with our CombatFSM and Three.js.
//
// Each character owns:
//   • A Three.js Group (skinned mesh, scaled)
//   • An AnimationMixer + clip map
//   • A CombatFSM driving state transitions
//   • Direction / facing vectors (annihilate pattern)
//   • Health + damage stats
//   • fadeToAction() for smooth animation blending
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { CombatFSM, type ActionMap } from './CombatFSM.js';
import { MELEE_STATES, ANIM } from './CharacterStates.js';
import type { BattlegroundEffects } from '../battleground/BattlegroundEffects.js';

// ── Types ────────────────────────────────────────────────────────

export type Faction = 'crusader' | 'orc' | 'neutral';

export interface CombatCharacterStats {
  maxHealth: number;
  damage: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldown: number;
  attackSpeed: number;
}

const DEFAULT_STATS: CombatCharacterStats = {
  maxHealth: 100,
  damage: 15,
  speed: 3.0,
  aggroRange: 20,
  attackRange: 2.5,
  attackCooldown: 1.5,
  attackSpeed: 1.4,
};

// ── Faction tint colors (for effects) ────────────────────────────

export const FACTION_COLORS: Record<Faction, number> = {
  crusader: 0x4a90d9,
  orc: 0xd94a4a,
  neutral: 0x88aa44,
};

// ═══════════════════════════════════════════════════════════════════

export class CombatCharacter {
  readonly id: string;
  readonly faction: Faction;
  readonly isPlayer: boolean;

  // Three.js objects
  readonly group: THREE.Group;
  readonly mixer: THREE.AnimationMixer;

  // Animation system (annihilate's oaction pattern)
  readonly clips: Map<string, THREE.AnimationClip>;
  readonly oaction: Record<string, THREE.AnimationAction> = {};
  private activeAction: THREE.AnimationAction | null = null;

  // State machine
  readonly fsm: CombatFSM;

  // Movement (annihilate's direction/facing pattern)
  readonly direction = new THREE.Vector2();
  readonly facing = new THREE.Vector2(0, 1);
  speed: number;

  // Combat stats
  health: number;
  maxHealth: number;
  damage: number;
  aggroRange: number;
  attackRange: number;
  attackCooldown: number;
  attackSpeed: number;

  // Spawn/patrol
  readonly patrolOrigin: THREE.Vector3;
  readonly patrolTarget = new THREE.Vector3();

  // Health bar
  healthBar: THREE.Sprite | null = null;

  // Respawn
  respawnTimer = 0;
  private respawnTime = 8;

  // Whirlwind rotation tween state
  private whirlwindBaseRotY = 0;
  private whirlwindActive = false;
  private whirlwindT = 0;

  constructor(opts: {
    id: string;
    faction: Faction;
    isPlayer?: boolean;
    group: THREE.Group;
    clips: Map<string, THREE.AnimationClip>;
    spawnPos: THREE.Vector3;
    stats?: Partial<CombatCharacterStats>;
    healthBar?: THREE.Sprite;
  }) {
    this.id = opts.id;
    this.faction = opts.faction;
    this.isPlayer = opts.isPlayer ?? false;
    this.group = opts.group;
    this.clips = opts.clips;
    this.healthBar = opts.healthBar ?? null;

    const s = { ...DEFAULT_STATS, ...opts.stats };
    this.health = s.maxHealth;
    this.maxHealth = s.maxHealth;
    this.damage = s.damage;
    this.speed = s.speed;
    this.aggroRange = s.aggroRange;
    this.attackRange = s.attackRange;
    this.attackCooldown = s.attackCooldown;
    this.attackSpeed = s.attackSpeed;

    this.patrolOrigin = opts.spawnPos.clone();
    this.patrolTarget.copy(opts.spawnPos);
    this.group.position.copy(opts.spawnPos);

    // Create mixer targeting this group
    this.mixer = new THREE.AnimationMixer(this.group);

    // Build action map from clips (annihilate's oaction pattern)
    for (const [name, clip] of this.clips) {
      const action = this.mixer.clipAction(clip);
      this.oaction[name] = action;
      // One-shot animations (everything except idle, walk, run)
      if (!['idle', 'walk', 'run'].includes(name)) {
        action.loop = THREE.LoopOnce;
        action.clampWhenFinished = true;
      }
    }

    // Wire mixer finished event → FSM 'finish'
    this.mixer.addEventListener('finished', () => {
      this.fsm.send('finish');
    });

    // Build FSM action handlers
    const actions = this.buildFSMActions();
    this.fsm = new CombatFSM(MELEE_STATES, actions);

    // Start idle animation
    if (this.oaction[ANIM.idle]) {
      this.activeAction = this.oaction[ANIM.idle];
      this.activeAction.play();
    }
  }

  // ── Public API ─────────────────────────────────────────────────

  /** Update mixer + whirlwind rotation. Call each frame. */
  update(dt: number): void {
    this.mixer.update(dt);

    // Whirlwind spin effect (like annihilate's gsap rotation)
    if (this.whirlwindActive) {
      this.whirlwindT += dt;
      const TURN_DURATION = 0.3;
      const angle = ((this.whirlwindT / TURN_DURATION) % 1) * Math.PI * 2;
      this.group.rotation.y = this.whirlwindBaseRotY + angle;
    }
  }

  /** Is this character dead? */
  get isDead(): boolean {
    return this.fsm.matches('dead');
  }

  /** Is this character alive? */
  get isAlive(): boolean {
    return !this.isDead && this.health > 0;
  }

  /** Take damage (called by attacker). Sends hit/knockDown/dead to FSM. */
  hit(dmg: number, isKnockDown = false, fx?: BattlegroundEffects): void {
    if (this.isDead) return;

    this.health -= dmg;

    if (this.health <= 0) {
      this.health = 0;
      this.fsm.send('dead');
      // Death VFX
      fx?.deathSmoke(this.group.position.clone());
    } else if (isKnockDown) {
      this.fsm.send('knockDown');
    } else {
      this.fsm.send('hit');
    }

    // Hit VFX
    if (fx && this.health > 0) {
      const hitPos = this.group.position.clone();
      hitPos.y += 1;
      fx.hitSparks(hitPos, FACTION_COLORS[this.faction]);
    }
  }

  /** Respawn at patrol origin */
  respawn(fx?: BattlegroundEffects): void {
    this.health = this.maxHealth;
    this.group.position.copy(this.patrolOrigin);
    this.group.visible = true;
    this.respawnTimer = 0;
    this.fsm.reset('idle');

    fx?.spawnGlow(this.group.position.clone(), FACTION_COLORS[this.faction]);
  }

  /** Cleanup */
  dispose(): void {
    this.fsm.dispose();
    this.mixer.stopAllAction();
  }

  // ── Animation (annihilate's fadeToAction) ──────────────────────

  /**
   * Crossfade to a named animation clip.
   * duration=0 means instant switch (no blending).
   * Matches annihilate's fadeToAction exactly.
   */
  fadeToAction(name: string, duration = 0.15): void {
    const nextAction = this.oaction[name];
    if (!nextAction) return;

    if (duration > 0 && this.activeAction && this.activeAction !== nextAction) {
      nextAction.reset().play();
      this.activeAction.crossFadeTo(nextAction, duration, true);
    } else {
      if (this.activeAction && this.activeAction !== nextAction) {
        this.activeAction.stop();
      }
      nextAction.reset().play();
    }
    this.activeAction = nextAction;
  }

  /** Set facing direction + mesh rotation (annihilate pattern) */
  setFacing(x: number, z: number): void {
    this.facing.set(x, z);
    if (this.facing.lengthSq() > 0.001) {
      this.group.rotation.y = -this.facing.angle() + Math.PI / 2;
    }
  }

  // ── FSM action builders ────────────────────────────────────────

  private buildFSMActions(): ActionMap {
    return {
      // Locomotion
      playIdle: () => {
        this.whirlwindActive = false;
        this.fadeToAction(ANIM.idle);
      },
      playRun: () => {
        this.fadeToAction(ANIM.run);
      },

      // Attack combo (3-hit chain: attack → fist → strike)
      playAttackStart: () => {
        this.setTimeScale(ANIM.attack, this.attackSpeed);
        this.fadeToAction(ANIM.attack, 0.1);
      },
      playAttack: () => {
        this.setTimeScale(ANIM.attack, this.attackSpeed);
        this.fadeToAction(ANIM.attack, 0);
      },
      playFistStart: () => {
        this.setTimeScale(ANIM.combo, this.attackSpeed);
        this.fadeToAction(ANIM.combo, 0.1);
      },
      playFist: () => {
        this.setTimeScale(ANIM.combo, this.attackSpeed);
        this.fadeToAction(ANIM.combo, 0);
      },
      playStrikeStart: () => {
        this.setTimeScale(ANIM.axespin, this.attackSpeed);
        this.fadeToAction(ANIM.axespin, 0.1);
      },
      playStrike: () => {
        this.setTimeScale(ANIM.axespin, this.attackSpeed);
        this.fadeToAction(ANIM.axespin, 0);
      },
      playStrikeEnd: () => {
        this.fadeToAction(ANIM.idle, 0.2);
      },

      // Bash / Whirlwind
      playBashStart: () => {
        this.setTimeScale(ANIM.attack, this.attackSpeed);
        this.fadeToAction(ANIM.attack, 0.1);
      },
      playWhirlwind: () => {
        this.fadeToAction(ANIM.axespin, 0);
        this.whirlwindBaseRotY = this.group.rotation.y;
        this.whirlwindActive = true;
        this.whirlwindT = 0;
      },
      exitWhirlwind: () => {
        this.whirlwindActive = false;
        this.group.rotation.y = this.whirlwindBaseRotY;
      },

      // Air states
      playJump: () => {
        this.fadeToAction(ANIM.jump, 0.15);
      },
      doJump: () => {
        // Vertical impulse — without physics, just set a flag
        // (handled by movement system in CombatAI or PlayerController)
      },
      playFall: () => {
        this.fadeToAction(ANIM.jump, 0.3);
      },
      playAirAttack: () => {
        this.setTimeScale(ANIM.attack, this.attackSpeed);
        this.fadeToAction(ANIM.attack, 0);
      },
      playAirBash: () => {
        this.setTimeScale(ANIM.axespin, this.attackSpeed * 2);
        this.fadeToAction(ANIM.axespin, 0);
      },
      playAirDash: () => {
        this.fadeToAction(ANIM.dodge, 0);
      },

      // Defensive
      playBlock: () => {
        this.fadeToAction(ANIM.standdodge, 0.1);
      },
      playDash: () => {
        this.setTimeScale(ANIM.sprint, 2);
        this.fadeToAction(ANIM.sprint, 0.1);
      },
      playDashAttack: () => {
        this.setTimeScale(ANIM.attack, this.attackSpeed);
        this.fadeToAction(ANIM.attack, 0.1);
      },

      // Reactive
      playHit: () => {
        this.setTimeScale(ANIM.hit, 3);
        this.fadeToAction(ANIM.hit, 0.1);
      },
      playKnockDown: () => {
        this.fadeToAction(ANIM.death, 0.15);
      },
      playDead: () => {
        this.fadeToAction(ANIM.death, 0.15);
        // Clamp death animation
        if (this.activeAction) {
          this.activeAction.setLoop(THREE.LoopOnce, 1);
          this.activeAction.clampWhenFinished = true;
        }
      },
    };
  }

  private setTimeScale(clipName: string, scale: number): void {
    const action = this.oaction[clipName];
    if (action) action.timeScale = scale;
  }
}

// ── Health bar factory ───────────────────────────────────────────

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

export function updateHealthBar(char: CombatCharacter): void {
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
