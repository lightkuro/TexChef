import { describe, expect, it } from 'vitest';
import type { DocMeta } from '@/core/model';
import { CARD_W, docItems, gridCell, layoutGroups, layoutMap } from './mapLayout';

const doc = (id: string, parent?: string): DocMeta =>
  ({ id, name: id, mainFile: 'main.tex', engine: 'pdflatex', tags: [], createdAt: 0, updatedAt: 0, head: null, parent: parent ? { docId: parent, baseCommitId: 'c' } : undefined }) as unknown as DocMeta;

const docs = [doc('m'), doc('a', 'm'), doc('b', 'm'), doc('c', 'a')];

describe('map layout', () => {
  it('puts originals left of their variants, or above them when vertical', () => {
    const h = layoutMap(docItems(docs), { direction: 'horizontal', fullPages: false, snap: false });
    expect(h.get('a')!.x).toBeGreaterThan(h.get('m')!.x + CARD_W);
    expect(h.get('c')!.x).toBeGreaterThan(h.get('a')!.x + CARD_W);
    const v = layoutMap(docItems(docs), { direction: 'vertical', fullPages: false, snap: false });
    expect(v.get('a')!.y).toBeGreaterThan(v.get('m')!.y);
    expect(v.get('c')!.y).toBeGreaterThan(v.get('a')!.y);
    expect(v.get('a')!.y).toBe(v.get('b')!.y);
  });

  it('snaps cards to distinct grid cells, a free cell between generations', () => {
    for (const direction of ['horizontal', 'vertical'] as const) {
      for (const fullPages of [false, true]) {
        const cell = gridCell(fullPages);
        const pos = layoutMap(docItems(docs), { direction, fullPages, snap: true });
        const cells = new Set<string>();
        for (const p of pos.values()) {
          expect(p.x % cell.w).toBe(0);
          expect(p.y % cell.h).toBe(0);
          cells.add(`${p.x},${p.y}`);
        }
        expect(cells.size).toBe(docs.length);
        const axis = direction === 'horizontal' ? 'x' : 'y';
        const step = direction === 'horizontal' ? cell.w : cell.h;
        expect(pos.get('a')![axis] - pos.get('m')![axis]).toBe(2 * step);
      }
    }
  });

  it('stacks groups without overlap', () => {
    const r = layoutGroups(
      [
        { id: 'g1', items: docItems(docs) },
        { id: 'g2', items: docItems([doc('x')]) },
      ],
      { direction: 'horizontal', fullPages: false },
    );
    const a = r.frames.get('g1')!;
    const b = r.frames.get('g2')!;
    const overlap = !(b.x >= a.x + a.w || a.x >= b.x + b.w || b.y >= a.y + a.h || a.y >= b.y + b.h);
    expect(overlap).toBe(false);
    for (const p of r.nodes.values()) expect(p.x).toBeGreaterThan(0);
  });

  it('keeps dragged positions, snapped and out of the way of other cards', () => {
    const cell = gridCell(false);
    const pos = layoutMap(docItems(docs), { direction: 'horizontal', fullPages: false, snap: true, saved: { b: { x: cell.w * 5 + 30, y: 12 } } });
    expect(pos.get('b')).toEqual({ x: cell.w * 5, y: 0 });
    const free = layoutMap(docItems(docs), { direction: 'horizontal', fullPages: false, snap: false, saved: { b: { x: 999, y: 7 } } });
    expect(free.get('b')).toEqual({ x: 999, y: 7 });
  });
});
