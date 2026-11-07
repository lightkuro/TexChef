import { useMemo, useState } from 'react';
import { Check, Folder, FolderPlus, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import type { DocMeta } from '@/core/model';
import { useDocs } from '@/app/repo';
import { Button, Dialog, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { buildFolderTree, cleanFolder, flattenTree, folderName } from './folderTree';
import { moveDocsToFolder, useEmptyFolders } from './folders';

/** Pick a folder (or make one) for a document. */
export function MoveToFolderDialog({ doc, open, onOpenChange }: { doc: DocMeta; open: boolean; onOpenChange: (o: boolean) => void }) {
  const docs = useDocs();
  const empty = useEmptyFolders((s) => s.list);
  const addEmpty = useEmptyFolders((s) => s.add);
  const rows = useMemo(() => flattenTree(buildFolderTree((docs ?? []).filter((d) => !d.deleted).map((d) => d.folder), empty)), [docs, empty]);
  const [choice, setChoice] = useState<string | undefined>(doc.folder);
  const [newName, setNewName] = useState('');

  const move = async (folder: string | undefined) => {
    await moveDocsToFolder([doc.id], folder);
    toast.success(folder ? `Moved “${doc.name}” to “${folderName(folder)}”` : `“${doc.name}” is no longer in a folder`);
    onOpenChange(false);
  };

  const create = async () => {
    const leaf = cleanFolder(newName.replace(/\//g, ' '));
    if (!leaf) return;
    const path = choice ? `${choice}/${leaf}` : leaf;
    addEmpty(path);
    await move(path);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Move “${doc.name}” to a folder`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => move(choice)} disabled={choice === doc.folder} data-testid="move-folder-ok">
            Move
          </Button>
        </>
      }
    >
      <div className="max-h-72 space-y-0.5 overflow-auto" role="radiogroup" aria-label="Folder">
        {[{ path: undefined as string | undefined, name: 'No folder', depth: 0 }, ...rows].map((r) => (
          <button
            key={r.path ?? '-'}
            role="radio"
            aria-checked={choice === r.path}
            onClick={() => setChoice(r.path)}
            onDoubleClick={() => move(r.path)}
            className={cn('flex h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-sm', choice === r.path ? 'bg-accent-soft' : 'hover:bg-subtle')}
            style={{ paddingLeft: 8 + r.depth * 14 }}
            data-testid={`move-to-${r.path ?? 'none'}`}
          >
            {r.path ? <Folder className="size-4 text-muted" /> : <Inbox className="size-4 text-muted" />}
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            {doc.folder === r.path && <span className="text-[11px] text-muted">current</span>}
            {choice === r.path && <Check className="size-4 text-accent" />}
          </button>
        ))}
      </div>
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
