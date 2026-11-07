import { describe, expect, it } from 'vitest';
import type { DocMeta } from '@/core/model';
import { folderView } from './folderView';

const doc = (id: string, folder?: string) => ({ id, name: id, folder, tags: [] }) as unknown as DocMeta;
const docs = [doc('cv', 'Jobs/2026'), doc('letter', 'Jobs/2026'), doc('old', 'Jobs'), doc('paper', 'Papers'), doc('loose')];

describe('folder view', () => {
  it('browses: subfolders as folders, only direct documents', () => {
    const top = folderView(docs, [], undefined, 'browse');
    expect(top.folders.map((f) => [f.path, f.count])).toEqual([
      ['Jobs', 3],
      ['Papers', 1],
    ]);
    expect(top.docs.map((d) => d.id)).toEqual(['loose']);
    expect(top.containerOf.get('cv')).toBe('Jobs');

    const jobs = folderView(docs, ['Jobs/Drafts'], 'Jobs', 'browse');
    expect(jobs.folders.map((f) => [f.name, f.count])).toEqual([
      ['2026', 2],
      ['Drafts', 0],
    ]);
    expect(jobs.docs.map((d) => d.id)).toEqual(['old']);
  });

  it('only folders at the top level when every document is filed', () => {
    const v = folderView([doc('a', 'A'), doc('b', 'B/x')], [], undefined, 'browse');
    expect(v.folders.map((f) => f.name)).toEqual(['A', 'B']);
    expect(v.docs).toEqual([]);
  });

  it('groups everything inside the folder by folder', () => {
    const all = folderView(docs, [], undefined, 'grouped');
    expect(all.groups.map((g) => [g.label, g.depth, g.docs.map((d) => d.id)])).toEqual([
      ['Not in a folder', 0, ['loose']],
      ['Jobs', 0, ['old']],
      ['Jobs/2026', 1, ['cv', 'letter']],
      ['Papers', 0, ['paper']],
    ]);
    const jobs = folderView(docs, [], 'Jobs', 'grouped');
    expect(jobs.groups.map((g) => g.label)).toEqual(['Jobs', '2026']);
    expect(jobs.docs).toHaveLength(3);
  });
});
