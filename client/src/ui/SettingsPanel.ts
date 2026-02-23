// ═══════════════════════════════════════════════════════════════════
// SETTINGS PANEL — Tabbed settings overlay
//
// Tabs: Graphics, Audio, Controls
// All values persist to localStorage.
// ═══════════════════════════════════════════════════════════════════

import { SCREEN, type UIScreen } from './UIManager.js';

// ── Settings Storage ──────────────────────────────────────────────

const LS_KEY = 'grudge:settings';

export interface GameSettings {
  renderDistance: number;
  shadows: boolean;
  fov: number;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
}

const DEFAULT_SETTINGS: GameSettings = {
  renderDistance: 8,
  shadows: true,
  fov: 65,
  masterVolume: 80,
  sfxVolume: 100,
  musicVolume: 60,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* use defaults */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: GameSettings): void {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

// ── CSS ───────────────────────────────────────────────────────────

const CSS = `
#settings-panel {
  position: absolute; inset: 0; z-index: 85;
  background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Segoe UI', sans-serif; color: #fff;
}
.set-box {
  background: rgba(20,20,30,0.95); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px; padding: 0; width: 500px; max-height: 80vh;
  overflow: hidden;
}
.set-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.08);
}
.set-header h2 { font-size: 18px; color: #d4a843; margin: 0; }
.set-close {
  background: none; border: none; color: #666; font-size: 20px; cursor: pointer;
  padding: 4px 8px; border-radius: 4px;
}
.set-close:hover { color: #fff; background: rgba(255,255,255,0.1); }

.set-tabs {
  display: flex; border-bottom: 1px solid rgba(255,255,255,0.08);
}
.set-tab {
  flex: 1; padding: 12px; text-align: center; background: none; border: none;
  color: #888; font-size: 13px; font-weight: 600; cursor: pointer;
  border-bottom: 2px solid transparent; transition: all 0.15s;
}
.set-tab:hover { color: #ccc; }
.set-tab.active { color: #d4a843; border-bottom-color: #d4a843; }

.set-content { padding: 20px; }

.set-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px;
}
.set-label { font-size: 13px; color: #ccc; }
.set-value { font-size: 12px; color: #888; min-width: 40px; text-align: right; margin-left: 8px; }

.set-slider {
  width: 180px; height: 6px; -webkit-appearance: none; appearance: none;
  background: rgba(255,255,255,0.15); border-radius: 3px; outline: none;
}
.set-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 16px; height: 16px;
  background: #d4a843; border-radius: 50%; cursor: pointer;
}

.set-toggle {
  width: 44px; height: 24px; border-radius: 12px;
  background: rgba(255,255,255,0.15); border: none; cursor: pointer;
  position: relative; transition: background 0.2s;
}
.set-toggle.on { background: #d4a843; }
.set-toggle::after {
  content: ''; position: absolute; top: 3px; left: 3px;
  width: 18px; height: 18px; border-radius: 50%; background: #fff;
  transition: transform 0.2s;
}
.set-toggle.on::after { transform: translateX(20px); }

.set-keybinds { font-size: 12px; color: #999; line-height: 2; }
.set-keybinds span { color: #d4a843; font-weight: 600; min-width: 60px; display: inline-block; }
`;

// ── SettingsPanel ─────────────────────────────────────────────────

export class SettingsPanel implements UIScreen {
  readonly id = SCREEN.SETTINGS;
  readonly modal = true;

  private root: HTMLDivElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private settings: GameSettings;
  private activeTab = 0;
  private onClose: () => void;
  private onApply: (s: GameSettings) => void;

  constructor(onClose: () => void, onApply: (s: GameSettings) => void) {
    this.onClose = onClose;
    this.onApply = onApply;
    this.settings = loadSettings();
  }

  show(): void {
    if (this.root) return;
    this.settings = loadSettings();
    this.activeTab = 0;

    this.styleEl = document.createElement('style');
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);

    this.root = document.createElement('div');
    this.root.id = 'settings-panel';
    document.body.appendChild(this.root);
    this.render();
  }

  hide(): void {
    saveSettings(this.settings);
    this.onApply(this.settings);
    this.destroy();
  }

  destroy(): void {
    this.root?.remove();
    this.root = null;
    this.styleEl?.remove();
    this.styleEl = null;
  }

  private render(): void {
    if (!this.root) return;
    const tabs = ['Graphics', 'Audio', 'Controls'];

    let tabsHtml = '';
    for (let i = 0; i < tabs.length; i++) {
      tabsHtml += `<button class="set-tab ${i === this.activeTab ? 'active' : ''}" data-tab="${i}">${tabs[i]}</button>`;
    }

    let contentHtml = '';
    if (this.activeTab === 0) {
      contentHtml = `
        <div class="set-row">
          <span class="set-label">Render Distance</span>
          <div style="display:flex;align-items:center;">
            <input type="range" class="set-slider" min="4" max="16" value="${this.settings.renderDistance}" data-key="renderDistance">
            <span class="set-value">${this.settings.renderDistance}</span>
          </div>
        </div>
        <div class="set-row">
          <span class="set-label">Shadows</span>
          <button class="set-toggle ${this.settings.shadows ? 'on' : ''}" data-key="shadows"></button>
        </div>
        <div class="set-row">
          <span class="set-label">Field of View</span>
          <div style="display:flex;align-items:center;">
            <input type="range" class="set-slider" min="50" max="110" value="${this.settings.fov}" data-key="fov">
            <span class="set-value">${this.settings.fov}°</span>
          </div>
        </div>
      `;
    } else if (this.activeTab === 1) {
      contentHtml = `
        <div class="set-row">
          <span class="set-label">Master Volume</span>
          <div style="display:flex;align-items:center;">
            <input type="range" class="set-slider" min="0" max="100" value="${this.settings.masterVolume}" data-key="masterVolume">
            <span class="set-value">${this.settings.masterVolume}%</span>
          </div>
        </div>
        <div class="set-row">
          <span class="set-label">SFX Volume</span>
          <div style="display:flex;align-items:center;">
            <input type="range" class="set-slider" min="0" max="100" value="${this.settings.sfxVolume}" data-key="sfxVolume">
            <span class="set-value">${this.settings.sfxVolume}%</span>
          </div>
        </div>
        <div class="set-row">
          <span class="set-label">Music Volume</span>
          <div style="display:flex;align-items:center;">
            <input type="range" class="set-slider" min="0" max="100" value="${this.settings.musicVolume}" data-key="musicVolume">
            <span class="set-value">${this.settings.musicVolume}%</span>
          </div>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="set-keybinds">
          <span>W</span> Move Forward<br>
          <span>S</span> Move Backward<br>
          <span>A / D</span> Turn Left / Right<br>
          <span>Q / E</span> Strafe Left / Right<br>
          <span>Shift</span> Sprint<br>
          <span>Space</span> Jump<br>
          <span>F</span> Attack<br>
          <span>RMB</span> Block<br>
          <span>X</span> Dodge<br>
          <span>R</span> Cast Ability<br>
          <span>Tab</span> Target Cycle<br>
          <span>G</span> Mine Block<br>
          <span>V</span> Place Block<br>
          <span>I</span> Inventory<br>
          <span>Enter</span> Chat<br>
          <span>Escape</span> Menu<br>
          <span>F3</span> Debug HUD<br>
        </div>
      `;
    }

    this.root.innerHTML = `
      <div class="set-box">
        <div class="set-header">
          <h2>Settings</h2>
          <button class="set-close" data-action="close">✕</button>
        </div>
        <div class="set-tabs">${tabsHtml}</div>
        <div class="set-content">${contentHtml}</div>
      </div>
    `;

    // Wire tabs
    this.root.querySelectorAll('.set-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.activeTab = parseInt((tab as HTMLElement).dataset.tab!);
        this.render();
      });
    });

    // Close
    this.root.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      this.onClose();
    });

    // Also close on backdrop click
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.onClose();
    });

    // Sliders
    this.root.querySelectorAll('.set-slider').forEach((slider) => {
      slider.addEventListener('input', () => {
        const key = (slider as HTMLInputElement).dataset.key! as keyof GameSettings;
        const val = parseInt((slider as HTMLInputElement).value);
        (this.settings as any)[key] = val;
        const valueEl = (slider as HTMLElement).parentElement?.querySelector('.set-value');
        if (valueEl) {
          valueEl.textContent = key === 'fov' ? `${val}°` : key.includes('Volume') ? `${val}%` : `${val}`;
        }
        saveSettings(this.settings);
        this.onApply(this.settings);
      });
    });

    // Toggles
    this.root.querySelectorAll('.set-toggle').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const key = (toggle as HTMLElement).dataset.key! as keyof GameSettings;
        (this.settings as any)[key] = !(this.settings as any)[key];
        toggle.classList.toggle('on');
        saveSettings(this.settings);
        this.onApply(this.settings);
      });
    });
  }
}
