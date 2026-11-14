import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Archive, ArrowLeft, ArrowRight, Bot, Check, FileText, FolderInput, GitBranch, GitBranchPlus, Link2, PencilLine, RotateCcw, ScrollText, Unlink, X } from 'lucide-react';
import { toast } from 'sonner';
import { repo, useDocs } from '@/app/repo';
import { usePrefs } from '@/app/prefs';
import { Badge, Button, EmptyState, Select, Spinner, Tip } from '@/components/ui';
import { DiffView, type DiffViewHandle } from '@/features/compare/DiffView';
import { PdfViewer } from '@/features/preview/PdfViewer';
import { compileFiles, useCompileStore } from '@/features/compile/useCompile';
import { versionNumbers } from '@/features/history/versionStats';
import { usePhone } from '@/lib/useMediaQuery';
import type { DocMeta } from '@/core/model';
import { driveProvider } from '@/features/sync/controller';
import { SaveAsVariantDialog } from '@/features/variants/SaveAsVariantDialog';
import { canLink, linkAsVariant, makeOriginal, saveWorkAsVariant, unlinkVariant } from '@/variants/ops';
import { cleanFolder } from '@/features/folders/folderTree';
import { fileText, type FileMap } from '@/core/repo';
import { cn, timeAgo } from '@/lib/utils';
import { dropPastedReply, markReplyHandled, pastedReply, useAgentsDialog, waitingReplies } from './agents';
import { textChanges } from './changes';
import { hasConflictMarkers, parseReply, planReply, type AgentReply, type ReplyPlan } from './reply';

/** Review a reply from an AI agent (experimental): the document beside what accepting would write. */
export function AgentReplyPage() {
  const [params] = useSearchParams();
  const fileId = params.get('file') ?? undefined;
  const pasteKey = params.get('paste') ?? undefined;
  // Each reply gets a review of its own: moving on to the next one waiting starts from scratch.
  return <AgentReplyReview key={fileId ?? pasteKey ?? ''} fileId={fileId} pasteKey={pasteKey} />;
}

function AgentReplyReview({ fileId, pasteKey }: { fileId?: string; pasteKey?: string }) {
  const enabled = usePrefs((s) => s.agentsEnabled);
  const phone = usePhone();
  const waiting = useAgentsDialog((s) => s.waiting);
  const navigate = useNavigate();
  const docs = useDocs();
  const [source, setSource] = useState<{ name: string; reply: AgentReply }>();
  const [error, setError] = useState<string>();
  const [docId, setDocId] = useState<string>();
  const [plan, setPlan] = useState<ReplyPlan>();
  /** The right side as edited here (path → text). */
  const [proposed, setProposed] = useState<Record<string, string>>({});
  const [path, setPath] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [asVariant, setAsVariant] = useState(false);
  // The actions a reply proposes besides text (rename, move, make it a variant): each can be unticked.
  const [use, setUse] = useState({ rename: true, folder: true, variant: true, archive: true, link: true, unlink: true, makeOriginal: true, merged: true, then: true });
  /** Text changes left out, per file (by their number in the list). */
  const [off, setOff] = useState<Record<string, number[]>>({});
  /** Files whose right side was edited by hand: the list no longer describes them change by change. */
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<'text' | 'pdf'>('text');
  const [showChanges, setShowChanges] = useState(true);
  const [baseInfo, setBaseInfo] = useState<{ text: string; tone: 'ok' | 'warn' }>();
  const diff = useRef<DiffViewHandle>(null);
  /** Whether the version named in `merged=` really is a later version of the document's original. */
  const [mergedOk, setMergedOk] = useState<{ ok: boolean; reason?: string }>();

  // Load the reply: from Drive, or pasted.
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    (async () => {
      if (fileId) {
        const provider = driveProvider();
        if (!provider) throw new Error('Connect Google Drive to open this reply');
        const { name, text } = await provider.readText(fileId);
        return { name, reply: parseReply(text) };
      }
      const text = pasteKey && pastedReply(pasteKey);
      if (!text) throw new Error('This pasted reply is gone (it lasts only while this tab is open). Paste it again.');
      return { name: 'Pasted reply', reply: parseReply(text) };
    })()
      .then((s) => live && setSource(s))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [enabled, fileId, pasteKey]);

  // Which document: the header's, or chosen here when the header is missing or unknown.
  const headerDoc = source?.reply.doc;
  const known = !!headerDoc && headerDoc !== 'new' && !!docs?.some((d) => d.id === headerDoc && !d.deleted);
  useEffect(() => {
    if (!source || !docs) return;
    setDocId((cur) => cur ?? (known ? headerDoc : headerDoc === 'new' ? 'new' : undefined));
  }, [source, docs, known, headerDoc]);

  useEffect(() => {
    setPlan(undefined);
    if (!source || !docId) return;
    if (docId === 'new') {
      const show = (texts: [string, string][]) => {
        const files = texts.map(([p, t]) => ({ path: p || 'main.tex', current: '', proposed: t, conflicts: 0 }));
        setPlan({ files, baseKnown: false, conflicts: 0 });
        setProposed(Object.fromEntries(files.map((f) => [f.path, f.proposed])));
      };
      const texts = Object.entries(source.reply.files);
      const from = docs?.find((d) => d.id === source.reply.variantOf && !d.deleted);
      // A new variant with no text of its own starts as a copy of the document it is a variant of.
      if (!texts.length && from?.head) {
        void repo
          .readCommitFiles(from.head)
          .then((files) => show(Object.keys(files).filter((p) => fileText(files, p) !== undefined).map((p) => [p, fileText(files, p)!])))
          .catch((e) => setError(e instanceof Error ? e.message : String(e)));
      } else show(texts);
      return;
    }
    void planReply(repo, docId, docId === headerDoc ? source.reply : { ...source.reply, base: undefined })
      .then((p) => {
        setPlan(p);
        setProposed(Object.fromEntries(p.files.map((f) => [f.path, f.proposed])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // `docs` is read for the variant's source only; a later change to the list needn't rebuild the review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, docId, headerDoc]);

  const doc = docs?.find((d) => d.id === docId);
  const reply = source?.reply;
  const variantOf = docs?.find((d) => d.id === reply?.variantOf && !d.deleted);
  const newFolder = reply?.folder !== undefined ? cleanFolder(reply.folder) : undefined;
  // Linking an existing document goes through the same checks as in the document menu (one original, no loops).
  const alreadyLinked = !!doc?.parent && doc.parent.docId === reply?.variantOf;
  const linkCheck = docId !== 'new' && doc && docs && reply?.variantOf && !alreadyLinked ? canLink(docs, doc.id, reply.variantOf) : undefined;
  const original = docs?.find((d) => d.id === doc?.parent?.docId);
  /** What the reply proposes besides text, for the document chosen. */
  const actions = {
    rename: docId !== 'new' && !!doc && !!reply?.rename && reply.rename !== doc.name,
    folder: reply?.folder !== undefined && (docId === 'new' ? !!newFolder : !!doc && newFolder !== cleanFolder(doc.folder)),
    variant: docId === 'new' && !!variantOf?.head,
    archive: docId !== 'new' && !!doc && reply?.archive !== undefined && reply.archive !== !!doc.archived,
    link: !!linkCheck?.ok,
    // "Link to X" and "unlink" in one reply: the link is the clearer wish.
    unlink: docId !== 'new' && !!doc?.parent && !!reply?.unlink && !reply.variantOf,
    makeOriginal: docId !== 'new' && !!doc?.parent && !!original && !!reply?.makeOriginal && !reply.unlink && !reply.variantOf,
    // The agent merged the original's changes into this text itself.
    merged: docId !== 'new' && !!doc?.parent && !!reply?.merged && !!mergedOk?.ok,
    // Or it asks for TexChef's own merge review once this is accepted.
    then: docId !== 'new' && !!doc?.parent && !!original && !!reply?.then && !reply.unlink,
  };
  /** Proposed, but not possible: shown so it isn't silently dropped, and never applied. */
  const refused =
    linkCheck && !linkCheck.ok
      ? `Link it as a variant of “${variantOf?.name ?? reply?.variantOf}”: ${linkCheck.reason}`
      : reply?.merged && mergedOk && !mergedOk.ok
        ? `Count the original’s changes as taken: ${mergedOk.reason}`
        : undefined;
  const anyAction =
    (actions.rename && use.rename) ||
    (actions.folder && use.folder) ||
    (actions.archive && use.archive) ||
    (actions.link && use.link) ||
    (actions.unlink && use.unlink) ||
    (actions.makeOriginal && use.makeOriginal) ||
    (actions.then && use.then);
  const active = plan?.files.find((f) => f.path === path) ?? plan?.files[0];
  // `merged=`: it must name a version of this document's original that is not older than the one last taken.
  const mergedId = reply?.merged;
  const parentId = doc?.parent?.docId;
  const parentBase = doc?.parent?.baseCommitId;
  useEffect(() => {
    setMergedOk(undefined);
    if (!mergedId || !parentId || !parentBase) return;
    let live = true;
    (async () => {
      const c = await repo.needCommit(mergedId);
      if (!c || c.docId !== parentId) return { ok: false, reason: 'that isn’t a version of its original' };
      if (!(await repo.isAncestor(parentBase, mergedId))) return { ok: false, reason: 'that version is older than the one already taken' };
      return { ok: true };
    })()
      .then((r) => live && setMergedOk(r))
      .catch(() => live && setMergedOk({ ok: false, reason: 'that version could not be found' }));
    return () => {
      live = false;
    };
  }, [mergedId, parentId, parentBase]);
  const conflicted = useMemo(() => Object.values(proposed).filter(hasConflictMarkers).length, [proposed]);
  const changed = plan?.files.filter((f) => proposed[f.path] !== f.current) ?? [];
  const note = source?.reply.note;

  /** `queue`: with more replies waiting in Drive, go on to the next one instead of `go`. */
  const finish = async (go: string, queue = true) => {
    await markReplyHandled(fileId);
    if (pasteKey) dropPastedReply(pasteKey);
    const rest = queue && fileId ? (await waitingReplies().catch(() => [])).filter((r) => r.id !== fileId) : [];
    if (rest.length) {
      toast.info(rest.length === 1 ? 'On to the last reply waiting' : `On to the next reply: ${rest.length} waiting`);
      navigate(`/agent-reply?file=${encodeURIComponent(rest[0].id)}`);
      return;
    }
    navigate(go);
  };

  // ---- the text edits, change by change ----
  const fileChanges = useMemo(() => Object.fromEntries((plan?.files ?? []).map((f) => [f.path, textChanges(f.current, f.proposed)])), [plan]);
  const activeChanges = active && docId !== 'new' ? fileChanges[active.path] : undefined;
  const activeOff = useMemo(() => new Set(active ? (off[active.path] ?? []) : []), [off, active]);
  const activeManual = !!active && !!manual[active.path];
  const activeConflict = !!active && hasConflictMarkers(proposed[active.path] ?? '');
  const setLeftOut = (path: string, next: Set<number>) => {
    setOff((o) => ({ ...o, [path]: [...next] }));
    setManual((m) => ({ ...m, [path]: false }));
    setProposed((p) => ({ ...p, [path]: fileChanges[path].apply(next).text }));
  };
  const toggleChange = (i: number) => {
    if (!active) return;
    const next = new Set(activeOff);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setLeftOut(active.path, next);
  };
  /** How many text edits Accept would save, over all files. */
  const edits = (plan?.files ?? []).reduce((n, f) => {
    if (proposed[f.path] === undefined || proposed[f.path] === f.current) return n;
    return n + (manual[f.path] ? textChanges(f.current, proposed[f.path]).changes.length : fileChanges[f.path].changes.length - (off[f.path]?.length ?? 0));
  }, 0);
  const actionNames = [
    actions.rename && use.rename && 'rename',
    actions.folder && use.folder && 'move',
    actions.archive && use.archive && (reply?.archive ? 'archive' : 'unarchive'),
    actions.link && use.link && 'link',
    actions.unlink && use.unlink && 'unlink',
    actions.makeOriginal && use.makeOriginal && 'swap',
  ].filter((x): x is string => !!x);
  const acceptParts = [edits ? `${edits} edit${edits === 1 ? '' : 's'}` : null, ...actionNames].filter(Boolean);
  const acceptLabel = docId === 'new' ? 'Create document' : acceptParts.length ? `Accept ${acceptParts.join(', ')}` : 'Accept';

  // What the agent read, and whether the document moved on since.
  const replyBase = reply?.base;
  useEffect(() => {
    setBaseInfo(undefined);
    if (!plan || !docId || docId === 'new') return;
    let live = true;
    (async (): Promise<{ text: string; tone: 'ok' | 'warn' }> => {
      const base = replyBase && docId === headerDoc ? await repo.getCommit(replyBase) : undefined;
      if (!base || base.docId !== docId) return { tone: 'warn', text: 'The agent didn’t say which version it read (or that version isn’t on this device): its text replaces the files as they are now.' };
      const commits = await repo.docCommits(docId);
      const n = versionNumbers(commits).get(base.id);
      const newer = commits.filter((c) => c.createdAt > base.createdAt && c.kind !== 'auto').length;
      const unsaved = (await repo.getWork(docId)).dirty;
      const since = [newer ? `${newer} newer version${newer === 1 ? '' : 's'}` : null, unsaved ? 'unsaved edits' : null].filter(Boolean).join(' and ');
      return {
        tone: newer >= 3 ? 'warn' : 'ok',
        text: `The agent read version ${n ?? '?'}, saved ${timeAgo(base.createdAt)}. ${since ? `You changed the document since (${since}): your later edits are kept.` : 'The document hasn’t changed since.'}`,
      };
    })()
      .then((r) => live && setBaseInfo(r))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [plan, docId, headerDoc, replyBase]);

  /** Write the reviewed text into the working copy (after keeping the current text as an autosave). */
  if (!enabled) return <Navigate to="/" replace />;

  const writeProposed = async (id: string) => {
    await repo.commitWork(id, 'Autosave before an AI agent’s edits', 'auto');
    for (const f of changed) await repo.writeWorkText(id, f.path, proposed[f.path]);
  };

  const accept = async () => {
    if (!plan || !docId) return;
    setBusy(true);
    try {
      if (docId === 'new') {
        const files = Object.fromEntries(plan.files.map((f) => [f.path, { kind: 'text' as const, text: proposed[f.path] }]));
        const main = plan.files.find((f) => f.path === 'main.tex')?.path ?? plan.files.find((f) => f.path.endsWith('.tex'))?.path;
        const linked = actions.variant && use.variant ? variantOf : undefined;
        const d = await repo.createDoc({
          name: source?.reply.name || 'From an AI agent',
          files,
          mainFile: linked && files[linked.mainFile] ? linked.mainFile : main,
          engine: linked?.engine,
          folder: actions.folder && use.folder ? newFolder : undefined,
          parent: linked ? { docId: linked.id, baseCommitId: linked.head! } : undefined,
          kind: 'agent',
          message: note ? `From an AI agent: ${note}` : 'From an AI agent',
        });
        toast.success(`Created “${d.name}”`);
        return finish(`/doc/${d.id}`);
      }
      if (changed.length) {
        await writeProposed(docId);
        const took = actions.merged && use.merged ? reply!.merged! : undefined;
        await repo.commitWork(docId, `Edits from an AI agent${note ? `: ${note}` : ''}`, 'agent', took ? [took] : []);
        // The text already carries the original's changes up to that version: they are not offered again.
        const fresh = took ? await repo.getDoc(docId) : undefined;
        if (took && fresh?.parent) await repo.updateDoc(docId, { parent: { ...fresh.parent, baseCommitId: took } });
      }
      if (actions.rename && use.rename) await repo.updateDoc(docId, { name: reply!.rename!.trim() });
      if (actions.folder && use.folder) await repo.updateDoc(docId, { folder: newFolder });
      if (actions.archive && use.archive) await repo.updateDoc(docId, { archived: reply!.archive });
      if (actions.link && use.link) await linkAsVariant(repo, docId, reply!.variantOf!);
      if (actions.unlink && use.unlink) await unlinkVariant(repo, docId);
      if (actions.makeOriginal && use.makeOriginal) await makeOriginal(repo, docId);
      toast.success(changed.length ? 'Saved as a new version' : 'Done');
      // Merging stays TexChef's own review: the reply can only ask for it to be opened.
      const next = actions.then && use.then && !(actions.makeOriginal && use.makeOriginal) ? (reply!.then === 'get-updates' ? '/pull' : '/push') : '';
      await finish(`/doc/${docId}${next}`, !next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const acceptAsVariant = async (name: string) => {
    if (!docId || docId === 'new') return;
    setBusy(true);
    try {
      await writeProposed(docId);
      const v = await saveWorkAsVariant(repo, docId, name);
      toast.success(`Saved the agent’s edits as the variant “${v.name}”`);
      await finish(`/doc/${v.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const dismiss = async () => {
    await finish(docId && docId !== 'new' ? `/doc/${docId}` : '/');
    toast.info('Reply dismissed; the document is unchanged');
  };

  return (
    <div className="flex h-full flex-col" data-testid="agent-reply-page">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <Bot className="size-4 text-muted" />
        <span className="truncate text-sm font-semibold">Reply from an AI agent</span>
        <Badge tone="warn" className="max-sm:hidden">
          Experimental
        </Badge>
        <span className="min-w-0 truncate text-xs text-muted max-md:hidden">{source?.name}</span>
        {fileId && waiting > 1 && (
          <Badge className="max-sm:hidden" data-testid="agent-reply-queue">
            {waiting - 1} more waiting
          </Badge>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => void dismiss()} disabled={busy || !source} data-testid="agent-reply-dismiss">
          <X className="size-3.5" /> Dismiss
        </Button>
        {docId && docId !== 'new' && (
          <Button variant="outline" size="sm" onClick={() => setAsVariant(true)} disabled={busy || !plan || !!conflicted || !changed.length} data-testid="agent-reply-variant">
            <GitBranchPlus className="size-3.5" /> <span className="max-sm:hidden">As a new variant</span>
          </Button>
        )}
        <Tip content={conflicted ? 'Resolve the conflicts on the right first' : docId === 'new' ? 'Create this document' : acceptParts.length ? `${acceptLabel}${edits ? ' (saved as a new version)' : ''}` : 'Nothing is ticked'}>
          <span>
            <Button variant="primary" size="sm" onClick={() => void accept()} disabled={busy || !plan || !!conflicted || (docId !== 'new' && !changed.length && !anyAction)} data-testid="agent-reply-accept">
              {busy ? <Spinner /> : <Check className="size-3.5" />}{' '}
              <span data-testid="agent-reply-accept-label">{phone && docId !== 'new' ? `Accept${acceptParts.length ? ` (${edits + actionNames.length})` : ''}` : acceptLabel}</span>
            </Button>
          </span>
        </Tip>
      </header>
      {error ? (
        <EmptyState title="Couldn’t open this reply">{error}</EmptyState>
      ) : !source || !docs ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-subtle/60 px-3 py-2 text-sm">
            {note && <span className="min-w-0 flex-1 basis-60">“{note}”</span>}
            {!known && (
              <label className="flex items-center gap-2 text-xs">
                {headerDoc && headerDoc !== 'new' ? 'The document it names isn’t here. For:' : headerDoc === 'new' ? 'A new document' : 'No TexChef header. For:'}
                {headerDoc !== 'new' && (
                  <Select value={docId ?? ''} onChange={(e) => setDocId(e.target.value || undefined)} aria-label="Document" data-testid="agent-reply-doc">
                    <option value="">Choose a document…</option>
                    <option value="new">A new document</option>
                    {docs.filter((d) => !d.deleted).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                )}
              </label>
            )}
            {plan && docId !== 'new' && baseInfo && (
              <span className={cn('basis-full text-xs', baseInfo.tone === 'warn' ? 'text-warn' : 'text-muted')} data-testid="agent-reply-base">
                {baseInfo.text}
              </span>
            )}
            {conflicted > 0 && <Badge tone="danger">{conflicted === 1 ? '1 file has conflicts' : `${conflicted} files have conflicts`}</Badge>}
            {plan && plan.files.length > 1 && (
              <Select value={active?.path} onChange={(e) => setPath(e.target.value)} aria-label="File" className="text-xs">
                {plan.files.map((f) => (
                  <option key={f.path}>{f.path}</option>
                ))}
              </Select>
            )}
          </div>
          {(actions.rename || actions.folder || actions.variant || actions.archive || actions.link || actions.unlink || actions.makeOriginal || actions.merged || refused) && (
            <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-line px-3 py-2 text-sm" data-testid="agent-reply-actions">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">Also proposed</span>
              {actions.rename && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={use.rename} onChange={(e) => setUse((u) => ({ ...u, rename: e.target.checked }))} data-testid="agent-action-rename" />
                  <PencilLine className="size-3.5 text-muted" /> Rename to “{reply!.rename}”
                </label>
              )}
              {actions.folder && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={use.folder} onChange={(e) => setUse((u) => ({ ...u, folder: e.target.checked }))} data-testid="agent-action-folder" />
                  <FolderInput className="size-3.5 text-muted" /> {docId === 'new' ? 'Put it in' : newFolder ? 'Move to' : 'Move out of its folder'}
                  {newFolder ? ` the folder “${newFolder}”` : ''}
                </label>
              )}
              {actions.archive && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={use.archive} onChange={(e) => setUse((u) => ({ ...u, archive: e.target.checked }))} data-testid="agent-action-archive" />
                  <Archive className="size-3.5 text-muted" /> {reply!.archive ? 'Move it to the archive (it stays, hidden until you show archived documents)' : 'Bring it back from the archive'}
                </label>
              )}
              {actions.variant && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={use.variant} onChange={(e) => setUse((u) => ({ ...u, variant: e.target.checked }))} data-testid="agent-action-variant" />
                  <GitBranch className="size-3.5 text-muted" /> Link it as a variant of “{variantOf!.name}”
                </label>
              )}
              {actions.link && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={use.link} onChange={(e) => setUse((u) => ({ ...u, link: e.target.checked }))} data-testid="agent-action-link" />
                  <Link2 className="size-3.5 text-muted" /> Link it as a variant of “{variantOf!.name}”
                  {original ? ` (instead of “${original.name}”)` : ''}: no text changes
                </label>
              )}
              {actions.unlink && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={use.unlink} onChange={(e) => setUse((u) => ({ ...u, unlink: e.target.checked }))} data-testid="agent-action-unlink" />
                  <Unlink className="size-3.5 text-muted" /> Unlink it from “{original?.name ?? 'its original'}”: it keeps its text and versions
                </label>
              )}
              {actions.makeOriginal && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={use.makeOriginal} onChange={(e) => setUse((u) => ({ ...u, makeOriginal: e.target.checked }))} data-testid="agent-action-make-original" />
                  <Link2 className="size-3.5 text-muted" /> Make it the original, and “{original!.name}” its variant: no text changes
                </label>
              )}
              {actions.merged && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={use.merged} onChange={(e) => setUse((u) => ({ ...u, merged: e.target.checked }))} data-testid="agent-action-merged" />
                  <Link2 className="size-3.5 text-muted" /> This text already includes the latest changes from “{original?.name ?? 'its original'}”: don’t offer them again
                </label>
              )}
              {refused && (
                <span className="flex items-center gap-1.5 text-xs text-muted" data-testid="agent-action-refused">
                  <X className="size-3.5" /> Can’t be done: {refused}
                </span>
              )}
            </div>
          )}
          {actions.then && (
            <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-line px-3 py-2 text-sm" data-testid="agent-reply-next">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">Afterwards</span>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={use.then} onChange={(e) => setUse((u) => ({ ...u, then: e.target.checked }))} data-testid="agent-action-then" />
                <ArrowRight className="size-3.5 text-muted" />{' '}
                {reply!.then === 'get-updates' ? `Open the review of updates from “${original!.name}”` : `Open the review for sending this document’s changes to “${original!.name}”`}
              </label>
            </div>
          )}
          {conflicted > 0 && (
            <p className="shrink-0 border-b border-line bg-danger-soft px-3 py-1.5 text-xs text-danger">
              Some lines were changed both by you and by the agent. On the right, keep the lines you want and delete the {'<<<<<<<'}, {'======='} and{' '}
              {'>>>>>>>'} lines.
            </p>
          )}
          <div className="flex min-h-0 flex-1 max-lg:flex-col">
            {/* The text edits, one by one: untick one to leave it out. */}
            {activeChanges && active && (activeChanges.changes.length > 0 || activeManual) && (
              <aside className="flex shrink-0 flex-col border-line bg-panel max-lg:max-h-[38%] max-lg:border-b lg:w-72 lg:border-r" data-testid="agent-changes">
                <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-xs">
                  <label className="flex min-w-0 flex-1 items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      disabled={activeManual || activeConflict}
                      checked={!activeManual && activeOff.size < activeChanges.changes.length}
                      ref={(el) => {
                        if (el) el.indeterminate = !activeManual && activeOff.size > 0 && activeOff.size < activeChanges.changes.length;
                      }}
                      onChange={(e) => setLeftOut(active.path, e.target.checked ? new Set() : new Set(activeChanges.changes.map((c) => c.index)))}
                      data-testid="agent-changes-all"
                    />
                    <span className="truncate tracking-wide text-muted uppercase">
                      Text edits · {activeManual ? 'edited by hand' : `${activeChanges.changes.length - activeOff.size} of ${activeChanges.changes.length}`}
                    </span>
                  </label>
                  <button className="rounded p-1 text-muted hover:bg-subtle hover:text-fg lg:hidden" onClick={() => setShowChanges((v) => !v)} aria-expanded={showChanges} data-testid="agent-changes-toggle">
                    {showChanges ? 'Hide' : 'Show'}
                  </button>
                </div>
                {(showChanges || !phone) && (
                  <ul className={cn('min-h-0 flex-1 overflow-auto p-1.5', !showChanges && 'max-lg:hidden')}>
                    {activeManual || activeConflict ? (
                      <li className="space-y-2 px-1.5 py-1 text-xs text-muted">
                        <p>{activeConflict ? 'Settle the conflicts on the right first; then each edit can be ticked here.' : 'You edited the right side by hand, so it is taken as it stands.'}</p>
                        {activeManual && (
                          <Button size="sm" variant="outline" onClick={() => setLeftOut(active.path, new Set())} data-testid="agent-changes-reset">
                            <RotateCcw className="size-3.5" /> Back to the agent’s version
                          </Button>
                        )}
                      </li>
                    ) : (
                      activeChanges.changes.map((c) => {
                        const on = !activeOff.has(c.index);
                        return (
                          <li key={c.index} className={cn('flex items-start gap-2 rounded-md px-1.5 py-1.5 text-xs hover:bg-subtle', !on && 'opacity-60')}>
                            <input type="checkbox" className="mt-0.5" checked={on} onChange={() => toggleChange(c.index)} aria-label={`Keep edit ${c.index + 1}`} data-testid={`agent-change-${c.index}`} />
                            <button
                              className="min-w-0 flex-1 text-left"
                              onClick={() => {
                                setView('text');
                                diff.current?.gotoB(activeChanges.apply(activeOff).lines[c.index]);
                              }}
                              title="Show it in the text"
                            >
                              <span className={cn('font-medium', c.kind === 'added' ? 'text-ok' : c.kind === 'removed' ? 'text-danger' : 'text-fg')}>
                                {c.kind === 'added' ? 'Added' : c.kind === 'removed' ? 'Removed' : 'Changed'}
                                {Math.max(c.added.length, c.removed.length) > 1 ? ` · ${Math.max(c.added.length, c.removed.length)} lines` : ''}
                              </span>
                              <span className={cn('block truncate font-mono text-[11px] text-muted', !on && 'line-through')}>{c.preview || '(blank line)'}</span>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}
              </aside>
            )}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2 text-xs text-muted">
                {view === 'pdf' ? (
                  <span className="min-w-0 flex-1 truncate">How it prints: {docId === 'new' ? 'the new document' : 'now, and with what is ticked'}</span>
                ) : phone ? (
                  <span className="min-w-0 flex-1 truncate">{docId === 'new' ? `New document: “${reply?.name || 'From an AI agent'}”` : `${doc?.name ?? 'Choose a document'} with the edits (removed text is struck through)`}</span>
                ) : (
                  <span className="grid min-w-0 flex-1 grid-cols-2">
                    <span className="truncate">{docId === 'new' ? `New document: “${reply?.name || 'From an AI agent'}”` : `${doc?.name ?? 'Choose a document'} now`}</span>
                    <span className="truncate pl-3">With the agent’s edits (you can edit this side)</span>
                  </span>
                )}
                {plan && active && (
                  <span className="inline-flex shrink-0 rounded-lg bg-subtle p-0.5 font-medium">
                    <button onClick={() => setView('text')} className={cn('flex h-6 items-center gap-1.5 rounded-md px-2', view === 'text' ? 'bg-panel text-fg shadow-sm' : 'text-muted')} aria-pressed={view === 'text'} data-testid="agent-view-text">
                      <ScrollText className="size-3.5" /> Text
                    </button>
                    <button onClick={() => setView('pdf')} className={cn('flex h-6 items-center gap-1.5 rounded-md px-2', view === 'pdf' ? 'bg-panel text-fg shadow-sm' : 'text-muted')} aria-pressed={view === 'pdf'} data-testid="agent-view-pdf">
                      <FileText className="size-3.5" /> PDF
                    </button>
                  </span>
                )}
              </div>
              <div className="min-h-0 flex-1">
                {plan && active && view === 'pdf' ? (
                  <PdfCompare doc={docId === 'new' ? undefined : doc} plan={plan} proposed={proposed} stacked={phone} />
                ) : plan && active ? (
                  <DiffView
                    ref={diff}
                    resetKey={`${docId}|${active.path}|${phone}`}
                    a={active.current}
                    b={proposed[active.path] ?? ''}
                    aEditable={false}
                    bEditable
                    onChangeB={(t) => {
                      setProposed((p) => ({ ...p, [active.path]: t }));
                      // Typed on the right: it no longer matches the list, change for change.
                      if (activeChanges && t !== activeChanges.apply(activeOff).text) setManual((m) => (m[active.path] ? m : { ...m, [active.path]: true }));
                    }}
                    revert={phone ? undefined : 'a-to-b'}
                    unified={phone}
                    collapseUnchanged
                  />
                ) : plan && docId ? (
                  <EmptyState title="This reply doesn’t change any text">{anyAction ? 'Accept applies what is ticked above.' : 'There is nothing to apply.'}</EmptyState>
                ) : docId ? (
                  <div className="flex h-full items-center justify-center">
                    <Spinner />
                  </div>
                ) : (
                  <EmptyState title="Choose which document this reply is for" />
                )}
              </div>
            </div>
          </div>
        </>
      )}
      <SaveAsVariantDialog
        key={String(asVariant)}
        original={asVariant ? doc?.name : undefined}
        defaultName={doc ? `${doc.name} (agent)` : undefined}
        description={`The agent’s edits go into a new variant of “${doc?.name}”. “${doc?.name}” stays as it is.`}
        onClose={() => setAsVariant(false)}
        onSave={(name) => {
          setAsVariant(false);
          void acceptAsVariant(name);
        }}
      />
    </div>
  );
}

/**
 * How the reply would print: the document as it is now beside the document with what is ticked (compiled here,
 * nothing is saved). On a phone, one at a time.
 */
function PdfCompare({ doc, plan, proposed, stacked }: { doc?: DocMeta; plan: ReplyPlan; proposed: Record<string, string>; stacked: boolean }) {
  const beforeKey = `agent-before-${doc?.id ?? 'new'}`;
  const afterKey = `agent-after-${doc?.id ?? 'new'}`;
  const before = useCompileStore((s) => s.entries[beforeKey]);
  const after = useCompileStore((s) => s.entries[afterKey]);
  const [side, setSide] = useState<'before' | 'after'>('after');
  const [failed, setFailed] = useState<string>();
  const mainFile = doc?.mainFile ?? plan.files.find((f) => f.path === 'main.tex')?.path ?? plan.files.find((f) => f.path.endsWith('.tex'))?.path ?? plan.files[0]?.path ?? 'main.tex';
  const engine = doc?.engine ?? 'pdflatex';

  const base = useRef<FileMap | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void (async () => {
        if (!base.current) {
          base.current = doc ? (await repo.getWork(doc.id)).files : {};
          if (doc) void compileFiles({ key: beforeKey, files: base.current, mainFile, engine });
        }
        if (!live) return;
        const files: FileMap = { ...base.current };
        for (const f of plan.files) files[f.path] = { kind: 'text', text: proposed[f.path] ?? f.proposed };
        await compileFiles({ key: afterKey, files, mainFile, engine });
      })().catch((e) => live && setFailed(e instanceof Error ? e.message : String(e)));
    }, 500);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // Recompiled when the ticked edits change; the document itself is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposed]);

  if (failed) return <EmptyState title="Couldn’t make the preview">{failed}</EmptyState>;
  const pane = (entry: typeof before, label: string, testId: string) => (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid={testId}>
      {!stacked && <div className="shrink-0 border-b border-line px-3 py-1 text-[11px] text-muted">{label}</div>}
      <PdfViewer pdf={entry?.output?.pdf} running={entry?.running ?? true} pages={entry?.pages} compact emptyMessage={entry?.output && !entry.output.ok ? 'This text doesn’t compile yet. Check it on the Text side.' : undefined} />
    </div>
  );
  if (!doc) return pane(after, 'The new document', 'agent-pdf-after');
  if (stacked)
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 justify-center border-b border-line py-1.5">
          <span className="inline-flex rounded-lg bg-subtle p-0.5 text-xs font-medium">
            {(['before', 'after'] as const).map((x) => (
              <button key={x} onClick={() => setSide(x)} className={cn('h-7 rounded-md px-3', side === x ? 'bg-panel shadow-sm' : 'text-muted')} aria-pressed={side === x} data-testid={`agent-pdf-show-${x}`}>
                {x === 'before' ? 'Now' : 'With the edits'}
              </button>
            ))}
          </span>
        </div>
        {side === 'before' ? pane(before, 'Now', 'agent-pdf-before') : pane(after, 'With the edits', 'agent-pdf-after')}
      </div>
    );
  return (
    <div className="flex h-full divide-x divide-line">
      {pane(before, `${doc.name} now`, 'agent-pdf-before')}
      {pane(after, 'With what is ticked', 'agent-pdf-after')}
    </div>
  );
}
