import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { ArrowLeft, ArrowLeftRight, ArrowRight, ArrowLeft as ArrowL, Columns2, FileText, Rows2, Save, Blocks, SlidersHorizontal, Pencil, Eye, Lock, ChevronDown, GitBranchPlus } from 'lucide-react';
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
import { Badge, Button, Dialog, Drawer, DrawerClose, EmptyState, Input, Select, Spinner, Tip } from '@/components/ui';
import { saveWorkAsVariant } from '@/variants/ops';
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
function useSideFiles(side: SideRef | undefined): { files?: FileMap; editable: boolean; dirty: boolean } {
  const work = useWork(side && !side.commitId ? side.docId : undefined);
  const [commitFiles, setCommitFiles] = useState<FileMap>();
  useEffect(() => {
    setCommitFiles(undefined);
    if (side?.commitId) void repo.readCommitFiles(side.commitId).then(setCommitFiles);
  }, [side?.commitId]);
  if (!side) return { editable: false, dirty: false };
  return side.commitId ? { files: commitFiles, editable: false, dirty: false } : { files: work?.files, editable: true, dirty: !!work?.dirty };
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
  viewOnly,
  onViewOnly,
}: {
  docs: DocMeta[];
  value?: SideRef;
  other?: SideRef;
  onChange: (s: SideRef) => void;
  label: string;
  fit?: 'shrink' | 'stacked';
  viewOnly: boolean;
  onViewOnly: (v: boolean) => void;
}) {
  const commits = useDocCommits(value?.docId);
  const phone = usePhone();
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', fit === 'stacked' && 'flex-col items-stretch gap-1')}>
      <span className={cn('text-xs text-muted', fit === 'stacked' && 'px-0.5 text-[11px] font-medium tracking-wide uppercase')}>{label}</span>
      <DocPicker docs={docs} value={value} other={other} onChange={onChange} label={label} className={fit === 'stacked' ? 'w-full max-w-none max-sm:h-9' : fit && 'min-w-0 flex-1'} />
      {value && (
        <div className={cn('flex min-w-0 items-center gap-1', fit === 'shrink' && 'flex-1', fit === 'stacked' && 'w-full')}>
        <Select
          value={value.commitId ?? ''}
          onChange={(e) => onChange({ docId: value.docId, commitId: e.target.value || undefined })}
          className={cn('w-36 text-xs xl:w-44', fit === 'shrink' && 'min-w-0 flex-1', fit === 'stacked' && 'w-full max-w-none max-sm:h-9')}
          aria-label={`${label} version`}
        >
          <option value="">Current</option>
          {(commits ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.message.slice(0, 40)} · {timeAgo(c.createdAt)}
            </option>
          ))}
        </Select>
        <EditToggle label={label} pinned={!!value.commitId} viewOnly={viewOnly} onViewOnly={onViewOnly} big={phone} />
        </div>
      )}
    </div>
  );
}

/**
 * Whether a side can be edited, as an icon: a pencil (editing; click to just look), an eye (view
 * only; click to edit) or a lock (a saved version, which can't change).
 */
function EditToggle({ label, pinned, viewOnly, onViewOnly, big }: { label: string; pinned: boolean; viewOnly: boolean; onViewOnly: (v: boolean) => void; big?: boolean }) {
  const cls = cn('shrink-0', big ? 'size-9' : 'size-7');
  if (pinned)
    return (
      <Tip content="A saved version: view only. Pick Current to edit.">
        <span className={cn(cls, 'flex items-center justify-center text-muted')} aria-label={`${label}: saved version, view only`} data-testid={`compare-edit-${label.toLowerCase()}`} data-state="pinned">
          <Lock className="size-3.5" />
        </span>
      </Tip>
    );
  return (
    <Tip content={viewOnly ? 'View only. Click to edit this side.' : 'Editing. Click to just look (view only).'}>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn(cls, !viewOnly && 'text-accent')}
        onClick={() => onViewOnly(!viewOnly)}
        aria-label={viewOnly ? `${label}: view only` : `${label}: editing`}
        aria-pressed={!viewOnly}
        data-testid={`compare-edit-${label.toLowerCase()}`}
        data-state={viewOnly ? 'view' : 'edit'}
      >
        {viewOnly ? <Eye className="size-3.5" /> : <Pencil className="size-3.5" />}
      </Button>
    </Tip>
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
  const Lf = useSideFiles(left);
  const Rf = useSideFiles(right);
  // A side can be set to view only, to look at one document while writing another.
  const [viewOnly, setViewOnly] = useState({ left: false, right: false });
  const L = { ...Lf, editable: Lf.editable && !viewOnly.left };
  const R = { ...Rf, editable: Rf.editable && !viewOnly.right };
  const [asVariant, setAsVariant] = useState<'left' | 'right'>();
  const leftDoc = docs?.find((d) => d.id === left?.docId);
  const rightDoc = docs?.find((d) => d.id === right?.docId);
  const [layout, setLayout] = useState<Layout>('split');
  const [direction, setDirection] = useState<'a-to-b' | 'b-to-a'>('a-to-b');
  const [showBlocks, setShowBlocks] = useState(true);
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [path, setPath] = useState<string>();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingWrites = useRef<Record<string, () => Promise<void>>>({});
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
    pendingWrites.current[docId] = () => repo.writeWorkText(docId, p, text);
    timers.current[docId] = setTimeout(() => {
      delete pendingWrites.current[docId];
      void repo.writeWorkText(docId, p, text);
    }, 300);
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
    if (!target || target.commitId || !(to === 'left' ? L : R).editable) {
      toast.error(target && !target.commitId ? 'That side is view only. Click its eye icon to edit it.' : 'That side is a saved version. Switch it to Current to change it.');
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

  /** Let a pending (debounced) edit land before saving. */
  const flushSide = async (s: SideRef) => {
    clearTimeout(timers.current[s.docId]);
    const w = pendingWrites.current[s.docId];
    delete pendingWrites.current[s.docId];
    if (w) await w();
  };
  const save = async (which: ('left' | 'right')[]) => {
    let n = 0;
    const seen = new Set<string>();
    for (const k of which) {
      const s = k === 'left' ? left : right;
      if (!s || s.commitId || seen.has(s.docId)) continue;
      seen.add(s.docId);
      await flushSide(s);
      if (await repo.commitWork(s.docId, 'Saved from compare view', 'save')) n++;
    }
    toast[n ? 'success' : 'info'](n ? `Saved ${n} version${n === 1 ? '' : 's'}` : 'No changes to save');
  };
  const saveAsVariant = async (k: 'left' | 'right', name: string) => {
    const s = k === 'left' ? left : right;
    if (!s || s.commitId) return;
    await flushSide(s);
    try {
      const v = await saveWorkAsVariant(repo, s.docId, name);
      setSide(k, { docId: v.id });
      toast.success(`Saved your edits as the variant “${v.name}”. The original is back to its last version.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  if (!docs) return <div className="flex h-full items-center justify-center"><Spinner /></div>;

  const sameDocBothEditable = left && right && left.docId === right.docId && !left.commitId && !right.commitId;
  const revert = direction === 'a-to-b' ? (R.editable && !sameDocBothEditable ? 'a-to-b' : undefined) : L.editable && !sameDocBothEditable ? 'b-to-a' : undefined;

  const unified = pl === 'single' && phone;
  const sideName = (k: 'left' | 'right') => {
    const d = k === 'left' ? leftDoc : rightDoc;
    const s = k === 'left' ? left : right;
    return d ? `${d.name}${s?.commitId ? ' · saved version' : ''}` : '';
  };
  /** Above the two columns: their names, and between them (over the arrows) which way the arrows copy. */
  const diffHeader = !unified && left && right && (
    <div className="grid h-8 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-line bg-subtle/60 px-2 text-xs text-muted" data-testid="compare-diff-header">
      <span className="truncate">{sideName('left')}</span>
      <Tip content={revert ? 'The arrows between the columns copy a change this way. Click to flip.' : 'The side the arrows would copy to is view only. Click to flip.'}>
        <button
          onClick={() => setDirection(direction === 'a-to-b' ? 'b-to-a' : 'a-to-b')}
          className={cn('flex h-6 items-center gap-1 rounded-md border border-line bg-panel px-2 font-medium text-fg hover:bg-subtle', !revert && 'opacity-60')}
          aria-label={direction === 'a-to-b' ? 'Arrows copy left to right' : 'Arrows copy right to left'}
          data-testid="compare-direction"
        >
          {direction === 'a-to-b' ? (
            <>
              Copy <ArrowRight className="size-3.5" />
            </>
          ) : (
            <>
              <ArrowL className="size-3.5" /> Copy
            </>
          )}
        </button>
      </Tip>
      <span className="truncate text-right">{sideName('right')}</span>
    </div>
  );

  const textPane = (
    <div className="flex h-full min-h-0 flex-col">
      {diffHeader}
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
          unified={unified}
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

  // Save: every side with changes, one side only, or one side's edits as a new variant.
  const current = (k: 'left' | 'right') => {
    const s = k === 'left' ? left : right;
    return !!s && !s.commitId && !(k === 'right' && left && right && left.docId === right.docId);
  };
  const changed = (k: 'left' | 'right') => current(k) && (k === 'left' ? Lf : Rf).dirty;
  const bothChanged = changed('left') && changed('right');
  const saveLabel = bothChanged ? 'Save both' : 'Save';
  const saveActions = (withAll: boolean) => [
    ...(withAll ? [{ key: 'all', label: bothChanged ? 'Save both' : 'Save changes', icon: <Save className="size-4" />, disabled: !current('left') && !current('right'), run: () => void save(['left', 'right']), testId: 'compare-save-all' }] : []),
    ...(['left', 'right'] as const)
      .filter(current)
      .map((k, i) => ({
        key: `only-${k}`,
        label: `Save only “${(k === 'left' ? leftDoc : rightDoc)?.name}”`,
        hint: changed(k) ? k : 'no changes',
        separatorBefore: withAll && i === 0,
        disabled: !changed(k),
        run: () => void save([k]),
        testId: `compare-save-${k}`,
      })),
    ...(['left', 'right'] as const)
      .filter(current)
      .map((k, i) => ({
        key: `variant-${k}`,
        label: `Save “${(k === 'left' ? leftDoc : rightDoc)?.name}” edits as a new variant…`,
        icon: <GitBranchPlus className="size-4" />,
        separatorBefore: i === 0,
        groupLabel: i === 0 ? 'Keep the original as it was' : undefined,
        disabled: !changed(k),
        run: () => setAsVariant(k),
        testId: `compare-variant-${k}`,
      })),
  ];
  const saveButton = (
    <div className="flex shrink-0">
      <Button variant="primary" size="sm" className="rounded-r-none" onClick={() => void save(['left', 'right'])} disabled={!current('left') && !current('right')} data-testid="compare-save">
        <Save className="size-3.5" /> {saveLabel}
      </Button>
      <ActionDropdown
        label="Save"
        actions={saveActions(false)}
        trigger={
          <Button variant="primary" size="sm" className="rounded-l-none border-l border-white/25 px-1.5" aria-label="More ways to save" data-testid="compare-save-menu">
            <ChevronDown className="size-3.5" />
          </Button>
        }
      />
    </div>
  );
  const variantSide = asVariant === 'left' ? leftDoc : asVariant === 'right' ? rightDoc : undefined;
  const variantDialog = (
    <SaveAsVariantDialog
      key={asVariant}
      original={variantSide?.name}
      onClose={() => setAsVariant(undefined)}
      onSave={(name) => {
        const k = asVariant!;
        setAsVariant(undefined);
        void saveAsVariant(k, name);
      }}
    />
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
              { key: 'swap', label: 'Swap sides', icon: <ArrowLeftRight className="size-4" />, separatorBefore: true, disabled: !left || !right, run: swapSides },
            ]}
            trigger={
              <Button variant="ghost" size="icon" aria-label="Compare options" data-testid="compare-options">
                <SlidersHorizontal className="size-4" />
              </Button>
            }
          />
          <ActionDropdown
            label="Save"
            actions={saveActions(true)}
            trigger={
              <Button variant="primary" size={phone ? 'icon' : 'sm'} aria-label="Save" data-testid="compare-save-menu">
                <Save className={phone ? 'size-4' : 'size-3.5'} />
                {phone ? null : <> {saveLabel} <ChevronDown className="size-3.5" /></>}
              </Button>
            }
          />
        </header>
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 border-b border-line bg-panel px-2 pt-1.5 pb-2">
          <SidePicker docs={docs} value={left} other={right} onChange={(s) => setSide('left', s)} label="Left" viewOnly={viewOnly.left} onViewOnly={(v) => setViewOnly((o) => ({ ...o, left: v }))} fit="stacked" />
          <div className="pt-4">{swapButton}</div>
          <SidePicker docs={docs} value={right} other={left} onChange={(s) => setSide('right', s)} label="Right" viewOnly={viewOnly.right} onViewOnly={(v) => setViewOnly((o) => ({ ...o, right: v }))} fit="stacked" />
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
        {variantDialog}
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
          <SidePicker docs={docs} value={left} other={right} onChange={(s) => setSide('left', s)} label="Left" viewOnly={viewOnly.left} onViewOnly={(v) => setViewOnly((o) => ({ ...o, left: v }))} />
          {swapButton}
          <SidePicker docs={docs} value={right} other={left} onChange={(s) => setSide('right', s)} label="Right" viewOnly={viewOnly.right} onViewOnly={(v) => setViewOnly((o) => ({ ...o, right: v }))} />
          <div className="flex-1" />
          {fileSelect}
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
              <SidePicker docs={docs} value={left} other={right} onChange={(s) => setSide('left', s)} label="Left" viewOnly={viewOnly.left} onViewOnly={(v) => setViewOnly((o) => ({ ...o, left: v }))} fit="shrink" />
              {swapButton}
              <SidePicker docs={docs} value={right} other={left} onChange={(s) => setSide('right', s)} label="Right" viewOnly={viewOnly.right} onViewOnly={(v) => setViewOnly((o) => ({ ...o, right: v }))} fit="shrink" />
            </div>
            {saveButton}
          </div>
          <div className="flex h-10 items-center gap-2 border-t border-line px-2">
            {layoutSwitch}
            {fileSelect}
            {onlyChangesToggle}
            <div className="flex-1" />
            <Button variant={showBlocks ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowBlocks(!showBlocks)}>
              <Blocks className="size-3.5" /> Blocks
            </Button>
          </div>
        </header>
      )}
      {sameDocNote}
      {variantDialog}
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

/** Name the variant that takes a side's unsaved edits. */
function SaveAsVariantDialog({ original, onClose, onSave }: { original?: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(original ? `${original} (variant)` : '');
  return (
    <Dialog
      open={!!original}
      onOpenChange={(o) => !o && onClose()}
      title="Save edits as a new variant"
      description={`Your unsaved edits go into a new variant of “${original}”, which goes back to its last saved version.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => onSave(name.trim())} data-testid="compare-variant-create">
            <GitBranchPlus className="size-4" /> Create variant
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <label className="text-sm font-medium" htmlFor="variant-name">
          Name
        </label>
        <Input id="variant-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full" data-testid="compare-variant-name" />
        <p className="mt-2 text-xs text-muted">It stays linked: Get updates brings in later changes to the original.</p>
      </form>
    </Dialog>
  );
}
