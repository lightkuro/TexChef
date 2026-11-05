import type { EngineStatus } from '@/compile/compiler';
import { Spinner } from '@/components/ui';

export function EngineBanner({ status }: { status: EngineStatus }) {
  if (status.state === 'loading') {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-info-soft px-3 py-1.5 text-xs text-info" data-testid="engine-banner">
        <Spinner />
        <span>{status.label ?? 'Starting the LaTeX engine'}</span>
        {status.percent !== undefined && (
          <>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-panel">
              <div className="h-full bg-info transition-[width]" style={{ width: `${status.percent}%` }} />
            </div>
            <span className="tabular-nums">
              {status.loadedMB}/{status.totalMB} MB
            </span>
          </>
        )}
        <span className="text-muted">Cached in your browser after the first time.</span>
      </div>
    );
  }
  if (status.state === 'error') {
    return (
      <div className="shrink-0 border-b border-line bg-danger-soft px-3 py-1.5 text-xs text-danger">
        The LaTeX engine failed to start: {status.message}. Check that the TeX assets are served at{' '}
        <code>{(import.meta.env.VITE_TEX_ASSETS_URL as string) || '/core/busytex'}</code> (run <code>pnpm tex:assets</code>).
      </div>
    );
  }
  return null;
}
