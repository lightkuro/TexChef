import { useState } from 'react';
import { create } from 'zustand';
import { Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import type { DocMeta } from '@/core/model';
import { Button, Dialog, Input } from '@/components/ui';
import { cleanFolder, folderName, inFolder, parentFolder } from './folderTree';
import { deleteFolder, renameFolder, useEmptyFolders } from './folders';

type Pending = { kind: 'new'; parent?: string } | { kind: 'rename'; path: string } | { kind: 'delete'; path: string };

/** Asks for a folder dialog from anywhere (sidebar, list, map, right-click menus). */
export const useFolderDialog = create<{ pending: Pending | null; open: (p: Pending) => void; close: () => void }>((set) => ({
  pending: null,
  open: (pending) => set({ pending }),
  close: () => set({ pending: null }),
}));

export const openFolderDialog = (p: Pending) => useFolderDialog.getState().open(p);

/** One action on a folder, for menus. */
export interface FolderAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  run: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
}

/** The actions every folder menu offers (more can be appended by the caller). */
export function folderActions(path: string, onOpen: (path: string) => void): FolderAction[] {
  return [
    { key: 'open', label: 'Open', icon: <FolderOpen className="size-4" />, run: () => onOpen(path) },
    { key: 'new', label: 'New folder inside…', icon: <FolderPlus className="size-4" />, run: () => openFolderDialog({ kind: 'new', parent: path }) },
    { key: 'rename', label: 'Rename…', icon: <Pencil className="size-4" />, run: () => openFolderDialog({ kind: 'rename', path }) },
    { key: 'delete', label: 'Delete folder…', icon: <Trash2 className="size-4" />, danger: true, separatorBefore: true, run: () => openFolderDialog({ kind: 'delete', path }) },
  ];
}

/** The dialogs behind folder actions; rendered once on the home page. */
export function FolderDialogHost({ docs, current, onSelect }: { docs: DocMeta[]; current: string | null; onSelect: (f: string | null) => void }) {
  const pending = useFolderDialog((s) => s.pending);
  const close = useFolderDialog((s) => s.close);
  const addEmpty = useEmptyFolders((s) => s.add);
  const [name, setName] = useState('');
  const [shownFor, setShownFor] = useState<Pending | null>(null);
  // Reset the name field whenever a new dialog opens.
  if (pending !== shownFor) {
    setShownFor(pending);
    setName(pending?.kind === 'rename' ? folderName(pending.path) : '');
  }
  const count = pending && pending.kind !== 'new' ? docs.filter((d) => inFolder(d.folder, pending.path)).length : 0;

  const submit = async () => {
    if (!pending) return;
    if (pending.kind === 'new') {
      const leaf = cleanFolder(name.replace(/\//g, ' '));
      if (!leaf) return;
      const path = pending.parent ? `${pending.parent}/${leaf}` : leaf;
      addEmpty(path);
      onSelect(path);
    } else if (pending.kind === 'rename') {
      const leaf = cleanFolder(name.replace(/\//g, ' '));
      if (!leaf) return;
      const up = parentFolder(pending.path);
      const to = up ? `${up}/${leaf}` : leaf;
      await renameFolder(pending.path, to);
      if (current && inFolder(current, pending.path)) onSelect(to + current.slice(pending.path.length));
    } else {
      await deleteFolder(pending.path);
      if (current && inFolder(current, pending.path)) onSelect(parentFolder(pending.path) ?? null);
    }
    close();
  };

  const title =
    pending?.kind === 'new'
      ? pending.parent
        ? `New folder in “${folderName(pending.parent)}”`
        : 'New folder'
      : pending?.kind === 'rename'
        ? `Rename “${folderName(pending.path)}”`
        : pending?.kind === 'delete'
          ? `Delete folder “${folderName(pending.path)}”?`
          : '';

  return (
    <Dialog
      open={!!pending}
      onOpenChange={(o) => !o && close()}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
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
          {count > 0 ? (
            <>
              Its {count} document{count === 1 ? '' : 's'} {count === 1 ? 'is' : 'are'} kept and move to{' '}
              {parentFolder(pending.path) ? <b>{folderName(parentFolder(pending.path)!)}</b> : 'the top level'}. Nothing is deleted except the folder.
            </>
          ) : (
            'The folder is empty.'
          )}
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Folder className="size-4 shrink-0 text-muted" />
          <Input
            autoFocus
            placeholder="Folder name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            aria-label="Folder name"
            data-testid="folder-name"
          />
        </div>
      )}
    </Dialog>
  );
}
