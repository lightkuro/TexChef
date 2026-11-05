import { describe, expect, it } from 'vitest';
import { RCDatabase } from '@/storage/db';
import { Repo, fileText } from '@/core/repo';
import { MemoryProvider } from '@/storage/providers/memory';
import { SyncEngine, mergeDivergedHead } from './engine';
import { createVariant } from '@/variants/ops';
import { emptyRecipe } from '@/core/model';

let n = 0;
function device(provider: MemoryProvider) {
  const repo = new Repo(new RCDatabase(`sync-${n++}`));
  return { repo, engine: new SyncEngine(repo, provider) };
}

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

    const r2 = await B.engine.sync();
    expect(r2.pulledPacks).toBe(1);
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
});
