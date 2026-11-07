import type { RCDatabase } from '@/storage/db';
import { decodeText, encodeText, newId, sha256 } from './hash';
import {
  isTextPath,
  type Commit,
  type CommitKind,
  type DocMeta,
  type Engine,
  type FileTree,
  type Hash,
  type Recipe,
  type WorkFile,
  type WorkingCopy,
} from './model';

export type FileMap = Record<string, WorkFile>;

export interface CreateDocInput {
  name: string;
  files: FileMap;
  mainFile?: string;
  engine?: Engine;
  tags?: string[];
  parent?: { docId: string; baseCommitId: string };
  recipe?: Recipe;
  folder?: string;
  kind?: CommitKind;
  message?: string;
}

type RepoEvent = 'commit' | 'index';

/**
 * Version-control core: content-addressed blobs, immutable commits, mutable doc heads and
 * per-document working copies. All persistence goes through the local Dexie database.
 */
export class Repo {
  private listeners = new Map<RepoEvent, Set<() => void>>();
  /** Fetches a blob that is referenced but not present locally (e.g. from Drive). */
  blobFetcher?: (hash: Hash) => Promise<Uint8Array | undefined>;
  author?: string;

  constructor(readonly db: RCDatabase) {}

  on(event: RepoEvent, fn: () => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  /** Tell listeners (sync, UI) that documents or history changed outside the usual methods (e.g. a restore). */
  notifyChanged() {
    this.emit('commit');
    this.emit('index');
  }

  private emit(event: RepoEvent) {
    this.listeners.get(event)?.forEach((fn) => fn());
  }

  // ---------- blobs ----------

  async putBlob(data: Uint8Array): Promise<Hash> {
    const hash = await sha256(data);
    const existing = await this.db.blobs.get(hash);
    if (!existing) await this.db.blobs.put({ hash, data, size: data.byteLength, synced: 0 });
    return hash;
  }

  putText(text: string): Promise<Hash> {
    return this.putBlob(encodeText(text));
  }

  async getBlob(hash: Hash): Promise<Uint8Array | undefined> {
    const rec = await this.db.blobs.get(hash);
    if (rec) return rec.data;
    if (this.blobFetcher) {
      const data = await this.blobFetcher(hash);
      if (data) {
        await this.db.blobs.put({ hash, data, size: data.byteLength, synced: 1 });
        return data;
      }
    }
    return undefined;
  }

  async treeToFiles(tree: FileTree): Promise<FileMap> {
    const out: FileMap = {};
    for (const [path, hash] of Object.entries(tree)) {
      if (isTextPath(path)) {
        const data = await this.getBlob(hash);
        out[path] = { kind: 'text', text: data ? decodeText(data) : '' };
      } else {
        const rec = await this.db.blobs.get(hash);
        out[path] = { kind: 'binary', hash, size: rec?.size ?? 0 };
      }
    }
    return out;
  }

  async filesToTree(files: FileMap): Promise<FileTree> {
    const tree: FileTree = {};
    for (const [path, f] of Object.entries(files)) {
      tree[path] = f.kind === 'text' ? await this.putText(f.text) : f.hash;
    }
    return tree;
  }

  // ---------- commits ----------

  getCommit(id: string): Promise<Commit | undefined> {
    return this.db.commits.get(id);
  }

  async readCommitFiles(commitId: string): Promise<FileMap> {
    const c = await this.getCommit(commitId);
    if (!c) throw new Error(`Unknown version ${commitId}`);
    return this.treeToFiles(c.tree);
  }

  async readCommitText(commitId: string, path: string): Promise<string | undefined> {
    const c = await this.getCommit(commitId);
    const hash = c?.tree[path];
    if (!hash) return undefined;
    const data = await this.getBlob(hash);
    return data ? decodeText(data) : undefined;
  }

  docCommits(docId: string): Promise<Commit[]> {
    return this.db.commits.where('docId').equals(docId).sortBy('createdAt');
  }

  private async writeCommit(input: Omit<Commit, 'id' | 'createdAt' | 'synced'>): Promise<Commit> {
    const createdAt = Date.now();
    const commit: Commit = { ...input, id: newId(createdAt), createdAt, author: this.author, synced: 0 };
    await this.db.commits.put(commit);
    return commit;
  }

  /** True when `ancestor` is reachable from `descendant` through parent links (inclusive). */
  async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    const seen = new Set<string>();
    const stack = [descendant];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === ancestor) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const c = await this.getCommit(id);
      if (c) stack.push(...c.parents);
    }
    return false;
  }

  /** Nearest common ancestor of two commits (null if unrelated). */
  async mergeBase(a: string, b: string): Promise<string | null> {
    const ancestorsOfA = new Set<string>();
    const stack = [a];
    while (stack.length) {
      const id = stack.pop()!;
      if (ancestorsOfA.has(id)) continue;
      ancestorsOfA.add(id);
      const c = await this.getCommit(id);
      if (c) stack.push(...c.parents);
    }
    // Breadth-first from b so the first hit is the nearest one.
    const queue = [b];
    const seen = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      if (ancestorsOfA.has(id)) return id;
      const c = await this.getCommit(id);
      if (c) queue.push(...c.parents);
    }
    return null;
  }

  /** Commits reachable from `from`, stopping at (and excluding) anything reachable from `stopAt`. */
  async commitsBetween(stopAt: string | null, from: string): Promise<Commit[]> {
    const excluded = new Set<string>();
    if (stopAt) {
      const stack = [stopAt];
      while (stack.length) {
        const id = stack.pop()!;
        if (excluded.has(id)) continue;
        excluded.add(id);
        const c = await this.getCommit(id);
        if (c) stack.push(...c.parents);
      }
    }
    const out: Commit[] = [];
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id) || excluded.has(id)) continue;
      seen.add(id);
      const c = await this.getCommit(id);
      if (!c) continue;
      out.push(c);
      stack.push(...c.parents);
    }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  }

  /** How many parent-document commits the variant has not pulled yet. */
  async commitsBehindParent(doc: DocMeta): Promise<number> {
    if (!doc.parent) return 0;
    const parent = await this.db.docs.get(doc.parent.docId);
    if (!parent?.head || parent.deleted) return 0;
    const commits = await this.commitsBetween(doc.parent.baseCommitId, parent.head);
    return commits.filter((c) => c.docId === parent.id).length;
  }

  // ---------- documents ----------

  async getDoc(id: string): Promise<DocMeta | undefined> {
    return this.db.docs.get(id);
  }

  async listDocs(): Promise<DocMeta[]> {
    return (await this.db.docs.toArray()).filter((d) => !d.deleted);
  }

  async updateDoc(id: string, patch: Partial<DocMeta>): Promise<void> {
    await this.db.docs.update(id, { ...patch, updatedAt: Date.now() });
    this.emit('index');
  }

  async createDoc(input: CreateDocInput): Promise<DocMeta> {
    const now = Date.now();
    const docId = newId(now);
    const paths = Object.keys(input.files);
    const mainFile =
      input.mainFile ?? (paths.includes('main.tex') ? 'main.tex' : paths.find((p) => p.endsWith('.tex')) ?? 'main.tex');
    const tree = await this.filesToTree(input.files);
    const commit = await this.writeCommit({
      docId,
      parents: input.parent ? [input.parent.baseCommitId] : [],
      tree,
      message: input.message ?? (input.parent ? `Created variant “${input.name}”` : `Created “${input.name}”`),
      kind: input.kind ?? (input.parent ? 'branch' : 'create'),
    });
    const doc: DocMeta = {
      id: docId,
      name: input.name,
      head: commit.id,
      mainFile,
      engine: input.engine ?? 'pdflatex',
      parent: input.parent,
      recipe: input.recipe,
      tags: input.tags ?? [],
      ...(input.folder ? { folder: input.folder } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await this.db.transaction('rw', this.db.docs, this.db.work, async () => {
      await this.db.docs.put(doc);
      await this.db.work.put({ docId, files: input.files, baseCommitId: commit.id, dirty: false, updatedAt: now });
    });
    this.emit('commit');
    this.emit('index');
    return doc;
  }

  /** Mark deleted (tombstone). Children are detached so they become standalone documents. */
  async deleteDoc(id: string): Promise<void> {
    const docs = await this.listDocs();
    await this.db.transaction('rw', this.db.docs, this.db.work, this.db.previews, async () => {
      for (const child of docs.filter((d) => d.parent?.docId === id)) {
        await this.db.docs.update(child.id, { parent: undefined, updatedAt: Date.now() });
      }
      await this.db.docs.update(id, { deleted: true, updatedAt: Date.now() });
      await this.db.work.delete(id);
      await this.db.previews.delete(id);
    });
    this.emit('index');
  }

  // ---------- working copies ----------

  async getWork(docId: string): Promise<WorkingCopy> {
    const existing = await this.db.work.get(docId);
    if (existing) return existing;
    const doc = await this.getDoc(docId);
    if (!doc) throw new Error('Document not found');
    const files = doc.head ? await this.readCommitFiles(doc.head) : {};
    const wc: WorkingCopy = { docId, files, baseCommitId: doc.head, dirty: false, updatedAt: Date.now() };
    await this.db.work.put(wc);
    return wc;
  }

  async setWorkFiles(docId: string, files: FileMap): Promise<void> {
    await this.getWork(docId);
    await this.db.work.update(docId, { files, dirty: true, updatedAt: Date.now() });
  }

  async writeWorkFile(docId: string, path: string, file: WorkFile): Promise<void> {
    const wc = await this.getWork(docId);
    await this.db.work.put({ ...wc, files: { ...wc.files, [path]: file }, dirty: true, updatedAt: Date.now() });
  }

  async writeWorkText(docId: string, path: string, text: string): Promise<void> {
    const wc = await this.getWork(docId);
    const cur = wc.files[path];
    if (cur?.kind === 'text' && cur.text === text) return;
    await this.writeWorkFile(docId, path, { kind: 'text', text });
  }

  async addBinaryFile(docId: string, path: string, data: Uint8Array): Promise<void> {
    const hash = await this.putBlob(data);
    await this.writeWorkFile(docId, path, { kind: 'binary', hash, size: data.byteLength });
  }

  async deleteWorkFile(docId: string, path: string): Promise<void> {
    const wc = await this.getWork(docId);
    const files = { ...wc.files };
    delete files[path];
    await this.db.work.put({ ...wc, files, dirty: true, updatedAt: Date.now() });
  }

  async renameWorkFile(docId: string, from: string, to: string): Promise<void> {
    const wc = await this.getWork(docId);
    if (!wc.files[from] || from === to) return;
    if (wc.files[to]) throw new Error(`${to} already exists`);
    const files: FileMap = {};
    for (const [p, f] of Object.entries(wc.files)) files[p === from ? to : p] = f;
    await this.db.work.put({ ...wc, files, dirty: true, updatedAt: Date.now() });
    const doc = await this.getDoc(docId);
    if (doc?.mainFile === from) await this.updateDoc(docId, { mainFile: to });
  }

  /**
   * Snapshot the working copy into a new commit. Returns null when nothing changed
   * (unless extra parents force a merge commit).
   */
  async commitWork(
    docId: string,
    message: string,
    kind: CommitKind = 'save',
    extraParents: string[] = [],
  ): Promise<Commit | null> {
    const doc = await this.getDoc(docId);
    if (!doc) throw new Error('Document not found');
    const wc = await this.getWork(docId);
    const tree = await this.filesToTree(wc.files);
    const head = doc.head ? await this.getCommit(doc.head) : undefined;
    if (head && sameTree(head.tree, tree) && extraParents.length === 0) {
      if (wc.dirty) await this.db.work.update(docId, { dirty: false });
      return null;
    }
    const commit = await this.writeCommit({
      docId,
      parents: [...(doc.head ? [doc.head] : []), ...extraParents],
      tree,
      message: message || defaultMessage(kind),
      kind,
    });
    await this.db.transaction('rw', this.db.docs, this.db.work, async () => {
      await this.db.docs.update(docId, { head: commit.id, updatedAt: Date.now() });
      const latest = await this.db.work.get(docId);
      // Only clear dirty if nothing was edited while we were hashing.
      const unchanged = latest && latest.updatedAt === wc.updatedAt;
      await this.db.work.update(docId, { baseCommitId: commit.id, dirty: unchanged ? false : true });
    });
    this.emit('commit');
    this.emit('index');
    return commit;
  }

  /** Replace the working copy with the files of an older commit and record it as a new version. */
  async restore(docId: string, commitId: string): Promise<Commit | null> {
    const files = await this.readCommitFiles(commitId);
    await this.commitWork(docId, 'Autosave before restore', 'auto');
    await this.setWorkFiles(docId, files);
    const c = await this.getCommit(commitId);
    return this.commitWork(docId, `Restored version from ${new Date(c?.createdAt ?? Date.now()).toLocaleString()}`, 'restore');
  }

  /** Commit pending edits of every dirty working copy (used before sync and on page hide). */
  async autosaveAll(): Promise<void> {
    const dirty = await this.db.work.filter((w) => w.dirty).toArray();
    for (const w of dirty) {
      const doc = await this.getDoc(w.docId);
      if (doc && !doc.deleted) await this.commitWork(w.docId, 'Autosave', 'auto');
    }
  }
}

export function sameTree(a: FileTree, b: FileTree): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

function defaultMessage(kind: CommitKind): string {
  switch (kind) {
    case 'auto':
      return 'Autosave';
    case 'merge':
      return 'Got updates from the original';
    default:
      return 'Saved version';
  }
}

export function fileText(files: FileMap, path: string): string | undefined {
  const f = files[path];
  return f?.kind === 'text' ? f.text : undefined;
}
