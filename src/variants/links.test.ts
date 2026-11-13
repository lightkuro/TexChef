import { beforeEach, describe, expect, it } from 'vitest';
import { RCDatabase } from '@/storage/db';
import { Repo, fileText } from '@/core/repo';
import { emptyRecipe } from '@/core/model';
import { applyPull, applyPush, canLink, createVariant, forkDocument, linkAsVariant, makeOriginal, planPull, planPush, pushBlockedReason, restoreLinks, unlinkVariant } from './ops';

const TEXT = ['\\documentclass{article}', '\\begin{document}', 'One.', '', 'Two.', '', 'Three.', '', 'Four.', '\\end{document}'].join('\n');
const tex = (text: string) => ({ 'main.tex': { kind: 'text' as const, text } });
let n = 0;

describe('linking documents', () => {
  let repo: Repo;
  beforeEach(() => {
    repo = new Repo(new RCDatabase(`links-${n++}`));
  });
  const doc = async (id: string) => (await repo.getDoc(id))!;
  const text = async (id: string) => fileText((await repo.getWork(id)).files, 'main.tex')!;
  const edit = async (id: string, from: string, to: string, message = 'edit') => {
    await repo.writeWorkText(id, 'main.tex', (await text(id)).replace(from, to));
    return (await repo.commitWork(id, message))!;
  };

  it('links two unrelated documents without touching their text; updates count from then on', async () => {
    const a = await repo.createDoc({ name: 'A', files: tex(TEXT) });
    const b = await repo.createDoc({ name: 'B', files: tex(TEXT.replace('Two.', 'Two, in B.')) });
    const before = [await text(a.id), await text(b.id)];
    const undo = await linkAsVariant(repo, b.id, a.id);
    expect((await doc(b.id)).parent).toEqual({ docId: a.id, baseCommitId: a.head });
    expect((await doc(b.id)).recipe).toBeUndefined();
    // The moment the link changed is recorded (a link can change without a new version, so sync needs it).
    expect((await doc(b.id)).linkedAt).toBeGreaterThan(0);
    expect((await doc(a.id)).linkedAt).toBeUndefined();
    expect([await text(a.id), await text(b.id)]).toEqual(before);
    expect((await doc(a.id)).head).toBe(a.head);
    expect((await doc(b.id)).head).toBe(b.head);
    expect(await repo.commitsBehindParent(await doc(b.id))).toBe(0);
    // A later change to the original is offered, and B keeps its own wording.
    await edit(a.id, 'Four.', 'Four, new.');
    expect(await repo.commitsBehindParent(await doc(b.id))).toBe(1);
    const plan = await planPull(repo, b.id);
    expect(plan.conflictFiles).toEqual([]);
    expect(fileText(plan.files, 'main.tex')).toContain('Two, in B.');
    expect(fileText(plan.files, 'main.tex')).toContain('Four, new.');
    // Undo puts things back as they were.
    await restoreLinks(repo, undo);
    expect((await doc(b.id)).parent).toBeUndefined();
  });

  it('refuses itself, deleted or missing documents, and loops', async () => {
    const a = await repo.createDoc({ name: 'A', files: tex(TEXT) });
    const b = await forkDocument(repo, a.id, 'B');
    const c = await forkDocument(repo, b.id, 'C');
    const d = await repo.createDoc({ name: 'D', files: tex(TEXT) });
    await expect(linkAsVariant(repo, a.id, a.id)).rejects.toThrow(/itself/);
    await expect(linkAsVariant(repo, a.id, 'nope')).rejects.toThrow(/no longer exists/);
    // A is where B and C come from: it can't become a variant of either.
    await expect(linkAsVariant(repo, a.id, b.id)).rejects.toThrow(/circle/);
    await expect(linkAsVariant(repo, a.id, c.id)).rejects.toThrow(/circle/);
    const all = await repo.db.docs.toArray();
    expect(canLink(all, a.id, c.id).ok).toBe(false);
    expect(canLink(all, c.id, a.id).ok).toBe(true);
    expect(canLink(all, d.id, c.id).ok).toBe(true);
    expect(canLink(all, c.id, b.id)).toEqual({ ok: false, reason: '“C” is already a variant of “B”.' });
    await repo.deleteDoc(d.id);
    await expect(linkAsVariant(repo, c.id, d.id)).rejects.toThrow(/no longer exists/);
    await expect(linkAsVariant(repo, d.id, a.id)).rejects.toThrow(/no longer exists/);
    // Nothing changed along the way.
    expect((await doc(c.id)).parent?.docId).toBe(b.id);
    expect((await doc(a.id)).parent).toBeUndefined();
  });

  it('a document has one original: linking again replaces it, and drops how the old variant was filtered', async () => {
    const a = await repo.createDoc({ name: 'A', files: tex(TEXT) });
    const other = await repo.createDoc({ name: 'Other', files: tex(TEXT) });
    const v = await createVariant(repo, { parentId: a.id, name: 'V', recipe: { ...emptyRecipe(), tags: ['x'] } });
    expect((await doc(v.id)).recipe).toBeDefined();
    // Linking to the original it already has changes nothing.
    await linkAsVariant(repo, v.id, a.id);
    expect((await doc(v.id)).recipe).toBeDefined();
    expect((await doc(v.id)).parent).toEqual(v.parent);
    const undo = await linkAsVariant(repo, v.id, other.id);
    expect((await doc(v.id)).parent).toEqual({ docId: other.id, baseCommitId: other.head });
    expect((await doc(v.id)).recipe).toBeUndefined();
    await restoreLinks(repo, undo);
    expect((await doc(v.id)).parent).toEqual(v.parent);
    expect((await doc(v.id)).recipe).toEqual(v.recipe);
  });

  it('unlinks, and linking again picks up where the two last agreed', async () => {
    const a = await repo.createDoc({ name: 'A', files: tex(TEXT) });
    const b = await forkDocument(repo, a.id, 'B');
    await edit(a.id, 'One.', 'One, changed.');
    const pull = await planPull(repo, b.id);
    await applyPull(repo, b.id, pull.files, pull.parentHead);
    const agreed = (await doc(a.id)).head!;
    await edit(a.id, 'Four.', 'Four, later.');
    const mine = await text(b.id);
    const undo = await unlinkVariant(repo, b.id);
    expect((await doc(b.id)).parent).toBeUndefined();
    expect(await text(b.id)).toBe(mine);
    await expect(unlinkVariant(repo, b.id)).rejects.toThrow(/not a variant/);
    // Linked again: only what the original changed since they agreed is waiting.
    await linkAsVariant(repo, b.id, a.id);
    expect((await doc(b.id)).parent).toEqual({ docId: a.id, baseCommitId: agreed });
    expect(await repo.commitsBehindParent(await doc(b.id))).toBe(1);
    // Undoing the unlink also restores the link.
    await unlinkVariant(repo, b.id);
    await restoreLinks(repo, undo);
    expect((await doc(b.id)).parent?.docId).toBe(a.id);
  });

  it('two variants of the same master: linking one to the other counts updates from now', async () => {
    const m = await repo.createDoc({ name: 'M', files: tex(TEXT) });
    const x = await forkDocument(repo, m.id, 'X');
    const y = await forkDocument(repo, m.id, 'Y');
    await edit(x.id, 'One.', 'One, in X.');
    await linkAsVariant(repo, y.id, x.id);
    const head = (await doc(x.id)).head;
    expect((await doc(y.id)).parent).toEqual({ docId: x.id, baseCommitId: head });
    expect(await repo.commitsBehindParent(await doc(y.id))).toBe(0);
  });

  it('makes a variant the original: the two swap, other variants stay, and a grand-original is kept', async () => {
    const g = await repo.createDoc({ name: 'G', files: tex(TEXT) });
    const o = await forkDocument(repo, g.id, 'O');
    const v = await forkDocument(repo, o.id, 'V');
    const sibling = await forkDocument(repo, o.id, 'Sibling');
    await edit(v.id, 'Two.', 'Two, from V.');
    const texts = [await text(g.id), await text(o.id), await text(v.id)];
    const undo = await makeOriginal(repo, v.id);
    expect([await text(g.id), await text(o.id), await text(v.id)]).toEqual(texts);
    // V took O's place under G; O is now V's variant; O's other variant is still O's.
    expect((await doc(v.id)).parent?.docId).toBe(g.id);
    expect((await doc(o.id)).parent?.docId).toBe(v.id);
    expect((await doc(sibling.id)).parent?.docId).toBe(o.id);
    // O is offered exactly V's own change.
    expect(await repo.commitsBehindParent(await doc(o.id))).toBe(1);
    const plan = await planPull(repo, o.id);
    expect(plan.conflictFiles).toEqual([]);
    expect(fileText(plan.files, 'main.tex')).toBe(await text(v.id));
    await restoreLinks(repo, undo);
    expect((await doc(v.id)).parent).toEqual(v.parent);
    expect((await doc(o.id)).parent).toEqual(o.parent);
    // A document with no original can't be promoted.
    await expect(makeOriginal(repo, g.id)).rejects.toThrow(/nothing to swap/);
  });

  it('sends a variant’s changes to its original; afterwards the variant has nothing waiting', async () => {
    const a = await repo.createDoc({ name: 'A', files: tex(TEXT) });
    const b = await forkDocument(repo, a.id, 'B');
    await repo.writeWorkText(b.id, 'main.tex', (await text(b.id)).replace('Three.', 'Three, from B.'));
    const plan = await planPush(repo, b.id);
    expect(plan.conflictFiles).toEqual([]);
    expect(plan.changedPaths).toEqual(['main.tex']);
    expect(plan.originalAhead).toBe(false);
    await applyPush(repo, b.id, plan.files, plan);
    expect(await text(a.id)).toContain('Three, from B.');
    const head = (await repo.getCommit((await doc(a.id)).head!))!;
    expect(head.kind).toBe('push-up');
    expect(head.message).toBe('Changes from “B”');
    expect(head.parents).toEqual([a.head, (await doc(b.id)).head]);
    expect((await doc(b.id)).parent).toEqual({ docId: a.id, baseCommitId: head.id });
    expect(await repo.commitsBehindParent(await doc(b.id))).toBe(0);
    // Restore in the original undoes it.
    await repo.restore(a.id, a.head!);
    expect(await text(a.id)).toBe(TEXT);
  });

  it('sending keeps what the original changed meanwhile, reports clashes, and still offers the original’s updates', async () => {
    const a = await repo.createDoc({ name: 'A', files: tex(TEXT) });
    const b = await forkDocument(repo, a.id, 'B');
    await edit(a.id, 'One.', 'One, from A.');
    await edit(b.id, 'Four.', 'Four, from B.');
    const plan = await planPush(repo, b.id);
    expect(plan.originalAhead).toBe(true);
    expect(plan.conflictFiles).toEqual([]);
    await applyPush(repo, b.id, plan.files, plan);
    expect(await text(a.id)).toContain('One, from A.');
    expect(await text(a.id)).toContain('Four, from B.');
    // B hasn't taken A's change yet: it is still waiting, and taking it is clean.
    expect((await doc(b.id)).parent?.baseCommitId).toBe(a.head);
    expect(await repo.commitsBehindParent(await doc(b.id))).toBeGreaterThan(0);
    const pull = await planPull(repo, b.id);
    expect(pull.conflictFiles).toEqual([]);
    expect(fileText(pull.files, 'main.tex')).toBe(await text(a.id));
    // Both changed the same line: a conflict to settle before anything is sent.
    await edit(a.id, 'Two.', 'Two, says A.');
    await edit(b.id, 'Two.', 'Two, says B.');
    const clash = await planPush(repo, b.id);
    expect(clash.conflictFiles).toEqual([{ path: 'main.tex', conflicts: 1 }]);
    // The original moved on since the plan was made: refuse rather than overwrite.
    await edit(a.id, 'Three.', 'Three, again.');
    await expect(applyPush(repo, b.id, clash.files, clash)).rejects.toThrow(/changed while you were looking/);
  });

  it('does not send a filtered variant back as a whole', async () => {
    const a = await repo.createDoc({ name: 'A', files: tex(TEXT) });
    const v = await createVariant(repo, { parentId: a.id, name: 'V', recipe: { ...emptyRecipe(), tags: ['x'] } });
    expect(pushBlockedReason(await doc(v.id))).toMatch(/only some of the original/);
    expect(pushBlockedReason(await doc(a.id))).toMatch(/no original/);
    await expect(planPush(repo, v.id)).rejects.toThrow(/only some of the original/);
  });

  it('restoring a variant to before it took updates offers those updates again', async () => {
    const a = await repo.createDoc({ name: 'A', files: tex(TEXT) });
    const b = await forkDocument(repo, a.id, 'B');
    const mine = await edit(b.id, 'Two.', 'Two, mine.');
    await edit(a.id, 'One.', 'One, updated.');
    const pull = await planPull(repo, b.id);
    await applyPull(repo, b.id, pull.files, pull.parentHead);
    const pulled = (await doc(b.id)).head!;
    expect(await repo.commitsBehindParent(await doc(b.id))).toBe(0);
    // Back to before the update: it is waiting again, counted from the version B was made from.
    const restored = (await repo.restore(b.id, mine.id))!;
    expect(restored.restoredFrom).toBe(mine.id);
    expect(await text(b.id)).not.toContain('One, updated.');
    expect((await doc(b.id)).parent?.baseCommitId).toBe(a.head);
    expect(await repo.commitsBehindParent(await doc(b.id))).toBe(1);
    const again = await planPull(repo, b.id);
    expect(fileText(again.files, 'main.tex')).toContain('One, updated.');
    expect(fileText(again.files, 'main.tex')).toContain('Two, mine.');
    // Restoring that restored version later keeps the same answer (it stands where the old one stood).
    await edit(b.id, 'Four.', 'Four, more.');
    await repo.restore(b.id, restored.id);
    expect((await doc(b.id)).parent?.baseCommitId).toBe(a.head);
    // Forward again to the version that had the update: nothing is waiting.
    await repo.restore(b.id, pulled);
    expect(await text(b.id)).toContain('One, updated.');
    expect((await doc(b.id)).parent?.baseCommitId).toBe(pull.parentHead);
    expect(await repo.commitsBehindParent(await doc(b.id))).toBe(0);
    // A document that is nobody's variant is restored as before.
    await edit(a.id, 'Three.', 'Three!');
    await repo.restore(a.id, a.head!);
    expect((await doc(a.id)).parent).toBeUndefined();
  });
});
