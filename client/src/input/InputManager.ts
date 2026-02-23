// ═══════════════════════════════════════════════════════════════════
// INPUT MANAGER — Singleton
// Centralizes all keyboard, mouse, and pointer input. Other systems
// read state via clean getters instead of raw event listeners.
//
// PATTERN: Call endFrame() at the end of each game loop iteration
// to reset per-frame rising-edge triggers.
// ═══════════════════════════════════════════════════════════════════

/** Movement intent from keyboard input */
export interface MovementInput {
  forward: boolean;
  back: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  strafeLeft: boolean;
  strafeRight: boolean;
  sprint: boolean;
  jump: boolean;
  /** Admin fly: ascend (Space) */
  ascend?: boolean;
  /** Admin fly: descend (Ctrl) */
  descend?: boolean;
}

/** Combat triggers (true only on the frame the key was first pressed) */
export interface CombatInput {
  attackPressed: boolean;
  blockHeld: boolean;
  dodgePressed: boolean;
  castPressed: boolean;
}

class InputManager {
  // ── Key state ──────────────────────────────────────────────
  private keys = new Map<string, boolean>();

  // ── Rising-edge combat triggers (reset each frame) ─────────
  private _attackPressed = false;
  private _dodgePressed = false;
  private _castPressed = false;
  private _tabPressed = false;
  private _jumpPressed = false;

// ── UI triggers (reset each frame) ──────────────────────────
  private _escapePressed = false;
  private _iPressed = false;
  private _enterPressed = false;
  private _adminTogglePressed = false;

  /** When true, movement and combat input return zeros (UI is blocking) */
  uiBlocked = false;

  // ── Mouse state ────────────────────────────────────────────
  /** Accumulated mouse delta since last read (pixels) */
  mouseDeltaX = 0;
  mouseDeltaY = 0;

  /** Accumulated scroll wheel delta since last read */
  wheelDelta = 0;

  /** Is the left mouse button currently held? (free-look mode) */
  isFreeLooking = false;

  /** Is the right mouse button held? */
  isRightMouseDown = false;

  // ── Pointer lock state ─────────────────────────────────────
  private canvas: HTMLElement | null = null;

  // ── Lifecycle ──────────────────────────────────────────────

  /** Attach all event listeners. Call once after canvas is ready. */
  attach(canvas: HTMLElement): void {
    this.canvas = canvas;

    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Remove all event listeners */
  detach(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('wheel', this.onWheel);
  }

  // ── Getters ────────────────────────────────────────────────

  /** Current movement intent from WASD / QE / Shift / Space */
getMovement(): MovementInput {
    if (this.uiBlocked) return { forward: false, back: false, turnLeft: false, turnRight: false, strafeLeft: false, strafeRight: false, sprint: false, jump: false };
    return {
      forward: this.held('KeyW'),
      back: this.held('KeyS'),
      turnLeft: this.held('KeyA'),
      turnRight: this.held('KeyD'),
      strafeLeft: this.held('KeyQ'),
      strafeRight: this.held('KeyE'),
      sprint: this.held('ShiftLeft') || this.held('ShiftRight'),
      jump: this._jumpPressed,
      ascend: this.held('Space'),
      descend: this.held('ControlLeft') || this.held('ControlRight'),
    };
  }

  /** Combat triggers for this frame */
  getCombat(): CombatInput {
    if (this.uiBlocked) return { attackPressed: false, blockHeld: false, dodgePressed: false, castPressed: false };
    return {
      attackPressed: this._attackPressed,
      blockHeld: this.isRightMouseDown,
      dodgePressed: this._dodgePressed,
      castPressed: this._castPressed,
    };
  }

  /** Was Tab pressed this frame? (target cycling) */
  get tabPressed(): boolean { return this.uiBlocked ? false : this._tabPressed; }

  /** UI triggers (read once per frame) */
  get escapePressed(): boolean { return this._escapePressed; }
  get iPressed(): boolean { return this._iPressed; }
get enterPressed(): boolean { return this._enterPressed; }
  /** Toggle admin fly mode (Backslash) */
  get adminTogglePressed(): boolean { return this._adminTogglePressed; }

  /** Is a specific key currently held? */
  held(code: string): boolean {
    return this.keys.get(code) ?? false;
  }

  /** Consume accumulated mouse delta and reset it */
  consumeMouseDelta(): { dx: number; dy: number } {
    const dx = this.mouseDeltaX;
    const dy = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return { dx, dy };
  }

  /** Consume accumulated wheel delta and reset it */
  consumeWheelDelta(): number {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
  }

  // ── Frame lifecycle ────────────────────────────────────────

  /** Call at the END of each frame to reset rising-edge triggers */
endFrame(): void {
    this._attackPressed = false;
    this._dodgePressed = false;
    this._castPressed = false;
    this._tabPressed = false;
    this._jumpPressed = false;
    this._escapePressed = false;
    this._iPressed = false;
    this._enterPressed = false;
    this._adminTogglePressed = false;
  }

  // ── Event handlers (arrow functions for stable `this`) ─────

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.set(e.code, true);

    // Rising-edge triggers
    if (e.code === 'KeyF' || e.code === 'Numpad0') this._attackPressed = true;
    if (e.code === 'KeyR') this._castPressed = true;
    if (e.code === 'KeyX') this._dodgePressed = true;
    if (e.code === 'Tab') { this._tabPressed = true; e.preventDefault(); }
    if (e.code === 'Space') this._jumpPressed = true;
    if (e.code === 'Escape') { this._escapePressed = true; e.preventDefault(); }
    if (e.code === 'KeyI') this._iPressed = true;
if (e.code === 'Enter') this._enterPressed = true;
    if (e.code === 'Backslash') this._adminTogglePressed = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.set(e.code, false);
  };

private onMouseMove = (e: MouseEvent): void => {
    // Only accumulate mouse delta when in free-look or pointer-locked and UI is not blocking
    if (!this.uiBlocked && (this.isFreeLooking || document.pointerLockElement)) {
      this.mouseDeltaX += e.movementX;
      this.mouseDeltaY += e.movementY;
    }
  };

private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      const onCanvas = (this.canvas && e.target === this.canvas);
      if (!this.uiBlocked && onCanvas) {
        this.isFreeLooking = true;
        // Also trigger attack if pointer is locked (action mode)
        if (document.pointerLockElement) {
          this._attackPressed = true;
        }
        // Request pointer lock only when clicking the canvas
        if (!document.pointerLockElement) {
          this.canvas!.requestPointerLock();
        }
      }
    }
    if (e.button === 2) {
      this.isRightMouseDown = true;
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.isFreeLooking = false;
    }
    if (e.button === 2) {
      this.isRightMouseDown = false;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    this.wheelDelta += e.deltaY;
  };
}

// Export singleton
export const inputManager = new InputManager();
