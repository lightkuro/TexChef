import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { GitBranch, FileText, GitPullRequestArrow, AlertTriangle, Folder, GripVertical, MoreHorizontal } from 'lucide-react';
import type { DocMeta } from '@/core/model';
import { repo, usePreviews } from '@/app/repo';
import { Badge } from '@/components/ui';
import { ActionContextMenu, ActionDropdown, type MenuAction } from '@/components/ActionMenu';
import { cn, docColor, timeAgo } from '@/lib/utils';
import { DocActionsMenu } from './DocActions';
import { DOC_DRAG_TYPE, folderDragProps, useDocDrop } from '@/features/folders/FolderSidebar';
import type { FolderItem, FolderMode, FolderViewModel } from '@/features/folders/folderView';

const GRID = 'grid grid-cols-[1fr_110px_120px_32px] items-center gap-2';

/** Family tree rows (original → variants) for a set of documents. */
function treeRows(docs: DocMeta[]): { doc: DocMeta; depth: number }[] {
  const ids = new Set(docs.map((d) => d.id));
  const rows: { doc: DocMeta; depth: number }[] = [];
  const visit = (d: DocMeta, depth: number) => {
    rows.push({ doc: d, depth });
    docs.filter((c) => c.parent?.docId === d.id).forEach((c) => visit(c, depth + 1));
  };
  docs.filter((d) => !d.parent || !ids.has(d.parent.docId)).forEach((d) => visit(d, 0));
  return rows;
}

/** The open folder as a list: subfolders first (browse), then documents, grouped by folder (grouped). */
export function DocList({
  view,
  mode,
  showFolder,
  onOpenFolder,
  folderActionsFor,
}: {
  view: FolderViewModel;
  mode: FolderMode;
  showFolder?: boolean;
  onOpenFolder: (path: string) => void;
  folderActionsFor: (item: FolderItem) => MenuAction[];
}) {
  const previews = usePreviews();
  const [behind, setBehind] = useState<Record<string, number>>({});
  const drop = useDocDrop();
  useEffect(() => {
    void Promise.all(view.docs.map(async (d) => [d.id, await repo.commitsBehindParent(d)] as const)).then((p) => setBehind(Object.fromEntries(p)));
  }, [view.docs]);

  const docRow = ({ doc, depth }: { doc: DocMeta; depth: number }) => {
    const p = previews?.get(doc.id);
    const n = behind[doc.id] ?? 0;
    return (
      <DocActionsMenu key={doc.id} doc={doc} asContextMenu>
        <div
          className={cn(GRID, 'group border-b border-l-4 border-line px-4 py-2 last:border-b-0 hover:bg-subtle')}
          style={{ borderLeftColor: docColor(doc.id, doc.color) }}
          draggable
          onDragStart={(e) => {
            // Drop onto a folder (row, card, sidebar or path) to move the document there.
            e.dataTransfer.setData(DOC_DRAG_TYPE, JSON.stringify([doc.id]));
            e.dataTransfer.effectAllowed = 'move';
          }}
          data-testid={`doc-row-${doc.name}`}
        >
          <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 22 }}>
            <GripVertical className="-ml-3 size-3.5 shrink-0 cursor-grab text-muted opacity-0 group-hover:opacity-60" aria-hidden />
            {depth > 0 ? <GitBranch className="size-4 shrink-0" style={{ color: docColor(doc.id, doc.color) }} /> : <FileText className="size-4 shrink-0" style={{ color: docColor(doc.id, doc.color) }} />}
            <Link to={`/doc/${doc.id}`} className="truncate text-sm font-medium hover:underline">
              {doc.name}
            </Link>
            {showFolder && doc.folder && (
              <span className="flex min-w-0 shrink items-center gap-1 truncate text-[11px] text-muted" title={doc.folder}>
                <Folder className="size-3 shrink-0" />
                {doc.folder}
              </span>
            )}
            {doc.archived && <Badge>archived</Badge>}
            {doc.recipe?.tags.map((t) => (
              <Badge key={t} tone="accent">
                #{t}
              </Badge>
            ))}
            {n > 0 && (
              <Badge tone="warn">
                <GitPullRequestArrow className="size-3" /> {n} update{n === 1 ? '' : 's'}
              </Badge>
            )}
            {(doc.divergedHeads?.length ?? 0) > 0 && (
              <Badge tone="danger">
                <AlertTriangle className="size-3" /> edited elsewhere
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted">{p ? `${p.pages} page${p.pages === 1 ? '' : 's'}` : '—'}</span>
          <span className="text-xs text-muted">{timeAgo(doc.updatedAt)}</span>
          <DocActionsMenu doc={doc} />
        </div>
      </DocActionsMenu>
    );
  };

  const folderRow = (f: FolderItem) => {
    const actions = folderActionsFor(f);
    return (
      <ActionContextMenu key={f.path} actions={actions} label={f.name}>
        <div
          className={cn(GRID, 'group cursor-pointer border-b border-l-4 border-line border-l-transparent px-4 py-2 last:border-b-0 hover:bg-subtle', drop.over === f.path && 'bg-accent-soft ring-2 ring-accent ring-inset')}
          onClick={() => onOpenFolder(f.path)}
          {...drop.props(f.path, f.path)}
          {...folderDragProps(f.path)}
          data-testid={`folder-row-${f.name}`}
        >
          <button className="flex min-w-0 items-center gap-2 text-left">
            <Folder className="size-4 shrink-0 text-accent" />
            <span className="truncate text-sm font-medium">{f.name}</span>
          </button>
          <span className="text-xs text-muted">
            {f.count} document{f.count === 1 ? '' : 's'}
          </span>
          <span className="text-xs text-muted">folder</span>
          <ActionDropdown
            actions={actions}
            label={f.name}
            trigger={
              <button className="rounded p-0.5 hover:bg-subtle" aria-label={`Actions for folder ${f.name}`} onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="size-4" />
              </button>
            }
          />
        </div>
      </ActionContextMenu>
    );
  };

  return (
    <div className="mx-auto max-w-5xl p-4" data-testid="doc-list">
      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className={cn(GRID, 'border-b border-line bg-subtle px-4 py-2 text-xs font-medium text-muted')}>
          <span>Name</span>
          <span>Pages</span>
          <span>Updated</span>
          <span />
        </div>
        {mode === 'browse' && view.folders.map(folderRow)}
        {mode === 'browse'
          ? treeRows(view.docs).map(docRow)
          : view.groups.map((g) => (
              <div key={g.path} data-testid={`group-${g.label}`}>
                <div
                  className={cn('flex items-center gap-2 border-b border-line bg-subtle/60 px-4 py-1.5 text-xs font-semibold text-muted', drop.over === `g:${g.path}` && 'ring-2 ring-accent ring-inset')}
                  style={{ paddingLeft: 16 + g.depth * 16 }}
                  {...drop.props(g.path || undefined, `g:${g.path}`)}
                >
                  <Folder className="size-3.5 text-accent" />
                  {g.path ? (
                    <button className="hover:text-fg hover:underline" onClick={() => onOpenFolder(g.path)}>
                      {g.label}
                    </button>
                  ) : (
                    g.label
                  )}
                  <span className="font-normal">· {g.docs.length}</span>
                </div>
                {treeRows(g.docs).map(docRow)}
              </div>
            ))}
      </div>
    </div>
  );
}
