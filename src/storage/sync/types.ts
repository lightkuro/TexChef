import type { Commit, DocMeta, Hash } from '@/core/model';

/** Immutable bundle of commits (+ small blobs inline) written once per sync push. */
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
}

export interface PackRef {
  id: string;
  ref: string;
}

export interface SyncProvider {
  readonly id: string;
  listPacks(): Promise<PackRef[]>;
  readPack(ref: string): Promise<Pack>;
  writePack(pack: Pack): Promise<void>;
  deletePacks(refs: string[]): Promise<void>;
  readBlob(hash: Hash): Promise<Uint8Array | undefined>;
  writeBlob(hash: Hash, data: Uint8Array): Promise<void>;
  readIndex(): Promise<IndexSnapshot>;
  /** Write if the remote version still equals `expected`; returns the new version, or null on conflict. */
  writeIndex(index: RemoteIndex, expected: string | null): Promise<string | null>;
  /** Optional human-readable copy of a document (files + PDF) for browsing the storage directly. */
  mirror?(doc: DocMeta, files: Record<string, Uint8Array>, pdf?: Uint8Array): Promise<void>;
}

/** Blobs at most this size travel inside packs; bigger ones are stored as separate files. */
export const INLINE_BLOB_LIMIT = 256 * 1024;
export const COMPACT_THRESHOLD = 40;
