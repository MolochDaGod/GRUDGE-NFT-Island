// ═══════════════════════════════════════════════════════════════════
// ESCAPE MENU — In-game pause overlay
//
// Triggered by Escape key. Semi-transparent backdrop with
// Resume, Settings, and Logout buttons.
// ═══════════════════════════════════════════════════════════════════

import { SCREEN, type UIScreen } from './UIManager.js';

const CSS = `
#escape-menu {
  position: absolute; inset: 0; z-index: 80;
  background: rgba(0,0,0,0.65);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: 'Segoe UI', sans-serif; color: #fff;
}
.esc-title { font-size: 24px; font-weight: 700; color: #d4a843; margin-bottom: 32px; }
.esc-buttons { display: flex; flex-direction: column; gap: 10px; width: 240px; }

.esc-btn {
  padding: 14px 24px; border-radius: 10px; border: none;
  font-size: 15px; font-weight: 600; cursor: pointer;
  transition: all 0.15s; text-align: center;
}
.esc-btn:hover { transform: translateY(-1px); }
.esc-btn:active { transform: translateY(0); }

.esc-btn-resume {
  background: linear-gradient(135deg, #d4a843 0%, #b8922e 100%);
  color: #000;
}
.esc-btn-resume:hover { box-shadow: 0 4px 16px rgba(212,168,67,0.3); }

.esc-btn-secondary {
  background: rgba(255,255,255,0.08); color: #ccc;
  border: 1px solid rgba(255,255,255,0.12);
}
.esc-btn-secondary:hover { background: rgba(255,255,255,0.12); color: #fff; }

.esc-btn-logout {
  background: none; color: #666; font-size: 13px; margin-top: 8px;
}
.esc-btn-logout:hover { color: #ef4444; }
`;

export interface EscapeMenuCallbacks {
  onResume: () => void;
  onSettings: () => void;
  onLogout: () => void;
}

export class EscapeMenu implements UIScreen {
  readonly id = SCREEN.ESCAPE_MENU;
  readonly modal = true;

  private root: HTMLDivElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private callbacks: EscapeMenuCallbacks;

  constructor(callbacks: EscapeMenuCallbacks) {
    this.callbacks = callbacks;
  }

  show(): void {
    if (this.root) return;

    this.styleEl = document.createElement('style');
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);

    this.root = document.createElement('div');
    this.root.id = 'escape-menu';
    this.root.innerHTML = `
      <div class="esc-title">PAUSED</div>
      <div class="esc-buttons">
        <button class="esc-btn esc-btn-resume" data-action="resume">Resume</button>
        <button class="esc-btn esc-btn-secondary" data-action="settings">Settings</button>
        <button class="esc-btn esc-btn-logout" data-action="logout">Logout to Menu</button>
      </div>
    `;

    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'resume') this.callbacks.onResume();
      if (action === 'settings') this.callbacks.onSettings();
      if (action === 'logout') this.callbacks.onLogout();
    });

    document.body.appendChild(this.root);
  }

  hide(): void {
    this.destroy();
  }

  destroy(): void {
    this.root?.remove();
    this.root = null;
    this.styleEl?.remove();
    this.styleEl = null;
  }
}
