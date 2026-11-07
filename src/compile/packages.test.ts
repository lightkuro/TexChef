import { afterEach, describe, expect, it, vi } from 'vitest';
import { PackageIndex } from './packages';

const lists: Record<string, string> = {
  '/b/texlive-basic.js.providespackage.txt': '// \\ProvidesPackage{graphicx}\n',
  '/b/texlive-recommended.js.providespackage.txt': '// \\ProvidesPackage{fontspec}\n// \\ProvidesPackage{graphicx}\n',
  '/b/texlive-extra.js.providespackage.txt': '// \\ProvidesPackage{fullpage}\n// \\ProvidesPackage{titlesec}\n',
};

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url in lists ? { ok: true, text: async () => lists[url] } : { ok: false, text: async () => '' })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('PackageIndex.plan', () => {
  it('asks for the bundle a package is in, after \\end{document}', async () => {
    mockFetch();
    const main = '\\documentclass{article}\n\\usepackage{fullpage}\n\\begin{document}\nx\n\\end{document}\n';
    const plan = await new PackageIndex('/b').plan([{ path: 'main.tex', content: main }], 'main.tex');
    expect(plan.bundles).toEqual(['basic', 'extra']);
    expect(plan.mainText).toMatch(/\\RequirePackage\{fullpage\}/);
    expect(plan.mainText).toMatch(/\\end\{document\}\n\\usepackage\{fullpage\}\n$/);
  });

  it('still asks for it when the document ends in an \\input file (no \\end{document} in main)', async () => {
    mockFetch();
    const files = [
      { path: 'main.tex', content: '\\documentclass{article}\n\\usepackage{titlesec}\n\\input{body}\n' },
      { path: 'body.tex', content: '\\begin{document}\nx\n\\end{document}\n' },
    ];
    const plan = await new PackageIndex('/b').plan(files, 'main.tex');
    expect(plan.bundles).toEqual(['basic', 'extra']);
    // \endinput first, so TeX never reads the trigger line.
    expect(plan.mainText).toMatch(/\\input\{body\}\n\\endinput\n\\usepackage\{fullpage\}\n$/);
  });

  it('loads forced bundles (after TeX reported one of their files missing)', async () => {
    mockFetch();
    const main = '\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n';
    const plan = await new PackageIndex('/b').plan([{ path: 'main.tex', content: main }], 'main.tex', ['extra']);
    expect(plan.bundles).toEqual(['basic', 'extra']);
  });
});
