import dagre from '@dagrejs/dagre';
import type { DocMeta } from '@/core/model';
import type { MapDirection, Pos } from './positions';

/** Card size on the map. */
export const CARD_W = 232;
export const CARD_H = 210;
/** Card height when it shows the whole first page. */
export const CARD_H_FULL = 392;
/** Space between grid cells. */
export const GRID_GAP = 40;

export interface MapLayoutOptions {
  direction: MapDirection;
  fullPages: boolean;
  snap: boolean;
  /** Positions the user dragged cards to; they win over the automatic layout. */
  saved?: Record<string, Pos>;
}

export function cardHeight(fullPages: boolean): number {
  return fullPages ? CARD_H_FULL : CARD_H;
}

/** One grid cell: a card plus the gap around it. */
export function gridCell(fullPages: boolean): { w: number; h: number } {
  return { w: CARD_W + GRID_GAP, h: cardHeight(fullPages) + GRID_GAP };
}

/**
 * Top-left position of every card. Originals come before their variants: left to right, or top to
 * bottom. With `snap`, cards sit on grid cells, one empty cell between generations so the lines
 * and their labels have room, and no two cards share a cell.
 */
export function layoutMap(docs: DocMeta[], opts: MapLayoutOptions): Map<string, Pos> {
  const vertical = opts.direction === 'vertical';
  const W = CARD_W;
  const H = cardHeight(opts.fullPages);
  const cell = gridCell(opts.fullPages);
  const g = new dagre.graphlib.Graph();
  g.setGraph(
    opts.snap
      ? { rankdir: vertical ? 'TB' : 'LR', nodesep: GRID_GAP, ranksep: vertical ? 2 * cell.h - H : 2 * cell.w - W, marginx: 0, marginy: 0 }
      : { rankdir: vertical ? 'TB' : 'LR', nodesep: vertical ? 48 : 28, ranksep: vertical ? 120 : 140, marginx: 20, marginy: 20 },
  );
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(docs.map((d) => d.id));
  for (const d of docs) g.setNode(d.id, { width: W, height: H });
  for (const d of docs) if (d.parent && ids.has(d.parent.docId)) g.setEdge(d.parent.docId, d.id);
  dagre.layout(g);

  const out = new Map<string, Pos>();
  const auto: [string, Pos][] = [];
  for (const d of docs) {
    const n = g.node(d.id);
    const saved = opts.saved?.[d.id];
    if (saved) out.set(d.id, saved);
    else auto.push([d.id, { x: n.x - W / 2, y: n.y - H / 2 }]);
  }
  if (!opts.snap) {
    for (const [id, p] of auto) out.set(id, p);
    return out;
  }
  // Snap: saved cards first (they were placed by hand), then the automatic ones into free cells.
  const taken = new Set<string>();
  const place = (id: string, p: Pos) => {
    let cx = Math.round(p.x / cell.w);
    let cy = Math.round(p.y / cell.h);
    // Move along the sibling axis until a free cell turns up.
    for (let i = 0; taken.has(`${cx},${cy}`) && i < 500; i++) {
      if (vertical) cx++;
      else cy++;
    }
    taken.add(`${cx},${cy}`);
    out.set(id, { x: cx * cell.w, y: cy * cell.h });
  };
  for (const [id, p] of [...out]) place(id, p);
  for (const [id, p] of auto) place(id, p);
  return out;
}
