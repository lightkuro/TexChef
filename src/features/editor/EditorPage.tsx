import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Group, Panel, Separator } from 'react-resizable-panels';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { EditorView } from '@codemirror/view';
import { repo, useBehind, useDoc, useWork, usePreview } from '@/app/repo';
import { isTexPath, type Engine } from '@/core/model';
import type { FileMap } from '@/core/repo';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { FileTree } from './FileTree';
import { BlocksPanel } from './BlocksPanel';
import { HistoryPanel } from '@/features/history/HistoryPanel';
import { PdfViewer } from '@/features/preview/PdfViewer';
import { ProblemsPanel } from '@/features/preview/ProblemsPanel';
import { isUpToDate, useAutoCompile, useEngineStatus } from '@/features/compile/useCompile';
import { downloadPdf, downloadProjectZip, downloadText } from '@/features/importexport/io';
import { Badge, Button, EmptyState, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Select, Spinner, Tip } from '@/components/ui';
import { EngineBanner } from '@/features/compile/EngineBanner';
import { SyncIndicator } from '@/features/sync/SyncIndicator';
import { cn, docColor, formatBytes } from '@/lib/utils';
import { usePrefs } from '@/app/prefs';
import { ColorDialog } from '@/features/dashboard/ColorDialog';
import { decodeSynctex, parseSynctex, pdfToSource, sourceToPdf, type SyncData, type SyncRect } from '@/compile/synctex';
import { usePdfEdit } from '@/features/pdfedit/usePdfEdit';
import type { SourceChange } from '@/pdfedit/applyEdit';
import { applyTextToOriginal } from '@/variants/ops';

type SideTab = 'files' | 'blocks' | 'history';

export function EditorPage() {
  const { id } = useParams();
  const doc = useDoc(id);
  const work = useWork(id);
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
  const [pdfEditing, setPdfEditing] = useState(false);

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
    auto: autoCompile && !pdfEditing,
    savePreviewAs: id,
  });
  const pdf = entry?.output?.pdf ?? preview?.pdf;
  const pages = entry?.pages ?? preview?.pages;
  const synctexBytes = entry?.output?.pdf ? entry.output.synctex : undefined;
  const [sync, setSync] = useState<SyncData | null>(null);
  const [highlights, setHighlights] = useState<SyncRect[]>();

  useEffect(() => {
    let cancelled = false;
    if (!synctexBytes) {
      setSync(null);
      return;
    }
    void decodeSynctex(synctexBytes)
      .then((t) => !cancelled && setSync(parseSynctex(t)))
      .catch(() => !cancelled && setSync(null));
    return () => {
      cancelled = true;
    };
  }, [synctexBytes]);

  const locateInPdf = useCallback(() => {
    if (!sync || !path) {
      toast.info('Compile once to enable jumping between source and PDF.');
      return;
    }
    const rects = sourceToPdf(sync, path, cursorLine ?? 1);
    if (rects.length) setHighlights(rects);
    else toast.info('This line does not produce output in the PDF.');
  }, [sync, path, cursorLine]);

  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(async () => {
    clearTimeout(writeTimer.current);
    if (!id) return;
    const entries = [...pending.current.entries()];
    for (const [p, t] of entries) {
      await repo.writeWorkText(id, p, t);
      if (pending.current.get(p) === t) pending.current.delete(p);
    }
  }, [id]);

  const onChange = (value: string) => {
    if (!path) return;
    pending.current.set(path, value);
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
    void compileNow();
  }, [compileNow, flush]);

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

  const showInSource = useCallback((p: string, from: number, to: number) => {
    const switching = p !== pathRef.current;
    if (switching) setActivePath(p);
    setTimeout(() => editor.current?.select(from, to), switching ? 60 : 0);
  }, []);

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
    onExit: () => stopPdfEditing(),
  });

  const startPdfEditing = () => {
    setPdfEditing(true);
    // Edit on a PDF that matches the text: catch up first if a compile is due.
    if (id && doc && !isUpToDate(id, files, doc.mainFile, doc.engine) && !entry?.running) void compile();
  };

  const stopPdfEditing = () => {
    setPdfEditing(false);
    // With auto-compile on, the PDF catches up by itself once editing ends.
    if (pdfEdit.pendingCount > 0 && !autoCompile) void compile();
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
  if (!doc || !work) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }

  const output = entry?.output;
  const diagnostics = (output?.diagnostics ?? []).filter((d) => (d.file ?? doc.mainFile) === path);

  return (
    <div className="flex h-full flex-col" data-testid="editor-page">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <Tip content="All documents">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to documents">
            <ArrowLeft className="size-4" />
          </Button>
        </Tip>
        <Tip content="Document color">
          <button
            className="size-3 shrink-0 rounded-full ring-offset-2 ring-offset-panel hover:ring-2 hover:ring-line"
            style={{ background: docColor(doc.id, doc.color) }}
            onClick={() => setColoring(true)}
            aria-label="Document color"
          />
        </Tip>
        {coloring && <ColorDialog doc={doc} open={coloring} onOpenChange={setColoring} />}
        <input
          className="h-8 min-w-24 rounded-md bg-transparent px-1.5 text-sm font-semibold hover:bg-subtle focus:bg-subtle focus:outline-none"
          defaultValue={doc.name}
          key={doc.name}
          aria-label="Document name"
          size={Math.max(8, doc.name.length)}
          onBlur={(e) => e.target.value.trim() && e.target.value !== doc.name && repo.updateDoc(doc.id, { name: e.target.value.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {work.dirty ? (
          <Badge tone="warn">Unsaved changes</Badge>
        ) : (
          <Badge tone="neutral">Saved</Badge>
        )}
        {parent && (
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
        <div className="flex-1" />
        <SyncIndicator />
        <Tip content="LaTeX engine">
          <Select value={doc.engine} onChange={(e) => repo.updateDoc(doc.id, { engine: e.target.value as Engine })} aria-label="Engine" className="h-8 text-xs">
            <option value="pdflatex">pdfLaTeX</option>
            <option value="xelatex">XeLaTeX</option>
            <option value="lualatex">LuaLaTeX</option>
          </Select>
        </Tip>
        <Tip content={autoCompile ? 'Auto-compile is on' : 'Auto-compile is off'}>
          <Button variant="ghost" size="icon" onClick={() => setPref({ autoCompile: !autoCompile })} aria-label="Toggle auto-compile">
            {autoCompile ? <Zap className="size-4 text-accent" /> : <ZapOff className="size-4 text-muted" />}
          </Button>
        </Tip>
        <Tip content={<>Compile (Ctrl/⌘ + Enter)</>}>
          <Button variant="outline" onClick={compile} disabled={entry?.running} data-testid="compile-button">
            {entry?.running ? <Spinner /> : <Play className="size-3.5" />} Compile
          </Button>
        </Tip>
        <Tip content={<>Save a version (Ctrl/⌘ + S)</>}>
          <Button variant="outline" onClick={saveVersion} data-testid="save-version">
            <Save className="size-3.5" /> Save version
          </Button>
        </Tip>
        <Button variant="primary" onClick={async () => (await flush(), navigate(`/doc/${doc.id}/new-variant`))} data-testid="new-variant">
          <GitBranch className="size-3.5" /> New variant
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More">
              <ChevronDown className="size-4" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => navigate('/help')}>
              <CircleHelp className="size-4" /> Help and guides
            </MenuItem>
            <MenuItem onSelect={() => navigate(`/compare?left=${doc.id}${parent ? `&right=${parent.id}` : ''}`)}>
              <GitCompare className="size-4" /> Compare side by side…
            </MenuItem>
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
      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel defaultSize="20%" minSize="160px" className="flex flex-col bg-panel">
          <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-line px-1">
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
                )}
                data-testid={`tab-${k}`}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {side === 'files' && <FileTree doc={doc} work={work} active={path ?? ''} onOpen={setActivePath} />}
            {side === 'blocks' && path?.endsWith('.tex') && (
              <BlocksPanel
                doc={doc}
                parent={parent}
                path={path}
                text={text}
                cursorLine={cursorLine}
                onGoto={(l) => editor.current?.goto(l)}
                onReplaceText={(t) => editor.current?.replaceAll(t)}
                onInsert={(s) => editor.current?.insertAtCursor(s)}
              />
            )}
            {side === 'blocks' && !path?.endsWith('.tex') && <EmptyState title="Open a .tex file to see its blocks" />}
            {side === 'history' && <HistoryPanel doc={doc} dirty={work.dirty || pending.current.size > 0} />}
          </div>
        </Panel>
        <Separator />
        <Panel defaultSize="42%" minSize="240px" className="flex flex-col">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 text-xs text-muted">
            <span className="font-mono text-fg">{path}</span>
            {path === doc.mainFile && <span>main file</span>}
          </div>
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
              />
            ) : null}
          </div>
        </Panel>
        <Separator />
        <Panel defaultSize="38%" minSize="220px" className="flex flex-col">
          <PdfViewer
            pdf={pdf}
            running={entry?.running}
            pages={pages}
            highlights={highlights}
            pageOverlay={pdfEditing ? pdfEdit.renderPage : undefined}
            banner={
              pdfEditing ? (
                <div className="flex shrink-0 items-center gap-2 border-b border-line bg-accent-soft px-3 py-1.5 text-xs" data-testid="pdf-edit-banner">
                  <PencilLine className="size-3.5 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    {!pdf ? (
                      'Compile once to see the PDF, then click any text in it to change it.'
                    ) : pdfEdit.pendingCount > 0 ? (
                      <>
                        <b>
                          {pdfEdit.pendingCount} change{pdfEdit.pendingCount === 1 ? '' : 's'}
                        </b>{' '}
                        not in the PDF yet.
                      </>
                    ) : (
                      'Click any text in the PDF to change it.'
                    )}
                  </span>
                  {pdfEdit.pendingCount > 0 && (
                    <Button size="sm" variant="primary" className="h-6" onClick={compile} disabled={entry?.running} data-testid="pdf-edit-update">
                      {entry?.running ? <Spinner /> : <Play className="size-3" />} Update PDF
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-6" onClick={stopPdfEditing} data-testid="pdf-edit-done">
                    Done
                  </Button>
                </div>
              ) : null
            }
            onSyncClick={pdfEditing ? undefined : ({ page, x, y }) => {
              if (!sync) {
                toast.info('Compile once to enable jumping from the PDF to the source.');
                return;
              }
              const hit = pdfToSource(sync, page, x, y);
              if (!hit || !work.files[hit.file]) return;
              if (hit.file !== path) setActivePath(hit.file);
              setTimeout(() => editor.current?.goto(hit.line), hit.file !== path ? 60 : 0);
            }}
            actions={
              <>
              <Tip content={pdfEditing ? 'Stop editing on the PDF' : 'Click text in the PDF to change it'}>
                <Button
                  size="sm"
                  variant={pdfEditing ? 'primary' : 'ghost'}
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => (pdfEditing ? stopPdfEditing() : startPdfEditing())}
                  aria-pressed={pdfEditing}
                  data-testid="pdf-edit-toggle"
                >
                  <PencilLine className="size-3.5" /> Edit text
                </Button>
              </Tip>
              <Tip content="Show the cursor's line in the PDF (double-click the PDF to jump back to the source)">
                <Button size="icon-sm" variant="ghost" onClick={locateInPdf} aria-label="Locate in PDF" data-testid="locate-in-pdf">
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
            onJump={(d) => {
              if (d.file && d.file !== path && work.files[d.file]) setActivePath(d.file);
              if (d.line) setTimeout(() => editor.current?.goto(d.line!), 30);
            }}
          />
        </Panel>
      </Group>
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
