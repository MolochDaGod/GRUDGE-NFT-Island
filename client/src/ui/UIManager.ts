// ═══════════════════════════════════════════════════════════════════
// UI MANAGER — Screen State Coordinator
//
// Manages a stack of UI screens (main menu, character create, escape
// menu, settings, inventory). Exposes `isMenuOpen` so InputManager
// can suppress game input when any modal screen is active.
//
// KEY ROUTING:
//   Escape → close top screen, or open EscapeMenu if in-game
//   I      → toggle InventoryUI
//   Enter  → toggle ChatUI input focus
// ═══════════════════════════════════════════════════════════════════

// ── UIScreen Interface ────────────────────────────────────────────

export interface UIScreen {
  /** Unique screen ID */
  readonly id: string;
  /** Does this screen block game input? (most do, chat doesn't) */
  readonly modal: boolean;
  /** Show the screen (add DOM elements) */
  show(): void;
  /** Hide the screen (remove DOM elements) */
  hide(): void;
  /** Clean up completely (called when screen is destroyed) */
  destroy(): void;
}

// ── Screen IDs ────────────────────────────────────────────────────

export const SCREEN = {
  MAIN_MENU:        'main-menu',
  CHARACTER_CREATE: 'character-create',
  ESCAPE_MENU:      'escape-menu',
  SETTINGS:         'settings',
  INVENTORY:        'inventory',
  CURIOS:           'curios',
  CHAT:             'chat',
} as const;

// ── UIManager ─────────────────────────────────────────────────────

export class UIManager {
  private screens = new Map<string, UIScreen>();
  private stack: string[] = [];

  /** Is the game in "playing" state (past main menu)? */
  inGame = false;

  // ── Registration ──────────────────────────────────────────

  register(screen: UIScreen): void {
    this.screens.set(screen.id, screen);
  }

  unregister(id: string): void {
    this.close(id);
    this.screens.delete(id);
  }

  // ── Open / Close ──────────────────────────────────────────

  open(id: string): void {
    if (this.stack.includes(id)) return; // Already open
    const screen = this.screens.get(id);
    if (!screen) return;

    this.stack.push(id);
    screen.show();

    // Release pointer lock for modal screens
    if (screen.modal && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  close(id: string): void {
    const idx = this.stack.indexOf(id);
    if (idx === -1) return;

    const screen = this.screens.get(id);
    screen?.hide();
    this.stack.splice(idx, 1);
  }

  toggle(id: string): void {
    if (this.isOpen(id)) {
      this.close(id);
    } else {
      this.open(id);
    }
  }

  /** Close the topmost screen on the stack */
  closeTop(): boolean {
    if (this.stack.length === 0) return false;
    const topId = this.stack[this.stack.length - 1];

    // Don't close main menu or character create with Escape
    if (topId === SCREEN.MAIN_MENU || topId === SCREEN.CHARACTER_CREATE) return false;

    this.close(topId);
    return true;
  }

  closeAll(): void {
    for (const id of [...this.stack]) {
      this.close(id);
    }
  }

  // ── Query ─────────────────────────────────────────────────

  isOpen(id: string): boolean {
    return this.stack.includes(id);
  }

  /** Is any modal screen currently open? (blocks game input) */
  get isMenuOpen(): boolean {
    for (const id of this.stack) {
      const screen = this.screens.get(id);
      if (screen?.modal) return true;
    }
    return false;
  }

  /** Is chat input focused? (blocks keyboard but not mouse) */
  get isChatFocused(): boolean {
    return this.isOpen(SCREEN.CHAT) && this.screens.get(SCREEN.CHAT)?.modal === false;
  }

  get topScreen(): string | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  // ── Key Routing (called from main.ts per-frame) ───────────

  /**
   * Handle UI key presses. Returns true if the key was consumed.
   */
  handleKey(code: string): boolean {
    if (code === 'Escape') {
      // If any screen is open, close the top one
      if (this.stack.length > 0) {
        return this.closeTop();
      }
      // If in-game and nothing is open, open escape menu
      if (this.inGame) {
        this.open(SCREEN.ESCAPE_MENU);
        return true;
      }
      return false;
    }

    if (code === 'KeyI' && this.inGame) {
      // Don't toggle inventory if another modal is open (except inventory itself)
      if (this.isMenuOpen && !this.isOpen(SCREEN.INVENTORY)) return false;
      this.toggle(SCREEN.INVENTORY);
      return true;
    }

    if (code === 'KeyK' && this.inGame) {
      if (this.isMenuOpen && !this.isOpen(SCREEN.CURIOS)) return false;
      this.toggle(SCREEN.CURIOS);
      return true;
    }

    return false;
  }
}
