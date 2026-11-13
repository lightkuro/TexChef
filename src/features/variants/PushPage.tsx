import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowUpFromLine, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { repo, useDoc } from '@/app/repo';
import type { FileMap } from '@/core/repo';
import { fileText } from '@/core/repo';
import { applyPush, planPush, pushBlockedReason, type PushPlan } from '@/variants/ops';
import { findConflicts, resolveConflict, resolveAll, type ConflictChoice } from '@/core/merge';
import { DiffView, type DiffViewHandle } from '@/features/compare/DiffView';
import { Badge, Button, EmptyState, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { usePhone } from '@/lib/useMediaQuery';
import { setUnsaved, useUnsavedReason } from '@/app/unsaved';

/**
 * Send a variant's changes to its original: "Get updates" the other way round. Shows the original as
 * it is and as it would become; where both changed the same lines, you choose before anything is sent.
 */
export function PushPage() {
  const { id } = useParams();
  const doc = useDoc(id);
  const original = useDoc(doc?.parent?.docId);
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PushPlan>();
  const [current, setCurrent] = useState<FileMap>();
  const [path, setPath] = useState<string>();
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useUnsavedReason('push-page', Object.keys(edited).length > 0 && !busy, 'The changes you chose on this page are not sent yet.');
  const diff = useRef<DiffViewHandle>(null);
  const phone = usePhone();
  const blocked = doc ? pushBlockedReason(doc) : undefined;

  useEffect(() => {
    if (!doc?.parent || blocked) return;
    let cancelled = false;
    void Promise.all([planPush(repo, doc.id), repo.getWork(doc.parent.docId)])
      .then(([p, w]) => {
        if (cancelled) return;
        setPlan(p);
        setCurrent(w.files);
        setEdited({});
        setPath((cur) => cur ?? p.conflictFiles[0]?.path ?? p.changedPaths.find((x) => x.endsWith('.tex')) ?? p.changedPaths[0] ?? doc.mainFile);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
    // The plan is made once per visit: it is checked again against the original when it is applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.parent?.docId, blocked]);

  const merged = useMemo(() => {
    if (!plan) return undefined;
    const files = { ...plan.files };
    for (const [p, t] of Object.entries(edited)) files[p] = { kind: 'text', text: t };
    return files;
  }, [plan, edited]);

  if (doc === null) return <EmptyState title="Document not found" />;
  if (doc && (blocked || error)) {
    return (
      <EmptyState title="These changes can’t be sent as they are">
        <p>{blocked ?? error}</p>
        <Button className="mt-3" variant="outline" onClick={() => navigate(`/doc/${doc.id}`)}>
          <ArrowLeft className="size-4" /> Back to “{doc.name}”
        </Button>
      </EmptyState>
    );
  }
  if (!doc || !original || !plan || !merged || !current || !path) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted">
        <Spinner /> Working out what would change…
      </div>
    );
  }

  const mergedText = fileText(merged, path) ?? '';
  const currentText = fileText(current, path) ?? '';
  const conflicts = findConflicts(mergedText);
  const totalConflicts = Object.keys(merged).reduce((n, p) => n + (merged[p].kind === 'text' ? findConflicts(fileText(merged, p)!).length : 0), 0);
  const textPaths = plan.changedPaths.filter((p) => merged[p]?.kind === 'text' || current[p]?.kind === 'text');
  const otherPaths = plan.changedPaths.filter((p) => !textPaths.includes(p));
  const nothing = plan.changedPaths.length === 0;
  // In the conflict markers the original's lines come first ("ours"), this document's second ("theirs").
  const choose = (index: number, c: ConflictChoice) => setEdited({ ...edited, [path]: resolveConflict(mergedText, index, c) });

  const finish = async () => {
    setBusy(true);
    try {
      await applyPush(repo, doc.id, merged, plan);
      toast.success(`Sent to “${original.name}”`, {
        description: plan.originalAhead
          ? `“${original.name}” also has changes this document hasn’t taken yet: Get updates brings them in.`
          : `Saved there as a new version. To take it back, restore the version before it in “${original.name}”.`,
      });
      setUnsaved('push-page', null);
      navigate(`/doc/${doc.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col" data-testid="push-page">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/doc/${doc.id}`)} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <ArrowUpFromLine className="size-4 shrink-0 text-accent" />
        {phone ? (
          <span className="min-w-0 truncate text-sm">
            Send to <b>{original.name}</b>
          </span>
        ) : (
          <span className="text-sm max-xl:min-w-0 max-xl:truncate">
            Send changes from <b>{doc.name}</b> to <b>{original.name}</b>
          </span>
        )}
        {totalConflicts > 0 ? (
          <Badge tone="danger" className="shrink-0">
            <AlertTriangle className="size-3" /> {totalConflicts}
            {phone ? null : ` conflict${totalConflicts === 1 ? '' : 's'} to resolve`}
          </Badge>
        ) : (
          <Badge tone="ok" className="max-sm:hidden">
            <CheckCircle2 className="size-3" /> No conflicts
          </Badge>
        )}
        <div className="flex-1" />
        <Link to="/help/updates" className="shrink-0 text-xs text-muted underline hover:text-fg max-md:hidden" target="_blank">
          How this works
        </Link>
        <Button variant="ghost" className="max-sm:hidden" onClick={() => navigate(`/doc/${doc.id}`)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={finish} disabled={busy || totalConflicts > 0 || nothing} data-testid="finish-push">
          {busy ? <Spinner /> : <CheckCircle2 className="size-4" />}
          {phone ? ' Send' : ' Send changes'}
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 max-sm:flex-col">
        <aside className="w-80 shrink-0 overflow-auto border-r border-line bg-panel p-3 text-sm max-lg:w-64 max-sm:max-h-[42%] max-sm:w-full max-sm:border-r-0 max-sm:border-b">
          <p className="mb-3 flex gap-2 rounded-lg border border-line bg-subtle px-2.5 py-2 text-xs text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Nothing changes in <b>{original.name}</b> until you press Send. It is then saved there as a new version, so you can restore the one before it.
              {plan.originalAhead && (
                <>
                  {' '}
                  <b>{original.name}</b> has changes of its own that this document hasn’t taken: they are kept.
                </>
              )}
            </span>
          </p>
          <section className="mb-4">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Files that would change</h3>
            {nothing && <p className="mt-1 text-xs text-muted">Nothing to send: “{original.name}” already has everything from this document.</p>}
            {textPaths.map((p) => {
              const n = merged[p]?.kind === 'text' ? findConflicts(fileText(merged, p)!).length : 0;
              return (
                <button key={p} onClick={() => setPath(p)} className={cn('mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-xs', p === path ? 'bg-accent-soft' : 'hover:bg-subtle')}>
                  <span className="flex-1 truncate">{p}</span>
                  {n > 0 ? <Badge tone="danger">{n}</Badge> : <Badge tone="ok">ok</Badge>}
                </button>
              );
            })}
            {otherPaths.map((p) => (
              <p key={p} className="mt-1 flex items-center gap-2 px-2 py-1 font-mono text-xs text-muted">
                <span className="flex-1 truncate">{p}</span>
                <Badge>{merged[p] ? (current[p] ? 'replaced' : 'added') : 'removed'}</Badge>
              </p>
            ))}
          </section>
          {conflicts.length > 0 && (
            <section className="mb-4">
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Conflicts in {path}</h3>
              <p className="mt-0.5 mb-2 text-xs text-muted">Both documents changed the same lines in different ways. Choose which to keep in the original, or edit the text on the right.</p>
              {conflicts.map((c) => (
                <div key={c.index} className="mb-2 rounded-lg border border-line p-2">
                  <button className="mb-1 text-xs font-medium hover:underline" onClick={() => diff.current?.gotoB(c.start + 1)}>
                    Conflict {c.index + 1} · line {c.start + 1}
                  </button>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => choose(c.index, 'theirs')} data-testid={`push-use-mine-${c.index}`}>
                      Use mine
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => choose(c.index, 'ours')}>
                      Keep the original’s
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => choose(c.index, 'both')}>
                      Keep both
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEdited({ ...edited, [path]: resolveAll(mergedText, 'theirs') })}>
                  Use mine for all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEdited({ ...edited, [path]: resolveAll(mergedText, 'ours') })}>
                  Keep the original’s for all
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
          {phone ? (
            <div className="flex min-h-8 shrink-0 items-center border-b border-line bg-panel px-3 py-1 text-xs">
              <span>
                <b>{original.name} after sending</b> (you can edit this): <span className="text-danger line-through">removed</span> · <span className="text-ok">added</span>
              </span>
            </div>
          ) : (
            <div className="grid h-8 shrink-0 grid-cols-2 border-b border-line bg-panel text-xs font-medium">
              <div className="flex items-center truncate px-3 text-muted">Now: {original.name}</div>
              <div className="flex items-center truncate border-l border-line px-3">After sending: {original.name} (you can edit this)</div>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <DiffView ref={diff} resetKey={path} a={currentText} b={mergedText} bEditable collapseUnchanged unified={phone} onChangeB={(t) => setEdited((e) => ({ ...e, [path]: t }))} />
          </div>
        </section>
      </div>
    </div>
  );
}
