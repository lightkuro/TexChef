import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { GitBranch, GitPullRequestArrow, AlertTriangle, FileText } from 'lucide-react';
import type { DocMeta, PreviewRecord } from '@/core/model';
import { Badge } from '@/components/ui';
import { cn, docColor, timeAgo } from '@/lib/utils';
import { DocActionsMenu } from '@/features/dashboard/DocActions';

export type DocNodeData = {
  doc: DocMeta;
  preview?: PreviewRecord;
  behind: number;
  parentName?: string;
  childCount: number;
};

export type DocNodeType = Node<DocNodeData, 'doc'>;

export const DOC_NODE_W = 232;
export const DOC_NODE_H = 210;

export const DocCard = memo(function DocCard({ data, selected }: NodeProps<DocNodeType>) {
  const { doc, preview, behind, childCount } = data;
  const color = docColor(doc.id, doc.color);
  return (
    <DocActionsMenu doc={doc} asContextMenu>
      <div
        className={cn(
          'group overflow-hidden rounded-xl border bg-panel shadow-sm transition-shadow hover:shadow-md',
          doc.archived && 'opacity-60',
          selected ? 'border-accent ring-2 ring-accent/30' : 'border-line',
        )}
        style={{ width: DOC_NODE_W }}
        data-testid={`doc-node-${doc.name}`}
      >
        <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-line" />
        <div className="h-1" style={{ background: color }} />
        <div className="relative h-[118px] overflow-hidden border-b border-line bg-subtle">
          {preview?.thumbnail ? (
            <img src={preview.thumbnail} alt="" className="w-full object-cover object-top" draggable={false} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              <FileText className="size-8 opacity-40" />
            </div>
          )}
          {preview && (
            <Badge tone={preview.pages === 1 ? 'ok' : 'neutral'} className="absolute top-1.5 right-1.5 shadow-sm">
              {preview.pages} {preview.pages === 1 ? 'page' : 'pages'}
            </Badge>
          )}
        </div>
        <div className="space-y-1 px-3 py-2">
          <div className="flex items-center gap-1.5">
            {doc.parent && <GitBranch className="size-3.5 shrink-0 text-muted" />}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{doc.name}</span>
            <span className="opacity-0 group-hover:opacity-100">
              <DocActionsMenu doc={doc} />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {behind > 0 && (
              <Badge tone="warn">
                <GitPullRequestArrow className="size-3" /> {behind} behind
              </Badge>
            )}
            {(doc.divergedHeads?.length ?? 0) > 0 && (
              <Badge tone="danger">
                <AlertTriangle className="size-3" /> edited elsewhere
              </Badge>
            )}
            {doc.archived && <Badge tone="neutral">archived</Badge>}
            {childCount > 0 && <Badge tone="neutral">{childCount} variant{childCount === 1 ? '' : 's'}</Badge>}
            {doc.recipe?.tags.map((t) => (
              <Badge key={t} tone="accent">
                #{t}
              </Badge>
            ))}
            <span className="ml-auto text-[11px] text-muted">{timeAgo(doc.updatedAt)}</span>
          </div>
        </div>
        <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-line" />
      </div>
    </DocActionsMenu>
  );
});
