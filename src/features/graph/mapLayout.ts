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

/** Something on the map (a document or a folder) and the items it comes from. */
export interface LayoutItem {
  id: string;
  parents: string[];
}

/** Map items for documents: each linked to its original when that is on the map too. */
export function docItems(docs: DocMeta[]): LayoutItem[] {
  const ids = new Set(docs.map((d) => d.id));
  return docs.map((d) => ({ id: d.id, parents: d.parent && ids.has(d.parent.docId) ? [d.parent.docId] : [] }));
}

/**
 * Top-left position of every card. Originals come before their variants: left to right, or top to
 * bottom. With `snap`, cards sit on grid cells, one empty cell between generations so the lines
 * and their labels have room, and no two cards share a cell.
 */
export function layoutMap(items: LayoutItem[], opts: MapLayoutOptions): Map<string, Pos> {
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
  const ids = new Set(items.map((d) => d.id));
  for (const d of items) g.setNode(d.id, { width: W, height: H });
  for (const d of items) for (const p of d.parents) if (ids.has(p) && p !== d.id) g.setEdge(p, d.id);
  dagre.layout(g);

  const out = new Map<string, Pos>();
  const auto: [string, Pos][] = [];
  for (const d of items) {
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

/** Space inside a group frame around its cards, and the height of its title. */
export const GROUP_PAD = 24;
export const GROUP_HEADER = 34;
const GROUP_GAP = 56;

export interface GroupLayout {
  /** Frame of each group (top-left and size). */
  frames: Map<string, { x: number; y: number; w: number; h: number }>;
  /** Card positions relative to their group's frame. */
  nodes: Map<string, Pos>;
}

/**
 * Lay out groups of cards (documents per folder): each group on its own, then the groups in rows,
 * left to right, wrapping so the whole map is roughly as wide as it is tall.
 */
export function layoutGroups(groups: { id: string; items: LayoutItem[] }[], opts: Omit<MapLayoutOptions, 'snap' | 'saved'>): GroupLayout {
  const W = CARD_W;
  const H = cardHeight(opts.fullPages);
  const frames = new Map<string, { x: number; y: number; w: number; h: number }>();
  const nodes = new Map<string, Pos>();
  const sized: { id: string; w: number; h: number }[] = [];
  for (const g of groups) {
    const pos = layoutMap(g.items, { ...opts, snap: false });
    const xs = [...pos.values()].map((p) => p.x);
    const ys = [...pos.values()].map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX + W + 2 * GROUP_PAD;
    const h = Math.max(...ys) - minY + H + 2 * GROUP_PAD + GROUP_HEADER;
    for (const [id, p] of pos) nodes.set(id, { x: p.x - minX + GROUP_PAD, y: p.y - minY + GROUP_PAD + GROUP_HEADER });
    sized.push({ id: g.id, w, h });
  }
  // Rows of groups, wrapping at a width that keeps the whole map about as wide as it is tall (a bit wider).
  const area = sized.reduce((n, g) => n + (g.w + GROUP_GAP) * (g.h + GROUP_GAP), 0);
  const rowWidth = Math.max(...sized.map((g) => g.w), Math.sqrt(area) * 1.4);
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const g of sized) {
    if (x > 0 && x + g.w > rowWidth) {
      x = 0;
      y += rowH + GROUP_GAP;
      rowH = 0;
    }
    frames.set(g.id, { x, y, w: g.w, h: g.h });
    x += g.w + GROUP_GAP;
    rowH = Math.max(rowH, g.h);
  }
  return { frames, nodes };
}
