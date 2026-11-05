import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { decodeSynctex, parseSynctex, pdfToSource, sourceToPdf } from './synctex';

// Shape of real BusyTeX output: sp units, 1in offsets already applied, project files under project_dir.
const SP = (bp: number) => Math.round((bp * 72.27 * 65536) / 72);
const sample = [
  'SyncTeX Version:1',
  'Input:1:/home/web_user/project_dir/./main.tex',
  'Input:2:/texlive/texmf-dist/tex/latex/base/article.cls',
  'Output:pdf',
  'Magnification:1000',
  'Unit:1',
  'X Offset:0',
  'Y Offset:0',
  'Content:',
  '!100',
  '{1',
  `[1,30:${SP(40)},${SP(700)}:${SP(530)},${SP(650)},0`,
  `(1,12:${SP(40)},${SP(48)}:${SP(530)},${SP(9)},${SP(2)}`,
  `x1,12:${SP(245)},${SP(48)}`,
  ')',
  `(1,20:${SP(50)},${SP(195)}:${SP(500)},${SP(7)},${SP(2)}`,
  `x1,20:${SP(60)},${SP(195)}`,
  `g1,20:${SP(300)},${SP(195)}`,
  ')',
  `h2,99:${SP(10)},${SP(10)}:${SP(5)},${SP(5)},0`,
  'Input:3:/home/web_user/project_dir/./sections/exp.tex',
  `(3,4:${SP(50)},${SP(300)}:${SP(400)},${SP(7)},${SP(2)}`,
  ')',
  ']',
  '}1',
  'Postamble:',
].join('\n');

describe('synctex', () => {
  it('decodes gzip and parses project records in PDF points', async () => {
    const text = await decodeSynctex(new Uint8Array(gzipSync(sample)));
    const data = parseSynctex(text);
    expect(data.pages).toBe(1);
    expect(data.records.every((r) => r.file === 'main.tex' || r.file === 'sections/exp.tex')).toBe(true);
    const header = data.records.find((r) => r.line === 12 && r.kind === 'hbox')!;
    expect(header.x).toBeCloseTo(40, 1);
    expect(header.y).toBeCloseTo(48, 1);
    expect(header.w).toBeCloseTo(530, 1);
  });

  it('maps a click in the PDF to the source line', () => {
    const data = parseSynctex(sample);
    expect(pdfToSource(data, 1, 250, 45)).toEqual({ file: 'main.tex', line: 12 });
    expect(pdfToSource(data, 1, 120, 193)).toEqual({ file: 'main.tex', line: 20 });
    expect(pdfToSource(data, 1, 200, 297)).toEqual({ file: 'sections/exp.tex', line: 4 });
    expect(pdfToSource(data, 2, 200, 297)).toBeUndefined();
  });

  it('maps a source line to boxes, falling back to the nearest earlier line', () => {
    const data = parseSynctex(sample);
    const [r] = sourceToPdf(data, 'main.tex', 20);
    expect(r.page).toBe(1);
    expect(r.x).toBeCloseTo(50, 1);
    expect(r.y).toBeLessThan(195);
    expect(sourceToPdf(data, 'main.tex', 15)[0].y).toBeLessThan(48);
    expect(sourceToPdf(data, 'missing.tex', 1)).toEqual([]);
  });
});
