import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Background, Controls, Handle, Position, ReactFlow, useEdgesState, useNodesState, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { X, GitCompare, RotateCcw, GitBranch, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { repo, useAllCommits } from '@/app/repo';
import type { Commit, DocMeta } from '@/core/model';
import { docColor, timeAgo } from '@/lib/utils';
import { kindIcon } from '@/features/history/HistoryPanel';
import { Button, Badge } from '@/components/ui';

const LANE_H = 64;
const COL_W = 54;
const LABEL_W = 210;

type LaneData = { doc: DocMeta; color: string };
type CommitData = { commit: Commit; color: string; head: boolean; diverged: boolean };

const LaneNode = memo(function LaneNode({ data }: NodeProps<Node<LaneData>>) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-xs font-medium shadow-sm" style={{ width: LABEL_W - 30 }}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: data.color }} />
      <span className="truncate">{data.doc.name}</span>
    </div>
  );
});

const CommitNode = memo(function CommitNode({ data, selected }: NodeProps<Node<CommitData>>) {
  const { commit, color, head, diverged } = data;
  return (
    <div
      className="flex size-7 items-center justify-center rounded-full border-2 bg-panel"
      style={{
        borderColor: color,
        boxShadow: selected ? `0 0 0 4px color-mix(in oklab, ${color} 35%, transparent)` : head ? `0 0 0 3px color-mix(in oklab, ${color} 22%, transparent)` : undefined,
        borderStyle: diverged ? 'dashed' : 'solid',
      }}
      title={`${commit.message}\n${new Date(commit.createdAt).toLocaleString()}`}
    >
      <Handle type="target" position={Position.Left} className="!size-1 !border-0 !opacity-0" />
      {kindIcon(commit.kind)}
      <Handle type="source" position={Position.Right} className="!size-1 !border-0 !opacity-0" />
    </div>
  );
});

const nodeTypes = { lane: LaneNode, commit: CommitNode };

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
  const commits = useAllCommits();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Commit | null>(null);

  const { nodes, edges } = useMemo(() => {
    const lanes = laneOrder(docs);
    const laneIndex = new Map(lanes.map((d, i) => [d.id, i]));
    const byId = new Map((commits ?? []).map((c) => [c.id, c]));
    const heads = new Set(docs.map((d) => d.head));
    const divergedSet = new Set(docs.flatMap((d) => d.divergedHeads ?? []));
    const docById = new Map(docs.map((d) => [d.id, d]));
    const all = (commits ?? []).filter((c) => laneIndex.has(c.docId));
    // An autosave stays visible when it is a head, or a branch/merge point for another document.
    const referencedAcross = new Set<string>();
    all.forEach((c) => c.parents.forEach((p) => byId.get(p)?.docId !== c.docId && referencedAcross.add(p)));
    const visible = all.filter((c) => showAutosaves || c.kind !== 'auto' || heads.has(c.id) || divergedSet.has(c.id) || referencedAcross.has(c.id));
    const visibleIds = new Set(visible.map((c) => c.id));
    const col = new Map(visible.map((c, i) => [c.id, i]));

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
        position: { x: LABEL_W + col.get(c.id)! * COL_W, y: laneIndex.get(c.docId)! * LANE_H + 6 },
        data: { commit: c, color: docColor(doc.id, doc.color), head: heads.has(c.id), diverged: divergedSet.has(c.id) },
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
    for (const c of visible) {
      const parents = new Set(c.parents.flatMap((p) => visibleAncestors(p)));
      for (const p of parents) {
        const pc = byId.get(p)!;
        const cross = pc.docId !== c.docId;
        const doc = docById.get(cross ? pc.docId : c.docId)!;
        edges.push({
          id: `${p}->${c.id}`,
          source: p,
          target: c.id,
          type: cross ? 'smoothstep' : 'straight',
          animated: cross && c.kind === 'merge',
          style: { stroke: docColor(doc.id, doc.color), strokeWidth: 2, strokeDasharray: cross ? '5 4' : undefined },
        });
      }
    }
    return { nodes, edges };
  }, [docs, commits, showAutosaves]);

  const [rfNodes, setNodes, onNodesChange] = useNodesState<Node>(nodes);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState<Edge>(edges);
  useEffect(() => setNodes(nodes), [nodes, setNodes]);
  useEffect(() => setEdges(edges), [edges, setEdges]);

  const selDoc = selected ? docs.find((d) => d.id === selected.docId) : undefined;

  return (
    <div className="relative h-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
        minZoom={0.2}
        nodesConnectable={false}
        onNodeClick={(_, n) => n.type === 'commit' && setSelected((n.data as CommitData).commit)}
        onPaneClick={() => setSelected(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={COL_W} size={1} color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {selected && selDoc && (
        <div className="absolute top-3 right-3 w-80 rounded-xl border border-line bg-panel p-3 shadow-xl" data-testid="commit-panel">
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
