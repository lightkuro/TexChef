import { create } from 'zustand';
import { toast } from 'sonner';
import { repo, db } from '@/app/repo';
import { SyncEngine } from '@/storage/sync/engine';
import { DriveProvider } from '@/storage/providers/gdrive';
import { getAccessToken, googleConfigured, lastEmail, NeedsSignIn, preloadGoogle, rememberEmail, renewQuietly, requestToken, signOut, wasConnected, currentToken } from '@/features/auth/google';
import { decodeText } from '@/core/hash';
import { encodeText } from '@/core/hash';
import type { DocMeta } from '@/core/model';
import { usePrefs } from '@/app/prefs';
import { buildAgentsReadme, type ReadmeDoc } from '@/features/agents/readme';

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

/** Things looked for in Drive and not found, so the same search isn't repeated at once. */
const notFound = new Map<string, number>();
const triedLately = (key: string) => {
  const at = notFound.get(key);
  if (at && Date.now() - at < 60_000) return true;
  notFound.set(key, Date.now());
  return false;
};

function ensureEngine() {
  if (!provider) {
    provider = new DriveProvider(getAccessToken);
    engine = new SyncEngine(repo, provider);
    engine.mode = usePrefs.getState().driveData;
    // A file that is asked for but not on this device: bigger files are stored one by one; a small one that
    // isn't here sits inside a pack this device has not read yet.
    repo.blobFetcher = async (hash) => {
      try {
        const data = await provider!.readBlob(hash);
        if (data || triedLately(`b:${hash}`)) return data;
        await engine!.loadEverything();
        return (await db.blobs.get(hash))?.data;
      } catch {
        return undefined;
      }
    };
    // A version that is asked for but not here: a document's current version comes from its own small file;
    // anything older means reading the history.
    repo.commitFetcher = async (id) => {
      const st = useSync.getState().state;
      if (st === 'local' || st === 'needs-signin' || triedLately(`c:${id}`)) return;
      try {
        const doc = (await db.docs.toArray()).find((d) => d.head === id);
        if (doc && (await engine!.fetchHead(doc.id, id))) return;
        await engine!.loadEverything();
      } catch (e) {
        console.warn('Could not fetch a version from Drive', e);
      }
    };
  }
  return { provider: provider!, engine: engine! };
}

/** Whether this device may be missing older versions that are in Drive. */
export function historyIsPartial(): boolean {
  return useSync.getState().state !== 'local' && usePrefs.getState().driveData !== 'all';
}

/** Bring these documents' older versions to this device (and keep them current from now on). */
export async function ensureHistory(docIds: string[]): Promise<void> {
  const st = useSync.getState().state;
  if (st !== 'idle' && st !== 'syncing') return;
  if (!historyIsPartial() || docIds.length === 0) return;
  await ensureEngine().engine.followDocs(docIds);
}

/** Bring every version of every document to this device, once. */
export async function loadAllHistory(): Promise<number> {
  const st = useSync.getState().state;
  if (st !== 'idle' && st !== 'syncing') return 0;
  return ensureEngine().engine.loadEverything();
}

/** The Drive setting changed (Settings → Google Drive). */
export function driveDataChanged() {
  if (engine) engine.mode = usePrefs.getState().driveData;
  void syncNow();
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
      engine.mode = usePrefs.getState().driveData;
      const report = await engine.sync();
      await mirrorChanged(report.pushedDocs);
      syncedThisTab = true;
      useSync.getState().set({ state: 'idle', lastSync: Date.now() });
      if ((await db.commits.where('synced').equals(0).count()) === 0) unsaved = false;
      if (report.diverged.length) {
        toast.warning('A document was edited on another device too. Open it to combine the changes.');
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

/**
 * Keep a human-readable copy (files + latest PDF) of each document's head in Drive. Only the device that made a
 * version writes its copy, and only the files that changed are sent (the PDF only when it was compiled again).
 */
async function mirrorChanged(pushed: string[]) {
  const { provider } = ensureEngine();
  const done = (await db.getMeta<Record<string, string>>('mirror.heads')) ?? {};
  const mirrored = (await db.getMeta<Record<string, { base: string; files: string[] }>>('mirror.commits')) ?? {};
  const sent = (await db.getMeta<Record<string, { files: Record<string, string>; pdf?: number }>>('mirror.sent')) ?? {};
  const pending = new Set([...((await db.getMeta<string[]>('mirror.pending')) ?? []), ...pushed]);
  const saver = usePrefs.getState().driveData === 'saver';
  const docs = (await db.docs.toArray()).filter((d) => !d.deleted && d.head);
  for (const d of docs) {
    if (d.remoteOnly) continue;
    const head = await db.commits.get(d.head!);
    if (!head || head.kind === 'auto') continue;
    const key = `${d.head}|${d.name}`;
    const was = done[d.id];
    // (Earlier versions of the app also put the time of the last compile in this record.)
    if (was === key || was?.startsWith(`${key}|`)) {
      mirrored[d.id] ??= { base: d.head!, files: Object.keys(head.tree) };
      pending.delete(d.id);
      continue;
    }
    const renamed = !!was?.startsWith(`${d.head}|`);
    if (!pending.has(d.id) && !renamed) {
      // Another device made this version, and writes its copy. What this device last sent no longer says what is there.
      delete sent[d.id];
      mirrored[d.id] = { base: d.head!, files: Object.keys(head.tree) };
      done[d.id] = key;
      continue;
    }
    const prev = sent[d.id];
    const keep = new Set<string>();
    const files: Record<string, Uint8Array> = {};
    for (const [path, hash] of Object.entries(head.tree)) {
      if (prev?.files[path] === hash) {
        keep.add(path);
        continue;
      }
      const data = await repo.getBlob(hash);
      if (data) files[path] = path.endsWith('.tex') ? encodeText(decodeText(data)) : data;
    }
    const preview = await db.previews.get(d.id);
    // Data saver leaves the PDF out: it is the biggest part, and can be made again from the source.
    const pdf = preview?.pdf && !saver && preview.compiledAt !== prev?.pdf ? preview.pdf : undefined;
    if (!pdf && prev?.pdf) keep.add(DriveProvider.PDF);
    try {
      await provider.mirror(d, files, pdf, keep);
      done[d.id] = key;
      mirrored[d.id] = { base: d.head!, files: Object.keys(head.tree) };
      sent[d.id] = { files: { ...head.tree }, pdf: pdf ? preview!.compiledAt : prev?.pdf };
      pending.delete(d.id);
    } catch (e) {
      console.warn('Mirror failed', e);
    }
  }
  await db.setMeta('mirror.heads', done);
  await db.setMeta('mirror.commits', mirrored);
  await db.setMeta('mirror.sent', sent);
  await db.setMeta('mirror.pending', [...pending].filter((id) => docs.some((d) => d.id === id)));
  if (usePrefs.getState().agentsEnabled) await writeAgentsReadme(provider, docs, mirrored).catch((e) => console.warn('Agents read-me failed', e));
}

/** Experimental AI agents: keep the read-me in TexChef/Agents(optional_AI) in step with the readable copies. */
async function writeAgentsReadme(provider: DriveProvider, docs: DocMeta[], mirrored: Record<string, { base: string; files: string[] }>) {
  const items: ReadmeDoc[] = [];
  for (const d of docs) {
    const m = mirrored[d.id];
    const folder = m && (await provider.docFolder(d.id));
    if (m && folder) items.push({ doc: d, base: m.base, folder: folder.name, files: m.files });
  }
  const md = buildAgentsReadme(items, docs);
  if ((await db.getMeta<string>('agents.readme')) === md) return;
  await provider.writeAgentsReadme(md);
  await db.setMeta('agents.readme', md);
}

/** Turning the experimental agents feature on writes its folder at once; off forgets the read-me. */
export async function agentsChanged(on: boolean) {
  await db.setMeta('agents.readme', undefined);
  if (on) {
    const s = useSync.getState().state;
    if (s === 'idle' || s === 'syncing') {
      await ensureEngine().provider.ensureAgentsFolder();
      await syncNow();
    }
  }
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
  const hint = useSync.getState().user?.email ?? lastEmail();
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
  repo.commitFetcher = undefined;
  useSync.getState().set({ state: 'local', user: undefined, lastSync: undefined, error: undefined });
}

// ---------- staying signed in ----------
// Google's sign-in lasts an hour and a browser-only app cannot renew it in the background. Instead it is renewed
// on the person's next click: Google's window opens inside that click, needs nothing, and closes by itself.

let syncedThisTab = false;
let unsaved = false;
let renewPausedUntil = 0;

/** On with a mouse; off by default on touch-only devices, where the "window" is a whole tab opening and closing. */
export function renewOn(): boolean {
  const pref = usePrefs.getState().driveRenew;
  if (pref !== undefined) return pref;
  return !window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function wantsRenew(): boolean {
  if (useSync.getState().state !== 'needs-signin' || !renewOn() || Date.now() < renewPausedUntil) return false;
  // A fresh visit (other devices' changes are waiting), or there is something of ours to save.
  return !syncedThisTab || unsaved;
}

function renewOnClick(e: MouseEvent) {
  if (!e.isTrusted || !wantsRenew()) return;
  // Buttons that connect or sync do their own sign-in.
  if ((e.target as Element | null)?.closest?.('[data-sync]')) return;
  const p = renewQuietly(lastEmail());
  if (!p) return preloadGoogle();
  p.then(
    () => {
      useSync.getState().set({ state: 'idle', error: undefined });
      toast('Drive resynced', { duration: 3000, id: 'drive-resynced' });
      void syncNow();
    },
    () => {
      // Google needs the person (signed out, access withdrawn): don't flash a failing window on every click.
      renewPausedUntil = Date.now() + 15 * 60_000;
    },
  );
}

/** Less background traffic: data saver, or a browser that asks for reduced data use. */
function lightTraffic(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return usePrefs.getState().driveData === 'saver' || !!conn?.saveData;
}

let started = false;
/** Wire automatic sync: after commits, on focus, and every minute while visible. */
export function startSyncLoop() {
  if (started) return;
  started = true;
  repo.on('commit', () => {
    unsaved = true;
    scheduleSync(4000);
  });
  repo.on('index', () => scheduleSync(6000));
  window.addEventListener('focus', () => scheduleSync(500));
  // Look for other devices' changes every minute while the page is in view; with data saver, only when
  // coming back to the page, after a save, or on Sync now.
  setInterval(() => {
    if (document.visibilityState === 'visible' && !lightTraffic()) void syncNow();
  }, 60_000);
  if (wasConnected() && renewOn()) preloadGoogle();
  document.addEventListener('click', renewOnClick, true);
  if (useSync.getState().state === 'idle') {
    const { provider } = ensureEngine();
    void provider
      .userInfo()
      .then((user) => useSync.getState().set({ user }))
      .catch(() => undefined);
    void syncNow();
  }
}
