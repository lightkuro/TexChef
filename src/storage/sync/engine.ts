import type { Repo } from '@/core/repo';
import type { Commit, DocMeta, Hash } from '@/core/model';
import { fromBase64, newId, toBase64 } from '@/core/hash';
import { mergeFileMaps } from '@/variants/ops';
import { COMPACT_THRESHOLD, DOC_COMPACT_THRESHOLD, INLINE_BLOB_LIMIT, PACK_INLINE_LIMIT, type HeadRef, type Pack, type PackRef, type RemoteIndex, type SyncProvider } from './types';

export interface SyncReport {
  pulledPacks: number;
  pushedCommits: number;
  /** Documents this device pushed versions of in this sync. */
  pushedDocs: string[];
  updatedDocs: string[];
  diverged: string[];
  compacted: boolean;
}

/**
 * How much this device brings down from the storage:
 * - 'all': every version of every document (the original behaviour);
 * - 'needed': each document's current version; older versions when something asks for them;
 * - 'saver': only the list of documents; a document's current version comes down when it is opened.
 */
export type PullMode = 'all' | 'needed' | 'saver';

/** Fields that never leave the device. */
function forRemote(doc: DocMeta): DocMeta {
  const { divergedHeads: _d, remoteOnly: _r, ...rest } = doc;
  void _d;
  void _r;
  return rest;
}

/**
 * Local-first sync: immutable packs of commits are unioned across devices; the small index of
 * document heads is merged (fast-forward when possible, otherwise the other head is recorded as diverged)
 * and written back with a compare-and-swap.
 *
 * Packs are written per document, and each document's current version is also kept as a small "head"
 * file, so a device can take just the current versions ('needed'), or nothing until a document is opened
 * ('saver'), and fetch a document's history only when it is asked for. Packs written by earlier versions
 * of the app hold several documents at once; they are read whole the first time history is needed.
 */
export class SyncEngine {
  mode: PullMode = 'all';
  private lastIndex: { version: string; index: RemoteIndex } | null = null;
  private heads: Map<string, HeadRef> | null = null;

  constructor(
    private repo: Repo,
    private provider: SyncProvider,
  ) {}

  private get db() {
    return this.repo.db;
  }

  private key(k: string) {
    return `sync.${this.provider.id}.${k}`;
  }

  /** Documents whose whole history this device keeps up with (every document in 'all' mode). */
  private async followed(): Promise<Set<string>> {
    return new Set((await this.db.getMeta<string[]>(this.key('follow'))) ?? []);
  }

  private async appliedPacks(): Promise<Set<string>> {
    return new Set((await this.db.getMeta<string[]>(this.key('appliedPacks'))) ?? []);
  }

  async sync(): Promise<SyncReport> {
    const report: SyncReport = { pulledPacks: 0, pushedCommits: 0, pushedDocs: [], updatedDocs: [], diverged: [], compacted: false };
    for (let attempt = 0; attempt < 4; attempt++) {
      const applied = await this.appliedPacks();
      const follow = await this.followed();
      let remotePacks = await this.provider.listPacks();
      for (const p of remotePacks) {
        if (applied.has(p.id) || !this.wants(p, follow)) continue;
        await this.applyPack(await this.provider.readPack(p.ref));
        applied.add(p.id);
        report.pulledPacks++;
      }
      // Forget packs that were compacted away.
      const remoteIds = new Set(remotePacks.map((p) => p.id));
      for (const id of applied) if (!remoteIds.has(id)) applied.delete(id);

      const pushed = await this.pushPacks();
      for (const p of pushed) {
        applied.add(p.id);
        report.pushedCommits += p.commits;
        if (p.docId) report.pushedDocs.push(p.docId);
      }
      await this.db.setMeta(this.key('appliedPacks'), [...applied]);
      if (pushed.length) remotePacks = [...remotePacks, ...pushed.map((p) => ({ id: p.id, ref: p.ref, docId: p.docId }))];

      const snap = await this.readIndex();
      await this.fetchHeads(snap.index, report);
      const merged = await this.mergeIndex(snap.index, report);
      const nextDocs = merged.map(forRemote).sort((a, b) => a.id.localeCompare(b.id));
      const remoteSorted = snap.index ? [...snap.index.docs].sort((a, b) => a.id.localeCompare(b.id)) : null;
      if (!remoteSorted || JSON.stringify(remoteSorted) !== JSON.stringify(nextDocs)) {
        const index: RemoteIndex = { format: 1, updatedAt: Date.now(), docs: nextDocs };
        const v = await this.provider.writeIndex(index, snap.version);
        if (v === null) {
          this.lastIndex = null;
          continue; // someone else wrote; retry with fresh state
        }
        this.lastIndex = { version: v, index };
      }
      await this.writeHeads(merged);
      report.compacted = await this.compactIfNeeded(remotePacks);
      await this.db.setMeta(this.key('lastSync'), Date.now());
      return report;
    }
    throw new Error('Sync kept conflicting with another device; try again in a moment.');
  }

  /** Whether a sync brings this pack down on its own (history asked for later comes through `followDoc`). */
  private wants(p: PackRef, follow: Set<string>): boolean {
    if (this.mode === 'all') return true;
    // A pack from an earlier version of the app may hold any document: read it once some history is followed.
    return p.docId ? follow.has(p.docId) : follow.size > 0;
  }

  /** The index, without downloading it again when the storage says it has not changed. */
  private async readIndex(): Promise<{ index: RemoteIndex | null; version: string | null }> {
    const snap = await this.provider.readIndex(this.lastIndex?.version);
    if (snap.unchanged && this.lastIndex) return { index: this.lastIndex.index, version: this.lastIndex.version };
    this.lastIndex = snap.index && snap.version ? { version: snap.version, index: snap.index } : null;
    return { index: snap.index, version: snap.version };
  }

  private async applyPack(pack: Pack) {
    await this.db.transaction('rw', this.db.commits, this.db.blobs, async () => {
      for (const [hash, b64] of Object.entries(pack.blobs)) {
        if (!(await this.db.blobs.get(hash))) {
          const data = fromBase64(b64);
          await this.db.blobs.put({ hash, data, size: data.byteLength, synced: 1 });
        } else {
          await this.db.blobs.update(hash, { synced: 1 });
        }
      }
      for (const c of pack.commits) {
        const existing = await this.db.commits.get(c.id);
        if (!existing) await this.db.commits.put({ ...c, synced: 1 });
        else if (existing.synced !== 1) await this.db.commits.update(c.id, { synced: 1 });
      }
    });
  }

  /** One pack per document with unsynced versions. */
  private async pushPacks(): Promise<{ id: string; ref: string; docId: string; commits: number }[]> {
    const unsynced = await this.db.commits.where('synced').equals(0).toArray();
    if (unsynced.length === 0) return [];
    const byDoc = new Map<string, Commit[]>();
    for (const c of unsynced) byDoc.set(c.docId, [...(byDoc.get(c.docId) ?? []), c]);
    const out: { id: string; ref: string; docId: string; commits: number }[] = [];
    for (const [docId, commits] of byDoc) {
      // What this document's earlier packs already carry, as far as this device knows: a file shared with
      // another document (a class file, a logo) goes into this document's pack too, so its history reads on its own.
      const known = new Set<Hash>();
      for (const c of await this.db.commits.where('docId').equals(docId).toArray()) {
        if (c.synced === 1) Object.values(c.tree).forEach((h) => known.add(h));
      }
      const hashes = new Set<Hash>();
      commits.forEach((c) => Object.values(c.tree).forEach((h) => hashes.add(h)));
      const inline: Record<Hash, string> = {};
      const sent: Hash[] = [];
      for (const h of hashes) {
        const blob = await this.db.blobs.get(h);
        if (!blob) continue;
        if (blob.synced === 1 && known.has(h)) continue;
        if (blob.size <= PACK_INLINE_LIMIT) inline[h] = toBase64(blob.data);
        // Bigger files are stored one by one, and fetched only by devices that need them.
        else if (blob.synced !== 1 || blob.size <= INLINE_BLOB_LIMIT) await this.provider.writeBlob(h, blob.data);
        if (blob.synced !== 1) sent.push(h);
      }
      const pack: Pack = {
        format: 1,
        id: `${docId}~${newId()}`,
        createdAt: Date.now(),
        commits: commits.map(({ synced: _s, ...c }) => (void _s, c)),
        blobs: inline,
      };
      const ref = await this.provider.writePack(pack);
      await this.db.transaction('rw', this.db.commits, this.db.blobs, async () => {
        for (const c of commits) await this.db.commits.update(c.id, { synced: 1 });
        for (const h of sent) await this.db.blobs.update(h, { synced: 1 });
      });
      out.push({ id: pack.id, ref: ref ?? pack.id, docId, commits: commits.length });
    }
    // A document edited here is one whose history this device keeps up with: that is what lets it tell
    // "the other device is ahead" from "both changed it".
    const follow = await this.followed();
    const fresh = out.map((p) => p.docId).filter((id) => !follow.has(id));
    if (fresh.length) await this.db.setMeta(this.key('follow'), [...follow, ...fresh]);
    return out;
  }

  // ---------- current versions ----------

  /** In 'needed' mode, bring down the current version of every document that moved (or is new here). */
  private async fetchHeads(remote: RemoteIndex | null, report: SyncReport) {
    if (this.mode === 'all' || !remote) return;
    for (const r of remote.docs) {
      if (!r.head || r.deleted || (await this.db.commits.get(r.head))) continue;
      const l = await this.db.docs.get(r.id);
      // Data saver: only documents already on this device are kept current.
      if (this.mode === 'saver' && (!l || l.remoteOnly)) continue;
      if (await this.fetchHead(r.id, r.head)) report.pulledPacks++;
    }
  }

  /**
   * Bring one document's current version to this device: from its head file when that is up to date,
   * otherwise from its packs. True when the version is here afterwards.
   */
  async fetchHead(docId: string, head: string): Promise<boolean> {
    if (await this.db.commits.get(head)) return true;
    if (this.provider.listHeads && this.provider.readHead) {
      for (const fresh of [false, true]) {
        if (fresh || !this.heads) this.heads = await this.provider.listHeads();
        const entry = this.heads.get(docId);
        // The head file is written after the index, so it may lag a moment behind: look once more, then use the packs.
        if (!entry || (entry.head && entry.head !== head)) continue;
        const pack = await this.provider.readHead(entry.ref).catch(() => undefined);
        if (pack?.commits.some((c) => c.id === head)) {
          await this.applyPack(pack);
          const written = (await this.db.getMeta<Record<string, string>>(this.key('headsWritten'))) ?? {};
          await this.db.setMeta(this.key('headsWritten'), { ...written, [docId]: head });
          break;
        }
      }
    }
    if (!(await this.db.commits.get(head))) await this.loadPacks((p) => !p.docId || p.docId === docId);
    const ok = !!(await this.db.commits.get(head));
    if (ok) {
      const doc = await this.db.docs.get(docId);
      if (doc?.remoteOnly) await this.db.docs.put({ ...forLocal(doc) });
    }
    return ok;
  }

  /** Write the head file of each document whose current version this device holds and has not written yet. */
  private async writeHeads(docs: DocMeta[]) {
    if (!this.provider.writeHead) return;
    const written = (await this.db.getMeta<Record<string, string>>(this.key('headsWritten'))) ?? {};
    let changed = false;
    let listed = false;
    for (const d of docs) {
      if (!d.head || d.deleted || d.remoteOnly || written[d.id] === d.head) continue;
      const commit = await this.db.commits.get(d.head);
      if (!commit || commit.synced !== 1) continue;
      // Another device may have written it already.
      if (!listed && this.provider.listHeads) {
        this.heads = await this.provider.listHeads();
        listed = true;
      }
      if (this.heads?.get(d.id)?.head === d.head) {
        written[d.id] = d.head;
        changed = true;
        continue;
      }
      const blobs: Record<Hash, string> = {};
      let complete = true;
      for (const h of new Set(Object.values(commit.tree))) {
        const blob = await this.db.blobs.get(h);
        // Not on this device (a big file never opened here): it is stored on its own already.
        if (!blob) continue;
        if (blob.size <= PACK_INLINE_LIMIT) blobs[h] = toBase64(blob.data);
        else if (blob.size <= INLINE_BLOB_LIMIT) await this.provider.writeBlob(h, blob.data).catch(() => (complete = false));
      }
      if (!complete) continue;
      const { synced: _s, ...c } = commit;
      void _s;
      try {
        const ref = await this.provider.writeHead(d.id, { format: 1, id: `head~${d.id}`, createdAt: Date.now(), commits: [c], blobs }, this.heads?.get(d.id)?.ref);
        this.heads?.set(d.id, { ref, head: d.head });
        written[d.id] = d.head;
        changed = true;
      } catch (e) {
        console.warn('Could not write the current version file', e);
      }
    }
    for (const id of Object.keys(written)) {
      if (!docs.some((d) => d.id === id && !d.deleted)) {
        delete written[id];
        changed = true;
      }
    }
    if (changed) await this.db.setMeta(this.key('headsWritten'), written);
  }

  // ---------- history on demand ----------

  /** Apply every pack not yet on this device that `want` accepts. Returns how many were read. */
  private async loadPacks(want: (p: PackRef) => boolean): Promise<number> {
    const applied = await this.appliedPacks();
    let n = 0;
    for (const p of await this.provider.listPacks()) {
      if (applied.has(p.id) || !want(p)) continue;
      await this.applyPack(await this.provider.readPack(p.ref));
      applied.add(p.id);
      n++;
    }
    if (n) await this.db.setMeta(this.key('appliedPacks'), [...applied]);
    return n;
  }

  /** Keep the whole history of these documents on this device from now on, and bring it down now. */
  async followDocs(docIds: string[]): Promise<number> {
    const follow = await this.followed();
    const fresh = docIds.filter((id) => !follow.has(id));
    if (fresh.length) await this.db.setMeta(this.key('follow'), [...follow, ...fresh]);
    const ids = new Set(docIds);
    return this.loadPacks((p) => !p.docId || ids.has(p.docId));
  }

  /** Bring down everything that is stored: every version of every document. */
  loadEverything(): Promise<number> {
    return this.loadPacks(() => true);
  }

  // ---------- the index ----------

  /** Merge the remote index into local docs; returns the merged local view. */
  private async mergeIndex(remote: RemoteIndex | null, report: SyncReport): Promise<DocMeta[]> {
    const remoteDocs = new Map((remote?.docs ?? []).map((d) => [d.id, d]));
    const localDocs = new Map((await this.db.docs.toArray()).map((d) => [d.id, d]));
    const ids = new Set([...remoteDocs.keys(), ...localDocs.keys()]);
    for (const id of ids) {
      const r = remoteDocs.get(id);
      const l = localDocs.get(id);
      if (!r || !l) {
        if (r && !l) {
          const here = !r.head || !!(await this.db.commits.get(r.head));
          // Data saver: list the document now; its contents come when it is opened.
          const doc: DocMeta | null = here ? { ...r } : this.mode === 'saver' && !r.deleted ? { ...r, remoteOnly: true } : null;
          if (doc) {
            await this.db.docs.put(doc);
            localDocs.set(id, doc);
            report.updatedDocs.push(id);
          }
        }
        continue;
      }
      const next = await this.mergeDoc(l, r, report);
      if (JSON.stringify(next) !== JSON.stringify(l)) {
        await this.db.docs.put(next);
        localDocs.set(id, next);
      }
    }
    return [...localDocs.values()];
  }

  private async mergeDoc(l: DocMeta, r: DocMeta, report: SyncReport): Promise<DocMeta> {
    const newer = r.updatedAt > l.updatedAt ? r : l;
    let out: DocMeta = {
      ...l,
      name: newer.name,
      engine: newer.engine,
      mainFile: newer.mainFile,
      tags: newer.tags,
      color: newer.color,
      folder: newer.folder,
      archived: newer.archived,
      deleted: l.deleted || r.deleted,
      updatedAt: Math.max(l.updatedAt, r.updatedAt),
    };
    if (out.deleted || l.head === r.head || !r.head) return out;
    // Listed but not on this device (data saver): nothing here to keep, so just follow the storage.
    if (l.remoteOnly) return { ...out, head: r.head, parent: r.parent, recipe: r.recipe };
    if (!(await this.db.commits.get(r.head))) return out; // not visible yet
    let ahead = !l.head || (await this.repo.isAncestor(l.head, r.head));
    if (!ahead && !(await this.repo.isAncestor(r.head, l.head!)) && this.mode !== 'all') {
      // Neither follows from the other as far as this device can see, and it may not hold the versions in between.
      // A document never changed here is simply behind. One that was changed here needs its real history to tell
      // "the other device is ahead" from "both changed it".
      if (await this.untouched(l)) ahead = true;
      else if ((await this.followDocs([l.id])) > 0) ahead = await this.repo.isAncestor(l.head!, r.head);
    }
    if (ahead) {
      // Remote is ahead. Keep unsaved local edits by committing them first (which makes heads diverge).
      const work = await this.db.work.get(l.id);
      if (work?.dirty && l.head) {
        const c = await this.repo.commitWork(l.id, 'Autosave before sync', 'auto');
        if (c) return this.mergeDoc({ ...(await this.db.docs.get(l.id))!, ...out, head: c.id }, r, report);
      }
      out = { ...out, head: r.head, parent: r.parent, recipe: r.recipe };
      await this.db.work.delete(l.id); // re-created from the new head on next open
      report.updatedDocs.push(l.id);
      return out;
    }
    if (await this.repo.isAncestor(r.head, l.head!)) return out; // we are ahead
    const diverged = new Set(out.divergedHeads ?? []);
    if (!diverged.has(r.head)) {
      diverged.add(r.head);
      report.diverged.push(l.id);
    }
    return { ...out, divergedHeads: [...diverged] };
  }

  /**
   * This device has never changed the document: it has pushed no version of it, and nothing is unsaved.
   * Whatever the storage says is then simply newer, and the versions in between need not be fetched.
   */
  private async untouched(l: DocMeta): Promise<boolean> {
    if (!l.head) return true;
    if ((await this.followed()).has(l.id)) return false;
    if ((await this.db.work.get(l.id))?.dirty) return false;
    const own = await this.db.commits.where('docId').equals(l.id).toArray();
    return own.every((c) => c.synced === 1);
  }

  // ---------- compaction ----------

  /**
   * Merge a document's packs into one once there are many, from what this device already holds (nothing is
   * downloaded). Only packs this device has applied are replaced, and only for documents whose history it follows.
   */
  private async compactIfNeeded(remotePacks: PackRef[]): Promise<boolean> {
    const applied = await this.appliedPacks();
    const follow = await this.followed();
    const mine = remotePacks.filter((p) => applied.has(p.id));
    const byDoc = new Map<string, PackRef[]>();
    for (const p of mine) if (p.docId) byDoc.set(p.docId, [...(byDoc.get(p.docId) ?? []), p]);
    const mixed = mine.filter((p) => !p.docId);
    const everything = this.mode === 'all' && mine.length === remotePacks.length;
    const extras = mixed.length + [...byDoc.values()].reduce((n, list) => n + list.length - 1, 0);
    if (everything && mixed.length > 0 && extras > COMPACT_THRESHOLD) {
      await this.compact();
      return true;
    }
    let did = false;
    for (const [docId, refs] of byDoc) {
      if (refs.length <= DOC_COMPACT_THRESHOLD || !(everything || follow.has(docId))) continue;
      did = (await this.compactDoc(docId, refs)) || did;
    }
    return did;
  }

  /** One pack holding every synced version of a document this device has, with the small files they use. */
  private async docPack(docId: string): Promise<Pack | null> {
    const commits = (await this.db.commits.where('docId').equals(docId).toArray()).filter((c) => c.synced === 1);
    if (commits.length === 0) return null;
    const blobs: Record<Hash, string> = {};
    const hashes = new Set<Hash>();
    commits.forEach((c) => Object.values(c.tree).forEach((h) => hashes.add(h)));
    for (const h of hashes) {
      const blob = await this.db.blobs.get(h);
      // Files up to the old inline limit may exist nowhere but inside packs: they must be carried along.
      if (blob && blob.size <= INLINE_BLOB_LIMIT) blobs[h] = toBase64(blob.data);
    }
    return { format: 1, id: `${docId}~${newId()}`, createdAt: Date.now(), commits: commits.map(({ synced: _s, ...c }) => (void _s, c)), blobs };
  }

  private async compactDoc(docId: string, refs: PackRef[]): Promise<boolean> {
    const pack = await this.docPack(docId);
    if (!pack) return false;
    await this.provider.writePack(pack);
    await this.provider.deletePacks(refs.map((p) => p.ref));
    const applied = await this.appliedPacks();
    refs.forEach((p) => applied.delete(p.id));
    applied.add(pack.id);
    await this.db.setMeta(this.key('appliedPacks'), [...applied]);
    return true;
  }

  /**
   * Rewrite all packs as one per document. For a device that holds everything ('all' mode, every pack applied).
   * Safe to race: packs are idempotent unions.
   */
  async compact(): Promise<void> {
    const packs = await this.provider.listPacks();
    if (packs.length < 2) return;
    // Anything not applied yet is read first, so nothing is dropped.
    await this.loadPacks(() => true);
    const docIds = new Set<string>();
    await this.db.commits.each((c) => {
      if (c.synced === 1) docIds.add(c.docId);
    });
    const written: string[] = [];
    for (const docId of docIds) {
      const pack = await this.docPack(docId);
      if (!pack) continue;
      await this.provider.writePack(pack);
      written.push(pack.id);
    }
    await this.provider.deletePacks(packs.map((p) => p.ref));
    const applied = await this.appliedPacks();
    packs.forEach((p) => applied.delete(p.id));
    await this.db.setMeta(this.key('appliedPacks'), [...applied, ...written]);
  }
}

/** A listed-only document that has just arrived on this device. */
function forLocal(doc: DocMeta): DocMeta {
  const { remoteOnly: _r, ...rest } = doc;
  void _r;
  return rest;
}

/** Merge a head that diverged on another device into the local head (3-way, conflicts left as markers). */
export async function mergeDivergedHead(repo: Repo, docId: string, otherHead: string): Promise<{ conflicts: number }> {
  const doc = await repo.getDoc(docId);
  if (!doc?.head) throw new Error('Document not found');
  await repo.commitWork(docId, 'Autosave before combining', 'auto');
  const head = (await repo.getDoc(docId))!.head!;
  const base = await repo.mergeBase(head, otherHead);
  const ours = await repo.readCommitFiles(head);
  const theirs = await repo.readCommitFiles(otherHead);
  const baseFiles = base ? await repo.readCommitFiles(base) : {};
  const m = mergeFileMaps(ours, baseFiles, theirs, { ours: 'this device', theirs: 'other device' });
  await repo.setWorkFiles(docId, m.files);
  await repo.commitWork(docId, 'Combined changes from another device', 'merge', [otherHead]);
  const fresh = (await repo.getDoc(docId))!;
  await repo.updateDoc(docId, { divergedHeads: (fresh.divergedHeads ?? []).filter((h) => h !== otherHead) });
  return { conflicts: m.conflictFiles.reduce((n, f) => n + f.conflicts, 0) };
}

export async function discardDivergedHead(repo: Repo, docId: string, otherHead: string) {
  const doc = await repo.getDoc(docId);
  if (!doc) return;
  await repo.updateDoc(docId, { divergedHeads: (doc.divergedHeads ?? []).filter((h) => h !== otherHead) });
}
