import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { GitBranch, GitCompare, GitMerge, History, RotateCcw, Save, Download, ArrowUpFromLine, Sparkles, FileInput, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { repo, useDocCommits } from '@/app/repo';
import type { Commit, DocMeta } from '@/core/model';
import { Button, Input, Tip, Badge } from '@/components/ui';
import { cn, timeAgo } from '@/lib/utils';
import { downloadProjectZip } from '@/features/importexport/io';
import { editStats, versionNumbers, type EditStats } from './versionStats';

/** Edit counts per version (they never change: versions are immutable). */
const statsCache = new Map<string, EditStats>();

function useEditStats(commits: Commit[]): Map<string, EditStats> {
  const [, bump] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const c of commits) {
        if (cancelled) return;
        if (statsCache.has(c.id)) continue;
        const after = await repo.readCommitFiles(c.id);
        const before = c.parents[0] ? await repo.readCommitFiles(c.parents[0]).catch(() => undefined) : undefined;
        statsCache.set(c.id, editStats(before, after));
        bump((n) => n + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commits]);
  return statsCache;
}

/** What each kind of version is, in a couple of words. */
export function kindLabel(kind: Commit['kind']): string {
  switch (kind) {
    case 'merge':
      return 'Took updates';
    case 'branch':
      return 'Variant started';
    case 'push-up':
      return 'Block sent up from a variant';
    case 'restore':
      return 'Restored an older version';
    case 'auto':
      return 'Autosave';
    case 'import':
      return 'Imported';
    case 'create':
      return 'Document created';
    case 'agent':
      return 'Edits from an AI agent';
    default:
      return 'Saved version';
  }
}

export function kindIcon(kind: Commit['kind']) {
  switch (kind) {
    case 'merge':
      return <GitMerge className="size-3.5 text-info" />;
    case 'branch':
      return <GitBranch className="size-3.5 text-accent" />;
    case 'push-up':
      return <ArrowUpFromLine className="size-3.5 text-ok" />;
    case 'restore':
      return <RotateCcw className="size-3.5 text-warn" />;
    case 'auto':
      return <History className="size-3.5 text-muted" />;
    case 'import':
      return <FileInput className="size-3.5 text-info" />;
    case 'create':
      return <Sparkles className="size-3.5 text-accent" />;
    case 'agent':
      return <Bot className="size-3.5 text-accent" />;
    default:
      return <Save className="size-3.5 text-fg" />;
  }
}

export function HistoryPanel({ doc, dirty }: { doc: DocMeta; dirty: boolean }) {
  const commits = useDocCommits(doc.id);
  const [showAuto, setShowAuto] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const save = async () => {
    const c = await repo.commitWork(doc.id, message.trim() || 'Saved version', 'save');
    setMessage('');
    if (c) toast.success('Version saved');
    else toast.info('No changes since the last version');
  };

  const visible = (commits ?? []).filter((c) => showAuto || c.kind !== 'auto' || c.id === doc.head);
  const hidden = (commits?.length ?? 0) - visible.length;
  const numbers = useMemo(() => versionNumbers(commits ?? []), [commits]);
  const stats = useEditStats(visible);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="history-panel">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <span className="flex-1 text-xs font-semibold tracking-wide text-muted uppercase">History</span>
        <label className="flex items-center gap-1 text-[11px] text-muted">
          <input type="checkbox" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} /> autosaves
        </label>
      </div>
      <div className="flex gap-1.5 border-b border-line p-2">
        <Input placeholder={dirty ? 'Describe your changes…' : 'No unsaved changes'} value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} className="h-7 text-xs" />
        <Button size="sm" variant="primary" onClick={save} disabled={!dirty && !message}>
          Save
        </Button>
      </div>
      <ol className="min-h-0 flex-1 overflow-auto py-1">
        {visible.map((c) => (
          <li key={c.id} className={cn('group px-2 hover:bg-subtle', c.kind === 'auto' ? 'py-0.5' : 'py-1.5')} data-kind={c.kind}>
            {c.kind === 'auto' ? (
              // Autosaves: one small line each, so they don't crowd out the versions you saved.
              <div className="flex items-center gap-2 text-[11px] text-muted" title={new Date(c.createdAt).toLocaleString()}>
                <span className="flex w-3.5 justify-center">
                  <span className="size-1.5 rounded-full bg-muted/60" />
                </span>
                <span className="shrink-0 font-mono tabular-nums" data-testid="version-number">
                  v{numbers.get(c.id)}
                </span>
                <span className="truncate">Autosave · {timeAgo(c.createdAt)}</span>
                {c.id === doc.head && (
                  <Badge tone="accent" className="px-1.5 py-0 text-[10px]">
                    current
                  </Badge>
                )}
              </div>
            ) : (
            <div className="flex items-start gap-2">
              <span className="mt-0.5">{kindIcon(c.kind)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className="shrink-0 font-mono text-[11px] text-muted tabular-nums" data-testid="version-number">
                    v{numbers.get(c.id)}
                  </span>
                  <span className="truncate text-xs font-medium" title={c.message}>
                    {c.message}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted" title={new Date(c.createdAt).toLocaleString()}>
                  {timeAgo(c.createdAt)}
                  {stats.get(c.id) && <EditCount s={stats.get(c.id)!} />}
                  {c.id === doc.head && (
                    <Badge tone="accent" className="ml-1.5 px-1.5 py-0 text-[10px]">
                      current
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            )}
            <div className="mt-1 hidden gap-0.5 pl-5 group-hover:flex">
              <Tip content="Compare this version with the current text">
                <Button size="icon-sm" variant="ghost" aria-label="Compare" onClick={() => navigate(`/compare?left=${doc.id}@${c.id}&right=${doc.id}`)}>
                  <GitCompare className="size-3.5" />
                </Button>
              </Tip>
              <Tip content="Restore this version (saved as a new version)">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Restore"
                  disabled={c.id === doc.head && !dirty}
                  onClick={async () => {
                    await repo.restore(doc.id, c.id);
                    toast.success('Restored');
                  }}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </Tip>
              <Tip content="New variant from this version">
                <Button size="icon-sm" variant="ghost" aria-label="New variant from this version" onClick={() => navigate(`/doc/${doc.id}/new-variant?from=${c.id}`)}>
                  <GitBranch className="size-3.5" />
                </Button>
              </Tip>
              <Tip content="Download this version as .zip">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Download version"
                  onClick={async () => downloadProjectZip({ ...doc, name: `${doc.name} ${new Date(c.createdAt).toISOString().slice(0, 10)}` }, await repo.readCommitFiles(c.id))}
                >
                  <Download className="size-3.5" />
                </Button>
              </Tip>
            </div>
          </li>
        ))}
        {hidden > 0 && (
          <li className="px-3 py-2 text-[11px] text-muted">
            {hidden} autosave{hidden === 1 ? '' : 's'} hidden
          </li>
        )}
      </ol>
    </div>
  );
}

/** “+12 −3” lines changed (and how many files), compared with the version before. */
function EditCount({ s }: { s: EditStats }) {
  if (!s.added && !s.removed && !s.files) return <span>no changes</span>;
  return (
    <span className="tabular-nums" title={`${s.added} line${s.added === 1 ? '' : 's'} added, ${s.removed} removed, in ${s.files} file${s.files === 1 ? '' : 's'}`} data-testid="edit-count">
      <span className="text-ok">+{s.added}</span> <span className="text-danger">−{s.removed}</span>
      {s.files > 1 && <span> · {s.files} files</span>}
    </span>
  );
}
