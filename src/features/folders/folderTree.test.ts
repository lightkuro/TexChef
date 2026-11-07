import { describe, expect, it } from 'vitest';
import { buildFolderTree, cleanFolder, flattenTree, inFolder, renamedFolder } from './folderTree';

describe('folders', () => {
  it('builds a counted tree with parents and empty folders', () => {
    const tree = buildFolderTree(['Applications/2026', 'Applications/2026', 'Applications', 'Papers', undefined], ['Archive/Old']);
    expect(flattenTree(tree).map((n) => [n.path, n.count, n.depth])).toEqual([
      ['Applications', 3, 0],
      ['Applications/2026', 2, 1],
      ['Archive', 0, 0],
      ['Archive/Old', 0, 1],
      ['Papers', 1, 0],
    ]);
    expect(flattenTree(tree, new Set(['Applications'])).map((n) => n.path)).toEqual(['Applications', 'Archive', 'Archive/Old', 'Papers']);
  });

  it('cleans paths and renames subtrees', () => {
    expect(cleanFolder('  Jobs //  2026 /')).toBe('Jobs/2026');
    expect(cleanFolder(' / ')).toBeUndefined();
    expect(inFolder('Jobs/2026', 'Jobs')).toBe(true);
    expect(inFolder('Jobsite', 'Jobs')).toBe(false);
    expect(renamedFolder('Jobs/2026/Google', 'Jobs', 'Applications')).toBe('Applications/2026/Google');
    expect(renamedFolder('Jobs/2026', 'Jobs/2026', undefined)).toBeUndefined();
    expect(renamedFolder('Papers', 'Jobs', 'X')).toBe('Papers');
  });
});
