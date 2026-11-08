import { describe, expect, it } from 'vitest';
import type { Commit } from '@/core/model';
import { editStats, versionNumbers } from './versionStats';

const c = (id: string, kind: Commit['kind'], t: number): Commit => ({ id, docId: 'd', parents: [], tree: {}, message: '', kind, createdAt: t });

describe('version numbers', () => {
  it('numbers saved versions 1, 2, 3 and autosaves after them as 2.1, 2.2', () => {
    const n = versionNumbers([c('a', 'create', 1), c('b', 'auto', 2), c('d', 'save', 4), c('e', 'auto', 5), c('f', 'auto', 6), c('g', 'save', 7)].reverse());
    expect(Object.fromEntries(n)).toEqual({ a: '1', b: '1.1', d: '2', e: '2.1', f: '2.2', g: '3' });
  });
});

describe('edit counts', () => {
  const t = (text: string) => ({ kind: 'text' as const, text });
  it('counts added and removed lines against the version before', () => {
    expect(editStats({ 'main.tex': t('a\nb\nc') }, { 'main.tex': t('a\nB\nc\nd') })).toEqual({ added: 2, removed: 1, files: 1 });
  });
  it('counts a first version as all added, and new or deleted files', () => {
    expect(editStats(undefined, { 'main.tex': t('a\nb') })).toEqual({ added: 2, removed: 0, files: 1 });
    expect(editStats({ 'x.tex': t('x'), 'main.tex': t('a') }, { 'main.tex': t('a') })).toEqual({ added: 0, removed: 1, files: 1 });
  });
});
