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

/**
 * Open Google Picker so the user can grant access to existing Drive files (.tex, .zip, images).
 * Picking is what lets a drive.file app read files it did not create.
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
  const picked = await new Promise<PickerResponse['docs']>((resolve) => {
    const view = new gp.DocsView(gp.ViewId.DOCS)
      .setMimeTypes('text/x-tex,application/x-tex,text/plain,application/zip,application/x-zip-compressed,image/png,image/jpeg,application/octet-stream')
      .setIncludeFolders(true);
    const picker = new gp.PickerBuilder()
      .addView(view)
      .enableFeature(gp.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token.accessToken)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setTitle('Import into ResumeChef')
      .setCallback((data: PickerResponse) => {
        if (data.action === gp.Action.PICKED) resolve(data.docs);
        else if (data.action === gp.Action.CANCEL) resolve([]);
      })
      .build();
    picker.setVisible(true);
  });
  const files: File[] = [];
  for (const d of picked ?? []) {
    const { name, data } = await provider.downloadPicked(d.id);
    files.push(new File([data as BlobPart], name));
  }
  return files;
}
