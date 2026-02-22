// ═══════════════════════════════════════════════════════════════════
// ASSET LOADER — Manifest-Driven Lazy Loading
// Reads manifest.json at startup, then loads ONLY what the current
// player needs: their race's model, their weapon's animation pack,
// and props for the current zone. Everything is cached in memory.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ── Types ─────────────────────────────────────────────────────────

export type Race = 'human' | 'barbarian' | 'elf' | 'orc' | 'dwarf' | 'undead';
export type AnimPackName = 'core' | 'locomotion' | 'sword-shield' | 'greatsword' | 'longbow' | 'axe' | 'magic' | 'injured';
export type GLBAnimPackName = 'base' | 'sword-shield' | 'greatsword' | 'magic' | 'axe' | 'unarmed';
export type EnemyType = 'demon' | 'dragon' | 'slime' | 'zombie';
export type PropCategory = 'medieval' | 'vegetation' | 'terrain' | 'structures';

/** A loaded + ready character with animation mixer */
export interface LoadedCharacter {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  currentAnim: string | null;
  meshNames: string[];
  skeletonType: string;
}

/** Manifest shape (matches manifest.json v2.0.0) */
interface GLBAnimClip { file: string; size: number }
interface GLBAnimPacks { [packName: string]: Record<string, GLBAnimClip> }

interface Manifest {
  version: string;
  basePath: string;
  characters: {
    'toon-rts': {
      skeleton: string;
      races: Record<string, { file: string; size: number; texture: string }>;
      colorVariants: Record<string, string[]>;
    };
    racalvin: {
      skeleton: string;
      file: string;
      size: number;
      format: string;
      glbAnimations: GLBAnimPacks;
    };
    enemies: Record<string, { file: string; size: number; format: string }>;
    knight: { file: string; size: number; format: string; textures: string[] };
    basemesh: { file: string; size: number; format: string };
  };
  animationPacks: Record<string, {
    skeleton: string;
    weaponType?: string;
    clips: Record<string, { file: string; size: number }>;
  }>;
  equipment: {
    weapons: Record<string, { file: string; size: number; type: string; race: string; format?: string }>;
    shields: Record<string, { file: string; size: number; race: string }>;
  };
  environments: Record<string, { file: string; size: number }>;
  props: {
    medieval: Record<string, { file: string; size: number }>;
    vegetation: Record<string, { path: string; format: string; models: number; texture: string; totalSize: number }>;
    terrain: Record<string, { path: string; format: string; models: number; texture?: string; textures?: number; totalSize: number }>;
    structures: Record<string, { path: string; format: string; models: number; texture: string; totalSize: number }>;
  };
  loadProfiles: Record<string, { description: string; estimatedSize: string; requires: string[] }>;
}

// ── AssetLoader ───────────────────────────────────────────────────

class AssetLoader {
  private manifest: Manifest | null = null;
  private basePath = '/models';

  // Loaders
  private loadingManager: THREE.LoadingManager;
  private fbxLoader: FBXLoader;
  private gltfLoader: GLTFLoader;
  private tgaLoader: TGALoader;

  // Caches — keyed by file path, loaded once, reused forever
  private modelCache   = new Map<string, THREE.Group>();
  private clipCache    = new Map<string, THREE.AnimationClip>();
  private textureCache = new Map<string, THREE.Texture>();
  private propCache    = new Map<string, THREE.Group>();
  private envCache     = new Map<string, THREE.Group>();

  // Track which packs are loaded (both FBX and GLB anim packs)
  private loadedPacks = new Set<string>();

  // Loading progress callback
  onProgress: ((loaded: number, total: number, label: string) => void) | null = null;

  constructor() {
    this.loadingManager = new THREE.LoadingManager();
    this.tgaLoader = new TGALoader(this.loadingManager);
    this.loadingManager.addHandler(/\.tga$/i, this.tgaLoader);
    this.fbxLoader = new FBXLoader(this.loadingManager);
    this.gltfLoader = new GLTFLoader(this.loadingManager);
  }

  // ── Initialization ──────────────────────────────────────────

  /** Fetch manifest.json — call this once at game start */
  async init(): Promise<void> {
    const res = await fetch(`${this.basePath}/manifest.json`);
    if (!res.ok) throw new Error(`[AssetLoader] Failed to load manifest: ${res.status}`);
    this.manifest = await res.json();
    this.basePath = this.manifest!.basePath;
    console.log(`[AssetLoader] Manifest v${this.manifest!.version} loaded — ${Object.keys(this.manifest!.animationPacks).length} animation packs`);
  }

  private requireManifest(): Manifest {
    if (!this.manifest) throw new Error('[AssetLoader] Call init() before loading assets');
    return this.manifest;
  }

  // ── Character Loading ───────────────────────────────────────

  /**
   * Load a Toon_RTS character by race. Only fetches that race's
   * model + texture + core animation pack. ~2MB total.
   */
  async loadToonCharacter(race: Race): Promise<LoadedCharacter> {
    const m = this.requireManifest();
    const raceData = m.characters['toon-rts'].races[race];
    if (!raceData) throw new Error(`[AssetLoader] Unknown race: ${race}`);

    this.emitProgress(0, 3, `Loading ${race} character...`);

    // 1. Load model FBX
    const modelUrl = `${this.basePath}/${raceData.file}`;
    const original = await this.loadFBX(modelUrl);
    const group = this.cloneModel(original);

    this.emitProgress(1, 3, `Loading ${race} texture...`);

    // 2. Load & apply faction texture
    const texUrl = `${this.basePath}/${raceData.texture}`;
    const texture = await this.loadTGA(texUrl);
    this.applyTexture(group, texture);

    this.emitProgress(2, 3, `Setting up animations...`);

    // 3. Scale to game world (1.8 blocks tall)
    this.autoScale(group, 1.8);
    this.enableShadows(group);

    // 4. Load core animation pack (idle, run, attack, death)
    await this.loadAnimationPack('core');

    // 5. Build character wrapper
    const mixer = new THREE.AnimationMixer(group);
    const actions = this.buildActions(mixer, 'core');
    const meshNames = this.collectMeshNames(group);

    const char: LoadedCharacter = {
      group, mixer, actions,
      currentAnim: null,
      meshNames,
      skeletonType: 'toon-rts',
    };

    // Start idle
    this.playAnimation(char, 'idle');
    this.emitProgress(3, 3, 'Ready');
    return char;
  }

  /**
   * Load the Racalvin GLB character (Mixamo skeleton).
   * Uses locomotion pack for base animations.
   */
  async loadRacalvin(): Promise<LoadedCharacter> {
    const m = this.requireManifest();
    const data = m.characters.racalvin;

    this.emitProgress(0, 3, 'Loading Racalvin...');

    // 1. Load GLB
    const modelUrl = `${this.basePath}/${data.file}`;
    const original = await this.loadGLB(modelUrl);
    const group = this.cloneModel(original);

    this.emitProgress(1, 3, 'Scaling & setting up...');

    this.autoScale(group, 1.8);
    this.enableShadows(group);

    // 2. Load locomotion animations
    await this.loadAnimationPack('locomotion');

    this.emitProgress(2, 3, 'Building animations...');

    const mixer = new THREE.AnimationMixer(group);
    const actions = this.buildActions(mixer, 'locomotion');
    const meshNames = this.collectMeshNames(group);

    const char: LoadedCharacter = {
      group, mixer, actions,
      currentAnim: null,
      meshNames,
      skeletonType: 'mixamo',
    };

    this.playAnimation(char, 'idle');
    this.emitProgress(3, 3, 'Ready');
    return char;
  }

  // ── Animation Pack Loading ──────────────────────────────────

  /**
   * Load an FBX animation pack by name. Downloads all clips in the pack
   * and caches them. Subsequent calls are instant (no-op).
   *
   * Example: await assetLoader.loadAnimationPack('sword-shield')
   */
  async loadAnimationPack(packName: AnimPackName): Promise<void> {
    if (this.loadedPacks.has(packName)) return;

    const m = this.requireManifest();
    const pack = m.animationPacks[packName];
    if (!pack) {
      console.warn(`[AssetLoader] Unknown animation pack: ${packName}`);
      return;
    }

    const clipEntries = Object.entries(pack.clips);
    let loaded = 0;

    console.log(`[AssetLoader] Loading FBX pack "${packName}" (${clipEntries.length} clips)...`);

    await Promise.all(clipEntries.map(async ([clipName, clipData]) => {
      const cacheKey = `${packName}/${clipName}`;
      if (this.clipCache.has(cacheKey)) { loaded++; return; }

      try {
        const url = `${this.basePath}/${clipData.file}`;
        const fbx = await this.loadFBX(url);
        if (fbx.animations.length > 0) {
          const clip = fbx.animations[0];
          clip.name = clipName;
          this.clipCache.set(cacheKey, clip);
        }
      } catch (e) {
        console.warn(`[AssetLoader] Skipped clip ${packName}/${clipName}: ${e}`);
      }
      loaded++;
      this.emitProgress(loaded, clipEntries.length, `${packName}: ${clipName}`);
    }));

    this.loadedPacks.add(packName);
    console.log(`[AssetLoader] Pack "${packName}" loaded (${loaded}/${clipEntries.length} clips)`);
  }

  /**
   * Load GLB animation pack for Racalvin character.
   * GLB clips are 5-6x smaller than FBX — prefer these when available.
   *
   * Example: await assetLoader.loadGLBAnimPack('sword-shield')
   */
  async loadGLBAnimPack(packName: GLBAnimPackName): Promise<void> {
    const cachePrefix = `glb:${packName}`;
    if (this.loadedPacks.has(cachePrefix)) return;

    const m = this.requireManifest();
    const packs = m.characters.racalvin.glbAnimations;
    const pack = packs?.[packName];
    if (!pack) {
      console.warn(`[AssetLoader] Unknown GLB animation pack: ${packName}`);
      return;
    }

    const clipEntries = Object.entries(pack);
    let loaded = 0;

    console.log(`[AssetLoader] Loading GLB pack "${packName}" (${clipEntries.length} clips)...`);

    await Promise.all(clipEntries.map(async ([clipName, clipData]) => {
      const cacheKey = `${cachePrefix}/${clipName}`;
      if (this.clipCache.has(cacheKey)) { loaded++; return; }

      try {
        const url = `${this.basePath}/${clipData.file}`;
        const clip = await this.loadGLBAnimation(url);
        if (clip) {
          clip.name = clipName;
          this.clipCache.set(cacheKey, clip);
        }
      } catch (e) {
        console.warn(`[AssetLoader] Skipped GLB clip ${packName}/${clipName}: ${e}`);
      }
      loaded++;
      this.emitProgress(loaded, clipEntries.length, `${packName}: ${clipName}`);
    }));

    this.loadedPacks.add(cachePrefix);
    console.log(`[AssetLoader] GLB pack "${packName}" loaded (${loaded}/${clipEntries.length} clips)`);
  }

  /**
   * Add all clips from a loaded pack onto an existing character.
   * Call after loadAnimationPack() to hot-swap weapon animations.
   */
  addPackToCharacter(char: LoadedCharacter, packName: AnimPackName): void {
    if (!this.loadedPacks.has(packName)) {
      console.warn(`[AssetLoader] Pack "${packName}" not loaded yet`);
      return;
    }

    const newActions = this.buildActions(char.mixer, packName);
    for (const [name, action] of newActions) {
      // Prefix with pack name to avoid collisions (e.g., "sword-shield/attack_1")
      char.actions.set(`${packName}/${name}`, action);
    }
    console.log(`[AssetLoader] Added ${newActions.size} clips from "${packName}" to character`);
  }

  // ── Enemy Loading ────────────────────────────────────────────

  /** Load an enemy model by type. Returns a cloned group each call. */
  async loadEnemy(type: EnemyType): Promise<LoadedCharacter> {
    const m = this.requireManifest();
    const data = m.characters.enemies[type];
    if (!data) throw new Error(`[AssetLoader] Unknown enemy type: ${type}`);

    this.emitProgress(0, 2, `Loading ${type}...`);

    const url = `${this.basePath}/${data.file}`;
    const original = await this.loadGLB(url);
    const group = this.cloneModel(original);
    this.autoScale(group, type === 'dragon' ? 3.0 : type === 'slime' ? 0.8 : 1.8);
    this.enableShadows(group);

    this.emitProgress(1, 2, 'Setting up mixer...');

    const mixer = new THREE.AnimationMixer(group);
    const actions = new Map<string, THREE.AnimationAction>();

    // GLB enemies may have embedded animations
    const origGltf = await this.loadGLBWithAnims(url);
    if (origGltf.animations.length > 0) {
      for (const clip of origGltf.animations) {
        actions.set(clip.name || 'default', mixer.clipAction(clip));
      }
    }

    this.emitProgress(2, 2, 'Ready');
    return {
      group, mixer, actions,
      currentAnim: null,
      meshNames: this.collectMeshNames(group),
      skeletonType: 'enemy',
    };
  }

  // ── Environment Loading ─────────────────────────────────────

  /** Load an environment GLB by its manifest key. Cached + cloned. */
  async loadEnvironment(envKey: string): Promise<THREE.Group | null> {
    const cached = this.envCache.get(envKey);
    if (cached) return cached.clone(true) as THREE.Group;

    const m = this.requireManifest();
    const data = m.environments?.[envKey];
    if (!data) {
      console.warn(`[AssetLoader] Unknown environment: ${envKey}`);
      return null;
    }

    const url = `${this.basePath}/${data.file}`;
    const original = await this.loadGLB(url);
    this.enableShadows(original);
    this.envCache.set(envKey, original);
    return original.clone(true) as THREE.Group;
  }

  /** Get all environment keys from the manifest */
  getEnvironmentKeys(): string[] {
    const m = this.requireManifest();
    return Object.keys(m.environments || {});
  }

  // ── Equipment Loading ───────────────────────────────────────

  /** Load a weapon model by its manifest key (supports FBX and GLB) */
  async loadWeapon(weaponKey: string): Promise<THREE.Group | null> {
    const m = this.requireManifest();
    const weapon = m.equipment.weapons[weaponKey];
    if (!weapon) {
      console.warn(`[AssetLoader] Unknown weapon: ${weaponKey}`);
      return null;
    }
    const url = `${this.basePath}/${weapon.file}`;
    const isGlb = weapon.format === 'glb' || weapon.file.endsWith('.glb');
    const original = isGlb ? await this.loadGLB(url) : await this.loadFBX(url);
    const group = this.cloneModel(original);
    this.enableShadows(group);
    return group;
  }

  /** Load a shield model by its manifest key */
  async loadShield(shieldKey: string): Promise<THREE.Group | null> {
    const m = this.requireManifest();
    const shield = m.equipment.shields[shieldKey];
    if (!shield) {
      console.warn(`[AssetLoader] Unknown shield: ${shieldKey}`);
      return null;
    }
    const url = `${this.basePath}/${shield.file}`;
    const fbx = await this.loadFBX(url);
    const group = this.cloneModel(fbx);
    this.enableShadows(group);
    return group;
  }

  // ── Prop Loading ────────────────────────────────────────────

  /** Load a medieval prop by its manifest key */
  async loadProp(propKey: string): Promise<THREE.Group | null> {
    const cached = this.propCache.get(propKey);
    if (cached) return cached.clone(true) as THREE.Group;

    const m = this.requireManifest();
    const prop = m.props.medieval[propKey];
    if (!prop) {
      console.warn(`[AssetLoader] Unknown prop: ${propKey}`);
      return null;
    }

    const url = `${this.basePath}/${prop.file}`;
    const original = await this.loadGLB(url);
    this.propCache.set(propKey, original);
    this.enableShadows(original);
    return original.clone(true) as THREE.Group;
  }

  /**
   * Load multiple props at once (e.g., all props for a zone).
   * Returns a map of key → cloned Group.
   */
  async loadProps(propKeys: string[]): Promise<Map<string, THREE.Group>> {
    const results = new Map<string, THREE.Group>();
    await Promise.all(propKeys.map(async (key) => {
      const prop = await this.loadProp(key);
      if (prop) results.set(key, prop);
    }));
    return results;
  }

  // ── Animation Playback ──────────────────────────────────────

  /** Switch to a named animation with crossfade */
  playAnimation(char: LoadedCharacter, name: string, fadeDuration = 0.25) {
    if (char.currentAnim === name) return;

    const newAction = char.actions.get(name);
    if (!newAction) return;

    const oldAction = char.currentAnim ? char.actions.get(char.currentAnim) : null;

    newAction.reset();
    newAction.setEffectiveTimeScale(1);
    newAction.setEffectiveWeight(1);

    if (name.includes('death')) {
      newAction.setLoop(THREE.LoopOnce, 1);
      newAction.clampWhenFinished = true;
    } else {
      newAction.setLoop(THREE.LoopRepeat, Infinity);
    }

    if (oldAction) {
      newAction.crossFadeFrom(oldAction, fadeDuration, true);
    }

    newAction.play();
    char.currentAnim = name;
  }

  /** Toggle visibility of gear meshes inside a character model */
  toggleGearMesh(char: LoadedCharacter, meshNamePart: string, visible: boolean) {
    char.group.traverse((child) => {
      if (child.name.toLowerCase().includes(meshNamePart.toLowerCase())) {
        child.visible = visible;
      }
    });
  }

  // ── Query helpers ───────────────────────────────────────────

  /** Get all available races from the manifest */
  getRaces(): Race[] {
    const m = this.requireManifest();
    return Object.keys(m.characters['toon-rts'].races) as Race[];
  }

  /** Get color variant texture names for a race */
  getColorVariants(race: Race): string[] {
    const m = this.requireManifest();
    return m.characters['toon-rts'].colorVariants[race] || [];
  }

  /** Get all available animation packs */
  getAnimationPacks(): AnimPackName[] {
    const m = this.requireManifest();
    return Object.keys(m.animationPacks) as AnimPackName[];
  }

  /** Get clip names in a loaded pack */
  getPackClipNames(packName: AnimPackName): string[] {
    const names: string[] = [];
    for (const key of this.clipCache.keys()) {
      if (key.startsWith(`${packName}/`)) {
        names.push(key.replace(`${packName}/`, ''));
      }
    }
    return names;
  }

  /** Get all prop keys in a category */
  getPropKeys(category: PropCategory): string[] {
    const m = this.requireManifest();
    return Object.keys(m.props[category] || {});
  }

  /** Get all enemy types from the manifest */
  getEnemyTypes(): EnemyType[] {
    const m = this.requireManifest();
    return Object.keys(m.characters.enemies || {}) as EnemyType[];
  }

  /** Get available GLB animation pack names */
  getGLBAnimPacks(): GLBAnimPackName[] {
    const m = this.requireManifest();
    return Object.keys(m.characters.racalvin?.glbAnimations || {}) as GLBAnimPackName[];
  }

  /** Get clip names from a loaded GLB animation pack */
  getGLBPackClipNames(packName: GLBAnimPackName): string[] {
    const prefix = `glb:${packName}/`;
    const names: string[] = [];
    for (const key of this.clipCache.keys()) {
      if (key.startsWith(prefix)) names.push(key.slice(prefix.length));
    }
    return names;
  }

  /** Get a cached animation clip by pack and clip name */
  getClip(packName: string, clipName: string): THREE.AnimationClip | undefined {
    return this.clipCache.get(`${packName}/${clipName}`) ?? this.clipCache.get(`glb:${packName}/${clipName}`);
  }

  /** Check if a pack is loaded */
  isPackLoaded(packName: AnimPackName): boolean {
    return this.loadedPacks.has(packName);
  }

  /** Estimate total download size for a load profile */
  getProfileSize(profileName: string): string {
    const m = this.requireManifest();
    return m.loadProfiles[profileName]?.estimatedSize || 'unknown';
  }

  // ── Internal loaders ────────────────────────────────────────

  private loadFBX(url: string): Promise<THREE.Group> {
    const cached = this.modelCache.get(url);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve, reject) => {
      this.fbxLoader.load(url,
        (fbx) => { this.modelCache.set(url, fbx); resolve(fbx); },
        undefined,
        (err) => { console.error(`[AssetLoader] FBX failed: ${url}`, err); reject(err); },
      );
    });
  }

  private loadGLB(url: string): Promise<THREE.Group> {
    const cached = this.modelCache.get(url);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url,
        (gltf) => { this.modelCache.set(url, gltf.scene); resolve(gltf.scene); },
        undefined,
        (err) => { console.error(`[AssetLoader] GLB failed: ${url}`, err); reject(err); },
      );
    });
  }

  /** Load a GLB and return the full GLTF result (with animations) */
  private gltfResultCache = new Map<string, { scene: THREE.Group; animations: THREE.AnimationClip[] }>();
  private loadGLBWithAnims(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    const cached = this.gltfResultCache.get(url);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url,
        (gltf) => {
          const result = { scene: gltf.scene, animations: gltf.animations };
          this.gltfResultCache.set(url, result);
          resolve(result);
        },
        undefined,
        (err) => { console.error(`[AssetLoader] GLB failed: ${url}`, err); reject(err); },
      );
    });
  }

  /** Load only the AnimationClip from a GLB file (for animation-only GLBs) */
  private loadGLBAnimation(url: string): Promise<THREE.AnimationClip | null> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url,
        (gltf) => {
          resolve(gltf.animations.length > 0 ? gltf.animations[0] : null);
        },
        undefined,
        (err) => { console.error(`[AssetLoader] GLB anim failed: ${url}`, err); reject(err); },
      );
    });
  }

  private loadTGA(url: string): Promise<THREE.Texture> {
    const cached = this.textureCache.get(url);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve, reject) => {
      this.tgaLoader.load(url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.flipY = false;
          this.textureCache.set(url, texture);
          resolve(texture);
        },
        undefined,
        (err) => { console.error(`[AssetLoader] TGA failed: ${url}`, err); reject(err); },
      );
    });
  }

  // ── Internal helpers ────────────────────────────────────────

  private cloneModel(original: THREE.Group): THREE.Group {
    return original.clone(true) as THREE.Group;
  }

  /** Build action map from all cached clips in a pack */
  private buildActions(mixer: THREE.AnimationMixer, packName: string): Map<string, THREE.AnimationAction> {
    const actions = new Map<string, THREE.AnimationAction>();
    for (const [cacheKey, clip] of this.clipCache) {
      if (cacheKey.startsWith(`${packName}/`)) {
        const clipName = cacheKey.replace(`${packName}/`, '');
        actions.set(clipName, mixer.clipAction(clip));
      }
    }
    return actions;
  }

  private collectMeshNames(group: THREE.Group): string[] {
    const names: string[] = [];
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) names.push(child.name);
    });
    return names;
  }

  private applyTexture(group: THREE.Group, texture: THREE.Texture) {
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (let i = 0; i < mats.length; i++) {
        const newMat = new THREE.MeshStandardMaterial({
          map: texture,
          side: THREE.FrontSide,
          metalness: 0.1,
          roughness: 0.8,
        });
        if (Array.isArray(mesh.material)) mesh.material[i] = newMat;
        else mesh.material = newMat;
      }
    });
  }

  private autoScale(group: THREE.Group, targetHeight: number) {
    const bbox = new THREE.Box3().setFromObject(group);
    const currentHeight = bbox.max.y - bbox.min.y;
    if (currentHeight <= 0) return;

    const scale = targetHeight / currentHeight;
    group.scale.setScalar(scale);

    // Shift feet to y=0
    group.updateMatrixWorld(true);
    const bbox2 = new THREE.Box3().setFromObject(group);
    group.position.y -= bbox2.min.y;
  }

  private enableShadows(group: THREE.Group) {
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  private emitProgress(loaded: number, total: number, label: string) {
    this.onProgress?.(loaded, total, label);
  }
}

// Export singleton
export const assetLoader = new AssetLoader();
