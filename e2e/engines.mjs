// Broader engine coverage: XeLaTeX + fontspec, LuaLaTeX, BibTeX, images, TikZ, moderncv.
// Downloads the larger TeX bundles on first run. Usage: `pnpm e2e:engines [baseUrl]` with `pnpm dev` running.
import { chromium } from 'playwright';
import { deflateSync } from 'node:zlib';

const BASE = process.argv[2] ?? 'http://localhost:5173';

/** A tiny valid PNG (8x8 orange square). */
function png() {
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 8 }, () => Buffer.from([0, ...Array(8).fill([230, 120, 40]).flat()])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const CASES = [
  {
    name: 'XeLaTeX + fontspec + Unicode',
    engine: 'xelatex',
    files: { 'main.tex': '\\documentclass{article}\n\\usepackage{fontspec}\n\\begin{document}\nZoë café naïve — “quotes” ✓\n\\end{document}\n' },
    expect: /Zoë café naïve/,
  },
  {
    name: 'LuaLaTeX',
    engine: 'lualatex',
    files: { 'main.tex': '\\documentclass{article}\n\\begin{document}\nHello from LuaTeX: \\directlua{tex.print(6*7)}\n\\end{document}\n' },
    expect: /42/,
  },
  {
    name: 'pdfLaTeX + BibTeX',
    engine: 'pdflatex',
    files: {
      'main.tex': '\\documentclass{article}\n\\begin{document}\nAs shown by \\cite{knuth84}.\n\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}\n',
      'refs.bib': '@book{knuth84, author={Donald E. Knuth}, title={The TeXbook}, publisher={Addison-Wesley}, year={1984}}\n',
    },
    expect: /As shown by \[1\][\s\S]*The TeXbook/,
  },
  {
    name: 'graphicx with an uploaded PNG',
    engine: 'pdflatex',
    files: { 'main.tex': '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nImage: \\includegraphics[width=2cm]{logo.png}\n\\end{document}\n' },
    binary: { 'logo.png': png() },
    expect: /Image:/,
  },
  {
    name: 'TikZ (recommended bundle)',
    engine: 'pdflatex',
    files: { 'main.tex': '\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\\begin{tikzpicture}\\draw (0,0) circle (1) node {TikZ works};\\end{tikzpicture}\n\\end{document}\n' },
    expect: /TikZ works/,
  },
  {
    name: 'moderncv class (extra bundle)',
    engine: 'pdflatex',
    files: {
      'main.tex':
        '\\documentclass[11pt,a4paper]{moderncv}\n\\moderncvstyle{classic}\n\\moderncvcolor{blue}\n\\name{Tex C.}{Smith}\n\\begin{document}\n\\makecvtitle\n\\section{Experience}\n\\cventry{2022}{Engineer}{Northwind}{Seattle}{}{Built things.}\n\\end{document}\n',
    },
    expect: /Northwind/,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(BASE);
let failed = 0;
for (const c of CASES) {
  const t0 = Date.now();
  const r = await page.evaluate(
    async ({ c, binary }) => {
      const { compileFiles } = await import('/src/features/compile/useCompile.ts');
      const { repo } = await import('/src/app/repo.ts');
      const { pdfText } = await import('/src/compile/pdf.ts');
      const files = Object.fromEntries(Object.entries(c.files).map(([p, text]) => [p, { kind: 'text', text }]));
      for (const [p, b64] of Object.entries(binary)) {
        const data = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        files[p] = { kind: 'binary', hash: await repo.putBlob(data), size: data.length };
      }
      const out = await compileFiles({ key: `engines-${c.name}`, files, mainFile: 'main.tex', engine: c.engine });
      return {
        ok: !!out?.ok,
        text: out?.pdf ? await pdfText(out.pdf) : '',
        errors: (out?.diagnostics ?? []).filter((d) => d.severity === 'error').map((d) => `${d.line ?? ''} ${d.message}`),
        bundles: out?.bundles,
        log: out?.ok ? '' : out?.log.slice(-1500),
      };
    },
    { c: { name: c.name, engine: c.engine, files: c.files }, binary: Object.fromEntries(Object.entries(c.binary ?? {}).map(([p, b]) => [p, b.toString('base64')])) },
  );
  const pass = r.ok && c.expect.test(r.text);
  if (!pass) failed++;
  console.log(`${pass ? '✓' : '✗'} ${c.name} [${r.bundles?.join('+')}] (${Date.now() - t0} ms)`);
  if (!pass) console.log('   errors:', r.errors, '\n   text:', r.text.slice(0, 200), '\n', r.log);
}
await browser.close();
process.exit(failed ? 1 : 0);
