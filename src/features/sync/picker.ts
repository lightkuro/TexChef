import { toast } from 'sonner';
import { API_KEY, APP_ID, currentToken, loadScript } from '@/features/auth/google';
import { driveProvider } from './controller';

interface PickerResponse {
  action: string;
  docs?: { id: string; name: string; mimeType: string }[];
}

interface GapiPicker {
  load(name: string, cb: () => void): void;
}

declare global {
  interface Window {
    gapi?: GapiPicker;
  }
}

export const pickerConfigured = !!API_KEY && !!APP_ID;

const isBrave = () => typeof navigator !== 'undefined' && 'brave' in navigator;

/** What to try when Google's window can't show the files: shown while the picker is open, and on errors. */
export function pickerTroubleHint(brave = isBrave()): string {
  return brave
    ? 'Brave’s Shields block the cookies it needs: click the lion icon in the address bar, allow all cookies for this site (or turn Shields off for it), then try again.'
    : 'The browser may be blocking the cookies it needs: allow cookies for this site and try again, or download the file from Drive and use Import → Upload.';
}

/** Google's picker failed; the message is shown with {@link pickerTroubleHint}. */
export class PickerError extends Error {}

const HELP_TOAST = 'drive-picker-help';

/**
 * Open Google Picker so the user can grant access to existing Drive files (.tex, .zip, images).
 * Picking is what lets a drive.file app read files it did not create.
 *
 * When Google can't show the picker (cookies blocked, as Brave and Safari do; a key that doesn't allow
 * docs.google.com) it shows “Sign in” or an error with no way to close it, so while it is open a notice
 * offers to close it and says what to try.
 */
export async function pickFromDrive(): Promise<File[]> {
  const token = currentToken();
  const provider = driveProvider();
  if (!token || !provider) throw new Error('Connect Google Drive first');
  if (!pickerConfigured) throw new Error('Set VITE_GOOGLE_API_KEY and VITE_GOOGLE_APP_ID to enable Drive import');
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise<void>((r) => window.gapi!.load('picker', () => r()));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gp = (window as any).google.picker;
  const picked = await new Promise<PickerResponse['docs']>((resolve, reject) => {
    let picker: { setVisible(v: boolean): void; dispose(): void } | undefined;
    let done = false;
    const finish = (docs: PickerResponse['docs'], error?: Error) => {
      if (done) return;
      done = true;
      toast.dismiss(HELP_TOAST);
      // Not from inside Google's own callback.
      setTimeout(() => {
        try {
          picker?.setVisible(false);
          picker?.dispose();
        } catch {
          /* already gone */
        }
      });
      if (error) reject(error);
      else resolve(docs);
    };
    const view = new gp.DocsView(gp.ViewId.DOCS)
      .setMimeTypes('text/x-tex,application/x-tex,text/plain,application/zip,application/x-zip-compressed,image/png,image/jpeg,application/octet-stream')
      .setIncludeFolders(true);
    picker = new gp.PickerBuilder()
      .addView(view)
      .enableFeature(gp.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token.accessToken)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setTitle('Import into texChef')
      .setCallback((data: PickerResponse) => {
        if (data.action === gp.Action.PICKED) finish(data.docs);
        else if (data.action === gp.Action.CANCEL) finish([]);
        else if (data.action === (gp.Action.ERROR ?? 'error')) finish(undefined, new PickerError('Google’s file picker hit an error'));
      })
      .build();
    picker!.setVisible(true);
    toast('Choosing files in Google Drive', {
      id: HELP_TOAST,
      duration: Infinity,
      description: `Stuck on “Sign in” or an error? ${pickerTroubleHint()}`,
      action: { label: 'Close picker', onClick: () => finish([]) },
    });
  });
  const files: File[] = [];
  for (const d of picked ?? []) {
    const { name, data } = await provider.downloadPicked(d.id);
    files.push(new File([data as BlobPart], name));
  }
  return files;
}
