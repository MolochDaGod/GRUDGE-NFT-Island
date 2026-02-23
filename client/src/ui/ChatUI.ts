// ═══════════════════════════════════════════════════════════════════
// CHAT UI — Persistent in-game chat
//
// Bottom-left chat box. Press Enter to focus input. Messages sent
// via MessageType.CHAT, received as MessageType.CHAT_MSG.
// Old messages auto-fade after 10 seconds (unless input is focused).
// ═══════════════════════════════════════════════════════════════════

import { SCREEN, type UIScreen } from './UIManager.js';

// ── CSS ───────────────────────────────────────────────────────────

const CSS = `
#chat-ui {
  position: absolute; bottom: 16px; left: 16px; width: 340px;
  z-index: 30; font-family: 'Segoe UI', sans-serif;
  pointer-events: none;
}

#chat-messages {
  max-height: 180px; overflow: hidden; padding: 4px 0;
}

.chat-msg {
  font-size: 12px; line-height: 1.5; color: rgba(255,255,255,0.85);
  text-shadow: 0 1px 3px rgba(0,0,0,0.9);
  padding: 1px 0;
  animation: chat-fade 10s forwards;
}
.chat-msg.system { color: #d4a843; }
.chat-msg.persistent { animation: none; }

@keyframes chat-fade {
  0% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
}

#chat-input-row {
  display: none; margin-top: 4px; pointer-events: auto;
}
#chat-input-row.active { display: flex; }

#chat-input {
  flex: 1; padding: 8px 12px; border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(0,0,0,0.7); color: #eee; font-size: 13px;
  outline: none;
}
#chat-input:focus { border-color: #d4a843; }
#chat-input::placeholder { color: #666; }

#chat-send {
  padding: 8px 14px; border-radius: 6px; border: none;
  background: #d4a843; color: #000; font-weight: 600;
  font-size: 13px; cursor: pointer; margin-left: 4px;
}
#chat-send:hover { background: #e4b853; }
`;

// ── ChatUI ────────────────────────────────────────────────────────

export class ChatUI implements UIScreen {
  readonly id = SCREEN.CHAT;
  /** Chat is NOT modal — it doesn't block game input (except keyboard when focused) */
  readonly modal = false;

  private root: HTMLDivElement | null = null;
  private messagesEl: HTMLDivElement | null = null;
  private inputRow: HTMLDivElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private _focused = false;

  private sendFn: ((text: string) => void) | null = null;

  /** Is the chat input currently focused? */
  get focused(): boolean { return this._focused; }

  /** Set the function to call when the user sends a message */
  setSendFn(fn: (text: string) => void): void {
    this.sendFn = fn;
  }

  show(): void {
    if (this.root) return;

    this.styleEl = document.createElement('style');
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);

    this.root = document.createElement('div');
    this.root.id = 'chat-ui';

    this.root.innerHTML = `
      <div id="chat-messages"></div>
      <div id="chat-input-row">
        <input id="chat-input" type="text" placeholder="Type a message..." maxlength="200" autocomplete="off">
        <button id="chat-send">Send</button>
      </div>
    `;

    this.messagesEl = this.root.querySelector('#chat-messages')!;
    this.inputRow = this.root.querySelector('#chat-input-row')!;
    this.inputEl = this.root.querySelector('#chat-input')!;

    // Send on Enter or button click
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.send();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.blur();
      }
      // Stop all key events from propagating to game input
      e.stopPropagation();
    });

    this.root.querySelector('#chat-send')?.addEventListener('click', () => this.send());

    // Track focus state
    this.inputEl.addEventListener('focus', () => { this._focused = true; });
    this.inputEl.addEventListener('blur', () => {
      this._focused = false;
      this.inputRow!.classList.remove('active');
    });

    document.body.appendChild(this.root);

    // System welcome message
    this.addMessage('Welcome to Grudge Warlords!', 'system');
  }

  hide(): void {
    this.blur();
    // Don't destroy — chat stays visible, just unfocus
  }

  destroy(): void {
    this.root?.remove();
    this.root = null;
    this.messagesEl = null;
    this.inputRow = null;
    this.inputEl = null;
    this.styleEl?.remove();
    this.styleEl = null;
  }

  /** Focus the chat input (called when Enter is pressed) */
  focus(): void {
    if (!this.inputRow || !this.inputEl) return;
    this.inputRow.classList.add('active');
    this.inputEl.focus();
    this._focused = true;

    // Make all messages persistent (no fade) while input is open
    this.messagesEl?.querySelectorAll('.chat-msg').forEach((el) => {
      el.classList.add('persistent');
    });
  }

  /** Unfocus the chat input */
  blur(): void {
    if (!this.inputEl) return;
    this.inputEl.blur();
    this._focused = false;
    this.inputRow?.classList.remove('active');

    // Re-enable fade on messages
    this.messagesEl?.querySelectorAll('.chat-msg.persistent').forEach((el) => {
      el.classList.remove('persistent');
    });
  }

  /** Toggle focus */
  toggleFocus(): void {
    if (this._focused) this.blur();
    else this.focus();
  }

  /** Add a message to the chat log */
  addMessage(text: string, type: 'player' | 'system' | 'other' = 'other', sender?: string): void {
    if (!this.messagesEl) return;

    const line = document.createElement('div');
    line.className = `chat-msg ${type}`;

    if (sender) {
      line.innerHTML = `<strong style="color:#d4a843">${this.escapeHtml(sender)}</strong>: ${this.escapeHtml(text)}`;
    } else {
      line.textContent = text;
    }

    this.messagesEl.appendChild(line);

    // Auto-trim old messages
    while (this.messagesEl.children.length > 50) {
      this.messagesEl.removeChild(this.messagesEl.children[0]);
    }

    // Auto-scroll
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private send(): void {
    if (!this.inputEl) return;
    const text = this.inputEl.value.trim();
    if (!text) { this.blur(); return; }

    this.inputEl.value = '';
    this.sendFn?.(text);
    this.blur();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
