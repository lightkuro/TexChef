import Dexie, { type Table } from 'dexie';
import type { BlobRecord, Commit, DocMeta, PreviewRecord, WorkingCopy } from '@/core/model';

export interface MetaRecord {
  key: string;
  value: unknown;
}

/** Local-first store. Everything the app shows comes from here; sync providers mirror it. */
export class RCDatabase extends Dexie {
  docs!: Table<DocMeta, string>;
  commits!: Table<Commit, string>;
  blobs!: Table<BlobRecord, string>;
  work!: Table<WorkingCopy, string>;
  previews!: Table<PreviewRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = 'resumechef') {
    super(name);
    this.version(1).stores({
      docs: 'id, updatedAt',
      commits: 'id, docId, createdAt, synced',
      blobs: 'hash, synced',
      work: 'docId',
      previews: 'key',
      meta: 'key',
    });
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value });
  }
}
