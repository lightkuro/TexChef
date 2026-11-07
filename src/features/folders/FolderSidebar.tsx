import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Files, Folder, FolderOpen, FolderPlus, Inbox, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import type { DocMeta } from '@/core/model';
import { Button, Dialog, Input, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui';
import { cn } from '@/lib/utils';
import { buildFolderTree, cleanFolder, flattenTree, folderName, inFolder, parentFolder, type FolderNode } from './folderTree';
import { deleteFolder, moveDocsToFolder, renameFolder, useEmptyFolders } from './folders';

/** Selection meaning "documents in no folder". */
export const UNFILED = '__unfiled__';
/** Drag type for documents dragged onto a folder. */
export const DOC_DRAG_TYPE = 'application/x-texchef-docs';

type Pending = { kind: 'new'; parent?: string } | { kind: 'rename'; node: FolderNode } | { kind: 'delete'; node: FolderNode };

/** Folder tree on the home page: pick a folder to see its documents, drop documents on one to move them. */
export function FolderSidebar({ docs, current, onSelect }: { docs: DocMeta[]; current: string | null; onSelect: (f: string | null) => void }) {
  const empty = useEmptyFolders((s) => s.list);
  const addEmpty = useEmptyFolders((s) => s.add);
  const tree = useMemo(() => buildFolderTree(docs.map((d) => d.folder), empty), [docs, empty]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = flattenTree(tree, collapsed);
  const unfiled = docs.filter((d) => !d.folder).length;
  const [pending, setPending] = useState<Pending | null>(null);
  const [name, setName] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const dropProps = (target: string | undefined, key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DOC_DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(key);
    },
    onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
    onDrop: async (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(DOC_DRAG_TYPE);
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);
      const ids = JSON.parse(raw) as string[];
      await moveDocsToFolder(ids, target);
      toast.success(`Moved ${ids.length === 1 ? 'document' : `${ids.length} documents`} to ${target ? `“${folderName(target)}”` : 'no folder'}`);
    },
  });

  const openNew = () => {
    const parent = current && current !== UNFILED ? current : undefined;
    setName('');
    setPending({ kind: 'new', parent });
  };

  const submit = async () => {
    if (!pending) return;
    if (pending.kind === 'new') {
      const leaf = cleanFolder(name.replace(/\//g, ' '));
      if (!leaf) return;
      const path = pending.parent ? `${pending.parent}/${leaf}` : leaf;
      addEmpty(path);
      if (pending.parent) setCollapsed((c) => new Set([...c].filter((p) => p !== pending.parent)));
      onSelect(path);
    } else if (pending.kind === 'rename') {
      const leaf = cleanFolder(name.replace(/\//g, ' '));
      if (!leaf) return;
      const up = parentFolder(pending.node.path);
      const to = up ? `${up}/${leaf}` : leaf;
      await renameFolder(pending.node.path, to);
      if (current && inFolder(current, pending.node.path)) onSelect(to + current.slice(pending.node.path.length));
    } else {
      await deleteFolder(pending.node.path);
      if (current && inFolder(current, pending.node.path)) onSelect(parentFolder(pending.node.path) ?? null);
    }
    setPending(null);
  };

  const row = (key: string, label: React.ReactNode, icon: React.ReactNode, count: number, active: boolean, onClick: () => void, extra?: React.ReactNode, depth = 0, drop?: ReturnType<typeof dropProps>) => (
    <div
      key={key}
      className={cn(
        'group flex h-8 items-center gap-1.5 rounded-md pr-1 text-sm',
        active ? 'bg-accent-soft font-medium text-fg' : 'text-muted hover:bg-subtle hover:text-fg',
        dropTarget === key && 'ring-2 ring-accent',
      )}
      style={{ paddingLeft: 6 + depth * 14 }}
      {...drop}
      data-testid={`folder-${key}`}
    >
      {extra}
      <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={onClick}>
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
        <Button size="icon-sm" variant="ghost" onClick={openNew} aria-label="New folder" data-testid="new-folder">
          <FolderPlus className="size-4" />
        </Button>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-3">
        {row('all', 'All documents', <Files className="size-4 shrink-0" />, docs.length, current === null, () => onSelect(null))}
        {rows.map((n) =>
          row(
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
                  onClick={() => setCollapsed((c) => (c.has(n.path) ? new Set([...c].filter((p) => p !== n.path)) : new Set([...c, n.path])))}
                  aria-label={collapsed.has(n.path) ? `Expand ${n.name}` : `Collapse ${n.name}`}
                >
                  {collapsed.has(n.path) ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
              ) : (
                <span className="w-4" />
              )}
              <span className="order-last opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                <Menu>
                  <MenuTrigger asChild>
                    <button className="rounded p-0.5 hover:bg-line" aria-label={`Actions for folder ${n.name}`}>
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  </MenuTrigger>
                  <MenuContent align="start">
                    <MenuItem
                      onSelect={() => {
                        setName('');
                        setPending({ kind: 'new', parent: n.path });
                      }}
                    >
                      <FolderPlus className="size-4" /> New folder inside
                    </MenuItem>
                    <MenuItem
                      onSelect={() => {
                        setName(n.name);
                        setPending({ kind: 'rename', node: n });
                      }}
                    >
                      <Pencil className="size-4" /> Rename…
                    </MenuItem>
                    <MenuItem danger onSelect={() => setPending({ kind: 'delete', node: n })}>
                      <Trash2 className="size-4" /> Delete folder…
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </span>
            </>,
            n.depth,
            dropProps(n.path, n.path),
          ),
        )}
        {(rows.length > 0 || unfiled < docs.length) &&
          row(UNFILED, 'Not in a folder', <Inbox className="size-4 shrink-0" />, unfiled, current === UNFILED, () => onSelect(UNFILED), undefined, 0, dropProps(undefined, UNFILED))}
        {rows.length === 0 && (
          <p className="px-2 pt-3 text-xs leading-relaxed text-muted">
            Group documents into folders: click <FolderPlus className="inline size-3.5" />, then move documents in with <b>⋯ → Move to folder</b> or by
            dragging them here from the List view.
          </p>
        )}
      </nav>
      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={
          pending?.kind === 'new'
            ? pending.parent
              ? `New folder in “${folderName(pending.parent)}”`
              : 'New folder'
            : pending?.kind === 'rename'
              ? `Rename “${pending.node.name}”`
              : pending?.kind === 'delete'
                ? `Delete folder “${pending.node.name}”?`
                : ''
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant={pending?.kind === 'delete' ? 'danger' : 'primary'} onClick={submit} data-testid="folder-dialog-ok">
              {pending?.kind === 'new' ? 'Create' : pending?.kind === 'rename' ? 'Rename' : 'Delete folder'}
            </Button>
          </>
        }
      >
        {pending?.kind === 'delete' ? (
          <p className="text-sm">
            {pending.node.count > 0 ? (
              <>
                Its {pending.node.count} document{pending.node.count === 1 ? '' : 's'} {pending.node.count === 1 ? 'is' : 'are'} kept and move to{' '}
                {parentFolder(pending.node.path) ? <b>{folderName(parentFolder(pending.node.path)!)}</b> : 'no folder'}. Nothing is deleted except the folder.
              </>
            ) : (
              'The folder is empty.'
            )}
          </p>
        ) : (
          <Input
            autoFocus
            placeholder="Folder name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            aria-label="Folder name"
            data-testid="folder-name"
          />
        )}
      </Dialog>
    </aside>
  );
}
