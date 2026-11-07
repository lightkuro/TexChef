import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { MoreHorizontal, ExternalLink, GitBranch, GitCompare, GitPullRequestArrow, Copy, Pencil, Download, Trash2, FileArchive, Archive, ArchiveRestore, Palette, AlertTriangle, FolderInput } from 'lucide-react';
import { ColorDialog } from './ColorDialog';
import { MoveToFolderDialog } from '@/features/folders/MoveToFolderDialog';
import { toast } from 'sonner';
import type { DocMeta } from '@/core/model';
import { db, repo, useDocs } from '@/app/repo';
import { forkDocument } from '@/variants/ops';
import { makePreviews } from '@/features/workspace/previews';
import { downloadPdf, downloadProjectZip } from '@/features/importexport/io';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Dialog,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui';

/**
 * Menus and dialogs render in a portal, but React still bubbles their events to the component that
 * owns them. On the map that is a document card, which opens the document when clicked, so every
 * menu item and dialog button would also open the document. Events stop here instead.
 */
function Contained({ children, keys = false }: { children: ReactNode; keys?: boolean }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className="contents" onClick={stop} onDoubleClick={stop} onContextMenu={stop} onKeyDown={keys ? stop : undefined}>
      {children}
    </div>
  );
}

interface Action {
  key: string;
  label: string;
  icon: ReactNode;
  run: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

function useDocActions(doc: DocMeta) {
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [coloring, setColoring] = useState(false);
  const [moving, setMoving] = useState(false);
  const [name, setName] = useState(doc.name);
  const variants = (useDocs() ?? []).filter((d) => d.parent?.docId === doc.id && !d.deleted);

  const actions: Action[] = [
    { key: 'open', label: 'Open', icon: <ExternalLink className="size-4" />, run: () => navigate(`/doc/${doc.id}`) },
    { key: 'variant', label: 'New variant…', icon: <GitBranch className="size-4" />, run: () => navigate(`/doc/${doc.id}/new-variant`) },
    {
      key: 'pull',
      label: 'Get updates from original',
      icon: <GitPullRequestArrow className="size-4" />,
      run: () => navigate(`/doc/${doc.id}/pull`),
      disabled: !doc.parent,
    },
    {
      key: 'compare',
      label: doc.parent ? 'Compare with original' : 'Compare side by side…',
      icon: <GitCompare className="size-4" />,
      run: () => navigate(`/compare?left=${doc.id}${doc.parent ? `&right=${doc.parent.docId}` : ''}`),
    },
    {
      key: 'dup',
      label: 'Duplicate',
      icon: <Copy className="size-4" />,
      run: async () => {
        const d = await forkDocument(repo, doc.id, `${doc.name} (copy)`);
        toast.success(`Created “${d.name}”`);
      },
    },
    { key: 'rename', label: 'Rename…', icon: <Pencil className="size-4" />, run: () => (setName(doc.name), setRenaming(true)) },
    { key: 'color', label: 'Color…', icon: <Palette className="size-4" />, run: () => setColoring(true) },
    { key: 'move', label: 'Move to folder…', icon: <FolderInput className="size-4" />, run: () => setMoving(true) },
    {
      key: 'archive',
      label: doc.archived ? 'Unarchive' : 'Archive',
      icon: doc.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />,
      run: async () => {
        await repo.updateDoc(doc.id, { archived: !doc.archived });
        toast.success(doc.archived ? `Restored “${doc.name}”` : `Archived “${doc.name}”. Show archived documents from the dashboard toolbar.`);
      },
    },
    {
      key: 'pdf',
      label: 'Download PDF',
      icon: <Download className="size-4" />,
      separatorBefore: true,
      run: async () => {
        // Compile first if there is no PDF yet, or the text changed since.
        await makePreviews([doc], { quiet: true });
        const p = await db.previews.get(doc.id);
        if (p) downloadPdf(doc.name, p.pdf);
        else toast.error(`“${doc.name}” didn’t compile. Open it to see the problems.`);
      },
    },
    {
      key: 'zip',
      label: 'Download project (.zip)',
      icon: <FileArchive className="size-4" />,
      run: async () => downloadProjectZip(doc, (await repo.getWork(doc.id)).files, (await db.previews.get(doc.id))?.pdf),
    },
    { key: 'delete', label: 'Delete…', icon: <Trash2 className="size-4" />, danger: true, separatorBefore: true, run: () => setDeleting(true) },
  ];

  const dialogs = (
    <Contained keys>
      {coloring && <ColorDialog doc={doc} open={coloring} onOpenChange={setColoring} />}
      {moving && <MoveToFolderDialog doc={doc} open={moving} onOpenChange={setMoving} />}
      <Dialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename document"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (name.trim()) await repo.updateDoc(doc.id, { name: name.trim() });
                setRenaming(false);
              }}
            >
              Rename
            </Button>
          </>
        }
      >
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && repo.updateDoc(doc.id, { name: name.trim() }).then(() => setRenaming(false))} />
      </Dialog>
      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${doc.name}”?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)} autoFocus>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await repo.deleteDoc(doc.id);
                setDeleting(false);
                toast.success(`Deleted “${doc.name}”`);
              }}
              data-testid="confirm-delete"
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm" data-testid="delete-warning">
          <p className="flex gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>This can’t be undone. The document and all of its versions disappear from texChef on every device that syncs with this one.</span>
          </p>
          {variants.length > 0 && (
            <p>
              Its {variants.length === 1 ? 'variant' : `${variants.length} variants`} ({variants.map((v) => `“${v.name}”`).join(', ')}){' '}
              {variants.length === 1 ? 'is' : 'are'} kept, but will no longer get updates from it.
            </p>
          )}
          <p className="text-muted">
            Want to keep it out of the way instead? Use <b>Archive</b>: it hides the document until you choose to show archived ones. A copy
            already in your Google Drive folder is not removed.
          </p>
        </div>
      </Dialog>
    </Contained>
  );
  return { actions, dialogs };
}

/** "…" dropdown, or (with `asContextMenu`) a right-click menu around `children`. */
export function DocActionsMenu({ doc, asContextMenu, children }: { doc: DocMeta; asContextMenu?: boolean; children?: ReactNode }) {
  const { actions, dialogs } = useDocActions(doc);
  if (asContextMenu) {
    return (
      <>
        <ContextMenu>
          {/* Don't let a right-click menu around this one (the map or list background) open too. */}
          <ContextMenuTrigger asChild onContextMenu={(e) => e.stopPropagation()}>
            {children}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <Contained>
              {actions.map((a) => (
                <div key={a.key}>
                  {a.separatorBefore && <ContextMenuSeparator />}
                  <ContextMenuItem onSelect={a.run} danger={a.danger} disabled={a.disabled}>
                    {a.icon} {a.label}
                  </ContextMenuItem>
                </div>
              ))}
            </Contained>
          </ContextMenuContent>
        </ContextMenu>
        {dialogs}
      </>
    );
  }
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button className="nodrag rounded p-0.5 hover:bg-subtle" aria-label={`Actions for ${doc.name}`} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent>
          <Contained>
            {actions.map((a) => (
              <div key={a.key}>
                {a.separatorBefore && <MenuSeparator />}
                <MenuItem onSelect={a.run} danger={a.danger} disabled={a.disabled}>
                  {a.icon} {a.label}
                </MenuItem>
              </div>
            ))}
          </Contained>
        </MenuContent>
      </Menu>
      {dialogs}
    </>
  );
}
