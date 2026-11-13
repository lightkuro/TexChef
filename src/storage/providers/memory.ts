import type { Hash } from '@/core/model';
import { packDocId, type HeadRef, type IndexSnapshot, type Pack, type PackRef, type RemoteIndex, type SyncProvider } from '../sync/types';

/** In-memory provider: used by tests (two "devices" sharing one instance). */
export class MemoryProvider implements SyncProvider {
  readonly id = 'memory';
  packs = new Map<string, string>();
  blobs = new Map<Hash, Uint8Array>();
  index: string | null = null;
  version = 0;
  writes = 0;
  heads = new Map<string, string>();
  /** What was read, for tests that check how little a device brings down. */
  reads = { packs: 0, heads: 0, index: 0, blobs: 0 };

  async listPacks(): Promise<PackRef[]> {
    return [...this.packs.keys()].sort().map((id) => ({ id, ref: id, docId: packDocId(id) }));
  }
  async readPack(ref: string): Promise<Pack> {
    const p = this.packs.get(ref);
    if (!p) throw new Error(`Missing pack ${ref}`);
    this.reads.packs++;
    return JSON.parse(p);
  }
  async writePack(pack: Pack): Promise<void> {
    this.packs.set(pack.id, JSON.stringify(pack));
    this.writes++;
  }
  async deletePacks(refs: string[]): Promise<void> {
    refs.forEach((r) => this.packs.delete(r));
  }
  async readBlob(hash: Hash) {
    this.reads.blobs++;
    return this.blobs.get(hash);
  }
  async listHeads(): Promise<Map<string, HeadRef>> {
    return new Map([...this.heads].map(([docId, json]) => [docId, { ref: docId, head: (JSON.parse(json) as Pack).commits[0]?.id }]));
  }
  async readHead(ref: string): Promise<Pack> {
    const p = this.heads.get(ref);
    if (!p) throw new Error(`Missing head ${ref}`);
    this.reads.heads++;
    return JSON.parse(p);
  }
  async writeHead(docId: string, pack: Pack): Promise<string> {
    this.heads.set(docId, JSON.stringify(pack));
    this.writes++;
    return docId;
  }
  async writeBlob(hash: Hash, data: Uint8Array) {
    this.blobs.set(hash, data);
  }
  async readIndex(known?: string | null): Promise<IndexSnapshot> {
    const version = this.index ? String(this.version) : null;
    if (version && known === version) return { index: null, version, unchanged: true };
    this.reads.index++;
    return { index: this.index ? (JSON.parse(this.index) as RemoteIndex) : null, version };
  }
  async writeIndex(index: RemoteIndex, expected: string | null): Promise<string | null> {
    const current = this.index ? String(this.version) : null;
    if (current !== expected) return null;
    this.index = JSON.stringify(index);
    this.version++;
    this.writes++;
    return String(this.version);
  }
}
