import { useMemo, useState } from 'react';
import { ArrowUpFromLine, Sparkles, Tag, Plus, Blocks } from 'lucide-react';
import { toast } from 'sonner';
import { parseBlocks, type Block } from '@/blocks/parser';
import { compareBlocks, type BlockStatus } from '@/blocks/ops';
import { automark } from '@/blocks/automark';
import { pushBlockToParent } from '@/variants/ops';
import { repo, useWork } from '@/app/repo';
import type { DocMeta } from '@/core/model';
import { fileText } from '@/core/repo';
import { Badge, Button, Dialog, EmptyState, Input, Tip } from '@/components/ui';
import { cn } from '@/lib/utils';

export function BlocksPanel({
  doc,
  parent,
  path,
  text,
  cursorLine,
  onGoto,
  onReplaceText,
  onInsert,
  readOnly,
}: {
  doc: DocMeta;
  parent?: DocMeta | null;
  path: string;
  text: string;
  cursorLine?: number;
  onGoto: (line: number) => void;
  onReplaceText: (text: string) => void;
  onInsert: (snippet: string) => void;
  readOnly?: boolean;
}) {
  const parsed = useMemo(() => parseBlocks(text), [text]);
  const parentWork = useWork(parent?.id);
  const parentText = parentWork ? fileText(parentWork.files, path) : undefined;
  const status = useMemo(() => (parentText !== undefined ? compareBlocks(text, parentText) : undefined), [text, parentText]);
  const [tagEdit, setTagEdit] = useState<{ block: Block; value: string } | null>(null);
  const [confirm, setConfirm] = useState<Block | null>(null);

  const push = async (block: Block, force = false) => {
    const r = await pushBlockToParent(repo, doc.id, block.id, force);
    if (r.parentChanged && !force) {
      setConfirm(block);
      return;
    }
    (r.ok ? toast.success : toast.error)(r.message);
  };

  const saveTags = () => {
    if (!tagEdit) return;
    const lines = text.split('\n');
    const line = lines[tagEdit.block.startLine];
    const indent = /^\s*/.exec(line)![0];
    const tags = tagEdit.value
      .split(/[,\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const title = tagEdit.block.title ? ` title="${tagEdit.block.title}"` : '';
    lines[tagEdit.block.startLine] = `${indent}%% @block ${tagEdit.block.id}${tags.length ? ` tags=${tags.join(',')}` : ''}${title}`;
    onReplaceText(lines.join('\n'));
    setTagEdit(null);
  };

  const runAutomark = () => {
    const r = automark(text);
    if (r.added === 0) {
      toast.info('Nothing new to mark. Sections, entries and bullets are already in blocks.');
      return;
    }
    onReplaceText(r.text);
    toast.success(`Added ${r.added} blocks. Press Ctrl/⌘+Z to undo.`);
  };

  const render = (b: Block) => {
    const st: BlockStatus | undefined = status?.get(b.id);
    const active = cursorLine !== undefined && b.startLine + 1 <= cursorLine && cursorLine <= b.endLine + 1;
    return (
      <div key={b.id}>
        <div
          className={cn('group flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-1 text-xs hover:bg-subtle', active && 'bg-accent-soft/60')}
          style={{ paddingLeft: 8 + b.depth * 12 }}
          onClick={() => onGoto(b.startLine + 2)}
          title={`${b.id} (line ${b.startLine + 1})`}
        >
          <span className="min-w-0 flex-1 truncate">{b.label}</span>
          {b.tags.map((t) => (
            <Badge key={t} tone="accent" className="px-1.5 py-0 text-[10px]">
              {t}
            </Badge>
          ))}
          {st === 'changed' && <Badge tone="warn" className="px-1.5 py-0 text-[10px]">edited</Badge>}
          {st === 'only-here' && <Badge tone="info" className="px-1.5 py-0 text-[10px]">new</Badge>}
          {!readOnly && (
            <span className="flex shrink-0 opacity-0 group-hover:opacity-100">
              <Tip content="Edit tags">
                <button
                  className="rounded p-0.5 hover:bg-line"
                  aria-label={`Edit tags of ${b.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTagEdit({ block: b, value: b.tags.join(', ') });
                  }}
                >
                  <Tag className="size-3" />
                </button>
              </Tip>
              {parent && (st === 'changed' || st === 'only-here') && (
                <Tip content={`Copy this block into “${parent.name}”`}>
                  <button
                    className="rounded p-0.5 text-accent hover:bg-line"
                    aria-label={`Push ${b.id} to parent`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void push(b);
                    }}
                  >
                    <ArrowUpFromLine className="size-3" />
                  </button>
                </Tip>
              )}
            </span>
          )}
        </div>
        {b.children.map(render)}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="blocks-panel">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <span className="flex-1 text-xs font-semibold tracking-wide text-muted uppercase">Blocks</span>
        {!readOnly && (
          <>
            <Tip content="Insert a block at the cursor">
              <Button size="icon-sm" variant="ghost" aria-label="Insert block" onClick={() => onInsert('%% @block new-block tags=\n\n%% @end\n')}>
                <Plus className="size-3.5" />
              </Button>
            </Tip>
            <Tip content="Mark up my resume: add blocks around sections, entries and bullets automatically">
              <Button size="sm" variant="ghost" onClick={runAutomark}>
                <Sparkles className="size-3.5" /> Auto-mark
              </Button>
            </Tip>
          </>
        )}
      </div>
      {parsed.issues.length > 0 && (
        <div className="border-b border-line bg-danger-soft px-2 py-1.5 text-xs text-danger">
          {parsed.issues.map((i, k) => (
            <button key={k} className="block text-left hover:underline" onClick={() => onGoto(i.line + 1)}>
              Line {i.line + 1}: {i.message}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {parsed.roots.length === 0 ? (
          <EmptyState icon={<Blocks className="size-6" />} title="No blocks in this file">
            Blocks are what variants pick from. Use <b>Auto-mark</b> to add them around sections, jobs and bullets, or wrap text in
            <code className="mx-1 rounded bg-subtle px-1">%% @block id tags=…</code> … <code className="rounded bg-subtle px-1">%% @end</code>.
          </EmptyState>
        ) : (
          parsed.roots.map(render)
        )}
      </div>
      <Dialog
        open={!!tagEdit}
        onOpenChange={(o) => !o && setTagEdit(null)}
        title={`Tags for “${tagEdit?.block.label ?? ''}”`}
        description="Comma-separated, e.g. backend, ml, lead. Tag-based variants keep untagged blocks and blocks with a matching tag."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTagEdit(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveTags}>
              Save tags
            </Button>
          </>
        }
      >
        <Input autoFocus value={tagEdit?.value ?? ''} onChange={(e) => tagEdit && setTagEdit({ ...tagEdit, value: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveTags()} />
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="The parent changed this block too"
        description={`“${parent?.name}” edited “${confirm?.label}” after this variant last synced. Pushing will replace the parent's version with yours.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm) void push(confirm, true);
                setConfirm(null);
              }}
            >
              Replace in parent
            </Button>
          </>
        }
      />
    </div>
  );
}
