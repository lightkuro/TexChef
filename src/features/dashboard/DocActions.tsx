import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { MoreHorizontal, ExternalLink, GitBranch, GitCompare, GitPullRequestArrow, Copy, Pencil, Download, Trash2, FileArchive, Archive, ArchiveRestore, Palette } from 'lucide-react';
import { ColorDialog } from './ColorDialog';
import { toast } from 'sonner';
import type { DocMeta } from '@/core/model';
import { db, repo } from '@/app/repo';
import { forkDocument } from '@/variants/ops';
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
  const [name, setName] = useState(doc.name);

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
        const p = await db.previews.get(doc.id);
        if (p) downloadPdf(doc.name, p.pdf);
        else toast.info('Open the document once to compile it first.');
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
    <>
      {coloring && <ColorDialog doc={doc} open={coloring} onOpenChange={setColoring} />}
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
        description="Its versions stay in the history store, but the document disappears from every device. Variants of it become standalone documents."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await repo.deleteDoc(doc.id);
                setDeleting(false);
                toast.success('Deleted');
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </>
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
          <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
          <ContextMenuContent>
            {actions.map((a) => (
              <div key={a.key}>
                {a.separatorBefore && <ContextMenuSeparator />}
                <ContextMenuItem onSelect={a.run} danger={a.danger} disabled={a.disabled}>
                  {a.icon} {a.label}
                </ContextMenuItem>
              </div>
            ))}
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
          {actions.map((a) => (
            <div key={a.key}>
              {a.separatorBefore && <MenuSeparator />}
              <MenuItem onSelect={a.run} danger={a.danger} disabled={a.disabled}>
                {a.icon} {a.label}
              </MenuItem>
            </div>
          ))}
        </MenuContent>
      </Menu>
      {dialogs}
    </>
  );
}
