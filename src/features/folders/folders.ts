import { create } from 'zustand';
import { repo } from '@/app/repo';
import { cleanFolder, inFolder, parentFolder, renamedFolder } from './folderTree';

const KEY = 'rc-empty-folders';

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function persist(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Folders made with "New folder" that no document is in yet. They live in this browser; once a
 * document is moved in, the folder travels with the document (and syncs).
 */
export const useEmptyFolders = create<{ list: string[]; add: (p: string) => void; set: (list: string[]) => void }>((set, get) => ({
  list: load(),
  add: (p) => {
    const list = [...new Set([...get().list, p])];
    persist(list);
    set({ list });
  },
  set: (list) => {
    persist(list);
    set({ list });
  },
}));

export async function moveDocsToFolder(ids: string[], folder: string | undefined): Promise<void> {
  const f = cleanFolder(folder);
  for (const id of ids) await repo.updateDoc(id, { folder: f });
}

/** Rename or move a folder (and everything inside it). */
export async function renameFolder(from: string, to: string): Promise<void> {
  const target = cleanFolder(to);
  if (!target || target === from) return;
  for (const d of await repo.listDocs()) {
    if (d.deleted || !inFolder(d.folder, from)) continue;
    await repo.updateDoc(d.id, { folder: renamedFolder(d.folder, from, target) });
  }
  const store = useEmptyFolders.getState();
  store.set(store.list.map((p) => renamedFolder(p, from, target) ?? p));
}

/** Remove a folder: its documents (and subfolders) move up into the folder around it. */
export async function deleteFolder(path: string): Promise<void> {
  const up = parentFolder(path);
  for (const d of await repo.listDocs()) {
    if (d.deleted || !inFolder(d.folder, path)) continue;
    await repo.updateDoc(d.id, { folder: renamedFolder(d.folder, path, up) });
  }
  const store = useEmptyFolders.getState();
  store.set(store.list.filter((p) => !inFolder(p, path)));
}
