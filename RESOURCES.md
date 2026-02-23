# Grudge Voxel Engine - Organized Resources & Reference

## Warp Agent
- **API Key**: `wk-1.54668c7b2ba65e88b16ed2f19fd5564f889cab3c6d74ed62c316c2d3f14e49a4`

## Quick Commands

### WSL Server Management
```bash
# Full deploy (sync + install deps + restart)
wsl bash -ic "bash ~/grudge-voxel/scripts/deploy-wsl.sh"

# Quick push (sync + restart only — fastest)
wsl bash -ic "bash ~/grudge-voxel/scripts/quick-push.sh"

# Check status
wsl bash -ic "bash ~/grudge-voxel/scripts/server-status.sh"

# Test lobby/WebSocket
wsl bash -ic "bash ~/grudge-voxel/scripts/lobby-test.sh"

# View live logs
wsl bash -ic "pm2 logs grudge-server"

# Or use Windows .bat files in scripts/
scripts\deploy.bat
scripts\push.bat
scripts\status.bat
scripts\test.bat
```

### Local Dev
```bash
cd D:\Games\grudge-voxel
npm run dev              # Start client (Vite :5173) + server (:3000)
npm run dev:client       # Client only
npm run dev:server       # Server only
```

---

## Project Architecture

```
grudge-voxel/
├── client/src/           # Three.js browser engine (Vite + TS)
│   ├── main.ts           # Entry: game loop, networking, chunk management
│   ├── engine/           # VoxelRenderer (greedy mesh + AO), ChunkMeshPool, MeshWorker
│   ├── entities/         # CharacterController (AABB physics), AnimationStateMachine (28 states)
│   ├── combat/           # CombatSystem, ParrySystem, StaminaSystem
│   ├── camera/           # ThirdPersonCamera (over-shoulder orbit, block collision)
│   ├── input/            # InputManager (WASD, combat keys, pointer lock)
│   ├── auth/             # GrudgeAuth (Puter SSO + credentials + guest)
│   └── assets/           # AssetLoader (manifest-driven, 694 files, lazy caching)
│
├── server/src/           # Node.js WebSocket server (20 tick/s)
│   ├── GameServer.ts     # Connection handling, game loop, chunk streaming
│   └── world/            # ChunkGenerator (simplex noise), WorldState
│
├── shared/src/           # Shared types/constants
│   ├── types.ts          # Network protocol, PlayerState, enums
│   ├── constants.ts      # Physics (gravity -24, jump 9), chunk 32x32x128
│   ├── BlockRegistry.ts  # 32 block types with properties
│   └── CombatFormulas.ts # 8 attributes, level 1-20, 8pts/level, diminishing returns
│
└── scripts/              # Deploy/test/status automation
```

---

## Scattered Resources to Consolidate

### Reusable Code (port to grudge-voxel)

| Source | Path | What | Priority |
|--------|------|------|----------|
| GRUDGE-RTS | `D:/GRUDGE-RTS/src/terrain/` | Terrain generation, island system, biome blending | HIGH |
| GRUDGE-RTS | `D:/GRUDGE-RTS/src/ai/` | AI faction behavior, pathfinding | HIGH |
| GRUDGE-RTS | `D:/GRUDGE-RTS/src/ik/` | Inverse kinematics for character animation | MEDIUM |
| GRUDGE-RTS | `D:/GRUDGE-RTS/src/physics/` | Rapier3D physics integration | MEDIUM |
| Models API | `D:/Games/Models/grudgeStudioAPI.js` | Unified API Service (Puter cloud, AI agents, v2.5.0) | HIGH |
| Models API | `D:/Games/Models/islandSystem.ts` | Island loot/node rarity with Puter KV | HIGH |
| Char Movement | `D:/Games/character-movement-theejs-main/` | Three.js character controller reference | LOW (already built) |
| Babylon t5c | `C:/Users/nugye/Documents/GitHub/t5c/` | Babylon.js + Colyseus multiplayer RPG reference | REFERENCE |
| Grudge Platform | `C:/Users/nugye/Documents/GitHub/grudge-platform/` | React + Express + PostgreSQL auth/backend | REFERENCE |

### 3D Asset Zips (feed into manifest system)

| Asset | Path | Type |
|-------|------|------|
| Angel Island | `D:/Games/angel_island.zip` | Island environment |
| Battle Ground | `D:/Games/battle_ground_03/` | Arena environment |
| PSX Characters | `D:/Games/characters_psx.zip` | Retro character models |
| Forest Cottage | `D:/Games/cozy_forest_cottage_stylized.zip` | Building prop |
| Wooden Cabin | `D:/Games/cozy_wooden_cabin.zip` | Building prop |
| Wild West Kit | `D:/Games/diorama_modular_wild_west_stylized_lowpoly.zip` | Modular building kit |
| UI Pack | `D:/Games/Complete_UI_Essential_Pack_Free.7z` | UI elements |
| Sci-fi Character | `D:/Games/desert_sci-fi_game_character.zip` | Character model |
| Crown | `D:/Games/Crown.zip` | Equipment prop |

### Previous Engine Attempts (reference only)

| Engine | Location | Notes |
|--------|----------|-------|
| Unity (9+ builds) | `AppData/LocalLow/*/GRUDGE*` | GRUDGE, FRESH GRUDGE, GenesisGrudge, Grudge Islands, GrudgeNations, GRUDGE MATCH |
| Babylon.js | `C:/Users/nugye/Documents/1111111/Babylon.js-master/` | Full engine source |
| Babylon.js WASM | `D:/Gamewithall/GRUDGE_WEB_ROOT/` | .NET WASM + Babylon hybrid |
| Hology Engine | `AppData/Roaming/Hology Engine/` | Alternative engine test |
| Unreal Engine | `AppData/Local/UnrealEngine/` | Was installed |
| Edelweiss Editor | `C:/Users/nugye/Documents/1111111/Edelweiss-Editor-master/` | Voxel/terrain editor |

### Large Archives to Review

| File | Path | Size | Notes |
|------|------|------|-------|
| Character Controller | `C:/Users/nugye/Documents/1111111/Charcter-controller.zip` | 9.3 GB | Massive — likely full character rigging/animation pack |
| Grudge Builder | `C:/Users/nugye/Documents/1111111/Grudge-Builder/` | 7.9 GB | Character builder tool |
| GrudaLauncher | `C:/Users/nugye/Documents/1111111/GrudaLauncher.zip` | 1.2 GB | Game launcher |
| 3D Viewer | `C:/Users/nugye/Documents/1111111/3dViewer.zip` | 81 MB | Model viewer |
| GrudgeStudio.exe | `D:/Games/GrudgeStudios/GrudgeStudio.exe` | 105 MB | Compiled standalone |

---

## Tech Stack Reference

### Core Dependencies
- **Three.js** 0.171.0 — 3D rendering
- **WebSocket (ws)** 8.18.0 — multiplayer networking
- **Vite** 6.1.0 — client bundling + HMR
- **tsx** — TypeScript execution for server
- **PM2** — process management

### Game Constants
- Chunk: 32×32×128 (131KB per chunk)
- Render distance: 12 chunks
- Physics: 60Hz fixed step, gravity -24, jump velocity 9
- Player: 0.6 wide, 1.8 tall, eye at 1.62
- Movement: 5.5 blocks/s (sprint 1.6×), acceleration 30 blocks/s²
- Tick rate: 20Hz server, 60Hz client physics
- Sea level: Y=42

### Combat System
- 8 attributes: STR, INT, VIT, DEX, END, WIS, AGI, TAC
- Level 1-20, 8 points per level (160 total)
- Diminishing returns after 50 points
- 4 classes: Warrior (stamina), Mage (mana), Ranger (focus), Worge (primal)
- Parry windows: perfect 0-200ms, normal 200-800ms
- Combo chain: attack1 → attack2 → attack3 within 800ms window

### Deployment
- **Vercel**: Client SPA (client/dist → vercel.json)
- **WSL PM2**: Game server (port 3000)
- **GitHub**: `MolochDaGod/grudge-warlords`
- **Cloudflare Tunnel**: Optional external access

---

## WSL Server Info
- **Distro**: Ubuntu 22.04.5 LTS (WSL2)
- **Node**: v22.22.0 (via nvm)
- **PM2**: 6.0.14
- **Project**: ~/grudge-voxel (cloned from GitHub)
- **Resources**: 8 cores, 15GB RAM, 952GB disk free
- **Hostname**: GrudgeYonko

---

## Phase Roadmap

### Phase 1 ✅ (Complete)
- Voxel rendering with greedy mesh + AO
- Character controller with AABB collision
- Animation state machine (28 states, weapon packs)
- Combat framework (stamina, parry, block)
- Asset loading (manifest-driven, FBX + GLB)
- Auth (Puter SSO, credentials, guest)
- WebSocket networking + chunk streaming

### Phase 2 (In Progress)
- [ ] Multiplayer avatar rendering
- [ ] Player-to-player position sync
- [ ] Block break/place authority
- [ ] Equipment attachment to bones

### Phase 3 (Next)
- [ ] Hit detection (weapon raycasting)
- [ ] Server combat validation
- [ ] Damage exchange over network
- [ ] Dodge i-frames
- [ ] Knockback/stagger

### Phase 4 (Later)
- [ ] Inventory + equipment persistence
- [ ] Skill trees + passive talents
- [ ] Dungeons + bosses + zones
- [ ] PvP zones + faction warfare
- [ ] Sound + music
- [ ] World persistence (database)
