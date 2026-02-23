// ═══════════════════════════════════════════════════════════════════
// CURIOS UI — Soulbound Item Display
//
// Toggle with K key. Shows 3 curio slots (harvest tool, spell book,
// racial trinket) that are permanently bound to the character.
// Non-interactive (no equip/unequip) — display-only with tooltips.
//
// Driven by the shared Inventory.curios record.
// ═══════════════════════════════════════════════════════════════════

import { SCREEN, type UIScreen } from './UIManager.js';
import type { Inventory, CurioSlot, ItemDef } from '@grudge/shared';
import { ITEMS, RARITY_COLORS, CURIO_SLOT_NAMES } from '@grudge/shared';

// ── CSS ───────────────────────────────────────────────────────────

const CSS = `
#curios-ui {
  position: absolute; inset: 0; z-index: 75;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Segoe UI', sans-serif; color: #fff;
}

.curios-panel {
  background: rgba(20,20,30,0.95); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px; padding: 24px 28px; min-width: 240px;
}

.curios-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 16px;
}
.curios-title { font-size: 15px; color: #d4a843; font-weight: 600; }
.curios-tag {
  font-size: 10px; color: #a855f7; background: rgba(168,85,247,0.12);
  border: 1px solid rgba(168,85,247,0.3); border-radius: 10px;
  padding: 1px 8px; font-weight: 600; letter-spacing: 0.5px;
}

.curios-slots { display: flex; flex-direction: column; gap: 8px; }

.curio-row {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 8px; border-radius: 8px;
  background: rgba(255,255,255,0.03);
  transition: background 0.1s;
}
.curio-row:hover { background: rgba(255,255,255,0.06); }

.curio-icon-box {
  width: 44px; height: 44px; border-radius: 6px; flex-shrink: 0;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; position: relative;
}
.curio-icon-box.has-item { border-color: var(--rarity-color, rgba(255,255,255,0.15)); }

.curio-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.curio-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.curio-slot-label { font-size: 10px; color: #666; }
.curio-empty-label { font-size: 11px; color: #444; font-style: italic; }

/* ── Tooltip (reuses InventoryUI patterns) ────────────────── */
#curio-tooltip {
  position: absolute; z-index: 200; pointer-events: none;
  background: rgba(15,15,25,0.96); border: 1px solid var(--rarity-color, #555);
  border-radius: 8px; padding: 10px 14px; max-width: 220px;
  font-family: 'Segoe UI', sans-serif; display: none;
}
#curio-tooltip.visible { display: block; }
.tt-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
.tt-type { font-size: 11px; color: #888; margin-bottom: 6px; }
.tt-stat { font-size: 11px; color: #4ade80; line-height: 1.5; }
.tt-desc { font-size: 11px; color: #999; margin-top: 6px; font-style: italic; }
.tt-hint { font-size: 10px; color: #a855f7; margin-top: 6px; font-weight: 600; }
`;

// ── Icon Mapping ──────────────────────────────────────────────────

const CURIO_ICONS: Record<CurioSlot, string> = {
  harvestTool:   '⛏️',
  spellBook:     '📖',
  racialTrinket: '💎',
};

// ── CuriosUI ──────────────────────────────────────────────────────

export class CuriosUI implements UIScreen {
  readonly id = SCREEN.CURIOS;
  readonly modal = true;

  private root: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private inventory: Inventory;
  private onClose: () => void;

  constructor(inventory: Inventory, onClose: () => void) {
    this.inventory = inventory;
    this.onClose = onClose;
  }

  show(): void {
    if (this.root) return;

    this.styleEl = document.createElement('style');
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);

    // Tooltip (global)
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'curio-tooltip';
    document.body.appendChild(this.tooltip);

    this.root = document.createElement('div');
    this.root.id = 'curios-ui';
    document.body.appendChild(this.root);

    // Close on backdrop click
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.onClose();
    });

    // Track mouse for tooltip
    this.root.addEventListener('mousemove', (e) => {
      if (this.tooltip?.classList.contains('visible')) {
        this.tooltip.style.left = `${e.clientX + 12}px`;
        this.tooltip.style.top = `${e.clientY + 12}px`;
      }
    });

    this.render();
  }

  hide(): void {
    this.destroy();
  }

  destroy(): void {
    this.root?.remove();
    this.root = null;
    this.tooltip?.remove();
    this.tooltip = null;
    this.styleEl?.remove();
    this.styleEl = null;
  }

  private render(): void {
    if (!this.root) return;

    const slots: CurioSlot[] = ['harvestTool', 'spellBook', 'racialTrinket'];
    let rowsHtml = '';

    for (const slot of slots) {
      const inv = this.inventory.curios[slot];
      const def = inv ? ITEMS[inv.itemId] : null;
      const icon = def ? CURIO_ICONS[slot] : '';
      const rarityColor = def ? RARITY_COLORS[def.rarity] : 'rgba(255,255,255,0.1)';
      const slotName = CURIO_SLOT_NAMES[slot];

      if (def) {
        rowsHtml += `
          <div class="curio-row" data-curio="${slot}" data-item="${def.id}">
            <div class="curio-icon-box has-item" style="--rarity-color: ${rarityColor}">
              <span>${icon}</span>
            </div>
            <div class="curio-info">
              <div class="curio-name" style="color: ${rarityColor}">${def.name}</div>
              <div class="curio-slot-label">${slotName}</div>
            </div>
          </div>
        `;
      } else {
        rowsHtml += `
          <div class="curio-row">
            <div class="curio-icon-box">
              <span style="opacity:0.3">${CURIO_ICONS[slot]}</span>
            </div>
            <div class="curio-info">
              <div class="curio-empty-label">Empty ${slotName}</div>
            </div>
          </div>
        `;
      }
    }

    this.root.innerHTML = `
      <div class="curios-panel">
        <div class="curios-header">
          <div class="curios-title">Curios</div>
          <div class="curios-tag">Soulbound</div>
        </div>
        <div class="curios-slots">${rowsHtml}</div>
      </div>
    `;

    // Wire hover tooltips
    this.root.querySelectorAll('.curio-row[data-item]').forEach((el) => {
      const row = el as HTMLElement;
      row.addEventListener('mouseenter', () => {
        const itemId = row.dataset.item;
        if (itemId) this.showTooltip(itemId);
      });
      row.addEventListener('mouseleave', () => this.hideTooltip());
    });
  }

  private showTooltip(itemId: string): void {
    const def = ITEMS[itemId];
    if (!def || !this.tooltip) return;

    const color = RARITY_COLORS[def.rarity];
    let statsHtml = '';
    const s = def.stats;
    if (s.damage) statsHtml += `+${s.damage} Damage<br>`;
    if (s.defense) statsHtml += `+${s.defense} Defense<br>`;
    if (s.health) statsHtml += `+${s.health} Health<br>`;
    if (s.mana) statsHtml += `+${s.mana} Mana<br>`;
    if (s.stamina) statsHtml += `+${s.stamina} Stamina<br>`;
    if (s.criticalChance) statsHtml += `+${s.criticalChance}% Crit Chance<br>`;
    if (s.criticalDamage) statsHtml += `+${s.criticalDamage}% Crit Damage<br>`;
    if (s.attackSpeed) statsHtml += `${s.attackSpeed > 0 ? '+' : ''}${s.attackSpeed} Harvest Speed<br>`;
    if (s.movementSpeed) statsHtml += `${s.movementSpeed > 0 ? '+' : ''}${s.movementSpeed}% Move Speed<br>`;
    if (s.resistance) statsHtml += `+${s.resistance} Resistance<br>`;
    if (s.cooldownReduction) statsHtml += `+${s.cooldownReduction}% CDR<br>`;

    const slotLabel = def.curioSlot ? CURIO_SLOT_NAMES[def.curioSlot] : 'Curio';

    this.tooltip.style.setProperty('--rarity-color', color);
    this.tooltip.innerHTML = `
      <div class="tt-name" style="color:${color}">${def.name}</div>
      <div class="tt-type">${slotLabel} — ${def.rarity}</div>
      ${statsHtml ? `<div class="tt-stat">${statsHtml}</div>` : ''}
      ${def.description ? `<div class="tt-desc">${def.description}</div>` : ''}
      <div class="tt-hint">⚜ Soulbound — Cannot be traded or dropped</div>
    `;
    this.tooltip.classList.add('visible');
  }

  private hideTooltip(): void {
    this.tooltip?.classList.remove('visible');
  }
}
