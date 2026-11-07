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
import { ArrowDownFromLine, ArrowRightFromLine, Grid3x3, RectangleVertical, RotateCcw } from 'lucide-react';
import { repo, usePreviews } from '@/app/repo';
import type { DocMeta } from '@/core/model';
import { DocCard, type DocNodeType } from './DocCard';
import { DocEdge, type DocEdgeType } from './DocEdge';
import { cn, docColor } from '@/lib/utils';
import { usePrefs } from '@/app/prefs';
import { keepMeasured } from './keepMeasured';
import { gridCell, layoutMap } from './mapLayout';
import { useMapPositions } from './positions';
import { Tip } from '@/components/ui';

const nodeTypes = { doc: DocCard };
const edgeTypes = { doc: DocEdge };

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

/** Layout direction, full pages, grid snap and reset, floating over the map. */
function MapOptions({ moved, onReset }: { moved: boolean; onReset: () => void }) {
  const direction = usePrefs((s) => s.mapDirection);
  const fullPages = usePrefs((s) => s.mapFullPages);
  const snap = usePrefs((s) => s.mapSnap);
  const set = usePrefs((s) => s.set);
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
        <ToggleButton on={fullPages} onClick={() => set({ mapFullPages: !fullPages })} label="Full-page previews" tip="Show the whole first page on each card" testId="map-full-pages">
          <RectangleVertical className="size-3.5" /> Full pages
        </ToggleButton>
        <ToggleButton on={snap} onClick={() => set({ mapSnap: !snap })} label="Snap to grid" tip="Dragged cards snap to a grid of card-sized cells" testId="map-snap">
          <Grid3x3 className="size-3.5" /> Snap
        </ToggleButton>
        {moved && (
          <>
            <span className="mx-0.5 h-4 w-px bg-line" />
            <ToggleButton on={false} onClick={onReset} label="Reset card positions" tip="Put dragged cards back in the automatic layout" testId="map-reset">
              <RotateCcw className="size-3.5" /> Reset
            </ToggleButton>
          </>
        )}
      </div>
    </Panel>
  );
}

/** Document map: master → variants → sub-variants. */
export function FamilyGraph({ docs }: { docs: DocMeta[] }) {
  const previews = usePreviews();
  const navigate = useNavigate();
  const angled = usePrefs((s) => s.mapLines) === 'angled';
  const direction = usePrefs((s) => s.mapDirection);
  const fullPages = usePrefs((s) => s.mapFullPages);
  const snap = usePrefs((s) => s.mapSnap);
  const saved = useMapPositions((s) => s.saved[direction]);
  const savePositions = useMapPositions((s) => s.save);
  const resetPositions = useMapPositions((s) => s.reset);
  const [behind, setBehind] = useState<Record<string, number>>({});
  const [resets, setResets] = useState(0);
  const cell = gridCell(fullPages);
  const vertical = direction === 'vertical';

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
    const pos = layoutMap(docs, { direction, fullPages, snap, saved });
    const byId = new Map(docs.map((d) => [d.id, d]));
    const nodes: DocNodeType[] = docs.map((d) => {
      const childCount = docs.filter((c) => c.parent?.docId === d.id).length;
      return {
        id: d.id,
        type: 'doc',
        position: pos.get(d.id)!,
        data: {
          doc: d,
          preview: previews?.get(d.id),
          behind: behind[d.id] ?? 0,
          parentName: d.parent ? byId.get(d.parent.docId)?.name : undefined,
          childCount,
          isRoot: childCount > 0 && !(d.parent && byId.has(d.parent.docId)),
          vertical,
          fullPage: fullPages,
        },
      };
    });
    const edges: DocEdgeType[] = docs
      .filter((d) => d.parent && byId.has(d.parent.docId))
      .map((d) => {
        const n = behind[d.id] ?? 0;
        const color = docColor(d.parent!.docId, byId.get(d.parent!.docId)?.color);
        return {
          id: `${d.parent!.docId}->${d.id}`,
          source: d.parent!.docId,
          target: d.id,
          type: 'doc',
          data: { updates: n, angled },
          style: { stroke: color, strokeWidth: 2, strokeDasharray: n > 0 ? '6 4' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        };
      });
    return { nodes, edges };
  }, [docs, previews, behind, angled, direction, vertical, fullPages, snap, saved]);

  // React Flow needs to write measured sizes back into node state before it shows nodes.
  const [rfNodes, setNodes, onNodesChange] = useNodesState<DocNodeType>(nodes);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState<DocEdgeType>(edges);
  // Keep each node's measured size when rebuilding, or React Flow hides it until it is measured again
  // (which may never happen if its size does not change). Card height changes with full pages.
  useEffect(() => setNodes((cur) => (fullPages === cur[0]?.data.fullPage ? keepMeasured(cur, nodes) : nodes)), [nodes, setNodes, fullPages]);
  useEffect(() => setEdges(edges), [edges, setEdges]);

  const layoutKey = `${docs.map((d) => d.id).sort().join(',')}|${direction}|${fullPages}|${snap}|${resets}`;

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
      minZoom={0.2}
      nodesConnectable={false}
      snapToGrid={snap}
      snapGrid={[cell.w, cell.h]}
      onNodeDragStop={(_, __, dragged) => savePositions(direction, Object.fromEntries(dragged.map((n) => [n.id, n.position])))}
      onNodeDoubleClick={(_, n) => navigate(`/doc/${n.id}`)}
      onNodeClick={(_, n) => navigate(`/doc/${n.id}`)}
      proOptions={{ hideAttribution: true }}
    >
      {snap ? (
        <Background id="grid" variant={BackgroundVariant.Lines} gap={[cell.w, cell.h]} lineWidth={1} color="color-mix(in oklab, var(--border) 70%, transparent)" />
      ) : (
        <Background gap={20} size={1} color="var(--border)" />
      )}
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor={(n) => docColor(n.id, (n.data as { doc: DocMeta }).doc.color)} />
      <MapOptions
        moved={Object.keys(saved).some((id) => docs.some((d) => d.id === id))}
        onReset={() => {
          resetPositions(direction);
          setResets((n) => n + 1);
        }}
      />
      <FitOnChange layoutKey={layoutKey} />
    </ReactFlow>
  );
}
