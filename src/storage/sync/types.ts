import type { Commit, DocMeta, Hash } from '@/core/model';

/**
 * Immutable bundle of commits (+ small blobs inline) written once per sync push. A pack whose id reads
 * `<document id>~<pack id>` holds versions of that one document; earlier packs hold several documents.
 */
export interface Pack {
  format: 1;
  id: string;
  createdAt: number;
  commits: Omit<Commit, 'synced'>[];
  /** hash → base64 bytes */
  blobs: Record<Hash, string>;
}

/** Mutable workspace index: document metadata and heads. */
export interface RemoteIndex {
  format: 1;
  updatedAt: number;
  docs: DocMeta[];
}

export interface IndexSnapshot {
  index: RemoteIndex | null;
  /** Opaque version token used for compare-and-swap writes. */
  version: string | null;
  /** The storage still holds the version the caller already has: `index` is not filled in. */
  unchanged?: boolean;
}

export interface PackRef {
  id: string;
  ref: string;
  /** The one document this pack is about, when it is a per-document pack. */
  docId?: string;
}

/** A document's "head" file: its current version on its own, so a device can take just that. */
export interface HeadRef {
  ref: string;
  /** The version the file holds, when the storage records it. */
  head?: string;
}

/** The document a pack is about, from its id (`<document id>~<pack id>`); none for earlier, mixed packs. */
export function packDocId(id: string): string | undefined {
  const at = id.indexOf('~');
  return at > 0 ? id.slice(0, at) : undefined;
}

export interface SyncProvider {
  readonly id: string;
  listPacks(): Promise<PackRef[]>;
  readPack(ref: string): Promise<Pack>;
  /** Returns the new pack's `ref`, when the storage gives it one that differs from its id. */
  writePack(pack: Pack): Promise<string | void>;
  deletePacks(refs: string[]): Promise<void>;
  readBlob(hash: Hash): Promise<Uint8Array | undefined>;
  writeBlob(hash: Hash, data: Uint8Array): Promise<void>;
  /** `known`: the version the caller already holds; when it is still current, the answer may be `unchanged`. */
  readIndex(known?: string | null): Promise<IndexSnapshot>;
  /** Write if the remote version still equals `expected`; returns the new version, or null on conflict. */
  writeIndex(index: RemoteIndex, expected: string | null): Promise<string | null>;
  /** Head files, by document id. */
  listHeads?(): Promise<Map<string, HeadRef>>;
  readHead?(ref: string): Promise<Pack>;
  /** Write (or replace, given its `ref`) a document's head file; returns its ref. */
  writeHead?(docId: string, pack: Pack, ref?: string): Promise<string>;
  /**
   * Optional human-readable copy of a document (files + PDF) for browsing the storage directly.
   * `keep`: file paths whose copy in the storage is already right, and so are not sent again.
   */
  mirror?(doc: DocMeta, files: Record<string, Uint8Array>, pdf?: Uint8Array, keep?: Set<string>): Promise<void>;
}

/** Earlier versions of the app put files up to this size inside packs: such a file may exist nowhere else. */
export const INLINE_BLOB_LIMIT = 256 * 1024;
/** Files at most this size travel inside packs and head files now; bigger ones are stored one by one, and fetched when needed. */
export const PACK_INLINE_LIMIT = 64 * 1024;
/** Mixed packs are rewritten per document once there are this many packs too many. */
export const COMPACT_THRESHOLD = 40;
/** A document's packs are merged into one once there are more than this many. */
export const DOC_COMPACT_THRESHOLD = 12;
