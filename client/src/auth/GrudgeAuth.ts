// ═══════════════════════════════════════════════════════════════════
// GRUDGE ID — Authentication Service
//
// Grudge Studio's identity layer powered by Puter.js.
// Players sign in via Puter SSO, which creates/loads their Grudge ID
// profile stored in puter.kv (class, faction, display name, etc.).
//
// Auth flow:
//   1. Try silent Puter SSO (auto-login if session exists)
//   2. If no session → show auth screen (Puter sign-in / guest)
//   3. On Puter sign-in → load or create Grudge ID profile from KV
//   4. Exchange Puter identity for a Grudge API token (server auth)
//   5. Pass token + profile to GameServer on JOIN
//
// Guest mode skips Puter entirely — no persistence, random name.
// ═══════════════════════════════════════════════════════════════════

// ── Puter.js global type shim ─────────────────────────────────────

interface PuterUser {
  uuid: string;
  username: string;
  email?: string;
}

interface PuterAuth {
  signIn(): Promise<void>;
  signOut(): void;
  isSignedIn(): boolean;
  getUser(): Promise<PuterUser>;
}

interface PuterKV {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
}

interface PuterGlobal {
  auth: PuterAuth;
  kv: PuterKV;
}

declare const puter: PuterGlobal | undefined;

// ── Grudge ID Profile ─────────────────────────────────────────────

export interface GrudgeProfile {
  /** Unique Grudge ID (matches Puter UUID when linked) */
  grudgeId: string;
  /** Display name shown in-game */
  displayName: string;
  /** Puter username (empty for guests) */
  puterUsername: string;
  /** Player class (set during character creation) */
  playerClass: string;
  /** Player race (set during character creation) */
  race: string;
  /** Faction affiliation */
  faction: string;
  /** Character level */
  level: number;
  /** ISO timestamp of profile creation */
  createdAt: string;
  /** ISO timestamp of last login */
  lastLogin: string;
}

function createDefaultProfile(grudgeId: string, displayName: string, puterUsername = ''): GrudgeProfile {
  const now = new Date().toISOString();
  return {
    grudgeId,
    displayName,
    puterUsername,
    playerClass: '',
    race: '',
    faction: '',
    level: 1,
    createdAt: now,
    lastLogin: now,
  };
}

// ── Auth State ────────────────────────────────────────────────────

export type AuthMethod = 'puter' | 'credentials' | 'guest';

export interface AuthState {
  authenticated: boolean;
  method: AuthMethod;
  /** Grudge API server token (for WebSocket auth) */
  token: string;
  /** The player's Grudge ID profile */
  profile: GrudgeProfile;
}

// ── KV Keys ───────────────────────────────────────────────────────

const KV_PROFILE = 'grudge:profile';

// ── Grudge Auth Service ───────────────────────────────────────────

const GRUDGE_API = 'https://grudge-server-ambkk.puter.site';

class GrudgeAuth {
  private _state: AuthState = {
    authenticated: false,
    method: 'guest',
    token: '',
    profile: createDefaultProfile('', 'Guest'),
  };

  // ── Public State ──────────────────────────────────────────────

  get state(): Readonly<AuthState> { return this._state; }
  get authenticated(): boolean { return this._state.authenticated; }
  get profile(): Readonly<GrudgeProfile> { return this._state.profile; }
  get displayName(): string { return this._state.profile.displayName; }
  get token(): string { return this._state.token; }
  get grudgeId(): string { return this._state.profile.grudgeId; }
  get method(): AuthMethod { return this._state.method; }

  /** Is Puter.js SDK loaded and available? */
  get puterAvailable(): boolean {
    return typeof puter !== 'undefined' && !!puter?.auth;
  }

  // ── Silent Auto-Login ─────────────────────────────────────────

  /**
   * Try to auto-authenticate with an existing Puter session.
   * Call this at boot before showing the auth screen.
   * Returns true if the player was silently authenticated.
   */
  async trySilentAuth(): Promise<boolean> {
    if (!this.puterAvailable) return false;

    try {
      if (!puter!.auth.isSignedIn()) return false;

      const user = await puter!.auth.getUser();
      if (!user?.uuid) return false;

      await this.completePuterAuth(user);
      return true;
    } catch {
      // SDK loaded but no active session — that's fine
      return false;
    }
  }

  // ── Puter SSO Sign-In ─────────────────────────────────────────

  /**
   * Trigger Puter sign-in popup. Must be called from a user gesture
   * (click handler) because it opens a popup window.
   */
  async signInWithPuter(): Promise<boolean> {
    if (!this.puterAvailable) {
      console.warn('[GrudgeAuth] Puter SDK not available');
      return false;
    }

    try {
      await puter!.auth.signIn();
      const user = await puter!.auth.getUser();
      if (!user?.uuid) return false;

      await this.completePuterAuth(user);
      return true;
    } catch (e) {
      console.error('[GrudgeAuth] Puter sign-in failed:', e);
      return false;
    }
  }

  // ── Credential Login (Grudge API direct) ──────────────────────

  async loginWithCredentials(username: string, password: string): Promise<boolean> {
    try {
      const res = await fetch(`${GRUDGE_API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return false;

      const data = await res.json();
      this._state = {
        authenticated: true,
        method: 'credentials',
        token: data.token || '',
        profile: createDefaultProfile(
          data.grudgeId || username,
          username,
        ),
      };
      this._state.profile.lastLogin = new Date().toISOString();
      console.log(`[GrudgeAuth] Logged in via credentials: ${username}`);
      return true;
    } catch {
      return false;
    }
  }

  // ── Register (Grudge API direct) ──────────────────────────────

  async register(username: string, password: string): Promise<boolean> {
    try {
      const res = await fetch(`${GRUDGE_API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          puterId: this.puterAvailable ? (await this.getPuterId()) : undefined,
        }),
      });
      if (!res.ok) return false;

      // Auto-login after registration
      return this.loginWithCredentials(username, password);
    } catch {
      return false;
    }
  }

  // ── Guest Mode ────────────────────────────────────────────────

  enterGuestMode(customName?: string): void {
    const name = customName || 'Guest_' + Math.random().toString(36).slice(2, 6);
    this._state = {
      authenticated: true,
      method: 'guest',
      token: '',
      profile: createDefaultProfile(`guest_${Date.now()}`, name),
    };
    console.log(`[GrudgeAuth] Guest mode: ${name}`);
  }

  // ── Sign Out ──────────────────────────────────────────────────

  signOut(): void {
    if (this.puterAvailable && this._state.method === 'puter') {
      try { puter!.auth.signOut(); } catch { /* ok */ }
    }
    this._state = {
      authenticated: false,
      method: 'guest',
      token: '',
      profile: createDefaultProfile('', 'Guest'),
    };
    console.log('[GrudgeAuth] Signed out');
  }

  // ── Profile Persistence (Puter KV) ────────────────────────────

  /** Save the current profile to Puter KV (only works when signed in via Puter) */
  async saveProfile(): Promise<boolean> {
    if (this._state.method !== 'puter' || !this.puterAvailable) return false;

    try {
      await puter!.kv.set(KV_PROFILE, JSON.stringify(this._state.profile));
      console.log('[GrudgeAuth] Profile saved to Puter KV');
      return true;
    } catch (e) {
      console.warn('[GrudgeAuth] Failed to save profile:', e);
      return false;
    }
  }

  /** Update profile fields and auto-save if connected to Puter */
  async updateProfile(updates: Partial<GrudgeProfile>): Promise<void> {
    Object.assign(this._state.profile, updates);
    if (this._state.method === 'puter') {
      await this.saveProfile();
    }
  }

  // ── Server JOIN Payload ───────────────────────────────────────

  /** Get the data to send in the WebSocket JOIN message */
  getJoinPayload(): Record<string, unknown> {
    return {
      name: this._state.profile.displayName,
      grudgeId: this._state.profile.grudgeId,
      token: this._state.token || undefined,
      puterId: this._state.method === 'puter' ? this._state.profile.grudgeId : undefined,
      authMethod: this._state.method,
      playerClass: this._state.profile.playerClass || undefined,
      faction: this._state.profile.faction || undefined,
      level: this._state.profile.level,
    };
  }

  // ── Internal ──────────────────────────────────────────────────

  /** Complete the Puter auth flow: load profile from KV, exchange for API token */
  private async completePuterAuth(user: PuterUser): Promise<void> {
    // Load existing profile from Puter KV, or create new one
    let profile = await this.loadProfileFromKV();
    if (!profile) {
      profile = createDefaultProfile(user.uuid, user.username, user.username);
      // Save new profile to KV
      try {
        await puter!.kv.set(KV_PROFILE, JSON.stringify(profile));
      } catch { /* first-time save may fail silently */ }
    }

    // Update last login
    profile.lastLogin = new Date().toISOString();
    profile.puterUsername = user.username;

    // Try to get a Grudge API token (non-blocking — game works without it)
    let token = '';
    try {
      const res = await fetch(`${GRUDGE_API}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puterId: user.uuid, username: user.username }),
      });
      if (res.ok) {
        const data = await res.json();
        token = data.token || '';
      }
    } catch { /* API may be down — continue without token */ }

    this._state = {
      authenticated: true,
      method: 'puter',
      token,
      profile,
    };

    // Persist updated lastLogin
    this.saveProfile().catch(() => {});

    console.log(`[GrudgeAuth] ⚔ Grudge ID authenticated: ${profile.displayName} (${user.uuid.slice(0, 8)}...)`);
  }

  /** Load Grudge ID profile from Puter KV */
  private async loadProfileFromKV(): Promise<GrudgeProfile | null> {
    if (!this.puterAvailable) return null;

    try {
      const raw = await puter!.kv.get(KV_PROFILE);
      if (!raw) return null;
      return JSON.parse(raw) as GrudgeProfile;
    } catch {
      return null;
    }
  }

  /** Get the current Puter user UUID */
  private async getPuterId(): Promise<string | undefined> {
    if (!this.puterAvailable) return undefined;
    try {
      const user = await puter!.auth.getUser();
      return user?.uuid;
    } catch {
      return undefined;
    }
  }
}

// ── Singleton Export ───────────────────────────────────────────────

export const grudgeAuth = new GrudgeAuth();
