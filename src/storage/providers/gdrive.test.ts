import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveProvider } from './gdrive';
import { RCDatabase } from '@/storage/db';
import { Repo, fileText } from '@/core/repo';
import { SyncEngine } from '@/storage/sync/engine';

/** A small in-memory imitation of the Drive v3 REST endpoints the provider uses. */
class FakeDrive {
  files = new Map<string, { id: string; name: string; mimeType?: string; parents: string[]; appProperties: Record<string, string>; data: Uint8Array; version: number; trashed: boolean }>();
  next = 1;
  calls: string[] = [];

  private match(q: string) {
    const conds: ((f: FakeDrive['files'] extends Map<string, infer F> ? F : never) => boolean)[] = [];
    const s = q.replace(/appProperties has \{ key='([^']+)' and value='([^']+)' \}/g, (_m, k: string, v: string) => {
      conds.push((f) => f.appProperties[k] === v);
      return '';
    });
    for (const m of s.matchAll(/mimeType='([^']+)'/g)) conds.push((f) => f.mimeType === m[1]);
    for (const m of s.matchAll(/mimeType!='([^']+)'/g)) conds.push((f) => f.mimeType !== m[1]);
    for (const m of s.matchAll(/'([^']+)' in parents/g)) conds.push((f) => f.parents.includes(m[1]));
    for (const m of s.matchAll(/(?<![A-Za-z])name='([^']+)'/g)) conds.push((f) => f.name === m[1]);
    if (/trashed=false/.test(s)) conds.push((f) => !f.trashed);
    return [...this.files.values()].filter((f) => conds.every((c) => c(f)));
  }

  private meta(f: { id: string; name: string; version: number; appProperties: Record<string, string>; mimeType?: string }) {
    return { id: f.id, name: f.name, version: String(f.version), appProperties: f.appProperties, mimeType: f.mimeType, parents: (f as { parents?: string[] }).parents };
  }

  private async multipart(init: RequestInit) {
    const type = (init.headers as Record<string, string>)['Content-Type'];
    const boundary = /boundary=(.+)$/.exec(type)![1];
    const bytes = new Uint8Array(await (init.body as Blob).arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    const metaStart = text.indexOf('\r\n\r\n') + 4;
    const metaEnd = text.indexOf(`\r\n--${boundary}`, metaStart);
    const meta = JSON.parse(text.slice(metaStart, metaEnd));
    const bodyStart = text.indexOf('\r\n\r\n', metaEnd) + 4;
    const bodyEnd = text.lastIndexOf(`\r\n--${boundary}--`);
    return { meta, data: bytes.slice(bodyStart, bodyEnd) };
  }

  fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    this.calls.push(`${method} ${url.pathname}`);
    const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
    const exportMatch = /\/files\/([^/]+)\/export$/.exec(url.pathname);
    if (exportMatch) {
      const f = this.files.get(exportMatch[1]);
      return f ? new Response(f.data as BlobPart) : new Response('not found', { status: 404 });
    }
    const idMatch = /\/files\/([^/]+)$/.exec(url.pathname);
    if (url.pathname.endsWith('/about')) return json({ user: { displayName: 'Test', emailAddress: 't@example.com' } });
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const all = this.match(url.searchParams.get('q') ?? '');
      // Two results per page, to exercise pagination.
      const start = Number(url.searchParams.get('pageToken') || 0);
      const page = all.slice(start, start + 2);
      return json({ files: page.map((f) => this.meta(f)), nextPageToken: start + 2 < all.length ? String(start + 2) : undefined });
    }
    if (url.pathname === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(init.body as string);
      const id = `f${this.next++}`;
      this.files.set(id, { id, name: meta.name, mimeType: meta.mimeType, parents: meta.parents ?? [], appProperties: meta.appProperties ?? {}, data: new Uint8Array(), version: 1, trashed: false });
      return json({ id });
    }
    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const { meta, data } = await this.multipart(init);
      const id = `f${this.next++}`;
      const f = { id, name: meta.name, mimeType: meta.mimeType ?? 'text/plain', parents: meta.parents ?? [], appProperties: meta.appProperties ?? {}, data, version: 1, trashed: false };
      this.files.set(id, f);
      return json(this.meta(f));
    }
    if (idMatch) {
      const f = this.files.get(idMatch[1]);
      if (!f) return new Response('not found', { status: 404 });
      if (method === 'DELETE') {
        this.files.delete(f.id);
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH' && url.pathname.startsWith('/upload/')) {
        const { meta, data } = await this.multipart(init);
        Object.assign(f, { name: meta.name ?? f.name, data, version: f.version + 1, appProperties: { ...f.appProperties, ...(meta.appProperties ?? {}) } });
        return json(this.meta(f));
      }
      if (method === 'PATCH') {
        const add = url.searchParams.get('addParents');
        if (add) f.parents = [...f.parents.filter((p) => !(url.searchParams.get('removeParents') ?? '').split(',').includes(p)), add];
        Object.assign(f, JSON.parse(init.body as string), { version: f.version + 1 });
        return json(this.meta(f));
      }
      if (url.searchParams.get('alt') === 'media') return new Response(f.data as BlobPart);
      return json(this.meta(f));
    }
    return new Response(`unhandled ${method} ${url}`, { status: 500 });
  };
}

let n = 0;
function device() {
  const repo = new Repo(new RCDatabase(`gdrive-${n++}`));
  const provider = new DriveProvider(async () => 'token');
  return { repo, provider, engine: new SyncEngine(repo, provider) };
}

describe('DriveProvider against a fake Drive API', () => {
  let drive: FakeDrive;
  beforeEach(() => {
    drive = new FakeDrive();
    vi.stubGlobal('fetch', drive.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renames a folder made before the TexChef rename instead of making another', async () => {
    drive.files.set('old', { id: 'old', name: 'texChef', mimeType: 'application/vnd.google-apps.folder', parents: [], appProperties: { rc: 'root' }, data: new Uint8Array(), version: 1, trashed: false });
    const A = device();
    await A.repo.createDoc({ name: 'Doc', files: { 'main.tex': { kind: 'text', text: 'x' } } });
    await A.engine.sync();
    const roots = [...drive.files.values()].filter((f) => f.appProperties.rc === 'root');
    expect(roots.map((f) => [f.id, f.name])).toEqual([['old', 'TexChef']]);
  });

  it('creates its folders once and syncs documents between two devices', async () => {
    const A = device();
    const B = device();
    const doc = await A.repo.createDoc({ name: 'Master', files: { 'main.tex': { kind: 'text', text: 'hello' } } });
    const photo = new Uint8Array(400 * 1024).map((_, i) => i % 251);
    await A.repo.addBinaryFile(doc.id, 'photo.jpg', photo);
    await A.repo.commitWork(doc.id, 'photo');
    await A.engine.sync();
    await B.engine.sync();
    const folders = [...drive.files.values()].filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
    expect(folders.map((f) => f.name).sort()).toEqual(['.texchef', 'TexChef', 'blobs', 'heads', 'packs']);

    B.repo.blobFetcher = (h) => B.provider.readBlob(h);
    const work = await B.repo.getWork(doc.id);
    expect(fileText(work.files, 'main.tex')).toBe('hello');
    const ph = work.files['photo.jpg'];
    expect(ph.kind).toBe('binary');
    expect(await B.repo.getBlob((ph as { hash: string }).hash)).toEqual(photo);

    // Edits flow back, across several packs (paginated listing).
    for (let i = 0; i < 3; i++) {
      await B.repo.writeWorkText(doc.id, 'main.tex', `edit ${i}`);
      await B.repo.commitWork(doc.id, `edit ${i}`);
      await B.engine.sync();
    }
    await A.engine.sync();
    expect(fileText((await A.repo.getWork(doc.id)).files, 'main.tex')).toBe('edit 2');
  });

  it('refuses an index write when another device wrote first', async () => {
    const A = device();
    await A.repo.createDoc({ name: 'Doc', files: { 'main.tex': { kind: 'text', text: 'x' } } });
    await A.engine.sync();
    const snap = await A.provider.readIndex();
    expect(snap.version).toBe('1');
    expect(await A.provider.writeIndex(snap.index!, snap.version)).toBe('2');
    expect(await A.provider.writeIndex(snap.index!, snap.version)).toBeNull();
  });

  it('makes the Agents folder only when asked; read-me, replies, Done and trash', async () => {
    const A = device();
    await A.provider.mirror((await A.repo.createDoc({ name: 'Resume', files: { 'main.tex': { kind: 'text', text: 'x' } } })), { 'main.tex': new TextEncoder().encode('x') });
    const named = (name: string) => [...drive.files.values()].filter((f) => f.name === name && !f.trashed);
    expect(named('Agents(optional_AI)')).toHaveLength(0);
    expect(await A.provider.listAgentReplies()).toEqual([]);
    await A.provider.writeAgentsReadme('# v1');
    await A.provider.writeAgentsReadme('# v2');
    const [agents] = named('Agents(optional_AI)');
    const readmes = named('Read me first (for AI agents).md');
    expect(readmes).toHaveLength(1);
    expect(new TextDecoder().decode(readmes[0].data)).toBe('# v2');
    // A reply TexChef can see (in real Drive: one it was given access to).
    drive.files.set('r1', { id: 'r1', name: 'Resume - Acme.tex', mimeType: 'text/plain', parents: [agents.id], appProperties: {}, data: new TextEncoder().encode('% texchef-reply doc=x'), version: 1, trashed: false });
    drive.files.set('g1', { id: 'g1', name: 'Resume - doc', mimeType: 'application/vnd.google-apps.document', parents: [agents.id], appProperties: {}, data: new TextEncoder().encode('from a doc'), version: 1, trashed: false });
    expect((await A.provider.listAgentReplies()).map((f) => f.id).sort()).toEqual(['g1', 'r1']);
    expect(await A.provider.readText('r1')).toEqual({ name: 'Resume - Acme.tex', text: '% texchef-reply doc=x' });
    expect((await A.provider.readText('g1')).text).toBe('from a doc');
    const { done } = await A.provider.ensureAgentsFolder();
    await A.provider.moveTo('r1', done);
    expect(drive.files.get('r1')!.parents).toEqual([done]);
    expect((await A.provider.listAgentReplies()).map((f) => f.id)).toEqual(['g1']);
    expect(await A.provider.trashAgentsFolder()).toBe(true);
    expect(named('Agents(optional_AI)')).toHaveLength(0);
  });

  it('keeps a readable mirror of each document and its PDF', async () => {
    const A = device();
    const doc = await A.repo.createDoc({ name: 'Resume', files: { 'main.tex': { kind: 'text', text: 'x' } } });
    const enc = (s: string) => new TextEncoder().encode(s);
    await A.provider.mirror(doc, { 'main.tex': enc('v1'), 'sections/a.tex': enc('a') }, enc('%PDF-1'));
    await A.provider.mirror({ ...doc, name: 'Resume v2' }, { 'main.tex': enc('v2') });
    const folder = [...drive.files.values()].find((f) => f.appProperties.doc === doc.id)!;
    expect(folder.name).toBe('Resume v2');
    const inside = [...drive.files.values()].filter((f) => f.parents.includes(folder.id));
    expect(inside.map((f) => f.name).sort()).toEqual(['main.tex']);
    expect(new TextDecoder().decode(inside[0].data)).toBe('v2');
  });

  it('a light device takes current versions from head files; an unchanged index is not downloaded again', async () => {
    const A = device();
    const one = await A.repo.createDoc({ name: 'One', files: { 'main.tex': { kind: 'text', text: 'v1' } } });
    await A.repo.writeWorkText(one.id, 'main.tex', 'v2');
    await A.repo.commitWork(one.id, 'v2');
    const logo = new Uint8Array(100 * 1024).map((_, i) => i % 250);
    await A.repo.addBinaryFile(one.id, 'logo.png', logo);
    await A.repo.commitWork(one.id, 'logo');
    await A.engine.sync();
    const heads = [...drive.files.values()].filter((f) => f.name === `${one.id}.json`);
    expect(heads).toHaveLength(1);
    expect(heads[0].appProperties.head).toBe((await A.repo.getDoc(one.id))!.head);
    // The logo is too big to ride along: it is stored on its own.
    expect(new TextDecoder().decode(heads[0].data).length).toBeLessThan(20 * 1024);

    const B = device();
    B.engine.mode = 'needed';
    B.repo.blobFetcher = (h) => B.provider.readBlob(h);
    drive.calls.length = 0;
    await B.engine.sync();
    const packDownloads = () => drive.calls.filter((c) => c.startsWith('GET /drive/v3/files/')).length;
    expect(await B.repo.docCommits(one.id)).toHaveLength(1);
    const work = await B.repo.getWork(one.id);
    expect(fileText(work.files, 'main.tex')).toBe('v2');
    expect(await B.repo.getBlob((work.files['logo.png'] as { hash: string }).hash)).toEqual(logo);

    // A second version: the same head file is replaced, not added to.
    await A.repo.writeWorkText(one.id, 'main.tex', 'v3');
    await A.repo.commitWork(one.id, 'v3');
    await A.engine.sync();
    expect([...drive.files.values()].filter((f) => f.name === `${one.id}.json`)).toHaveLength(1);
    await B.engine.sync();
    expect(fileText((await B.repo.getWork(one.id)).files, 'main.tex')).toBe('v3');

    // Idle: one listing of packs and one look at the index's version; the index itself is not fetched.
    const before = packDownloads();
    drive.calls.length = 0;
    await B.engine.sync();
    expect(drive.calls.filter((c) => c.includes('alt=media') || /files\/f\d+$/.test(c)).length).toBeLessThanOrEqual(1);
    expect(before).toBeGreaterThan(0);
  });

  it('the readable copy sends only what changed', async () => {
    const A = device();
    const doc = await A.repo.createDoc({ name: 'Resume', files: { 'main.tex': { kind: 'text', text: 'x' } } });
    const enc = (s: string) => new TextEncoder().encode(s);
    await A.provider.mirror(doc, { 'main.tex': enc('v1'), 'refs.bib': enc('b') }, enc('%PDF-1'));
    const uploads = () => drive.calls.filter((c) => c.includes('/upload/')).length;
    const before = uploads();
    await A.provider.mirror(doc, { 'main.tex': enc('v2'), 'refs.bib': enc('b') }, undefined, new Set(['refs.bib', DriveProvider.PDF]));
    expect(uploads() - before).toBe(1);
    const folder = [...drive.files.values()].find((f) => f.appProperties.doc === doc.id)!;
    const inside = [...drive.files.values()].filter((f) => f.parents.includes(folder.id));
    expect(inside.map((f) => f.name).sort()).toEqual(['Resume.pdf', 'main.tex', 'refs.bib']);
    expect(new TextDecoder().decode(inside.find((f) => f.name === 'main.tex')!.data)).toBe('v2');
    // A rename carries the kept PDF along.
    await A.provider.mirror({ ...doc, name: 'CV' }, { 'main.tex': enc('v2'), 'refs.bib': enc('b') }, undefined, new Set(['main.tex', 'refs.bib', DriveProvider.PDF]));
    expect([...drive.files.values()].filter((f) => f.parents.includes(folder.id)).map((f) => f.name).sort()).toEqual(['CV.pdf', 'main.tex', 'refs.bib']);
  });
});
