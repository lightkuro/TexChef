import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Files, Folder, FolderOpen, FolderPlus, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import type { DocMeta } from '@/core/model';
import { Button } from '@/components/ui';
import { ActionContextMenu, ActionDropdown, type MenuAction } from '@/components/ActionMenu';
import { cn } from '@/lib/utils';
import { buildFolderTree, flattenTree, folderName, inFolder } from './folderTree';
import { moveDocsToFolder, moveFolderInto, useEmptyFolders } from './folders';
import { folderActions, openFolderDialog } from './folderDialogs';

/** Old selection meaning "documents in no folder" (now the top level). */
export const UNFILED = '__unfiled__';
/** Drag type for documents dragged onto a folder. */
export const DOC_DRAG_TYPE = 'application/x-texchef-docs';
/** Drag type for a folder dragged onto another folder. */
export const FOLDER_DRAG_TYPE = 'application/x-texchef-folder';

/** Props that make a folder row draggable (to drop it into another folder). */
export function folderDragProps(path: string) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.setData(FOLDER_DRAG_TYPE, path);
      e.dataTransfer.effectAllowed = 'move';
    },
  };
}

/** Props that make an element accept dragged documents (or folders) and move them into `folder`. */
export function useDocDrop(onFolderMoved?: (from: string, to: string) => void) {
  const [over, setOver] = useState<string | null>(null);
  const props = (folder: string | undefined, key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DOC_DRAG_TYPE) && !e.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(key);
    },
    onDragLeave: () => setOver((t) => (t === key ? null : t)),
    onDrop: async (e: React.DragEvent) => {
      const moved = e.dataTransfer.getData(FOLDER_DRAG_TYPE);
      const raw = e.dataTransfer.getData(DOC_DRAG_TYPE);
      if (!raw && !moved) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(null);
      if (moved) {
        if (moved === folder) return;
        const r = await moveFolderInto(moved, folder);
        if ('error' in r) toast.error(r.error);
        else {
          toast.success(`Moved “${folderName(moved)}” ${folder ? `into “${folderName(folder)}”` : 'to the top level'}`);
          onFolderMoved?.(moved, r.to);
        }
        return;
      }
      const ids = JSON.parse(raw) as string[];
      await moveDocsToFolder(ids, folder);
      toast.success(`Moved ${ids.length === 1 ? 'document' : `${ids.length} documents`} to ${folder ? `“${folderName(folder)}”` : 'the top level'}`);
    },
  });
  return { over, props };
}

/** Folder tree on the home page: pick a folder to see its documents, drop documents on one to move them. */
export function FolderSidebar({
  docs,
  current,
  onSelect,
  actionsFor,
}: {
  docs: DocMeta[];
  current: string | null;
  onSelect: (f: string | null) => void;
  /** Menu for a folder (defaults to open / new inside / rename / delete). */
  actionsFor?: (path: string) => MenuAction[];
}) {
  const empty = useEmptyFolders((s) => s.list);
  const tree = useMemo(() => buildFolderTree(docs.map((d) => d.folder), empty), [docs, empty]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = flattenTree(tree, collapsed);
  // Keep the open folder open when it (or a folder around it) is dragged somewhere else.
  const drop = useDocDrop((from, to) => current && inFolder(current, from) && onSelect(to + current.slice(from.length)));

  const row = (key: string, label: React.ReactNode, icon: React.ReactNode, count: number, active: boolean, onClick: () => void, extra?: React.ReactNode, depth = 0, folder?: string) => (
    // The whole row opens the folder (the arrow and the ⋯ menu stop their own clicks).
    <div
      key={key}
      className={cn(
        'group flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-1 text-sm',
        active ? 'bg-accent-soft font-medium text-fg' : 'text-muted hover:bg-subtle hover:text-fg',
        drop.over === key && 'ring-2 ring-accent',
      )}
      style={{ paddingLeft: 6 + depth * 14 }}
      onClick={onClick}
      {...drop.props(folder, key)}
      {...(folder ? folderDragProps(folder) : {})}
      data-testid={`folder-${key}`}
    >
      {extra}
      <button className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left" tabIndex={0}>
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-[11px] text-muted tabular-nums">{count}</span>
      </button>
    </div>
  );

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel" data-testid="folder-sidebar">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 text-xs font-semibold tracking-wide text-muted uppercase">
        Folders
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => openFolderDialog({ kind: 'new', parent: current ?? undefined })}
          aria-label="New folder"
          data-testid="new-folder"
        >
          <FolderPlus className="size-4" />
        </Button>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-3">
        {row('all', 'All documents', <Files className="size-4 shrink-0" />, docs.length, current === null, () => onSelect(null), undefined, 0, undefined)}
        {rows.map((n) => {
          const actions = actionsFor ? actionsFor(n.path) : folderActions(n.path, onSelect);
          const r = row(
            n.path,
            n.name,
            current === n.path ? <FolderOpen className="size-4 shrink-0 text-accent" /> : <Folder className="size-4 shrink-0" />,
            n.count,
            current === n.path,
            () => onSelect(n.path),
            <>
              {n.children.length > 0 ? (
                <button
                  className="-mr-1 rounded p-0.5 hover:bg-line"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((c) => (c.has(n.path) ? new Set([...c].filter((p) => p !== n.path)) : new Set([...c, n.path])));
                  }}
                  aria-label={collapsed.has(n.path) ? `Expand ${n.name}` : `Collapse ${n.name}`}
                >
                  {collapsed.has(n.path) ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
              ) : (
                <span className="w-4" />
              )}
              <span className="order-last opacity-0 group-hover:opacity-100 focus-within:opacity-100" onClick={(e) => e.stopPropagation()}>
                <ActionDropdown
                  align="start"
                  label={n.name}
                  actions={actions}
                  trigger={
                    <button className="rounded p-0.5 hover:bg-line" aria-label={`Actions for folder ${n.name}`}>
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  }
                />
              </span>
            </>,
            n.depth,
            n.path,
          );
          return (
            <ActionContextMenu key={n.path} actions={actions} label={n.name}>
              {r}
            </ActionContextMenu>
          );
        })}
        {rows.length === 0 && (
          <p className="px-2 pt-3 text-xs leading-relaxed text-muted">
            Group documents into folders: click <FolderPlus className="inline size-3.5" />, then move documents in with <b>⋯ → Move to folder</b> or by
            dragging them onto a folder. Drag a folder onto another to put it inside.
          </p>
        )}
      </nav>
    </aside>
  );
}
