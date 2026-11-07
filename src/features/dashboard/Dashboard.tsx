import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plus, Upload, Network, List, GitCommitHorizontal, Download, CloudDownload, Search, Settings, FileText, Archive, CircleHelp } from 'lucide-react';
import { toast } from 'sonner';
import { useDocs } from '@/app/repo';
import { usePrefs } from '@/app/prefs';
import { createDocumentFromProject, downloadAllPdfs, planImport, type ImportPlan } from '@/features/importexport/io';
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
  const view = usePrefs((s) => s.dashboardView);
  const graphMode = usePrefs((s) => s.graphMode);
  const showAutosaves = usePrefs((s) => s.showAutosaves);
  const showArchived = usePrefs((s) => s.showArchived);
  const setPref = usePrefs((s) => s.set);
  const upload = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const sync = useSync();

  const archivedCount = docs?.filter((d) => d.archived).length ?? 0;
  const filtered = useMemo(() => {
    const visible = (docs ?? []).filter((d) => showArchived || !d.archived);
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    const match = new Set(visible.filter((d) => d.name.toLowerCase().includes(q) || d.tags.some((t) => t.includes(q)) || d.recipe?.tags.some((t) => t.includes(q))).map((d) => d.id));
    // Keep ancestors so the tree stays connected.
    for (const d of visible) if (match.has(d.id)) for (let p = d.parent?.docId; p; p = visible.find((x) => x.id === p)?.parent?.docId) match.add(p);
    return visible.filter((d) => match.has(d.id));
  }, [docs, query, showArchived]);

  const importFiles = async (files: File[] | FileList) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const plan = await planImport(files);
      if (!plan.projects.length) throw new Error('Nothing to import in this upload');
      // Several documents in one upload (e.g. a Prism export): let the user pick.
      if (plan.projects.length > 1) {
        setBundle(plan);
        return;
      }
      const doc = await createDocumentFromProject(plan.projects[0]);
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
        <Button variant="primary" onClick={() => setNewOpen(true)} data-testid="new-doc">
          <Plus className="size-4" /> New document
        </Button>
        <Button variant="outline" onClick={() => upload.current?.click()} disabled={busy}>
          {busy ? <Spinner /> : <Upload className="size-4" />} Upload .tex / .zip
        </Button>
        <input ref={upload} type="file" multiple hidden accept=".tex,.zip,.cls,.sty,.bib,.png,.jpg,.jpeg,.pdf" data-testid="upload-input" onChange={(e) => e.target.files && importFiles(e.target.files).then(() => (e.target.value = ''))} />
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
        <Button
          variant="ghost"
          onClick={async () => {
            const n = await downloadAllPdfs();
            if (!n) toast.info('No compiled PDFs yet. Open a document to compile it.');
          }}
        >
          <Download className="size-4" /> Export all PDFs
        </Button>
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
      <main className="relative min-h-0 flex-1 overflow-auto">
        {docs === undefined ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : docs.length === 0 ? (
          <Welcome onNew={() => setNewOpen(true)} onUpload={() => upload.current?.click()} />
        ) : view === 'list' ? (
          <DocList docs={filtered} />
        ) : graphMode === 'family' ? (
          <FamilyGraph docs={filtered} />
        ) : (
          <VersionGraph docs={filtered} showAutosaves={showAutosaves} />
        )}
        {bundle && <BundleImportDialog plan={bundle} onClose={() => setBundle(null)} />}
        {dragging && (
          <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80 text-lg font-medium text-accent">
            Drop .tex or .zip files to import
          </div>
        )}
      </main>
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
      <NewDocDialog open={newOpen} onOpenChange={setNewOpen} />
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
