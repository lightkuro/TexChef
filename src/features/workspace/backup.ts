/**
 * Exports and the TexChef backup format.
 *
 * A backup is an ordinary folder tree of LaTeX projects, exactly as they are in TexChef (nothing is
 * added to or changed in the documents), plus a `.texchef/` folder with everything else: document
 * details (folders, colors, tags, variant links and choices), the full version history, drafts not
 * yet saved as versions, previews, empty folders and map positions. Importing it into an empty
 * TexChef restores everything; edits made to the readable files outside TexChef come in as changes.
 */
import { zipSync } from 'fflate';
import { db, repo } from '@/app/repo';
import type { Commit, DocMeta, WorkFile } from '@/core/model';
import { isTextPath } from '@/core/model';
import type { FileMap } from '@/core/repo';
import { decodeText, encodeText, sha256 } from '@/core/hash';
import { downloadBlob, safeFilename } from '@/lib/utils';
import { renderThumbnail } from '@/compile/pdf';
import { useEmptyFolders } from '@/features/folders/folders';
import { inFolder } from '@/features/folders/folderTree';
import { useMapPositions } from '@/features/graph/positions';
import { makePreviews } from './previews';
import { BACKUP_DIR, readablePaths } from './readablePaths';

export { BACKUP_DIR, readablePaths };

const MANIFEST = `${BACKUP_DIR}/backup.json`;
const COMMITS = `${BACKUP_DIR}/commits.json`;

export interface BackupManifest {
  format: 'texchef-backup';
  version: 1;
  createdAt: number;
  /** Folder the backup was made from (null: everything). */
  scope: string | null;
  docs: DocMeta[];
  /** Where each document's files are in the backup. */
  paths: Record<string, string>;
  work: { docId: string; baseCommitId: string | null; dirty: boolean; updatedAt: number; files: Record<string, { kind: 'text' | 'binary'; hash: string; size: number }> }[];
  previews: { docId: string; pages: number; compiledAt: number }[];
  emptyFolders: string[];
  mapPositions?: unknown;
}

type Files = Record<string, Uint8Array>;

const stamp = () => new Date().toISOString().slice(0, 10);

async function fileBytes(f: WorkFile): Promise<Uint8Array> {
  return f.kind === 'text' ? encodeText(f.text) : ((await repo.getBlob(f.hash)) ?? new Uint8Array());
}

/** The LaTeX projects of some documents as files in folders (what is in TexChef now, drafts included). */
export async function sourceFiles(docs: DocMeta[]): Promise<{ files: Files; paths: Record<string, string> }> {
  const paths = readablePaths(docs);
  const files: Files = {};
  for (const d of docs) {
    const work = await repo.getWork(d.id);
    for (const [p, f] of Object.entries(work.files)) files[`${paths[d.id]}/${p}`] = await fileBytes(f);
  }
  return { files, paths };
}

/** PDFs of some documents in their folders, compiling the ones that are missing or out of date first. */
export async function pdfFiles(docs: DocMeta[]): Promise<{ files: Files; missing: DocMeta[] }> {
  await makePreviews(docs, { quiet: true });
  const paths = readablePaths(docs);
  const files: Files = {};
  const missing: DocMeta[] = [];
  for (const d of docs) {
    const p = await db.previews.get(d.id);
    if (p) files[`${paths[d.id]}.pdf`] = p.pdf;
    else missing.push(d);
  }
  return { files, missing };
}

/** Commits reachable from the documents (their whole history, across originals). */
async function historyOf(docs: DocMeta[], extraHeads: (string | null | undefined)[]): Promise<Commit[]> {
  const seen = new Map<string, Commit>();
  const stack = [...docs.flatMap((d) => [d.head, ...(d.divergedHeads ?? []), d.parent?.baseCommitId]), ...extraHeads].filter((x): x is string => !!x);
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    const c = await db.commits.get(id);
    if (!c) continue;
    seen.set(id, c);
    stack.push(...c.parents);
  }
  return [...seen.values()].sort((a, b) => a.createdAt - b.createdAt);
}

/** Everything in a backup of these documents, as paths → bytes. */
export async function backupFiles(docs: DocMeta[], scope: string | null): Promise<Files> {
  const { files, paths } = await sourceFiles(docs);
  const work: BackupManifest['work'] = [];
  const blobs = new Set<string>();
  for (const d of docs) {
    const w = await repo.getWork(d.id);
    const entry: BackupManifest['work'][number] = { docId: d.id, baseCommitId: w.baseCommitId, dirty: w.dirty, updatedAt: w.updatedAt, files: {} };
    for (const [p, f] of Object.entries(w.files)) {
      if (f.kind === 'text') {
        const data = encodeText(f.text);
        const hash = await sha256(data);
        entry.files[p] = { kind: 'text', hash, size: data.byteLength };
        files[`${BACKUP_DIR}/blobs/${hash}`] = data;
      } else {
        entry.files[p] = { kind: 'binary', hash: f.hash, size: f.size };
        blobs.add(f.hash);
      }
    }
    work.push(entry);
  }
  const commits = await historyOf(docs, work.map((w) => w.baseCommitId));
  for (const c of commits) Object.values(c.tree).forEach((h) => blobs.add(h));
  for (const h of blobs) {
    if (files[`${BACKUP_DIR}/blobs/${h}`]) continue;
    const b = await db.blobs.get(h);
    if (b) files[`${BACKUP_DIR}/blobs/${h}`] = b.data;
  }
  const previews: BackupManifest['previews'] = [];
  for (const d of docs) {
    const p = await db.previews.get(d.id);
    if (!p) continue;
    files[`${BACKUP_DIR}/previews/${d.id}.pdf`] = p.pdf;
    previews.push({ docId: d.id, pages: p.pages, compiledAt: p.compiledAt });
  }
  const empty = useEmptyFolders.getState().list.filter((f) => (scope ? inFolder(f, scope) : true));
  const manifest: BackupManifest = {
    format: 'texchef-backup',
    version: 1,
    createdAt: Date.now(),
    scope,
    docs: docs.map(({ divergedHeads, ...d }) => ({ ...d, ...(divergedHeads?.length ? { divergedHeads } : {}) })),
    paths,
    work,
    previews,
    emptyFolders: empty,
    mapPositions: useMapPositions.getState().saved,
  };
  files[MANIFEST] = encodeText(JSON.stringify(manifest, null, 1));
  files[COMMITS] = encodeText(JSON.stringify(commits.map(({ synced: _s, ...c }) => (void _s, c))));
  files[`${BACKUP_DIR}/README.txt`] = encodeText(
    [
      'TexChef backup',
      '',
      'The folders next to this one are your LaTeX projects, unchanged; they compile like any other.',
      'This folder holds what TexChef adds: version history, document details, drafts, previews.',
      'To restore, upload the .zip (or this whole folder) on the TexChef home page.',
      'If you edit the projects outside TexChef, the edits come in as changes when you restore.',
      '',
    ].join('\n'),
  );
  return files;
}

export function zipBytes(files: Files): Uint8Array {
  return zipSync(files, { level: 6 });
}

export function downloadZip(files: Files, name: string) {
  downloadBlob(zipBytes(files), `${safeFilename(name)}.zip`, 'application/zip');
}

export const canWriteFolders = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Write files into a new folder `name` inside a folder the user picks. Returns false if they cancel. */
export async function saveToFolder(files: Files, name: string): Promise<boolean> {
  type Dir = { getDirectoryHandle(n: string, o?: { create?: boolean }): Promise<Dir>; getFileHandle(n: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(d: BlobPart): Promise<void>; close(): Promise<void> }> }> };
  let root: Dir;
  try {
    root = await (window as unknown as { showDirectoryPicker(o: object): Promise<Dir> }).showDirectoryPicker({ mode: 'readwrite', id: 'texchef-export' });
  } catch {
    return false;
  }
  const top = await root.getDirectoryHandle(safeFilename(name), { create: true });
  const dirs = new Map<string, Dir>([['', top]]);
  const dirFor = async (path: string): Promise<Dir> => {
    if (dirs.has(path)) return dirs.get(path)!;
    const i = path.lastIndexOf('/');
    const parent = await dirFor(i < 0 ? '' : path.slice(0, i));
    const d = await parent.getDirectoryHandle(path.slice(i + 1), { create: true });
    dirs.set(path, d);
    return d;
  };
  for (const [path, data] of Object.entries(files)) {
    const i = path.lastIndexOf('/');
    const dir = await dirFor(i < 0 ? '' : path.slice(0, i));
    const w = await (await dir.getFileHandle(path.slice(i + 1), { create: true })).createWritable();
    await w.write(data as BlobPart);
    await w.close();
  }
  return true;
}

export const backupName = (scope: string | null) => `TexChef backup${scope ? ` - ${scope.split('/').pop()}` : ''} ${stamp()}`;

// ---------------------------------------------------------------------------------------------
// Restore

export function isBackup(entries: Files): boolean {
  return MANIFEST in entries;
}

export interface RestorePlan {
  manifest: BackupManifest;
  entries: Files;
  versions: number;
  /** Documents already in this TexChef (their history is added; what is here is kept). */
  existing: DocMeta[];
}

export async function readBackup(entries: Files): Promise<RestorePlan> {
  const manifest = JSON.parse(decodeText(entries[MANIFEST])) as BackupManifest;
  if (manifest.format !== 'texchef-backup') throw new Error('This is not a TexChef backup.');
  const commits = entries[COMMITS] ? (JSON.parse(decodeText(entries[COMMITS])) as unknown[]).length : 0;
  const existing: DocMeta[] = [];
  for (const d of manifest.docs) {
    const here = await db.docs.get(d.id);
    if (here && !here.deleted) existing.push(here);
  }
  return { manifest, entries, versions: commits, existing };
}

/** The readable files of each document in the backup (each file goes to the document whose folder holds it). */
function readableByDoc(manifest: BackupManifest, entries: Files): Map<string, Files> {
  const roots = Object.entries(manifest.paths).sort((a, b) => b[1].length - a[1].length);
  const out = new Map<string, Files>();
  for (const [path, data] of Object.entries(entries)) {
    if (path.startsWith(`${BACKUP_DIR}/`)) continue;
    const hit = roots.find(([, r]) => path.startsWith(r + '/'));
    if (!hit) continue;
    const files = out.get(hit[0]) ?? out.set(hit[0], {}).get(hit[0])!;
    files[path.slice(hit[1].length + 1)] = data;
  }
  return out;
}

export interface RestoreResult {
  added: number;
  merged: number;
  /** Documents whose readable files were changed outside TexChef (the changes are now drafts). */
  editedOutside: string[];
}

export async function restoreBackup(plan: RestorePlan): Promise<RestoreResult> {
  const { manifest, entries } = plan;
  // History first: blobs, then commits, so nothing points at missing data.
  for (const [path, data] of Object.entries(entries)) {
    if (!path.startsWith(`${BACKUP_DIR}/blobs/`)) continue;
    const hash = path.slice(`${BACKUP_DIR}/blobs/`.length);
    if (!(await db.blobs.get(hash))) await db.blobs.put({ hash, data, size: data.byteLength, synced: 0 });
  }
  const commits = entries[COMMITS] ? (JSON.parse(decodeText(entries[COMMITS])) as Commit[]) : [];
  for (const c of commits) if (!(await db.commits.get(c.id))) await db.commits.put({ ...c, synced: 0 });

  const readable = readableByDoc(manifest, entries);
  const blobText = async (hash: string) => decodeText((await db.blobs.get(hash))?.data ?? new Uint8Array());
  const result: RestoreResult = { added: 0, merged: 0, editedOutside: [] };

  for (const doc of manifest.docs) {
    const w = manifest.work.find((x) => x.docId === doc.id);
    // The draft as it was in the backup…
    const saved: FileMap = {};
    for (const [p, f] of Object.entries(w?.files ?? {})) {
      saved[p] = f.kind === 'text' ? { kind: 'text', text: await blobText(f.hash) } : { kind: 'binary', hash: f.hash, size: f.size };
    }
    // …or the readable files, if they were edited since.
    let files = saved;
    let edited = false;
    const r = readable.get(doc.id);
    if (r && w) {
      const outside: FileMap = {};
      for (const [p, data] of Object.entries(r)) {
        if (isTextPath(p)) outside[p] = { kind: 'text', text: decodeText(data) };
        else {
          const hash = await sha256(data);
          if (!(await db.blobs.get(hash))) await db.blobs.put({ hash, data, size: data.byteLength, synced: 0 });
          outside[p] = { kind: 'binary', hash, size: data.byteLength };
        }
      }
      const same = (a: WorkFile | undefined, b: WorkFile | undefined) =>
        !!a && !!b && (a.kind === 'text' && b.kind === 'text' ? a.text === b.text : a.kind === 'binary' && b.kind === 'binary' && a.hash === b.hash);
      const keys = new Set([...Object.keys(saved), ...Object.keys(outside)]);
      edited = [...keys].some((k) => !same(saved[k], outside[k]));
      if (edited) {
        files = outside;
        result.editedOutside.push(doc.name);
      }
    }

    const here = await db.docs.get(doc.id);
    if (!here || here.deleted) {
      await db.docs.put({ ...doc, deleted: undefined });
      await db.work.put({
        docId: doc.id,
        files,
        baseCommitId: w?.baseCommitId ?? doc.head,
        dirty: edited || (w?.dirty ?? false),
        updatedAt: edited ? Date.now() : (w?.updatedAt ?? Date.now()),
      });
      result.added++;
    } else {
      // Already here: keep it, and bring in the backup's history.
      if (doc.head && here.head !== doc.head) {
        const localWork = await db.work.get(doc.id);
        if (!here.head || ((await repo.isAncestor(here.head, doc.head)) && !localWork?.dirty)) {
          await db.docs.update(doc.id, { head: doc.head });
          await db.work.put({ docId: doc.id, files, baseCommitId: doc.head, dirty: edited, updatedAt: Date.now() });
        } else if (!(await repo.isAncestor(doc.head, here.head))) {
          await db.docs.update(doc.id, { divergedHeads: [...new Set([...(here.divergedHeads ?? []), doc.head])] });
        }
      }
      result.merged++;
    }

    const pdf = entries[`${BACKUP_DIR}/previews/${doc.id}.pdf`];
    if (pdf && !(await db.previews.get(doc.id))) {
      const meta = manifest.previews.find((p) => p.docId === doc.id);
      const thumb = await renderThumbnail(pdf).catch(() => undefined);
      await db.previews.put({ key: doc.id, pdf, pages: thumb?.pages ?? meta?.pages ?? 0, thumbnail: thumb?.thumbnail, compiledAt: meta?.compiledAt ?? Date.now() });
    }
  }

  const empty = useEmptyFolders.getState();
  empty.set([...new Set([...empty.list, ...manifest.emptyFolders])]);
  const pos = manifest.mapPositions as { horizontal?: Record<string, { x: number; y: number }>; vertical?: Record<string, { x: number; y: number }> } | undefined;
  if (pos) {
    const mp = useMapPositions.getState();
    for (const dir of ['horizontal', 'vertical'] as const) {
      const missing = Object.fromEntries(Object.entries(pos[dir] ?? {}).filter(([id]) => !(id in mp.saved[dir])));
      if (Object.keys(missing).length) mp.save(dir, missing);
    }
  }
  repo.notifyChanged();
  return result;
}
