import { useMemo, useState } from 'react';
import { Archive, ArrowDown, ArrowDownUp, ArrowUp, ChevronDown, ChevronRight, Clock, Files, Folder, FolderOpen, FolderPlus, Menu, MoreHorizontal, PanelLeftClose } from 'lucide-react';
import { toast } from 'sonner';
import type { DocMeta } from '@/core/model';
import { Button, DrawerClose } from '@/components/ui';
import { ActionContextMenu, ActionDropdown, type MenuAction } from '@/components/ActionMenu';
import { cn } from '@/lib/utils';
import { usePrefs } from '@/app/prefs';
import { buildFolderTree, flattenTree, folderName, inFolder, moved, orderTree, parentFolder } from './folderTree';
import { moveDocsToFolder, moveFolderInto, useEmptyFolders } from './folders';
import { folderActions, openFolderDialog } from './folderDialogs';

/** Old selection meaning "documents in no folder" (now the top level). */
export const UNFILED = '__unfiled__';
/** Selections that are not folders: the documents changed most recently, and the archive. */
export const RECENT = '__recent__';
export const ARCHIVE = '__archive__';
export type SpecialView = 'recent' | 'archive' | null;
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
  special = null,
  recentCount = 0,
  archivedCount = 0,
  onSelect,
  actionsFor,
  inDrawer,
}: {
  docs: DocMeta[];
  current: string | null;
  /** Recent or Archive is open instead of a folder. */
  special?: SpecialView;
  recentCount?: number;
  archivedCount?: number;
  /** A folder path, RECENT, ARCHIVE, or null for all documents. */
  onSelect: (f: string | null) => void;
  /** Menu for a folder (defaults to open / new inside / rename / delete). */
  actionsFor?: (path: string) => MenuAction[];
  /** Shown in a drawer (small screens): full width, bigger rows, a close button. */
  inDrawer?: boolean;
}) {
  const empty = useEmptyFolders((s) => s.list);
  const showRecent = usePrefs((s) => s.showRecent);
  const showArchived = usePrefs((s) => s.showArchived);
  const categoryOrder = usePrefs((s) => s.categoryOrder);
  const folderOrder = usePrefs((s) => s.folderOrder);
  const setPref = usePrefs((s) => s.set);
  /** Reordering: every row shows arrows to move it up or down among its neighbours. */
  const [reordering, setReordering] = useState(false);
  const tree = useMemo(() => orderTree(buildFolderTree(docs.map((d) => d.folder), empty), folderOrder), [docs, empty, folderOrder]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = flattenTree(tree, collapsed);
  // Keep the open folder open when it (or a folder around it) is dragged somewhere else.
  const drop = useDocDrop((from, to) => current && inFolder(current, from) && onSelect(to + current.slice(from.length)));

  /** Up and down arrows for a row, while reordering. */
  const arrows = (name: string, up: (() => void) | undefined, down: (() => void) | undefined) => (
    <span className="order-last flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
      <button className="rounded p-1 hover:bg-line disabled:opacity-25" disabled={!up} onClick={up} aria-label={`Move ${name} up`}>
        <ArrowUp className="size-3.5" />
      </button>
      <button className="rounded p-1 hover:bg-line disabled:opacity-25" disabled={!down} onClick={down} aria-label={`Move ${name} down`}>
        <ArrowDown className="size-3.5" />
      </button>
    </span>
  );
  const moveFolder = (path: string, dir: -1 | 1) => {
    const parent = parentFolder(path) ?? '';
    const siblings = rows.filter((n) => (parentFolder(n.path) ?? '') === parent).map((n) => n.name);
    setPref({ folderOrder: { ...folderOrder, [parent]: moved(siblings, folderName(path), dir) } });
  };

  const row = (key: string, label: React.ReactNode, icon: React.ReactNode, count: number, active: boolean, onClick: () => void, extra?: React.ReactNode, depth = 0, folder?: string) => (
    // The whole row opens the folder (the arrow and the ⋯ menu stop their own clicks).
    <div
      key={key}
      className={cn(
        'group flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-1 text-sm',
        inDrawer && 'h-10',
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
        {!reordering && <span className="text-[11px] text-muted tabular-nums">{count}</span>}
      </button>
    </div>
  );

  // The top entries: All documents always; Recent and Archive when switched on in the menu.
  const categories = [...new Set([...categoryOrder, 'all', 'recent', 'archive'])].filter((c) => c === 'all' || (c === 'recent' && showRecent) || (c === 'archive' && showArchived));
  const category = (c: string, i: number) => {
    const move = (dir: -1 | 1) => setPref({ categoryOrder: moved(categories, c, dir) });
    const extra = reordering ? arrows(c === 'all' ? 'All documents' : c === 'recent' ? 'Recent' : 'Archive', i > 0 ? () => move(-1) : undefined, i < categories.length - 1 ? () => move(1) : undefined) : undefined;
    if (c === 'recent') return row('recent', 'Recent', <Clock className="size-4 shrink-0" />, recentCount, special === 'recent', () => onSelect(RECENT), extra);
    if (c === 'archive') return row('archive', 'Archive', <Archive className="size-4 shrink-0" />, archivedCount, special === 'archive', () => onSelect(ARCHIVE), extra);
    return row('all', 'All documents', <Files className="size-4 shrink-0" />, docs.length, current === null && !special, () => onSelect(null), extra, 0, undefined);
  };

  const menuActions: MenuAction[] = [
    { key: 'new', label: 'New folder…', icon: <FolderPlus className="size-4" />, run: () => openFolderDialog({ kind: 'new', parent: current ?? undefined }), testId: 'new-folder' },
    { key: 'recent', label: 'Show Recent', checked: showRecent, separatorBefore: true, run: () => setPref({ showRecent: !showRecent }), testId: 'folders-show-recent' },
    { key: 'archive', label: 'Show Archive', hint: archivedCount ? String(archivedCount) : undefined, checked: showArchived, run: () => setPref({ showArchived: !showArchived }), testId: 'folders-show-archive' },
    { key: 'reorder', label: reordering ? 'Done reordering' : 'Reorder…', icon: <ArrowDownUp className="size-4" />, separatorBefore: true, run: () => setReordering((r) => !r), testId: 'folders-reorder' },
    ...(Object.keys(folderOrder).length ? [{ key: 'az', label: 'Back to A–Z order', run: () => setPref({ folderOrder: {} }), testId: 'folders-az' }] : []),
    ...(inDrawer ? [] : [{ key: 'hide', label: 'Hide this panel', icon: <PanelLeftClose className="size-4" />, separatorBefore: true, run: () => setPref({ showFolders: false }), testId: 'folders-hide' }]),
  ];
  const menu = reordering ? (
    <Button size="sm" variant="secondary" onClick={() => setReordering(false)} data-testid="folders-reorder-done">
      Done
    </Button>
  ) : (
    <ActionDropdown
      align="end"
      label="Folders"
      actions={menuActions}
      trigger={
        <Button size="icon-sm" variant="ghost" aria-label="Folders menu" data-testid="folders-menu">
          <Menu className="size-4" />
        </Button>
      }
    />
  );

  return (
    <aside className={cn('flex w-56 shrink-0 flex-col border-r border-line bg-panel', inDrawer && 'min-h-0 w-full flex-1 border-r-0')} data-testid="folder-sidebar">
      <div className={cn('flex h-9 shrink-0 items-center justify-between pr-1.5 pl-3 text-xs font-semibold tracking-wide text-muted uppercase', inDrawer && 'h-12 pr-2')}>
        Folders
        {inDrawer ? (
          <span className="flex items-center gap-1">
            {menu}
            <DrawerClose />
          </span>
        ) : (
          menu
        )}
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-3">
        {categories.map(category)}
        {rows.length > 0 && <div className="!my-1.5 h-px bg-line" />}
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
              {reordering &&
                (() => {
                  const sibs = rows.filter((x) => (parentFolder(x.path) ?? '') === (parentFolder(n.path) ?? ''));
                  const at = sibs.indexOf(n);
                  return arrows(n.name, at > 0 ? () => moveFolder(n.path, -1) : undefined, at < sibs.length - 1 ? () => moveFolder(n.path, 1) : undefined);
                })()}
              <span className={cn('order-last opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100', reordering && 'hidden')} onClick={(e) => e.stopPropagation()}>
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
            Group documents into folders: open <Menu className="inline size-3.5" /> and choose <b>New folder</b>, then move documents in with <b>⋯ → Move to folder</b> or by
            dragging them onto a folder. Drag a folder onto another to put it inside.
          </p>
        )}
      </nav>
    </aside>
  );
}
