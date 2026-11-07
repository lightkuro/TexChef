import { useMemo, useState } from 'react';
import { Check, Folder, FolderPlus, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import type { DocMeta } from '@/core/model';
import { useDocs } from '@/app/repo';
import { Button, Dialog, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { buildFolderTree, cleanFolder, flattenTree, folderName, inFolder, parentFolder } from './folderTree';
import { moveDocsToFolder, moveFolderInto, useEmptyFolders } from './folders';

/**
 * Pick a folder (or make one) to move a document, or a whole folder, into. For a folder, the
 * folder itself and the folders inside it can't be picked.
 */
export function MoveToFolderDialog({
  doc,
  folder,
  open,
  onOpenChange,
  onMoved,
}: {
  doc?: DocMeta;
  /** Move this folder instead of a document. */
  folder?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** After a folder moved: its new path. */
  onMoved?: (to: string) => void;
}) {
  const docs = useDocs();
  const empty = useEmptyFolders((s) => s.list);
  const addEmpty = useEmptyFolders((s) => s.add);
  const rows = useMemo(
    () => flattenTree(buildFolderTree((docs ?? []).filter((d) => !d.deleted).map((d) => d.folder), empty)).filter((r) => !folder || !inFolder(r.path, folder)),
    [docs, empty, folder],
  );
  const currentPlace = folder ? parentFolder(folder) : doc?.folder;
  const [choice, setChoice] = useState<string | undefined>(currentPlace);
  const [newName, setNewName] = useState('');
  const name = folder ? folderName(folder) : (doc?.name ?? '');

  const move = async (target: string | undefined) => {
    if (folder) {
      const r = await moveFolderInto(folder, target);
      if ('error' in r) {
        toast.error(r.error);
        return;
      }
      toast.success(target ? `Moved “${name}” into “${folderName(target)}”` : `Moved “${name}” to the top level`);
      onMoved?.(r.to);
    } else if (doc) {
      await moveDocsToFolder([doc.id], target);
      toast.success(target ? `Moved “${name}” to “${folderName(target)}”` : `“${name}” is no longer in a folder`);
    }
    onOpenChange(false);
  };

  const create = async () => {
    const leaf = cleanFolder(newName.replace(/\//g, ' '));
    if (!leaf) return;
    const path = choice ? `${choice}/${leaf}` : leaf;
    addEmpty(path);
    await move(path);
  };

  const merges = folder && choice !== currentPlace && rows.some((r) => r.path === (choice ? `${choice}/${name}` : name));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={folder ? `Move folder “${name}”` : `Move “${name}” to a folder`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => move(choice)} disabled={choice === currentPlace} data-testid="move-folder-ok">
            Move
          </Button>
        </>
      }
    >
      <div className="max-h-72 space-y-0.5 overflow-auto" role="radiogroup" aria-label="Folder">
        {[{ path: undefined as string | undefined, name: folder ? 'Top level' : 'No folder', depth: 0 }, ...rows].map((r) => (
          <button
            key={r.path ?? '-'}
            role="radio"
            aria-checked={choice === r.path}
            onClick={() => setChoice(r.path)}
            onDoubleClick={() => r.path !== currentPlace && move(r.path)}
            className={cn('flex h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-sm', choice === r.path ? 'bg-accent-soft' : 'hover:bg-subtle')}
            style={{ paddingLeft: 8 + r.depth * 14 }}
            data-testid={`move-to-${r.path ?? 'none'}`}
          >
            {r.path ? <Folder className="size-4 text-muted" /> : <Inbox className="size-4 text-muted" />}
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            {currentPlace === r.path && <span className="text-[11px] text-muted">current</span>}
            {choice === r.path && <Check className="size-4 text-accent" />}
          </button>
        ))}
      </div>
      {merges && (
        <p className="mt-2 text-xs text-muted">
          There is already a folder called “{name}” there. The two are combined into one.
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <FolderPlus className="size-4 shrink-0 text-muted" />
        <Input
          placeholder={choice ? `New folder in “${folderName(choice)}”` : 'New folder'}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void create()}
          aria-label="New folder name"
          data-testid="move-new-folder"
        />
        <Button variant="outline" onClick={create} disabled={!newName.trim()}>
          Create and move
        </Button>
      </div>
    </Dialog>
  );
}
