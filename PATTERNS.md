# Grudge Warlords — Architecture Patterns

Working patterns and conventions for the browser voxel RPG.
This is a living document — update it as systems evolve.

---

## 1. Project Structure

```
grudge-voxel/
├── client/src/
│   ├── main.ts                         # Entry point, game loop, camera, networking
│   ├── auth/
│   │   └── GrudgeAuth.ts               # Grudge ID auth service (Puter.js SSO + KV profiles)
│   ├── assets/
│   │   └── AssetLoader.ts              # Manifest-driven lazy asset loading (singleton)
│   ├── combat/
│   │   ├── ParrySystem.ts              # Timing-window parry + riposte
│   │   └── StaminaSystem.ts            # Class-based resource pools (stamina/mana/focus/primal)
│   ├── engine/
│   │   └── VoxelRenderer.ts            # Chunk meshing, AO, greedy mesh
│   ├── entities/
│   │   ├── CharacterController.ts      # Player movement, AABB physics, collision
│   │   └── AnimationStateMachine.ts    # State-driven animation blending + combat
├── client/public/models/
│   ├── manifest.json                   # Asset registry — every model, anim, prop catalogued
│   ├── characters/                     # Toon_RTS, Racalvin, enemies, knight, basemesh
│   ├── animations/                     # FBX clips (Mixamo) organized by weapon type
│   ├── equipment/                      # Weapons, shields (FBX + GLB)
│   ├── environment/                    # GLB scene pieces (inn, town, castle parts)
│   ├── props/                          # Medieval GLBs + CraftPix FBX packs
│   └── textures/                       # TGA faction skins, PNG textures
├── server/src/
│   ├── GameServer.ts                   # WebSocket server, 20 tick/s game loop
│   └── world/                          # ChunkGenerator, WorldState
├── shared/src/
│   ├── types.ts                        # Network protocol, player state, enums
│   ├── constants.ts                    # Physics, chunk size, world params
│   ├── BlockRegistry.ts               # Voxel block types
│   └── CombatFormulas.ts              # Shared attribute system, damage calc, XP
└── PATTERNS.md                         # ← you are here
```

---

## 2. Manifest-Driven Asset Loading

**Pattern**: A single `manifest.json` describes every asset in the library — models,
animations, props, environments. The `AssetLoader` reads it once at startup, then loads
assets on demand by key. Nothing is hard-coded.

**Why**: Supports 694+ files (466MB) without loading them all upfront. New assets are
added to the manifest, and the loader picks them up automatically.

**Flow**:
```
manifest.json  ──→  AssetLoader.init()  ──→  loadToonCharacter('human')
                                              loadGLBAnimPack('sword-shield')
                                              loadEnemy('demon')
                                              loadEnvironment('town_map')
                                              loadProp('tower')
```

**Rules**:
- Every asset must be in `manifest.json` with file path, size, and format
- AssetLoader is a singleton (`assetLoader` export) — one instance for the whole app
- All loaded assets are cached in memory — subsequent calls return instantly
- Use `loadProfiles` in manifest for estimating download cost per scene

---

## 3. Animation State Machine

**Pattern**: A finite state machine evaluates input conditions each frame and
crossfades between animation states. Combat states (attack, dodge, block)
are "one-shot" and lock out transitions until they complete.

**States**: `IDLE → WALK → RUN → SPRINT → JUMP → FALL → LAND`
           `→ ATTACK_1 → ATTACK_2 → ATTACK_3 → COMBO_1`
           `→ DODGE → BLOCK → BLOCK_IDLE → PARRY`
           `→ CAST_1H → CAST_2H → SPELL`
           `→ HIT → DEATH`

**Config per state**:
- `clip`: animation clip name (resolved against active weapon pack)
- `loop`: repeat vs. play-once
- `blendIn`: crossfade duration in seconds
- `canInterrupt`: whether other states can override this one
- `returnTo`: auto-transition when one-shot finishes
- `speed`: playback speed multiplier
- `priority`: higher wins when multiple transitions are valid

**Weapon pack swapping**: Each weapon type (sword-shield, greatsword, axe, magic,
unarmed) maps to a GLB animation pack and overrides clip names for combat states.
Call `animSM.setWeapon('greatsword')` and all attacks/blocks use greatsword clips.

**Combo system**: Attacks chain 1→2→3→combo within an 800ms window. Timer resets
on each hit. After 3 hits, the next attack triggers a combo finisher.

---

## 4. Character Controller (Decoupled Physics)

**Pattern**: The `CharacterController` owns position/velocity/rotation and handles
movement + AABB collision. It takes a `BlockQuery` callback — a function that tests
if a world-space coordinate is solid — so it never touches chunk data directly.

**Why**: Keeps physics testable and decoupled from rendering. The same controller
can be reused for NPCs/AI by passing different block query functions.

**Data flow**:
```
KeyMap (input)
   ↓
CharacterController.update(dt, keys)
   ├─ movement direction from yaw + WASD
   ├─ gravity, jump velocity
   ├─ AABB collision (X, Z, Y axes independently)
   └─ returns ControllerState { position, velocity, onGround, moveSpeed, ... }
         ↓
   AnimationStateMachine.update(dt, animInput)
         ↓
   Camera follows position (in main.ts)
```

**Movement lock**: When `animStateMachine.isLocked` is true (during attacks, dodges),
the controller sets `movementLocked = true` and ignores WASD input. The player stays
planted during combat animations — souls-like feel.

---

## 5. Fallback-First Loading

**Pattern**: Always show something immediately, then async-load the real thing.

- Game starts with a **box-biped fallback** (10 box meshes, instant)
- Real character FBX/GLB loads in background via `AssetLoader`
- When ready, `attachCharacterModel()` swaps the boxes for the real model
- AnimationStateMachine initializes only after the model loads

**Why**: The player can move and explore within 1-2 seconds. Character model
(FBX + textures) takes 3-8 seconds depending on connection. No blank screen.

---

## 6. GLB Over FBX

**Pattern**: Prefer GLB format for all new assets. Use FBX only for legacy
Mixamo clips that haven't been converted yet.

**Why**: GLB files are 5-6x smaller than equivalent FBX. The Racalvin animations
exist in both formats — GLB versions are ~70KB each vs ~400KB FBX.

- Characters: GLB (enemies, knight, basemesh)
- Animations: GLB when available (`glbAnimations` in manifest), FBX fallback
- Environment: GLB only
- Props: GLB for medieval, FBX for CraftPix packs
- Equipment: mixed (legacy FBX weapons + new GLB Sword2)

---

## 7. Cache Everything

**Pattern**: Every loaded asset goes into a `Map<string, T>` cache keyed by
URL or manifest key. Second loads return the cached version instantly.

- `modelCache`: THREE.Group (character models, raw FBX/GLB)
- `clipCache`: THREE.AnimationClip (keyed as `packName/clipName`)
- `textureCache`: THREE.Texture
- `propCache`: THREE.Group (medieval props)
- `envCache`: THREE.Group (environment scenes)
- `gltfResultCache`: full GLTF result with animations

When spawning multiple instances (e.g., 5 slimes), the cache returns the
original and `cloneModel()` creates a cheap structural clone.

---

## 8. Authoritative Server

**Pattern**: Client predicts all movement and combat for responsiveness.
Server validates and is the source of truth for damage, zone capture, and
inventory changes.

**Current state (Phase 2)**: Client-only physics with server position sync
(10 updates/sec). Server sends chunk data and spawn positions.

**Target (Phase 3+)**: Server runs `CombatAuthority` — validates parry
windows, damage numbers, combo legitimacy. Client shows effects immediately,
server confirms or rejects within 100ms.

---

## 9. Input Conventions

| Key | Action |
|-----|--------|
| WASD | Move (relative to camera yaw) |
| Shift | Sprint |
| Space | Jump |
| LMB / F | Attack (rising-edge, chains combos) |
| E | Block (held) |
| Q | Dodge roll |
| R | Cast spell |
| Mouse | Camera orbit (pointer lock) |
| Scroll | Camera distance |

Rising-edge inputs (attack, dodge, cast) use frame-level boolean flags
that are set in `keydown`/`mousedown` handlers and cleared after each
`updatePhysics()` call. This prevents held keys from spamming attacks.

---

## 10. File Naming & Organization

- **TypeScript**: PascalCase for classes/files (`CharacterController.ts`),
  camelCase for instances and functions
- **Assets**: organized by category, not by source. Source info in manifest metadata.
  - `characters/{race}/` — character models + textures
  - `animations/{weapon-type}/` — FBX clips by weapon
  - `characters/racalvin/animations/{pack}/` — GLB clips by weapon
  - `equipment/{type}/` — weapons, shields
  - `environment/{location}/` — scene pieces
  - `props/{category}/` — vegetation, terrain, structures, medieval
- **Shared**: types and constants used by both client and server live in `shared/src/`
- **Enums**: defined in `shared/src/types.ts` (Faction, PlayerClass, Race, MessageType)

---

## 11. Build & Dev

```bash
# Start both client + server (from repo root)
npm run dev

# Client only (Vite, port 5173)
cd client && npm run dev

# Server only (WebSocket, port 3000)
cd server && npm run dev

# Build client for production
cd client && npm run build
```

**Known**: `tsc --noEmit` shows rootDir warnings because `shared/` is outside
`client/src`. This is a monorepo structure issue — Vite handles it correctly
via path aliases in `client/vite.config.ts`. The Vite build is the source of
truth for compilation.

---

## 12. Grudge ID Authentication

**Pattern**: Grudge Studio's identity layer wrapping Puter.js SSO.
The `grudgeAuth` singleton (`GrudgeAuth.ts`) manages the full auth flow.

**Auth methods** (in priority order):
1. **Grudge ID (Puter SSO)** — primary. Player profile persisted in `puter.kv`.
2. **Credentials** — direct login against Grudge API (`grudge-server-ambkk.puter.site`).
3. **Guest** — no persistence, random display name, zero latency.

**Boot flow**:
```
main.ts boot → grudgeAuth.trySilentAuth()
                 ├─ Puter session exists? → load profile from KV → start game
                 └─ No session? → show auth screen
                     ├─ "Sign in with Grudge ID" button → puter.auth.signIn()
                     ├─ Login / Register → GRUDGE_API /api/auth/*
                     └─ Guest → grudgeAuth.enterGuestMode()
```

**Profile persistence**: When signed in via Puter, the `GrudgeProfile` object
(displayName, playerClass, faction, level) is stored in `puter.kv` under the
key `grudge:profile`. Updated on login and on `grudgeAuth.updateProfile()`.

**Server handshake**: `grudgeAuth.getJoinPayload()` produces the JOIN message
data with grudgeId, token, authMethod, playerClass, faction, level.

---

## Next Up (Phase 3)

- [ ] Create `CombatSystem.ts` — orchestrator tying ParrySystem + StaminaSystem + CombatFormulas
- [ ] Wire combat into main.ts game loop
- [ ] Load weapon GLB animations per class on weapon equip
- [ ] Attach weapon models to character hand bones
- [ ] Implement dodge roll with i-frames
- [ ] Add hit detection (raycasting from weapon swing)
