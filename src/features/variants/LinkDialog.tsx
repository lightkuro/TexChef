import { useMemo, useState } from 'react';
import { Link2, Search } from 'lucide-react';
import type { DocMeta } from '@/core/model';
import { useDocs } from '@/app/repo';
import { canLink } from '@/variants/ops';
import { Badge, Button, Dialog, Input } from '@/components/ui';
import { cn, docColor } from '@/lib/utils';
import { linkDocs } from './linkActions';

/**
 * "Link as variant of…": pick the document this one should take updates from. Only documents that
 * can be its original are offered (not itself, not its own variants).
 */
export function LinkDialog({ doc, open, onOpenChange }: { doc: DocMeta; open: boolean; onOpenChange: (open: boolean) => void }) {
  const docs = useDocs();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string>();
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map((docs ?? []).map((d) => [d.id, d])), [docs]);
  const choices = useMemo(() => {
    const all = docs ?? [];
    const q = query.trim().toLowerCase();
    return all
      .filter((d) => canLink(all, doc.id, d.id).ok)
      .filter((d) => !q || d.name.toLowerCase().includes(q) || (d.folder ?? '').toLowerCase().includes(q))
      .sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || b.updatedAt - a.updatedAt);
  }, [docs, doc.id, query]);
  const target = picked ? byId.get(picked) : undefined;
  const current = doc.parent ? byId.get(doc.parent.docId) : undefined;

  const link = async (to: DocMeta | undefined = target) => {
    if (!to || busy) return;
    setBusy(true);
    const ok = await linkDocs(doc, to);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Link “${doc.name}” as a variant of…`}
      description={
        current
          ? `It is a variant of “${current.name}” now. A document has one original, so the one you pick replaces it.`
          : 'Pick the document it should take updates from. Neither document’s text changes.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void link()} disabled={!target || busy} data-testid="link-confirm">
            <Link2 className="size-4" /> {target ? `Link to “${target.name}”` : 'Link'}
          </Button>
        </>
      }
    >
      <div className="space-y-3" data-testid="link-dialog">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted" />
          <Input autoFocus className="pl-8" placeholder="Search documents" aria-label="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="link-search" />
        </div>
        <div className="max-h-64 space-y-0.5 overflow-auto" role="listbox" aria-label="Documents it can be a variant of">
          {choices.map((d) => {
            const from = d.parent ? byId.get(d.parent.docId) : undefined;
            return (
              <button
                key={d.id}
                role="option"
                aria-selected={picked === d.id}
                onClick={() => setPicked(d.id)}
                onDoubleClick={() => void link(d)}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', picked === d.id ? 'bg-accent-soft' : 'hover:bg-subtle')}
                data-testid={`link-pick-${d.id}`}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: docColor(d.id, d.color) }} />
                <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                <span className="max-w-[45%] shrink-0 truncate text-xs text-muted">{[d.folder, from && `variant of “${from.name}”`].filter(Boolean).join(' · ')}</span>
                {d.archived && <Badge tone="neutral">archived</Badge>}
              </button>
            );
          })}
          {choices.length === 0 && (
            <p className="px-2 py-4 text-sm text-muted">
              {query.trim() ? 'No document matches.' : 'There is no other document it can be a variant of. (Its own variants are left out: that would go round in a circle.)'}
            </p>
          )}
        </div>
        <p className="text-xs text-muted">
          After linking, changes made to the original show up as updates here, and <b>Get updates from original</b> works them in while keeping this document’s own edits. You can undo the link, or
          unlink later.
        </p>
      </div>
    </Dialog>
  );
}
