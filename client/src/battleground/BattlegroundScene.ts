// ═══════════════════════════════════════════════════════════════════
// BATTLEGROUND SCENE — Standalone arena game mode
//
// Loads a SINGLE skinned/rigged character from the animation GLBs
// (they contain Armature + JOINTS + WEIGHTS), clones it per-unit via
// SkeletonUtils, scales ~100× (model is ~0.016 units tall), tints
// by faction, and drives AI combat with BattlegroundEffects.
//
// Static Tripo-generated character GLBs (no skeleton) are placed
// as decorative markers at faction spawn bases.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CombatCharacter, createHealthBar, type Faction, type CombatCharacterStats } from '../combat/CombatCharacter.js';
import { CombatAI, type AIPersonality } from '../combat/CombatAI.js';
import { BattlegroundEffects } from './BattlegroundEffects.js';

// ── Asset paths (relative to /models/battleground/) ─────────────

const BASE = '/models/battleground';

/** The Idle GLB doubles as our base mesh source (has Armature + skin). */
const BASE_CHAR_FILE = 'animations/Animation_Idle_withSkin.glb';

/** Scale factor: model bbox is ~0.016 units → want ~1.6 world units tall */
const CHAR_SCALE = 100;

// ── Animation manifest ──────────────────────────────────────────

const ANIM_DEFS = [
  { name: 'idle',       file: 'animations/Animation_Idle_withSkin.glb' },
  { name: 'walk',       file: 'animations/Animation_Walking_withSkin.glb' },
  { name: 'run',        file: 'animations/Animation_Running_withSkin.glb' },
  { name: 'attack',     file: 'animations/Animation_Thrust_Slash_withSkin.glb' },
  { name: 'death',      file: 'animations/Animation_Shot_in_the_Back_and_Fall_withSkin.glb' },
  { name: 'dodge',      file: 'animations/Animation_Roll_Dodge_withSkin.glb' },
  { name: 'hit',        file: 'animations/Animation_Hit_Reaction_1_withSkin.glb' },
  { name: 'combo',      file: 'animations/Animation_Weapon_Combo_2_withSkin.glb' },
  { name: 'jump',       file: 'animations/Animation_Jump_Run_withSkin.glb' },
  { name: 'sprint',     file: 'animations/Animation_Sprint_and_Sudden_Stop_withSkin.glb' },
  { name: 'standdodge', file: 'animations/Animation_Stand_Dodge_withSkin.glb' },
  { name: 'axespin',    file: 'animations/Animation_Axe_Spin_Attack_withSkin.glb' },
];

// ── Unit definitions (all use the same rigged base mesh) ────────

interface UnitDef {
  label: string;
  faction: Faction;
  count: number;
  personality: AIPersonality;
  stats: Partial<CombatCharacterStats>;
}

const UNIT_DEFS: UnitDef[] = [
  // Crusader faction
  { label: 'Infantry',    faction: 'crusader', count: 4, personality: 'aggressive', stats: { maxHealth: 120, damage: 15, speed: 3.0, aggroRange: 20, attackRange: 2.0, attackCooldown: 1.2 } },
  { label: 'Crossbowman', faction: 'crusader', count: 2, personality: 'defensive',  stats: { maxHealth: 80,  damage: 22, speed: 2.5, aggroRange: 25, attackRange: 8.0, attackCooldown: 2.0 } },
  { label: 'Knight',      faction: 'crusader', count: 2, personality: 'tank',        stats: { maxHealth: 180, damage: 20, speed: 2.8, aggroRange: 18, attackRange: 2.5, attackCooldown: 1.5 } },
  { label: 'Priest',      faction: 'crusader', count: 1, personality: 'defensive',  stats: { maxHealth: 70,  damage: 8,  speed: 2.2, aggroRange: 22, attackRange: 6.0, attackCooldown: 2.5 } },
  { label: 'Huntress',    faction: 'crusader', count: 2, personality: 'aggressive', stats: { maxHealth: 90,  damage: 18, speed: 3.5, aggroRange: 24, attackRange: 7.0, attackCooldown: 1.8 } },
  { label: 'Archer',      faction: 'crusader', count: 1, personality: 'defensive',  stats: { maxHealth: 85,  damage: 20, speed: 3.2, aggroRange: 26, attackRange: 9.0, attackCooldown: 2.0 } },

  // Orc faction
  { label: 'Raider',      faction: 'orc', count: 4, personality: 'aggressive', stats: { maxHealth: 130, damage: 18, speed: 3.2, aggroRange: 18, attackRange: 2.5, attackCooldown: 1.0 } },
  { label: 'Warboss',     faction: 'orc', count: 1, personality: 'tank',        stats: { maxHealth: 250, damage: 30, speed: 2.5, aggroRange: 16, attackRange: 3.0, attackCooldown: 2.0 } },
  { label: 'Skeleton',    faction: 'orc', count: 3, personality: 'aggressive', stats: { maxHealth: 100, damage: 14, speed: 2.8, aggroRange: 20, attackRange: 2.0, attackCooldown: 1.3 } },
  { label: 'Ghoul',       faction: 'orc', count: 2, personality: 'aggressive', stats: { maxHealth: 90,  damage: 16, speed: 3.5, aggroRange: 22, attackRange: 1.8, attackCooldown: 0.9 } },
  { label: 'Bone Golem',  faction: 'orc', count: 1, personality: 'tank',        stats: { maxHealth: 300, damage: 25, speed: 1.8, aggroRange: 14, attackRange: 3.5, attackCooldown: 2.5 } },
  { label: 'Mage',        faction: 'orc', count: 1, personality: 'defensive',  stats: { maxHealth: 75,  damage: 22, speed: 2.5, aggroRange: 24, attackRange: 8.0, attackCooldown: 2.2 } },

  // Neutrals (center)
  { label: 'Ogre',        faction: 'neutral', count: 1, personality: 'tank',       stats: { maxHealth: 350, damage: 35, speed: 2.0, aggroRange: 12, attackRange: 3.0, attackCooldown: 2.5 } },
  { label: 'Troll',       faction: 'neutral', count: 2, personality: 'defensive', stats: { maxHealth: 200, damage: 20, speed: 2.8, aggroRange: 15, attackRange: 2.5, attackCooldown: 1.8 } },
  { label: 'Dire Bear',   faction: 'neutral', count: 1, personality: 'tank',       stats: { maxHealth: 250, damage: 28, speed: 3.0, aggroRange: 10, attackRange: 2.5, attackCooldown: 2.0 } },
];

// ── Decorative static character markers at bases ────────────────

const DECO_MARKERS = [
  // Crusader spawn markers
  { file: 'characters/crusaders_infantry.glb',  pos: [-27, 0, -3],  scale: 2, rot: Math.PI / 4 },
  { file: 'characters/human_knight.glb',        pos: [-27, 0, 3],   scale: 2, rot: -Math.PI / 4 },
  { file: 'characters/elf_huntress.glb',        pos: [-23, 0, -5],  scale: 2, rot: Math.PI / 6 },
  { file: 'characters/crusaders_priest.glb',    pos: [-23, 0, 5],   scale: 2, rot: -Math.PI / 6 },
  // Orc spawn markers
  { file: 'characters/orc_warboss.glb',         pos: [27, 0, 0],    scale: 2.5, rot: Math.PI },
  { file: 'characters/orc_raider.glb',          pos: [24, 0, -4],   scale: 2, rot: Math.PI * 0.8 },
  { file: 'characters/skeleton_warrior.glb',    pos: [24, 0, 4],    scale: 2, rot: Math.PI * 1.2 },
  { file: 'characters/undead_ghoul.glb',        pos: [22, 0, -6],   scale: 2, rot: Math.PI * 0.7 },
  // Neutral center
  { file: 'neutrals/ogre.glb',                  pos: [0, 0.2, -6],  scale: 2.5, rot: 0 },
  { file: 'neutrals/dire_bear.glb',             pos: [0, 0.2, 6],   scale: 2, rot: Math.PI },
];

// ── Structures ──────────────────────────────────────────────────

const STRUCTURE_DEFS = [
  // Crusader side (negative X)
  { file: 'structures/tower-complete-large.glb', pos: [-35, 0, -15], scale: 3, rot: 0 },
  { file: 'structures/tower-complete-small.glb', pos: [-35, 0, 15],  scale: 3, rot: 0 },
  { file: 'structures/structure.glb',            pos: [-30, 0, 0],   scale: 3, rot: 0 },
  { file: 'structures/cannon.glb',               pos: [-28, 0, -8],  scale: 3, rot: Math.PI / 2 },
  { file: 'structures/cannon.glb',               pos: [-28, 0, 8],   scale: 3, rot: Math.PI / 2 },
  { file: 'structures/flag-high.glb',            pos: [-32, 0, 0],   scale: 3, rot: 0 },
  { file: 'structures/barrel.glb',               pos: [-27, 0, -4],  scale: 3, rot: 0 },
  { file: 'structures/crate.glb',                pos: [-27, 0, 4],   scale: 3, rot: 0.5 },

  // Orc side (positive X)
  { file: 'structures/tower-complete-large.glb', pos: [35, 0, -15], scale: 3, rot: Math.PI },
  { file: 'structures/tower-complete-small.glb', pos: [35, 0, 15],  scale: 3, rot: Math.PI },
  { file: 'structures/ship-wreck.glb',           pos: [32, 0, 0],   scale: 3, rot: Math.PI },
  { file: 'structures/cannon-mobile.glb',        pos: [28, 0, -8],  scale: 3, rot: -Math.PI / 2 },
  { file: 'structures/flag-pirate-high.glb',     pos: [32, 0, -5],  scale: 3, rot: 0 },
  { file: 'structures/chest.glb',                pos: [27, 0, 5],   scale: 3, rot: 0 },

  // Center arena
  { file: 'structures/structure-platform.glb',   pos: [0, 0, 0],    scale: 4, rot: 0 },
  { file: 'structures/structure-fence.glb',      pos: [0, 0, 12],   scale: 3, rot: 0 },
  { file: 'structures/structure-fence.glb',      pos: [0, 0, -12],  scale: 3, rot: 0 },
];

// ── Environment ─────────────────────────────────────────────────

const ENV_DEFS = [
  { file: 'environment/palm-bend.glb',     positions: [[-20, 0, -25], [22, 0, 28], [-18, 0, 30]] as number[][], scale: 3 },
  { file: 'environment/palm-straight.glb', positions: [[25, 0, -28], [-25, 0, 20]] as number[][], scale: 3 },
  { file: 'environment/rocks-a.glb',       positions: [[-15, 0, -20], [10, 0, 22], [18, 0, -18]] as number[][], scale: 3 },
  { file: 'environment/rocks-b.glb',       positions: [[15, 0, -25], [-12, 0, 18]] as number[][], scale: 3 },
  { file: 'environment/rocks-sand-a.glb',  positions: [[-8, 0, -28], [8, 0, 28]] as number[][], scale: 3 },
  { file: 'environment/forest_tree.glb',   positions: [[-22, 0, 10], [20, 0, -10]] as number[][], scale: 1 },
  { file: 'environment/oak_tree.glb',      positions: [[0, 0, -30], [0, 0, 30]] as number[][], scale: 1 },
  { file: 'environment/pine_tree.glb',     positions: [[-30, 0, -28], [30, 0, 28]] as number[][], scale: 1 },
];

// ── Spawn zones ──────────────────────────────────────────────────

const SPAWN_ZONES: Record<Faction, { center: THREE.Vector3; spread: number }> = {
  crusader: { center: new THREE.Vector3(-25, 0, 0), spread: 8 },
  orc:      { center: new THREE.Vector3(25, 0, 0),  spread: 8 },
  neutral:  { center: new THREE.Vector3(0, 0, 0),   spread: 10 },
};

// ── Faction material tint colors ────────────────────────────────

const FACTION_TINT: Record<Faction, THREE.Color> = {
  crusader: new THREE.Color(0.35, 0.55, 0.9),   // steel-blue
  orc:      new THREE.Color(0.85, 0.3, 0.25),   // crimson
  neutral:  new THREE.Color(0.5, 0.7, 0.3),     // olive-green
};

// ═══════════════════════════════════════════════════════════════════

export class BattlegroundScene {
  readonly scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private running = false;
  private animFrameId = 0;

  // Game state
  private characters: CombatCharacter[] = [];
  private ais: CombatAI[] = [];
  private loader = new GLTFLoader();
  private loadedModels = new Map<string, THREE.Group>();
  private loadedClips  = new Map<string, THREE.AnimationClip[]>();

  // The ONE rigged base character (from Idle GLB)
  private baseCharacter: THREE.Group | null = null;

  // Shared animation clips (name → clip)
  private sharedClips = new Map<string, THREE.AnimationClip>();

  // Effects system
  private fx!: BattlegroundEffects;

  // Orbit camera
  private orbitAngle = 0;
  private orbitDistance = 60;
  private orbitHeight = 35;
  private orbitTarget = new THREE.Vector3(0, 0, 0);
  private autoRotate = true;
  private mouseDown = false;
  private lastMouse = { x: 0, y: 0 };

  // Score tracking
  scores: Record<Faction, number> = { crusader: 0, orc: 0, neutral: 0 };
  onScoreUpdate?: (scores: Record<Faction, number>) => void;

  constructor(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.camera = camera;
    this.scene = new THREE.Scene();
  }

  // ── Init ─────────────────────────────────────────────────────

  async init(): Promise<void> {
    this.buildLighting();
    this.buildTerrain();
    this.fx = new BattlegroundEffects(this.scene);

    await this.loadBaseCharacter();
    await this.loadAnimationClips();
    await this.loadScenery();
    await this.loadDecoMarkers();
    this.spawnUnits();
    this.setupControls();

    console.log(`[Battleground] Initialized — ${this.characters.length} units spawned, ${this.sharedClips.size} anim clips loaded`);
  }

  private buildLighting(): void {
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.008);

    const ambient = new THREE.AmbientLight(0xffffff, 2);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff4e6, 8);
    sun.position.set(60, 120, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 300;
    const s = 80;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    this.scene.add(sun);

    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x4a3520, 1.5);
    this.scene.add(hemi);
  }

  private buildTerrain(): void {
    // Ground plane — sandy battleground
    const groundGeo = new THREE.PlaneGeometry(120, 80, 64, 64);
    groundGeo.rotateX(-Math.PI / 2);

    // Add some height variation
    const posAttr = groundGeo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const noise = Math.sin(x * 0.1) * Math.cos(z * 0.15) * 0.8
                  + Math.sin(x * 0.3 + z * 0.2) * 0.3;
      posAttr.setY(i, noise);
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xC2A060,
      roughness: 0.9,
      metalness: 0,
      flatShading: true,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Water border (slightly below ground)
    const waterGeo = new THREE.PlaneGeometry(200, 200);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1a6e8a,
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity: 0.7,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -0.8;
    this.scene.add(water);
  }

  // ── Asset loading ────────────────────────────────────────────

  /** Load a GLB, cache the scene + clips. Returns a SHALLOW clone. */
  private async loadGLB(path: string): Promise<{ group: THREE.Group; clips: THREE.AnimationClip[] }> {
    const url = `${BASE}/${path}`;
    if (this.loadedModels.has(path)) {
      return {
        group: this.loadedModels.get(path)!.clone(),
        clips: this.loadedClips.get(path) ?? [],
      };
    }

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          gltf.scene.traverse((node) => {
            if ((node as THREE.Mesh).isMesh) {
              node.castShadow = true;
              node.receiveShadow = true;
            }
          });
          this.loadedModels.set(path, gltf.scene);
          this.loadedClips.set(path, gltf.animations);
          resolve({ group: gltf.scene.clone(), clips: gltf.animations });
        },
        undefined,
        (err) => {
          console.warn(`[Battleground] Failed to load ${url}:`, err);
          reject(err);
        },
      );
    });
  }

  /** 1 — Load the ONE rigged base character from the Idle GLB */
  private async loadBaseCharacter(): Promise<void> {
    const { group } = await this.loadGLB(BASE_CHAR_FILE);
    this.baseCharacter = group;
    console.log('[Battleground] Base character loaded (skinned mesh with Armature)');
  }

  /** 2 — Load every animation GLB, extract first clip, rename → friendly name */
  private async loadAnimationClips(): Promise<void> {
    for (const { name, file } of ANIM_DEFS) {
      try {
        const { clips } = await this.loadGLB(file);
        if (clips.length > 0) {
          const clip = clips[0].clone();
          clip.name = name;
          this.sharedClips.set(name, clip);
        }
      } catch {
        console.warn(`[Battleground] Anim not found: ${file}`);
      }
    }
    console.log(`[Battleground] ${this.sharedClips.size} animation clips loaded`);
  }

  /** 3 — Load structures + environment props */
  private async loadScenery(): Promise<void> {
    // Structures
    for (const def of STRUCTURE_DEFS) {
      try {
        const { group } = await this.loadGLB(def.file);
        group.position.set(def.pos[0], def.pos[1], def.pos[2]);
        group.scale.setScalar(def.scale);
        group.rotation.y = def.rot;
        this.scene.add(group);
      } catch { /* skip */ }
    }

    // Environment props
    for (const def of ENV_DEFS) {
      try {
        const { group: template } = await this.loadGLB(def.file);
        for (const pos of def.positions) {
          const clone = template.clone();
          clone.position.set(pos[0], pos[1], pos[2]);
          clone.scale.setScalar(def.scale);
          clone.rotation.y = Math.random() * Math.PI * 2;
          this.scene.add(clone);
        }
      } catch { /* skip */ }
    }
  }

  /** 4 — Place static Tripo character GLBs as decorative base markers */
  private async loadDecoMarkers(): Promise<void> {
    for (const def of DECO_MARKERS) {
      try {
        const { group } = await this.loadGLB(def.file);
        group.position.set(def.pos[0], def.pos[1], def.pos[2]);
        group.scale.setScalar(def.scale);
        group.rotation.y = def.rot;
        // Dim the decorative markers so they look like stone statues
        group.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              if (mat && 'color' in mat) {
                (mat as THREE.MeshStandardMaterial).color.multiplyScalar(0.5);
                (mat as THREE.MeshStandardMaterial).metalness = 0.2;
                (mat as THREE.MeshStandardMaterial).roughness = 1.0;
              }
            }
          }
        });
        this.scene.add(group);
      } catch { /* skip missing */ }
    }
  }

  // ── Unit spawning ────────────────────────────────────────────

  /**
   * Clone the rigged base character per unit using SkeletonUtils.clone()
   * (required for skinned meshes — regular .clone() breaks skeleton bindings).
   * Scale by CHAR_SCALE, tint by faction, wire up AnimationMixer + clips.
   */
  private spawnUnits(): void {
    if (!this.baseCharacter) {
      console.error('[Battleground] No base character loaded — cannot spawn units');
      return;
    }

    let unitIdx = 0;

    for (const def of UNIT_DEFS) {
      const zone = SPAWN_ZONES[def.faction];
      const tint = FACTION_TINT[def.faction];

      for (let i = 0; i < def.count; i++) {
        // SkeletonUtils.clone preserves skeleton bindings
        const group = SkeletonUtils.clone(this.baseCharacter) as THREE.Group;

        // Scale up from ~0.016 to ~1.6 world units
        group.scale.setScalar(CHAR_SCALE);

        // Random spawn position within faction zone
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * zone.spread;
        const spawnPos = new THREE.Vector3(
          zone.center.x + Math.cos(angle) * r,
          0,
          zone.center.z + Math.sin(angle) * r,
        );

        // Tint all meshes by faction color
        group.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const tinted = mats.map((m) => {
              const clone = m.clone();
              if ('color' in clone) {
                (clone as THREE.MeshStandardMaterial).color.multiply(tint);
              }
              return clone;
            });
            mesh.material = tinted.length === 1 ? tinted[0] : tinted;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        // Health bar — in local space, counter-scaled so it looks right at CHAR_SCALE
        const healthBar = createHealthBar();
        healthBar.position.y = 0.02;  // local → 0.02 × 100 = 2.0 world units above feet
        healthBar.scale.set(0.015, 0.002, 0.01); // local → ×100 = (1.5, 0.2, 1.0) world
        group.add(healthBar);

        // CombatCharacter owns FSM, mixer, animation actions, health
        const clips = new Map<string, THREE.AnimationClip>(this.sharedClips);
        const char = new CombatCharacter({
          id: `unit_${unitIdx++}`,
          faction: def.faction,
          group,
          clips,
          spawnPos,
          stats: def.stats,
          healthBar,
        });

        // CombatAI owns cooldown FSM, aggro, movement, damage dealing
        const ai = new CombatAI(char, this.characters, def.personality);

        this.characters.push(char);
        this.ais.push(ai);
        this.scene.add(group);
      }
    }

    // Ensure all AIs reference the complete character list
    for (const ai of this.ais) ai.setCharacters(this.characters);
  }

  // ── Camera controls ──────────────────────────────────────────

  private setupControls(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.autoRotate = false;
    });

    canvas.addEventListener('mouseup', () => { this.mouseDown = false; });

    canvas.addEventListener('mousemove', (e) => {
      if (!this.mouseDown) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.orbitAngle -= dx * 0.005;
      this.orbitHeight = Math.max(10, Math.min(80, this.orbitHeight + dy * 0.2));
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('wheel', (e) => {
      this.orbitDistance = Math.max(20, Math.min(120, this.orbitDistance + e.deltaY * 0.05));
    });
  }

  private updateCamera(dt: number): void {
    if (this.autoRotate) {
      this.orbitAngle += dt * 0.1;
    }
    this.camera.position.set(
      this.orbitTarget.x + Math.sin(this.orbitAngle) * this.orbitDistance,
      this.orbitHeight,
      this.orbitTarget.z + Math.cos(this.orbitAngle) * this.orbitDistance,
    );
    this.camera.lookAt(this.orbitTarget);
  }

  // ── Game loop ────────────────────────────────────────────────

  start(): void {
    this.running = true;
    this.clock.start();
    this.tick();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.animFrameId);
  }

  private tick = (): void => {
    if (!this.running) return;
    this.animFrameId = requestAnimationFrame(this.tick);

    const dt = Math.min(this.clock.getDelta(), 0.05);

    // Update combat AI + character animations
    for (let i = 0; i < this.characters.length; i++) {
      this.ais[i].update(dt, this.fx);
      this.characters[i].update(dt);
    }

    // Update particle effects
    this.fx.update(dt);

    // Track kills for score
    this.updateScores();

    // Camera
    this.updateCamera(dt);

    // Render
    this.renderer.render(this.scene, this.camera);
  };

  private updateScores(): void {
    let crusaderAlive = 0, orcAlive = 0;
    for (const c of this.characters) {
      if (c.faction === 'crusader' && !c.isDead) crusaderAlive++;
      if (c.faction === 'orc' && !c.isDead) orcAlive++;
    }
    this.scores.crusader = crusaderAlive;
    this.scores.orc = orcAlive;
    this.onScoreUpdate?.(this.scores);
  }

  // ── Cleanup ──────────────────────────────────────────────────

  dispose(): void {
    this.stop();

    // Dispose combat AIs + characters
    for (const ai of this.ais) ai.dispose();
    for (const char of this.characters) {
      char.dispose();
      if (char.healthBar) {
        const mat = char.healthBar.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    }
    this.characters = [];
    this.ais = [];

    // Dispose effects
    this.fx.dispose();

    // Dispose scene geometries + materials
    this.scene.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const m = node as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat?.dispose();
      }
    });
    this.scene.clear();

    this.baseCharacter = null;
    this.sharedClips.clear();
    this.loadedModels.clear();
    this.loadedClips.clear();
  }

  /** Get current unit count by faction */
  getUnitCounts(): Record<Faction, { alive: number; total: number }> {
    const counts: Record<string, { alive: number; total: number }> = {
      crusader: { alive: 0, total: 0 },
      orc: { alive: 0, total: 0 },
      neutral: { alive: 0, total: 0 },
    };
    for (const c of this.characters) {
      counts[c.faction].total++;
      if (!c.isDead) counts[c.faction].alive++;
    }
    return counts as Record<Faction, { alive: number; total: number }>;
  }
}
