import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Archive, ArrowLeft, Bot, Check, FolderInput, GitBranch, GitBranchPlus, Link2, PencilLine, Unlink, X } from 'lucide-react';
import { toast } from 'sonner';
import { repo, useDocs } from '@/app/repo';
import { usePrefs } from '@/app/prefs';
import { Badge, Button, EmptyState, Select, Spinner, Tip } from '@/components/ui';
import { DiffView } from '@/features/compare/DiffView';
import { driveProvider } from '@/features/sync/controller';
import { SaveAsVariantDialog } from '@/features/variants/SaveAsVariantDialog';
import { canLink, linkAsVariant, saveWorkAsVariant, unlinkVariant } from '@/variants/ops';
import { cleanFolder } from '@/features/folders/folderTree';
import { fileText } from '@/core/repo';
import { cn } from '@/lib/utils';
import { dropPastedReply, markReplyHandled, pastedReply } from './agents';
import { hasConflictMarkers, parseReply, planReply, type AgentReply, type ReplyPlan } from './reply';

/** Review a reply from an AI agent (experimental): the document beside what accepting would write. */
export function AgentReplyPage() {
  const enabled = usePrefs((s) => s.agentsEnabled);
  const [params] = useSearchParams();
  const fileId = params.get('file') ?? undefined;
  const pasteKey = params.get('paste') ?? undefined;
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
  const [use, setUse] = useState({ rename: true, folder: true, variant: true, archive: true, link: true, unlink: true });

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
  };
  /** Proposed, but not possible: shown so it isn't silently dropped, and never applied. */
  const refused = linkCheck && !linkCheck.ok ? `Link it as a variant of “${variantOf?.name ?? reply?.variantOf}”: ${linkCheck.reason}` : undefined;
  const anyAction =
    (actions.rename && use.rename) || (actions.folder && use.folder) || (actions.archive && use.archive) || (actions.link && use.link) || (actions.unlink && use.unlink);
  const active = plan?.files.find((f) => f.path === path) ?? plan?.files[0];
  const conflicted = useMemo(() => Object.values(proposed).filter(hasConflictMarkers).length, [proposed]);
  const changed = plan?.files.filter((f) => proposed[f.path] !== f.current) ?? [];
  const note = source?.reply.note;

  if (!enabled) return <Navigate to="/" replace />;

  const finish = async (go: string) => {
    await markReplyHandled(fileId);
    if (pasteKey) dropPastedReply(pasteKey);
    navigate(go);
  };

  /** Write the reviewed text into the working copy (after keeping the current text as an autosave). */
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
        await repo.commitWork(docId, `Edits from an AI agent${note ? `: ${note}` : ''}`, 'agent');
      }
      if (actions.rename && use.rename) await repo.updateDoc(docId, { name: reply!.rename!.trim() });
      if (actions.folder && use.folder) await repo.updateDoc(docId, { folder: newFolder });
      if (actions.archive && use.archive) await repo.updateDoc(docId, { archived: reply!.archive });
      if (actions.link && use.link) await linkAsVariant(repo, docId, reply!.variantOf!);
      if (actions.unlink && use.unlink) await unlinkVariant(repo, docId);
      toast.success(changed.length ? 'Saved as a new version' : 'Done');
      await finish(`/doc/${docId}`);
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
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => void dismiss()} disabled={busy || !source} data-testid="agent-reply-dismiss">
          <X className="size-3.5" /> Dismiss
        </Button>
        {docId && docId !== 'new' && (
          <Button variant="outline" size="sm" onClick={() => setAsVariant(true)} disabled={busy || !plan || !!conflicted || !changed.length} data-testid="agent-reply-variant">
            <GitBranchPlus className="size-3.5" /> <span className="max-sm:hidden">As a new variant</span>
          </Button>
        )}
        <Tip content={conflicted ? 'Resolve the conflicts on the right first' : docId === 'new' ? 'Create this document' : 'Save these edits as a new version'}>
          <span>
            <Button variant="primary" size="sm" onClick={() => void accept()} disabled={busy || !plan || !!conflicted || (docId !== 'new' && !changed.length && !anyAction)} data-testid="agent-reply-accept">
              {busy ? <Spinner /> : <Check className="size-3.5" />} {docId === 'new' ? 'Create document' : 'Accept'}
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
            {plan && docId !== 'new' && (
              <Badge tone={plan.baseKnown ? 'ok' : 'warn'}>
                {plan.baseKnown ? 'Your later edits are kept' : 'Replaces the files as they are now'}
              </Badge>
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
          {(actions.rename || actions.folder || actions.variant || actions.archive || actions.link || actions.unlink || refused) && (
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
              {refused && (
                <span className="flex items-center gap-1.5 text-xs text-muted" data-testid="agent-action-refused">
                  <X className="size-3.5" /> Can’t be done: {refused}
                </span>
              )}
            </div>
          )}
          {conflicted > 0 && (
            <p className="shrink-0 border-b border-line bg-danger-soft px-3 py-1.5 text-xs text-danger">
              Some lines were changed both by you and by the agent. On the right, keep the lines you want and delete the {'<<<<<<<'}, {'======='} and{' '}
              {'>>>>>>>'} lines.
            </p>
          )}
          <div className="grid h-8 shrink-0 grid-cols-2 items-center border-b border-line px-2 text-xs text-muted">
            <span className="truncate">{docId === 'new' ? `New document: “${reply?.name || 'From an AI agent'}”` : `${doc?.name ?? 'Choose a document'} now`}</span>
            <span className={cn('truncate pl-3')}>With the agent’s edits (you can edit this side)</span>
          </div>
          <div className="min-h-0 flex-1">
            {plan && active ? (
              <DiffView
                resetKey={`${docId}|${active.path}`}
                a={active.current}
                b={proposed[active.path] ?? ''}
                aEditable={false}
                bEditable
                onChangeB={(t) => setProposed((p) => ({ ...p, [active.path]: t }))}
                revert="a-to-b"
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
