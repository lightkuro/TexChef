import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Plus,
  Upload,
  Network,
  List,
  GitCommitHorizontal,
  Download,
  CloudDownload,
  Search,
  Settings,
  Archive,
  CircleHelp,
  PanelLeft,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Eye,
  Scan,
  ArrowUp,
  Pencil,
  Trash2,
  ChevronDown,
  Files,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useDocs } from '@/app/repo';
import { usePrefs } from '@/app/prefs';
import { createDocumentFromProject, planImport, type ImportPlan } from '@/features/importexport/io';
import { RestoreDialog } from '@/features/workspace/RestoreDialog';
import type { RestorePlan } from '@/features/workspace/backup';
import { exportActions, previewActions } from '@/features/workspace/actions';
import { PreviewProgress } from '@/features/workspace/PreviewButton';
import { BundleImportDialog } from '@/features/importexport/BundleImportDialog';
import { askResetPositions, FamilyGraph } from '@/features/graph/FamilyGraph';
import { VersionGraph } from '@/features/graph/VersionGraph';
import { DocList } from './DocList';
import { NewDocDialog } from './NewDocDialog';
import { Landing } from './Landing';
import { SyncIndicator } from '@/features/sync/SyncIndicator';
import { connectDrive, useSync } from '@/features/sync/controller';
import { pickFromDrive, pickerConfigured } from '@/features/sync/picker';
import { Button, Input, Spinner, Tip } from '@/components/ui';
import { KurolightMark, Logo } from '@/components/Logo';
import { ThemeMenu } from '@/components/ThemeMenu';
import { cn } from '@/lib/utils';
import { FolderSidebar, UNFILED } from '@/features/folders/FolderSidebar';
import { moveDocsToFolder, moveFolderInto, useEmptyFolders } from '@/features/folders/folders';
import { folderName, inFolder, parentFolder } from '@/features/folders/folderTree';
import { folderView, type FolderItem } from '@/features/folders/folderView';
import { FolderBar } from '@/features/folders/FolderBar';
import { FolderDialogHost, folderActions, openFolderDialog } from '@/features/folders/folderDialogs';
import { ActionContextMenu, ActionDropdown, type MenuAction } from '@/components/ActionMenu';
import { HoverMenu, HoverMenuItem } from '@/components/HoverMenu';
import type { MapApi } from '@/features/graph/FamilyGraph';

export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    // `relative`: the phone search bar (HeaderSearch) opens over the whole header row.
    <header className="relative flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-4 sm:gap-3">
      <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
        <Logo size={28} />
        texChef
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <SyncIndicator />
      <ThemeMenu />
      <Tip content="Help and guides">
        <Link to="/help" aria-label="Help" className="inline-flex size-8 items-center justify-center rounded-md hover:bg-subtle" data-testid="help-link">
          <CircleHelp className="size-4" />
        </Link>
      </Tip>
      <Tip content="Settings">
        <Link to="/settings" aria-label="Settings" className="inline-flex size-8 items-center justify-center rounded-md hover:bg-subtle">
          <Settings className="size-4" />
        </Link>
      </Tip>
    </header>
  );
}

export function Dashboard() {
  const docs = useDocs();
  const [newOpen, setNewOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bundle, setBundle] = useState<ImportPlan | null>(null);
  const [restore, setRestore] = useState<RestorePlan | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const mapDirection = usePrefs((s) => s.mapDirection);
  const mapFullPages = usePrefs((s) => s.mapFullPages);
  const mapSnap = usePrefs((s) => s.mapSnap);
  const mapLines = usePrefs((s) => s.mapLines);
  const view = usePrefs((s) => s.dashboardView);
  const graphMode = usePrefs((s) => s.graphMode);
  const showAutosaves = usePrefs((s) => s.showAutosaves);
  const showArchived = usePrefs((s) => s.showArchived);
  const showFolders = usePrefs((s) => s.showFolders);
  const savedFolder = usePrefs((s) => s.currentFolder);
  const folderMode = usePrefs((s) => s.folderMode);
  const mapApi = useRef<MapApi | null>(null);
  const emptyFolders = useEmptyFolders((s) => s.list);
  const setPref = usePrefs((s) => s.set);
  const upload = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const sync = useSync();

  const archivedCount = docs?.filter((d) => d.archived).length ?? 0;
  const shown = useMemo(() => (docs ?? []).filter((d) => showArchived || !d.archived), [docs, showArchived]);
  // The open folder, if it still exists (it may have been renamed or removed on another device).
  const current =
    savedFolder !== null && savedFolder !== UNFILED && ((docs ?? []).some((d) => inFolder(d.folder, savedFolder)) || emptyFolders.some((p) => inFolder(p, savedFolder)))
      ? savedFolder
      : null;
  const targetFolder = current ?? undefined;
  const openFolder = (f: string | null) => setPref({ currentFolder: f });
  /** Every document inside the open folder (any depth). */
  const scopeDocs = useMemo(() => shown.filter((d) => (current === null ? true : inFolder(d.folder, current))), [shown, current]);
  const q = query.trim().toLowerCase();
  const fv = useMemo(() => {
    if (!q) return folderView(shown, emptyFolders, targetFolder, folderMode);
    // Searching looks through everything inside the open folder, grouped by folder.
    const match = scopeDocs.filter((d) => d.name.toLowerCase().includes(q) || d.tags.some((t) => t.includes(q)) || d.recipe?.tags.some((t) => t.includes(q)));
    return folderView(match, [], targetFolder, 'grouped');
  }, [shown, emptyFolders, targetFolder, folderMode, q, scopeDocs]);
  const mode = q ? 'grouped' : folderMode;
  const isEmpty = fv.docs.length === 0 && fv.folders.length === 0;

  /** Every document in a folder (archived ones too: exports and previews cover them). */
  const docsIn = (path: string | null) => (docs ?? []).filter((d) => !d.deleted && (path ? inFolder(d.folder, path) : true));
  const withSeparator = (list: MenuAction[]) => list.map((a, i) => (i === 0 ? { ...a, separatorBefore: true } : a));
  const actionsForFolder = (path: string): MenuAction[] => {
    const base = folderActions(path, openFolder);
    const del = base.pop()!;
    return [
      ...base,
      ...withSeparator(previewActions(docsIn(path))),
      { key: 'export', label: 'Export', icon: <Download className="size-4" />, sub: exportActions(docsIn(path), path) },
      del,
    ];
  };
  const folderActionsFor = (item: FolderItem): MenuAction[] => actionsForFolder(item.path);
  const scopeAll = docsIn(current);

  /** Right-click on empty space in the map or the list. */
  const backgroundActions = (): MenuAction[] => {
    const familyMap = view === 'graph' && graphMode === 'family';
    return [
      { key: 'new-doc', label: 'New document…', icon: <Plus className="size-4" />, run: () => setNewOpen(true) },
      { key: 'new-folder', label: 'New folder…', icon: <FolderPlus className="size-4" />, run: () => openFolderDialog({ kind: 'new', parent: current ?? undefined }) },
      {
        key: 'import',
        label: 'Import',
        icon: <Upload className="size-4" />,
        separatorBefore: true,
        sub: [
          { key: 'upload', label: 'Upload files or a .zip…', icon: <Upload className="size-4" />, run: () => upload.current?.click() },
          { key: 'upload-folder', label: 'Upload a folder…', icon: <FolderUp className="size-4" />, run: () => folderInput.current?.click() },
          ...(pickerConfigured ? [{ key: 'drive', label: 'From Google Drive…', icon: <CloudDownload className="size-4" />, run: () => void importFromDrive() }] : []),
        ],
      },
      ...withSeparator(previewActions(scopeAll)),
      { key: 'export', label: current ? 'Export this folder' : 'Export everything', icon: <Download className="size-4" />, sub: exportActions(scopeAll, current, docsIn(null)) },
      {
        key: 'view',
        label: 'View',
        icon: <Eye className="size-4" />,
        separatorBefore: true,
        sub: [
          { key: 'map', label: 'Map', checked: view === 'graph' && graphMode === 'family', run: () => setPref({ dashboardView: 'graph', graphMode: 'family' }) },
          { key: 'versions', label: 'Versions map', checked: view === 'graph' && graphMode === 'versions', run: () => setPref({ dashboardView: 'graph', graphMode: 'versions' }) },
          { key: 'list', label: 'List', checked: view === 'list', run: () => setPref({ dashboardView: 'list' }) },
          { key: 'grouped', label: 'Expanded', hint: 'subfolders open', separatorBefore: true, checked: folderMode === 'grouped', run: () => setPref({ folderMode: 'grouped' }) },
          { key: 'browse', label: 'Folders', hint: 'subfolders as folders', checked: folderMode === 'browse', run: () => setPref({ folderMode: 'browse' }) },
          { key: 'archived', label: 'Show archived', separatorBefore: true, checked: showArchived, run: () => setPref({ showArchived: !showArchived }) },
          { key: 'panel', label: 'Folders panel', checked: showFolders, run: () => setPref({ showFolders: !showFolders }) },
        ],
      },
      ...(familyMap
        ? [
            { key: 'fit', label: 'Fit to screen', icon: <Scan className="size-4" />, run: () => mapApi.current?.fitView() },
            {
              key: 'layout',
              label: 'Map layout',
              icon: <Network className="size-4" />,
              sub: [
                { key: 'lr', label: 'Left to right', checked: mapDirection === 'horizontal', run: () => setPref({ mapDirection: 'horizontal' }) },
                { key: 'td', label: 'Top down', checked: mapDirection === 'vertical', run: () => setPref({ mapDirection: 'vertical' }) },
                { key: 'full', label: 'Full-page previews', separatorBefore: true, checked: mapFullPages, run: () => setPref({ mapFullPages: !mapFullPages }) },
                { key: 'snap', label: 'Snap to grid', checked: mapSnap, disabled: mode === 'grouped', run: () => setPref({ mapSnap: !mapSnap }) },
                { key: 'lines', label: 'Right-angled lines', checked: mapLines === 'angled', run: () => setPref({ mapLines: mapLines === 'angled' ? 'straight' : 'angled' }) },
                {
                  key: 'reset',
                  label: 'Reset card positions…',
                  separatorBefore: true,
                  disabled: mode === 'grouped',
                  run: () => void askResetPositions(mapDirection).then((ok) => ok && setTimeout(() => mapApi.current?.fitView(), 100)),
                },
              ],
            },
          ]
        : []),
      ...(current
        ? [
            { key: 'up', label: 'Up one folder', icon: <ArrowUp className="size-4" />, separatorBefore: true, run: () => openFolder(parentFolder(current) ?? null) },
            { key: 'rename', label: 'Rename this folder…', icon: <Pencil className="size-4" />, run: () => openFolderDialog({ kind: 'rename', path: current }) },
            { key: 'delete', label: 'Delete this folder…', icon: <Trash2 className="size-4" />, danger: true, run: () => openFolderDialog({ kind: 'delete', path: current }) },
          ]
        : []),
    ];
  };
  const moveDoc = async (id: string, folder: string) => {
    await moveDocsToFolder([id], folder);
    toast.success(`Moved to “${folderName(folder)}”`);
  };
  const moveFolder = async (path: string, into: string) => {
    const r = await moveFolderInto(path, into);
    if ('error' in r) toast.error(r.error);
    else toast.success(`Moved “${folderName(path)}” into “${folderName(into)}”`);
  };

  const importFromDrive = async () => {
    try {
      if (sync.state === 'local' || sync.state === 'needs-signin') await connectDrive();
      const files = await pickFromDrive();
      if (files.length) await importFiles(files);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const importFiles = async (files: File[] | FileList) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const plan = await planImport(files);
      if (plan.backup) {
        setRestore(plan.backup);
        return;
      }
      if (!plan.projects.length) throw new Error('Nothing to import in this upload');
      // Several documents in one upload (e.g. a Prism export): let the user pick.
      if (plan.projects.length > 1) {
        setBundle(plan);
        return;
      }
      const doc = await createDocumentFromProject(plan.projects[0], targetFolder);
      toast.success(`Imported “${doc.name}”`);
      navigate(`/doc/${doc.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void importFiles(e.dataTransfer.files);
      }}
      data-testid="dashboard"
    >
      <AppHeader>
        <HeaderSearch value={query} onChange={setQuery} />
      </AppHeader>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2">
        <Tip content={showFolders ? 'Hide folders' : 'Show folders'}>
          <Button variant="ghost" size="icon" onClick={() => setPref({ showFolders: !showFolders })} aria-label="Folders" aria-pressed={showFolders} data-testid="toggle-folders">
            <PanelLeft className="size-4" />
          </Button>
        </Tip>
        <Button variant="primary" onClick={() => setNewOpen(true)} data-testid="new-doc">
          <Plus className="size-4" /> New document
        </Button>
        <ActionDropdown
          align="start"
          label="Import"
          actions={[
            { key: 'files', label: 'Upload files or a .zip…', hint: '.tex .zip images', icon: <Upload className="size-4" />, run: () => upload.current?.click(), testId: 'import-files' },
            { key: 'folder', label: 'Upload a folder…', hint: 'projects or a backup', icon: <FolderUp className="size-4" />, run: () => folderInput.current?.click(), testId: 'import-folder' },
            ...(pickerConfigured
              ? [
                  {
                    key: 'drive',
                    label: 'From Google Drive…',
                    hint: sync.state === 'local' ? 'connects Drive' : undefined,
                    icon: <CloudDownload className="size-4" />,
                    separatorBefore: true,
                    run: () => void importFromDrive(),
                    testId: 'import-drive',
                  },
                ]
              : []),
          ]}
          trigger={
            <Button variant="outline" disabled={busy} data-testid="import-menu">
              {busy ? <Spinner /> : <Upload className="size-4" />} Import <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          }
        />
        <input ref={upload} type="file" multiple hidden accept=".tex,.zip,.cls,.sty,.bib,.png,.jpg,.jpeg,.pdf,.ttf,.otf" data-testid="upload-input" onChange={(e) => e.target.files && importFiles(e.target.files).then(() => (e.target.value = ''))} />
        <input
          ref={folderInput}
          type="file"
          multiple
          hidden
          {...{ webkitdirectory: '' }}
          data-testid="upload-folder-input"
          onChange={(e) => e.target.files && importFiles(e.target.files).then(() => (e.target.value = ''))}
        />
        <ActionDropdown
          align="start"
          label={current ? `Export “${folderName(current)}”` : 'Export everything'}
          actions={exportActions(scopeAll, current, docsIn(null))}
          trigger={
            <Button variant="ghost" data-testid="export-menu">
              <Download className="size-4" /> Export <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          }
        />
        <div className="flex-1" />
        {archivedCount > 0 && (
          <Button variant={showArchived ? 'secondary' : 'ghost'} size="sm" onClick={() => setPref({ showArchived: !showArchived })} data-testid="toggle-archived">
            <Archive className="size-3.5" /> {showArchived ? 'Hide' : 'Show'} archived ({archivedCount})
          </Button>
        )}
        {view === 'graph' && graphMode === 'versions' && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={showAutosaves} onChange={(e) => setPref({ showAutosaves: e.target.checked })} /> Show autosaves
          </label>
        )}
        {view === 'graph' && <GraphModeSwitch />}
        <ViewSwitch />
      </div>
      <div className="flex min-h-0 flex-1">
      {showFolders && docs && docs.length > 0 && <FolderSidebar docs={shown} current={current} onSelect={openFolder} actionsFor={actionsForFolder} />}
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {docs && docs.length > 0 && (view !== 'graph' || graphMode === 'family') && (
          <FolderBar current={current} onSelect={openFolder} mode={mode} onMode={(m) => setPref({ folderMode: m })} extra={<PreviewProgress />} />
        )}
        <ActionContextMenu actions={backgroundActions} label={current ? folderName(current) : 'All documents'}>
        <div className="relative min-h-0 flex-1 overflow-auto" data-testid="dashboard-content">
        {docs === undefined ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : docs.length === 0 ? (
          <Landing onNew={() => setNewOpen(true)} onImport={() => upload.current?.click()} />
        ) : isEmpty && (view !== 'graph' || graphMode === 'family') ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted" data-testid="empty-folder">
            <FolderOpen className="size-8 opacity-50" />
            <p className="font-medium text-fg">{q ? 'Nothing matches your search here' : current ? `“${folderName(current)}” is empty` : 'No documents here'}</p>
            {!q && (
              <p className="max-w-sm">
                Move documents here with <b>⋯ → Move to folder</b>, drag them onto the folder, or create a new one: it goes into the open folder.
              </p>
            )}
          </div>
        ) : view === 'list' ? (
          <DocList view={fv} mode={mode} showFolder={mode === 'browse' ? false : !!q} onOpenFolder={openFolder} folderActionsFor={folderActionsFor} />
        ) : graphMode === 'family' ? (
          <FamilyGraph
            view={fv}
            mode={mode}
            scopeDocs={scopeDocs}
            scopeKey={`${current ?? ''}|${q}`}
            onOpenFolder={openFolder}
            onMoveToFolder={moveDoc}
            onMoveFolder={moveFolder}
            folderWrap={(item) => (children) => (
              <ActionContextMenu actions={folderActionsFor(item)} label={item.name}>
                {children}
              </ActionContextMenu>
            )}
            onApi={(api) => (mapApi.current = api)}
          />
        ) : (
          <VersionGraph docs={scopeDocs} showAutosaves={showAutosaves} />
        )}
        {bundle && (
          <BundleImportDialog
            plan={bundle}
            parentFolder={targetFolder}
            onClose={() => setBundle(null)}
            onImported={(f) => f && setPref({ currentFolder: f })}
          />
        )}
        {dragging && (
          <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80 text-lg font-medium text-accent">
            Drop .tex or .zip files to import
          </div>
        )}
        {restore && <RestoreDialog plan={restore} onClose={() => setRestore(null)} />}
        </div>
        </ActionContextMenu>
      </main>
      </div>
      <FolderDialogHost docs={shown} current={current} onSelect={openFolder} />
      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-panel px-4 text-[11px] text-muted">
        <span>texChef</span>
        <Link to="/privacy" className="hover:text-fg" data-testid="link-privacy">
          Privacy
        </Link>
        <Link to="/terms" className="hover:text-fg" data-testid="link-terms">
          Terms
        </Link>
        <Link to="/help" className="hover:text-fg">
          Help
        </Link>
        <span className="ml-auto hidden sm:inline">Runs in your browser · your files stay yours</span>
        <KurolightMark />
      </footer>
      <NewDocDialog open={newOpen} onOpenChange={setNewOpen} folder={targetFolder} />
    </div>
  );
}

/**
 * The search box. On phones it folds into an icon that opens a full-width search bar over the
 * header; the bar stays open while there is a query, and closing it clears the query.
 */
function HeaderSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  const close = () => {
    onChange('');
    setOpen(false);
  };
  return (
    <>
      <div className="relative ml-4 hidden w-full max-w-xs sm:block">
        <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted" />
        <Input className="pl-8" placeholder="Search documents and tags" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      <Tip content="Search documents and tags">
        <Button variant="ghost" size="icon" className="ml-auto sm:hidden" onClick={() => setOpen(true)} aria-label="Search documents and tags" data-testid="search-toggle">
          <Search className="size-4" />
        </Button>
      </Tip>
      {(open || value !== '') && (
        <div className="absolute inset-0 z-20 flex items-center gap-2 bg-panel px-4 sm:hidden" data-testid="search-bar">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted" />
            {/* 16px text: iOS zooms the page when focusing smaller text. */}
            <Input
              ref={input}
              className="pl-8 text-base"
              placeholder="Search documents and tags"
              aria-label="Search documents and tags"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && close()}
            />
          </div>
          <Button variant="ghost" size="icon" onClick={close} aria-label="Close search" data-testid="search-close">
            <X className="size-4" />
          </Button>
        </div>
      )}
    </>
  );
}

/** Map or List. */
function ViewSwitch() {
  const view = usePrefs((s) => s.dashboardView);
  const setPref = usePrefs((s) => s.set);
  const tab = (on: boolean) => cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium', on ? 'bg-panel shadow-sm' : 'text-muted hover:text-fg');
  return (
    <div className="inline-flex rounded-lg bg-subtle p-0.5">
      <button onClick={() => setPref({ dashboardView: 'graph' })} className={tab(view === 'graph')} aria-pressed={view === 'graph'} data-testid="view-graph">
        <Network className="size-3.5" /> Map
      </button>
      <button onClick={() => setPref({ dashboardView: 'list' })} className={tab(view === 'list')} aria-pressed={view === 'list'} data-testid="view-list">
        <List className="size-3.5" /> List
      </button>
    </div>
  );
}

/** What the map shows: documents (default) or their versions. Hover (or tap) to choose. */
function GraphModeSwitch() {
  const graphMode = usePrefs((s) => s.graphMode);
  const setPref = usePrefs((s) => s.set);
  const versions = graphMode === 'versions';
  const Icon = versions ? GitCommitHorizontal : Files;
  return (
    <HoverMenu
      label="Map shows"
      testId="graph-mode-menu"
      trigger={(open, setOpen) => (
        <button
          onClick={() => setOpen(true)}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted hover:bg-subtle hover:text-fg"
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid="graph-mode"
        >
          <Icon className="size-3.5" /> {versions ? 'Versions' : 'Documents'}
          <ChevronDown className={cn('size-3 opacity-50 transition-transform', open && 'rotate-180')} />
        </button>
      )}
    >
      {(close) => (
        <>
          <HoverMenuItem
            icon={<Files className="size-3.5" />}
            label="Documents"
            hint="Originals and their variants, with folders"
            checked={!versions}
            onSelect={() => (setPref({ graphMode: 'family' }), close())}
            testId="graph-family"
          />
          <HoverMenuItem
            icon={<GitCommitHorizontal className="size-3.5" />}
            label="Versions"
            hint="Every saved version of each document, over time"
            checked={versions}
            onSelect={() => (setPref({ graphMode: 'versions' }), close())}
            testId="graph-versions"
          />
        </>
      )}
    </HoverMenu>
  );
}
