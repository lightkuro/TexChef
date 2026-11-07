import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { ArrowLeft, ArrowLeftRight, ArrowRight, ArrowLeft as ArrowL, Columns2, FileText, Rows2, Save, Blocks } from 'lucide-react';
import { toast } from 'sonner';
import { repo, useDocs, useDocCommits, useWork } from '@/app/repo';
import type { DocMeta } from '@/core/model';
import { fileText, type FileMap } from '@/core/repo';
import { compareBlocks } from '@/blocks/ops';
import { parseBlocks } from '@/blocks/parser';
import { upsertBlock } from '@/blocks/ops';
import { DiffView } from './DiffView';
import { DocPicker, type SideRef } from './DocPicker';
import { PdfViewer } from '@/features/preview/PdfViewer';
import { useAutoCompile, useEngineStatus } from '@/features/compile/useCompile';
import { EngineBanner } from '@/features/compile/EngineBanner';
import { Badge, Button, EmptyState, Select, Spinner, Tip } from '@/components/ui';
import { cn, timeAgo } from '@/lib/utils';


function parseSide(v: string | null): SideRef | undefined {
  if (!v) return undefined;
  const [docId, commitId] = v.split('@');
  return { docId, commitId: commitId || undefined };
}

function fmtSide(s: SideRef) {
  return s.commitId ? `${s.docId}@${s.commitId}` : s.docId;
}

/** Files for one side: the live working copy (editable) or a pinned version (read-only). */
function useSideFiles(side: SideRef | undefined): { files?: FileMap; editable: boolean } {
  const work = useWork(side && !side.commitId ? side.docId : undefined);
  const [commitFiles, setCommitFiles] = useState<FileMap>();
  useEffect(() => {
    setCommitFiles(undefined);
    if (side?.commitId) void repo.readCommitFiles(side.commitId).then(setCommitFiles);
  }, [side?.commitId]);
  if (!side) return { editable: false };
  return side.commitId ? { files: commitFiles, editable: false } : { files: work?.files, editable: true };
}

function SidePicker({ docs, value, other, onChange, label }: { docs: DocMeta[]; value?: SideRef; other?: SideRef; onChange: (s: SideRef) => void; label: string }) {
  const commits = useDocCommits(value?.docId);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <DocPicker docs={docs} value={value} other={other} onChange={onChange} label={label} />
      {value && (
        <Select value={value.commitId ?? ''} onChange={(e) => onChange({ docId: value.docId, commitId: e.target.value || undefined })} className="max-w-56 text-xs" aria-label={`${label} version`}>
          <option value="">Current (editable)</option>
          {(commits ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.message.slice(0, 40)} · {timeAgo(c.createdAt)}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}

type Layout = 'split' | 'text' | 'pdf';

export function ComparePage() {
  const [params, setParams] = useSearchParams();
  const docs = useDocs();
  const navigate = useNavigate();
  const engine = useEngineStatus();
  const left = parseSide(params.get('left'));
  const right = parseSide(params.get('right'));
  const L = useSideFiles(left);
  const R = useSideFiles(right);
  const leftDoc = docs?.find((d) => d.id === left?.docId);
  const rightDoc = docs?.find((d) => d.id === right?.docId);
  const [layout, setLayout] = useState<Layout>('split');
  const [direction, setDirection] = useState<'a-to-b' | 'b-to-a'>('a-to-b');
  const [showBlocks, setShowBlocks] = useState(true);
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [path, setPath] = useState<string>();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const setSide = (key: 'left' | 'right', s: SideRef) => {
    const next = new URLSearchParams(params);
    next.set(key, fmtSide(s));
    setParams(next, { replace: true });
  };

  const paths = useMemo(() => {
    const set = new Set([...Object.keys(L.files ?? {}), ...Object.keys(R.files ?? {})]);
    return [...set].filter((p) => (L.files?.[p] ?? R.files?.[p])?.kind === 'text').sort();
  }, [L.files, R.files]);
  const activePath = path && paths.includes(path) ? path : leftDoc?.mainFile && paths.includes(leftDoc.mainFile) ? leftDoc.mainFile : paths[0];
  const aText = (L.files && activePath && fileText(L.files, activePath)) ?? '';
  const bText = (R.files && activePath && fileText(R.files, activePath)) ?? '';

  const write = useCallback((docId: string, p: string, text: string) => {
    clearTimeout(timers.current[docId]);
    timers.current[docId] = setTimeout(() => void repo.writeWorkText(docId, p, text), 300);
  }, []);

  const leftCompile = useAutoCompile({
    key: left ? `cmp-${fmtSide(left)}` : 'cmp-left',
    files: layout !== 'text' ? L.files : undefined,
    mainFile: leftDoc?.mainFile,
    engine: leftDoc?.engine,
    auto: layout !== 'text',
    savePreviewAs: left && !left.commitId ? left.docId : undefined,
  });
  const rightCompile = useAutoCompile({
    key: right ? `cmp-${fmtSide(right)}` : 'cmp-right',
    files: layout !== 'text' ? R.files : undefined,
    mainFile: rightDoc?.mainFile,
    engine: rightDoc?.engine,
    auto: layout !== 'text',
    savePreviewAs: right && !right.commitId ? right.docId : undefined,
  });

  const blockStatus = useMemo(() => (activePath ? compareBlocks(aText, bText) : new Map()), [aText, bText, activePath]);
  const blockList = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; label: string; depth: number }[] = [];
    for (const b of [...parseBlocks(aText).all, ...parseBlocks(bText).all]) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      out.push({ id: b.id, label: b.label, depth: b.depth });
    }
    return out.filter((b) => blockStatus.get(b.id) !== 'same');
  }, [aText, bText, blockStatus]);

  const copyBlock = async (id: string, to: 'left' | 'right') => {
    if (!activePath) return;
    const target = to === 'left' ? left : right;
    if (!target || target.commitId) {
      toast.error('That side is a saved version. Switch it to “Current (editable)” to change it.');
      return;
    }
    const src = to === 'left' ? bText : aText;
    const dst = to === 'left' ? aText : bText;
    const out = upsertBlock(dst, src, id);
    if (out === null) {
      toast.error('Could not find where to insert this block');
      return;
    }
    await repo.writeWorkText(target.docId, activePath, out);
    toast.success(`Copied block to “${(to === 'left' ? leftDoc : rightDoc)?.name}”`);
  };

  const saveBoth = async () => {
    let n = 0;
    for (const s of [left, right]) {
      if (s && !s.commitId) {
        clearTimeout(timers.current[s.docId]);
        if (await repo.commitWork(s.docId, 'Saved from compare view', 'save')) n++;
      }
    }
    toast[n ? 'success' : 'info'](n ? `Saved ${n} version${n === 1 ? '' : 's'}` : 'No changes to save');
  };

  if (!docs) return <div className="flex h-full items-center justify-center"><Spinner /></div>;

  const sameDocBothEditable = left && right && left.docId === right.docId && !left.commitId && !right.commitId;
  const revert = direction === 'a-to-b' ? (R.editable && !sameDocBothEditable ? 'a-to-b' : undefined) : L.editable && !sameDocBothEditable ? 'b-to-a' : undefined;

  const textPane = (
    <div className="flex h-full min-h-0 flex-col">
      {left && right && activePath ? (
        <DiffView
          resetKey={`${activePath}|${fmtSide(left)}|${fmtSide(right)}`}
          a={aText}
          b={bText}
          aEditable={L.editable}
          bEditable={R.editable && !sameDocBothEditable}
          onChangeA={(t) => left && write(left.docId, activePath, t)}
          onChangeB={(t) => right && write(right.docId, activePath, t)}
          revert={revert}
          collapseUnchanged={onlyChanges}
        />
      ) : (
        <EmptyState title="Pick two documents to compare" />
      )}
    </div>
  );

  const pdfPane = (
    <div className="grid h-full min-h-0 grid-cols-2 divide-x divide-line">
      <PdfViewer pdf={leftCompile.entry?.output?.pdf} running={leftCompile.entry?.running} pages={leftCompile.entry?.pages} />
      <PdfViewer pdf={rightCompile.entry?.output?.pdf} running={rightCompile.entry?.running} pages={rightCompile.entry?.pages} />
    </div>
  );

  return (
    <div className="flex h-full flex-col" data-testid="compare-page">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-2 py-1.5">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <SidePicker docs={docs} value={left} other={right} onChange={(s) => setSide('left', s)} label="Left" />
        <Tip content="Swap sides">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Swap sides"
            onClick={() => {
              if (!left || !right) return;
              const next = new URLSearchParams(params);
              next.set('left', fmtSide(right));
              next.set('right', fmtSide(left));
              setParams(next, { replace: true });
            }}
          >
            <ArrowLeftRight className="size-4" />
          </Button>
        </Tip>
        <SidePicker docs={docs} value={right} other={left} onChange={(s) => setSide('right', s)} label="Right" />
        <div className="flex-1" />
        {paths.length > 1 && (
          <Select value={activePath} onChange={(e) => setPath(e.target.value)} className="text-xs" aria-label="File">
            {paths.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        )}
        <Tip content="Which way the per-change arrows copy text">
          <Button variant="outline" size="sm" onClick={() => setDirection(direction === 'a-to-b' ? 'b-to-a' : 'a-to-b')}>
            Arrows copy {direction === 'a-to-b' ? <>left <ArrowRight className="size-3" /> right</> : <>right <ArrowL className="size-3" /> left</>}
          </Button>
        </Tip>
        <div className="inline-flex rounded-lg bg-subtle p-0.5">
          {(
            [
              ['split', Rows2, 'Text + PDF'],
              ['text', Columns2, 'Text'],
              ['pdf', FileText, 'PDF'],
            ] as const
          ).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setLayout(k)} className={cn('flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium', layout === k ? 'bg-panel shadow-sm' : 'text-muted')}>
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-muted">
          <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} /> Only changes
        </label>
        <Button variant={showBlocks ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowBlocks(!showBlocks)}>
          <Blocks className="size-3.5" /> Blocks
        </Button>
        <Button variant="primary" size="sm" onClick={saveBoth} disabled={!L.editable && !R.editable}>
          <Save className="size-3.5" /> Save both
        </Button>
      </header>
      {sameDocBothEditable && (
        <div className="shrink-0 border-b border-line bg-warn-soft px-3 py-1 text-xs text-warn">
          Both sides show the same working copy, so only the left side is editable. Pick a saved version on one side to compare history.
        </div>
      )}
      <EngineBanner status={engine} />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {layout === 'text' && textPane}
          {layout === 'pdf' && pdfPane}
          {layout === 'split' && (
            <Group orientation="vertical">
              <Panel defaultSize="55%" minSize="20%">
                {textPane}
              </Panel>
              <Separator />
              <Panel defaultSize="45%" minSize="15%">
                {pdfPane}
              </Panel>
            </Group>
          )}
        </div>
        {showBlocks && (
          <aside className="w-72 shrink-0 overflow-auto border-l border-line bg-panel" data-testid="compare-blocks">
            <div className="border-b border-line px-3 py-2">
              <div className="text-xs font-semibold tracking-wide text-muted uppercase">Blocks that differ</div>
              <p className="mt-0.5 text-[11px] text-muted">Copy a whole section, job or bullet across. Matching is by block id.</p>
            </div>
            {blockList.length === 0 && <div className="p-3 text-xs text-muted">All blocks match.</div>}
            {blockList.map((b) => {
              const st = blockStatus.get(b.id);
              return (
                <div key={b.id} className="group flex items-center gap-1 px-2 py-1 text-xs hover:bg-subtle" style={{ paddingLeft: 8 + b.depth * 10 }}>
                  <Tip content="Copy to left">
                    <button
                      className="rounded p-0.5 hover:bg-line disabled:opacity-30"
                      disabled={st === 'only-here' || !L.editable}
                      onClick={() => copyBlock(b.id, 'left')}
                      aria-label={`Copy ${b.id} to left`}
                    >
                      <ArrowL className="size-3.5" />
                    </button>
                  </Tip>
                  <span className="min-w-0 flex-1 truncate" title={b.label}>
                    {b.label}
                  </span>
                  <Badge tone={st === 'changed' ? 'warn' : 'info'} className="px-1.5 py-0 text-[10px]">
                    {st === 'changed' ? 'differs' : st === 'only-here' ? 'left only' : 'right only'}
                  </Badge>
                  <Tip content="Copy to right">
                    <button
                      className="rounded p-0.5 hover:bg-line disabled:opacity-30"
                      disabled={st === 'only-there' || !R.editable || !!sameDocBothEditable}
                      onClick={() => copyBlock(b.id, 'right')}
                      aria-label={`Copy ${b.id} to right`}
                    >
                      <ArrowRight className="size-3.5" />
                    </button>
                  </Tip>
                </div>
              );
            })}
          </aside>
        )}
      </div>
    </div>
  );
}
