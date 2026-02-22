// ═══════════════════════════════════════════════════════════════════
// GRUDGE VOXEL - CLIENT ENTRY POINT
// Third-person shoulder camera, WebSocket connection,
// chunk mesh management, Puter auth integration.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import {
  CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE,
  PLAYER_SPEED, SPRINT_MULTIPLIER, JUMP_VELOCITY, GRAVITY,
  PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_WIDTH, blockIndex,
  MessageType,
} from '@grudge/shared';
import type { ChunkData, Vec3 } from '@grudge/shared';
import { buildChunkMesh, createPlaceholderAtlas, createVoxelMaterial } from './engine/VoxelRenderer.js';
import { assetLoader } from './assets/AssetLoader.js';
import type { LoadedCharacter } from './assets/AssetLoader.js';
import { CharacterController } from './entities/CharacterController.js';
import { AnimationStateMachine } from './entities/AnimationStateMachine.js';
import type { AnimationInput } from './entities/AnimationStateMachine.js';
import { grudgeAuth } from './auth/GrudgeAuth.js';

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
// THIRD-PERSON SHOULDER CAMERA
// ═══════════════════════════════════════════════════════════════════

// Camera offset: behind, slightly right, above shoulder (Dark Souls style)
const CAM_OFFSET = new THREE.Vector3(0.8, 1.9, -3.5);  // right, up, behind
const CAM_LOOK_OFFSET = new THREE.Vector3(0.3, 1.5, 0);  // look at point near right shoulder
const CAM_MIN_DIST = 1.0;   // minimum camera distance when blocked by world
const CAM_LERP_SPEED = 8.0; // smooth follow speed
const CAM_COLLISION_PADDING = 0.3;

// Current interpolated camera position
const camCurrentPos = new THREE.Vector3();
const camTargetPos = new THREE.Vector3();
const camLookTarget = new THREE.Vector3();

// ═══════════════════════════════════════════════════════════════════
// PLAYER STATE
// ═══════════════════════════════════════════════════════════════════

let playerId = '';
let animStateMachine: AnimationStateMachine | null = null;

// Input state
const keys: Record<string, boolean> = {};

// Combat input edge detection (rising-edge triggers)
let attackPressedThisFrame = false;
let dodgePressedThisFrame = false;
let castPressedThisFrame = false;

document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  // Rising-edge combat inputs
  if (e.code === 'KeyF' || e.code === 'Numpad0') attackPressedThisFrame = true;
  if (e.code === 'KeyQ') dodgePressedThisFrame = true;
  if (e.code === 'KeyR') castPressedThisFrame = true;
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Pointer lock for mouse look
renderer.domElement.addEventListener('click', () => {
  renderer.domElement.requestPointerLock();
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    controller.yaw -= e.movementX * 0.003;
    controller.pitch -= e.movementY * 0.003;
    controller.pitch = Math.max(-1.2, Math.min(0.9, controller.pitch));
  }
});

// Left click = attack
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0 && document.pointerLockElement === renderer.domElement) {
    attackPressedThisFrame = true;
  }
});

// Mouse wheel to adjust camera distance
let camDistMult = 1.0;
document.addEventListener('wheel', (e) => {
  camDistMult += e.deltaY * 0.001;
  camDistMult = Math.max(0.4, Math.min(2.0, camDistMult));
});

// ═══════════════════════════════════════════════════════════════════
// CHUNK MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

const chunkMeshes = new Map<string, THREE.Mesh>();
const chunkData = new Map<string, ChunkData>();
let chunksLoaded = 0;

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

/** Add a chunk mesh to the scene */
function addChunkMesh(cx: number, cz: number, data: ChunkData) {
  const key = chunkKey(cx, cz);

  // Remove old mesh if exists
  const oldMesh = chunkMeshes.get(key);
  if (oldMesh) {
    scene.remove(oldMesh);
    oldMesh.geometry.dispose();
  }

  chunkData.set(key, data);

  const geometry = buildChunkMesh(data);
  if (!geometry) return;

  const mesh = new THREE.Mesh(geometry, voxelMaterial);
  mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  mesh.frustumCulled = true;

  scene.add(mesh);
  chunkMeshes.set(key, mesh);
  chunksLoaded++;
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

// Create the character controller with block query callback
const controller = new CharacterController(isSolid);

function updatePhysics(dt: number) {
  const { yaw, pitch } = controller;

  // Lock movement during one-shot animations (attacks, dodge, etc.)
  controller.movementLocked = animStateMachine?.isLocked ?? false;

  // Run physics via controller
  const state = controller.update(dt, keys);

  // Feed animation state machine
  if (animStateMachine) {
    const animInput: AnimationInput = {
      moveSpeed: state.moveSpeed,
      movingBack: state.movingBack,
      sprinting: state.isSprinting,
      onGround: state.onGround,
      velocityY: state.velocity.y,
      attackPressed: attackPressedThisFrame,
      blockHeld: !!keys['KeyE'],
      dodgePressed: dodgePressedThisFrame,
      castPressed: castPressedThisFrame,
      isDead: false,
      wasHit: false,
    };
    animStateMachine.update(dt, animInput);
  }

  // Clear rising-edge triggers
  attackPressedThisFrame = false;
  dodgePressedThisFrame = false;
  castPressedThisFrame = false;

  // Position player model
  const playerPos = state.position;
  playerGroup.position.set(playerPos.x, playerPos.y, playerPos.z);
  playerGroup.rotation.y = yaw;

  // === THIRD-PERSON SHOULDER CAMERA ===

  const pivotY = playerPos.y + CAM_LOOK_OFFSET.y;
  const dist = CAM_OFFSET.z * camDistMult;
  const rightOff = CAM_OFFSET.x * camDistMult;
  const upOff = CAM_OFFSET.y;

  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  camTargetPos.set(
    playerPos.x + rightOff * Math.cos(yaw) + (-dist) * Math.sin(yaw) * cosP,
    pivotY + upOff + (-dist) * sinP,
    playerPos.z + rightOff * (-Math.sin(yaw)) + (-dist) * (-Math.cos(yaw)) * cosP,
  );

  // Camera collision raycast
  const pivotPoint = new THREE.Vector3(playerPos.x, pivotY, playerPos.z);
  const camDir = new THREE.Vector3().subVectors(camTargetPos, pivotPoint);
  const maxDist = camDir.length();
  camDir.normalize();

  let safeDist = maxDist;
  const rayStep = 0.3;
  for (let d = rayStep; d < maxDist; d += rayStep) {
    const rx = pivotPoint.x + camDir.x * d;
    const ry = pivotPoint.y + camDir.y * d;
    const rz = pivotPoint.z + camDir.z * d;
    if (isSolid(rx, ry, rz)) {
      safeDist = Math.max(CAM_MIN_DIST, d - CAM_COLLISION_PADDING);
      break;
    }
  }

  if (safeDist < maxDist) {
    camTargetPos.copy(pivotPoint).addScaledVector(camDir, safeDist);
  }

  camCurrentPos.lerp(camTargetPos, Math.min(1, CAM_LERP_SPEED * dt));
  camera.position.copy(camCurrentPos);

  camLookTarget.set(
    playerPos.x + CAM_LOOK_OFFSET.x * Math.cos(yaw) + 2 * Math.sin(yaw),
    pivotY + pitch * 1.5,
    playerPos.z + CAM_LOOK_OFFSET.x * (-Math.sin(yaw)) + 2 * (-Math.cos(yaw)),
  );
  camera.lookAt(camLookTarget);

  sunLight.position.set(playerPos.x + 100, playerPos.y + 200, playerPos.z + 50);
  sunLight.target.position.copy(playerPos);
}

// ═══════════════════════════════════════════════════════════════════
// WEBSOCKET CONNECTION
// ═══════════════════════════════════════════════════════════════════

let ws: WebSocket | null = null;
let connected = false;

function connectToServer() {
  // In production, use wss:// against the deployed game server.
  // Set VITE_WS_URL in Vercel env vars (e.g. wss://grudge-server.fly.dev).
  // In dev, falls back to ws://localhost:3000.
  const wsUrl = import.meta.env.VITE_WS_URL
    || `ws://${window.location.hostname || 'localhost'}:3000`;
  console.log(`[Client] Connecting to ${wsUrl}...`);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[Client] Connected to server');
    connected = true;
  ws!.send(JSON.stringify({
      type: MessageType.JOIN,
      data: grudgeAuth.getJoinPayload(),
    }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      handleServerMessage(msg);
    } catch (e) {
      console.error('[Client] Bad message:', e);
    }
  };

  ws.onclose = () => {
    console.log('[Client] Disconnected');
    connected = false;
    setTimeout(connectToServer, 3000);
  };
}

function handleServerMessage(msg: { type: string; data: any }) {
  switch (msg.type) {
    case MessageType.WELCOME: {
      playerId = msg.data.playerId;
      controller.setSpawn(msg.data.spawn.x, msg.data.spawn.y, msg.data.spawn.z);
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
        // Rebuild mesh
        addChunkMesh(cx, cz, chunk);
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
      pitch: controller.pitch,
    },
  }));
}

// ═══════════════════════════════════════════════════════════════════
// GAME LOOP
// ═══════════════════════════════════════════════════════════════════

let lastTime = performance.now();
let frameCount = 0;
let fpsTimer = 0;
let currentFps = 0;
let posUpdateTimer = 0;

function gameLoop(time: number) {
  requestAnimationFrame(gameLoop);

  const dt = Math.min((time - lastTime) / 1000, 0.1); // Cap dt to 100ms
  lastTime = time;

  // Physics + animation (controller → animStateMachine)
  updatePhysics(dt);

  // Send position updates 10x/sec
  posUpdateTimer += dt;
  if (posUpdateTimer > 0.1) {
    posUpdateTimer = 0;
    sendPositionUpdate();
  }

  // Debug HUD: animation state + auth
  const animEl = document.getElementById('anim');
  if (animEl && animStateMachine) animEl.textContent = `Anim: ${animStateMachine.getDebugInfo()}`;
  const authEl = document.getElementById('auth-status');
  if (authEl) authEl.textContent = `Auth: ${grudgeAuth.displayName} (${grudgeAuth.method})`;

  // Render
  renderer.render(scene, camera);

  // FPS counter
  frameCount++;
  fpsTimer += dt;
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

  if (fpsEl) fpsEl.textContent = `FPS: ${currentFps}`;
  const p = controller.position;
  if (posEl) posEl.textContent = `Pos: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
  if (chunksEl) chunksEl.textContent = `Chunks: ${chunkMeshes.size}`;
  if (trisEl) trisEl.textContent = `Tris: ${renderer.info.render.triangles.toLocaleString()}`;
}

// ═══════════════════════════════════════════════════════════════════
// RESIZE HANDLER
// ═══════════════════════════════════════════════════════════════════

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ═══════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// AUTH SCREEN LOGIC
// ═══════════════════════════════════════════════════════════════════

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
    // No auth screen in HTML — just start
    startGame();
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
      setTimeout(() => { hideAuth(); startGame(); }, 400);
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
    if (ok) { hideAuth(); startGame(); }
    else { showMsg('Login failed — check credentials or server status'); }
  });

  // Register
  registerBtn?.addEventListener('click', async () => {
    const u = usernameInput?.value?.trim();
    const p = passwordInput?.value;
    if (!u || !p) { showMsg('Enter username and password'); return; }
    showMsg('Creating account...');
    const ok = await grudgeAuth.register(u, p);
    if (ok) { hideAuth(); startGame(); }
    else { showMsg('Registration failed — name taken or server down'); }
  });

  // Guest mode
  guestBtn?.addEventListener('click', () => {
    grudgeAuth.enterGuestMode();
    hideAuth();
    startGame();
  });
}

async function startGame() {
  console.log(`⚔ Grudge Warlords v0.1 ⚔ | ${grudgeAuth.displayName} [${grudgeAuth.method}]`);
  // Initialize camera position to avoid lerp-from-origin pop
  camCurrentPos.copy(controller.position).add(new THREE.Vector3(0.8, 3.4, -3.5));
  connectToServer();
  requestAnimationFrame(gameLoop);

  // Load real character model in background (box-biped shows until ready)
  try {
    await assetLoader.init();
    const char = await assetLoader.loadToonCharacter('human');
    attachCharacterModel(char);

    // Load base GLB animations and set up state machine
    await assetLoader.loadGLBAnimPack('base');
    animStateMachine = new AnimationStateMachine(char);
    console.log(`[Main] AnimStateMachine ready — GLB packs: ${assetLoader.getGLBAnimPacks().join(', ')}`);
  } catch (e) {
    console.warn('[Main] Character loading failed, keeping fallback biped:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// BOOT SEQUENCE
// ═══════════════════════════════════════════════════════════════════

(async () => {
  // Try silent Grudge ID auth (existing Puter session)
  const silentOk = await grudgeAuth.trySilentAuth();
  if (silentOk) {
    // Auto-authenticated via Grudge ID — skip login screen
    console.log(`[GrudgeAuth] Silent auth OK: ${grudgeAuth.displayName}`);
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.style.display = 'none';
    startGame();
  } else {
    // Show Grudge ID login screen
    setupAuthScreen();
  }
})();
