import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Background, Controls, MiniMap, ReactFlow, MarkerType, useNodesState, useEdgesState, type Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { repo, usePreviews } from '@/app/repo';
import type { DocMeta } from '@/core/model';
import { DocCard, DOC_NODE_H, DOC_NODE_W, type DocNodeType } from './DocCard';
import { docColor } from '@/lib/utils';

const nodeTypes = { doc: DocCard };

function layout(docs: DocMeta[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(docs.map((d) => d.id));
  for (const d of docs) g.setNode(d.id, { width: DOC_NODE_W, height: DOC_NODE_H });
  for (const d of docs) if (d.parent && ids.has(d.parent.docId)) g.setEdge(d.parent.docId, d.id);
  dagre.layout(g);
  const out = new Map<string, { x: number; y: number }>();
  for (const d of docs) {
    const n = g.node(d.id);
    out.set(d.id, { x: n.x - DOC_NODE_W / 2, y: n.y - DOC_NODE_H / 2 });
  }
  return out;
}

/** Document family tree: master → variants → sub-variants. */
export function FamilyGraph({ docs }: { docs: DocMeta[] }) {
  const previews = usePreviews();
  const navigate = useNavigate();
  const [behind, setBehind] = useState<Record<string, number>>({});

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
    const pos = layout(docs);
    const byId = new Map(docs.map((d) => [d.id, d]));
    const nodes: DocNodeType[] = docs.map((d) => ({
      id: d.id,
      type: 'doc',
      position: pos.get(d.id)!,
      data: {
        doc: d,
        preview: previews?.get(d.id),
        behind: behind[d.id] ?? 0,
        parentName: d.parent ? byId.get(d.parent.docId)?.name : undefined,
        childCount: docs.filter((c) => c.parent?.docId === d.id).length,
      },
    }));
    const edges: Edge[] = docs
      .filter((d) => d.parent && byId.has(d.parent.docId))
      .map((d) => {
        const n = behind[d.id] ?? 0;
        const color = docColor(d.parent!.docId, byId.get(d.parent!.docId)?.color);
        return {
          id: `${d.parent!.docId}->${d.id}`,
          source: d.parent!.docId,
          target: d.id,
          type: 'smoothstep',
          label: n > 0 ? `${n} update${n === 1 ? '' : 's'} to pull` : d.recipe?.tags.length ? d.recipe.tags.map((t) => `#${t}`).join(' ') : undefined,
          labelStyle: { fontSize: 11, fill: n > 0 ? 'var(--warn)' : 'var(--muted)' },
          labelBgStyle: { fill: 'var(--panel)' },
          style: { stroke: color, strokeWidth: 2, strokeDasharray: n > 0 ? '6 4' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        };
      });
    return { nodes, edges };
  }, [docs, previews, behind]);

  // React Flow needs to write measured sizes back into node state before it shows nodes.
  const [rfNodes, setNodes, onNodesChange] = useNodesState<DocNodeType>(nodes);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState<Edge>(edges);
  useEffect(() => setNodes(nodes), [nodes, setNodes]);
  useEffect(() => setEdges(edges), [edges, setEdges]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
      minZoom={0.2}
      nodesConnectable={false}
      onNodeDoubleClick={(_, n) => navigate(`/doc/${n.id}`)}
      onNodeClick={(_, n) => navigate(`/doc/${n.id}`)}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} color="var(--border)" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor={(n) => docColor(n.id, (n.data as { doc: DocMeta }).doc.color)} />
    </ReactFlow>
  );
}
