import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RCDatabase } from '@/storage/db';
import { Repo, fileText } from './repo';
import { merge3, findConflicts, resolveConflict, resolveAll } from './merge';
import { emptyRecipe } from './model';
import { applyPull, createVariant, newParentBlocks, planPull, pushBlockToParent, forkDocument, saveWorkAsVariant } from '@/variants/ops';

const master = readFileSync(new URL('../templates/resume-master.tex', import.meta.url), 'utf8');
let n = 0;

describe('merge3', () => {
  it('merges non-overlapping edits and marks conflicts', () => {
    const base = 'a\nb\nc\nd';
    expect(merge3('A\nb\nc\nd', base, 'a\nb\nc\nD').text).toBe('A\nb\nc\nD');
    const m = merge3('a\nX\nc\nd', base, 'a\nY\nc\nd', { ours: 'mine', theirs: 'master' });
    expect(m.conflicts).toBe(1);
    expect(m.text).toBe('a\n<<<<<<< mine\nX\n=======\nY\n>>>>>>> master\nc\nd');
    const c = findConflicts(m.text);
    expect(c[0].ours).toEqual(['X']);
    expect(resolveConflict(m.text, 0, 'theirs')).toBe('a\nY\nc\nd');
    expect(resolveAll(m.text, 'both')).toBe('a\nX\nY\nc\nd');
  });
});

describe('repo + variants', () => {
  let repo: Repo;
  beforeEach(() => {
    repo = new Repo(new RCDatabase(`test-${n++}`));
  });

  it('commits, detects no-op saves, restores and tracks ancestry', async () => {
    const doc = await repo.createDoc({ name: 'Master', files: { 'main.tex': { kind: 'text', text: master } } });
    expect(await repo.commitWork(doc.id, 'nothing')).toBeNull();
    await repo.writeWorkText(doc.id, 'main.tex', master.replace('Jordan Rivera', 'J. Rivera'));
    const c2 = (await repo.commitWork(doc.id, 'rename'))!;
    expect(c2.parents).toEqual([doc.head]);
    expect(await repo.isAncestor(doc.head!, c2.id)).toBe(true);
    expect(await repo.isAncestor(c2.id, doc.head!)).toBe(false);
    const r = (await repo.restore(doc.id, doc.head!))!;
    expect(r.kind).toBe('restore');
    expect(fileText((await repo.getWork(doc.id)).files, 'main.tex')).toBe(master);
    expect(await repo.docCommits(doc.id)).toHaveLength(3);
  });

  it('creates a filtered variant, pulls parent edits cleanly, and pushes a block back up', async () => {
    const m = await repo.createDoc({ name: 'Master', files: { 'main.tex': { kind: 'text', text: master } } });
    const v = await createVariant(repo, { parentId: m.id, name: 'Frontend', recipe: { ...emptyRecipe(), tags: ['frontend'] } });
    const vText = fileText((await repo.getWork(v.id)).files, 'main.tex')!;
    expect(vText).toContain('customer dashboard');
    expect(vText).not.toContain('streaming ingestion');
    expect(await repo.commitsBehindParent(v)).toBe(0);

    // Master edits: one in a block the variant has, one in a block it filtered out, plus contact info.
    let mt = master
      .replace('improving load time by 60\\%', 'improving load time by 70\\%')
      .replace('40k events/s', '90k events/s')
      .replace('(555) 010-2030', '(555) 999-0000');
    await repo.writeWorkText(m.id, 'main.tex', mt);
    await repo.commitWork(m.id, 'update numbers');
    // Variant rewords a different bullet.
    await repo.writeWorkText(v.id, 'main.tex', vText.replace('shared component library', 'shared React component library'));
    expect(await repo.commitsBehindParent((await repo.getDoc(v.id))!)).toBe(1);

    const plan = await planPull(repo, v.id);
    expect(plan.conflictFiles).toEqual([]);
    const merged = fileText(plan.files, 'main.tex')!;
    expect(merged).toContain('70\\%');
    expect(merged).toContain('(555) 999-0000');
    expect(merged).toContain('shared React component library');
    expect(merged).not.toContain('90k events/s');
    await applyPull(repo, v.id, plan.files, plan.parentHead);
    const after = (await repo.getDoc(v.id))!;
    expect(after.parent!.baseCommitId).toBe((await repo.getDoc(m.id))!.head);
    const mergeCommit = (await repo.getCommit(after.head!))!;
    expect(mergeCommit.kind).toBe('merge');
    expect(mergeCommit.parents).toHaveLength(2);
    expect(await repo.commitsBehindParent(after)).toBe(0);

    // Push the reworded bullet back to master.
    const pushed = await pushBlockToParent(repo, v.id, 'contoso-frontend');
    expect(pushed.ok).toBe(true);
    mt = fileText((await repo.getWork(m.id)).files, 'main.tex')!;
    expect(mt).toContain('shared React component library');
    // The next pull is clean (same change on both sides).
    const again = await planPull(repo, v.id);
    expect(again.conflictFiles).toEqual([]);
  });

  it('reports conflicts when both sides edit the same line, and lists new parent blocks', async () => {
    const m = await repo.createDoc({ name: 'Master', files: { 'main.tex': { kind: 'text', text: master } } });
    const v = await createVariant(repo, { parentId: m.id, name: 'Backend', recipe: { ...emptyRecipe(), tags: ['backend'] } });
    const vt = fileText((await repo.getWork(v.id)).files, 'main.tex')!;
    await repo.writeWorkText(v.id, 'main.tex', vt.replace('2M requests/day', '3M requests/day'));
    const withNew = master
      .replace('2M requests/day', '2.5M requests/day')
      .replace('%% @block contoso-oncall tags=infra', '%% @block contoso-new tags=backend\n  \\rcItem{New bullet.}\n  %% @end\n  %% @block contoso-oncall tags=infra')
      .replace('%% @block northwind-lead tags=lead', '%% @block northwind-mentor tags=lead\n  \\rcItem{Mentoring.}\n  %% @end\n  %% @block northwind-lead tags=lead');
    await repo.writeWorkText(m.id, 'main.tex', withNew);
    await repo.commitWork(m.id, 'edits');
    const fresh = (await repo.getDoc(v.id))!;
    expect((await newParentBlocks(repo, fresh)).map((x) => x.block.id).sort()).toEqual(['contoso-new', 'northwind-mentor']);
    const plan = await planPull(repo, v.id);
    expect(plan.conflictFiles).toEqual([{ path: 'main.tex', conflicts: 1 }]);
    const text = fileText(plan.files, 'main.tex')!;
    // Tag mode auto-includes the new backend bullet, but not the lead one.
    expect(text).toContain('New bullet.');
    expect(text).not.toContain('Mentoring.');
    // Pushing the conflicting block is refused unless forced.
    const push = await pushBlockToParent(repo, v.id, 'contoso-api');
    expect(push.parentChanged).toBe(true);
    expect((await pushBlockToParent(repo, v.id, 'contoso-api', true)).ok).toBe(true);
  });

  it('saves unsaved edits as a new variant and puts the original back', async () => {
    const m = await repo.createDoc({ name: 'Master', files: { 'main.tex': { kind: 'text', text: master } } });
    await repo.writeWorkText(m.id, 'main.tex', master.replace('Jordan Rivera', 'Jo Rivera'));
    const v = await saveWorkAsVariant(repo, m.id, 'Short');
    expect(v.parent).toEqual({ docId: m.id, baseCommitId: m.head });
    expect(fileText((await repo.getWork(v.id)).files, 'main.tex')).toContain('Jo Rivera');
    const back = await repo.getWork(m.id);
    expect(fileText(back.files, 'main.tex')).toBe(master);
    expect(back.dirty).toBe(false);
    expect((await repo.getDoc(m.id))!.head).toBe(m.head);
  });

  it('forks keep every parent change', async () => {
    const m = await repo.createDoc({ name: 'Master', files: { 'main.tex': { kind: 'text', text: master } } });
    const f = await forkDocument(repo, m.id, 'Copy');
    await repo.writeWorkText(m.id, 'main.tex', master + '\n% tail');
    await repo.commitWork(m.id, 'tail');
    const plan = await planPull(repo, f.id);
    expect(fileText(plan.files, 'main.tex')).toContain('% tail');
  });
});
