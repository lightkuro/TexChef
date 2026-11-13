import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePrefs } from '@/app/prefs';
import { keepMeasured } from './keepMeasured';
import { Background, BaseEdge, Controls, Handle, Position, ReactFlow, useEdgesState, useNodesState, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { X, GitCompare, RotateCcw, GitBranch, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { repo, useAllCommits } from '@/app/repo';
import { ensureHistory, historyIsPartial, useSync } from '@/features/sync/controller';
import type { Commit, DocMeta } from '@/core/model';
import { docColor, timeAgo } from '@/lib/utils';
import { kindIcon, kindLabel } from '@/features/history/HistoryPanel';
import { versionNumbers } from '@/features/history/versionStats';
import { Button, Badge } from '@/components/ui';

const LANE_H = 64;
const COL_W = 54;
const LABEL_W = 210;
/** A version's circle (size-7). */
const NODE = 28;
/** The free space between one version and the next column: links change lanes here, where no version can be. */
const GAP = COL_W - NODE;
/** Autosaves are drawn as a small dot on the line, in a narrower column, so they don't crowd out saved versions. */
const DOT = 10;
const DOT_COL = 22;

type LaneData = { doc: DocMeta; color: string };
type CommitData = { commit: Commit; color: string; head: boolean; diverged: boolean; dot: boolean; number?: string };

const LaneNode = memo(function LaneNode({ data }: NodeProps<Node<LaneData>>) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-xs font-medium shadow-sm" style={{ width: LABEL_W - 30 }}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: data.color }} />
      <span className="truncate">{data.doc.name}</span>
    </div>
  );
});

const CommitNode = memo(function CommitNode({ data, selected }: NodeProps<Node<CommitData>>) {
  const { commit, color, head, diverged, dot } = data;
  const handles = (
    <>
      <Handle type="target" position={Position.Left} className="!size-1 !border-0 !opacity-0" />
      {/* Links from another document's lane come in from above or below, clear of the lane's own line. */}
      <Handle type="target" id="top" position={Position.Top} className="!size-1 !border-0 !opacity-0" />
      <Handle type="target" id="bottom" position={Position.Bottom} className="!size-1 !border-0 !opacity-0" />
      <Handle type="source" position={Position.Right} className="!size-1 !border-0 !opacity-0" />
    </>
  );
  if (dot)
    return (
      <div
        className="rounded-full"
        style={{
          width: DOT,
          height: DOT,
          background: color,
          boxShadow: selected ? `0 0 0 4px color-mix(in oklab, ${color} 35%, transparent)` : head ? `0 0 0 3px color-mix(in oklab, ${color} 22%, transparent)` : undefined,
        }}
        aria-label={`Autosave, ${new Date(commit.createdAt).toLocaleString()}`}
        data-autosave
      >
        {handles}
      </div>
    );
  return (
    <div
      className="flex size-7 items-center justify-center rounded-full border-2 bg-panel"
      style={{
        borderColor: color,
        boxShadow: selected ? `0 0 0 4px color-mix(in oklab, ${color} 35%, transparent)` : head ? `0 0 0 3px color-mix(in oklab, ${color} 22%, transparent)` : undefined,
        borderStyle: diverged ? 'dashed' : 'solid',
      }}
      aria-label={`${commit.message}, ${new Date(commit.createdAt).toLocaleString()}`}
    >
      {kindIcon(commit.kind)}
      {handles}
    </div>
  );
});

type CrossData = {
  /**
   * 'drop': change lanes right after the source, then run along the target's lane into its left side. For a
   * document's first version: its lane is empty up to there.
   * 'gutter': the target's lane already has versions (and a line joining them), so run between two lanes and come
   * down (or up) into the target.
   */
  route: 'drop' | 'gutter';
  /** Right angles with rounded corners, instead of slanted lines. */
  angled: boolean;
  /** Nudges links that share a gutter apart. */
  offset: number;
  /** The free space after the source (narrower after an autosave's dot). */
  gap: number;
  /** The target's height: a version's circle, or an autosave's dot. */
  targetSize: number;
};

/** A polyline through `pts`, with its corners rounded by up to `r`. */
function roundedPath(pts: [number, number][], r: number): string {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(x - px, y - py);
    const outLen = Math.hypot(nx - x, ny - y);
    const k = Math.min(r, inLen / 2, outLen / 2);
    if (k < 0.5) {
      d += ` L${x},${y}`;
      continue;
    }
    d += ` L${x - ((x - px) / inLen) * k},${y - ((y - py) / inLen) * k} Q${x},${y} ${x + ((nx - x) / outLen) * k},${y + ((ny - y) / outLen) * k}`;
  }
  const [ex, ey] = pts[pts.length - 1];
  return `${d} L${ex},${ey}`;
}

/**
 * A link between versions of two documents. A straight line from one to the other would cut through any version
 * that sits between them, so the link changes lanes only in the gap right after its source (every version has a
 * column to itself, so no version can be there), and otherwise runs along an empty lane or between two lanes.
 * (tx, ty) is the target's left side for 'drop', and its top or bottom for 'gutter'.
 */
export function crossLanePath(sx: number, sy: number, tx: number, ty: number, { route, angled, offset, gap, targetSize }: CrossData): string {
  const room = tx - sx;
  // Out of order (clocks that disagree between devices): nothing better than a straight line.
  if (room < 6 || sy === ty) return `M${sx},${sy} L${tx},${ty}`;
  const turn = Math.min(angled ? Math.min(10, gap - 2) : gap, angled ? room / 2 : room);
  if (route === 'gutter') {
    // Halfway between the target's lane and the next lane towards the source.
    const yg = ty - Math.sign(ty - sy) * (LANE_H / 2 - targetSize / 2) + offset;
    return angled
      ? roundedPath([[sx, sy], [sx + turn, sy], [sx + turn, yg], [tx, yg], [tx, ty]], 6)
      : roundedPath([[sx, sy], [sx + turn, yg], [tx, yg], [tx, ty]], 5);
  }
  return angled
    ? roundedPath([[sx, sy], [sx + turn, sy], [sx + turn, ty], [tx, ty]], 6)
    : roundedPath([[sx, sy], [sx + turn, ty], [tx, ty]], 4);
}

const CrossEdge = memo(function CrossEdge({ id, sourceX, sourceY, targetX, targetY, data, style }: EdgeProps<Edge<CrossData>>) {
  return <BaseEdge id={id} path={crossLanePath(sourceX, sourceY, targetX, targetY, data!)} style={style} />;
});

const nodeTypes = { lane: LaneNode, commit: CommitNode };
const edgeTypes = { cross: CrossEdge };

function laneOrder(docs: DocMeta[]): DocMeta[] {
  const out: DocMeta[] = [];
  const ids = new Set(docs.map((d) => d.id));
  const visit = (d: DocMeta) => {
    out.push(d);
    docs.filter((c) => c.parent?.docId === d.id).forEach(visit);
  };
  docs.filter((d) => !d.parent || !ids.has(d.parent.docId)).forEach(visit);
  return out;
}

/** Git-style swimlanes: one lane per document, commits over time, dashed edges for branches/merges across documents. */
export function VersionGraph({ docs, showAutosaves }: { docs: DocMeta[]; showAutosaves: boolean }) {
  const angled = usePrefs((s) => s.mapLines) === 'angled';
  const commits = useAllCommits();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Commit | null>(null);
  // A device that keeps only current versions shows what it has, and offers to fetch the rest for these documents.
  const connected = useSync((s) => s.state === 'idle' || s.state === 'syncing');
  const [history, setHistory] = useState<'partial' | 'loading' | 'full'>(() => (historyIsPartial() ? 'partial' : 'full'));
  const loadHistory = async () => {
    setHistory('loading');
    try {
      await ensureHistory(docs.map((d) => d.id));
      setHistory('full');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setHistory('partial');
    }
  };

  const { nodes, edges } = useMemo(() => {
    const lanes = laneOrder(docs);
    const laneIndex = new Map(lanes.map((d, i) => [d.id, i]));
    const byId = new Map((commits ?? []).map((c) => [c.id, c]));
    const heads = new Set(docs.map((d) => d.head));
    const divergedSet = new Set(docs.flatMap((d) => d.divergedHeads ?? []));
    const docById = new Map(docs.map((d) => [d.id, d]));
    const all = (commits ?? []).filter((c) => laneIndex.has(c.docId));
    // Version numbers count within each document, as in its history list.
    const numbers = new Map<string, string>();
    const perDoc = new Map<string, Commit[]>();
    for (const c of all) perDoc.set(c.docId, [...(perDoc.get(c.docId) ?? []), c]);
    perDoc.forEach((list) => versionNumbers(list).forEach((n, id) => numbers.set(id, n)));
    // An autosave stays visible when it is a head, or a branch/merge point for another document.
    const referencedAcross = new Set<string>();
    all.forEach((c) => c.parents.forEach((p) => byId.get(p)?.docId !== c.docId && referencedAcross.add(p)));
    const visible = all.filter((c) => showAutosaves || c.kind !== 'auto' || heads.has(c.id) || divergedSet.has(c.id) || referencedAcross.has(c.id));
    const visibleIds = new Set(visible.map((c) => c.id));
    const col = new Map(visible.map((c, i) => [c.id, i]));
    // Autosaves are dots in narrower columns.
    const isDot = (c: Commit) => c.kind === 'auto';
    const xOf = new Map<string, number>();
    let nextX = LABEL_W;
    for (const c of visible) {
      xOf.set(c.id, nextX);
      nextX += isDot(c) ? DOT_COL : COL_W;
    }

    const nodes: Node[] = lanes.map((d, i) => ({
      id: `lane-${d.id}`,
      type: 'lane',
      position: { x: 0, y: i * LANE_H + 2 },
      data: { doc: d, color: docColor(d.id, d.color) },
      draggable: false,
      selectable: false,
    }));
    for (const c of visible) {
      const doc = docById.get(c.docId)!;
      nodes.push({
        id: c.id,
        type: 'commit',
        position: { x: xOf.get(c.id)!, y: laneIndex.get(c.docId)! * LANE_H + 6 + (isDot(c) ? (NODE - DOT) / 2 : 0) },
        data: { commit: c, color: docColor(doc.id, doc.color), head: heads.has(c.id), diverged: divergedSet.has(c.id), dot: isDot(c), number: numbers.get(c.id) },
        draggable: false,
      });
    }

    const visibleAncestors = (id: string, seen = new Set<string>()): string[] => {
      if (seen.has(id)) return [];
      seen.add(id);
      if (visibleIds.has(id)) return [id];
      const c = byId.get(id);
      return c ? c.parents.flatMap((p) => visibleAncestors(p, seen)) : [];
    };
    const edges: Edge[] = [];
    // Each document's versions by column, to tell whether a link's target is the first in its lane.
    const laneCols = new Map<string, number[]>();
    for (const c of visible) laneCols.set(c.docId, [...(laneCols.get(c.docId) ?? []), col.get(c.id)!]);
    const gutterUse = new Map<string, number>();
    for (const c of visible) {
      const parents = new Set(c.parents.flatMap((p) => visibleAncestors(p)));
      for (const p of parents) {
        const pc = byId.get(p)!;
        const cross = pc.docId !== c.docId;
        const doc = docById.get(cross ? pc.docId : c.docId)!;
        const style = { stroke: docColor(doc.id, doc.color), strokeWidth: 2, strokeDasharray: cross ? '5 4' : undefined };
        if (!cross) {
          edges.push({ id: `${p}->${c.id}`, source: p, target: c.id, type: 'straight', style });
          continue;
        }
        const to = col.get(c.id)!;
        const blocked = (laneCols.get(c.docId) ?? []).some((k) => k < to);
        // Links sharing the space between the same two lanes sit a few pixels apart.
        const gutter = `${laneIndex.get(c.docId)}:${Math.sign(laneIndex.get(c.docId)! - laneIndex.get(pc.docId)!)}`;
        const n = blocked ? (gutterUse.get(gutter) ?? 0) : 0;
        if (blocked) gutterUse.set(gutter, n + 1);
        edges.push({
          id: `${p}->${c.id}`,
          source: p,
          target: c.id,
          type: 'cross',
          targetHandle: blocked ? (laneIndex.get(c.docId)! > laneIndex.get(pc.docId)! ? 'top' : 'bottom') : undefined,
          data: {
            route: blocked ? 'gutter' : 'drop',
            angled,
            offset: ((n % 3) - (n % 3 === 2 ? 3 : 0)) * 5,
            gap: isDot(pc) ? DOT_COL - DOT : GAP,
            targetSize: isDot(c) ? DOT : NODE,
          } satisfies CrossData,
          animated: c.kind === 'merge',
          style,
        });
      }
    }
    return { nodes, edges };
  }, [docs, commits, showAutosaves, angled]);

  const [rfNodes, setNodes, onNodesChange] = useNodesState<Node>(nodes);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState<Edge>(edges);
  // Keep each node's measured size when rebuilding, or React Flow hides it until it is measured again
  // (which may never happen if its size does not change).
  useEffect(() => setNodes((cur) => keepMeasured(cur, nodes)), [nodes, setNodes]);
  useEffect(() => setEdges(edges), [edges, setEdges]);

  const selDoc = selected ? docs.find((d) => d.id === selected.docId) : undefined;

  // Pointing at a version shows what it is, without the wait of the browser's own tooltip.
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ data: CommitData; x: number; y: number; below: boolean } | null>(null);
  const hoverDoc = hover ? docs.find((d) => d.id === hover.data.commit.docId) : undefined;

  return (
    <div ref={box} className="relative h-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
        minZoom={0.2}
        nodesConnectable={false}
        onNodeClick={(_, n) => {
          if (n.type !== 'commit') return;
          setHover(null);
          setSelected((n.data as CommitData).commit);
        }}
        onPaneClick={() => setSelected(null)}
        onNodeMouseEnter={(e, n) => {
          const el = (e.target as Element).closest('.react-flow__node');
          if (n.type !== 'commit' || !el || !box.current) return;
          const r = el.getBoundingClientRect();
          const b = box.current.getBoundingClientRect();
          const x = Math.min(Math.max(r.left + r.width / 2 - b.left, 132), Math.max(132, b.width - 132));
          // Above the version, unless there is no room there.
          const below = r.top - b.top < 120;
          setHover({ data: n.data as CommitData, x, y: below ? r.bottom - b.top + 8 : r.top - b.top - 8, below });
        }}
        onNodeMouseLeave={() => setHover(null)}
        onMoveStart={() => setHover(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={COL_W} size={1} color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {connected && history !== 'full' && (
        <div className="absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs shadow-md" data-testid="history-partial">
          <span className="text-muted">Showing the versions on this device.</span>
          <Button size="sm" variant="outline" disabled={history === 'loading'} onClick={() => void loadHistory()} data-testid="history-load">
            {history === 'loading' ? 'Getting them…' : 'Get older versions from Drive'}
          </Button>
        </div>
      )}
      {hover && hoverDoc && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-64 rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg"
          style={{ left: hover.x, top: hover.y, transform: `translate(-50%, ${hover.below ? '0' : '-100%'})` }}
          data-testid="commit-hover"
        >
          <div className="flex items-center gap-1.5 text-muted">
            {kindIcon(hover.data.commit.kind)}
            {hover.data.number && <span className="font-mono tabular-nums">v{hover.data.number}</span>}
            <span>{kindLabel(hover.data.commit.kind)}</span>
            {hover.data.head && (
              <Badge tone="accent" className="ml-auto px-1.5 py-0 text-[10px]">
                current
              </Badge>
            )}
          </div>
          {hover.data.commit.kind !== 'auto' && <div className="mt-1 line-clamp-2 text-[13px] font-medium break-words text-fg">{hover.data.commit.message}</div>}
          <div className="mt-1 flex items-center gap-1.5 text-muted">
            <span className="size-2 shrink-0 rounded-full" style={{ background: hover.data.color }} />
            <span className="truncate">{hoverDoc.name}</span>
          </div>
          <div className="mt-0.5 text-muted">
            {timeAgo(hover.data.commit.createdAt)} · {new Date(hover.data.commit.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
          <div className="mt-0.5 text-muted">
            {Object.keys(hover.data.commit.tree).length === 1 ? '1 file' : `${Object.keys(hover.data.commit.tree).length} files`}
            {hover.data.diverged && ' · from another device, not merged yet'}
            {' · click for actions'}
          </div>
        </div>
      )}
      {selected && selDoc && (
        <div className="absolute top-3 right-3 w-80 max-w-[calc(100%-1.5rem)] rounded-xl border border-line bg-panel p-3 shadow-xl" data-testid="commit-panel">
          <div className="flex items-start gap-2">
            <span className="mt-0.5">{kindIcon(selected.kind)}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold break-words">{selected.message}</div>
              <div className="text-xs text-muted">
                {selDoc.name} · {timeAgo(selected.createdAt)} · {new Date(selected.createdAt).toLocaleString()}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {selDoc.head === selected.id && <Badge tone="accent">current version</Badge>}
                <Badge>{Object.keys(selected.tree).length} files</Badge>
              </div>
            </div>
            <Button size="icon-sm" variant="ghost" onClick={() => setSelected(null)} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="outline" onClick={() => navigate(`/doc/${selDoc.id}`)}>
              <ExternalLink className="size-3.5" /> Open
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/compare?left=${selDoc.id}@${selected.id}&right=${selDoc.id}`)}>
              <GitCompare className="size-3.5" /> Compare
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/doc/${selDoc.id}/new-variant?from=${selected.id}`)}>
              <GitBranch className="size-3.5" /> New variant from here
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selDoc.head === selected.id}
              onClick={async () => {
                await repo.restore(selDoc.id, selected.id);
                toast.success(`Restored “${selDoc.name}” to this version`);
                setSelected(null);
              }}
            >
              <RotateCcw className="size-3.5" /> Restore
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
