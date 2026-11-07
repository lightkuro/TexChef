import { describe, expect, it } from 'vitest';
import type { DocMeta } from '@/core/model';
import { readablePaths } from './readablePaths';

const doc = (id: string, name: string, folder?: string, createdAt = 0) => ({ id, name, folder, createdAt }) as unknown as DocMeta;

describe('readable backup paths', () => {
  it('puts each document in its folder, without clashes', () => {
    const p = readablePaths([
      doc('a', 'Resume', 'Jobs/2026', 1),
      doc('b', 'Resume', 'Jobs/2026', 2),
      doc('c', 'Jobs', undefined, 3),
      doc('d', 'Bad/Name: x', undefined, 4),
      doc('e', '.texchef', undefined, 5),
    ]);
    expect(p).toEqual({
      a: 'Jobs/2026/Resume',
      b: 'Jobs/2026/Resume (2)',
      // "Jobs" is also a folder of other documents: the document gets its own name.
      c: 'Jobs (2)',
      d: 'Bad-Name- x',
      e: '.texchef (2)',
    });
  });
});
