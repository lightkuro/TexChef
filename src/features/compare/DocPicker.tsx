import { useMemo, useState } from 'react';
import { Check, ChevronDown, FileText, Files, Folder, FolderSearch, GitBranch, Search } from 'lucide-react';
import type { DocMeta } from '@/core/model';
import { useDocCommits, usePreviews } from '@/app/repo';
import { Button, Dialog, Input, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui';
import { buildFolderTree, flattenTree, folderName, inFolder } from '@/features/folders/folderTree';
import { cn, docColor, timeAgo } from '@/lib/utils';

export interface SideRef {
  docId: string;
  commitId?: string;
}

const SUGGESTIONS = 6;
const byRecent = (a: DocMeta, b: DocMeta) => b.updatedAt - a.updatedAt;

/**
 * Documents to offer first: the original and variants of the document on either side, then the
 * rest of the same folder, most recently changed first.
 */
export function suggestDocs(docs: DocMeta[], anchor: DocMeta | undefined, other: DocMeta | undefined): { folder?: string; related: DocMeta[]; sameFolder: DocMeta[]; more: number } {
  const live = docs.filter((d) => !d.deleted && !d.archived);
  const relatedIds = new Set<string>();
  for (const a of [anchor, other]) {
    if (!a) continue;
    if (a.parent) relatedIds.add(a.parent.docId);
    for (const d of live) if (d.parent?.docId === a.id) relatedIds.add(d.id);
  }
  const related = live.filter((d) => relatedIds.has(d.id) && d.folder !== (anchor ?? other)?.folder).sort(byRecent).slice(0, 4);
  const folder = (anchor ?? other)?.folder;
  const inSame = live.filter((d) => d.folder === folder);
  // Related ones and the current choice first, then recent ones.
  const rank = (d: DocMeta) => (d.id === anchor?.id ? 0 : relatedIds.has(d.id) ? 1 : 2);
  const sorted = inSame.sort((a, b) => rank(a) - rank(b) || byRecent(a, b));
  return { folder, related, sameFolder: sorted.slice(0, SUGGESTIONS), more: Math.max(0, sorted.length - SUGGESTIONS) };
}

/** Choose a document for one side of Compare: a few nearby ones in a menu, the rest in a picker. */
export function DocPicker({
  docs,
  value,
  other,
  onChange,
  label,
  className,
}: {
  docs: DocMeta[];
  value?: SideRef;
  /** The document on the other side (for suggestions). */
  other?: SideRef;
  onChange: (s: SideRef) => void;
  label: string;
  /** Extra classes for the button (e.g. to fill a column). */
  className?: string;
}) {
  const [browsing, setBrowsing] = useState(false);
  const current = docs.find((d) => d.id === value?.docId);
  const otherDoc = docs.find((d) => d.id === other?.docId);
  const s = useMemo(() => suggestDocs(docs, current, otherDoc), [docs, current, otherDoc]);
  const item = (d: DocMeta, icon?: React.ReactNode) => (
    <MenuItem key={d.id} onSelect={() => onChange({ docId: d.id })}>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {d.id === current?.id ? <Check className="size-4 text-accent" /> : (icon ?? <span className="size-2.5 rounded-full" style={{ background: docColor(d.id, d.color) }} />)}
      </span>
      <span className="min-w-0 flex-1 truncate">{d.name}</span>
      {d.id === otherDoc?.id && <span className="text-[11px] text-muted">other side</span>}
    </MenuItem>
  );
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button
            className={cn('flex h-8 max-w-56 min-w-0 items-center gap-1.5 rounded-md border border-line bg-panel px-2 text-xs hover:bg-subtle', className)}
            aria-label={`${label} document`}
            data-testid={`${label.toLowerCase()}-doc-picker`}
          >
            {current ? <span className="size-2.5 shrink-0 rounded-full" style={{ background: docColor(current.id, current.color) }} /> : <FileText className="size-3.5 text-muted" />}
            <span className="min-w-0 flex-1 truncate text-left">{current?.name ?? 'Choose document…'}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="w-72">
          <MenuLabel>{s.folder ? `In “${folderName(s.folder)}”` : 'Not in a folder'}</MenuLabel>
          {s.sameFolder.map((d) => item(d))}
          {s.sameFolder.length === 0 && <div className="px-2 py-1.5 text-xs text-muted">No documents here</div>}
          {s.more > 0 && (
            <MenuItem onSelect={() => setBrowsing(true)}>
              <span className="size-4" />
              <span className="text-xs text-muted">
                {s.more} more in this folder…
              </span>
            </MenuItem>
          )}
          {s.related.length > 0 && (
            <>
              <MenuSeparator />
              <MenuLabel>Originals and variants elsewhere</MenuLabel>
              {s.related.map((d) => item(d, <GitBranch className="size-3.5 text-muted" />))}
            </>
          )}
          <MenuSeparator />
          <MenuItem onSelect={() => setBrowsing(true)}>
            <FolderSearch className="size-4" /> Other files…
          </MenuItem>
        </MenuContent>
      </Menu>
      {browsing && (
        <DocPickerDialog
          docs={docs}
          title={`${label} side`}
          initial={value ?? (otherDoc ? { docId: otherDoc.id } : undefined)}
          otherId={otherDoc?.id}
          onClose={() => setBrowsing(false)}
          onPick={(r) => {
            onChange(r);
            setBrowsing(false);
          }}
        />
      )}
    </>
  );
}

/** Browse every document: folders, search, page previews, and pick a saved version too. */
function DocPickerDialog({
  docs,
  title,
  initial,
  otherId,
  onClose,
  onPick,
}: {
  docs: DocMeta[];
  title: string;
  initial?: SideRef;
  otherId?: string;
  onClose: () => void;
  onPick: (s: SideRef) => void;
}) {
  const live = useMemo(() => docs.filter((d) => !d.deleted), [docs]);
  const previews = usePreviews();
  const start = live.find((d) => d.id === initial?.docId);
  const [folder, setFolder] = useState<string | null>(start?.folder ?? null);
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [picked, setPicked] = useState<string | undefined>(initial?.docId);
  const [version, setVersion] = useState<string | undefined>(initial?.commitId);
  const commits = useDocCommits(picked);
  const tree = useMemo(() => flattenTree(buildFolderTree(live.filter((d) => archived || !d.archived).map((d) => d.folder))), [live, archived]);
  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      live
        .filter((d) => archived || !d.archived || d.id === picked)
        .filter((d) => (q ? d.name.toLowerCase().includes(q) || d.folder?.toLowerCase().includes(q) || d.tags.some((t) => t.includes(q)) : folder === null || inFolder(d.folder, folder)))
        .sort(byRecent),
    [live, archived, picked, q, folder],
  );
  const pickedDoc = live.find((d) => d.id === picked);
  const choose = (docId = picked, commitId = version) => docId && onPick({ docId, commitId });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Choose a document: ${title}`}
      className="max-w-5xl"
      footer={
        <>
          <label className="mr-auto flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived
          </label>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!picked} onClick={() => choose()} data-testid="doc-picker-ok">
            {version ? 'Use this version' : 'Use this document'}
          </Button>
        </>
      }
    >
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted" />
        <Input autoFocus className="pl-8" placeholder="Search every document by name, folder or tag" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="doc-picker-search" />
      </div>
      <div className="grid h-[52vh] min-h-72 grid-cols-1 gap-3 sm:grid-cols-[180px_1fr] lg:grid-cols-[180px_1fr_220px]">
        <nav className={cn('hidden min-h-0 space-y-0.5 overflow-auto rounded-lg border border-line p-1 sm:block', q && 'opacity-50')} aria-label="Folders">
          {[{ path: null as string | null, name: 'All documents', depth: 0 }, ...tree].map((f) => (
            <button
              key={f.path ?? '*'}
              onClick={() => {
                setFolder(f.path);
                setQuery('');
              }}
              className={cn('flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs', !q && folder === f.path ? 'bg-accent-soft font-medium' : 'text-muted hover:bg-subtle hover:text-fg')}
              style={{ paddingLeft: 6 + f.depth * 12 }}
              data-testid={`picker-folder-${f.path ?? 'all'}`}
            >
              {f.path ? <Folder className="size-3.5 shrink-0" /> : <Files className="size-3.5 shrink-0" />}
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </nav>
        <div className="min-h-0 overflow-auto rounded-lg border border-line" role="listbox" aria-label="Documents">
          {list.length === 0 && <p className="p-4 text-center text-sm text-muted">{q ? 'Nothing matches.' : 'No documents in this folder.'}</p>}
          {list.map((d) => {
            const p = previews?.get(d.id);
            return (
              <button
                key={d.id}
                role="option"
                aria-selected={picked === d.id}
                onClick={() => {
                  setPicked(d.id);
                  setVersion(undefined);
                }}
                onDoubleClick={() => choose(d.id, undefined)}
                className={cn('flex w-full items-center gap-3 border-b border-line px-2 py-1.5 text-left last:border-b-0', picked === d.id ? 'bg-accent-soft' : 'hover:bg-subtle')}
                data-testid={`picker-doc-${d.name}`}
              >
                <span className="flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-white" style={{ borderLeft: `3px solid ${docColor(d.id, d.color)}` }}>
                  {p?.thumbnail ? <img src={p.thumbnail} alt="" className="h-full w-full object-cover object-top" /> : <FileText className="size-4 text-neutral-400" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {d.name}
                    {d.archived && <span className="ml-1.5 text-[11px] font-normal text-muted">archived</span>}
                  </span>
                  <span className="flex items-center gap-1 truncate text-[11px] text-muted">
                    {d.folder && (folder === null || q || d.folder !== folder) && (
                      <>
                        <Folder className="size-3 shrink-0" /> {d.folder} ·
                      </>
                    )}
                    {d.parent ? `variant of ${live.find((x) => x.id === d.parent!.docId)?.name ?? 'a deleted document'}` : 'original'} · {timeAgo(d.updatedAt)}
                  </span>
                </span>
                {d.id === otherId && <span className="shrink-0 text-[11px] text-muted">other side</span>}
              </button>
            );
          })}
        </div>
        <div className="hidden min-h-0 flex-col overflow-hidden rounded-lg border border-line lg:flex" aria-label="Versions">
          <div className="border-b border-line px-2 py-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">Version</div>
          {!pickedDoc ? (
            <p className="p-3 text-xs text-muted">Pick a document to see its saved versions.</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto p-1">
              {[{ id: undefined as string | undefined, message: 'Current (editable)', createdAt: pickedDoc.updatedAt, kind: 'work' }, ...(commits ?? [])].map((c) => (
                <button
                  key={c.id ?? 'work'}
                  onClick={() => setVersion(c.id)}
                  onDoubleClick={() => choose(pickedDoc.id, c.id)}
                  className={cn('flex w-full flex-col rounded-md px-2 py-1 text-left', version === c.id ? 'bg-accent-soft' : 'hover:bg-subtle')}
                  data-testid={`picker-version-${c.id ?? 'current'}`}
                >
                  <span className={cn('truncate text-xs', c.kind === 'auto' ? 'text-muted' : 'font-medium')}>{c.kind === 'auto' ? 'Autosave' : c.message}</span>
                  <span className="text-[11px] text-muted">{c.id ? timeAgo(c.createdAt) : 'live, you can edit it'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
