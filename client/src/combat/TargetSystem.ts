// ═══════════════════════════════════════════════════════════════════
// TARGET SELECTION SYSTEM
//
// WoW-style Tab targeting. Tab cycles through nearby entities sorted
// by distance. The selected target gets a billboard nameplate with
// HP bar rendered above its head in world-space.
//
// USAGE:
//   targetSystem.update(playerPos, tabPressed, camera)
//   targetSystem.selected  // current target Entity or null
//
// Billboard nameplates use a CSS2DRenderer overlay so they scale
// cleanly and don't require sprite atlas work.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import type { Entity } from '../entities/EntityManager.js';
import type { EntityManager } from '../entities/EntityManager.js';

// ── Nameplate (HTML billboard) ────────────────────────────────────

interface Nameplate {
  root: HTMLDivElement;
  nameEl: HTMLDivElement;
  hpBar: HTMLDivElement;
  hpFill: HTMLDivElement;
  levelEl: HTMLDivElement;
}

function createNameplate(): Nameplate {
  const root = document.createElement('div');
  root.className = 'nameplate';
  root.style.cssText = `
    position: absolute; pointer-events: none;
    display: flex; flex-direction: column; align-items: center;
    transform: translate(-50%, -100%); white-space: nowrap;
    font-family: 'Segoe UI', sans-serif; text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  `;

  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display: flex; align-items: center; gap: 4px; margin-bottom: 2px;';

  const levelEl = document.createElement('div');
  levelEl.style.cssText = 'font-size: 10px; color: #d4a843; font-weight: bold;';
  levelEl.textContent = '1';

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size: 12px; color: #fff; font-weight: 600;';
  nameEl.textContent = 'Entity';

  nameRow.appendChild(levelEl);
  nameRow.appendChild(nameEl);

  const hpBar = document.createElement('div');
  hpBar.style.cssText = `
    width: 80px; height: 6px; background: rgba(0,0,0,0.6);
    border: 1px solid rgba(255,255,255,0.15); border-radius: 3px;
    overflow: hidden;
  `;

  const hpFill = document.createElement('div');
  hpFill.style.cssText = 'width: 100%; height: 100%; background: #22c55e; transition: width 0.15s;';

  hpBar.appendChild(hpFill);
  root.appendChild(nameRow);
  root.appendChild(hpBar);

  return { root, nameEl, hpBar, hpFill, levelEl };
}

// ── Target System ─────────────────────────────────────────────────

export class TargetSystem {
  private entityManager: EntityManager;

  /** Currently selected target */
  private _selected: Entity | null = null;

  /** Index into the last-computed nearby list (for Tab cycling) */
  private cycleIndex = -1;

  /** Maximum range for Tab targeting (world units) */
  readonly maxRange = 30;

  // Nameplate rendering
  private nameplateContainer: HTMLDivElement;
  private selectedPlate: Nameplate;
  private hoverPlates = new Map<string, Nameplate>();

  // Reusable vectors
  private _screenPos = new THREE.Vector3();

  constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;

    // Create nameplate overlay container
    this.nameplateContainer = document.createElement('div');
    this.nameplateContainer.id = 'nameplates';
    this.nameplateContainer.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 10; overflow: hidden;
    `;
    document.body.appendChild(this.nameplateContainer);

    // Create the selected-target nameplate (always exists, hidden when no target)
    this.selectedPlate = createNameplate();
    this.selectedPlate.root.style.display = 'none';
    // Highlight selected target plate
    this.selectedPlate.hpBar.style.border = '1px solid #d4a843';
    this.selectedPlate.hpBar.style.width = '100px';
    this.selectedPlate.hpBar.style.height = '8px';
    this.selectedPlate.nameEl.style.fontSize = '13px';
    this.nameplateContainer.appendChild(this.selectedPlate.root);
  }

  /** Currently selected entity (or null) */
  get selected(): Entity | null { return this._selected; }

  /** Selected entity ID (or empty string) */
  get selectedId(): string { return this._selected?.id ?? ''; }

  // ── Update (call every frame) ───────────────────────────────

  update(
    playerPos: THREE.Vector3,
    tabPressed: boolean,
    camera: THREE.Camera,
    screenWidth: number,
    screenHeight: number,
  ): void {
    // Tab: cycle to next target
    if (tabPressed) {
      this.cycleTarget(playerPos);
    }

    // Validate current selection (despawned? too far? dead?)
    if (this._selected) {
      const stillExists = this.entityManager.get(this._selected.id);
      if (!stillExists || this._selected.distanceTo(playerPos) > this.maxRange * 1.5) {
        this.deselect();
      }
    }

    // Update selected nameplate
    if (this._selected) {
      this.updateNameplate(
        this.selectedPlate, this._selected, camera, screenWidth, screenHeight,
      );
      this.selectedPlate.root.style.display = '';
    } else {
      this.selectedPlate.root.style.display = 'none';
    }

    // Update hover nameplates for all nearby visible entities
    this.updateHoverPlates(playerPos, camera, screenWidth, screenHeight);
  }

  // ── Tab Cycling ─────────────────────────────────────────────

  private cycleTarget(playerPos: THREE.Vector3): void {
    const nearby = this.entityManager.getNearby(playerPos, this.maxRange)
      .filter(e => !e.isDead);

    if (nearby.length === 0) {
      this.deselect();
      return;
    }

    this.cycleIndex = (this.cycleIndex + 1) % nearby.length;
    this._selected = nearby[this.cycleIndex];
  }

  /** Deselect the current target */
  deselect(): void {
    this._selected = null;
    this.cycleIndex = -1;
    this.selectedPlate.root.style.display = 'none';
  }

  /** Select a specific entity by ID */
  select(entityId: string): void {
    const entity = this.entityManager.get(entityId);
    if (entity) {
      this._selected = entity;
      this.cycleIndex = -1; // Reset cycle since we manually selected
    }
  }

  // ── Nameplate Rendering ─────────────────────────────────────

  private updateNameplate(
    plate: Nameplate,
    entity: Entity,
    camera: THREE.Camera,
    sw: number,
    sh: number,
  ): void {
    // Project entity world position to screen
    this._screenPos.copy(entity.position);
    this._screenPos.y += 2.2; // Above head
    this._screenPos.project(camera);

    // Behind camera check
    if (this._screenPos.z > 1) {
      plate.root.style.display = 'none';
      return;
    }
    plate.root.style.display = '';

    const x = (this._screenPos.x * 0.5 + 0.5) * sw;
    const y = (-this._screenPos.y * 0.5 + 0.5) * sh;

    plate.root.style.left = `${x}px`;
    plate.root.style.top = `${y}px`;

    // Update content
    plate.nameEl.textContent = entity.name;
    plate.levelEl.textContent = `${entity.level}`;

    const hpPct = entity.maxHealth > 0
      ? Math.max(0, Math.min(100, (entity.health / entity.maxHealth) * 100))
      : 0;
    plate.hpFill.style.width = `${hpPct}%`;

    // Color HP bar by percentage
    if (hpPct > 60) plate.hpFill.style.background = '#22c55e';
    else if (hpPct > 30) plate.hpFill.style.background = '#eab308';
    else plate.hpFill.style.background = '#ef4444';

    // Faction color on name
    const factionColors: Record<string, string> = {
      CRUSADE: '#4a9eff', FABLED: '#a855f7', LEGION: '#ef4444',
      PIRATES: '#f97316', NEUTRAL: '#ffffff',
    };
    plate.nameEl.style.color = factionColors[entity.faction] ?? '#ffffff';
  }

  private updateHoverPlates(
    playerPos: THREE.Vector3,
    camera: THREE.Camera,
    sw: number,
    sh: number,
  ): void {
    const nearby = this.entityManager.getNearby(playerPos, this.maxRange);
    const activeIds = new Set<string>();

    for (const entity of nearby) {
      // Skip selected (has its own plate)
      if (entity === this._selected) continue;
      if (!entity.visible) continue;

      activeIds.add(entity.id);

      let plate = this.hoverPlates.get(entity.id);
      if (!plate) {
        plate = createNameplate();
        // Hover plates are smaller/dimmer
        plate.root.style.opacity = '0.7';
        plate.nameEl.style.fontSize = '11px';
        plate.hpBar.style.width = '60px';
        plate.hpBar.style.height = '4px';
        this.nameplateContainer.appendChild(plate.root);
        this.hoverPlates.set(entity.id, plate);
      }

      this.updateNameplate(plate, entity, camera, sw, sh);
    }

    // Remove plates for entities no longer nearby
    for (const [id, plate] of this.hoverPlates) {
      if (!activeIds.has(id)) {
        plate.root.remove();
        this.hoverPlates.delete(id);
      }
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────

  dispose(): void {
    this.nameplateContainer.remove();
    this.hoverPlates.clear();
  }

  // ── Debug ───────────────────────────────────────────────────

  getDebugInfo(): string {
    if (!this._selected) return 'Target: none';
    return `Target: ${this._selected.name} HP:${Math.floor(this._selected.health)}/${this._selected.maxHealth}`;
  }
}
