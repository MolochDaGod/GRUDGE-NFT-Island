// ═══════════════════════════════════════════════════════════════════
// GRUDGE VOXEL - CLIENT ENTRY POINT
// Third-person shoulder camera, WebSocket connection,
// chunk mesh management, Puter auth integration.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import {
  CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE,
  blockIndex, MessageType,
} from '@grudge/shared';
import type { ChunkData } from '@grudge/shared';
import { buildChunkMesh, createPlaceholderAtlas, createVoxelMaterial } from './engine/VoxelRenderer.js';
import { ChunkMeshPool } from './engine/ChunkMeshPool.js';
import { assetLoader } from './assets/AssetLoader.js';
import type { LoadedCharacter } from './assets/AssetLoader.js';
import { CharacterController } from './entities/CharacterController.js';
import { AnimationStateMachine } from './entities/AnimationStateMachine.js';
import type { AnimationInput } from './entities/AnimationStateMachine.js';
import { CombatSystem } from './combat/CombatSystem.js';
import { HitboxSystem } from './combat/HitboxSystem.js';
import { EntityManager } from './entities/EntityManager.js';
import { TargetSystem } from './combat/TargetSystem.js';
import { GameHUD } from './ui/GameHUD.js';
import { BlockInteraction } from './world/BlockInteraction.js';
import { grudgeAuth } from './auth/GrudgeAuth.js';
import { inputManager } from './input/InputManager.js';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera.js';
import { Inventory } from '@grudge/shared';
import { UIManager, SCREEN } from './ui/UIManager.js';
import { MainMenu } from './ui/MainMenu.js';
import { CharacterCreate } from './ui/CharacterCreate.js';
import { EscapeMenu } from './ui/EscapeMenu.js';
import { SettingsPanel, loadSettings } from './ui/SettingsPanel.js';
import type { GameSettings } from './ui/SettingsPanel.js';
import { InventoryUI } from './ui/InventoryUI.js';
import { ChatUI } from './ui/ChatUI.js';

// ═══════════════════════════════════════════════════════════════════
// THREE.JS SETUP
// ═══════════════════════════════════════════════════════════════════

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, CHUNK_SIZE * 6, CHUNK_SIZE * RENDER_DISTANCE);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, CHUNK_SIZE * RENDER_DISTANCE * 1.5);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.prepend(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x606080, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffeedd, 1.2);
sunLight.position.set(100, 200, 50);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 500;
sunLight.shadow.camera.left = -150;
sunLight.shadow.camera.right = 150;
sunLight.shadow.camera.top = 150;
sunLight.shadow.camera.bottom = -150;
scene.add(sunLight);
scene.add(sunLight.target);

const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x362907, 0.4);
scene.add(hemiLight);

// Texture atlas and material
const atlas = createPlaceholderAtlas();
const voxelMaterial = createVoxelMaterial(atlas);

// ═══════════════════════════════════════════════════════════════════
// PLAYER MODEL — Loaded from asset library (fallback box-biped)
// ═══════════════════════════════════════════════════════════════════

const playerGroup = new THREE.Group();
let playerCharacter: LoadedCharacter | null = null;

// Box-biped fallback (shown while FBX loads or if loading fails)
function buildFallbackBiped(): void {
  function box(w: number, h: number, d: number, color: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  const SKIN = 0xD4A574, TUNIC = 0x6B3A2A, ARMOR = 0x5A5A5A, PANTS = 0x3D2B1F, BOOTS = 0x2A1F14;
  const head = box(0.38, 0.38, 0.38, SKIN); head.position.y = 1.69; playerGroup.add(head);
  const torso = box(0.52, 0.62, 0.28, TUNIC); torso.position.y = 1.19; playerGroup.add(torso);
  const plate = box(0.48, 0.40, 0.04, ARMOR); plate.position.set(0, 1.28, -0.16); playerGroup.add(plate);
  const lArm = box(0.18, 0.60, 0.20, TUNIC); lArm.position.set(-0.36, 1.10, 0); playerGroup.add(lArm);
  const rArm = box(0.18, 0.60, 0.20, TUNIC); rArm.position.set(0.36, 1.10, 0); playerGroup.add(rArm);
  const lLeg = box(0.22, 0.70, 0.24, PANTS); lLeg.position.set(-0.14, 0.45, 0); playerGroup.add(lLeg);
  const rLeg = box(0.22, 0.70, 0.24, PANTS); rLeg.position.set(0.14, 0.45, 0); playerGroup.add(rLeg);
  const lBoot = box(0.22, 0.12, 0.30, BOOTS); lBoot.position.set(-0.14, 0.06, 0.02); playerGroup.add(lBoot);
  const rBoot = box(0.22, 0.12, 0.30, BOOTS); rBoot.position.set(0.14, 0.06, 0.02); playerGroup.add(rBoot);
}
buildFallbackBiped();
scene.add(playerGroup);

/** Swap the placeholder biped with a real loaded character model */
function attachCharacterModel(char: LoadedCharacter): void {
  // Remove all fallback children
  while (playerGroup.children.length > 0) {
    playerGroup.remove(playerGroup.children[0]);
  }
  // Add the real model as a child of playerGroup
  playerGroup.add(char.group);
  playerCharacter = char;
  console.log(`[Main] Character model attached (${char.meshNames.length} meshes, ${char.actions.size} animations)`);
}

// ═══════════════════════════════════════════════════════════════════
// PLAYER STATE & INPUT
// ═══════════════════════════════════════════════════════════════════

let playerId = '';
let animStateMachine: AnimationStateMachine | null = null;
const combatSystem = new CombatSystem('WARRIOR');
const hitboxSystem = new HitboxSystem();
const entityManager = new EntityManager(scene);
entityManager.setHitboxSystem(hitboxSystem);
const targetSystem = new TargetSystem(entityManager);
const gameHUD = new GameHUD();
const blockInteraction = new BlockInteraction(scene, getBlockAtWorld);
const playerInventory = new Inventory();

// Give the player some starter items
playerInventory.addItem('iron_sword');
playerInventory.addItem('wooden_shield');
playerInventory.addItem('leather_cap');
playerInventory.addItem('leather_pants');
playerInventory.addItem('health_potion', 5);
playerInventory.addItem('mana_potion', 3);

// Attach input manager to the canvas
inputManager.attach(renderer.domElement);

// ═══════════════════════════════════════════════════════════════════
// UI SYSTEM — Menus, settings, inventory, chat
// ═══════════════════════════════════════════════════════════════════

const uiManager = new UIManager();
const chatUI = new ChatUI();

/** Apply settings changes to the renderer/camera */
function applySettings(s: GameSettings): void {
  camera.fov = s.fov;
  camera.updateProjectionMatrix();
  renderer.shadowMap.enabled = s.shadows;
}

// Build all UI screens (they register lazily — DOM elements only created on show())
function buildUIScreens(): void {
  const mainMenu = new MainMenu({
    onPlay: () => {
      uiManager.close(SCREEN.MAIN_MENU);
      uiManager.inGame = true;
      enterWorld();
    },
    onCharacter: () => {
      uiManager.close(SCREEN.MAIN_MENU);
      uiManager.open(SCREEN.CHARACTER_CREATE);
    },
    onSettings: () => {
      uiManager.open(SCREEN.SETTINGS);
    },
    onLogout: () => {
      grudgeAuth.signOut();
      window.location.reload();
    },
  }, grudgeAuth.displayName, grudgeAuth.profile.playerClass, grudgeAuth.profile.level);

  const charCreate = new CharacterCreate(
    async (result) => {
      await grudgeAuth.updateProfile({
        playerClass: result.playerClass,
        faction: result.faction,
      });
      mainMenu.updatePlayer(grudgeAuth.displayName, result.playerClass, grudgeAuth.profile.level);
      uiManager.close(SCREEN.CHARACTER_CREATE);
      uiManager.open(SCREEN.MAIN_MENU);
    },
    () => {
      uiManager.close(SCREEN.CHARACTER_CREATE);
      uiManager.open(SCREEN.MAIN_MENU);
    },
  );

  const escapeMenu = new EscapeMenu({
    onResume: () => uiManager.close(SCREEN.ESCAPE_MENU),
    onSettings: () => uiManager.open(SCREEN.SETTINGS),
    onLogout: () => {
      uiManager.closeAll();
      uiManager.inGame = false;
      uiManager.open(SCREEN.MAIN_MENU);
      // Disconnect WebSocket
      if (ws) { ws.close(); ws = null; connected = false; }
    },
  });

  const settingsPanel = new SettingsPanel(
    () => uiManager.close(SCREEN.SETTINGS),
    applySettings,
  );

  const inventoryUI = new InventoryUI(playerInventory, () => uiManager.close(SCREEN.INVENTORY));

  uiManager.register(mainMenu);
  uiManager.register(charCreate);
  uiManager.register(escapeMenu);
  uiManager.register(settingsPanel);
  uiManager.register(inventoryUI);
  uiManager.register(chatUI);
}

buildUIScreens();
applySettings(loadSettings());

// ═══════════════════════════════════════════════════════════════════
// CHUNK MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

const chunkMeshes = new Map<string, THREE.Mesh>();
const chunkData = new Map<string, ChunkData>();
let chunksLoaded = 0;

// Worker pool for async off-main-thread meshing
const meshPool = new ChunkMeshPool(scene, voxelMaterial, chunkData, chunkMeshes);

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/** Decompress RLE chunk data from server */
function decompressChunk(compressed: Uint8Array): ChunkData {
  const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
  let writeIdx = 0;
  for (let i = 0; i < compressed.length; i += 2) {
    const value = compressed[i];
    const count = compressed[i + 1];
    for (let j = 0; j < count && writeIdx < data.length; j++) {
      data[writeIdx++] = value;
    }
  }
  return data;
}

/** Build (or rebuild) one chunk mesh with neighbor data for seamless boundaries */
function buildAndPlaceChunk(cx: number, cz: number, data: ChunkData): void {
  const key = chunkKey(cx, cz);

  // Remove old mesh if exists
  const oldMesh = chunkMeshes.get(key);
  if (oldMesh) {
    scene.remove(oldMesh);
    oldMesh.geometry.dispose();
    chunkMeshes.delete(key);
  }

  // Look up neighbor chunks for cross-boundary face culling
  const neighborData = {
    px: chunkData.get(chunkKey(cx + 1, cz)),
    nx: chunkData.get(chunkKey(cx - 1, cz)),
    pz: chunkData.get(chunkKey(cx, cz + 1)),
    nz: chunkData.get(chunkKey(cx, cz - 1)),
  };

  const geometry = buildChunkMesh(data, neighborData);
  if (!geometry) return;

  const mesh = new THREE.Mesh(geometry, voxelMaterial);
  mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  mesh.frustumCulled = true;

  scene.add(mesh);
  chunkMeshes.set(key, mesh);
}

/** Add a chunk via worker pool (async) and rebuild neighbors */
function addChunkMesh(cx: number, cz: number, data: ChunkData) {
  chunkData.set(chunkKey(cx, cz), data);
  chunksLoaded++;

  // Dispatch this chunk + neighbors to worker pool (non-blocking)
  meshPool.requestMesh(cx, cz);

  // Rebuild adjacent chunks that already exist (they now have a new neighbor)
  const adj: [number, number][] = [[cx+1,cz],[cx-1,cz],[cx,cz+1],[cx,cz-1]];
  for (const [ax, az] of adj) {
    if (chunkData.has(chunkKey(ax, az))) {
      meshPool.requestMesh(ax, az);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// PHYSICS (CLIENT-SIDE) — Delegated to CharacterController
// ═══════════════════════════════════════════════════════════════════

function getBlockAtWorld(wx: number, wy: number, wz: number): number {
  const cx = Math.floor(wx / CHUNK_SIZE);
  const cz = Math.floor(wz / CHUNK_SIZE);
  const chunk = chunkData.get(chunkKey(cx, cz));
  if (!chunk) return 0;
  const lx = ((Math.floor(wx) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const lz = ((Math.floor(wz) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const ly = Math.floor(wy);
  if (ly < 0 || ly >= CHUNK_HEIGHT) return 0;
  return chunk[blockIndex(lx, ly, lz)];
}

function isSolid(wx: number, wy: number, wz: number): boolean {
  const id = getBlockAtWorld(wx, wy, wz);
  return id > 0 && id !== 5; // Not air or water
}

// Create the character controller and camera
const controller = new CharacterController(isSolid);
const tpCamera = new ThirdPersonCamera(camera, isSolid);

import type { MovementInput, CombatInput } from './input/InputManager.js';

/** Last combat state snapshot — used by HUD in render section */
let lastCombatState: ReturnType<typeof combatSystem.getState> = combatSystem.getState();

/** Run one fixed-timestep physics + combat + animation tick */
function physicsTick(dt: number, move: MovementInput, combat: CombatInput) {
  controller.movementLocked = animStateMachine?.isLocked ?? false;

  // 1. Character physics
  const state = controller.update(dt, move);

  // 2. Combat system (gates actions through stamina, manages health/parry)
  const combatState = combatSystem.update(dt, combat, state);

  // 3. Animation state machine (combat-gated inputs)
  if (animStateMachine) {
    const animInput: AnimationInput = {
      moveSpeed: state.moveSpeed,
      movingBack: state.movingBack,
      sprinting: state.isSprinting,
      onGround: state.onGround,
      velocityY: state.velocity.y,
      attackPressed: combatState.attackAllowed,
      blockHeld: combatState.blockAllowed || combatState.isParrying,
      dodgePressed: combatState.dodgeAllowed,
      castPressed: combatState.castAllowed,
      isDead: combatState.isDead,
      wasHit: combatState.wasHit,
    };
    animStateMachine.update(dt, animInput);
  }

  // Keep latest combat state for HUD
  lastCombatState = combatState;
}

// ═══════════════════════════════════════════════════════════════════
// WEBSOCKET CONNECTION
// ═══════════════════════════════════════════════════════════════════

let ws: WebSocket | null = null;
let connected = false;

/** Are we running on a production HTTPS host (no local game server)? */
const isRemoteHost = window.location.protocol === 'https:'
  && !window.location.hostname.match(/^(localhost|127\.0\.0\.1)$/);

function connectToServer() {
  // Explicit env override (set VITE_WS_URL in Vercel for deployed game server)
  let wsUrl = import.meta.env.VITE_WS_URL || '';

  if (!wsUrl) {
    if (isRemoteHost) {
      // No game server configured yet — run in offline/singleplayer mode
      console.log('[Client] No game server configured — running offline');
      offlineSpawn();
      return;
    }
    // Local dev: connect to localhost game server
    wsUrl = `ws://${window.location.hostname || 'localhost'}:3000`;
  }

  console.log(`[Client] Connecting to ${wsUrl}...`);

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    console.warn('[Client] WebSocket creation failed:', e);
    offlineSpawn();
    return;
  }

  ws.onopen = () => {
    console.log('[Client] Connected to server');
    connected = true;
    ws!.send(JSON.stringify({
      type: MessageType.JOIN,
      data: grudgeAuth.getJoinPayload(),
    }));

    // Connect block interaction to network
    blockInteraction.setSendFn((msg) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    });
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      handleServerMessage(msg);
    } catch (e) {
      console.error('[Client] Bad message:', e);
    }
  };

  ws.onerror = () => {
    console.warn('[Client] WebSocket error — falling back to offline');
  };

  ws.onclose = () => {
    console.log('[Client] Disconnected');
    connected = false;
    // Only retry if we have a configured server URL
    if (import.meta.env.VITE_WS_URL) {
      setTimeout(connectToServer, 5000);
    }
  };
}

/** Spawn the player locally when no game server is available */
function offlineSpawn() {
  controller.setSpawn(0, 80, 0);
  // Initialize camera after spawn so it points at the player immediately
  tpCamera.teleport(controller.position, controller.yaw);
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'none';
  console.log('[Client] Offline mode — spawned at 0, 80, 0');
}

function handleServerMessage(msg: { type: string; data: any }) {
  switch (msg.type) {
case MessageType.WELCOME: {
      playerId = msg.data.playerId;
      controller.setSpawn(msg.data.spawn.x, msg.data.spawn.y, msg.data.spawn.z);
      // Initialize camera now that we have a real spawn position
      tpCamera.teleport(controller.position, controller.yaw);
      console.log(`[Client] Spawned at ${msg.data.spawn.x}, ${msg.data.spawn.y}, ${msg.data.spawn.z}`);

      const loadingEl = document.getElementById('loading');
      if (loadingEl) loadingEl.style.display = 'none';
      break;
    }
    case MessageType.CHUNK: {
      const { cx, cz, blocks } = msg.data;
      // Decode base64 to Uint8Array, then decompress RLE
      const binary = atob(blocks);
      const compressed = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        compressed[i] = binary.charCodeAt(i);
      }
      const data = decompressChunk(compressed);
      addChunkMesh(cx, cz, data);

      // Update loading progress
      const fill = document.getElementById('load-fill');
      if (fill) {
        const progress = Math.min(100, (chunksLoaded / 50) * 100);
        fill.style.width = `${progress}%`;
      }
      break;
    }
    case MessageType.BLOCK_UPDATE: {
      const { x, y, z, blockId } = msg.data;
      const cx = Math.floor(x / CHUNK_SIZE);
      const cz = Math.floor(z / CHUNK_SIZE);
      const key = chunkKey(cx, cz);
      const chunk = chunkData.get(key);
      if (chunk) {
        const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        chunk[blockIndex(lx, y, lz)] = blockId;
        // Rebuild mesh (with neighbor data)
        buildAndPlaceChunk(cx, cz, chunk);
      }
      break;
    }
    case MessageType.PLAYER_JOIN: {
      const { id, name, position } = msg.data;
      if (id !== playerId) {
        entityManager.spawn(id, 'player', name ?? `Player_${id.slice(0, 4)}`, {
          position,
          yaw: 0,
          health: 250,
          maxHealth: 250,
        });
        chatUI.addMessage(`${name ?? id} joined the world`, 'system');
      }
      break;
    }
    case MessageType.PLAYER_LEAVE: {
      const { id } = msg.data;
      entityManager.despawn(id);
      chatUI.addMessage(`${id.slice(0, 8)} left the world`, 'system');
      break;
    }
    case MessageType.CHAT_MSG: {
      const { sender, text } = msg.data;
      chatUI.addMessage(text, 'other', sender);
      break;
    }
    case MessageType.WORLD_STATE: {
      const { players: remotePlayers, tick } = msg.data;
      const serverTime = tick * (1000 / 20); // Approx server time in ms
      for (const rp of remotePlayers) {
        entityManager.updateState(rp.id, {
          position: rp.position,
          yaw: rp.yaw,
          health: rp.health,
          maxHealth: rp.maxHealth,
          timestamp: serverTime,
        });
      }
      break;
    }
    case MessageType.MOB_STATE: {
      const { mobs, tick } = msg.data;
      const serverTime = tick * (1000 / 20);
      // Track which mobs the server told us about
      const activeMobIds = new Set<string>();
      for (const mob of mobs) {
        activeMobIds.add(mob.id);
        const existing = entityManager.get(mob.id);
        if (existing) {
          // Update existing mob
          entityManager.updateState(mob.id, {
            position: mob.position,
            yaw: mob.yaw,
            health: mob.health,
            maxHealth: mob.maxHealth,
            animState: mob.aiState,
            timestamp: serverTime,
          });
        } else {
          // Spawn new mob entity
          const entity = entityManager.spawn(mob.id, 'mob', mob.name, {
            position: mob.position,
            yaw: mob.yaw,
            health: mob.health,
            maxHealth: mob.maxHealth,
            animState: mob.aiState,
            timestamp: serverTime,
          });
          entity.level = mob.level;
        }
      }
      // Despawn mobs no longer reported by server
      for (const entity of entityManager.getAll()) {
        if (entity.type === 'mob' && !activeMobIds.has(entity.id)) {
          entityManager.despawn(entity.id);
        }
      }
      break;
    }
  }
}

// Send position updates to server
function sendPositionUpdate() {
  if (!ws || !connected) return;
  const p = controller.position;
  ws.send(JSON.stringify({
    type: MessageType.INPUT,
    data: {
      position: { x: p.x, y: p.y, z: p.z },
      yaw: controller.yaw,
    },
  }));
}

// ═══════════════════════════════════════════════════════════════════
// GAME LOOP — Fixed timestep physics + interpolated rendering
//
// Physics runs at a fixed 60 Hz regardless of display refresh rate.
// The renderer interpolates the player position between the last two
// physics snapshots so movement looks smooth at any framerate.
// ═══════════════════════════════════════════════════════════════════

const FIXED_DT = 1 / 60;           // 60 Hz physics
const MAX_FRAME_TIME = 0.25;        // Cap to prevent spiral-of-death
let lastTime = performance.now();
let accumulator = 0;
let frameCount = 0;
let fpsTimer = 0;
let currentFps = 0;
let posUpdateTimer = 0;

// Previous physics state for interpolation
const prevPos = new THREE.Vector3();
let prevYaw = 0;
const renderPos = new THREE.Vector3();

function gameLoop(time: number) {
  requestAnimationFrame(gameLoop);

  const frameTime = Math.min((time - lastTime) / 1000, MAX_FRAME_TIME);
  lastTime = time;
  accumulator += frameTime;

  // ── UI key routing (before input read, so uiBlocked takes effect) ──
  inputManager.uiBlocked = uiManager.isMenuOpen || chatUI.focused;
  if (inputManager.escapePressed) uiManager.handleKey('Escape');
  if (inputManager.iPressed) uiManager.handleKey('KeyI');
  if (inputManager.enterPressed && uiManager.inGame && !uiManager.isMenuOpen) {
    chatUI.toggleFocus();
  }

  // ── Read input once per render frame ──
  const move = inputManager.getMovement();
  const combat = inputManager.getCombat();
  const mouseDelta = inputManager.consumeMouseDelta();
  const wheelDelta = inputManager.consumeWheelDelta();

  // Combat rising-edge triggers (attack, dodge, cast) should only fire
  // on the FIRST physics tick of each render frame.
  let firstTick = true;

  // ── Fixed-rate physics ticks ──
  while (accumulator >= FIXED_DT) {
    prevPos.copy(controller.position);
    prevYaw = controller.yaw;

    // First tick gets real rising-edge combat triggers; subsequent ticks don't
    const tickCombat: CombatInput = firstTick
      ? combat
      : { attackPressed: false, blockHeld: combat.blockHeld, dodgePressed: false, castPressed: false };

    physicsTick(FIXED_DT, move, tickCombat);
    firstTick = false;
    accumulator -= FIXED_DT;

    // Network updates (10 Hz)
    posUpdateTimer += FIXED_DT;
    if (posUpdateTimer >= 0.1) {
      posUpdateTimer = 0;
      sendPositionUpdate();
    }
  }

  // ── Interpolate for rendering ──
  const alpha = accumulator / FIXED_DT;
  renderPos.lerpVectors(prevPos, controller.position, alpha);
  const renderYaw = prevYaw + (controller.yaw - prevYaw) * alpha;

  playerGroup.position.copy(renderPos);
  playerGroup.rotation.y = renderYaw;

  // Tick all remote entities (interpolation, animation, hurtbox sync)
  entityManager.update(frameTime, camera);

  // Block interaction (raycast, mining, placement)
  blockInteraction.update(
    frameTime, camera, renderPos,
    inputManager.held('KeyG'),            // G = mine
    inputManager.held('KeyV'),            // V = place (single press TODO)
    window.innerWidth, window.innerHeight,
  );

  // Tab-target cycling + nameplate rendering
  targetSystem.update(
    renderPos, inputManager.tabPressed, camera,
    window.innerWidth, window.innerHeight,
  );

  // Camera uses interpolated position + per-frame mouse delta
  tpCamera.update(frameTime, renderPos, renderYaw, inputManager.isFreeLooking, mouseDelta, wheelDelta);

  // Move sun with player
  sunLight.position.set(renderPos.x + 100, renderPos.y + 200, renderPos.z + 50);
  sunLight.target.position.set(renderPos.x, renderPos.y, renderPos.z);

  // Clear per-frame input triggers
  inputManager.endFrame();

  // Render
  renderer.render(scene, camera);

  // Update game HUD (player bars, target frame, combat log)
  gameHUD.update(lastCombatState, targetSystem);

  // FPS counter
  frameCount++;
  fpsTimer += frameTime;
  if (fpsTimer >= 1) {
    currentFps = frameCount;
    frameCount = 0;
    fpsTimer = 0;
  }

  // Debug HUD
  const fpsEl = document.getElementById('fps');
  const posEl = document.getElementById('pos');
  const chunksEl = document.getElementById('chunks');
  const trisEl = document.getElementById('tris');
  const animEl = document.getElementById('anim');
  const combatEl = document.getElementById('combat');
  const authEl = document.getElementById('auth-status');

  if (fpsEl) fpsEl.textContent = `FPS: ${currentFps}`;
  const p = controller.position;
  if (posEl) posEl.textContent = `Pos: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
  if (chunksEl) chunksEl.textContent = `Chunks: ${chunkMeshes.size}`;
  if (trisEl) trisEl.textContent = `Tris: ${renderer.info.render.triangles.toLocaleString()}`;
  if (animEl && animStateMachine) animEl.textContent = `Anim: ${animStateMachine.getDebugInfo()}`;
  if (combatEl) combatEl.textContent = combatSystem.getDebugInfo();
  const entityEl = document.getElementById('entities');
  if (entityEl) entityEl.textContent = entityManager.getDebugInfo();
  if (authEl) authEl.textContent = `Auth: ${grudgeAuth.displayName} (${grudgeAuth.method})`;
}

// ═══════════════════════════════════════════════════════════════════
// RESIZE HANDLER
// ═══════════════════════════════════════════════════════════════════

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ═════════════════════════════════════════════════════════════════
// AUTH SCREEN LOGIC
// ═════════════════════════════════════════════════════════════════

function setupAuthScreen() {
  const authScreen = document.getElementById('auth-screen');
  const puterBtn = document.getElementById('auth-puter') as HTMLButtonElement | null;
  const loginBtn = document.getElementById('auth-login') as HTMLButtonElement | null;
  const registerBtn = document.getElementById('auth-register') as HTMLButtonElement | null;
  const guestBtn = document.getElementById('auth-guest') as HTMLButtonElement | null;
  const usernameInput = document.getElementById('auth-username') as HTMLInputElement | null;
  const passwordInput = document.getElementById('auth-password') as HTMLInputElement | null;
  const authMsg = document.getElementById('auth-msg');

  if (!authScreen) {
    // No auth screen in HTML — just go to main menu
    showMainMenu();
    return;
  }

  function hideAuth() {
    if (authScreen) authScreen.style.display = 'none';
  }

  function showMsg(text: string, isSuccess = false) {
    if (!authMsg) return;
    authMsg.textContent = text;
    authMsg.className = isSuccess ? 'success' : '';
  }

  // Grudge ID (Puter SSO) — primary sign-in
  puterBtn?.addEventListener('click', async () => {
    showMsg('Connecting to Grudge ID...');
    const ok = await grudgeAuth.signInWithPuter();
    if (ok) {
      showMsg(`Welcome back, ${grudgeAuth.displayName}!`, true);
      setTimeout(() => { hideAuth(); showMainMenu(); }, 400);
    } else {
      showMsg('Grudge ID sign-in failed — try credentials or guest');
    }
  });

  // Credential login
  loginBtn?.addEventListener('click', async () => {
    const u = usernameInput?.value?.trim();
    const p = passwordInput?.value;
    if (!u || !p) { showMsg('Enter username and password'); return; }
    showMsg('Logging in...');
    const ok = await grudgeAuth.loginWithCredentials(u, p);
    if (ok) { hideAuth(); showMainMenu(); }
    else { showMsg('Login failed — check credentials or server status'); }
  });

  // Register
  registerBtn?.addEventListener('click', async () => {
    const u = usernameInput?.value?.trim();
    const p = passwordInput?.value;
    if (!u || !p) { showMsg('Enter username and password'); return; }
    showMsg('Creating account...');
    const ok = await grudgeAuth.register(u, p);
    if (ok) { hideAuth(); showMainMenu(); }
    else { showMsg('Registration failed — name taken or server down'); }
  });

  // Guest mode
  guestBtn?.addEventListener('click', () => {
    grudgeAuth.enterGuestMode();
    hideAuth();
    showMainMenu();
  });
}

/** Show the main menu after auth (or if no char, show char create first) */
function showMainMenu() {
  // Start the render loop if not already running
  if (!gameLoopStarted) {
    gameLoopStarted = true;
    requestAnimationFrame(gameLoop);
    loadPlayerAssets();
  }

  // If player has no class, go straight to character creation
  if (!grudgeAuth.profile.playerClass) {
    uiManager.open(SCREEN.CHARACTER_CREATE);
  } else {
    uiManager.open(SCREEN.MAIN_MENU);
  }
}

let gameLoopStarted = false;

/** Enter the game world (called from main menu “Play” button) */
function enterWorld() {
  console.log(`⚔ Grudge Warlords v0.1 ⚔ | ${grudgeAuth.displayName} [${grudgeAuth.method}]`);
  // Defer camera teleport until after we know the spawn (WELCOME message)
  connectToServer();

  // Show and initialize chat
  chatUI.show();
  chatUI.setSendFn((text) => {
    if (ws && connected) {
      ws.send(JSON.stringify({ type: MessageType.CHAT, data: { text } }));
      chatUI.addMessage(text, 'player', grudgeAuth.displayName);
    }
  });

  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = '';
}

/** Load character models and animations in background */
async function loadPlayerAssets() {
  try {
    await assetLoader.init();
    const char = await assetLoader.loadToonCharacter('human');
    attachCharacterModel(char);

    await assetLoader.loadGLBAnimPack('base');
    animStateMachine = new AnimationStateMachine(char);
    console.log(`[Main] AnimStateMachine ready — GLB packs: ${assetLoader.getGLBAnimPacks().join(', ')}`);
  } catch (e) {
    console.warn('[Main] Character loading failed, keeping fallback biped:', e);
  }
}

// ═════════════════════════════════════════════════════════════════
// BOOT SEQUENCE
// ═════════════════════════════════════════════════════════════════

(async () => {
  // Try silent Grudge ID auth (existing Puter session)
  const silentOk = await grudgeAuth.trySilentAuth();
  if (silentOk) {
    // Auto-authenticated via Grudge ID — skip login screen
    console.log(`[GrudgeAuth] Silent auth OK: ${grudgeAuth.displayName}`);
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.style.display = 'none';
    showMainMenu();
  } else {
    // Show Grudge ID login screen
    setupAuthScreen();
  }
})();
