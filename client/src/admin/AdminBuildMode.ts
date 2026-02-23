// ═══════════════════════════════════════════════════════════════════
// ADMIN BUILD MODE
//
// Provides in-world editing gizmos based on Three.js TransformControls
// and DragControls examples. Activated alongside the admin fly mode
// (backslash key toggle).
//
// Keys (when active):
//   1 = Translate mode   2 = Rotate mode   3 = Scale mode
//   Shift = Snap to grid (1 block for translate, 15° for rotate)
//   Click = Select block/entity via raycast
//   Delete = Remove selected object
//   Q = Toggle world/local space
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { GetBlockFn } from '@grudge/shared';

// ── Types ───────────────────────────────────────────────────────

export interface BuildModeConfig {
  scene: THREE.Scene;
  camera: THREE.Camera;
  domElement: HTMLElement;
  getBlock: GetBlockFn;
}

// ── Admin Build Mode ────────────────────────────────────────────

export class AdminBuildMode {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private domElement: HTMLElement;
  private getBlock: GetBlockFn;

  // TransformControls gizmo
  private control: TransformControls;
  private gizmoHelper: THREE.Object3D;

  // State
  private _active = false;
  private selected: THREE.Object3D | null = null;

  // Raycaster for block/entity selection
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // Block highlight (wireframe cube showing selected block)
  private blockHighlight: THREE.LineSegments;

  // Placed edit objects (admin-placed markers/props)
  private editObjects: THREE.Mesh[] = [];

  // Key state for snap
  private shiftHeld = false;

  // Bound event handlers (for cleanup)
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onKeyUp: (e: KeyboardEvent) => void;
  private _onClick: (e: MouseEvent) => void;

  constructor(config: BuildModeConfig) {
    this.scene = config.scene;
    this.camera = config.camera;
    this.domElement = config.domElement;
    this.getBlock = config.getBlock;

    // ── TransformControls setup ───────────────────────────
    this.control = new TransformControls(this.camera, this.domElement);
    this.control.setSize(0.8);
    this.control.visible = false;
    this.control.enabled = false;

    this.gizmoHelper = this.control.getHelper();
    this.scene.add(this.gizmoHelper);

    // ── Block highlight wireframe ─────────────────────────
    const hlGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    const hlEdges = new THREE.EdgesGeometry(hlGeo);
    this.blockHighlight = new THREE.LineSegments(
      hlEdges,
      new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 }),
    );
    this.blockHighlight.visible = false;
    this.scene.add(this.blockHighlight);

    // ── Event handlers ────────────────────────────────────
    this._onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    this._onKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);
    this._onClick = (e: MouseEvent) => this.handleClick(e);

    // TransformControls fires 'dragging-changed' to prevent camera conflicts
    this.control.addEventListener('dragging-changed', (event: any) => {
      // Dispatch custom event so camera system knows to pause
      this.domElement.dispatchEvent(new CustomEvent('admin-drag', { detail: event.value }));
    });
  }

  // ── Activation ──────────────────────────────────────────────

  get active(): boolean { return this._active; }

  activate(): void {
    if (this._active) return;
    this._active = true;
    this.control.visible = true;
    this.control.enabled = true;

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    this.domElement.addEventListener('click', this._onClick);

    console.log('[AdminBuild] Build mode ON — 1=move 2=rotate 3=scale Shift=snap');
  }

  deactivate(): void {
    if (!this._active) return;
    this._active = false;
    this.control.visible = false;
    this.control.enabled = false;
    this.blockHighlight.visible = false;
    this.detachGizmo();

    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    this.domElement.removeEventListener('click', this._onClick);

    console.log('[AdminBuild] Build mode OFF');
  }

  toggle(): void {
    if (this._active) this.deactivate();
    else this.activate();
  }

  // ── Key Handling ────────────────────────────────────────────

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this._active) return;

    switch (e.code) {
      case 'Digit1': this.control.setMode('translate'); break;
      case 'Digit2': this.control.setMode('rotate'); break;
      case 'Digit3': this.control.setMode('scale'); break;
      case 'KeyQ':
        this.control.setSpace(this.control.space === 'local' ? 'world' : 'local');
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.shiftHeld = true;
        this.control.setTranslationSnap(1);
        this.control.setRotationSnap(THREE.MathUtils.degToRad(15));
        this.control.setScaleSnap(0.25);
        break;
      case 'Delete':
      case 'Backspace':
        this.deleteSelected();
        break;
      case 'KeyP':
        // Place a marker block at current highlight
        this.placeMarker();
        break;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.shiftHeld = false;
      this.control.setTranslationSnap(null);
      this.control.setRotationSnap(null);
      this.control.setScaleSnap(null);
    }
  }

  // ── Click / Raycast ─────────────────────────────────────────

  private handleClick(e: MouseEvent): void {
    if (!this._active) return;
    // Don't interfere with gizmo drags
    if (this.control.dragging) return;

    // Compute NDC mouse position
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // First: check edit objects
    const editHits = this.raycaster.intersectObjects(this.editObjects, false);
    if (editHits.length > 0) {
      this.selectObject(editHits[0].object as THREE.Mesh);
      return;
    }

    // Second: find the block the ray points at (DDA approach for highlight)
    const origin = this.raycaster.ray.origin;
    const dir = this.raycaster.ray.direction;
    this.highlightBlock(origin, dir);
  }

  // ── Block Highlight (voxel raycast) ─────────────────────────

  private highlightBlock(origin: THREE.Vector3, dir: THREE.Vector3): void {
    // Simple stepping through voxels to find first solid block
    const maxDist = 50;
    const step = 0.1;

    for (let t = 0; t < maxDist; t += step) {
      const x = Math.floor(origin.x + dir.x * t);
      const y = Math.floor(origin.y + dir.y * t);
      const z = Math.floor(origin.z + dir.z * t);

      const blockId = this.getBlock(x, y, z);
      if (blockId > 0 && blockId !== 5 && blockId !== 17) {
        this.blockHighlight.position.set(x + 0.5, y + 0.5, z + 0.5);
        this.blockHighlight.visible = true;
        return;
      }
    }

    this.blockHighlight.visible = false;
  }

  // ── Selection ───────────────────────────────────────────────

  private selectObject(obj: THREE.Mesh): void {
    this.selected = obj;
    this.control.attach(obj);
  }

  private detachGizmo(): void {
    this.control.detach();
    this.selected = null;
  }

  // ── Place / Delete ──────────────────────────────────────────

  private placeMarker(): void {
    if (!this.blockHighlight.visible) return;

    const pos = this.blockHighlight.position.clone();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.6,
    });
    const marker = new THREE.Mesh(geo, mat);
    marker.position.copy(pos);
    marker.castShadow = true;

    this.scene.add(marker);
    this.editObjects.push(marker);
    this.selectObject(marker);

    console.log(`[AdminBuild] Placed marker at ${pos.x}, ${pos.y}, ${pos.z}`);
  }

  private deleteSelected(): void {
    if (!this.selected) return;

    const idx = this.editObjects.indexOf(this.selected as THREE.Mesh);
    if (idx >= 0) {
      this.scene.remove(this.selected);
      (this.selected as THREE.Mesh).geometry.dispose();
      ((this.selected as THREE.Mesh).material as THREE.Material).dispose();
      this.editObjects.splice(idx, 1);
    }

    this.detachGizmo();
    console.log('[AdminBuild] Deleted selected object');
  }

  // ── Query ───────────────────────────────────────────────────

  getDebugInfo(): string {
    return this._active
      ? `Build: ${this.control.mode} | ${this.editObjects.length} objects`
      : '';
  }
}
