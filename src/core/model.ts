/** Content hash (sha256 hex) of a blob. */
export type Hash = string;

/** Snapshot of a project's files: path → blob hash. */
export type FileTree = Record<string, Hash>;

export type Engine = 'pdflatex' | 'xelatex' | 'lualatex';

export type CommitKind =
  | 'save' // explicit "Save version"
  | 'auto' // autosave checkpoint
  | 'create' // first commit of a new document
  | 'branch' // first commit of a variant (parent = commit in parent doc)
  | 'merge' // pull from parent (2 parents)
  | 'push-up' // block pushed from a child variant into this doc
  | 'restore' // restored an older version
  | 'import'; // uploaded / imported

export interface Commit {
  id: string;
  docId: string;
  /** First parent is this doc's previous head; a second parent may live in another doc. */
  parents: string[];
  tree: FileTree;
  message: string;
  kind: CommitKind;
  createdAt: number;
  author?: string;
  /** 0 = not yet uploaded to the sync provider. Local-only field (not synced). */
  synced?: 0 | 1;
}

/**
 * How a variant was derived from its parent. Block IDs refer to `%% @block <id>` markers.
 * A block is kept when it is not excluded and is either explicitly included or matches the tag filter
 * (untagged blocks pass the tag filter so document structure survives).
 */
export interface Recipe {
  include: string[];
  exclude: string[];
  tags: string[];
  /** Block IDs that existed in the parent at the last create/pull, to surface "new in parent" blocks. */
  known: string[];
}

export interface DocParentLink {
  docId: string;
  /** Parent commit this variant was last synced with (merge base for "pull from parent"). */
  baseCommitId: string;
}

export interface DocMeta {
  id: string;
  name: string;
  head: string | null;
  mainFile: string;
  engine: Engine;
  parent?: DocParentLink;
  recipe?: Recipe;
  tags: string[];
  color?: string;
  archived?: boolean;
  /** Soft delete (kept as a tombstone so deletes sync across devices). */
  deleted?: boolean;
  /** Heads from other devices that diverged from ours; shown in the graph for merging. */
  divergedHeads?: string[];
  createdAt: number;
  updatedAt: number;
}

export type WorkFile = { kind: 'text'; text: string } | { kind: 'binary'; hash: Hash; size: number };

/** The editable working copy of a document (local only). */
export interface WorkingCopy {
  docId: string;
  files: Record<string, WorkFile>;
  /** Commit the working copy was checked out from. */
  baseCommitId: string | null;
  dirty: boolean;
  updatedAt: number;
}

export interface BlobRecord {
  hash: Hash;
  data: Uint8Array;
  size: number;
  /** 0 = not yet uploaded. */
  synced?: 0 | 1;
}

export interface PreviewRecord {
  /** docId, or `${docId}@${commitId}` for pinned versions. */
  key: string;
  pdf: Uint8Array;
  pages: number;
  thumbnail?: string;
  compiledAt: number;
}

export const TEXT_EXTENSIONS = [
  'tex', 'sty', 'cls', 'bib', 'bst', 'txt', 'md', 'cfg', 'def', 'clo', 'ltx', 'dtx', 'ins', 'csv', 'json', 'lua', 'bbx', 'cbx', 'lbx',
];

export function isTextPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_EXTENSIONS.includes(ext) || !path.includes('.');
}

export function isTexPath(path: string): boolean {
  return path.toLowerCase().endsWith('.tex');
}

export function emptyRecipe(): Recipe {
  return { include: [], exclude: [], tags: [], known: [] };
}
