import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Group, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels';
import { CollapsiblePanel, layoutStorage } from '@/components/CollapsiblePanel';
import { useAgentsDialog } from '@/features/agents/agents';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileArchive,
  FileText,
  Files,
  GitBranch,
  GitCompare,
  GitPullRequestArrow,
  History,
  Blocks,
  Play,
  LocateFixed,
  CircleHelp,
  PencilLine,
  Save,
  Zap,
  ZapOff,
  PanelLeft,
  Bot,
  Code2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { EditorView } from '@codemirror/view';
import { repo, useBehind, useDoc, useWorkState, usePreview } from '@/app/repo';
import { isTexPath, type Engine } from '@/core/model';
import type { FileMap } from '@/core/repo';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { FileTree } from './FileTree';
import { FormatBar } from './FormatBar';
import { FileTabs, FormatToggle } from './FileTabs';
import { BlocksPanel } from './BlocksPanel';
import { HistoryPanel } from '@/features/history/HistoryPanel';
import { PdfViewer } from '@/features/preview/PdfViewer';
import { ProblemsPanel } from '@/features/preview/ProblemsPanel';
import { isUpToDate, useAutoCompile, useEngineStatus } from '@/features/compile/useCompile';
import { downloadPdf, downloadProjectZip, downloadText } from '@/features/importexport/io';
import { Badge, Button, Drawer, DrawerClose, EmptyState, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Spinner, Tip } from '@/components/ui';
import { BREAKPOINTS, readSession, usePaneLayout, usePhone, writeSession } from '@/lib/useMediaQuery';
import { EngineBanner } from '@/features/compile/EngineBanner';
import { HoverMenu, HoverMenuItem, HoverMenuSeparator } from '@/components/HoverMenu';
import { engineName } from '@/compile/engineAdvice';
import { SyncIndicator } from '@/features/sync/SyncIndicator';
import { cn, docColor, formatBytes } from '@/lib/utils';
import { dirname } from '@/lib/paths';
import { usePrefs } from '@/app/prefs';
import { setUnsaved } from '@/app/unsaved';
import { ColorDialog } from '@/features/dashboard/ColorDialog';
import { decodeSynctex, parseSynctex, pdfToSource, sourceToPdf, type SyncData, type SyncRect } from '@/compile/synctex';
import { sourceLineKey } from '@/pdfedit/locate';
import { usePdfEdit } from '@/features/pdfedit/usePdfEdit';
import type { SourceChange } from '@/pdfedit/applyEdit';
import { applyTextToOriginal } from '@/variants/ops';

type SideTab = 'files' | 'blocks' | 'history';
type Pane = 'code' | 'pdf';

const PANE_KEY = 'rc-editor-pane';
const SIDE_KEY = 'rc-editor-side';

export function EditorPage() {
  const { id } = useParams();
  const doc = useDoc(id);
  const { work, error: workError, retry: retryWork } = useWorkState(id);
  const parent = useDoc(doc?.parent?.docId);
  const behind = useBehind(doc ?? undefined);
  const navigate = useNavigate();
  const editor = useRef<CodeEditorHandle>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [side, setSide] = useState<SideTab>('blocks');
  const [cursorLine, setCursorLine] = useState<number>();
  const [coloring, setColoring] = useState(false);
  const autoCompile = usePrefs((s) => s.autoCompile);
  const setPref = usePrefs((s) => s.set);
  const engine = useEngineStatus();
  const pending = useRef(new Map<string, string>());
  const [, force] = useState(0);
  const preview = usePreview(id);
  const pdfEditing = usePrefs((s) => s.pdfEditMode);
  // Set while an edit box is open on the PDF, or edits wait for "Update PDF": auto-compile holds off.
  const [editHold, setEditHold] = useState(false);

  // Layout by window width: three panes (wide), code + PDF with a side panel that folds away
  // (split), or one pane at a time with the side panel in a drawer (single).
  const agentsEnabled = usePrefs((s) => s.agentsEnabled);
  const openAgents = useAgentsDialog((s) => s.set);
  const layout = usePaneLayout();
  const phone = usePhone();
  const [pane, setPaneState] = useState<Pane>(() => readSession(PANE_KEY, ['code', 'pdf'], 'code'));
  const setPane = useCallback((p: Pane) => {
    setPaneState(p);
    writeSession(PANE_KEY, p);
  }, []);
  const [sideOpen, setSideOpenState] = useState(
    () => readSession(SIDE_KEY, ['open', 'closed'], window.innerWidth >= BREAKPOINTS.side ? 'open' : 'closed') === 'open',
  );
  const setSideOpen = (open: boolean) => {
    setSideOpenState(open);
    writeSession(SIDE_KEY, open ? 'open' : 'closed');
  };
  const [drawer, setDrawer] = useState(false);
  // Desktop: panels fold into rails (drag an edge onto the next one, or the header button).
  const sideRef = usePanelRef();
  const [sideFolded, setSideFolded] = useState(false);
  const wideLayout = useDefaultLayout({ id: 'editor-wide', storage: layoutStorage });
  const splitLayout = useDefaultLayout({ id: 'editor-split', storage: layoutStorage });
  const single = layout === 'single';
  useEffect(() => {
    if (!single) setDrawer(false);
  }, [single]);
  const singleRef = useRef(single);
  singleRef.current = single;
  /** One pane at a time: show the code (after a jump to a line from the PDF, a problem or a block). */
  const revealCode = useCallback(() => {
    if (!singleRef.current) return;
    setDrawer(false);
    setPane('code');
  }, [setPane]);

  const path = activePath && work?.files[activePath] ? activePath : doc?.mainFile ?? null;
  const pathRef = useRef(path);
  pathRef.current = path;
  const file = path && work ? work.files[path] : undefined;
  const text = path ? pending.current.get(path) ?? (file?.kind === 'text' ? file.text : '') : '';

  // Files for compilation = working copy + edits not yet persisted.
  const files: FileMap | undefined = useMemo(() => {
    if (!work) return undefined;
    const out = { ...work.files };
    for (const [p, t] of pending.current) out[p] = { kind: 'text', text: t };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work]);

  const { entry, compileNow } = useAutoCompile({
    key: id ?? '',
    files,
    mainFile: doc?.mainFile,
    engine: doc?.engine,
    // While editing on the PDF, keep the page still: the PDF updates when the user asks.
    auto: autoCompile && !editHold,
    savePreviewAs: id,
  });
  const pdf = entry?.output?.pdf ?? preview?.pdf;
  const pages = entry?.pages ?? preview?.pages;
  const synctexBytes = entry?.output?.pdf ? entry.output.synctex : undefined;
  const [sync, setSync] = useState<SyncData | null>(null);
  const followCursor = usePrefs((s) => s.followCursor);
  const editorVisual = usePrefs((s) => s.editorVisual);
  const showFormatBar = usePrefs((s) => s.showFormatBar);
  const pdfEditAutoUpdate = usePrefs((s) => s.pdfEditAutoUpdate);
  const [cursorRects, setCursorRects] = useState<SyncRect[]>();
  /** The letters the cursor's line prints, to trim SyncTeX's boxes to its words. */
  const [cursorKey, setCursorKey] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!synctexBytes) {
      setSync(null);
      return;
    }
    void decodeSynctex(synctexBytes)
      .then((t) => !cancelled && setSync(parseSynctex(t, dirname(doc?.mainFile ?? ''))))
      .catch(() => !cancelled && setSync(null));
    return () => {
      cancelled = true;
    };
  }, [synctexBytes, doc?.mainFile]);

  // Keep the cursor's line highlighted in the PDF (lines that print nothing, like the preamble, show nothing).
  useEffect(() => {
    if (!followCursor || !sync || !path || cursorLine === undefined) {
      setCursorRects(undefined);
      return;
    }
    const t = setTimeout(() => {
      setCursorRects(sourceToPdf(sync, path, cursorLine, 3));
      setCursorKey(sourceLineKey(text, cursorLine));
    }, 120);
    return () => clearTimeout(t);
  }, [followCursor, sync, path, cursorLine, text]);

  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(async () => {
    clearTimeout(writeTimer.current);
    if (!id) return;
    const entries = [...pending.current.entries()];
    for (const [p, t] of entries) {
      await repo.writeWorkText(id, p, t);
      if (pending.current.get(p) === t) pending.current.delete(p);
    }
    if (!pending.current.size) setUnsaved('editor-typing', null);
  }, [id]);

  const onChange = (value: string) => {
    if (!path) return;
    pending.current.set(path, value);
    // Stored a moment later; until then, closing the tab would lose the last keystrokes.
    setUnsaved('editor-typing', { message: 'Your last edits are still being stored.', when: 'close' });
    clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => void flush(), 300);
  };

  useEffect(() => () => void flush(), [flush]);

  const saveVersion = useCallback(async () => {
    if (!id) return;
    await flush();
    const c = await repo.commitWork(id, 'Saved version', 'save');
    if (c) toast.success('Version saved');
    else toast.info('No changes since the last version');
  }, [flush, id]);

  const compile = useCallback(async () => {
    await flush();
    force((n) => n + 1);
    // Read the files back after saving: the last render may not have seen the newest text yet.
    void compileNow(id ? (await repo.getWork(id)).files : undefined);
  }, [compileNow, flush, id]);

  // ---- Edit on the PDF --------------------------------------------------------------------
  const readSources = useCallback(async () => {
    await flush();
    const out: Record<string, string> = {};
    if (!id) return out;
    const w = await repo.getWork(id);
    for (const [p, f] of Object.entries(w.files)) if (f.kind === 'text' && isTexPath(p)) out[p] = f.text;
    const view = editor.current?.view();
    const active = pathRef.current;
    if (view && active && out[active] !== undefined) out[active] = view.state.doc.toString();
    return out;
  }, [flush, id]);

  const writeChange = useCallback(
    async (p: string, change: SourceChange, oldText: string) => {
      if (!id) return;
      const view = p === pathRef.current ? editor.current?.view() : null;
      if (view && view.state.doc.toString() === oldText) {
        // Through the code editor, so Ctrl/⌘+Z there undoes it too.
        view.dispatch({ changes: change, effects: EditorView.scrollIntoView(change.from, { y: 'center' }) });
        await flush();
      } else {
        await flush();
        await repo.writeWorkText(id, p, oldText.slice(0, change.from) + change.insert + oldText.slice(change.to));
      }
    },
    [flush, id],
  );

  const showInSource = useCallback(
    (p: string, from: number, to: number) => {
      const switching = p !== pathRef.current;
      if (switching) setActivePath(p);
      revealCode();
      setTimeout(() => editor.current?.select(from, to), switching ? 60 : 0);
    },
    [revealCode],
  );

  const pdfEdit = usePdfEdit({
    enabled: pdfEditing,
    pdf,
    upToDate: !!id && !!doc && !!files && isUpToDate(id, files, doc.mainFile, doc.engine),
    sync,
    readSources,
    writeChange,
    showInSource,
    original: parent
      ? {
          id: parent.id,
          name: parent.name,
          readText: async (p) => {
            const f = (await repo.getWork(parent.id)).files[p];
            return f?.kind === 'text' ? f.text : undefined;
          },
        }
      : undefined,
    applyToOriginal: async (p, variantText, at, oldText, newText) =>
      !!id && (await applyTextToOriginal(repo, id, p, variantText, at, oldText, newText)).ok,
    revertOriginal: async (p, oldText, newText) => {
      if (!parent) return;
      const f = (await repo.getWork(parent.id)).files[p];
      if (f?.kind !== 'text') return;
      const i = f.text.indexOf(newText);
      if (i < 0 || f.text.indexOf(newText, i + 1) >= 0) return;
      await repo.writeWorkText(parent.id, p, f.text.slice(0, i) + oldText + f.text.slice(i + newText.length));
    },
    autoUpdate: pdfEditAutoUpdate,
    onAutoUpdateChange: (on) => {
      setPref({ pdfEditAutoUpdate: on });
      if (on && pdfEdit.pendingCount > 0) void compile();
    },
    onSaved: () => {
      if (pdfEditAutoUpdate) void compile();
    },
  });

  useEffect(() => {
    setEditHold(pdfEditing && (pdfEdit.boxOpen || (pdfEdit.pendingCount > 0 && !pdfEditAutoUpdate)));
  }, [pdfEditing, pdfEdit.boxOpen, pdfEdit.pendingCount, pdfEditAutoUpdate]);

  const startPdfEditing = () => {
    setPref({ pdfEditMode: true });
    // Edit on a PDF that matches the text: catch up first if a compile is due.
    if (id && doc && !isUpToDate(id, files, doc.mainFile, doc.engine) && !entry?.running) void compile();
  };

  const stopPdfEditing = () => {
    setPref({ pdfEditMode: false });
    // With auto-compile on, the PDF catches up by itself once editing ends.
    if (pdfEdit.pendingCount > 0 && !autoCompile) void compile();
  };

  const jumpToSource = ({ page, x, y }: { page: number; x: number; y: number }) => {
    if (!sync) {
      toast.info('Compile once to enable jumping from the PDF to the source.');
      return;
    }
    const hit = pdfToSource(sync, page, x, y);
    if (!hit || !work?.files[hit.file]) return;
    if (hit.file !== path) setActivePath(hit.file);
    revealCode();
    setTimeout(() => editor.current?.goto(hit.line), hit.file !== path ? 60 : 0);
  };

  if (doc === null) {
    return (
      <EmptyState title="Document not found">
        <Link to="/" className="text-accent underline">
          Back to all documents
        </Link>
      </EmptyState>
    );
  }
  if (doc === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted" data-testid="doc-missing">
        <p className="font-medium text-fg">This document isn’t on this device.</p>
        <p>It may have been deleted, or it hasn’t synced here yet.</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          Back to all documents
        </Button>
      </div>
    );
  }
  if (!doc || !work) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted" data-testid="doc-loading">
        {workError ? (
          <>
            <p className="font-medium text-fg">Couldn’t open “{doc?.name}” yet</p>
            <p className="max-w-sm">
              {workError} Its files come from your Google Drive; make sure Drive is connected (top right), then try again.
            </p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={retryWork} data-testid="doc-retry">
                Try again
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                Back
              </Button>
            </div>
          </>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }

  const output = entry?.output;
  const diagnostics = (output?.diagnostics ?? []).filter((d) => (d.file ?? doc.mainFile) === path);
  const wide = layout === 'wide';
  const errorCount = (output?.diagnostics ?? []).filter((d) => d.severity === 'error').length;
  const newVariant = async () => (await flush(), navigate(`/doc/${doc.id}/new-variant`));
  const openFile = (p: string) => {
    setActivePath(p);
    revealCode();
  };

  /** Blocks / Files / History tabs; `touch` = in the drawer on small screens (bigger, with a close button). */
  const sideTabs = (touch: boolean) => (
    <div className={cn('flex h-9 shrink-0 items-center gap-0.5 border-b border-line px-1', touch && 'h-12 gap-1 px-2')}>
      {(
        [
          ['blocks', Blocks, 'Blocks'],
          ['files', Files, 'Files'],
          ['history', History, 'History'],
        ] as const
      ).map(([k, Icon, label]) => (
        <button
          key={k}
          onClick={() => setSide(k)}
          className={cn(
            'flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-xs font-medium',
            side === k ? 'bg-subtle text-fg' : 'text-muted hover:text-fg',
            touch && 'h-9 gap-1.5 text-sm',
          )}
          data-testid={`tab-${k}`}
        >
          <Icon className={cn('size-3.5', touch && 'size-4')} /> {label}
        </button>
      ))}
      {touch && <DrawerClose className="ml-1" />}
    </div>
  );

  const sideBody = (
    <div className="min-h-0 flex-1">
      {side === 'files' && <FileTree doc={doc} work={work} active={path ?? ''} onOpen={openFile} />}
      {side === 'blocks' && path?.endsWith('.tex') && (
        <BlocksPanel
          doc={doc}
          parent={parent}
          path={path}
          text={text}
          cursorLine={cursorLine}
          onGoto={(l) => {
            revealCode();
            editor.current?.goto(l);
          }}
          onReplaceText={(t) => editor.current?.replaceAll(t)}
          onInsert={(s) => {
            revealCode();
            editor.current?.insertAtCursor(s);
          }}
        />
      )}
      {side === 'blocks' && !path?.endsWith('.tex') && <EmptyState title="Open a .tex file to see its blocks" />}
      {side === 'history' && <HistoryPanel doc={doc} dirty={work.dirty || pending.current.size > 0} />}
    </div>
  );

  const codePane = (
    <>
      {path && (
        <FileTabs
          docId={doc.id}
          files={Object.keys(work.files).sort()}
          mainFile={doc.mainFile}
          active={path}
          onOpen={setActivePath}
          right={
            file?.kind !== 'binary' && (
              <FormatToggle on={showFormatBar} visual={editorVisual && /\.(tex|ltx)$/i.test(path)} onToggle={() => setPref({ showFormatBar: !showFormatBar })} />
            )
          }
        />
      )}
      {file?.kind !== 'binary' && path && showFormatBar && (
        <FormatBar
          view={() => editor.current?.view() ?? null}
          visual={editorVisual}
          onVisual={(v) => setPref({ editorVisual: v })}
          isTex={/\.(tex|ltx)$/i.test(path)}
          engine={doc.engine}
        />
      )}
      <div className="min-h-0 flex-1">
        {file?.kind === 'binary' ? (
          <BinaryPreview hash={file.hash} path={path!} size={file.size} />
        ) : path ? (
          <CodeEditor
            ref={editor}
            path={path}
            value={text}
            onChange={onChange}
            diagnostics={diagnostics}
            onSave={saveVersion}
            onCompile={compile}
            onCursorLine={setCursorLine}
            visual={editorVisual}
          />
        ) : null}
      </div>
    </>
  );

  const pdfPane = (
    <>
      <PdfViewer
        pdf={pdf}
        running={entry?.running}
        pages={pages}
        compact={phone}
        autoCompact={!wide}
        cursorRects={cursorRects}
        cursorKey={cursorKey}
        pageOverlay={pdfEditing ? pdfEdit.renderPage : undefined}
        banner={
          pdfEditing && pdf && pdfEdit.pendingCount > 0 && !pdfEditAutoUpdate ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-line bg-accent-soft px-3 py-1.5 text-xs" data-testid="pdf-edit-banner">
              <PencilLine className="size-3.5 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <b>
                  {pdfEdit.pendingCount} change{pdfEdit.pendingCount === 1 ? '' : 's'}
                </b>{' '}
                not in the PDF yet.
              </span>
              <Button size="sm" variant="primary" className="h-6" onClick={compile} disabled={entry?.running} data-testid="pdf-edit-update">
                {entry?.running ? <Spinner /> : <Play className="size-3" />} Update PDF
              </Button>
            </div>
          ) : null
        }
        onSyncClick={(p) => {
          // In edit mode the first click of a double-click opens the edit box: close it and jump instead.
          if (pdfEditing) pdfEdit.close();
          jumpToSource(p);
        }}
        actions={
          <>
          <Tip content={pdfEditing ? 'On: click text in the PDF to change it. Click to turn off.' : 'Click text in the PDF to change it'}>
            <Button
              size="sm"
              variant="ghost"
              className={cn('h-7 gap-1 px-2 text-xs', pdfEditing && 'bg-accent-soft text-accent hover:bg-accent-soft')}
              onClick={() => (pdfEditing ? stopPdfEditing() : startPdfEditing())}
              aria-pressed={pdfEditing}
              data-testid="pdf-edit-toggle"
            >
              <PencilLine className="size-3.5" />
              {phone ? ' Edit' : ' Edit text'}
            </Button>
          </Tip>
          <Tip
            content={
              followCursor
                ? 'Showing the cursor’s line in the PDF. Click to turn off. (Double-click the PDF to jump to the source.)'
                : 'Show the cursor’s line in the PDF'
            }
          >
            <Button
              size="icon-sm"
              variant="ghost"
              className={cn(followCursor && 'bg-accent-soft text-accent hover:bg-accent-soft')}
              onClick={() => setPref({ followCursor: !followCursor })}
              aria-label="Show cursor line in PDF"
              aria-pressed={followCursor}
              data-testid="locate-in-pdf"
            >
              <LocateFixed className="size-3.5" />
            </Button>
          </Tip>
          </>
        }
        onDownload={() => pdf && downloadPdf(doc.name, pdf)}
        emptyMessage={output && !output.ok ? 'Compilation failed — see problems below.' : 'Compile to see the PDF'}
      />
      <ProblemsPanel
        output={output}
        onSwitchEngine={(engine) => {
          void repo.updateDoc(doc.id, { engine });
          toast.success(`Switched to ${engineName(engine)}`, { description: 'Compiling again with it. The engine menu above the PDF changes it back.' });
        }}
        onJump={(d) => {
          if (d.file && d.file !== path && work.files[d.file]) setActivePath(d.file);
          revealCode();
          if (d.line) setTimeout(() => editor.current?.goto(d.line!), 30);
        }}
      />
    </>
  );

  return (
    <div className="flex h-full flex-col" data-testid="editor-page">
      <header className={cn('flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2', phone && 'gap-1 px-1.5')}>
        <Tip content="All documents">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to documents">
            <ArrowLeft className="size-4" />
          </Button>
        </Tip>
        {layout !== 'single' && (
          <Tip content={(layout === 'wide' ? !sideFolded : sideOpen) ? 'Hide the side panel' : 'Show blocks, files and history'}>
            <Button
              variant="ghost"
              size="icon"
              className={cn((layout === 'wide' ? !sideFolded : sideOpen) && 'bg-subtle')}
              onClick={() => {
                if (layout !== 'wide') return setSideOpen(!sideOpen);
                if (sideRef.current?.isCollapsed()) sideRef.current.expand();
                else sideRef.current?.collapse();
              }}
              aria-label="Side panel"
              aria-pressed={layout === 'wide' ? !sideFolded : sideOpen}
              data-testid="toggle-side"
            >
              <PanelLeft className="size-4" />
            </Button>
          </Tip>
        )}
        <Tip content="Document color">
          <button
            // Below the desktop layout the dot gets a finger-sized hit area.
            className={cn(
              'size-3 shrink-0 rounded-full ring-offset-2 ring-offset-panel hover:ring-2 hover:ring-line',
              !wide && 'relative mx-1 before:absolute before:-inset-3',
            )}
            style={{ background: docColor(doc.id, doc.color) }}
            onClick={() => setColoring(true)}
            aria-label="Document color"
          />
        </Tip>
        {coloring && <ColorDialog doc={doc} open={coloring} onOpenChange={setColoring} />}
        <input
          className={cn(
            'h-8 min-w-24 rounded-md bg-transparent px-1.5 text-sm font-semibold hover:bg-subtle focus:bg-subtle focus:outline-none',
            // Narrower windows: the name gives way (and ends in …) before anything else does.
            !wide && 'min-w-16 shrink text-ellipsis',
            phone && 'h-9',
          )}
          defaultValue={doc.name}
          key={doc.name}
          aria-label="Document name"
          size={Math.max(8, doc.name.length)}
          onBlur={(e) => e.target.value.trim() && e.target.value !== doc.name && repo.updateDoc(doc.id, { name: e.target.value.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {single ? null : work.dirty ? (
          <Tip
            content={
              <span className="block max-w-72">
                Your edits are kept in this browser as you type. <b>Save version</b> (Ctrl/⌘ S) marks this point in History; an autosave
                version is also made after a minute without typing and when you leave the tab.
              </span>
            }
          >
            <span>
              <Badge tone="info" data-testid="save-state">
                Draft saved
              </Badge>
            </span>
          </Tip>
        ) : (
          <Tip content="Everything is saved as a version.">
            <span>
              <Badge tone="neutral" data-testid="save-state">
                Saved
              </Badge>
            </span>
          </Tip>
        )}
        {parent && wide && (
          <div className="ml-1 flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs">
            <GitBranch className="size-3.5 text-muted" />
            <span className="text-muted">variant of</span>
            <Link to={`/doc/${parent.id}`} className="max-w-40 truncate font-medium hover:underline">
              {parent.name}
            </Link>
            {behind ? (
              <Button size="sm" variant="primary" className="ml-1 h-6" onClick={() => navigate(`/doc/${doc.id}/pull`)} data-testid="pull-button">
                <GitPullRequestArrow className="size-3.5" /> Get {behind} update{behind === 1 ? '' : 's'}
              </Button>
            ) : (
              <span className="ml-1 text-ok">up to date</span>
            )}
          </div>
        )}
        {parent && !wide && !phone && (
          // Compact: the original's name, then the updates button or a check.
          <Tip content={`Variant of “${parent.name}”${behind ? '' : ', up to date'}`}>
            <div className="flex min-w-0 shrink items-center gap-1 rounded-md border border-line py-0.5 pr-0.5 pl-2 text-xs">
              <GitBranch className="size-3.5 shrink-0 text-muted" />
              <Link to={`/doc/${parent.id}`} className="max-w-36 min-w-0 truncate font-medium hover:underline">
                {parent.name}
              </Link>
              {behind ? (
                <Button
                  size="sm"
                  variant="primary"
                  className="ml-0.5 h-6 px-2"
                  onClick={() => navigate(`/doc/${doc.id}/pull`)}
                  aria-label={`Get ${behind} update${behind === 1 ? '' : 's'}`}
                  data-testid="pull-button"
                >
                  <GitPullRequestArrow className="size-3.5" /> {behind}
                </Button>
              ) : (
                <Check className="mr-1 size-3.5 shrink-0 text-ok" aria-label="Up to date" />
              )}
            </div>
          </Tip>
        )}
        {parent && phone && !!behind && (
          <Button
            size="sm"
            variant="primary"
            className="px-2"
            onClick={() => navigate(`/doc/${doc.id}/pull`)}
            aria-label={`Get ${behind} update${behind === 1 ? '' : 's'} from “${parent.name}”`}
            data-testid="pull-button"
          >
            <GitPullRequestArrow className="size-3.5" /> {behind}
          </Button>
        )}
        <div className="flex-1" />
        <SyncIndicator compact={!wide} />
        {wide ? (
          <>
            <Button variant="outline" onClick={newVariant} data-testid="new-variant">
              <GitBranch className="size-3.5" /> New variant
            </Button>
            <Tip content={<>Save a version (Ctrl/⌘ + S)</>}>
              <Button variant="outline" onClick={saveVersion} data-testid="save-version">
                <Save className="size-3.5" /> Save version
              </Button>
            </Tip>
          </>
        ) : (
          !phone && (
            <>
              <Tip content="New variant">
                <Button variant="outline" size="icon" onClick={newVariant} aria-label="New variant" data-testid="new-variant">
                  <GitBranch className="size-4" />
                </Button>
              </Tip>
              <Tip
                content={
                  single && work.dirty ? (
                    <span className="block max-w-64">Save a version (Ctrl/⌘ + S). Your edits since the last version are kept as a draft.</span>
                  ) : (
                    <>Save a version (Ctrl/⌘ + S)</>
                  )
                }
              >
                <Button
                  variant="outline"
                  size="icon"
                  className="relative"
                  onClick={saveVersion}
                  aria-label={single && work.dirty ? 'Save version (edits since the last version are a draft)' : 'Save version'}
                  data-testid="save-version"
                >
                  <Save className="size-4" />
                  {/* One pane at a time: the "Draft saved" badge gives way to a dot. */}
                  {single && work.dirty && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-panel bg-info" aria-hidden />}
                </Button>
              </Tip>
            </>
          )
        )}
        {/* Compile, with its settings (engine, auto-compile) and the PDF download in a menu on hover. */}
        <HoverMenu
          label="Compile settings"
          testId="compile-menu"
          menuClassName="w-64"
          trigger={(open, setOpen) => (
            <div className="flex items-stretch overflow-hidden rounded-md bg-accent text-accent-fg shadow-sm">
              <button
                onClick={compile}
                disabled={entry?.running}
                className={cn('flex h-9 items-center gap-1.5 px-3 text-sm font-medium hover:bg-black/10 disabled:opacity-70', phone && 'px-2.5')}
                title="Compile (Ctrl/⌘ + Enter)"
                aria-label={phone ? 'Compile' : undefined}
                data-testid="compile-button"
                data-engine={doc.engine}
              >
                {entry?.running ? <Spinner /> : autoCompile ? <Zap className="size-3.5" /> : <Play className="size-3.5" />}
                {phone ? null : ' Compile'}
                {!phone && doc.engine !== 'pdflatex' && <span className="text-[11px] font-normal opacity-80">· {engineName(doc.engine)}</span>}
              </button>
              <button
                onClick={() => setOpen(true)}
                className={cn('flex items-center border-l border-black/15 px-1.5 hover:bg-black/10', phone && 'px-2')}
                aria-label="Compile settings"
                aria-haspopup="menu"
                aria-expanded={open}
                data-testid="compile-settings"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </div>
          )}
        >
          {(close) => (
            <>
              <HoverMenuItem
                icon={autoCompile ? <Zap className="size-3.5" /> : <ZapOff className="size-3.5" />}
                label={autoCompile ? 'Auto-compile is on' : 'Auto-compile is off'}
                hint={autoCompile ? 'The PDF updates a moment after you stop typing' : 'Compile when you choose (Ctrl/⌘ Enter)'}
                onSelect={() => setPref({ autoCompile: !autoCompile })}
                testId="toggle-auto-compile"
              />
              <HoverMenuSeparator />
              <div className="px-2 pt-1 pb-0.5 text-[11px] font-medium tracking-wide text-muted uppercase">Engine</div>
              {(
                [
                  ['pdflatex', 'pdfLaTeX', 'Default. Fastest; most templates use it'],
                  ['xelatex', 'XeLaTeX', 'Your own fonts (fontspec, .ttf/.otf), any alphabet'],
                  ['lualatex', 'LuaLaTeX', 'Like XeLaTeX, plus Lua code'],
                ] as const
              ).map(([e, label, hint]) => (
                <HoverMenuItem
                  key={e}
                  label={
                    <>
                      {label}
                      {e === 'pdflatex' && <span className="ml-1.5 rounded bg-subtle px-1 text-[10px] font-normal text-muted">default</span>}
                    </>
                  }
                  hint={hint}
                  checked={doc.engine === e}
                  icon={<span className="size-3.5" />}
                  onSelect={() => {
                    void repo.updateDoc(doc.id, { engine: e as Engine });
                    close();
                  }}
                  testId={`engine-${e}`}
                />
              ))}
              <HoverMenuSeparator />
              <HoverMenuItem
                icon={<Download className="size-3.5" />}
                label="Download PDF"
                disabled={!pdf}
                onSelect={() => {
                  if (pdf) downloadPdf(doc.name, pdf);
                  close();
                }}
                testId="download-pdf"
              />
            </>
          )}
        </HoverMenu>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More">
              <ChevronDown className="size-4" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            {phone && (
              // On phones the header keeps only Compile: the rest lives here.
              <>
                <div className="px-2 pt-1 pb-1.5 text-xs text-muted" data-testid="save-state">
                  {work.dirty ? 'Draft saved in this browser' : 'Everything is saved as a version'}
                </div>
                <MenuItem onSelect={saveVersion}>
                  <Save className="size-4" /> Save version
                </MenuItem>
                <MenuItem onSelect={newVariant}>
                  <GitBranch className="size-4" /> New variant…
                </MenuItem>
                {parent && (
                  <MenuItem onSelect={() => navigate(`/doc/${parent.id}`)}>
                    <FileText className="size-4" /> <span className="min-w-0 truncate">Open the original, “{parent.name}”</span>
                  </MenuItem>
                )}
                <MenuSeparator />
              </>
            )}
            <MenuItem onSelect={() => navigate('/help')}>
              <CircleHelp className="size-4" /> Help and guides
            </MenuItem>
            <MenuItem onSelect={() => navigate(`/compare?left=${doc.id}${parent ? `&right=${parent.id}` : ''}`)}>
              <GitCompare className="size-4" /> Compare side by side…
            </MenuItem>
            {agentsEnabled && (
              <MenuItem onSelect={async () => (await flush(), openAgents(true))}>
                <Bot className="size-4" /> Replies from AI agents…
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem disabled={!pdf} onSelect={() => pdf && downloadPdf(doc.name, pdf)}>
              <Download className="size-4" /> Download PDF
            </MenuItem>
            <MenuItem onSelect={() => file?.kind === 'text' && path && downloadText(path.split('/').pop()!, text)}>
              <FileText className="size-4" /> Download {path}
            </MenuItem>
            <MenuItem onSelect={async () => (await flush(), downloadProjectZip(doc, (await repo.getWork(doc.id)).files, pdf))}>
              <FileArchive className="size-4" /> Download project (.zip)
            </MenuItem>
          </MenuContent>
        </Menu>
      </header>
      <EngineBanner status={engine} />
      {wide ? (
        <Group orientation="horizontal" className="min-h-0 flex-1" defaultLayout={wideLayout.defaultLayout} onLayoutChanged={wideLayout.onLayoutChanged}>
          <CollapsiblePanel
            id="side"
            label={side === 'files' ? 'Files' : side === 'history' ? 'History' : 'Blocks'}
            icon={PanelLeft}
            defaultSize="20%"
            minSize="160px"
            className="bg-panel"
            testId="side-panel"
            panelRef={sideRef}
            onCollapsedChange={setSideFolded}
          >
            {sideTabs(false)}
            {sideBody}
          </CollapsiblePanel>
          <Separator />
          <CollapsiblePanel id="code" label="Code" icon={Code2} defaultSize="42%" minSize="240px" testId="code-panel">
            {codePane}
          </CollapsiblePanel>
          <Separator />
          <CollapsiblePanel id="pdf" label="PDF" icon={FileText} defaultSize="38%" minSize="220px" testId="pdf-panel">
            {pdfPane}
          </CollapsiblePanel>
        </Group>
      ) : layout === 'split' ? (
        // Code and PDF side by side; the side panel folds away (header button).
        <div className="flex min-h-0 flex-1">
          {sideOpen && (
            <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel" data-testid="side-panel">
              {sideTabs(false)}
              {sideBody}
            </aside>
          )}
          <Group orientation="horizontal" className="min-h-0 min-w-0 flex-1" defaultLayout={splitLayout.defaultLayout} onLayoutChanged={splitLayout.onLayoutChanged}>
            <CollapsiblePanel id="code" label="Code" icon={Code2} defaultSize="52%" minSize="280px" testId="code-panel">
              {codePane}
            </CollapsiblePanel>
            <Separator />
            <CollapsiblePanel id="pdf" label="PDF" icon={FileText} defaultSize="48%" minSize="240px" testId="pdf-panel">
              {pdfPane}
            </CollapsiblePanel>
          </Group>
        </div>
      ) : (
        // One pane at a time. Both stay mounted (the hidden one invisible) so switching is instant.
        <div className="flex min-h-0 flex-1 flex-col bg-panel pb-[env(safe-area-inset-bottom)]">
          <PaneBar
            pane={pane}
            onPane={setPane}
            sideLabel={side === 'files' ? 'Files' : side === 'history' ? 'History' : 'Blocks'}
            onOpenSide={() => setDrawer(true)}
            drawerOpen={drawer}
            running={!!entry?.running}
            errors={errorCount}
            pages={pages}
          />
          <div className="relative min-h-0 flex-1">
            {(
              [
                ['code', 'Code', codePane],
                ['pdf', 'PDF', pdfPane],
              ] as const
            ).map(([k, label, content]) => (
              <section
                key={k}
                className={cn('absolute inset-0 flex flex-col', pane !== k && 'invisible')}
                inert={pane !== k}
                aria-label={label}
                data-testid={`pane-${k}`}
              >
                {content}
              </section>
            ))}
          </div>
          <Drawer open={drawer} onOpenChange={setDrawer} title="Blocks, files and history" testId="side-drawer">
            {sideTabs(true)}
            {sideBody}
          </Drawer>
        </div>
      )}
    </div>
  );
}

/** Small screens: switch between the code and the PDF, open the side panel, see how compiling went. */
function PaneBar({
  pane,
  onPane,
  sideLabel,
  onOpenSide,
  drawerOpen,
  running,
  errors,
  pages,
}: {
  pane: Pane;
  onPane: (p: Pane) => void;
  sideLabel: string;
  onOpenSide: () => void;
  drawerOpen: boolean;
  running: boolean;
  errors: number;
  pages?: number;
}) {
  const tab = (k: Pane, Icon: typeof Code2, label: string) => (
    <button
      role="tab"
      aria-selected={pane === k}
      onClick={() => onPane(k)}
      className={cn(
        'flex h-8 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors',
        pane === k ? 'bg-panel text-fg shadow-sm' : 'text-muted hover:text-fg',
      )}
      data-testid={`pane-tab-${k}`}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
  return (
    <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line bg-panel px-2" data-testid="pane-bar">
      <div className="flex min-w-0">
        <button
          onClick={onOpenSide}
          className="flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted hover:bg-subtle hover:text-fg"
          aria-label="Blocks, files and history"
          aria-expanded={drawerOpen}
          data-testid="open-side"
        >
          <PanelLeft className="size-4 shrink-0" />
          <span className="truncate max-sm:hidden">{sideLabel}</span>
        </button>
      </div>
      <div role="tablist" aria-label="Show" className="grid w-44 grid-cols-2 gap-0.5 rounded-lg bg-subtle p-0.5 sm:w-60">
        {tab('code', Code2, 'Code')}
        {tab('pdf', FileText, 'PDF')}
      </div>
      {/* How compiling went, while the PDF (whose toolbar says the same) is out of sight. */}
      <div className="flex min-w-0 items-center justify-end pr-1 text-xs tabular-nums" data-testid="pane-status">
        {pane === 'pdf' ? null : running ? (
          <span className="flex items-center gap-1.5 text-muted">
            <Spinner className="text-accent" />
            <span className="max-sm:sr-only">Compiling…</span>
          </span>
        ) : errors > 0 ? (
          <button className="flex h-9 items-center gap-1 rounded-md px-1.5 font-medium text-danger hover:bg-subtle" onClick={() => onPane('pdf')}>
            <AlertCircle className="size-3.5" /> {errors}
            <span className="max-sm:sr-only"> error{errors === 1 ? '' : 's'}</span>
          </button>
        ) : pages !== undefined ? (
          <span className={cn('truncate', pages > 1 ? 'text-muted' : 'text-ok')}>
            {pages} {pages === 1 ? 'page' : 'pages'}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function BinaryPreview({ hash, path, size }: { hash: string; path: string; size: number }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    void repo.getBlob(hash).then((data) => {
      if (!data || !/\.(png|jpe?g|gif|svg)$/i.test(path)) return;
      u = URL.createObjectURL(new Blob([data as BlobPart], { type: path.endsWith('.svg') ? 'image/svg+xml' : 'image/*' }));
      setUrl(u);
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [hash, path]);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-subtle p-6 text-sm text-muted">
      {url ? <img src={url} alt={path} className="max-h-[70%] max-w-full rounded shadow" /> : null}
      <div>
        {path} · {formatBytes(size)}
      </div>
    </div>
  );
}
