import { create } from 'zustand';
import { toast } from 'sonner';
import { repo, db } from '@/app/repo';
import { SyncEngine } from '@/storage/sync/engine';
import { DriveProvider } from '@/storage/providers/gdrive';
import { getAccessToken, googleConfigured, NeedsSignIn, rememberEmail, requestToken, signOut, wasConnected, currentToken } from '@/features/auth/google';
import { decodeText } from '@/core/hash';
import { encodeText } from '@/core/hash';

export type SyncState = 'local' | 'needs-signin' | 'idle' | 'syncing' | 'error';

interface SyncStore {
  state: SyncState;
  lastSync?: number;
  error?: string;
  user?: { name?: string; email?: string; photo?: string };
  set: (p: Partial<SyncStore>) => void;
}

export const useSync = create<SyncStore>((set) => ({
  state: wasConnected() ? (currentToken() ? 'idle' : 'needs-signin') : 'local',
  set: (p) => set(p),
}));

let provider: DriveProvider | null = null;
let engine: SyncEngine | null = null;
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function ensureEngine() {
  if (!provider) {
    provider = new DriveProvider(getAccessToken);
    engine = new SyncEngine(repo, provider);
    repo.blobFetcher = async (hash) => {
      try {
        return await provider!.readBlob(hash);
      } catch {
        return undefined;
      }
    };
  }
  return { provider: provider!, engine: engine! };
}

export function driveProvider(): DriveProvider | null {
  return useSync.getState().state === 'local' ? null : ensureEngine().provider;
}

/** Run a sync now (coalesces concurrent requests). */
export function syncNow(): Promise<void> {
  const s = useSync.getState();
  if (s.state === 'local' || s.state === 'needs-signin') return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    const { engine } = ensureEngine();
    useSync.getState().set({ state: 'syncing', error: undefined });
    try {
      const report = await engine.sync();
      await mirrorChanged();
      useSync.getState().set({ state: 'idle', lastSync: Date.now() });
      if (report.diverged.length) {
        toast.warning('A document was edited on another device too. Open it to merge the changes.');
      }
    } catch (e) {
      if (e instanceof NeedsSignIn) useSync.getState().set({ state: 'needs-signin', error: e.message });
      else useSync.getState().set({ state: 'error', error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = null;
      if (again) {
        again = false;
        void syncNow();
      }
    }
  })();
  return running;
}

/** Keep a human-readable copy (files + latest PDF) of each document's head in Drive. */
async function mirrorChanged() {
  const { provider } = ensureEngine();
  const done = (await db.getMeta<Record<string, string>>('mirror.heads')) ?? {};
  const docs = (await db.docs.toArray()).filter((d) => !d.deleted && d.head);
  for (const d of docs) {
    const head = await db.commits.get(d.head!);
    if (!head || head.kind === 'auto') continue;
    const preview = await db.previews.get(d.id);
    const key = `${d.head}|${d.name}|${preview?.compiledAt ?? 0}`;
    if (done[d.id] === key) continue;
    const files: Record<string, Uint8Array> = {};
    for (const [path, hash] of Object.entries(head.tree)) {
      const data = await repo.getBlob(hash);
      if (data) files[path] = path.endsWith('.tex') ? encodeText(decodeText(data)) : data;
    }
    try {
      await provider.mirror(d, files, preview?.pdf);
      done[d.id] = key;
    } catch (e) {
      console.warn('Mirror failed', e);
    }
  }
  await db.setMeta('mirror.heads', done);
}

export function scheduleSync(delayMs = 4000) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

/** Interactive: open Google's consent popup, then sync. */
export async function connectDrive(): Promise<void> {
  if (!googleConfigured) {
    toast.error('Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID (see README).');
    return;
  }
  const hint = useSync.getState().user?.email;
  await requestToken({ prompt: wasConnected() ? '' : 'consent', hint });
  useSync.getState().set({ state: 'idle', error: undefined });
  const { provider } = ensureEngine();
  try {
    const user = await provider.userInfo();
    useSync.getState().set({ user });
    if (user.email) rememberEmail(user.email);
  } catch {
    /* non-fatal */
  }
  await syncNow();
  if (useSync.getState().state === 'idle') toast.success('Google Drive connected');
}

export function disconnectDrive() {
  signOut();
  provider = null;
  engine = null;
  repo.blobFetcher = undefined;
  useSync.getState().set({ state: 'local', user: undefined, lastSync: undefined, error: undefined });
}

let started = false;
/** Wire automatic sync: after commits, on focus, and every minute while visible. */
export function startSyncLoop() {
  if (started) return;
  started = true;
  repo.on('commit', () => scheduleSync(4000));
  repo.on('index', () => scheduleSync(6000));
  window.addEventListener('focus', () => scheduleSync(500));
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 60_000);
  if (useSync.getState().state === 'idle') {
    const { provider } = ensureEngine();
    void provider
      .userInfo()
      .then((user) => useSync.getState().set({ user }))
      .catch(() => undefined);
    void syncNow();
  }
}
