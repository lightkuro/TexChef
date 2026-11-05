import type { DocMeta, Hash } from '@/core/model';
import type { IndexSnapshot, Pack, PackRef, RemoteIndex, SyncProvider } from '../sync/types';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';

interface DriveFile {
  id: string;
  name: string;
  version?: string;
  mimeType?: string;
  appProperties?: Record<string, string>;
}

/**
 * Google Drive storage with the `drive.file` scope. Layout:
 *
 *   ResumeChef/                      (visible; readable copies of each document + PDFs)
 *     <Document name>/ main.tex, …, <Document name>.pdf
 *     .resumechef/
 *       index.json                   document metadata + heads (compare-and-swap via Drive `version`)
 *       packs/<id>.json              immutable commit bundles
 *       blobs/<sha256>               large binary files (images, fonts)
 */
export class DriveProvider implements SyncProvider {
  readonly id = 'gdrive';
  private folders?: Promise<{ root: string; data: string; packs: string; blobs: string }>;
  private indexFileId?: string;
  private blobIds = new Map<Hash, string>();
  private docFolders = new Map<string, { id: string; name: string }>();

  constructor(private getToken: () => Promise<string>) {}

  private async request(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    const token = await this.getToken();
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 250));
      return this.request(url, init, attempt + 1);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Google Drive ${res.status}: ${body.slice(0, 300)}`);
    }
    return res;
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    return (await this.request(url, init)).json() as Promise<T>;
  }

  private async list(q: string, fields = 'files(id,name,version,appProperties)'): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ q, fields: `nextPageToken,${fields}`, pageSize: '1000', spaces: 'drive' });
      if (pageToken) params.set('pageToken', pageToken);
      const r = await this.json<{ files: DriveFile[]; nextPageToken?: string }>(`${API}/files?${params}`);
      out.push(...r.files);
      pageToken = r.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  private async findOrCreateFolder(name: string, role: string, parent?: string): Promise<string> {
    const q = [`mimeType='${FOLDER}'`, 'trashed=false', `appProperties has { key='rc' and value='${role}' }`];
    if (parent) q.push(`'${parent}' in parents`);
    const found = await this.list(q.join(' and '));
    if (found[0]) return found[0].id;
    const created = await this.json<DriveFile>(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined, appProperties: { rc: role } }),
    });
    return created.id;
  }

  private ensureFolders() {
    if (!this.folders) {
      this.folders = (async () => {
        const root = await this.findOrCreateFolder('ResumeChef', 'root');
        const data = await this.findOrCreateFolder('.resumechef', 'data', root);
        const [packs, blobs] = await Promise.all([
          this.findOrCreateFolder('packs', 'packs', data),
          this.findOrCreateFolder('blobs', 'blobs', data),
        ]);
        return { root, data, packs, blobs };
      })().catch((e) => {
        this.folders = undefined;
        throw e;
      });
    }
    return this.folders;
  }

  private async upload(meta: Record<string, unknown>, body: Blob, fileId?: string): Promise<DriveFile> {
    const boundary = 'rc' + Math.random().toString(36).slice(2);
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${body.type || 'application/octet-stream'}\r\n\r\n`;
    const multipart = new Blob([head, body, `\r\n--${boundary}--`]);
    const url = fileId
      ? `${UPLOAD}/files/${fileId}?uploadType=multipart&fields=id,name,version`
      : `${UPLOAD}/files?uploadType=multipart&fields=id,name,version`;
    return this.json<DriveFile>(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
  }

  private async download(fileId: string): Promise<Response> {
    return this.request(`${API}/files/${fileId}?alt=media`);
  }

  // ---------- packs ----------

  async listPacks(): Promise<PackRef[]> {
    const { packs } = await this.ensureFolders();
    const files = await this.list(`'${packs}' in parents and trashed=false`, 'files(id,name)');
    return files
      .map((f) => ({ id: f.name.replace(/\.json$/, ''), ref: f.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async readPack(ref: string): Promise<Pack> {
    return (await this.download(ref)).json();
  }

  async writePack(pack: Pack): Promise<void> {
    const { packs } = await this.ensureFolders();
    await this.upload({ name: `${pack.id}.json`, parents: [packs], mimeType: 'application/json' }, new Blob([JSON.stringify(pack)], { type: 'application/json' }));
  }

  async deletePacks(refs: string[]): Promise<void> {
    for (const ref of refs) {
      await this.request(`${API}/files/${ref}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }

  // ---------- blobs ----------

  private async blobId(hash: Hash): Promise<string | undefined> {
    if (this.blobIds.has(hash)) return this.blobIds.get(hash);
    const { blobs } = await this.ensureFolders();
    const f = (await this.list(`name='${hash}' and '${blobs}' in parents and trashed=false`, 'files(id,name)'))[0];
    if (f) this.blobIds.set(hash, f.id);
    return f?.id;
  }

  async readBlob(hash: Hash): Promise<Uint8Array | undefined> {
    const id = await this.blobId(hash);
    if (!id) return undefined;
    return new Uint8Array(await (await this.download(id)).arrayBuffer());
  }

  async writeBlob(hash: Hash, data: Uint8Array): Promise<void> {
    if (await this.blobId(hash)) return;
    const { blobs } = await this.ensureFolders();
    const f = await this.upload({ name: hash, parents: [blobs] }, new Blob([data as BlobPart]));
    this.blobIds.set(hash, f.id);
  }

  // ---------- index ----------

  private async findIndex(): Promise<DriveFile | undefined> {
    if (this.indexFileId) {
      return this.json<DriveFile>(`${API}/files/${this.indexFileId}?fields=id,name,version`).catch(() => undefined);
    }
    const { data } = await this.ensureFolders();
    const f = (await this.list(`name='index.json' and '${data}' in parents and trashed=false`))[0];
    if (f) this.indexFileId = f.id;
    return f;
  }

  async readIndex(): Promise<IndexSnapshot> {
    const f = await this.findIndex();
    if (!f) return { index: null, version: null };
    const index = (await (await this.download(f.id)).json()) as RemoteIndex;
    return { index, version: f.version ?? null };
  }

  async writeIndex(index: RemoteIndex, expected: string | null): Promise<string | null> {
    const f = await this.findIndex();
    const current = f?.version ?? null;
    if (current !== expected) return null;
    const body = new Blob([JSON.stringify(index)], { type: 'application/json' });
    if (f) {
      const r = await this.upload({}, body, f.id);
      return r.version ?? String(Date.now());
    }
    const { data } = await this.ensureFolders();
    const r = await this.upload({ name: 'index.json', parents: [data], mimeType: 'application/json' }, body);
    this.indexFileId = r.id;
    return r.version ?? String(Date.now());
  }

  // ---------- readable mirror ----------

  async mirror(doc: DocMeta, files: Record<string, Uint8Array>, pdf?: Uint8Array): Promise<void> {
    const { root } = await this.ensureFolders();
    let folder = this.docFolders.get(doc.id);
    if (!folder) {
      const found = (await this.list(`mimeType='${FOLDER}' and trashed=false and '${root}' in parents and appProperties has { key='doc' and value='${doc.id}' }`))[0];
      folder = found
        ? { id: found.id, name: found.name }
        : {
            id: (
              await this.json<DriveFile>(`${API}/files?fields=id`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: doc.name, mimeType: FOLDER, parents: [root], appProperties: { doc: doc.id } }),
              })
            ).id,
            name: doc.name,
          };
      this.docFolders.set(doc.id, folder);
    }
    // Follow document renames (also after the folder id was cached).
    if (folder.name !== doc.name) {
      await this.request(`${API}/files/${folder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: doc.name }),
      });
      folder.name = doc.name;
    }
    const folderId = folder.id;
    const existing = new Map((await this.list(`'${folderId}' in parents and trashed=false`)).map((f) => [f.name, f.id]));
    const wanted = new Map<string, Uint8Array>();
    for (const [path, data] of Object.entries(files)) wanted.set(path.replace(/\//g, ' ∕ '), data);
    if (pdf) wanted.set(`${doc.name.replace(/[\\/]/g, '-')}.pdf`, pdf);
    for (const [name, data] of wanted) {
      const type = name.endsWith('.pdf') ? 'application/pdf' : name.endsWith('.tex') ? 'text/x-tex' : 'application/octet-stream';
      await this.upload(existing.has(name) ? {} : { name, parents: [folderId] }, new Blob([data as BlobPart], { type }), existing.get(name));
    }
    for (const [name, id] of existing) {
      if (!wanted.has(name)) await this.request(`${API}/files/${id}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }

  async userInfo(): Promise<{ name?: string; email?: string; photo?: string }> {
    const r = await this.json<{ user?: { displayName?: string; emailAddress?: string; photoLink?: string } }>(`${API}/about?fields=user(displayName,emailAddress,photoLink)`);
    return { name: r.user?.displayName, email: r.user?.emailAddress, photo: r.user?.photoLink };
  }

  /** Download a file the user picked in Google Picker (drive.file grants access to it). */
  async downloadPicked(fileId: string): Promise<{ name: string; data: Uint8Array }> {
    const meta = await this.json<DriveFile>(`${API}/files/${fileId}?fields=id,name,mimeType`);
    const data = new Uint8Array(await (await this.download(fileId)).arrayBuffer());
    return { name: meta.name, data };
  }
}
