import { describe, expect, it } from 'vitest';
import { RCDatabase } from '@/storage/db';
import { Repo, fileText } from '@/core/repo';
import { MemoryProvider } from '@/storage/providers/memory';
import { SyncEngine, mergeDivergedHead, type PullMode } from './engine';
import type { Pack } from './types';
import { createVariant } from '@/variants/ops';
import { emptyRecipe } from '@/core/model';

let n = 0;
function device(provider: MemoryProvider, mode: PullMode = 'all') {
  const repo = new Repo(new RCDatabase(`sync-${n++}`));
  const engine = new SyncEngine(repo, provider);
  engine.mode = mode;
  // As the app wires it: a version that is asked for but not here is fetched (its document's current version first).
  repo.commitFetcher = async (id) => {
    const doc = (await repo.db.docs.toArray()).find((d) => d.head === id);
    if (!doc || !(await engine.fetchHead(doc.id, id))) await engine.loadEverything();
  };
  repo.blobFetcher = async (h) => (await provider.readBlob(h)) ?? (await engine.loadEverything(), (await repo.db.blobs.get(h))?.data);
  return { repo, engine };
}
const text = async (d: { repo: Repo }, id: string) => fileText((await d.repo.getWork(id)).files, 'main.tex');
const edit = async (d: { repo: Repo }, id: string, body: string, message = body) => {
  await d.repo.writeWorkText(id, 'main.tex', body);
  return d.repo.commitWork(id, message);
};

const tex = (body: string) => `\\documentclass{article}\n\\begin{document}\n%% @block a tags=x\n${body}\n%% @end\n%% @block b\nB\n%% @end\n\\end{document}`;

describe('sync engine', () => {
  it('replicates documents, variants and edits between two devices', async () => {
    const remote = new MemoryProvider();
    const A = device(remote);
    const B = device(remote);
    const master = await A.repo.createDoc({ name: 'Master', files: { 'main.tex': { kind: 'text', text: tex('one') } } });
    const variant = await createVariant(A.repo, { parentId: master.id, name: 'Only b', recipe: { ...emptyRecipe(), tags: ['y'] } });
    const binHash = await A.repo.putBlob(new Uint8Array(300 * 1024).fill(7));
    await A.repo.writeWorkFile(master.id, 'photo.png', { kind: 'binary', hash: binHash, size: 300 * 1024 });
    await A.repo.commitWork(master.id, 'add photo');
    const r1 = await A.engine.sync();
    expect(r1.pushedCommits).toBe(3);
    expect(remote.blobs.size).toBe(1); // large blob stored separately

    // One pack per document.
    expect([...remote.packs.keys()].map((id) => id.split('~')[0]).sort()).toEqual([master.id, variant.id].sort());
    const r2 = await B.engine.sync();
    expect(r2.pulledPacks).toBe(2);
    const docsB = await B.repo.listDocs();
    expect(docsB.map((d) => d.name).sort()).toEqual(['Master', 'Only b']);
    const vB = (await B.repo.getDoc(variant.id))!;
    expect(vB.parent?.docId).toBe(master.id);
    expect(fileText((await B.repo.getWork(variant.id)).files, 'main.tex')).not.toContain('one');
    B.repo.blobFetcher = (h) => remote.readBlob(h);
    const wB = await B.repo.getWork(master.id);
    expect(wB.files['photo.png'].kind).toBe('binary');

    // B edits, A pulls it (fast-forward).
    await B.repo.writeWorkText(master.id, 'main.tex', tex('two'));
    await B.repo.commitWork(master.id, 'two');
    await B.engine.sync();
    const r3 = await A.engine.sync();
    expect(r3.updatedDocs).toContain(master.id);
    expect(fileText((await A.repo.getWork(master.id)).files, 'main.tex')).toContain('two');
  });

  it('records diverged heads and merges them', async () => {
    const remote = new MemoryProvider();
    const A = device(remote);
    const B = device(remote);
    const doc = await A.repo.createDoc({ name: 'Doc', files: { 'main.tex': { kind: 'text', text: 'l1\nl2\nl3\nl4' } } });
    await A.engine.sync();
    await B.engine.sync();
    await A.repo.writeWorkText(doc.id, 'main.tex', 'L1\nl2\nl3\nl4');
    await A.repo.commitWork(doc.id, 'A edit');
    await B.repo.writeWorkText(doc.id, 'main.tex', 'l1\nl2\nl3\nL4');
    await B.repo.commitWork(doc.id, 'B edit');
    await A.engine.sync();
    const rb = await B.engine.sync();
    expect(rb.diverged).toEqual([doc.id]);
    const dB = (await B.repo.getDoc(doc.id))!;
    expect(dB.divergedHeads).toHaveLength(1);
    const res = await mergeDivergedHead(B.repo, doc.id, dB.divergedHeads![0]);
    expect(res.conflicts).toBe(0);
    expect(fileText((await B.repo.getWork(doc.id)).files, 'main.tex')).toBe('L1\nl2\nl3\nL4');
    expect((await B.repo.getDoc(doc.id))!.divergedHeads).toEqual([]);
    await B.engine.sync();
    await A.engine.sync();
    expect(fileText((await A.repo.getWork(doc.id)).files, 'main.tex')).toBe('L1\nl2\nl3\nL4');
  });

  it('keeps unsaved local edits when the remote moved ahead', async () => {
    const remote = new MemoryProvider();
    const A = device(remote);
    const B = device(remote);
    const doc = await A.repo.createDoc({ name: 'Doc', files: { 'main.tex': { kind: 'text', text: 'a\nb\nc' } } });
    await A.engine.sync();
    await B.engine.sync();
    await B.repo.writeWorkText(doc.id, 'main.tex', 'a\nb\nC');
    await B.repo.commitWork(doc.id, 'B');
    await B.engine.sync();
    await A.repo.writeWorkText(doc.id, 'main.tex', 'A\nb\nc'); // dirty, not committed
    const r = await A.engine.sync();
    expect(r.diverged).toEqual([doc.id]);
    expect(fileText((await A.repo.getWork(doc.id)).files, 'main.tex')).toBe('A\nb\nc');
  });

  it('compacts packs and propagates deletes', async () => {
    const remote = new MemoryProvider();
    const A = device(remote);
    const B = device(remote);
    const doc = await A.repo.createDoc({ name: 'Doc', files: { 'main.tex': { kind: 'text', text: 'x' } } });
    for (let i = 0; i < 3; i++) {
      await A.repo.writeWorkText(doc.id, 'main.tex', `x${i}`);
      await A.repo.commitWork(doc.id, `c${i}`);
      await A.engine.sync();
    }
    expect(remote.packs.size).toBe(3);
    await A.engine.compact();
    expect(remote.packs.size).toBe(1);
    await B.engine.sync();
    expect(fileText((await B.repo.getWork(doc.id)).files, 'main.tex')).toBe('x2');
    await A.repo.deleteDoc(doc.id);
    await A.engine.sync();
    await B.engine.sync();
    expect(await B.repo.listDocs()).toEqual([]);
  });

  it('needed: a new device takes each document’s current version, and no history', async () => {
    const remote = new MemoryProvider();
    const A = device(remote);
    const one = await A.repo.createDoc({ name: 'One', files: { 'main.tex': { kind: 'text', text: 'v1' } } });
    for (const v of ['v2', 'v3', 'v4']) await edit(A, one.id, v);
    const two = await A.repo.createDoc({ name: 'Two', files: { 'main.tex': { kind: 'text', text: 'two' } } });
    await A.engine.sync();
    expect(remote.heads.size).toBe(2);

    const B = device(remote, 'needed');
    await B.engine.sync();
    expect(remote.reads.packs).toBe(0);
    expect(remote.reads.heads).toBe(2);
    expect((await B.repo.listDocs()).map((d) => d.name).sort()).toEqual(['One', 'Two']);
    expect(await text(B, one.id)).toBe('v4');
    expect(await text(B, two.id)).toBe('two');
    expect(await B.repo.docCommits(one.id)).toHaveLength(1);

    // A moves on by several versions: B follows without fetching the ones in between.
    for (const v of ['v5', 'v6', 'v7']) await edit(A, one.id, v);
    await A.engine.sync();
    const r = await B.engine.sync();
    expect(r.updatedDocs).toEqual([one.id]);
    expect(r.diverged).toEqual([]);
    expect(await text(B, one.id)).toBe('v7');
    expect(remote.reads.packs).toBe(0);
    expect(await B.repo.docCommits(one.id)).toHaveLength(2);

    // History comes when it is asked for, for that document only.
    await B.engine.followDocs([one.id]);
    expect(await B.repo.docCommits(one.id)).toHaveLength(7);
    expect(await B.repo.docCommits(two.id)).toHaveLength(1);

    // Nothing changed: the next sync does not download the index again.
    const index = remote.reads.index;
    await B.engine.sync();
    expect(remote.reads.index).toBe(index);
  });

  it('needed: edits made on the light device reach the other, and both notice when both changed a document', async () => {
    const remote = new MemoryProvider();
    const A = device(remote, 'needed');
    const doc = await A.repo.createDoc({ name: 'Doc', files: { 'main.tex': { kind: 'text', text: 'l1\nl2\nl3\nl4' } } });
    await edit(A, doc.id, 'l1\nl2\nl3\nl4\nl5', 'more');
    await A.engine.sync();
    const B = device(remote, 'needed');
    await B.engine.sync();
    expect(remote.reads.packs).toBe(0);

    // B edits on top of what it has: A fast-forwards from B's head file alone.
    await edit(B, doc.id, 'l1\nl2\nl3\nl4\nl5\nl6', 'B adds');
    await B.engine.sync();
    const ra = await A.engine.sync();
    expect(ra.updatedDocs).toEqual([doc.id]);
    expect(ra.diverged).toEqual([]);
    expect(await text(A, doc.id)).toBe('l1\nl2\nl3\nl4\nl5\nl6');

    // Both change it before syncing: neither silently takes the other's version.
    await edit(A, doc.id, 'L1\nl2\nl3\nl4\nl5\nl6', 'A edit');
    await edit(B, doc.id, 'l1\nl2\nl3\nl4\nl5\nL6', 'B edit');
    await A.engine.sync();
    const rb = await B.engine.sync();
    expect(rb.diverged).toEqual([doc.id]);
    expect(await text(B, doc.id)).toBe('l1\nl2\nl3\nl4\nl5\nL6');
    const ra2 = await A.engine.sync();
    expect(ra2.diverged).toEqual([doc.id]);
    expect(await text(A, doc.id)).toBe('L1\nl2\nl3\nl4\nl5\nl6');
    const dB = (await B.repo.getDoc(doc.id))!;
    await mergeDivergedHead(B.repo, doc.id, dB.divergedHeads![0]);
    await B.engine.sync();
    await A.engine.sync();
    expect(await text(A, doc.id)).toBe('L1\nl2\nl3\nl4\nl5\nL6');
  });

  it('needed: unsaved edits survive when the storage moved ahead by several versions', async () => {
    const remote = new MemoryProvider();
    const A = device(remote);
    const doc = await A.repo.createDoc({ name: 'Doc', files: { 'main.tex': { kind: 'text', text: 'a\nb\nc' } } });
    await A.engine.sync();
    const B = device(remote, 'needed');
    await B.engine.sync();
    await edit(A, doc.id, 'a\nb\nC1');
    await edit(A, doc.id, 'a\nb\nC2');
    await A.engine.sync();
    await B.repo.writeWorkText(doc.id, 'main.tex', 'A\nb\nc'); // dirty, not committed
    const r = await B.engine.sync();
    expect(r.diverged).toEqual([doc.id]);
    expect(await text(B, doc.id)).toBe('A\nb\nc');
  });

  it('saver: documents are listed, and each comes down when it is opened', async () => {
    const remote = new MemoryProvider();
    const A = device(remote);
    const one = await A.repo.createDoc({ name: 'One', files: { 'main.tex': { kind: 'text', text: 'one' } } });
    const two = await A.repo.createDoc({ name: 'Two', files: { 'main.tex': { kind: 'text', text: 'two' } } });
    await A.engine.sync();
    const B = device(remote, 'saver');
    await B.engine.sync();
    expect(remote.reads.packs + remote.reads.heads).toBe(0);
    expect((await B.repo.listDocs()).map((d) => [d.name, !!d.remoteOnly])).toEqual([
      ['One', true],
      ['Two', true],
    ]);
    // Opening one fetches it (and only it).
    expect(await text(B, one.id)).toBe('one');
    expect(remote.reads.heads).toBe(1);
    expect((await B.repo.getDoc(one.id))!.remoteOnly).toBeUndefined();
    expect((await B.repo.getDoc(two.id))!.remoteOnly).toBe(true);
    // From then on that one is kept current; the other stays a listing, and nothing is written back as "listed only".
    await edit(A, one.id, 'one!');
    await edit(A, two.id, 'two!');
    await A.engine.sync();
    await B.engine.sync();
    expect(await text(B, one.id)).toBe('one!');
    expect(remote.reads.heads).toBe(2);
    expect(remote.index).not.toContain('remoteOnly');
    expect(await text(B, two.id)).toBe('two!');
    // An edit on the saver device goes up like any other.
    await edit(B, two.id, 'two!!');
    await B.engine.sync();
    await A.engine.sync();
    expect(await text(A, two.id)).toBe('two!!');
  });

  it('reads storage written by earlier versions: mixed packs and no head files', async () => {
    const remote = new MemoryProvider();
    const A = device(remote);
    const one = await A.repo.createDoc({ name: 'One', files: { 'main.tex': { kind: 'text', text: 'one' } } });
    const two = await A.repo.createDoc({ name: 'Two', files: { 'main.tex': { kind: 'text', text: 'two' } } });
    await edit(A, one.id, 'one v2');
    await A.engine.sync();
    // As an earlier version left it: one pack for everything, no head files.
    const packs = [...remote.packs.values()].map((p) => JSON.parse(p) as Pack);
    remote.packs.clear();
    remote.heads.clear();
    const mixed: Pack = { format: 1, id: 'OLDPACK', createdAt: 1, commits: packs.flatMap((p) => p.commits), blobs: Object.assign({}, ...packs.map((p) => p.blobs)) };
    remote.packs.set(mixed.id, JSON.stringify(mixed));

    const B = device(remote, 'needed');
    await B.engine.sync();
    expect(await text(B, one.id)).toBe('one v2');
    expect(await text(B, two.id)).toBe('two');
    // A device that holds everything writes the head files, so the next light device needs no pack.
    const C = device(remote);
    await C.engine.sync();
    expect(remote.heads.size).toBe(2);
    remote.reads.packs = 0;
    const D = device(remote, 'needed');
    await D.engine.sync();
    expect(remote.reads.packs).toBe(0);
    expect(await text(D, one.id)).toBe('one v2');
  });

  it('a file shared by two documents reads on a device that has only one of them', async () => {
    const remote = new MemoryProvider();
    const A = device(remote);
    const cls = '\\ProvidesClass{mine}';
    const master = await A.repo.createDoc({ name: 'Master', files: { 'main.tex': { kind: 'text', text: tex('one') }, 'mine.cls': { kind: 'text', text: cls } } });
    await A.engine.sync();
    const variant = await createVariant(A.repo, { parentId: master.id, name: 'V', recipe: { ...emptyRecipe(), tags: ['x'] } });
    await A.engine.sync();
    const B = device(remote, 'saver');
    await B.engine.sync();
    expect(fileText((await B.repo.getWork(variant.id)).files, 'mine.cls')).toBe(cls);
    expect((await B.repo.getDoc(master.id))!.remoteOnly).toBe(true);
    // Its history too, without the master's packs.
    await B.engine.followDocs([variant.id]);
    const first = (await B.repo.docCommits(variant.id))[0];
    expect((await B.repo.readCommitFiles(first.id))['mine.cls']).toEqual({ kind: 'text', text: cls });
    expect([...remote.packs.keys()].filter((id) => id.startsWith(master.id)).length).toBe(1);
  });

  it('merges a document’s packs into one from what the device holds', async () => {
    const remote = new MemoryProvider();
    const A = device(remote, 'needed');
    const doc = await A.repo.createDoc({ name: 'Doc', files: { 'main.tex': { kind: 'text', text: 'x' } } });
    const other = await A.repo.createDoc({ name: 'Other', files: { 'main.tex': { kind: 'text', text: 'o' } } });
    await A.engine.sync();
    for (let i = 0; i < 13; i++) {
      await edit(A, doc.id, `x${i}`);
      await A.engine.sync();
    }
    const mine = () => [...remote.packs.keys()].filter((id) => id.startsWith(doc.id)).length;
    expect(mine()).toBeLessThanOrEqual(2);
    expect(remote.reads.packs).toBe(0);
    const B = device(remote);
    await B.engine.sync();
    expect(await B.repo.docCommits(doc.id)).toHaveLength(14);
    expect(await text(B, doc.id)).toBe('x12');
    expect(await text(B, other.id)).toBe('o');
  });
});
