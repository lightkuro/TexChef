import type { DocMeta } from '@/core/model';
import { safeFilename } from '@/lib/utils';

/** Folder in a backup that holds TexChef's own data (history, details, previews). */
export const BACKUP_DIR = '.texchef';

/** A readable folder for each document: its folder path plus its name, never clashing with a folder or another document. */
export function readablePaths(docs: DocMeta[]): Record<string, string> {
  const folders = new Set<string>();
  for (const d of docs) {
    const parts = (d.folder ?? '').split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).map(safeFilename).join('/'));
  }
  const taken = new Set<string>([...folders, BACKUP_DIR]);
  const out: Record<string, string> = {};
  for (const d of [...docs].sort((a, b) => a.createdAt - b.createdAt)) {
    const dir = (d.folder ?? '').split('/').filter(Boolean).map(safeFilename).join('/');
    const base = safeFilename(d.name);
    let path = dir ? `${dir}/${base}` : base;
    for (let n = 2; taken.has(path.toLowerCase()) || taken.has(path); n++) path = dir ? `${dir}/${base} (${n})` : `${base} (${n})`;
    taken.add(path);
    taken.add(path.toLowerCase());
    out[d.id] = path;
  }
  return out;
}

