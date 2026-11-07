import { describe, expect, it } from 'vitest';
import { parseSynctex, sourceToPdf } from './synctex';
import { parseTexLog } from './logParser';
import { normalizePath } from '@/lib/paths';

// TeX runs in the main file's folder; these are the paths it reports for vision/main.tex.
const synctex = `SyncTeX Version:1
Input:1:/home/web_user/project_dir/vision/./main.tex
Input:2:/texlive/texmf-dist/tex/latex/base/article.cls
Input:5:/home/web_user/project_dir/vision/./part.tex
Input:7:./sections/intro.tex
Output:pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
!100
{1
(1,3:4736286,4736286:22609920,655360,0
(5,1:4736286,6000000:22609920,655360,0
(7,2:4736286,7000000:22609920,655360,0
}1
`;

describe('main file in a subfolder', () => {
  it('maps SyncTeX inputs to project paths', () => {
    const data = parseSynctex(synctex, 'vision');
    expect([...new Set(data.records.map((r) => r.file))].sort()).toEqual(['vision/main.tex', 'vision/part.tex', 'vision/sections/intro.tex']);
    expect(sourceToPdf(data, 'vision/main.tex', 3)).toHaveLength(1);
    expect(sourceToPdf(data, 'vision/part.tex', 1)).toHaveLength(1);
  });

  it('attributes log errors to the right file', () => {
    const log = [
      '(./main.tex',
      'LaTeX2e <2025-06-01>',
      '(./part.tex',
      '! Undefined control sequence.',
      'l.3 Part \\oops',
      '                line two.',
      ')',
    ].join('\n');
    const d = parseTexLog(log, ['vision/main.tex', 'vision/part.tex', 'other/main.tex'], 'vision/main.tex');
    expect(d[0]).toMatchObject({ file: 'vision/part.tex', line: 3 });
    const fle = parseTexLog('./part.tex:3: Undefined control sequence.', ['vision/main.tex', 'vision/part.tex'], 'vision/main.tex');
    expect(fle[0].file).toBe('vision/part.tex');
  });

  it('normalizes paths', () => {
    expect(normalizePath('vision/./a/../main.tex')).toBe('vision/main.tex');
    expect(normalizePath('./x//y.tex')).toBe('x/y.tex');
  });
});
