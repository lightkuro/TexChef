/**
 * Browsers may clear "best-effort" site storage (IndexedDB) under disk pressure. Documents live there
 * first, so ask for persistent storage. Chrome/Edge decide silently (based on engagement, bookmarks,
 * installed apps); Firefox shows a permission prompt; Safari keeps data while the site is in use.
 */

export interface StorageStatus {
  supported: boolean;
  persisted: boolean;
  usage?: number;
  quota?: number;
}

export async function storageStatus(): Promise<StorageStatus> {
  const s = navigator.storage;
  if (!s?.persisted) return { supported: false, persisted: false };
  const [persisted, estimate] = await Promise.all([s.persisted().catch(() => false), s.estimate?.().catch(() => undefined)]);
  return { supported: true, persisted, usage: estimate?.usage, quota: estimate?.quota };
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
