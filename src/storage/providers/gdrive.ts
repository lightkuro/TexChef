import type { DocMeta, Hash } from '@/core/model';
import { packDocId, type HeadRef, type IndexSnapshot, type Pack, type PackRef, type RemoteIndex, type SyncProvider } from '../sync/types';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
/** Experimental AI agents folder, inside TexChef/ (only when the person turns it on). */
export const AGENTS_FOLDER = 'Agents(optional_AI)';
export const AGENTS_README = 'Read me first (for AI agents).md';

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
 *   TexChef/                      (visible; readable copies of each document + PDFs)
 *     <Document name>/ main.tex, …, <Document name>.pdf
 *     Agents(optional_AI)/          (only if turned on in Settings → Experimental) read-me + replies from AI agents
 *     .texchef/
 *       index.json                   document metadata + heads (compare-and-swap via Drive `version`)
 *       packs/<doc>~<id>.json        immutable bundles of one document's versions (earlier: <id>.json, several documents)
 *       heads/<doc>.json             each document's current version on its own (for devices that take only that)
 *       blobs/<sha256>               bigger files (images, fonts), fetched when needed
 */
export class DriveProvider implements SyncProvider {
  readonly id = 'gdrive';
  private folders?: Promise<{ root: string; data: string; packs: string; blobs: string }>;
  private indexFileId?: string;
  private blobIds = new Map<Hash, string>();
  private headsFolder?: Promise<string>;
  private headIds = new Map<string, string>();
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
    if (found[0]) {
      // Folders are found by role, so a new name (texChef → TexChef) is just a rename.
      if (found[0].name !== name && role === 'root') {
        await this.json(`${API}/files/${found[0].id}?fields=id`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }).catch(() => undefined);
      }
      return found[0].id;
    }
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
        const root = await this.findOrCreateFolder('TexChef', 'root');
        const data = await this.findOrCreateFolder('.texchef', 'data', root);
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
      .map((f) => {
        const id = f.name.replace(/\.json$/, '');
        return { id, ref: f.id, docId: packDocId(id) };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async readPack(ref: string): Promise<Pack> {
    return (await this.download(ref)).json();
  }

  async writePack(pack: Pack): Promise<string> {
    const { packs } = await this.ensureFolders();
    const f = await this.upload({ name: `${pack.id}.json`, parents: [packs], mimeType: 'application/json' }, new Blob([JSON.stringify(pack)], { type: 'application/json' }));
    return f.id;
  }

  // ---------- current versions ----------

  private heads(): Promise<string> {
    this.headsFolder ??= this.ensureFolders()
      .then(({ data }) => this.findOrCreateFolder('heads', 'heads', data))
      .catch((e) => {
        this.headsFolder = undefined;
        throw e;
      });
    return this.headsFolder;
  }

  async listHeads(): Promise<Map<string, HeadRef>> {
    const folder = await this.heads();
    const out = new Map<string, HeadRef>();
    for (const f of await this.list(`'${folder}' in parents and trashed=false`, 'files(id,name,appProperties)')) {
      const docId = f.name.replace(/\.json$/, '');
      out.set(docId, { ref: f.id, head: f.appProperties?.head });
      this.headIds.set(docId, f.id);
    }
    return out;
  }

  async readHead(ref: string): Promise<Pack> {
    return (await this.download(ref)).json();
  }

  async writeHead(docId: string, pack: Pack, ref?: string): Promise<string> {
    const folder = await this.heads();
    const body = new Blob([JSON.stringify(pack)], { type: 'application/json' });
    const appProperties = { head: pack.commits[0]?.id ?? '' };
    let id = ref ?? this.headIds.get(docId);
    // Not seen in this session: it may still exist (written by another device).
    if (!id) id = (await this.list(`name='${docId}.json' and '${folder}' in parents and trashed=false`, 'files(id,name)'))[0]?.id;
    const f = id ? await this.upload({ appProperties }, body, id) : await this.upload({ name: `${docId}.json`, parents: [folder], mimeType: 'application/json', appProperties }, body);
    this.headIds.set(docId, f.id);
    return f.id;
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

  async readIndex(known?: string | null): Promise<IndexSnapshot> {
    const f = await this.findIndex();
    if (!f) return { index: null, version: null };
    // Nothing changed since the caller last looked: no need to download it again.
    if (known && f.version === known) return { index: null, version: known, unchanged: true };
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

  /** Passed in `keep` for the PDF. */
  static readonly PDF = '@pdf';

  /**
   * `keep`: paths (and `DriveProvider.PDF`) whose copy in Drive is already right. They are not sent again,
   * and are left in place.
   */
  async mirror(doc: DocMeta, files: Record<string, Uint8Array>, pdf?: Uint8Array, keep: Set<string> = new Set()): Promise<void> {
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
    // null: keep the copy that is there.
    const wanted = new Map<string, Uint8Array | null>();
    const fileName = (path: string) => path.replace(/\//g, ' ∕ ');
    for (const [path, data] of Object.entries(files)) wanted.set(fileName(path), keep.has(path) && existing.has(fileName(path)) ? null : data);
    for (const path of keep) if (path !== DriveProvider.PDF && !(path in files) && existing.has(fileName(path))) wanted.set(fileName(path), null);
    const pdfName = `${doc.name.replace(/[\\/]/g, '-')}.pdf`;
    if (pdf) wanted.set(pdfName, pdf);
    else if (keep.has(DriveProvider.PDF)) {
      // The PDF follows a rename of the document.
      const old = [...existing.keys()].find((n) => n.endsWith('.pdf'));
      if (old && old !== pdfName) {
        await this.request(`${API}/files/${existing.get(old)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: pdfName }) });
        existing.set(pdfName, existing.get(old)!);
        existing.delete(old);
      }
      if (existing.has(pdfName)) wanted.set(pdfName, null);
    }
    for (const [name, data] of wanted) {
      if (!data) continue;
      const type = name.endsWith('.pdf') ? 'application/pdf' : name.endsWith('.tex') ? 'text/x-tex' : 'application/octet-stream';
      await this.upload(existing.has(name) ? {} : { name, parents: [folderId] }, new Blob([data as BlobPart], { type }), existing.get(name));
    }
    for (const [name, id] of existing) {
      if (!wanted.has(name)) await this.request(`${API}/files/${id}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }

  /** Drive folder holding a document's readable copy, if it was mirrored in this session or exists. */
  async docFolder(docId: string): Promise<{ id: string; name: string } | undefined> {
    if (this.docFolders.has(docId)) return this.docFolders.get(docId);
    const { root } = await this.ensureFolders();
    const found = (await this.list(`mimeType='${FOLDER}' and trashed=false and '${root}' in parents and appProperties has { key='doc' and value='${docId}' }`))[0];
    if (found) this.docFolders.set(docId, { id: found.id, name: found.name });
    return found && { id: found.id, name: found.name };
  }

  // ---------- AI agents folder (experimental, opt-in) ----------

  /** TexChef/Agents(optional_AI) and its Done subfolder, made only when the person turns the feature on. */
  async ensureAgentsFolder(): Promise<{ folder: string; done: string }> {
    const { root } = await this.ensureFolders();
    const folder = await this.findOrCreateFolder(AGENTS_FOLDER, 'agents', root);
    const done = await this.findOrCreateFolder('Done', 'agents-done', folder);
    return { folder, done };
  }

  /** The Agents folder's id if it exists (never creates it). */
  async findAgentsFolder(): Promise<string | undefined> {
    const { root } = await this.ensureFolders();
    return (await this.list(`mimeType='${FOLDER}' and trashed=false and '${root}' in parents and appProperties has { key='rc' and value='agents' }`))[0]?.id;
  }

  /** Write (or rewrite) the instructions file agents read first. */
  async writeAgentsReadme(markdown: string): Promise<void> {
    const { folder } = await this.ensureAgentsFolder();
    const found = (await this.list(`'${folder}' in parents and trashed=false and appProperties has { key='rc' and value='agents-readme' }`))[0];
    const body = new Blob([markdown], { type: 'text/markdown' });
    if (found) await this.upload({ name: AGENTS_README }, body, found.id);
    else await this.upload({ name: AGENTS_README, parents: [folder], mimeType: 'text/markdown', appProperties: { rc: 'agents-readme' } }, body);
  }

  /**
   * Replies TexChef can already see in the Agents folder (not in Done, not the read-me). With the
   * `drive.file` permission that is only files it made or the person picked; others need the picker.
   */
  async listAgentReplies(): Promise<{ id: string; name: string }[]> {
    const folder = await this.findAgentsFolder();
    if (!folder) return [];
    const files = await this.list(`'${folder}' in parents and trashed=false and mimeType!='${FOLDER}'`, 'files(id,name,mimeType,appProperties)');
    return files.filter((f) => f.appProperties?.rc !== 'agents-readme').map((f) => ({ id: f.id, name: f.name }));
  }

  /** The files (not folders) directly inside a folder, as far as this app may see them. */
  async listFilesIn(folderId: string): Promise<{ id: string; name: string }[]> {
    const files = await this.list(`'${folderId}' in parents and trashed=false and mimeType!='${FOLDER}'`, 'files(id,name,mimeType,appProperties)');
    return files.filter((f) => f.appProperties?.rc !== 'agents-readme').map((f) => ({ id: f.id, name: f.name }));
  }

  /** A file's text; Google Docs are exported as plain text. */
  async readText(fileId: string): Promise<{ name: string; text: string }> {
    const meta = await this.json<DriveFile>(`${API}/files/${fileId}?fields=id,name,mimeType`);
    const res = meta.mimeType?.startsWith('application/vnd.google-apps.')
      ? await this.request(`${API}/files/${fileId}/export?mimeType=text/plain`)
      : await this.download(fileId);
    return { name: meta.name, text: await res.text() };
  }

  /** Move a file into another folder (e.g. a handled reply into Agents/Done). */
  async moveTo(fileId: string, folderId: string): Promise<void> {
    const meta = await this.json<{ parents?: string[] }>(`${API}/files/${fileId}?fields=parents`);
    const params = new URLSearchParams({ addParents: folderId, removeParents: (meta.parents ?? []).join(','), fields: 'id' });
    await this.request(`${API}/files/${fileId}?${params}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  }

  /** Move the Agents folder to the Drive trash (when the person turns the feature off and asks to). */
  async trashAgentsFolder(): Promise<boolean> {
    const id = await this.findAgentsFolder();
    if (!id) return false;
    await this.request(`${API}/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
    return true;
  }

  /** Save one file (e.g. a backup .zip) in the user's Drive, in TexChef/<sub>. Returns its id. */
  async saveExport(sub: string, name: string, data: Uint8Array, type: string): Promise<string> {
    const { root } = await this.ensureFolders();
    const folder = await this.findOrCreateFolder(sub, `export-${sub.toLowerCase()}`, root);
    return (await this.upload({ name, parents: [folder] }, new Blob([data as BlobPart], { type }))).id;
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
