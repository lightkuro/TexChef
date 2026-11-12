import { toast } from 'sonner';

/** The browser refused to store more (IndexedDB or Cache Storage is full). Dexie wraps the DOM error. */
export function isQuotaError(e: unknown): boolean {
  for (let x = e as { name?: string; inner?: unknown } | undefined, i = 0; x && i < 4; x = x.inner as typeof x, i++) {
    if (x.name === 'QuotaExceededError' || x.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  }
  return false;
}

let shown = 0;
/** Say what to do when a save fails because storage is full (once a minute at most). */
export function reportQuotaError() {
  if (Date.now() - shown < 60_000) return;
  shown = Date.now();
  toast.error('The browser’s storage for TexChef is full, so the last change wasn’t saved', {
    duration: 20_000,
    description:
      'Free up space: in Settings, clear the downloaded TeX packages (they download again when needed), or free disk space on this device. Documents synced to Google Drive are safe there.',
    action: { label: 'Settings', onClick: () => location.assign('/settings') },
  });
}

/** Catch quota errors that nothing else handled. */
export function watchQuotaErrors() {
  const check = (e: unknown) => {
    if (isQuotaError(e)) reportQuotaError();
  };
  window.addEventListener('unhandledrejection', (ev) => check(ev.reason));
  window.addEventListener('error', (ev) => check(ev.error));
}
