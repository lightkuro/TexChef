import { memo, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react';
import { FileText, Folder, FolderOpen } from 'lucide-react';
import type { PreviewRecord } from '@/core/model';
import type { FolderItem } from '@/features/folders/folderView';
import { cn } from '@/lib/utils';
import { CARD_W, GROUP_HEADER } from './mapLayout';

export type FolderNodeData = {
  item: FolderItem;
  previews: (PreviewRecord | undefined)[];
  vertical: boolean;
  fullPage: boolean;
  /** A document is being dragged over it. */
  dropping: boolean;
  /** Wraps the card in its right-click menu. */
  wrap?: (children: React.ReactElement) => React.ReactNode;
};
export type FolderNodeType = Node<FolderNodeData, 'folder'>;

/** A folder on the map: open it with a click, drop documents on it to move them in. */
export const FolderCard = memo(function FolderCard({ id, data }: NodeProps<FolderNodeType>) {
  const { item, previews, vertical, fullPage, dropping, wrap } = data;
  const updateInternals = useUpdateNodeInternals();
  useEffect(() => updateInternals(id), [id, vertical, fullPage, updateInternals]);
  const shown = previews.slice(0, 4);
  const card = (
    <div
      className={cn(
        'group overflow-hidden rounded-xl border bg-panel shadow-sm transition-shadow hover:shadow-md',
        dropping ? 'border-accent ring-4 ring-accent/30' : 'border-line',
      )}
      style={{ width: CARD_W }}
      data-testid={`folder-node-${item.name}`}
    >
      <Handle type="target" position={vertical ? Position.Top : Position.Left} className="!size-2 !border-0 !bg-line" />
      <div className={cn('relative grid grid-cols-2 gap-1 border-b border-line bg-subtle p-1.5', fullPage ? 'h-[300px]' : 'h-[118px]')}>
        {shown.length === 0 && (
          <div className="col-span-2 flex items-center justify-center text-muted">
            <Folder className="size-10 opacity-40" />
          </div>
        )}
        {shown.map((p, i) => (
          <div key={i} className={cn('overflow-hidden rounded bg-panel', shown.length === 1 && 'col-span-2', shown.length === 3 && i === 0 && 'row-span-2')}>
            {p?.thumbnail ? (
              <img src={p.thumbnail} alt="" className="h-full w-full object-cover object-top" draggable={false} />
            ) : (
              <div className="flex h-full items-center justify-center text-muted">
                <FileText className="size-5 opacity-40" />
              </div>
            )}
          </div>
        ))}
        {dropping && (
          <div className="absolute inset-0 flex items-center justify-center bg-accent-soft/80 text-sm font-medium text-accent">Move into “{item.name}”</div>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-3 py-2">
        {dropping ? <FolderOpen className="size-4 shrink-0 text-accent" /> : <Folder className="size-4 shrink-0 text-accent" />}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
        <span className="text-[11px] text-muted">
          {item.count} document{item.count === 1 ? '' : 's'}
        </span>
      </div>
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} className="!size-2 !border-0 !bg-line" />
    </div>
  );
  return <>{wrap ? wrap(card) : card}</>;
});

export type GroupNodeData = { label: string; count: number; depth: number };
export type GroupNodeType = Node<GroupNodeData, 'group-frame'>;

/** A frame around the documents of one folder (grouped view). */
export const GroupFrame = memo(function GroupFrame({ data }: NodeProps<GroupNodeType>) {
  return (
    <div className="h-full w-full rounded-2xl border border-dashed border-line bg-subtle/40" data-testid={`group-frame-${data.label}`}>
      <div className="flex items-center gap-1.5 px-4 text-sm font-medium text-muted" style={{ height: GROUP_HEADER }}>
        <Folder className="size-4 text-accent" />
        <span className="truncate">{data.label}</span>
        <span className="text-[11px]">· {data.count}</span>
      </div>
    </div>
  );
});
