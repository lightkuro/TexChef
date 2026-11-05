import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, GitPullRequestArrow, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { repo, useDoc } from '@/app/repo';
import type { FileMap } from '@/core/repo';
import { fileText } from '@/core/repo';
import type { Recipe } from '@/core/model';
import { applyPull, newParentBlocks, planPull, type NewBlockInfo, type PullPlan } from '@/variants/ops';
import { defaultSelected } from '@/blocks/filter';
import { findConflicts, resolveConflict, resolveAll, type ConflictChoice } from '@/core/merge';
import { DiffView, type DiffViewHandle } from '@/features/compare/DiffView';
import { Badge, Button, Checkbox, EmptyState, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Pull parent changes into a variant: choose new blocks, review the 3-way merge, resolve conflicts. */
export function PullPage() {
  const { id } = useParams();
  const doc = useDoc(id);
  const parent = useDoc(doc?.parent?.docId);
  const navigate = useNavigate();
  const [newBlocks, setNewBlocks] = useState<NewBlockInfo[]>();
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [plan, setPlan] = useState<PullPlan>();
  const [current, setCurrent] = useState<FileMap>();
  const [path, setPath] = useState<string>();
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const diff = useRef<DiffViewHandle>(null);

  useEffect(() => {
    if (!doc) return;
    void newParentBlocks(repo, doc).then((nb) => {
      setNewBlocks(nb);
      const recipe = doc.recipe;
      setChoices(Object.fromEntries(nb.map(({ block }) => [block.id, recipe ? defaultSelected(block, recipe) : true])));
    });
    void repo.getWork(doc.id).then((w) => setCurrent(w.files));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.parent?.baseCommitId]);

  const recipe: Recipe | undefined = useMemo(() => {
    if (!doc?.recipe) return undefined;
    const r = doc.recipe;
    const include = new Set(r.include);
    const exclude = new Set(r.exclude);
    for (const { block } of newBlocks ?? []) {
      const want = choices[block.id];
      include.delete(block.id);
      exclude.delete(block.id);
      if (want !== defaultSelected(block, r)) (want ? include : exclude).add(block.id);
    }
    return { ...r, include: [...include], exclude: [...exclude] };
  }, [doc?.recipe, newBlocks, choices]);

  useEffect(() => {
    if (!doc?.parent || newBlocks === undefined) return;
    let cancelled = false;
    void planPull(repo, doc.id, recipe).then((p) => {
      if (cancelled) return;
      setPlan(p);
      setEdited({});
      setPath((cur) => cur ?? p.conflictFiles[0]?.path ?? p.changedPaths.find((x) => x.endsWith('.tex')) ?? doc.mainFile);
    });
    return () => {
      cancelled = true;
    };
  }, [doc?.id, doc?.parent, doc?.mainFile, recipe, newBlocks]);

  const merged = useMemo(() => {
    if (!plan) return undefined;
    const files = { ...plan.files };
    for (const [p, t] of Object.entries(edited)) files[p] = { kind: 'text', text: t };
    return files;
  }, [plan, edited]);

  if (doc === null) return <EmptyState title="Document not found" />;
  if (doc && !doc.parent) return <EmptyState title="This document has no parent to pull from" />;
  if (!doc || !parent || !plan || !merged || !current || !path) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted">
        <Spinner /> Preparing merge…
      </div>
    );
  }

  const mergedText = fileText(merged, path) ?? '';
  const currentText = fileText(current, path) ?? '';
  const conflicts = findConflicts(mergedText);
  const totalConflicts = Object.keys(merged).reduce((n, p) => n + (merged[p].kind === 'text' ? findConflicts(fileText(merged, p)!).length : 0), 0);
  const textPaths = plan.changedPaths.filter((p) => merged[p]?.kind === 'text' || current[p]?.kind === 'text');

  const choose = (index: number, c: ConflictChoice) => setEdited({ ...edited, [path]: resolveConflict(mergedText, index, c) });

  const finish = async () => {
    setBusy(true);
    try {
      await applyPull(repo, doc.id, merged, plan.parentHead, recipe);
      toast.success(`Pulled changes from “${parent.name}”`);
      navigate(`/doc/${doc.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col" data-testid="pull-page">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/doc/${doc.id}`)} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <GitPullRequestArrow className="size-4 text-accent" />
        <span className="text-sm">
          Pull <b>{parent.name}</b> → <b>{doc.name}</b>
        </span>
        {totalConflicts > 0 ? (
          <Badge tone="danger">
            <AlertTriangle className="size-3" /> {totalConflicts} conflict{totalConflicts === 1 ? '' : 's'} to resolve
          </Badge>
        ) : (
          <Badge tone="ok">
            <CheckCircle2 className="size-3" /> Merges cleanly
          </Badge>
        )}
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => navigate(`/doc/${doc.id}`)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={finish} disabled={busy || totalConflicts > 0} data-testid="finish-pull">
          {busy ? <Spinner /> : <CheckCircle2 className="size-4" />} Finish pull
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-auto border-r border-line bg-panel p-3 text-sm">
          {newBlocks && newBlocks.length > 0 && (
            <section className="mb-4">
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">New in {parent.name}</h3>
              <p className="mt-0.5 mb-2 text-xs text-muted">Choose which new blocks to bring into this variant.</p>
              {newBlocks.map(({ block }) => (
                <label key={block.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-subtle" style={{ paddingLeft: 4 + block.depth * 12 }}>
                  <Checkbox checked={!!choices[block.id]} onCheckedChange={(c) => setChoices({ ...choices, [block.id]: c })} aria-label={`Include ${block.label}`} />
                  <span className="min-w-0 flex-1 truncate text-xs">{block.label}</span>
                  {block.tags.map((t) => (
                    <Badge key={t} tone="accent" className="px-1.5 py-0 text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </label>
              ))}
            </section>
          )}
          <section className="mb-4">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Changed files</h3>
            {textPaths.length === 0 && <p className="mt-1 text-xs text-muted">Nothing to change. This variant already has everything it needs.</p>}
            {textPaths.map((p) => {
              const n = merged[p]?.kind === 'text' ? findConflicts(fileText(merged, p)!).length : 0;
              return (
                <button key={p} onClick={() => setPath(p)} className={cn('mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-xs', p === path ? 'bg-accent-soft' : 'hover:bg-subtle')}>
                  <span className="flex-1 truncate">{p}</span>
                  {n > 0 ? <Badge tone="danger">{n}</Badge> : <Badge tone="ok">ok</Badge>}
                </button>
              );
            })}
          </section>
          {conflicts.length > 0 && (
            <section className="mb-4">
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Conflicts in {path}</h3>
              <p className="mt-0.5 mb-2 text-xs text-muted">Both documents changed the same lines. Pick a side, or edit the right-hand text directly.</p>
              {conflicts.map((c) => (
                <div key={c.index} className="mb-2 rounded-lg border border-line p-2">
                  <button className="mb-1 text-xs font-medium hover:underline" onClick={() => diff.current?.gotoB(c.start + 1)}>
                    Conflict {c.index + 1} · line {c.start + 1}
                  </button>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => choose(c.index, 'ours')}>
                      Keep mine
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => choose(c.index, 'theirs')}>
                      Use parent
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => choose(c.index, 'both')}>
                      Both
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEdited({ ...edited, [path]: resolveAll(mergedText, 'ours') })}>
                  Keep mine for all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEdited({ ...edited, [path]: resolveAll(mergedText, 'theirs') })}>
                  Use parent for all
                </Button>
              </div>
            </section>
          )}
          {plan.notes.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Notes</h3>
              {plan.notes.map((n) => (
                <p key={n} className="mt-1 text-xs text-muted">
                  {n}
                </p>
              ))}
            </section>
          )}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="grid h-8 shrink-0 grid-cols-2 border-b border-line bg-panel text-xs font-medium">
            <div className="flex items-center px-3 text-muted">Now: {doc.name}</div>
            <div className="flex items-center border-l border-line px-3">After pull (editable)</div>
          </div>
          <div className="min-h-0 flex-1">
            <DiffView
              ref={diff}
              resetKey={path}
              a={currentText}
              b={mergedText}
              bEditable
              collapseUnchanged
              onChangeB={(t) => setEdited((e) => ({ ...e, [path]: t }))}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
