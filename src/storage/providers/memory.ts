import type { Hash } from '@/core/model';
import type { IndexSnapshot, Pack, PackRef, RemoteIndex, SyncProvider } from '../sync/types';

/** In-memory provider: used by tests (two "devices" sharing one instance). */
export class MemoryProvider implements SyncProvider {
  readonly id = 'memory';
  packs = new Map<string, string>();
  blobs = new Map<Hash, Uint8Array>();
  index: string | null = null;
  version = 0;
  writes = 0;

  async listPacks(): Promise<PackRef[]> {
    return [...this.packs.keys()].sort().map((id) => ({ id, ref: id }));
  }
  async readPack(ref: string): Promise<Pack> {
    const p = this.packs.get(ref);
    if (!p) throw new Error(`Missing pack ${ref}`);
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
    return this.blobs.get(hash);
  }
  async writeBlob(hash: Hash, data: Uint8Array) {
    this.blobs.set(hash, data);
  }
  async readIndex(): Promise<IndexSnapshot> {
    return { index: this.index ? (JSON.parse(this.index) as RemoteIndex) : null, version: this.index ? String(this.version) : null };
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
