import type * as PdfJsModern from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

type PdfJs = typeof PdfJsModern;

/**
 * Whether this browser has every newer JavaScript feature the modern pdf.js build calls without a
 * fallback. Browsers missing any (Safari, for now: no Map.getOrInsertComputed) get the legacy build,
 * which brings its own copies. The list matches what the legacy build polyfills.
 */
export function modernPdfJsSupported(g: typeof globalThis = globalThis): boolean {
  const has = (o: unknown, ...names: string[]) => !!o && names.every((n) => typeof (o as Record<string, unknown>)[n] === 'function');
  const iter = (g as { Iterator?: { prototype?: unknown } }).Iterator?.prototype;
  try {
    return (
      has(g.Map?.prototype, 'getOrInsert', 'getOrInsertComputed') &&
      has(g.WeakMap?.prototype, 'getOrInsert', 'getOrInsertComputed') &&
      has(g.Math, 'sumPrecise') &&
      has(g.Promise, 'try') &&
      has(g.Set?.prototype, 'union', 'intersection', 'difference', 'symmetricDifference', 'isSubsetOf', 'isSupersetOf', 'isDisjointFrom') &&
      has(iter, 'map', 'filter', 'take', 'drop', 'flatMap', 'some', 'every', 'find', 'forEach', 'toArray') &&
      has(g.Uint8Array, 'fromBase64') &&
      has(g.Uint8Array?.prototype, 'toBase64', 'toHex', 'setFromBase64', 'setFromHex', 'with') &&
      has(g.URL, 'parse')
    );
  } catch {
    return false;
  }
}

/** Which pdf.js build this browser uses (set once it loads). */
export let pdfJsBuild: 'modern' | 'legacy' | undefined;

let loading: Promise<PdfJs> | undefined;

/** pdf.js, loaded on first use: the modern build where it works, the legacy one where it doesn't. */
export function loadPdfJs(): Promise<PdfJs> {
  loading ??= (async () => {
    const modern = modernPdfJsSupported();
    const [lib, worker] = modern
      ? await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
      : await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<unknown> as Promise<PdfJs>, import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    pdfJsBuild = modern ? 'modern' : 'legacy';
    if (import.meta.env.DEV) (window as unknown as { rcPdfJs?: string }).rcPdfJs = pdfJsBuild;
    return lib;
  })().catch((e) => {
    loading = undefined;
    throw e;
  });
  return loading;
}

export type { PDFDocumentProxy };

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  destroy: () => void;
}

export async function openPdf(data: Uint8Array): Promise<LoadedPdf> {
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: data.slice() });
  const doc = await task.promise;
  return { doc, destroy: () => void task.destroy() };
}

export async function pageCount(data: Uint8Array): Promise<number> {
  const { doc, destroy } = await openPdf(data);
  const n = doc.numPages;
  destroy();
  return n;
}

export async function renderThumbnail(data: Uint8Array, width = 220): Promise<{ pages: number; thumbnail: string }> {
  const { doc, destroy } = await openPdf(data);
  try {
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const scale = (width * 2) / vp.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return { pages: doc.numPages, thumbnail: canvas.toDataURL('image/jpeg', 0.82) };
  } finally {
    destroy();
  }
}

export async function pdfText(data: Uint8Array): Promise<string> {
  const { doc, destroy } = await openPdf(data);
  try {
    let out = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      out += tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
    }
    return out;
  } finally {
    destroy();
  }
}
