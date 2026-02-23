// ═══════════════════════════════════════════════════════════════════
// CHARACTER CREATE — Race / Class / Faction wizard
//
// 3-step card-based selection screen. Saves selections via callback.
// Shown when profile has no class selected, or from main menu.
// ═══════════════════════════════════════════════════════════════════

import { SCREEN, type UIScreen } from './UIManager.js';

// ── Data ──────────────────────────────────────────────────────────

interface OptionDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  color: string;
}

const RACES: OptionDef[] = [
  { id: 'HUMAN',     name: 'Human',     icon: '🧑', desc: 'Balanced stats, versatile in all roles.',         color: '#d4a843' },
  { id: 'ORC',       name: 'Orc',       icon: '👹', desc: 'Raw strength and resilience. Born warriors.',     color: '#4ade80' },
  { id: 'ELF',       name: 'Elf',       icon: '🧝', desc: 'Agile and wise. Natural affinity for magic.',     color: '#58a6ff' },
  { id: 'DWARF',     name: 'Dwarf',     icon: '⛏️', desc: 'Stout and hardy. Master smiths and miners.',      color: '#f97316' },
  { id: 'BARBARIAN', name: 'Barbarian',  icon: '🪓', desc: 'Fierce and untamed. Thrive in the wild.',        color: '#ef4444' },
  { id: 'UNDEAD',    name: 'Undead',     icon: '💀', desc: 'Risen from death. Dark magic courses within.',    color: '#a855f7' },
];

const CLASSES: OptionDef[] = [
  { id: 'WARRIOR', name: 'Warrior', icon: '⚔️',  desc: 'Frontline fighter. Shields, swords, 2H weapons. Stamina-based sprint, AoE attacks, group invincibility.', color: '#ef4444' },
  { id: 'RANGER',  name: 'Ranger',  icon: '🏹', desc: 'Ranged precision. Bows, crossbows, guns, daggers. Parry-counter combos, dash attacks.',                  color: '#22c55e' },
  { id: 'MAGE',    name: 'Mage',    icon: '🔮', desc: 'Arcane power. Staffs, tomes, wands. Teleport blocks, mana-driven abilities.',                             color: '#3b82f6' },
  { id: 'WORGE',   name: 'Worge',   icon: '🐺', desc: 'Shapeshifter. Bear, Raptor, and Bird forms. Versatile melee and flight.',                                 color: '#f97316' },
];

const FACTIONS: OptionDef[] = [
  { id: 'CRUSADE', name: 'Crusade', icon: '⚜️',  desc: 'Holy knights seeking order and justice.',       color: '#d4a843' },
  { id: 'FABLED',  name: 'Fabled',  icon: '✨', desc: 'Scholars and mystics of ancient knowledge.',    color: '#a855f7' },
  { id: 'LEGION',  name: 'Legion',  icon: '🛡️',  desc: 'Disciplined soldiers defending the realm.',     color: '#3b82f6' },
  { id: 'PIRATES', name: 'Pirates', icon: '🏴‍☠️', desc: 'Free spirits of the open seas.',                color: '#ef4444' },
  { id: 'NEUTRAL', name: 'Neutral', icon: '⚖️',  desc: 'Unaligned. Walk your own path.',                color: '#9ca3af' },
];

const STEPS = [
  { title: 'Choose Your Race',    options: RACES },
  { title: 'Choose Your Class',   options: CLASSES },
  { title: 'Choose Your Faction', options: FACTIONS },
];

// ── CSS ───────────────────────────────────────────────────────────

const CSS = `
#character-create {
  position: absolute; inset: 0; z-index: 95;
  background: linear-gradient(135deg, rgba(10,10,26,0.96) 0%, rgba(26,10,46,0.94) 50%, rgba(10,26,30,0.96) 100%);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: 'Segoe UI', sans-serif; color: #fff;
}
.cc-step-label { color: #666; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
.cc-title { font-size: 28px; font-weight: 700; color: #d4a843; margin-bottom: 24px; }

.cc-cards {
  display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;
  max-width: 720px; margin-bottom: 28px;
}

.cc-card {
  width: 140px; padding: 16px 12px; border-radius: 12px;
  background: rgba(255,255,255,0.04); border: 2px solid rgba(255,255,255,0.08);
  cursor: pointer; text-align: center; transition: all 0.15s;
}
.cc-card:hover { background: rgba(255,255,255,0.08); transform: translateY(-2px); }
.cc-card.selected { border-color: var(--card-color); background: rgba(255,255,255,0.08); box-shadow: 0 0 20px rgba(var(--card-rgb), 0.2); }

.cc-card-icon { font-size: 32px; margin-bottom: 8px; }
.cc-card-name { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.cc-card-desc { font-size: 11px; color: #888; line-height: 1.4; }

.cc-nav { display: flex; gap: 12px; }

.cc-btn {
  padding: 12px 32px; border-radius: 8px; border: none;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.cc-btn:hover { transform: translateY(-1px); }

.cc-btn-back { background: rgba(255,255,255,0.08); color: #ccc; }
.cc-btn-back:hover { background: rgba(255,255,255,0.12); }

.cc-btn-next {
  background: linear-gradient(135deg, #d4a843 0%, #b8922e 100%);
  color: #000;
}
.cc-btn-next:hover { box-shadow: 0 4px 16px rgba(212,168,67,0.3); }
.cc-btn-next:disabled { opacity: 0.4; cursor: default; transform: none; }

.cc-progress { display: flex; gap: 8px; margin-bottom: 20px; }
.cc-dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.15); transition: background 0.2s; }
.cc-dot.active { background: #d4a843; }
.cc-dot.done { background: #4ade80; }
`;

// ── CharacterCreate ───────────────────────────────────────────────

export interface CharacterCreateResult {
  race: string;
  playerClass: string;
  faction: string;
}

export class CharacterCreate implements UIScreen {
  readonly id = SCREEN.CHARACTER_CREATE;
  readonly modal = true;

  private root: HTMLDivElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private onComplete: (result: CharacterCreateResult) => void;
  private onCancel: () => void;

  private step = 0;
  private selections: string[] = ['', '', ''];

  constructor(onComplete: (result: CharacterCreateResult) => void, onCancel: () => void) {
    this.onComplete = onComplete;
    this.onCancel = onCancel;
  }

  show(): void {
    if (this.root) return;
    this.step = 0;
    this.selections = ['', '', ''];

    this.styleEl = document.createElement('style');
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);

    this.root = document.createElement('div');
    this.root.id = 'character-create';
    document.body.appendChild(this.root);
    this.render();
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

  private render(): void {
    if (!this.root) return;
    const s = STEPS[this.step];

    // Progress dots
    let dotsHtml = '';
    for (let i = 0; i < STEPS.length; i++) {
      const cls = i < this.step ? 'done' : i === this.step ? 'active' : '';
      dotsHtml += `<div class="cc-dot ${cls}"></div>`;
    }

    // Cards
    let cardsHtml = '';
    for (const opt of s.options) {
      const sel = this.selections[this.step] === opt.id ? 'selected' : '';
      cardsHtml += `
        <div class="cc-card ${sel}" data-id="${opt.id}" style="--card-color: ${opt.color}; --card-rgb: ${hexToRgb(opt.color)}">
          <div class="cc-card-icon">${opt.icon}</div>
          <div class="cc-card-name" style="color: ${opt.color}">${opt.name}</div>
          <div class="cc-card-desc">${opt.desc}</div>
        </div>
      `;
    }

    const isLast = this.step === STEPS.length - 1;
    const hasSelection = this.selections[this.step] !== '';

    this.root.innerHTML = `
      <div class="cc-progress">${dotsHtml}</div>
      <div class="cc-step-label">Step ${this.step + 1} of ${STEPS.length}</div>
      <div class="cc-title">${s.title}</div>
      <div class="cc-cards">${cardsHtml}</div>
      <div class="cc-nav">
        <button class="cc-btn cc-btn-back">${this.step === 0 ? 'Cancel' : 'Back'}</button>
        <button class="cc-btn cc-btn-next" ${hasSelection ? '' : 'disabled'}>${isLast ? 'Create Character' : 'Next'}</button>
      </div>
    `;

    // Wire card clicks
    this.root.querySelectorAll('.cc-card').forEach((card) => {
      card.addEventListener('click', () => {
        this.selections[this.step] = (card as HTMLElement).dataset.id!;
        this.render();
      });
    });

    // Nav buttons
    this.root.querySelector('.cc-btn-back')?.addEventListener('click', () => {
      if (this.step === 0) {
        this.onCancel();
      } else {
        this.step--;
        this.render();
      }
    });

    this.root.querySelector('.cc-btn-next')?.addEventListener('click', () => {
      if (!hasSelection) return;
      if (isLast) {
        this.onComplete({
          race: this.selections[0],
          playerClass: this.selections[1],
          faction: this.selections[2],
        });
      } else {
        this.step++;
        this.render();
      }
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
