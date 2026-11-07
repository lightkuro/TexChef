import { memo, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps, type Node } from '@xyflow/react';
import { GitBranch, GitPullRequestArrow, AlertTriangle, FileText, Crown } from 'lucide-react';
import type { DocMeta, PreviewRecord } from '@/core/model';
import { Badge } from '@/components/ui';
import { cn, docColor, timeAgo } from '@/lib/utils';
import { DocActionsMenu } from '@/features/dashboard/DocActions';
import { cardHeight, CARD_W } from './mapLayout';

export type DocNodeData = {
  doc: DocMeta;
  preview?: PreviewRecord;
  behind: number;
  parentName?: string;
  childCount: number;
  /** Top of a tree: has variants and no original on the map. */
  isRoot: boolean;
  vertical: boolean;
  fullPage: boolean;
  /** On the snap grid: every card gets the cell's card height, so it sits in the middle of its cell. */
  snap?: boolean;
};

export type DocNodeType = Node<DocNodeData, 'doc'>;

export const DocCard = memo(function DocCard({ id, data, selected }: NodeProps<DocNodeType>) {
  const { doc, preview, behind, childCount, isRoot, vertical, fullPage, snap } = data;
  const color = docColor(doc.id, doc.color);
  // Connection points move (left/right ↔ top/bottom) and the card changes height: re-measure them.
  const updateInternals = useUpdateNodeInternals();
  useEffect(() => updateInternals(id), [id, vertical, fullPage, snap, updateInternals]);
  return (
    <DocActionsMenu doc={doc} asContextMenu>
      <div
        className={cn(
          'group flex flex-col overflow-hidden rounded-xl border bg-panel shadow-sm transition-shadow hover:shadow-md',
          doc.archived && 'opacity-60',
          selected ? 'border-accent ring-2 ring-accent/30' : 'border-line',
          doc.color && !selected && 'border-2',
        )}
        style={{ width: CARD_W, minHeight: snap ? cardHeight(fullPage) : undefined, borderColor: doc.color && !selected ? doc.color : undefined }}
        data-testid={`doc-node-${doc.name}`}
        data-root={isRoot || undefined}
      >
        <Handle type="target" position={vertical ? Position.Top : Position.Left} className="!size-2 !border-0 !bg-line" />
        <div className={cn('shrink-0', isRoot ? 'h-2' : 'h-1.5')} style={{ background: color }} />
        <div className={cn('relative overflow-hidden border-b border-line bg-subtle', snap ? (fullPage ? 'min-h-[300px] flex-1' : 'min-h-[118px] flex-1') : fullPage ? 'h-[300px]' : 'h-[118px]')}>
          {preview?.thumbnail ? (
            <img
              src={preview.thumbnail}
              alt=""
              className={cn('absolute inset-0 h-full w-full object-top', fullPage ? 'object-contain' : 'object-cover')}
              draggable={false}
            />
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
        <div className="shrink-0 space-y-1 px-3 py-2">
          <div className="flex items-center gap-1.5">
            {isRoot ? (
              <span title={`Top of the tree: ${childCount} variant${childCount === 1 ? '' : 's'} made from it`} data-testid="root-indicator">
                <Crown className="size-3.5 shrink-0" style={{ color }} aria-label="Top of the tree" />
              </span>
            ) : (
              doc.parent && <GitBranch className="size-3.5 shrink-0 text-muted" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{doc.name}</span>
            <span className="opacity-0 group-hover:opacity-100">
              <DocActionsMenu doc={doc} />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {behind > 0 && (
              <Badge tone="warn">
                <GitPullRequestArrow className="size-3" /> {behind} update{behind === 1 ? '' : 's'}
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
        <Handle type="source" position={vertical ? Position.Bottom : Position.Right} className="!size-2 !border-0 !bg-line" />
      </div>
    </DocActionsMenu>
  );
});
