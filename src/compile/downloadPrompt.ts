import { usePrefs } from '@/app/prefs';
import { confirmAction } from '@/components/confirm';
import type { BundleName } from './packages';

/** Downloads at most this big go ahead without asking. */
export const ASK_ABOVE_MB = 80;

/** A phone, or a browser or setting that asks for less data: the places where a few hundred megabytes should be a choice. */
export function limitedDevice(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return (
    !!conn?.saveData ||
    usePrefs.getState().driveData === 'saver' ||
    window.matchMedia('(max-width: 639px)').matches ||
    window.matchMedia('(hover: none) and (pointer: coarse)').matches
  );
}

/**
 * Before TeX package sets that are not on this device are downloaded: on a phone or with limited data, ask
 * (unless Settings says not to). Elsewhere, and for small downloads, just go ahead.
 */
export async function confirmTexDownload({ mb }: { bundles: BundleName[]; mb: number }): Promise<boolean> {
  if (mb <= ASK_ABOVE_MB || usePrefs.getState().texDownloads === 'always' || !limitedDevice()) return true;
  return confirmAction({
    title: 'Download additional font packages?',
    body: `This document needs additional font and package sets: about ${mb} MB. They are downloaded once and kept on this device. You can turn this question off in Settings.`,
    ok: `Download ${mb} MB`,
    cancel: 'Not now',
  });
}
