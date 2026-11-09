/**
 * Google sign-in with the Google Identity Services *token* flow: no backend, no refresh tokens.
 * Scope is `drive.file` only: the app can see files it created or that you pick in Google Picker.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
export const API_KEY = (import.meta.env.VITE_GOOGLE_API_KEY as string | undefined) ?? '';
export const APP_ID = (import.meta.env.VITE_GOOGLE_APP_ID as string | undefined) ?? '';

export const googleConfigured = !!CLIENT_ID;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(opts?: { prompt?: string; login_hint?: string }): void;
  callback: (r: TokenResponse) => void;
  error_callback?: (e: { type: string; message?: string }) => void;
}

interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient(cfg: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type: string; message?: string }) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
      hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleGlobal;
  }
}

export interface StoredToken {
  accessToken: string;
  expiresAt: number;
  email?: string;
}

const TOKEN_KEY = 'rc-gtoken';
const CONNECTED_KEY = 'rc-gconnected';

const scripts = new Map<string, Promise<void>>();
export function loadScript(src: string): Promise<void> {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
          scripts.delete(src);
          reject(new Error(`Could not load ${src}`));
        };
        document.head.appendChild(s);
      }),
    );
  }
  return scripts.get(src)!;
}

let client: TokenClient | null = null;
let token: StoredToken | null = readStored();

function readStored(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    const t = raw ? (JSON.parse(raw) as StoredToken) : null;
    return t && t.expiresAt > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}

function store(t: StoredToken | null) {
  token = t;
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function wasConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_KEY) === '1';
  } catch {
    return false;
  }
}

function setConnected(v: boolean) {
  try {
    if (v) localStorage.setItem(CONNECTED_KEY, '1');
    else localStorage.removeItem(CONNECTED_KEY);
  } catch {
    /* ignore */
  }
}

export function currentToken(): StoredToken | null {
  if (token && token.expiresAt > Date.now() + 60_000) return token;
  return null;
}

export class NeedsSignIn extends Error {
  constructor() {
    super('Google session expired. Reconnect to keep syncing.');
  }
}

/** Must be called from a user gesture (it opens Google's consent popup). */
export async function requestToken(opts: { prompt?: '' | 'consent' | 'select_account'; hint?: string } = {}): Promise<StoredToken> {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID is not configured');
  await loadScript('https://accounts.google.com/gsi/client');
  const g = window.google!;
  return new Promise((resolve, reject) => {
    client = g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new Error(r.error_description || r.error || 'Sign-in failed'));
          return;
        }
        // Google's consent screen lets people untick individual permissions.
        if (!g.accounts.oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) {
          reject(new Error('TexChef needs the Google Drive permission to sync. Connect again and leave it ticked.'));
          return;
        }
        const t: StoredToken = { accessToken: r.access_token, expiresAt: Date.now() + r.expires_in * 1000, email: opts.hint ?? token?.email };
        store(t);
        setConnected(true);
        resolve(t);
      },
      error_callback: (e) =>
        reject(new Error(e.type === 'popup_closed' ? 'Sign-in window was closed' : e.type === 'popup_failed_to_open' ? 'The sign-in popup was blocked. Allow popups for this site.' : e.message || e.type || 'Sign-in was cancelled')),
    });
    client.requestAccessToken({ prompt: opts.prompt ?? '', login_hint: opts.hint });
  });
}

export async function getAccessToken(): Promise<string> {
  const t = currentToken();
  if (t) return t.accessToken;
  throw new NeedsSignIn();
}

export function rememberEmail(email: string) {
  if (token) store({ ...token, email });
}

export function signOut() {
  const t = token;
  store(null);
  setConnected(false);
  if (t && window.google) window.google.accounts.oauth2.revoke(t.accessToken);
}
