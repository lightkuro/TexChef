import { useMemo, useRef, useState } from 'react';
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
  FileText,
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
} from 'lucide-react';
import { toast } from 'sonner';
import { useDocs } from '@/app/repo';
import { usePrefs } from '@/app/prefs';
import { createDocumentFromProject, planImport, type ImportPlan } from '@/features/importexport/io';
import { RestoreDialog } from '@/features/workspace/RestoreDialog';
import type { RestorePlan } from '@/features/workspace/backup';
import { exportActions, previewActions } from '@/features/workspace/actions';
import { PreviewButton } from '@/features/workspace/PreviewButton';
import { useMapPositions } from '@/features/graph/positions';
import { BundleImportDialog } from '@/features/importexport/BundleImportDialog';
import { FamilyGraph } from '@/features/graph/FamilyGraph';
import { VersionGraph } from '@/features/graph/VersionGraph';
import { DocList } from './DocList';
import { NewDocDialog } from './NewDocDialog';
import { SyncIndicator } from '@/features/sync/SyncIndicator';
import { useSync } from '@/features/sync/controller';
import { pickFromDrive, pickerConfigured } from '@/features/sync/picker';
import { Button, Input, Spinner, Tip } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { ThemeMenu } from '@/components/ThemeMenu';
import { cn } from '@/lib/utils';
import { FolderSidebar, UNFILED } from '@/features/folders/FolderSidebar';
import { moveDocsToFolder, useEmptyFolders } from '@/features/folders/folders';
import { folderName, inFolder, parentFolder } from '@/features/folders/folderTree';
import { folderView, type FolderItem } from '@/features/folders/folderView';
import { FolderBar } from '@/features/folders/FolderBar';
import { FolderDialogHost, folderActions, openFolderDialog } from '@/features/folders/folderDialogs';
import { ActionContextMenu, ActionDropdown, type MenuAction } from '@/components/ActionMenu';
import type { MapApi } from '@/features/graph/FamilyGraph';

export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
      <Link to="/" className="flex items-center gap-2 font-semibold">
        <Logo size={28} />
        texChef
      </Link>
      <div className="flex flex-1 items-center gap-2">{children}</div>
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
      { key: 'upload', label: 'Upload files or a .zip…', icon: <Upload className="size-4" />, separatorBefore: true, run: () => upload.current?.click() },
      { key: 'upload-folder', label: 'Upload a folder…', icon: <FolderUp className="size-4" />, run: () => folderInput.current?.click() },
      ...withSeparator(previewActions(scopeAll)),
      { key: 'export', label: current ? 'Export this folder' : 'Export everything', icon: <Download className="size-4" />, sub: exportActions(scopeAll, current) },
      {
        key: 'view',
        label: 'View',
        icon: <Eye className="size-4" />,
        separatorBefore: true,
        sub: [
          { key: 'map', label: 'Map', checked: view === 'graph', run: () => setPref({ dashboardView: 'graph' }) },
          { key: 'list', label: 'List', checked: view === 'list', run: () => setPref({ dashboardView: 'list' }) },
          { key: 'browse', label: 'Folders', separatorBefore: true, checked: folderMode === 'browse', run: () => setPref({ folderMode: 'browse' }) },
          { key: 'grouped', label: 'All, grouped by folder', checked: folderMode === 'grouped', run: () => setPref({ folderMode: 'grouped' }) },
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
                  label: 'Reset card positions',
                  separatorBefore: true,
                  run: () => {
                    useMapPositions.getState().reset(mapDirection);
                    setTimeout(() => mapApi.current?.fitView(), 100);
                  },
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
        <div className="relative ml-4 w-full max-w-xs">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted" />
          <Input className="pl-8" placeholder="Search documents and tags" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
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
          actions={[
            { key: 'files', label: 'Files or a .zip…', hint: '.tex .zip images', icon: <Upload className="size-4" />, run: () => upload.current?.click() },
            { key: 'folder', label: 'A folder…', hint: 'projects or a backup', icon: <FolderUp className="size-4" />, run: () => folderInput.current?.click() },
          ]}
          trigger={
            <Button variant="outline" disabled={busy} data-testid="upload-menu">
              {busy ? <Spinner /> : <Upload className="size-4" />} Upload <ChevronDown className="size-3.5 opacity-60" />
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
        {sync.state !== 'local' && pickerConfigured && (
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const files = await pickFromDrive();
                if (files.length) await importFiles(files);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            <CloudDownload className="size-4" /> Import from Drive
          </Button>
        )}
        <ActionDropdown
          align="start"
          label={current ? `Export “${folderName(current)}”` : 'Export everything'}
          actions={[
            ...exportActions(scopeAll, current),
            ...(current ? [{ key: 'everything', label: 'Everything', icon: <Download className="size-4" />, separatorBefore: true, sub: exportActions(docsIn(null), null) }] : []),
          ]}
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
        {view === 'graph' && (
          <div className="flex items-center gap-2">
            {graphMode === 'versions' && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={showAutosaves} onChange={(e) => setPref({ showAutosaves: e.target.checked })} /> Show autosaves
              </label>
            )}
            <div className="inline-flex rounded-lg bg-subtle p-0.5">
              {(
                [
                  ['family', Network, 'Documents'],
                  ['versions', GitCommitHorizontal, 'Versions'],
                ] as const
              ).map(([k, Icon, label]) => (
                <button
                  key={k}
                  onClick={() => setPref({ graphMode: k })}
                  className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium', graphMode === k ? 'bg-panel shadow-sm' : 'text-muted')}
                  data-testid={`graph-${k}`}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="inline-flex rounded-lg bg-subtle p-0.5">
          {(
            [
              ['graph', Network, 'Map'],
              ['list', List, 'List'],
            ] as const
          ).map(([k, Icon, label]) => (
            <button
              key={k}
              onClick={() => setPref({ dashboardView: k })}
              className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium', view === k ? 'bg-panel shadow-sm' : 'text-muted')}
              data-testid={`view-${k}`}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
      {showFolders && docs && docs.length > 0 && <FolderSidebar docs={shown} current={current} onSelect={openFolder} actionsFor={actionsForFolder} />}
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {docs && docs.length > 0 && (view !== 'graph' || graphMode === 'family') && (
          <FolderBar current={current} onSelect={openFolder} mode={mode} onMode={(m) => setPref({ folderMode: m })} extra={<PreviewButton docs={scopeAll} />} />
        )}
        <ActionContextMenu actions={backgroundActions} label={current ? folderName(current) : 'All documents'}>
        <div className="relative min-h-0 flex-1 overflow-auto" data-testid="dashboard-content">
        {docs === undefined ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : docs.length === 0 ? (
          <Welcome onNew={() => setNewOpen(true)} onUpload={() => upload.current?.click()} />
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
        <span className="ml-auto">Runs in your browser · your files stay yours</span>
      </footer>
      <NewDocDialog open={newOpen} onOpenChange={setNewOpen} folder={targetFolder} />
    </div>
  );
}

function Welcome({ onNew, onUpload }: { onNew: () => void; onUpload: () => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <FileText className="size-7" />
      </div>
      <h1 className="text-2xl font-semibold">One master resume, many tailored versions</h1>
      <p className="mt-2 text-muted">
        Write everything once in a master resume, then branch focused variants for each role by picking sections, jobs and bullets.
        Variants stay linked: pull master updates into them, or push a reworded bullet back up.
      </p>
      <div className="mt-6 flex gap-2">
        <Button variant="primary" onClick={onNew}>
          <Plus className="size-4" /> Start a master resume
        </Button>
        <Button variant="outline" onClick={onUpload}>
          <Upload className="size-4" /> Upload .tex or Overleaf .zip
        </Button>
      </div>
      <Link to="/help" className="mt-3 text-sm text-accent underline">
        New here? Read how texChef works
      </Link>
      <ol className="mt-10 grid w-full gap-3 text-left text-sm sm:grid-cols-3">
        {[
          ['Write the master', 'Everything you have done, split into blocks with tags like #backend or #ml.'],
          ['Make variants', 'Tick blocks or pick tags; see the PDF and page count live.'],
          ['Keep them in sync', 'Bring master edits into every variant with one click; compare any two side by side.'],
        ].map(([t, d], i) => (
          <li key={t} className="rounded-xl border border-line bg-panel p-4">
            <div className="text-xs font-semibold text-accent">Step {i + 1}</div>
            <div className="mt-1 font-medium">{t}</div>
            <div className="mt-1 text-muted">{d}</div>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-xs text-muted">
        Your documents are stored in this browser and, if you connect it, in your own Google Drive. By using texChef you agree to the{' '}
        <Link to="/terms" className="underline hover:text-fg">
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="underline hover:text-fg">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
