// ═══════════════════════════════════════════════════════════════════
// INVENTORY UI — Bag + Equipment Grid
//
// Toggle with I key. 40-slot bag (8×5 grid), 9 equipment slots in
// a paper-doll layout. Right-click equip/unequip. Hover tooltips
// with rarity-colored borders and stat display.
//
// Driven by the shared Inventory class.
// ═══════════════════════════════════════════════════════════════════

import { SCREEN, type UIScreen } from './UIManager.js';
import type { Inventory, EquipSlot, ItemDef } from '@grudge/shared';
import { ITEMS, RARITY_COLORS, EQUIP_SLOT_NAMES, HOTBAR_SIZE } from '@grudge/shared';

// ── CSS ───────────────────────────────────────────────────────────

const CSS = `
#inventory-ui {
  position: absolute; inset: 0; z-index: 75;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Segoe UI', sans-serif; color: #fff;
}

.inv-panel {
  background: rgba(20,20,30,0.95); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px; padding: 20px; display: flex; gap: 20px;
}

/* ── Equipment Side ──────────────────────────────────────── */
.inv-equip {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  min-width: 160px;
}
.inv-equip-title { font-size: 13px; color: #d4a843; font-weight: 600; margin-bottom: 8px; }

.inv-equip-grid {
  display: grid;
  grid-template-areas:
    ".    head   ."
    "cape chest  relic1"
    ".    legs   relic2"
    "main boots  off";
  grid-template-columns: 48px 48px 48px;
  gap: 4px;
}
.eq-head   { grid-area: head; }
.eq-chest  { grid-area: chest; }
.eq-legs   { grid-area: legs; }
.eq-boots  { grid-area: boots; }
.eq-mainHand { grid-area: main; }
.eq-offHand  { grid-area: off; }
.eq-cape   { grid-area: cape; }
.eq-relic1 { grid-area: relic1; }
.eq-relic2 { grid-area: relic2; }

/* ── Bag Side ────────────────────────────────────────────── */
.inv-bag { display: flex; flex-direction: column; gap: 6px; }
.inv-bag-title { font-size: 13px; color: #d4a843; font-weight: 600; margin-bottom: 4px; }

.inv-bag-grid {
  display: grid; grid-template-columns: repeat(8, 44px); gap: 3px;
}

/* ── Slot (shared) ───────────────────────────────────────── */
.inv-slot {
  width: 44px; height: 44px; border-radius: 6px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  display: flex; align-items: center; justify-content: center;
  position: relative; cursor: pointer; font-size: 11px;
  transition: border-color 0.1s;
}
.inv-slot:hover { border-color: rgba(255,255,255,0.3); }
.inv-slot.has-item { border-color: var(--rarity-color, rgba(255,255,255,0.15)); }

/* Hotbar row accent */
.inv-slot.hotbar-slot { background: rgba(212,168,67,0.06); }
.inv-slot-hotbar-key {
  position: absolute; top: 1px; left: 3px; font-size: 8px;
  color: rgba(212,168,67,0.5); font-weight: 700; pointer-events: none;
}

.inv-slot-icon { font-size: 18px; pointer-events: none; }
.inv-slot-count {
  position: absolute; bottom: 1px; right: 3px;
  font-size: 9px; color: #ccc; font-weight: 600;
}
.inv-slot-label {
  font-size: 8px; color: #666; position: absolute; bottom: 1px;
  pointer-events: none; text-align: center; width: 100%;
}

/* ── Tooltip ─────────────────────────────────────────────── */
#inv-tooltip {
  position: absolute; z-index: 200; pointer-events: none;
  background: rgba(15,15,25,0.96); border: 1px solid var(--rarity-color, #555);
  border-radius: 8px; padding: 10px 14px; max-width: 220px;
  font-family: 'Segoe UI', sans-serif; display: none;
}
#inv-tooltip.visible { display: block; }
.tt-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
.tt-type { font-size: 11px; color: #888; margin-bottom: 6px; }
.tt-stat { font-size: 11px; color: #4ade80; line-height: 1.5; }
.tt-desc { font-size: 11px; color: #999; margin-top: 6px; font-style: italic; }
.tt-req { font-size: 10px; color: #ef4444; margin-top: 4px; }
.tt-hint { font-size: 10px; color: #666; margin-top: 6px; }
`;

// ── Icon Mapping (emoji placeholders) ─────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  weapon: '⚔️', armor: '🛡️', shield: '🛡️', consumable: '🧪',
  resource: '📦', relic: '💎', cape: '🧣',
};

// ── InventoryUI ───────────────────────────────────────────────────

export class InventoryUI implements UIScreen {
  readonly id = SCREEN.INVENTORY;
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
    this.tooltip.id = 'inv-tooltip';
    document.body.appendChild(this.tooltip);

    this.root = document.createElement('div');
    this.root.id = 'inventory-ui';
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

    // Equipment slots
    const equipSlots: EquipSlot[] = ['head', 'chest', 'legs', 'boots', 'mainHand', 'offHand', 'cape', 'relic1', 'relic2'];
    let equipHtml = '';
    for (const slot of equipSlots) {
      const inv = this.inventory.equipment[slot];
      const def = inv ? ITEMS[inv.itemId] : null;
      const icon = def ? (TYPE_ICONS[def.type] || '?') : '';
      const rarityColor = def ? RARITY_COLORS[def.rarity] : 'rgba(255,255,255,0.1)';
      const label = def ? '' : EQUIP_SLOT_NAMES[slot].split(' ').pop()!;
      equipHtml += `
        <div class="inv-slot eq-${slot} ${def ? 'has-item' : ''}"
             style="--rarity-color: ${rarityColor}"
             data-equip="${slot}" data-item="${def?.id || ''}">
          ${def ? `<span class="inv-slot-icon">${icon}</span>` : `<span class="inv-slot-label">${label}</span>`}
        </div>
      `;
    }

    // Bag slots (first HOTBAR_SIZE slots = hotbar row)
    let bagHtml = '';
    for (let i = 0; i < this.inventory.size; i++) {
      const slot = this.inventory.slots[i];
      const def = slot ? ITEMS[slot.itemId] : null;
      const icon = def ? (TYPE_ICONS[def.type] || '?') : '';
      const rarityColor = def ? RARITY_COLORS[def.rarity] : 'rgba(255,255,255,0.06)';
      const count = slot && slot.count > 1 ? slot.count : '';
      const isHotbar = i < HOTBAR_SIZE;
      const hotbarKey = isHotbar ? `<span class="inv-slot-hotbar-key">${i + 1}</span>` : '';
      bagHtml += `
        <div class="inv-slot ${def ? 'has-item' : ''} ${isHotbar ? 'hotbar-slot' : ''}"
             style="--rarity-color: ${rarityColor}"
             data-bag="${i}" data-item="${def?.id || ''}">
          ${hotbarKey}
          ${def ? `<span class="inv-slot-icon">${icon}</span>` : ''}
          ${count ? `<span class="inv-slot-count">${count}</span>` : ''}
        </div>
      `;
    }

    this.root.innerHTML = `
      <div class="inv-panel">
        <div class="inv-equip">
          <div class="inv-equip-title">Equipment</div>
          <div class="inv-equip-grid">${equipHtml}</div>
        </div>
        <div class="inv-bag">
        <div class="inv-bag-title">Inventory (${this.inventory.slots.filter(s => s !== null).length}/${this.inventory.size}) — <span style="color:rgba(212,168,67,0.6);font-size:11px">Top row = Hotbar</span></div>
          <div class="inv-bag-grid">${bagHtml}</div>
        </div>
      </div>
    `;

    // Wire slot interactions
    this.root.querySelectorAll('.inv-slot').forEach((el) => {
      const slotEl = el as HTMLElement;

      // Hover tooltip
      slotEl.addEventListener('mouseenter', () => {
        const itemId = slotEl.dataset.item;
        if (itemId) this.showTooltip(itemId, slotEl);
      });
      slotEl.addEventListener('mouseleave', () => this.hideTooltip());

      // Right-click: equip from bag / unequip from equipment
      slotEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (slotEl.dataset.bag !== undefined) {
          const idx = parseInt(slotEl.dataset.bag);
          if (this.inventory.slots[idx]) {
            this.inventory.equip(idx);
            this.render();
          }
        } else if (slotEl.dataset.equip) {
          const slot = slotEl.dataset.equip as EquipSlot;
          if (this.inventory.equipment[slot]) {
            this.inventory.unequip(slot);
            this.render();
          }
        }
      });
    });
  }

  private showTooltip(itemId: string, _anchor: HTMLElement): void {
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
    if (s.attackSpeed) statsHtml += `${s.attackSpeed > 0 ? '+' : ''}${s.attackSpeed} Attack Speed<br>`;
    if (s.movementSpeed) statsHtml += `${s.movementSpeed > 0 ? '+' : ''}${s.movementSpeed}% Move Speed<br>`;
    if (s.block) statsHtml += `+${s.block} Block<br>`;
    if (s.resistance) statsHtml += `+${s.resistance} Resistance<br>`;
    if (s.cooldownReduction) statsHtml += `+${s.cooldownReduction}% CDR<br>`;

    const typeStr = def.weaponType ? `${def.weaponType.replace('_', ' ')}` : `${def.armorWeight || ''} ${def.type}`;
    const hint = def.equipSlot ? 'Right-click to equip/unequip' : '';

    this.tooltip.style.setProperty('--rarity-color', color);
    this.tooltip.innerHTML = `
      <div class="tt-name" style="color:${color}">${def.name}</div>
      <div class="tt-type">${typeStr} — ${def.rarity}</div>
      ${statsHtml ? `<div class="tt-stat">${statsHtml}</div>` : ''}
      ${def.description ? `<div class="tt-desc">${def.description}</div>` : ''}
      ${def.levelReq > 1 ? `<div class="tt-req">Requires Level ${def.levelReq}</div>` : ''}
      ${hint ? `<div class="tt-hint">${hint}</div>` : ''}
    `;
    this.tooltip.classList.add('visible');
  }

  private hideTooltip(): void {
    this.tooltip?.classList.remove('visible');
  }
}
