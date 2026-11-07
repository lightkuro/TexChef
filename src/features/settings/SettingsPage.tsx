import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Cloud, HardDrive, Cpu, Palette, Database, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/app/repo';
import { PALETTES, usePrefs, type Theme } from '@/app/prefs';
import { Swatch } from '@/components/ThemeMenu';
import { cn } from '@/lib/utils';
import { compiler } from '@/compile/compiler';
import { useEngineStatus } from '@/features/compile/useCompile';
import { useSync, connectDrive, disconnectDrive, syncNow } from '@/features/sync/controller';
import { googleConfigured } from '@/features/auth/google';
import { pickerConfigured } from '@/features/sync/picker';
import { Badge, Button, Dialog, Select } from '@/components/ui';
import { formatBytes, timeAgo } from '@/lib/utils';
import { requestPersistence, storageStatus, type StorageStatus } from '@/app/persist';

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </h2>
      <div className="space-y-3 text-sm">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const sync = useSync();
  const engine = useEngineStatus();
  const theme = usePrefs((s) => s.theme);
  const palette = usePrefs((s) => s.palette);
  const autoCompile = usePrefs((s) => s.autoCompile);
  const mapLines = usePrefs((s) => s.mapLines);
  const setPref = usePrefs((s) => s.set);
  const [reset, setReset] = useState(false);
  const [storage, setStorage] = useState<StorageStatus>();
  useEffect(() => {
    void storageStatus().then(setStorage);
  }, []);

  return (
    <div className="h-full overflow-auto">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-line bg-panel px-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <span className="font-semibold">Settings</span>
      </header>
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Section icon={sync.state === 'local' ? <HardDrive className="size-4" /> : <Cloud className="size-4 text-ok" />} title="Storage">
          <p className="text-muted">
            Documents always live in this browser first. Connect Google Drive to back them up and use them on other devices. texChef asks
            only for the <code className="rounded bg-subtle px-1">drive.file</code> permission, so it can see the files it creates and the files you
            pick, and nothing else in your Drive.
          </p>
          {sync.state === 'local' ? (
            <div className="flex items-center gap-2">
              <Badge>Local only</Badge>
              <Button variant="primary" onClick={() => connectDrive().catch((e) => toast.error(String(e?.message ?? e)))} disabled={!googleConfigured}>
                Connect Google Drive
              </Button>
              {!googleConfigured && <span className="text-xs text-muted">Set VITE_GOOGLE_CLIENT_ID to enable (see README).</span>}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={sync.state === 'error' ? 'danger' : sync.state === 'needs-signin' ? 'warn' : 'ok'}>{sync.state === 'needs-signin' ? 'Reconnect needed' : 'Google Drive'}</Badge>
                {sync.user?.email && <span>{sync.user.email}</span>}
                {sync.lastSync && <span className="text-muted">last synced {timeAgo(sync.lastSync)}</span>}
              </div>
              {sync.error && <p className="text-xs text-danger">{sync.error}</p>}
              <div className="flex gap-2">
                {sync.state === 'needs-signin' ? (
                  <Button variant="primary" onClick={() => connectDrive().catch((e) => toast.error(String(e?.message ?? e)))}>
                    Reconnect
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => void syncNow()}>
                    Sync now
                  </Button>
                )}
                <Button variant="ghost" onClick={disconnectDrive}>
                  Disconnect
                </Button>
              </div>
              <p className="text-xs text-muted">
                In Drive you will find a <b>texChef</b> folder with a readable copy of each document and its latest PDF. History lives in
                <code className="mx-1 rounded bg-subtle px-1">texChef/.texchef</code>; leave it as it is.
                {!pickerConfigured && ' Importing existing Drive files needs VITE_GOOGLE_API_KEY and VITE_GOOGLE_APP_ID.'}
              </p>
            </div>
          )}
        </Section>

        <Section icon={<Cpu className="size-4" />} title="LaTeX engine">
          <p className="text-muted">
            Compiles in your browser with TeX Live 2026 (BusyTeX, WebAssembly). The core (about 125 MB) downloads once and is cached. Larger
            package collections download only when a document needs them.
          </p>
          <div className="flex items-center gap-2">
            <Badge tone={engine.state === 'ready' ? 'ok' : engine.state === 'error' ? 'danger' : 'neutral'}>{engine.state}</Badge>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={autoCompile} onChange={(e) => setPref({ autoCompile: e.target.checked })} /> Compile automatically while typing
            </label>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              await compiler.clearCache();
              toast.success('TeX package cache cleared');
            }}
          >
            Clear downloaded TeX packages
          </Button>
        </Section>

        <Section icon={<Palette className="size-4" />} title="Appearance">
          <label className="flex items-center gap-2">
            Mode
            <Select value={theme} onChange={(e) => setPref({ theme: e.target.value as Theme })}>
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Color theme">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={palette === p.id}
                onClick={() => setPref({ palette: p.id })}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm',
                  palette === p.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-subtle',
                )}
                data-testid={`settings-palette-${p.id}`}
              >
                <span className="flex flex-col gap-1">
                  <Swatch colors={p.light} />
                  <Swatch colors={p.dark} />
                </span>
                {p.name}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            Lines on the map
            <Select value={mapLines} onChange={(e) => setPref({ mapLines: e.target.value as 'straight' | 'angled' })} data-testid="settings-map-lines">
              <option value="straight">Straight</option>
              <option value="angled">Right-angled</option>
            </Select>
          </label>
        </Section>

        <Section icon={<ShieldCheck className="size-4" />} title="Privacy">
          <p className="text-muted">
            There is no texChef server. Your documents go only to this browser and, if you connect it, your own Google Drive. The Google access
            token stays in this tab's session storage and expires after an hour.
          </p>
          <p className="text-muted">
            <Link to="/privacy" className="text-accent underline">
              Privacy Policy
            </Link>{' '}
            ·{' '}
            <Link to="/terms" className="text-accent underline">
              Terms of Service
            </Link>
          </p>
        </Section>

        <Section icon={<Database className="size-4" />} title="Local data">
          <p className="text-muted">
            Documents, versions and the downloaded TeX engine are kept in this browser, so reopening the site does not download them again.
          </p>
          {storage?.supported && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={storage.persisted ? 'ok' : 'warn'}>{storage.persisted ? 'Persistent storage' : 'Best-effort storage'}</Badge>
              {storage.usage !== undefined && (
                <span className="text-muted">
                  {formatBytes(storage.usage)} used{storage.quota ? ` of ${formatBytes(storage.quota)} available` : ''}
                </span>
              )}
              {!storage.persisted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const ok = await requestPersistence();
                    setStorage(await storageStatus());
                    if (ok) toast.success('The browser will keep texChef data');
                    else toast.info('The browser declined for now. Chrome grants it automatically once you use or bookmark the site; Drive sync keeps a backup either way.');
                  }}
                >
                  Keep data permanently
                </Button>
              )}
            </div>
          )}
          {storage?.supported && !storage.persisted && (
            <p className="text-xs text-muted">With best-effort storage the browser may clear this site's data when the disk is nearly full. Connect Google Drive to keep a copy.</p>
          )}
          <p className="text-muted">Remove every document, version and cached PDF from this browser. Documents synced to Drive come back the next time you connect.</p>
          <Button variant="danger" onClick={() => setReset(true)}>
            Erase local data…
          </Button>
        </Section>
      </div>
      <Dialog
        open={reset}
        onOpenChange={setReset}
        title="Erase all local data?"
        description="This cannot be undone. Anything not synced to Google Drive will be lost."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                disconnectDrive();
                await db.delete();
                // Empty folders and map positions belong to the data too (theme and other settings stay).
                for (const k of ['rc-empty-folders', 'rc-map-positions']) localStorage.removeItem(k);
                location.href = '/';
              }}
            >
              Erase
            </Button>
          </>
        }
      />
    </div>
  );
}
