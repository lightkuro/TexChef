import { unzipSync, zipSync, strToU8 } from 'fflate';
import { repo, db } from '@/app/repo';
import type { FileMap } from '@/core/repo';
import { isTextPath, type DocMeta } from '@/core/model';
import { decodeText } from '@/core/hash';
import { downloadBlob, safeFilename } from '@/lib/utils';
import { splitProjects } from './split';
import { isBackup, readBackup, type RestorePlan } from '@/features/workspace/backup';

export { splitProjects };

export interface ImportedProject {
  name: string;
  files: FileMap;
  binaries: Record<string, Uint8Array>;
  mainFile?: string;
}

const IGNORED = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)|\.(aux|log|out|synctex\.gz|fls|fdb_latexmk|toc|bbl|blg)$/i;

function stripCommonRoot(paths: string[]): (p: string) => string {
  const first = paths[0]?.split('/') ?? [];
  if (first.length < 2) return (p) => p;
  const root = first[0] + '/';
  return paths.every((p) => p.startsWith(root)) ? (p) => p.slice(root.length) : (p) => p;
}

export function guessMainFile(files: FileMap): string | undefined {
  const tex = Object.keys(files).filter((p) => p.endsWith('.tex'));
  const withClass = tex.filter((p) => {
    const f = files[p];
    return f.kind === 'text' && /\\documentclass/.test(f.text);
  });
  return (
    withClass.find((p) => /(^|\/)main\.tex$/.test(p)) ??
    withClass.find((p) => !p.includes('/')) ??
    withClass[0] ??
    tex.find((p) => p === 'main.tex') ??
    tex[0]
  );
}

/** Uploaded files (loose files and/or .zip archives) as paths → bytes, plus a name for them. */
async function readEntries(list: File[] | FileList): Promise<{ name: string; entries: Record<string, Uint8Array> }> {
  const entries: Record<string, Uint8Array> = {};
  const loose: Record<string, Uint8Array> = {};
  let name = '';
  for (const file of Array.from(list)) {
    const data = new Uint8Array(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith('.zip')) {
      const zip = unzipSync(data);
      const paths = Object.keys(zip).filter((p) => !p.endsWith('/') && !IGNORED.test(p));
      const strip = stripCommonRoot(paths);
      for (const p of paths) entries[strip(p)] = zip[p];
      name ||= file.name.replace(/\.zip$/i, '');
    } else {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (!IGNORED.test(rel)) loose[rel] = data;
      // A picked folder: name the import after it.
      name ||= rel.includes('/') ? rel.split('/')[0] : file.name.replace(/\.[^.]+$/, '');
    }
  }
  // Files from a picked folder all start with that folder's name: drop it.
  const strip = stripCommonRoot(Object.keys(loose));
  for (const [p, d] of Object.entries(loose)) entries[strip(p)] = d;
  return { name: name || 'Imported document', entries };
}

function toProject(name: string, entries: Record<string, Uint8Array>): ImportedProject {
  const files: FileMap = {};
  const binaries: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(entries)) {
    if (isTextPath(path)) files[path] = { kind: 'text', text: decodeText(data) };
    else binaries[path] = data;
  }
  return { name, files, binaries, mainFile: guessMainFile(files) };
}

/** Read uploaded files (loose files and/or .zip archives) into one project. */
export async function readUploads(list: File[] | FileList): Promise<ImportedProject> {
  const { name, entries } = await readEntries(list);
  return toProject(name, entries);
}

const isMainTex = (path: string, data: Uint8Array) =>
  path.toLowerCase().endsWith('.tex') && /^[^%\n]*\\documentclass/m.test(decodeText(data)) && /\\begin\s*\{document\}/.test(decodeText(data));

export interface ImportPlan {
  /** Name of the upload (the .zip without its extension). */
  name: string;
  /** The upload is a TexChef backup: restore it instead of importing projects. */
  backup?: RestorePlan;
  /** One entry for an ordinary upload, several for a bundle of documents. */
  projects: ImportedProject[];
  /** Files of a bundle that belong to no document (not imported). */
  skipped: string[];
}

/** Work out what an upload contains: one document, or a bundle of several. */
export async function planImport(list: File[] | FileList): Promise<ImportPlan> {
  const { name, entries } = await readEntries(list);
  if (isBackup(entries)) return { name, projects: [], skipped: [], backup: await readBackup(entries) };
  const paths = Object.keys(entries);
  const { roots, leftovers } = splitProjects(paths, (p) => isMainTex(p, entries[p]));
  if (roots.length < 2) return { name, projects: paths.length ? [toProject(name, entries)] : [], skipped: [] };
  const projects = roots
    .map((root) => {
      const own: Record<string, Uint8Array> = {};
      for (const p of paths) if (p.startsWith(root + '/')) own[p.slice(root.length + 1)] = entries[p];
      return toProject(root.split('/').pop() || name, own);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { name, projects, skipped: leftovers };
}

/** Create a document from an imported project. */
export async function createDocumentFromProject(p: ImportedProject, folder?: string): Promise<DocMeta> {
  const files: FileMap = { ...p.files };
  for (const [path, data] of Object.entries(p.binaries)) {
    files[path] = { kind: 'binary', hash: await repo.putBlob(data), size: data.byteLength };
  }
  if (!Object.keys(files).some((f) => f.endsWith('.tex'))) throw new Error('No .tex file found in the upload');
  const main = p.mainFile ?? 'main.tex';
  const mainText = (files[main] as { text?: string })?.text ?? '';
  const engine = /\\usepackage(\[[^\]]*\])?\{fontspec\}|\\setmainfont/.test(mainText) ? 'xelatex' : /\\directlua|\\usepackage(\[[^\]]*\])?\{luacode\}/.test(mainText) ? 'lualatex' : 'pdflatex';
  return repo.createDoc({ name: p.name, files, mainFile: main, engine, folder, kind: 'import', message: 'Imported files' });
}

/** Create a new document from uploads (all files as one document). */
export async function importAsNewDocument(list: File[] | FileList): Promise<DocMeta> {
  return createDocumentFromProject(await readUploads(list));
}

/** Add uploads to an existing document's working copy (zip contents are expanded). */
export async function addUploadsToDocument(docId: string, list: File[] | FileList, folder = ''): Promise<string[]> {
  const p = await readUploads(list);
  const wc = await repo.getWork(docId);
  const files: FileMap = { ...wc.files };
  const prefix = folder ? folder.replace(/\/?$/, '/') : '';
  const added: string[] = [];
  for (const [path, f] of Object.entries(p.files)) {
    files[prefix + path] = f;
    added.push(prefix + path);
  }
  for (const [path, data] of Object.entries(p.binaries)) {
    files[prefix + path] = { kind: 'binary', hash: await repo.putBlob(data), size: data.byteLength };
    added.push(prefix + path);
  }
  await repo.setWorkFiles(docId, files);
  return added;
}

export async function filesToZip(files: FileMap, extra: Record<string, Uint8Array> = {}): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, f] of Object.entries(files)) {
    entries[path] = f.kind === 'text' ? strToU8(f.text) : ((await repo.getBlob(f.hash)) ?? new Uint8Array());
  }
  Object.assign(entries, extra);
  return zipSync(entries, { level: 6 });
}

export async function downloadProjectZip(doc: DocMeta, files: FileMap, pdf?: Uint8Array) {
  const zip = await filesToZip(files, pdf ? { [`${safeFilename(doc.name)}.pdf`]: pdf } : {});
  downloadBlob(zip, `${safeFilename(doc.name)}.zip`, 'application/zip');
}

export function downloadPdf(name: string, pdf: Uint8Array) {
  downloadBlob(pdf, `${safeFilename(name)}.pdf`, 'application/pdf');
}

export function downloadText(name: string, text: string) {
  downloadBlob(text, name, 'text/plain');
}

/** Zip of the latest compiled PDF for every document. */
export async function downloadAllPdfs(): Promise<number> {
  const docs = (await db.docs.toArray()).filter((d) => !d.deleted);
  const entries: Record<string, Uint8Array> = {};
  for (const d of docs) {
    const prev = await db.previews.get(d.id);
    if (prev) entries[`${safeFilename(d.name)}.pdf`] = prev.pdf;
  }
  const n = Object.keys(entries).length;
  if (n) downloadBlob(zipSync(entries), 'TexChef PDFs.zip', 'application/zip');
  return n;
}
