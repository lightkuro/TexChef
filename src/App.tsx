import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, useParams, useNavigate } from 'react-router';
import { Toaster, toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { TooltipProvider, Button } from '@/components/ui';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { EditorPage } from '@/features/editor/EditorPage';
import { VariantBuilder } from '@/features/variants/VariantBuilder';
import { PullPage } from '@/features/variants/PullPage';
import { ComparePage } from '@/features/compare/ComparePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { repo, useDoc } from '@/app/repo';
import { applyTheme, usePrefs } from '@/app/prefs';
import { startSyncLoop } from '@/features/sync/controller';
import { mergeDivergedHead, discardDivergedHead } from '@/storage/sync/engine';

/** Autosave dirty working copies as checkpoints: after a minute idle and when the page is hidden. */
function useAutosave() {
  useEffect(() => {
    let last = Date.now();
    const bump = () => (last = Date.now());
    const tick = setInterval(() => {
      if (Date.now() - last > 60_000) void repo.autosaveAll();
    }, 30_000);
    const hide = () => document.visibilityState === 'hidden' && void repo.autosaveAll();
    window.addEventListener('keydown', bump, true);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', hide);
    return () => {
      clearInterval(tick);
      window.removeEventListener('keydown', bump, true);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', hide);
    };
  }, []);
}

function DivergedBanner() {
  const { id } = useParams();
  const doc = useDoc(id);
  const navigate = useNavigate();
  const other = doc?.divergedHeads?.[0];
  if (!doc || !other) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-warn-soft px-3 py-1.5 text-xs text-warn">
      <AlertTriangle className="size-3.5" />
      “{doc.name}” was also edited on another device.
      <Button
        size="sm"
        variant="outline"
        className="h-6"
        onClick={async () => {
          const r = await mergeDivergedHead(repo, doc.id, other);
          if (r.conflicts) toast.warning(`Merged with ${r.conflicts} conflict${r.conflicts === 1 ? '' : 's'}. Look for <<<<<<< markers in the editor.`);
          else toast.success('Merged changes from the other device');
          navigate(`/doc/${doc.id}`);
        }}
      >
        Merge them
      </Button>
      <Button size="sm" variant="ghost" className="h-6" onClick={() => navigate(`/compare?left=${doc.id}&right=${doc.id}@${other}`)}>
        Compare
      </Button>
      <Button size="sm" variant="ghost" className="h-6" onClick={() => discardDivergedHead(repo, doc.id, other)}>
        Keep mine
      </Button>
    </div>
  );
}

/** Remount per-document pages when the id changes so no state (pending edits, recipes) leaks between documents. */
function Keyed({ page: Page }: { page: React.ComponentType }) {
  const { id } = useParams();
  return <Page key={id} />;
}

function DocShell() {
  return (
    <div className="flex h-full flex-col">
      <DivergedBanner />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

function Root() {
  useAutosave();
  const theme = usePrefs((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme(usePrefs.getState().theme);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);
  useEffect(() => startSyncLoop(), []);
  return (
    <TooltipProvider>
      <div className="h-full">
        <Outlet />
      </div>
      <Toaster position="bottom-right" richColors closeButton theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'} />
    </TooltipProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Dashboard /> },
      {
        path: '/doc/:id',
        element: <DocShell />,
        children: [
          { index: true, element: <Keyed page={EditorPage} /> },
          { path: 'new-variant', element: <Keyed page={VariantBuilder} /> },
          { path: 'pull', element: <Keyed page={PullPage} /> },
        ],
      },
      { path: '/compare', element: <ComparePage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <Dashboard /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
