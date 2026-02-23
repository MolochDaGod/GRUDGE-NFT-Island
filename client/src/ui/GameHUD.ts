// ═══════════════════════════════════════════════════════════════════
// GAME HUD
//
// DOM-based game UI overlay driven by CombatState + TargetSystem
// every frame. Creates all elements dynamically so index.html stays
// clean. The debug HUD (#debug) is preserved and toggled with F3.
//
// Layout:
//   ┌─────────────────────────────────────┐
//   │ [Target Frame]           [Minimap]  │
//   │                                     │
//   │                                     │
//   │ [Combat Log]                        │
//   │ [Player Bars]  [Action Bar]         │
//   └─────────────────────────────────────┘
// ═══════════════════════════════════════════════════════════════════

import type { CombatState, CombatEvent } from '../combat/CombatSystem.js';
import type { TargetSystem } from '../combat/TargetSystem.js';

// ── Styles ────────────────────────────────────────────────────────

const HUD_CSS = `
/* ── Player Bars ──────────────────────────────────────────────── */
#game-hud {
  position: absolute; inset: 0; pointer-events: none; z-index: 20;
  font-family: 'Segoe UI', sans-serif;
}

#player-bars {
  position: absolute; bottom: 90px; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}

.bar-container {
  width: 260px; height: 18px; background: rgba(0,0,0,0.6);
  border: 1px solid rgba(255,255,255,0.12); border-radius: 4px;
  overflow: hidden; position: relative;
}

.bar-fill {
  height: 100%; transition: width 0.12s; border-radius: 3px;
}

.bar-text {
  position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; font-size: 11px; font-weight: 600;
  color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

.bar-hp .bar-fill { background: linear-gradient(180deg, #34d058 0%, #22863a 100%); }
.bar-resource .bar-fill { background: linear-gradient(180deg, #58a6ff 0%, #1f6feb 100%); }
.bar-resource.stamina .bar-fill { background: linear-gradient(180deg, #d4a843 0%, #b08930 100%); }
.bar-resource.mana .bar-fill { background: linear-gradient(180deg, #a371f7 0%, #8957e5 100%); }
.bar-resource.focus .bar-fill { background: linear-gradient(180deg, #58a6ff 0%, #1f6feb 100%); }

/* ── Target Frame ─────────────────────────────────────────────── */
#target-frame {
  position: absolute; top: 16px; left: 16px;
  background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px; padding: 10px 14px; min-width: 200px;
}

#target-frame.hidden { display: none; }

#target-name {
  font-size: 14px; font-weight: 600; color: #fff;
  margin-bottom: 4px; text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

#target-level {
  font-size: 11px; color: #d4a843; font-weight: bold;
  margin-right: 6px;
}

#target-hp-bar {
  width: 100%; height: 14px; background: rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;
  overflow: hidden; position: relative; margin-top: 4px;
}

#target-hp-fill {
  height: 100%; background: #22c55e; transition: width 0.15s;
  border-radius: 2px;
}

#target-hp-text {
  position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; font-size: 10px; font-weight: 600;
  color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

/* ── Action Bar ───────────────────────────────────────────────── */
#action-bar {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 4px;
}

.action-slot {
  width: 44px; height: 44px; background: rgba(0,0,0,0.6);
  border: 1px solid rgba(255,255,255,0.15); border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  position: relative; font-size: 18px; color: rgba(255,255,255,0.3);
}

.action-slot .keybind {
  position: absolute; top: 2px; right: 4px; font-size: 9px;
  color: rgba(255,255,255,0.5); font-weight: 600;
}

.action-slot.active { border-color: #d4a843; }

/* ── Combat Log ───────────────────────────────────────────────── */
#combat-log {
  position: absolute; bottom: 100px; left: 16px; width: 280px;
  max-height: 140px; overflow: hidden;
  font-size: 11px; line-height: 1.4;
}

.log-line {
  color: rgba(255,255,255,0.7); text-shadow: 0 1px 2px rgba(0,0,0,0.8);
  animation: log-fade 6s forwards;
}

.log-line.damage-taken { color: #ef4444; }
.log-line.damage-dealt { color: #22c55e; }
.log-line.parry { color: #d4a843; }
.log-line.dodge { color: #58a6ff; }
.log-line.stamina-fail { color: #666; }

@keyframes log-fade {
  0% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
}
`;

// ── Action Bar Slot Definitions ───────────────────────────────────

interface ActionSlot {
  key: string;
  label: string;
  icon: string;
}

const ACTION_SLOTS: ActionSlot[] = [
  { key: '1', label: '1', icon: '⚔' },
  { key: '2', label: '2', icon: '🛡' },
  { key: '3', label: '3', icon: '✨' },
  { key: '4', label: '4', icon: '🧪' },
  { key: '5', label: '5', icon: '💊' },
  { key: 'F', label: 'F', icon: '🗡' },
  { key: 'R', label: 'R', icon: '🔮' },
  { key: 'X', label: 'X', icon: '💨' },
];

// ── GameHUD Class ─────────────────────────────────────────────────

export class GameHUD {
  private root: HTMLDivElement;

  // Player bars
  private hpFill: HTMLDivElement;
  private hpText: HTMLDivElement;
  private resFill: HTMLDivElement;
  private resText: HTMLDivElement;
  private resContainer: HTMLDivElement;

  // Target frame
  private targetFrame: HTMLDivElement;
  private targetName: HTMLDivElement;
  private targetLevel: HTMLSpanElement;
  private targetHpFill: HTMLDivElement;
  private targetHpText: HTMLDivElement;

  // Action bar
  private actionSlots: HTMLDivElement[] = [];

  // Combat log
  private combatLog: HTMLDivElement;
  private logLines: HTMLDivElement[] = [];
  private readonly MAX_LOG_LINES = 12;

  constructor() {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = HUD_CSS;
    document.head.appendChild(style);

    // Create root
    this.root = document.createElement('div');
    this.root.id = 'game-hud';
    document.body.appendChild(this.root);

    // ── Player Bars ──
    const playerBars = document.createElement('div');
    playerBars.id = 'player-bars';

    // HP bar
    const hpBar = this.createBar('bar-hp');
    this.hpFill = hpBar.fill;
    this.hpText = hpBar.text;

    // Resource bar
    const resBar = this.createBar('bar-resource stamina');
    this.resFill = resBar.fill;
    this.resText = resBar.text;
    this.resContainer = resBar.container;

    playerBars.appendChild(hpBar.container);
    playerBars.appendChild(resBar.container);
    this.root.appendChild(playerBars);

    // ── Target Frame ──
    this.targetFrame = document.createElement('div');
    this.targetFrame.id = 'target-frame';
    this.targetFrame.classList.add('hidden');

    const targetHeader = document.createElement('div');
    targetHeader.style.display = 'flex';
    targetHeader.style.alignItems = 'baseline';

    this.targetLevel = document.createElement('span');
    this.targetLevel.id = 'target-level';
    this.targetLevel.textContent = '1';

    this.targetName = document.createElement('div');
    this.targetName.id = 'target-name';
    this.targetName.textContent = '';

    targetHeader.appendChild(this.targetLevel);
    targetHeader.appendChild(this.targetName);

    const targetHpBar = document.createElement('div');
    targetHpBar.id = 'target-hp-bar';

    this.targetHpFill = document.createElement('div');
    this.targetHpFill.id = 'target-hp-fill';

    this.targetHpText = document.createElement('div');
    this.targetHpText.id = 'target-hp-text';

    targetHpBar.appendChild(this.targetHpFill);
    targetHpBar.appendChild(this.targetHpText);

    this.targetFrame.appendChild(targetHeader);
    this.targetFrame.appendChild(targetHpBar);
    this.root.appendChild(this.targetFrame);

    // ── Action Bar ──
    const actionBar = document.createElement('div');
    actionBar.id = 'action-bar';

    for (const slot of ACTION_SLOTS) {
      const el = document.createElement('div');
      el.className = 'action-slot';
      el.innerHTML = `${slot.icon}<span class="keybind">${slot.label}</span>`;
      actionBar.appendChild(el);
      this.actionSlots.push(el);
    }

    this.root.appendChild(actionBar);

    // ── Combat Log ──
    this.combatLog = document.createElement('div');
    this.combatLog.id = 'combat-log';
    this.root.appendChild(this.combatLog);

    // ── F3 to toggle debug HUD ──
    document.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        const debug = document.getElementById('debug');
        if (debug) {
          debug.style.display = debug.style.display === 'none' ? '' : 'none';
        }
      }
    });
  }

  // ── Update (call every frame) ───────────────────────────────

  update(combat: CombatState, target: TargetSystem): void {
    // Player HP
    const hpPct = combat.maxHealth > 0
      ? (combat.health / combat.maxHealth) * 100 : 0;
    this.hpFill.style.width = `${hpPct}%`;
    this.hpText.textContent = `${Math.floor(combat.health)} / ${combat.maxHealth}`;

    // HP bar color
    if (hpPct > 60) this.hpFill.style.background = '';
    else if (hpPct > 30) this.hpFill.style.background = 'linear-gradient(180deg, #eab308 0%, #ca8a04 100%)';
    else this.hpFill.style.background = 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)';

    // Resource bar
    const resPct = combat.maxResource > 0
      ? (combat.resource / combat.maxResource) * 100 : 0;
    this.resFill.style.width = `${resPct}%`;
    this.resText.textContent = `${Math.floor(combat.resource)} / ${Math.floor(combat.maxResource)}`;

    // Resource bar class (for different resource colors)
    this.resContainer.className = `bar-container bar-resource ${combat.resourceName.toLowerCase()}`;

    // Target frame
    const sel = target.selected;
    if (sel) {
      this.targetFrame.classList.remove('hidden');
      this.targetName.textContent = sel.name;
      this.targetLevel.textContent = `[${sel.level}]`;
      const tHpPct = sel.maxHealth > 0
        ? (sel.health / sel.maxHealth) * 100 : 0;
      this.targetHpFill.style.width = `${tHpPct}%`;
      this.targetHpText.textContent = `${Math.floor(sel.health)} / ${sel.maxHealth}`;

      if (tHpPct > 60) this.targetHpFill.style.background = '#22c55e';
      else if (tHpPct > 30) this.targetHpFill.style.background = '#eab308';
      else this.targetHpFill.style.background = '#ef4444';
    } else {
      this.targetFrame.classList.add('hidden');
    }

    // Process combat events for the log
    for (const ev of combat.events) {
      this.addLogEntry(ev);
    }
  }

  // ── Combat Log ──────────────────────────────────────────────

  private addLogEntry(event: CombatEvent): void {
    let text = '';
    let cls = '';

    switch (event.type) {
      case 'hit_taken':
        text = `You took ${Math.floor(event.value ?? 0)} damage${event.detail ? ` (${event.detail})` : ''}`;
        cls = 'damage-taken';
        break;
      case 'hit_dealt':
        text = `You dealt ${Math.floor(event.value ?? 0)} damage`;
        cls = 'damage-dealt';
        break;
      case 'perfect_parry':
        text = '⚡ Perfect Parry!';
        cls = 'parry';
        break;
      case 'normal_parry':
        text = `🛡 Parry! (${Math.floor(event.value ?? 0)} dmg through)`;
        cls = 'parry';
        break;
      case 'riposte':
        text = `⚔ Riposte! (${event.detail ?? ''} ×${(event.value ?? 1).toFixed(1)})`;
        cls = 'parry';
        break;
      case 'dodge':
        text = '💨 Dodged!';
        cls = 'dodge';
        break;
      case 'stamina_fail':
        text = `Not enough ${event.detail ?? 'resource'}`;
        cls = 'stamina-fail';
        break;
      case 'death':
        text = '☠ You died';
        cls = 'damage-taken';
        break;
      default:
        return; // Don't log attack/block_start/block_end etc.
    }

    const line = document.createElement('div');
    line.className = `log-line ${cls}`;
    line.textContent = text;

    this.combatLog.appendChild(line);
    this.logLines.push(line);

    // Trim old lines
    while (this.logLines.length > this.MAX_LOG_LINES) {
      const old = this.logLines.shift();
      old?.remove();
    }

    // Auto-scroll
    this.combatLog.scrollTop = this.combatLog.scrollHeight;
  }

  // ── Helpers ─────────────────────────────────────────────────

  private createBar(extraClass: string): {
    container: HTMLDivElement;
    fill: HTMLDivElement;
    text: HTMLDivElement;
  } {
    const container = document.createElement('div');
    container.className = `bar-container ${extraClass}`;

    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = '100%';

    const text = document.createElement('div');
    text.className = 'bar-text';
    text.textContent = '250 / 250';

    container.appendChild(fill);
    container.appendChild(text);

    return { container, fill, text };
  }
}
