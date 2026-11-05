import { useState } from 'react';
import { useNavigate } from 'react-router';
import { GitBranch, GitCompare, GitMerge, History, RotateCcw, Save, Download, ArrowUpFromLine, Sparkles, FileInput } from 'lucide-react';
import { toast } from 'sonner';
import { repo, useDocCommits } from '@/app/repo';
import type { Commit, DocMeta } from '@/core/model';
import { Button, Input, Tip, Badge } from '@/components/ui';
import { timeAgo } from '@/lib/utils';
import { downloadProjectZip } from '@/features/importexport/io';

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
          <li key={c.id} className="group px-2 py-1.5 hover:bg-subtle">
            <div className="flex items-start gap-2">
              <span className="mt-0.5">{kindIcon(c.kind)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium" title={c.message}>
                  {c.message}
                </div>
                <div className="text-[11px] text-muted" title={new Date(c.createdAt).toLocaleString()}>
                  {timeAgo(c.createdAt)}
                  {c.id === doc.head && (
                    <Badge tone="accent" className="ml-1.5 px-1.5 py-0 text-[10px]">
                      current
                    </Badge>
                  )}
                </div>
              </div>
            </div>
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
                <Button size="icon-sm" variant="ghost" aria-label="Branch" onClick={() => navigate(`/doc/${doc.id}/new-variant?from=${c.id}`)}>
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
