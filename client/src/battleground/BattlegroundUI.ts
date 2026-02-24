// ═══════════════════════════════════════════════════════════════════
// BATTLEGROUND UI — HUD overlay for the battleground game mode
//
// Shows faction scores, unit counts, and a back-to-menu button.
// Creates its own DOM elements and cleans up on dispose().
// ═══════════════════════════════════════════════════════════════════

import type { Faction } from './BattlegroundAI.js';

export class BattlegroundUI {
  private container: HTMLDivElement;
  private crusaderEl: HTMLSpanElement;
  private orcEl: HTMLSpanElement;
  private neutralEl: HTMLSpanElement;
  private statusEl: HTMLDivElement;

  onExit?: () => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'battleground-hud';
    Object.assign(this.container.style, {
      position: 'fixed', top: '0', left: '0', right: '0',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 24px',
      background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)',
      color: '#fff', fontFamily: "'Segoe UI', sans-serif", fontSize: '14px',
      zIndex: '1000', pointerEvents: 'none',
    });

    // Left: Crusader score
    const left = document.createElement('div');
    left.style.pointerEvents = 'auto';
    left.innerHTML = `<span style="color:#4a90d9;font-size:20px;font-weight:bold">⚔ CRUSADERS</span><br>`;
    this.crusaderEl = document.createElement('span');
    this.crusaderEl.textContent = '0 / 0';
    left.appendChild(this.crusaderEl);

    // Center: title + status
    const center = document.createElement('div');
    center.style.textAlign = 'center';
    center.innerHTML = `<div style="font-size:18px;font-weight:bold;letter-spacing:2px;text-shadow:0 2px 4px rgba(0,0,0,0.8)">⚔ BATTLEGROUND ⚔</div>`;
    this.statusEl = document.createElement('div');
    this.statusEl.style.fontSize = '12px';
    this.statusEl.style.opacity = '0.8';
    this.statusEl.textContent = 'Battle in progress...';
    center.appendChild(this.statusEl);

    // Neutral count
    this.neutralEl = document.createElement('div');
    this.neutralEl.style.cssText = 'font-size:11px;opacity:0.6;margin-top:4px';
    center.appendChild(this.neutralEl);

    // Right: Orc score
    const right = document.createElement('div');
    right.style.cssText = 'text-align:right;pointer-events:auto';
    right.innerHTML = `<span style="color:#d94a4a;font-size:20px;font-weight:bold">HORDE 💀</span><br>`;
    this.orcEl = document.createElement('span');
    this.orcEl.textContent = '0 / 0';
    right.appendChild(this.orcEl);

    this.container.appendChild(left);
    this.container.appendChild(center);
    this.container.appendChild(right);

    // Exit button (bottom-left)
    const exitBtn = document.createElement('button');
    exitBtn.textContent = '← Back to Menu';
    Object.assign(exitBtn.style, {
      position: 'fixed', bottom: '20px', left: '20px',
      padding: '10px 20px', fontSize: '14px',
      background: 'rgba(0,0,0,0.7)', color: '#fff',
      border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px',
      cursor: 'pointer', zIndex: '1001',
      transition: 'background 0.2s',
    });
    exitBtn.addEventListener('mouseenter', () => exitBtn.style.background = 'rgba(200,50,50,0.8)');
    exitBtn.addEventListener('mouseleave', () => exitBtn.style.background = 'rgba(0,0,0,0.7)');
    exitBtn.addEventListener('click', () => this.onExit?.());
    this.container.appendChild(exitBtn);

    document.body.appendChild(this.container);
  }

  updateScores(counts: Record<Faction, { alive: number; total: number }>): void {
    this.crusaderEl.textContent = `${counts.crusader.alive} / ${counts.crusader.total} alive`;
    this.orcEl.textContent = `${counts.orc.alive} / ${counts.orc.total} alive`;
    this.neutralEl.textContent = `Neutrals: ${counts.neutral.alive} / ${counts.neutral.total}`;

    // Status message
    if (counts.crusader.alive === 0 && counts.orc.alive > 0) {
      this.statusEl.textContent = '💀 HORDE VICTORY!';
      this.statusEl.style.color = '#d94a4a';
    } else if (counts.orc.alive === 0 && counts.crusader.alive > 0) {
      this.statusEl.textContent = '⚔ CRUSADER VICTORY!';
      this.statusEl.style.color = '#4a90d9';
    } else {
      this.statusEl.textContent = 'Battle in progress...';
      this.statusEl.style.color = '#fff';
    }
  }

  dispose(): void {
    this.container.remove();
  }
}
