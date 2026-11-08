import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { ArrowLeft, ArrowLeftRight, ArrowRight, ArrowLeft as ArrowL, Columns2, FileText, Rows2, Save, Blocks, SlidersHorizontal } from 'lucide-react';
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
import { Badge, Button, Drawer, DrawerClose, EmptyState, Select, Spinner, Tip } from '@/components/ui';
import { ActionDropdown } from '@/components/ActionMenu';
import { usePaneLayout, usePhone } from '@/lib/useMediaQuery';
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

/**
 * Document and version for one side. `fit`: narrower windows, where the two share the space;
 * `stacked`: small screens, a column (name, document, version).
 */
function SidePicker({
  docs,
  value,
  other,
  onChange,
  label,
  fit,
}: {
  docs: DocMeta[];
  value?: SideRef;
  other?: SideRef;
  onChange: (s: SideRef) => void;
  label: string;
  fit?: 'shrink' | 'stacked';
}) {
  const commits = useDocCommits(value?.docId);
  const phone = usePhone();
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', fit === 'stacked' && 'flex-col items-stretch gap-1')}>
      <span className={cn('text-xs text-muted', fit === 'stacked' && 'px-0.5 text-[11px] font-medium tracking-wide uppercase')}>{label}</span>
      <DocPicker docs={docs} value={value} other={other} onChange={onChange} label={label} className={fit === 'stacked' ? 'w-full max-w-none max-sm:h-9' : fit && 'min-w-0 flex-1'} />
      {value && (
        <Select
          value={value.commitId ?? ''}
          onChange={(e) => onChange({ docId: value.docId, commitId: e.target.value || undefined })}
          className={cn('max-w-56 text-xs', fit === 'shrink' && 'min-w-0 flex-1', fit === 'stacked' && 'w-full max-w-none max-sm:h-9')}
          aria-label={`${label} version`}
        >
          <option value="">{fit === 'stacked' && phone ? 'Current' : 'Current (editable)'}</option>
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
/** What small screens show: the changes, both PDFs (tablets), or one side's PDF (phones). */
type NarrowView = 'text' | 'pdf' | 'left' | 'right';

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
  // Narrower windows: two-row header (split); small screens: one view at a time (single).
  const pl = usePaneLayout();
  const phone = usePhone();
  const [narrowView, setNarrowView] = useState<NarrowView>('text');
  const [blocksOpen, setBlocksOpen] = useState(false);
  // Phones show one PDF at a time, tablets both.
  const shownView: NarrowView = phone ? (narrowView === 'pdf' ? 'left' : narrowView) : narrowView === 'left' || narrowView === 'right' ? 'pdf' : narrowView;
  /** Compile only while a PDF is on screen. */
  const pdfShown = pl === 'single' ? shownView !== 'text' : layout !== 'text';

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
    files: pdfShown ? L.files : undefined,
    mainFile: leftDoc?.mainFile,
    engine: leftDoc?.engine,
    auto: pdfShown,
    savePreviewAs: left && !left.commitId ? left.docId : undefined,
  });
  const rightCompile = useAutoCompile({
    key: right ? `cmp-${fmtSide(right)}` : 'cmp-right',
    files: pdfShown ? R.files : undefined,
    mainFile: rightDoc?.mainFile,
    engine: rightDoc?.engine,
    auto: pdfShown,
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
      {left && right && activePath && L.files && R.files ? (
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
          unified={pl === 'single' && phone}
        />
      ) : left && right && (!L.files || !R.files) ? (
        // Both chosen, files still loading: build the diff once both sides are here.
        <div className="flex h-full items-center justify-center text-muted">
          <Spinner />
        </div>
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

  const swapSides = () => {
    if (!left || !right) return;
    const next = new URLSearchParams(params);
    next.set('left', fmtSide(right));
    next.set('right', fmtSide(left));
    setParams(next, { replace: true });
  };

  const blocksIntro = (
    <div className="border-b border-line px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">Blocks that differ</div>
      <p className="mt-0.5 text-[11px] text-muted">Copy a whole section, job or bullet across. Matching is by block id.</p>
    </div>
  );

  const blockRows = (
    <>
      {blockList.length === 0 && <div className="p-3 text-xs text-muted">All blocks match.</div>}
      {blockList.map((b) => {
        const st = blockStatus.get(b.id);
        return (
          <div key={b.id} className="group flex items-center gap-1 px-2 py-1 text-xs hover:bg-subtle" style={{ paddingLeft: 8 + b.depth * 10 }}>
            <Tip content="Copy to left">
              <button
                className="rounded p-0.5 hover:bg-line disabled:opacity-30 max-sm:p-2"
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
                className="rounded p-0.5 hover:bg-line disabled:opacity-30 max-sm:p-2"
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
    </>
  );

  const fileSelect = paths.length > 1 && (
    <Select value={activePath} onChange={(e) => setPath(e.target.value)} className={cn('text-xs', pl !== 'wide' && 'max-w-40 min-w-0')} aria-label="File">
      {paths.map((p) => (
        <option key={p}>{p}</option>
      ))}
    </Select>
  );

  const arrowsButton = (
    <Tip content="Which way the per-change arrows copy text">
      <Button variant="outline" size="sm" onClick={() => setDirection(direction === 'a-to-b' ? 'b-to-a' : 'a-to-b')}>
        Arrows copy {direction === 'a-to-b' ? <>left <ArrowRight className="size-3" /> right</> : <>right <ArrowL className="size-3" /> left</>}
      </Button>
    </Tip>
  );

  const layoutSwitch = (
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
  );

  const onlyChangesToggle = (
    <label className="flex items-center gap-1 text-xs text-muted">
      <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} /> Only changes
    </label>
  );

  const saveButton = (
    <Button variant="primary" size="sm" onClick={saveBoth} disabled={!L.editable && !R.editable}>
      <Save className="size-3.5" /> Save both
    </Button>
  );

  const swapButton = (
    <Tip content="Swap sides">
      <Button variant="ghost" size="icon-sm" aria-label="Swap sides" onClick={swapSides}>
        <ArrowLeftRight className="size-4" />
      </Button>
    </Tip>
  );

  const sameDocNote = sameDocBothEditable && (
    <div className="shrink-0 border-b border-line bg-warn-soft px-3 py-1 text-xs text-warn">
      Both sides show the same working copy, so only the left side is editable. Pick a saved version on one side to compare history.
    </div>
  );

  // ---- Small screens: one view at a time ----------------------------------------------------
  if (pl === 'single') {
    const view = shownView;
    const tabs: [NarrowView, typeof FileText, string][] = phone
      ? [
          ['text', Columns2, 'Changes'],
          ['left', FileText, 'Left'],
          ['right', FileText, 'Right'],
        ]
      : [
          ['text', Columns2, 'Changes'],
          ['pdf', FileText, 'PDFs'],
        ];
    const side = view === 'right' ? rightCompile : leftCompile;
    return (
      <div className="flex h-full flex-col" data-testid="compare-page">
        <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-panel px-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="size-4" />
          </Button>
          <span className="truncate text-sm font-semibold">Compare</span>
          <div className="flex-1" />
          {fileSelect}
          <Button variant="ghost" size={phone ? 'icon' : 'sm'} onClick={() => setBlocksOpen(true)} aria-label="Blocks that differ" data-testid="compare-blocks-open">
            <Blocks className="size-4" />
            {phone ? null : ' Blocks'}
            {blockList.length > 0 && <Badge tone="warn" className="px-1.5 py-0 text-[10px]">{blockList.length}</Badge>}
          </Button>
          <ActionDropdown
            label="Compare options"
            actions={[
              { key: 'only', label: 'Only changes', hint: 'fold matching lines', checked: onlyChanges, run: () => setOnlyChanges(!onlyChanges) },
              ...(phone
                ? []
                : [
                    { key: 'ltr', label: 'Arrows copy left → right', checked: direction === 'a-to-b', separatorBefore: true, run: () => setDirection('a-to-b') },
                    { key: 'rtl', label: 'Arrows copy right → left', checked: direction === 'b-to-a', run: () => setDirection('b-to-a') },
                  ]),
              { key: 'swap', label: 'Swap sides', icon: <ArrowLeftRight className="size-4" />, separatorBefore: true, disabled: !left || !right, run: swapSides },
            ]}
            trigger={
              <Button variant="ghost" size="icon" aria-label="Compare options" data-testid="compare-options">
                <SlidersHorizontal className="size-4" />
              </Button>
            }
          />
          <Button variant="primary" size={phone ? 'icon' : 'sm'} onClick={saveBoth} disabled={!L.editable && !R.editable} aria-label="Save both">
            <Save className={phone ? 'size-4' : 'size-3.5'} />
            {phone ? null : ' Save both'}
          </Button>
        </header>
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 border-b border-line bg-panel px-2 pt-1.5 pb-2">
          <SidePicker docs={docs} value={left} other={right} onChange={(s) => setSide('left', s)} label="Left" fit="stacked" />
          <div className="pt-4">{swapButton}</div>
          <SidePicker docs={docs} value={right} other={left} onChange={(s) => setSide('right', s)} label="Right" fit="stacked" />
        </div>
        {sameDocNote}
        <EngineBanner status={engine} />
        <div className="flex h-12 shrink-0 items-center justify-center border-b border-line bg-panel px-2">
          <div role="tablist" aria-label="Show" className={cn('grid gap-0.5 rounded-lg bg-subtle p-0.5', phone ? 'w-full max-w-sm grid-cols-3' : 'w-72 grid-cols-2')}>
            {tabs.map(([k, Icon, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={view === k}
                onClick={() => setNarrowView(k)}
                className={cn('flex h-8 items-center justify-center gap-1.5 rounded-md text-sm font-medium', view === k ? 'bg-panel text-fg shadow-sm' : 'text-muted hover:text-fg')}
                data-testid={`compare-view-${k}`}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]">
          {view === 'text' ? (
            <div className="flex h-full flex-col">
              {phone && left && right && (
                <div className="shrink-0 border-b border-line bg-subtle px-3 py-1 text-[11px] text-muted">
                  From left to right: <span className="text-danger line-through">removed</span> · <span className="text-ok">added</span>
                  {R.editable && !sameDocBothEditable ? ' · you can edit the right side here' : ''}
                </div>
              )}
              <div className="min-h-0 flex-1">{textPane}</div>
            </div>
          ) : view === 'pdf' ? (
            pdfPane
          ) : (
            <PdfViewer key={view} pdf={side.entry?.output?.pdf} running={side.entry?.running} pages={side.entry?.pages} compact />
          )}
        </div>
        <Drawer side="right" open={blocksOpen} onOpenChange={setBlocksOpen} title="Blocks that differ" testId="compare-blocks">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pr-2 pl-3 text-xs font-semibold tracking-wide text-muted uppercase">
            Blocks that differ
            <DrawerClose />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <p className="border-b border-line px-3 py-2 text-[11px] text-muted">Copy a whole section, job or bullet across. Matching is by block id.</p>
            {blockRows}
          </div>
        </Drawer>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="compare-page">
      {pl === 'wide' ? (
        <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-2 py-1.5">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="size-4" />
          </Button>
          <SidePicker docs={docs} value={left} other={right} onChange={(s) => setSide('left', s)} label="Left" />
          {swapButton}
          <SidePicker docs={docs} value={right} other={left} onChange={(s) => setSide('right', s)} label="Right" />
          <div className="flex-1" />
          {fileSelect}
          {arrowsButton}
          {layoutSwitch}
          {onlyChangesToggle}
          <Button variant={showBlocks ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowBlocks(!showBlocks)}>
            <Blocks className="size-3.5" /> Blocks
          </Button>
          {saveButton}
        </header>
      ) : (
        // Narrower windows: the two sides (and Save) on the first row, view options on the second.
        <header className="flex shrink-0 flex-col border-b border-line bg-panel">
          <div className="flex h-12 items-center gap-2 px-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft className="size-4" />
            </Button>
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <SidePicker docs={docs} value={left} other={right} onChange={(s) => setSide('left', s)} label="Left" fit="shrink" />
              {swapButton}
              <SidePicker docs={docs} value={right} other={left} onChange={(s) => setSide('right', s)} label="Right" fit="shrink" />
            </div>
            {saveButton}
          </div>
          <div className="flex h-10 items-center gap-2 border-t border-line px-2">
            {layoutSwitch}
            {fileSelect}
            {onlyChangesToggle}
            <div className="flex-1" />
            {arrowsButton}
            <Button variant={showBlocks ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowBlocks(!showBlocks)}>
              <Blocks className="size-3.5" /> Blocks
            </Button>
          </div>
        </header>
      )}
      {sameDocNote}
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
          <aside className={cn('w-72 shrink-0 overflow-auto border-l border-line bg-panel', pl === 'split' && 'w-64')} data-testid="compare-blocks">
            {blocksIntro}
            {blockRows}
          </aside>
        )}
      </div>
    </div>
  );
}
