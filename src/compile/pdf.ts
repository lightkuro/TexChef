import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy };

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  destroy: () => void;
}

export async function openPdf(data: Uint8Array): Promise<LoadedPdf> {
  // pdf.js transfers the buffer to its worker, so hand it a copy.
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
