// ═══════════════════════════════════════════════════════════════════
// MAIN MENU — Post-auth title screen
//
// Shown after auth and before entering the game world. The Three.js
// scene continues rendering behind a semi-transparent dark overlay.
//
// Buttons: Play (enter world), Character, Settings, Logout
// ═══════════════════════════════════════════════════════════════════

import { SCREEN, type UIScreen } from './UIManager.js';

// ── CSS ───────────────────────────────────────────────────────────

const CSS = `
#main-menu {
  position: absolute; inset: 0; z-index: 90;
  background: linear-gradient(135deg, rgba(10,10,26,0.92) 0%, rgba(26,10,46,0.88) 50%, rgba(10,26,30,0.92) 100%);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: 'Segoe UI', sans-serif; color: #fff;
  transition: opacity 0.4s;
}
#main-menu.fade-out { opacity: 0; pointer-events: none; }

.mm-studio { color: #666; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 4px; }
.mm-title { font-size: 48px; font-weight: 800; color: #d4a843; text-shadow: 0 2px 20px rgba(212,168,67,0.3); margin-bottom: 2px; }
.mm-subtitle { color: #888; font-size: 14px; margin-bottom: 8px; letter-spacing: 1px; }
.mm-version { color: #555; font-size: 11px; margin-bottom: 32px; }

.mm-player-badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(212,168,67,0.1); border: 1px solid rgba(212,168,67,0.25);
  border-radius: 24px; padding: 8px 20px; margin-bottom: 32px;
  font-size: 14px; color: #d4a843;
}
.mm-player-badge .dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; }

.mm-buttons { display: flex; flex-direction: column; gap: 10px; width: 280px; }

.mm-btn {
  padding: 14px 24px; border-radius: 10px; border: none;
  font-size: 15px; font-weight: 600; cursor: pointer;
  transition: all 0.15s; letter-spacing: 0.5px; text-align: center;
}
.mm-btn:hover { transform: translateY(-1px); }
.mm-btn:active { transform: translateY(0); }

.mm-btn-play {
  background: linear-gradient(135deg, #d4a843 0%, #b8922e 100%);
  color: #000; font-size: 17px;
}
.mm-btn-play:hover { background: linear-gradient(135deg, #e4b853 0%, #d4a843 100%); box-shadow: 0 4px 20px rgba(212,168,67,0.3); }

.mm-btn-secondary {
  background: rgba(255,255,255,0.06); color: #ccc;
  border: 1px solid rgba(255,255,255,0.12);
}
.mm-btn-secondary:hover { background: rgba(255,255,255,0.1); color: #fff; }

.mm-btn-logout {
  background: none; color: #666; font-size: 13px;
  margin-top: 8px;
}
.mm-btn-logout:hover { color: #ef4444; }

.mm-footer {
  position: absolute; bottom: 16px;
  font-size: 11px; color: #444; letter-spacing: 1px;
}
`;

// ── MainMenu ──────────────────────────────────────────────────────

export interface MainMenuCallbacks {
  onPlay: () => void;
  onBattleground: () => void;
  onCharacter: () => void;
  onSettings: () => void;
  onLogout: () => void;
}

export class MainMenu implements UIScreen {
  readonly id = SCREEN.MAIN_MENU;
  readonly modal = true;

  private root: HTMLDivElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private callbacks: MainMenuCallbacks;
  private playerName: string;
  private playerClass: string;
  private playerLevel: number;

  constructor(callbacks: MainMenuCallbacks, playerName = 'Guest', playerClass = '', playerLevel = 1) {
    this.callbacks = callbacks;
    this.playerName = playerName;
    this.playerClass = playerClass;
    this.playerLevel = playerLevel;
  }

  /** Update player info (after character creation) */
  updatePlayer(name: string, playerClass: string, level: number): void {
    this.playerName = name;
    this.playerClass = playerClass;
    this.playerLevel = level;
    // Update badge if visible
    const badge = this.root?.querySelector('.mm-player-badge');
    if (badge) {
      const classStr = this.playerClass ? ` — ${this.playerClass}` : '';
      badge.innerHTML = `<span class="dot"></span>${this.playerName}${classStr} Lv.${this.playerLevel}`;
    }
  }

  show(): void {
    if (this.root) return;

    // Inject styles
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);

    // Build DOM
    this.root = document.createElement('div');
    this.root.id = 'main-menu';

    const classStr = this.playerClass ? ` — ${this.playerClass}` : '';

    this.root.innerHTML = `
      <div class="mm-studio">Grudge Studio</div>
      <div class="mm-title">GRUDGE WARLORDS</div>
      <div class="mm-subtitle">Souls-Like Voxel RPG</div>
      <div class="mm-version">v0.1 Alpha</div>
      <div class="mm-player-badge"><span class="dot"></span>${this.playerName}${classStr} Lv.${this.playerLevel}</div>
      <div class="mm-buttons">
        <button class="mm-btn mm-btn-play" data-action="play">Enter World</button>
        <button class="mm-btn mm-btn-secondary" data-action="battleground" style="background:linear-gradient(135deg,rgba(200,50,50,0.3),rgba(50,50,200,0.3));border:1px solid rgba(255,100,100,0.3)">⚔ Battleground</button>
        <button class="mm-btn mm-btn-secondary" data-action="character">Character</button>
        <button class="mm-btn mm-btn-secondary" data-action="settings">Settings</button>
        <button class="mm-btn mm-btn-logout" data-action="logout">Logout</button>
      </div>
      <div class="mm-footer">GRUDGE STUDIO © 2026</div>
    `;

    // Wire buttons
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'play') this.callbacks.onPlay();
      if (action === 'battleground') this.callbacks.onBattleground();
      if (action === 'character') this.callbacks.onCharacter();
      if (action === 'settings') this.callbacks.onSettings();
      if (action === 'logout') this.callbacks.onLogout();
    });

    document.body.appendChild(this.root);
  }

  hide(): void {
    if (!this.root) return;
    // Fade out
    this.root.classList.add('fade-out');
    setTimeout(() => this.destroy(), 400);
  }

  destroy(): void {
    this.root?.remove();
    this.root = null;
    this.styleEl?.remove();
    this.styleEl = null;
  }
}
