import type { DocMeta } from '@/core/model';
import { buildFolderTree, folderName, inFolder, type FolderNode } from './folderTree';

export type FolderMode = 'browse' | 'grouped';

export interface FolderItem {
  path: string;
  name: string;
  /** Documents anywhere inside. */
  count: number;
  /** Ids of the documents anywhere inside (for previews and links). */
  docIds: string[];
}

export interface DocGroup {
  /** Folder path ("" for documents in no folder). */
  path: string;
  label: string;
  depth: number;
  docs: DocMeta[];
}

export interface FolderViewModel {
  /** Browse: subfolders of the open folder, shown as folders. Grouped: none. */
  folders: FolderItem[];
  /** Documents shown as cards/rows. */
  docs: DocMeta[];
  /** Grouped: the documents per folder, the open folder first. Browse: one group. */
  groups: DocGroup[];
  /** Browse: for a document hidden inside a subfolder, the subfolder that shows it. */
  containerOf: Map<string, string>;
}

function findNode(nodes: FolderNode[], path: string): FolderNode | undefined {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (inFolder(path, n.path)) return findNode(n.children, path);
  }
  return undefined;
}

/**
 * What the home page shows for folder `current` (undefined = top level):
 * - browse: its subfolders as folders, and only the documents directly in it;
 * - grouped: every document inside it, grouped by the folder each one is in.
 */
export function folderView(docs: DocMeta[], emptyFolders: string[], current: string | undefined, mode: FolderMode): FolderViewModel {
  const tree = buildFolderTree(
    docs.map((d) => d.folder),
    emptyFolders,
  );
  const here = current ? findNode(tree, current) : undefined;
  const children = current ? (here?.children ?? []) : tree;
  const inScope = docs.filter((d) => (current ? inFolder(d.folder, current) : true));
  const direct = inScope.filter((d) => (d.folder ?? undefined) === current);

  if (mode === 'browse') {
    const folders: FolderItem[] = children.map((n) => {
      const ids = inScope.filter((d) => inFolder(d.folder, n.path)).map((d) => d.id);
      return { path: n.path, name: n.name, count: ids.length, docIds: ids };
    });
    const containerOf = new Map<string, string>();
    for (const f of folders) for (const id of f.docIds) containerOf.set(id, f.path);
    return {
      folders,
      docs: direct,
      groups: [{ path: current ?? '', label: current ? folderName(current) : 'Not in a folder', depth: 0, docs: direct }],
      containerOf,
    };
  }

  const groups: DocGroup[] = [];
  if (direct.length) groups.push({ path: current ?? '', label: current ? folderName(current) : 'Not in a folder', depth: 0, docs: direct });
  const base = current ? current.split('/').length : 0;
  const walk = (nodes: FolderNode[]) => {
    for (const n of nodes) {
      const own = inScope.filter((d) => d.folder === n.path);
      if (own.length) groups.push({ path: n.path, label: current ? n.path.slice(current.length + 1) : n.path, depth: n.depth - base, docs: own });
      walk(n.children);
    }
  };
  walk(children);
  return { folders: [], docs: inScope, groups, containerOf: new Map() };
}
