import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bot, ClipboardPaste, CloudDownload, Copy, FileText, Folder, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { usePrefs } from '@/app/prefs';
import { Badge, Button, Dialog, Spinner } from '@/components/ui';
import { connectDrive, driveProvider, useSync } from '@/features/sync/controller';
import { pickAgentReplies, pickerConfigured, pickerTroubleHint, PickerError } from '@/features/sync/picker';
import { stashPastedReply, useAgentsDialog, waitingReplies } from './agents';
import { AGENTS_FOLDER, AGENTS_README } from '@/storage/providers/gdrive';

/** What to tell an assistant so it reads the instructions TexChef keeps in Drive. */
const STARTER = `In my Google Drive, open “${AGENTS_README}” in the folder TexChef/${AGENTS_FOLDER} and follow it exactly. Then: `;

/**
 * Experimental: open a reply an AI agent left in TexChef/Agents(optional_AI). Lists the replies TexChef
 * can already see; others are picked in Google's file picker (that grants access to them), or pasted.
 */
export function AgentRepliesDialog() {
  const open = useAgentsDialog((s) => s.open);
  const setOpen = useAgentsDialog((s) => s.set);
  const enabled = usePrefs((s) => s.agentsEnabled);
  const sync = useSync();
  const navigate = useNavigate();
  const [replies, setReplies] = useState<{ id: string; name: string; folder?: string }[]>();
  const [loading, setLoading] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const connected = sync.state !== 'local' && sync.state !== 'needs-signin';

  const refresh = async () => {
    if (!driveProvider() || !connected) return setReplies([]);
    setLoading(true);
    try {
      setReplies(await waitingReplies());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setReplies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setPasting(false);
      setPasted('');
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connected]);

  const openReply = (q: string) => {
    setOpen(false);
    navigate(`/agent-reply?${q}`);
  };

  const pick = async () => {
    try {
      const folder = await driveProvider()?.findAgentsFolder();
      // This window steps aside while Google's picker is open: an open dialog keeps everything outside it from
      // being tapped, and the picker (and its tip) sit outside it.
      setOpen(false);
      const picked = await pickAgentReplies(folder);
      if (picked.length === 1) return openReply(`file=${encodeURIComponent(picked[0].id)}`);
      if (picked.length) setReplies((r) => [...picked, ...(r ?? []).filter((x) => !picked.some((p) => p.id === x.id))]);
      setOpen(true);
    } catch (e) {
      setOpen(true);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg, { description: e instanceof PickerError ? pickerTroubleHint() : undefined });
    }
  };

  if (!enabled) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={
        <span className="flex items-center gap-2">
          <Bot className="size-4" /> AI updates <Badge tone="warn">Experimental</Badge>
        </span>
      }
      description="Agents write replies into TexChef/Agents(optional_AI) in your Google Drive. You review each one before anything changes."
      className="max-w-xl"
    >
      <div className="space-y-4 text-sm" data-testid="agent-replies">
        {!connected ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle p-3">
            <span className="flex-1">Connect Google Drive to see replies in the Agents folder.</span>
            <Button variant="primary" size="sm" onClick={() => connectDrive().catch((e) => toast.error(String(e?.message ?? e)))}>
              Connect Google Drive
            </Button>
          </div>
        ) : (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">Waiting for review</span>
              <Button variant="ghost" size="icon-sm" onClick={() => void refresh()} aria-label="Look again">
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
            {loading ? (
              <div className="flex justify-center p-3">
                <Spinner />
              </div>
            ) : replies?.length ? (
              <ul className="max-h-72 divide-y divide-line overflow-auto rounded-lg border border-line">
                {replies.map((r, i) => (
                  <li key={r.id}>
                    {/* Replies an assistant filed together (one folder per task) sit under that folder's name. */}
                    {r.folder && r.folder !== replies[i - 1]?.folder && (
                      <div className="flex items-center gap-2 bg-subtle/70 px-3 py-1.5 text-xs font-medium text-muted" data-testid="agent-reply-folder">
                        <Folder className="size-3.5" /> {r.folder} · {replies.filter((x) => x.folder === r.folder).length}
                      </div>
                    )}
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-subtle" onClick={() => openReply(`file=${encodeURIComponent(r.id)}`)} data-testid="agent-reply-item">
                      <FileText className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="text-xs text-accent">Review</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg bg-subtle p-3 text-muted">
                None that TexChef can see yet. Google lets TexChef read a file an agent made only after you pick it, so use <b>Pick from Google Drive</b>.
              </p>
            )}
          </div>
        )}
        <div className="rounded-lg border border-line p-3">
          <div className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">How to ask an assistant</div>
          <p className="text-muted">Connect your assistant to Google Drive, then start your request with:</p>
          <div className="mt-2 flex items-start gap-2">
            <code className="min-w-0 flex-1 rounded bg-subtle px-2 py-1.5 text-xs break-words" data-testid="agent-prompt">
              {STARTER}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(STARTER).then(() => toast.success('Copied. Paste it into your assistant, then add your request.'));
              }}
            >
              <Copy className="size-3.5" /> Copy
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {connected && pickerConfigured && (
            <Button variant="outline" onClick={() => void pick()} data-testid="agent-replies-pick">
              <CloudDownload className="size-4" /> Pick from Google Drive…
            </Button>
          )}
          <Button variant={pasting ? 'secondary' : 'ghost'} onClick={() => setPasting(!pasting)} data-testid="agent-replies-paste">
            <ClipboardPaste className="size-4" /> Paste a reply
          </Button>
        </div>
        {pasting && (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={'% texchef-reply doc=… base=… note="…"\n\\documentclass{article}\n…'}
              className="h-40 w-full rounded-lg border border-line bg-panel p-2 font-mono text-xs"
              data-testid="agent-replies-paste-text"
            />
            <div className="flex justify-end">
              <Button variant="primary" disabled={!pasted.trim()} onClick={() => openReply(`paste=${stashPastedReply(pasted)}`)} data-testid="agent-replies-paste-review">
                Review
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
