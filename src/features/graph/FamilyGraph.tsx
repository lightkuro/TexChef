import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  MarkerType,
  useNodesState,
  useEdgesState,
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react';
import { ArrowDownFromLine, ArrowRightFromLine, Grid3x3, Menu as MenuIcon, RectangleVertical, RotateCcw, Scan, Spline } from 'lucide-react';
import { repo, usePreviews } from '@/app/repo';
import type { DocMeta } from '@/core/model';
import { DocCard, type DocNodeType } from './DocCard';
import { DocEdge, type DocEdgeType } from './DocEdge';
import { FolderCard, GroupFrame, type FolderNodeType, type GroupNodeType } from './FolderNodes';
import { cn, docColor } from '@/lib/utils';
import { usePrefs } from '@/app/prefs';
import { keepMeasured } from './keepMeasured';
import { cardHeight, CARD_W, docItems, GRID_GAP, gridCell, layoutGroups, layoutMap, type LayoutItem } from './mapLayout';
import { useMapPositions, type MapDirection } from './positions';
import { ActionDropdown, type MenuAction } from '@/components/ActionMenu';
import { confirmAction } from '@/components/confirm';
import { Tip } from '@/components/ui';
import type { FolderItem, FolderMode, FolderViewModel } from '@/features/folders/folderView';

const nodeTypes = { doc: DocCard, folder: FolderCard, 'group-frame': GroupFrame };
const edgeTypes = { doc: DocEdge };

type MapNode = DocNodeType | FolderNodeType | GroupNodeType;

/** Things the map can be asked to do from outside (e.g. a right-click menu). */
export interface MapApi {
  fitView: () => void;
}

/** Hands the React Flow view controls to the parent. */
function ApiBridge({ onReady }: { onReady?: (api: MapApi) => void }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    onReady?.({ fitView: () => void fitView({ ...FIT, duration: 250 }) });
  }, [fitView, onReady]);
  return null;
}

const FIT = { padding: 0.2, maxZoom: 1.1 };

/** Zoom to fit again when the set of documents or the layout changes (not when one card just changes). */
function FitOnChange({ layoutKey }: { layoutKey: string }) {
  const { fitView } = useReactFlow();
  const ready = useNodesInitialized();
  const fitted = useRef('');
  useEffect(() => {
    if (!ready || fitted.current === layoutKey) return;
    // Wait a moment for new positions and sizes to land; if cards are re-measured meanwhile
    // (ready goes false), this is cancelled and scheduled again once they are.
    const t = setTimeout(() => {
      const first = fitted.current === '';
      fitted.current = layoutKey;
      void fitView({ ...FIT, duration: first ? 0 : 250 });
    }, 80);
    return () => clearTimeout(t);
  }, [ready, layoutKey, fitView]);
  return null;
}

function ToggleButton({ on, onClick, label, tip, testId, children }: { on: boolean; onClick: () => void; label: string; tip: string; testId: string; children: React.ReactNode }) {
  return (
    <Tip content={tip}>
      <button
        onClick={onClick}
        aria-pressed={on}
        aria-label={label}
        className={cn('flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium', on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle hover:text-fg')}
        data-testid={testId}
      >
        {children}
      </button>
    </Tip>
  );
}

/** Ask, then put dragged cards back where the automatic layout puts them. */
export async function askResetPositions(direction: MapDirection): Promise<boolean> {
  const ok = await confirmAction({
    title: 'Reset card positions?',
    body: (
      <p>
        Cards you dragged on the map go back to where the automatic {direction === 'vertical' ? 'top-down' : 'left-to-right'} layout puts them. Documents and
        folders don’t change.
      </p>
    ),
    ok: 'Reset positions',
  });
  if (ok) useMapPositions.getState().reset(direction);
  return ok;
}

/** Layout direction, plus a menu with full pages, grid snap, line style and reset, floating over the map. */
function MapOptions({ moved, onReset, grouped }: { moved: boolean; onReset: () => void; grouped: boolean }) {
  const { fitView } = useReactFlow();
  const onFit = () => void fitView({ ...FIT, duration: 250 });
  const direction = usePrefs((s) => s.mapDirection);
  const fullPages = usePrefs((s) => s.mapFullPages);
  const snap = usePrefs((s) => s.mapSnap);
  const lines = usePrefs((s) => s.mapLines);
  const set = usePrefs((s) => s.set);
  const actions: MenuAction[] = [
    {
      key: 'full',
      label: 'Full-page previews',
      hint: 'whole first page',
      icon: <RectangleVertical className="size-4" />,
      checked: fullPages,
      run: () => set({ mapFullPages: !fullPages }),
      testId: 'map-full-pages',
    },
    {
      key: 'snap',
      label: 'Snap to grid',
      hint: grouped ? 'not in Expanded' : 'card-sized cells',
      icon: <Grid3x3 className="size-4" />,
      checked: snap && !grouped,
      disabled: grouped,
      run: () => set({ mapSnap: !snap }),
      testId: 'map-snap',
    },
    {
      key: 'lines',
      label: 'Right-angled lines',
      icon: <Spline className="size-4" />,
      checked: lines === 'angled',
      run: () => set({ mapLines: lines === 'angled' ? 'straight' : 'angled' }),
      testId: 'map-lines',
    },
    { key: 'fit', label: 'Fit to screen', icon: <Scan className="size-4" />, separatorBefore: true, run: onFit, testId: 'map-fit' },
    {
      key: 'reset',
      label: 'Reset card positions…',
      hint: !moved || grouped ? 'nothing moved' : undefined,
      icon: <RotateCcw className="size-4" />,
      disabled: !moved || grouped,
      run: onReset,
      testId: 'map-reset',
    },
  ];
  return (
    <Panel position="top-right" className="!m-3">
      <div className="flex items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5 shadow-sm" data-testid="map-options">
        <ToggleButton on={direction === 'horizontal'} onClick={() => set({ mapDirection: 'horizontal' })} label="Left to right" tip="Originals on the left, variants to the right" testId="map-horizontal">
          <ArrowRightFromLine className="size-3.5" />
        </ToggleButton>
        <ToggleButton on={direction === 'vertical'} onClick={() => set({ mapDirection: 'vertical' })} label="Top down" tip="Master at the top, variants branching down" testId="map-vertical">
          <ArrowDownFromLine className="size-3.5" />
        </ToggleButton>
        <span className="mx-0.5 h-4 w-px bg-line" />
        <ActionDropdown
          label="Map options"
          actions={actions}
          trigger={
            <button
              className={cn('flex h-7 items-center rounded-md px-2 text-muted hover:bg-subtle hover:text-fg', (fullPages || (snap && !grouped)) && 'text-accent')}
              aria-label="Map options"
              data-testid="map-menu"
            >
              <MenuIcon className="size-4" />
            </button>
          }
        />
      </div>
    </Panel>
  );
}

export interface FamilyGraphProps {
  /** What the open folder shows (documents, subfolders, groups). */
  view: FolderViewModel;
  mode: FolderMode;
  /** Every document inside the open folder (for links that lead into subfolders). */
  scopeDocs: DocMeta[];
  /** Identifies the open folder (refits the view when it changes). */
  scopeKey: string;
  onOpenFolder: (path: string) => void;
  onMoveToFolder: (docId: string, folder: string) => void;
  /** A folder card was dropped on another folder card. */
  onMoveFolder?: (path: string, into: string) => void;
  /** Right-click menu for a folder card. */
  folderWrap?: (item: FolderItem) => (children: React.ReactElement) => React.ReactNode;
  onApi?: (api: MapApi) => void;
}

const folderNodeId = (path: string) => `folder:${path}`;

/** Document map: master → variants → sub-variants, with subfolders as folder cards or folders as frames. */
export function FamilyGraph({ view, mode, scopeDocs, scopeKey, onOpenFolder, onMoveToFolder, onMoveFolder, folderWrap, onApi }: FamilyGraphProps) {
  const previews = usePreviews();
  const navigate = useNavigate();
  const angled = usePrefs((s) => s.mapLines) === 'angled';
  const direction = usePrefs((s) => s.mapDirection);
  const fullPages = usePrefs((s) => s.mapFullPages);
  const snapPref = usePrefs((s) => s.mapSnap);
  const grouped = mode === 'grouped';
  const snap = snapPref && !grouped;
  const saved = useMapPositions((s) => s.saved[direction]);
  const savePositions = useMapPositions((s) => s.save);
  const [behind, setBehind] = useState<Record<string, number>>({});
  const [resets, setResets] = useState(0);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const cell = gridCell(fullPages);
  const vertical = direction === 'vertical';
  const docs = view.docs;

  useEffect(() => {
    let cancelled = false;
    void Promise.all(docs.map(async (d) => [d.id, await repo.commitsBehindParent(d)] as const)).then((pairs) => {
      if (!cancelled) setBehind(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [docs]);

  const { nodes, edges } = useMemo(() => {
    const byId = new Map(scopeDocs.map((d) => [d.id, d]));
    const shown = new Set(docs.map((d) => d.id));
    // Where a document appears: its own card, or the folder card it is inside.
    const endpoint = (id: string) => (shown.has(id) ? id : view.containerOf.has(id) ? folderNodeId(view.containerOf.get(id)!) : undefined);
    const edges: DocEdgeType[] = [];
    const links = new Map<string, { source: string; target: string; color: string }>();
    for (const d of scopeDocs) {
      if (!d.parent || !byId.has(d.parent.docId)) continue;
      const s = endpoint(d.parent.docId);
      const t = endpoint(d.id);
      if (!s || !t || s === t) continue;
      const color = docColor(d.parent.docId, byId.get(d.parent.docId)?.color);
      if (shown.has(s) && shown.has(t)) {
        const n = behind[d.id] ?? 0;
        edges.push({
          id: `${s}->${t}`,
          source: s,
          target: t,
          type: 'doc',
          data: { updates: n, angled },
          style: { stroke: color, strokeWidth: 2, strokeDasharray: n > 0 ? '6 4' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        });
      } else if (!links.has(`${s}->${t}`)) links.set(`${s}->${t}`, { source: s, target: t, color });
    }
    // Links into and out of folders: variants (or originals) that are inside a folder card.
    for (const [id, l] of links) {
      edges.push({
        id,
        source: l.source,
        target: l.target,
        type: 'doc',
        data: { updates: 0, angled },
        style: { stroke: l.color, strokeWidth: 1.5, strokeDasharray: '2 5', opacity: 0.7 },
        markerEnd: { type: MarkerType.ArrowClosed, color: l.color },
      });
    }

    const docNode = (d: DocMeta, position: { x: number; y: number }, extra: Partial<DocNodeType> = {}): DocNodeType => {
      const childCount = scopeDocs.filter((c) => c.parent?.docId === d.id).length;
      return {
        id: d.id,
        type: 'doc',
        position,
        data: {
          doc: d,
          preview: previews?.get(d.id),
          behind: behind[d.id] ?? 0,
          parentName: d.parent ? byId.get(d.parent.docId)?.name : undefined,
          childCount,
          isRoot: childCount > 0 && !(d.parent && byId.has(d.parent.docId)),
          vertical,
          fullPage: fullPages,
          snap,
        },
        ...extra,
      };
    };

    if (grouped) {
      const groups = view.groups.map((g) => ({ id: `group:${g.path}`, items: docItems(g.docs), group: g }));
      const lay = layoutGroups(groups, { direction, fullPages });
      const nodes: MapNode[] = [];
      for (const g of groups) {
        const f = lay.frames.get(g.id)!;
        nodes.push({
          id: g.id,
          type: 'group-frame',
          position: { x: f.x, y: f.y },
          style: { width: f.w, height: f.h },
          width: f.w,
          height: f.h,
          draggable: false,
          selectable: false,
          zIndex: -1,
          data: { label: g.group.label, count: g.group.docs.length, depth: g.group.depth },
        });
        for (const d of g.group.docs) nodes.push(docNode(d, lay.nodes.get(d.id)!, { parentId: g.id, draggable: false }));
      }
      return { nodes, edges };
    }

    // Browse: documents and folder cards, linked through the folders.
    const parents = new Map<string, Set<string>>();
    for (const e of edges) (parents.get(e.target) ?? parents.set(e.target, new Set()).get(e.target)!).add(e.source);
    const items: LayoutItem[] = [
      ...view.folders.map((f) => folderNodeId(f.path)),
      ...docs.map((d) => d.id),
    ].map((id) => ({ id, parents: [...(parents.get(id) ?? [])] }));
    const pos = layoutMap(items, { direction, fullPages, snap, saved });
    const nodes: MapNode[] = [
      ...view.folders.map(
        (f): FolderNodeType => ({
          id: folderNodeId(f.path),
          type: 'folder',
          position: pos.get(folderNodeId(f.path))!,
          data: {
            item: f,
            previews: f.docIds.map((id) => previews?.get(id)).filter(Boolean),
            vertical,
            fullPage: fullPages,
            dropping: dropFolder === f.path,
            wrap: folderWrap?.(f),
            snap,
          },
        }),
      ),
      ...docs.map((d) => docNode(d, pos.get(d.id)!)),
    ];
    return { nodes, edges };
  }, [docs, scopeDocs, view, previews, behind, angled, direction, vertical, fullPages, snap, saved, grouped, dropFolder, folderWrap]);

  // React Flow needs to write measured sizes back into node state before it shows nodes.
  const [rfNodes, setNodes, onNodesChange] = useNodesState<MapNode>(nodes);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState<DocEdgeType>(edges);
  // Keep each node's measured size when rebuilding, or React Flow hides it until it is measured again
  // (which may never happen if its size does not change). Card height changes with full pages.
  const sizeKey = `${fullPages}|${snap}`;
  const lastSize = useRef(sizeKey);
  useEffect(() => {
    const sameSize = lastSize.current === sizeKey;
    lastSize.current = sizeKey;
    setNodes((cur) => (sameSize ? keepMeasured(cur, nodes) : nodes));
  }, [nodes, setNodes, sizeKey]);
  useEffect(() => setEdges(edges), [edges, setEdges]);

  const layoutKey = `${scopeKey}|${mode}|${[...docs.map((d) => d.id), ...view.folders.map((f) => f.path)].sort().join(',')}|${direction}|${fullPages}|${snap}|${resets}`;

  /** The folder card under the middle of a dragged card (a document or another folder), if any. */
  const folderUnder = (node: { id: string; position: { x: number; y: number }; measured?: { width?: number; height?: number } }) => {
    const cx = node.position.x + (node.measured?.width ?? CARD_W) / 2;
    const cy = node.position.y + (node.measured?.height ?? cardHeight(fullPages)) / 2;
    const hit = rfNodes.find((n) => {
      if (n.type !== 'folder' || n.id === node.id) return false;
      const w = n.measured?.width ?? CARD_W;
      const h = n.measured?.height ?? cardHeight(fullPages);
      return cx >= n.position.x && cx <= n.position.x + w && cy >= n.position.y && cy <= n.position.y + h;
    });
    return hit ? (hit as FolderNodeType).data.item.path : null;
  };

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={FIT}
      minZoom={0.15}
      nodesConnectable={false}
      nodesDraggable={!grouped}
      snapToGrid={snap}
      snapGrid={[cell.w, cell.h]}
      onNodeDrag={(_, node) => {
        if (node.type !== 'doc' && node.type !== 'folder') return;
        const f = folderUnder(node);
        if (f !== dropFolder) setDropFolder(f);
      }}
      onNodeDragStop={(_, node, dragged) => {
        const f = node.type === 'doc' || node.type === 'folder' ? folderUnder(node) : null;
        setDropFolder(null);
        if (f && node.type === 'doc') {
          onMoveToFolder(node.id, f);
          return;
        }
        if (f && node.type === 'folder') {
          onMoveFolder?.((node as FolderNodeType).data.item.path, f);
          return;
        }
        savePositions(direction, Object.fromEntries(dragged.map((n) => [n.id, n.position])));
      }}
      onNodeDoubleClick={(_, n) => n.type === 'doc' && navigate(`/doc/${n.id}`)}
      onNodeClick={(_, n) => {
        if (n.type === 'doc') navigate(`/doc/${n.id}`);
        else if (n.type === 'folder') onOpenFolder((n as FolderNodeType).data.item.path);
      }}
      proOptions={{ hideAttribution: true }}
    >
      {snap ? (
        // Lines between cells, half a gap around each card, so a snapped card sits in the middle of its cell.
        <Background id="grid" variant={BackgroundVariant.Lines} gap={[cell.w, cell.h]} offset={GRID_GAP / 2} lineWidth={1} color="color-mix(in oklab, var(--border) 70%, transparent)" />
      ) : (
        <Background gap={20} size={1} color="var(--border)" />
      )}
      <Controls showInteractive={false} />
      <MiniMap
        // Phones: the overview would cover a third of the map.
        className="max-sm:hidden"
        pannable
        zoomable
        nodeColor={(n) => (n.type === 'doc' ? docColor(n.id, (n.data as { doc: DocMeta }).doc.color) : n.type === 'folder' ? 'var(--accent)' : 'transparent')}
      />
      <MapOptions
        grouped={grouped}
        moved={Object.keys(saved).some((id) => docs.some((d) => d.id === id) || view.folders.some((f) => folderNodeId(f.path) === id))}
        onReset={() => void askResetPositions(direction).then((ok) => ok && setResets((n) => n + 1))}
      />
      <FitOnChange layoutKey={layoutKey} />
      <ApiBridge onReady={onApi} />
    </ReactFlow>
  );
}
