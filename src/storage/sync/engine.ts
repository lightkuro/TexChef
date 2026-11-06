import type { Repo } from '@/core/repo';
import type { Commit, DocMeta, Hash } from '@/core/model';
import { fromBase64, newId, toBase64 } from '@/core/hash';
import { mergeFileMaps } from '@/variants/ops';
import { COMPACT_THRESHOLD, INLINE_BLOB_LIMIT, type Pack, type RemoteIndex, type SyncProvider } from './types';

export interface SyncReport {
  pulledPacks: number;
  pushedCommits: number;
  updatedDocs: string[];
  diverged: string[];
  compacted: boolean;
}

/** Fields that never leave the device. */
function forRemote(doc: DocMeta): DocMeta {
  const { divergedHeads: _d, ...rest } = doc;
  void _d;
  return rest;
}

/**
 * Local-first sync: immutable packs of commits are unioned across devices; the small index of
 * document heads is merged (fast-forward when possible, otherwise the other head is recorded as diverged)
 * and written back with a compare-and-swap.
 */
export class SyncEngine {
  constructor(
    private repo: Repo,
    private provider: SyncProvider,
  ) {}

  private get db() {
    return this.repo.db;
  }

  async sync(): Promise<SyncReport> {
    const report: SyncReport = { pulledPacks: 0, pushedCommits: 0, updatedDocs: [], diverged: [], compacted: false };
    for (let attempt = 0; attempt < 4; attempt++) {
      const applied = new Set((await this.db.getMeta<string[]>(this.key('appliedPacks'))) ?? []);
      const remotePacks = await this.provider.listPacks();
      for (const p of remotePacks) {
        if (applied.has(p.id)) continue;
        await this.applyPack(await this.provider.readPack(p.ref));
        applied.add(p.id);
        report.pulledPacks++;
      }
      // Forget packs that were compacted away.
      const remoteIds = new Set(remotePacks.map((p) => p.id));
      for (const id of applied) if (!remoteIds.has(id)) applied.delete(id);

      const pushed = await this.pushPack();
      if (pushed) {
        applied.add(pushed.id);
        remoteIds.add(pushed.id);
        report.pushedCommits += pushed.commits;
      }
      await this.db.setMeta(this.key('appliedPacks'), [...applied]);

      const snap = await this.provider.readIndex();
      const merged = await this.mergeIndex(snap.index, report);
      const remoteJson = JSON.stringify(snap.index?.docs ?? null);
      const nextDocs = merged.map(forRemote).sort((a, b) => a.id.localeCompare(b.id));
      const remoteSorted = snap.index ? [...snap.index.docs].sort((a, b) => a.id.localeCompare(b.id)) : null;
      if (remoteSorted && JSON.stringify(remoteSorted) === JSON.stringify(nextDocs)) {
        void remoteJson;
      } else {
        const index: RemoteIndex = { format: 1, updatedAt: Date.now(), docs: nextDocs };
        const v = await this.provider.writeIndex(index, snap.version);
        if (v === null) continue; // someone else wrote; retry with fresh state
      }
      if (remoteIds.size > COMPACT_THRESHOLD) {
        await this.compact();
        report.compacted = true;
      }
      await this.db.setMeta(this.key('lastSync'), Date.now());
      return report;
    }
    throw new Error('Sync kept conflicting with another device; try again in a moment.');
  }

  private key(k: string) {
    return `sync.${this.provider.id}.${k}`;
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

  private async pushPack(): Promise<{ id: string; commits: number } | null> {
    const commits = await this.db.commits.where('synced').equals(0).toArray();
    if (commits.length === 0) return null;
    const hashes = new Set<Hash>();
    commits.forEach((c) => Object.values(c.tree).forEach((h) => hashes.add(h)));
    const inline: Record<Hash, string> = {};
    const sent: Hash[] = [];
    for (const h of hashes) {
      const blob = await this.db.blobs.get(h);
      if (!blob || blob.synced === 1) continue;
      if (blob.size <= INLINE_BLOB_LIMIT) inline[h] = toBase64(blob.data);
      else await this.provider.writeBlob(h, blob.data);
      sent.push(h);
    }
    const pack: Pack = {
      format: 1,
      id: newId(),
      createdAt: Date.now(),
      commits: commits.map(({ synced: _s, ...c }) => (void _s, c)),
      blobs: inline,
    };
    await this.provider.writePack(pack);
    await this.db.transaction('rw', this.db.commits, this.db.blobs, async () => {
      for (const c of commits) await this.db.commits.update(c.id, { synced: 1 });
      for (const h of sent) await this.db.blobs.update(h, { synced: 1 });
    });
    return { id: pack.id, commits: commits.length };
  }

  /** Merge the remote index into local docs; returns the merged local view. */
  private async mergeIndex(remote: RemoteIndex | null, report: SyncReport): Promise<DocMeta[]> {
    const remoteDocs = new Map((remote?.docs ?? []).map((d) => [d.id, d]));
    const localDocs = new Map((await this.db.docs.toArray()).map((d) => [d.id, d]));
    const ids = new Set([...remoteDocs.keys(), ...localDocs.keys()]);
    for (const id of ids) {
      const r = remoteDocs.get(id);
      const l = localDocs.get(id);
      if (!r || !l) {
        if (r && !l && (!r.head || (await this.db.commits.get(r.head)))) {
          await this.db.docs.put({ ...r });
          localDocs.set(id, r);
          report.updatedDocs.push(id);
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
      archived: newer.archived,
      deleted: l.deleted || r.deleted,
      updatedAt: Math.max(l.updatedAt, r.updatedAt),
    };
    if (out.deleted || l.head === r.head || !r.head) return out;
    if (!(await this.db.commits.get(r.head))) return out; // pack not visible yet
    if (!l.head || (await this.repo.isAncestor(l.head, r.head))) {
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
    if (await this.repo.isAncestor(r.head, l.head)) return out; // we are ahead
    const diverged = new Set(out.divergedHeads ?? []);
    if (!diverged.has(r.head)) {
      diverged.add(r.head);
      report.diverged.push(l.id);
    }
    return { ...out, divergedHeads: [...diverged] };
  }

  /** Rewrite all packs as one. Safe to race: packs are idempotent unions. */
  async compact(): Promise<void> {
    const packs = await this.provider.listPacks();
    if (packs.length < 2) return;
    const commits = new Map<string, Omit<Commit, 'synced'>>();
    const blobs: Record<Hash, string> = {};
    for (const p of packs) {
      const pack = await this.provider.readPack(p.ref);
      pack.commits.forEach((c) => commits.set(c.id, c));
      Object.assign(blobs, pack.blobs);
    }
    const merged: Pack = { format: 1, id: newId(), createdAt: Date.now(), commits: [...commits.values()], blobs };
    await this.provider.writePack(merged);
    await this.provider.deletePacks(packs.map((p) => p.ref));
    await this.db.setMeta(this.key('appliedPacks'), [merged.id]);
  }
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
