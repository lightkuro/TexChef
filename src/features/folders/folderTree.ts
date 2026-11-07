/**
 * Folders on the home page. A document's folder is a path ("Applications/2026"); folders exist
 * while a document is in them (or below them), plus empty ones the user just made.
 */

export interface FolderNode {
  path: string;
  name: string;
  depth: number;
  /** Documents in this folder and its subfolders. */
  count: number;
  children: FolderNode[];
}

/** Tidy a folder path: trimmed segments, no empty ones. Undefined for "no folder". */
export function cleanFolder(path: string | undefined | null): string | undefined {
  const out = (path ?? '')
    .split('/')
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('/');
  return out || undefined;
}

export function folderName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function parentFolder(path: string): string | undefined {
  const i = path.lastIndexOf('/');
  return i < 0 ? undefined : path.slice(0, i);
}

/** Whether `path` is `folder` or inside it. */
export function inFolder(path: string | undefined, folder: string): boolean {
  return !!path && (path === folder || path.startsWith(folder + '/'));
}

/** The folder tree for some documents' folders plus extra (empty) folders, sorted by name. */
export function buildFolderTree(docFolders: (string | undefined)[], extra: string[] = []): FolderNode[] {
  const all = new Set<string>();
  const addWithParents = (p: string) => {
    const parts = p.split('/');
    for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join('/'));
  };
  for (const f of docFolders) if (f) addWithParents(f);
  for (const f of extra) addWithParents(f);
  const nodes = new Map<string, FolderNode>();
  for (const path of all) nodes.set(path, { path, name: folderName(path), depth: path.split('/').length - 1, count: 0, children: [] });
  for (const f of docFolders) {
    if (!f) continue;
    for (const [path, node] of nodes) if (inFolder(f, path)) node.count++;
  }
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = parentFolder(node.path);
    (parent ? nodes.get(parent)!.children : roots).push(node);
  }
  const sort = (list: FolderNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** Depth-first list of the tree (for rendering and pickers). */
export function flattenTree(nodes: FolderNode[], collapsed: Set<string> = new Set()): FolderNode[] {
  const out: FolderNode[] = [];
  const walk = (list: FolderNode[]) => {
    for (const n of list) {
      out.push(n);
      if (!collapsed.has(n.path)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Where a document's folder goes when folder `from` is renamed/moved to `to`. */
export function renamedFolder(path: string | undefined, from: string, to: string | undefined): string | undefined {
  if (!inFolder(path, from)) return path;
  const rest = path!.slice(from.length);
  return cleanFolder((to ?? '') + rest);
}
