import { useMemo, useRef, useState } from 'react';
import { File, FileCode2, FileImage, FilePlus2, Folder, MoreHorizontal, Star, Upload, Type } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkingCopy, DocMeta } from '@/core/model';
import { repo } from '@/app/repo';
import { addUploadsToDocument } from '@/features/importexport/io';
import { Button, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tip, Dialog, Input } from '@/components/ui';
import { cn, formatBytes } from '@/lib/utils';
import { isTextPath } from '@/core/model';

function iconFor(path: string) {
  if (/\.(png|jpe?g|gif|svg|pdf|eps)$/i.test(path)) return <FileImage className="size-3.5 shrink-0 text-info" />;
  if (/\.(ttf|otf|woff2?)$/i.test(path)) return <Type className="size-3.5 shrink-0 text-muted" />;
  if (/\.(tex|sty|cls|bib)$/i.test(path)) return <FileCode2 className="size-3.5 shrink-0 text-accent" />;
  return <File className="size-3.5 shrink-0 text-muted" />;
}

export function FileTree({
  doc,
  work,
  active,
  onOpen,
  readOnly,
}: {
  doc: DocMeta;
  work: WorkingCopy;
  active: string;
  onOpen: (path: string) => void;
  readOnly?: boolean;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState<{ mode: 'new' | 'rename'; path?: string; value: string } | null>(null);
  const paths = useMemo(() => Object.keys(work.files).sort((a, b) => {
    const da = a.includes('/') ? 1 : 0;
    const dbb = b.includes('/') ? 1 : 0;
    return da - dbb || a.localeCompare(b);
  }), [work.files]);

  const groups = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const p of paths) {
      const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
      (g.get(dir) ?? g.set(dir, []).get(dir)!).push(p);
    }
    return [...g.entries()];
  }, [paths]);

  const submitPrompt = async () => {
    if (!prompt) return;
    const name = prompt.value.trim().replace(/^\/+/, '');
    if (!name) return;
    try {
      if (prompt.mode === 'new') {
        if (work.files[name]) throw new Error(`${name} already exists`);
        if (!isTextPath(name)) throw new Error('Use upload for binary files such as images or fonts');
        await repo.writeWorkText(doc.id, name, '');
        onOpen(name);
      } else if (prompt.path) {
        await repo.renameWorkFile(doc.id, prompt.path, name);
        if (active === prompt.path) onOpen(name);
      }
      setPrompt(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="file-tree">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <span className="flex-1 text-xs font-semibold tracking-wide text-muted uppercase">Files</span>
        {!readOnly && (
          <>
            <Tip content="New file">
              <Button size="icon-sm" variant="ghost" aria-label="New file" onClick={() => setPrompt({ mode: 'new', value: 'section.tex' })}>
                <FilePlus2 className="size-3.5" />
              </Button>
            </Tip>
            <Tip content="Upload files or a .zip (images, .cls, .sty, .bib, fonts)">
              <Button size="icon-sm" variant="ghost" aria-label="Upload files" onClick={() => upload.current?.click()}>
                <Upload className="size-3.5" />
              </Button>
            </Tip>
            <input
              ref={upload}
              type="file"
              multiple
              hidden
              data-testid="upload-into-doc"
              onChange={async (e) => {
                if (!e.target.files?.length) return;
                try {
                  const added = await addUploadsToDocument(doc.id, e.target.files);
                  toast.success(`Added ${added.length} file${added.length === 1 ? '' : 's'}`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : String(err));
                }
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1 text-sm">
        {groups.map(([dir, items]) => (
          <div key={dir}>
            {dir && (
              <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted">
                <Folder className="size-3.5" /> {dir}
              </div>
            )}
            {items.map((p) => {
              const f = work.files[p];
              return (
                <div
                  key={p}
                  className={cn(
                    'group flex cursor-pointer items-center gap-1.5 py-1 pr-1 max-sm:py-2',
                    dir ? 'pl-6' : 'pl-2',
                    p === active ? 'bg-accent-soft text-fg' : 'hover:bg-subtle',
                  )}
                  onClick={() => onOpen(p)}
                >
                  {iconFor(p)}
                  <span className="min-w-0 flex-1 truncate">{p.slice(dir ? dir.length + 1 : 0)}</span>
                  {p === doc.mainFile && (
                    <Tip content="Main file (compiled)">
                      <Star className="size-3 shrink-0 fill-accent text-accent" />
                    </Tip>
                  )}
                  {f.kind === 'binary' && <span className="text-[10px] text-muted">{formatBytes(f.size)}</span>}
                  {!readOnly && (
                    <Menu>
                      <MenuTrigger asChild>
                        <button
                          className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-line data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100 max-sm:p-1.5"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Actions for ${p}`}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem onSelect={() => setPrompt({ mode: 'rename', path: p, value: p })}>Rename / move…</MenuItem>
                        {p.endsWith('.tex') && p !== doc.mainFile && (
                          <MenuItem onSelect={() => repo.updateDoc(doc.id, { mainFile: p })}>Set as main file</MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem
                          danger
                          disabled={p === doc.mainFile}
                          onSelect={async () => {
                            await repo.deleteWorkFile(doc.id, p);
                            if (active === p) onOpen(doc.mainFile);
                          }}
                        >
                          Delete
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <Dialog
        open={!!prompt}
        onOpenChange={(o) => !o && setPrompt(null)}
        title={prompt?.mode === 'new' ? 'New file' : 'Rename file'}
        description="Use a path like sections/experience.tex to put it in a folder."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPrompt(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitPrompt}>
              {prompt?.mode === 'new' ? 'Create' : 'Rename'}
            </Button>
          </>
        }
      >
        <Input
          autoFocus
          value={prompt?.value ?? ''}
          onChange={(e) => prompt && setPrompt({ ...prompt, value: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && submitPrompt()}
        />
      </Dialog>
    </div>
  );
}
