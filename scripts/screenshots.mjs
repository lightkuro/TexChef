// Screenshots for the help pages (public/help) and the landing page (public/landing), taken from the real app.
// Usage: start `pnpm dev` (with TeX assets from `pnpm tex:assets`), then `pnpm shots [baseUrl]`.
// Writes .webp files and src/help/shots.gen.ts (their sizes, so pages reserve the space before they load).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const ROOT = new URL('../', import.meta.url).pathname;
const HELP = `${ROOT}public/help/`;
const LANDING = `${ROOT}public/landing/`;
mkdirSync(HELP, { recursive: true });
const TMP = `${ROOT}e2e/out/`;
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2, colorScheme: 'light' });
const page = await context.newPage();
// A blank page that turns PNG screenshots into resized WebP with the browser's own encoder.
const encoder = await context.newPage();
const sizes = {};

/** Encode a PNG as WebP, at most `maxWidth` pixels wide. */
async function toWebp(png, maxWidth) {
  const b64 = await encoder.evaluate(
    async ([data, maxWidth]) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const scale = Math.min(1, maxWidth / bmp.width);
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(bmp, 0, 0, c.width, c.height);
      return [c.toDataURL('image/webp', 0.86).split(',')[1], c.width, c.height];
    },
    [png.toString('base64'), maxWidth],
  );
  return { data: Buffer.from(b64[0], 'base64'), width: b64[1], height: b64[2] };
}

/**
 * Save a screenshot. `clip` is a box in CSS pixels (or a locator, padded by `pad`); without one, the whole window.
 * Help images go to public/help, landing ones (dir: LANDING) to public/landing.
 */
async function shot(name, { clip, pad = 12, maxWidth = 1600, dir = HELP, keepMouse = false } = {}) {
  let box;
  if (clip && typeof clip.boundingBox === 'function') {
    const b = await clip.boundingBox();
    box = { x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad };
  } else box = clip;
  if (box) {
    const vp = page.viewportSize();
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    box = { x, y, width: Math.min(vp.width - x, box.width - (x - box.x)), height: Math.min(vp.height - y, box.height - (y - box.y)) };
  }
  if (!keepMouse) {
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.mouse.move(1, 1);
    await page.waitForTimeout(150);
  }
  const png = await page.screenshot({ clip: box, animations: 'disabled' });
  const img = await toWebp(png, maxWidth);
  writeFileSync(`${dir}${name}.webp`, img.data);
  if (dir === HELP) sizes[name] = [img.width, img.height];
  console.log(`  ${dir === HELP ? 'help' : 'landing'}/${name}.webp ${img.width}×${img.height} ${(img.data.length / 1024).toFixed(0)} KB`);
}

/** Like shot(), but leaves the mouse where it is (for hover states and open menus). */
const hoverShot = (name, opts) => shot(name, { ...opts, keepMouse: true });

const clearMarks = () => page.evaluate(() => document.getElementById('shot-marks')?.remove());

/** An accent ring around one element (or two, e.g. a split button), for close-ups. */
async function ring(loc, also) {
  const b = also ? union(await loc.boundingBox(), await also.boundingBox()) : await loc.boundingBox();
  await page.evaluate((b) => {
    const layer = document.createElement('div');
    layer.id = 'shot-marks';
    layer.style.cssText = `position:fixed;left:${b.x - 4}px;top:${b.y - 4}px;width:${b.width + 8}px;height:${b.height + 8}px;border:2.5px solid var(--accent);border-radius:10px;box-shadow:0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent);pointer-events:none;z-index:99999`;
    document.body.append(layer);
  }, b);
}

async function waitUntil(fn, arg, timeout = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      if (await page.evaluate(fn, arg)) return;
    } catch {
      /* navigating */
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Timed out: ${fn.toString().slice(0, 160)}`);
}

/** The PDF for document `id` is compiled, idle and drawn. */
async function pdfReady(id, re) {
  await waitUntil(
    async ([id, src]) => {
      const e = window.rcCompile.getState().entries[id];
      if (!e?.output?.pdf || e.running) return false;
      if (!src) return true;
      const { pdfText } = await import('/src/compile/pdf.ts');
      return new RegExp(src).test(await pdfText(e.output.pdf));
    },
    [id, re?.source],
  );
  await page.locator('[data-testid=pdf-viewer] [data-page="1"] canvas').first().waitFor();
  await page.waitForTimeout(900);
}

/** Where some PDF text is on screen. */
const pdfPoint = (id, needle) =>
  page.evaluate(
    async ([id, needle]) => {
      const { openPdf } = await import('/src/compile/pdf.ts');
      const pdf = window.rcCompile.getState().entries[id]?.output?.pdf;
      const { doc, destroy } = await openPdf(pdf);
      try {
        for (let n = 1; n <= doc.numPages; n++) {
          const pg = await doc.getPage(n);
          const vp = pg.getViewport({ scale: 1 });
          const it = (await pg.getTextContent()).items.find((i) => i.str?.includes(needle));
          if (!it) continue;
          const [, , , size, x0, base] = it.transform;
          const x = x0 + (it.width * (it.str.indexOf(needle) + needle.length / 2)) / it.str.length;
          const y = vp.height - base - size * 0.3;
          const r = document.querySelector(`[data-testid=pdf-viewer] [data-page="${n}"]`).getBoundingClientRect();
          return { x: r.left + (x / vp.width) * r.width, y: r.top + (y / vp.height) * r.height };
        }
        return null;
      } finally {
        destroy();
      }
    },
    [id, needle],
  );

const idOf = () => page.url().split('/doc/')[1];
const union = (...bs) => {
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return { x, y, width: Math.max(...bs.map((b) => b.x + b.width)) - x, height: Math.max(...bs.map((b) => b.y + b.height)) - y };
};
const grow = (b, p) => ({ x: b.x - p, y: b.y - p, width: b.width + 2 * p, height: b.height + 2 * p });

// ---------------------------------------------------------------------------------------------------------

console.log('Home and new document');
await page.goto(BASE);
await page.getByTestId('landing').waitFor();
await page.getByTestId('ideas-nav-start').click();
await page.getByTestId('start-new').click();
await page.waitForTimeout(400);
// Blank article is chosen by default.
await shot('new-document', { clip: page.getByRole('dialog'), pad: 0, maxWidth: 1400 });
await page.getByTestId('template-resume-master').click();
await page.getByTestId('create-doc').click();
await page.getByTestId('editor-page').waitFor();
const master = idOf();
await page.getByTestId('page-count').waitFor({ timeout: 180_000 });
await pdfReady(master);

console.log('Editor');
await shot('editor');
// The tour: each part up close (about the width of a help card, shown at full size), buttons ringed.
{
  const W = 340;
  const side = await page.getByTestId('side-panel').boundingBox();
  await shot('tour-side', { clip: { x: side.x, y: side.y, width: Math.min(W, side.width), height: 200 }, pad: 0, maxWidth: 800 });
  const tabs = await page.getByTestId('file-tabs').boundingBox();
  await shot('tour-code', { clip: { x: tabs.x, y: tabs.y, width: W, height: 200 }, pad: 0, maxWidth: 800 });
  const pdf = await page.getByTestId('pdf-viewer').boundingBox();
  await shot('tour-pdf', { clip: { x: pdf.x + pdf.width - W - 20, y: pdf.y - 44, width: W + 20, height: 200 }, pad: 0, maxWidth: 800 });
  for (const [name, id, also] of [['tour-compile', 'compile-button', 'compile-settings'], ['tour-save', 'save-version'], ['tour-variant', 'new-variant']]) {
    const box = also ? union(await page.getByTestId(id).boundingBox(), await page.getByTestId(also).boundingBox()) : await page.getByTestId(id).boundingBox();
    // The neighbouring buttons step aside so the picture shows only this one.
    const keep = [id, also].filter(Boolean);
    await page.evaluate((keep) => {
      const sel = ['sync-indicator', 'new-variant', 'save-version', 'compile-button', 'compile-settings'].filter((t) => !keep.includes(t)).map((t) => `[data-testid="${t}"]`);
      for (const el of document.querySelectorAll([...sel, 'header [aria-label="More"]'].join(','))) el.style.visibility = 'hidden';
    }, keep);
    await ring(page.getByTestId(id), also ? page.getByTestId(also) : null);
    await shot(name, { clip: { x: box.x - 28, y: Math.max(0, box.y - 8), width: box.width + 56, height: box.height + 16 }, pad: 0, maxWidth: 800 });
    await clearMarks();
    await page.evaluate(() => document.querySelectorAll('[style*="visibility: hidden"]').forEach((el) => (el.style.visibility = '')));
  }
}
await shot('blocks-panel', { clip: { ...(await page.getByTestId('side-panel').boundingBox()), height: 470 }, pad: 0, maxWidth: 900 });

console.log('Compile menu');
await page.getByTestId('compile-settings').click();
await page.getByTestId('compile-menu').waitFor();
await page.waitForTimeout(200);
await hoverShot('compile-menu', {
  clip: grow(union(await page.getByTestId('compile-button').boundingBox(), await page.getByTestId('compile-menu').boundingBox()), 14),
  maxWidth: 1000,
});
await page.keyboard.press('Escape');
await page.mouse.move(700, 500);
await page.waitForTimeout(300);

console.log('Saving');
await page.evaluate(async (id) => {
  const w = await window.rc.repo.getWork(id);
  await window.rc.repo.writeWorkText(id, 'main.tex', w.files['main.tex'].text.replace('(555) 010-2030', '(555) 010-2031'));
}, master);
await page.getByTestId('save-state').getByText('Draft saved').waitFor();
{
  const state = await page.getByTestId('save-state').boundingBox();
  await shot('draft-saved', { clip: { x: 0, y: 0, width: state.x + state.width + 18, height: state.y + state.height + 12 }, pad: 0, maxWidth: 900 });
  const group = union(await page.getByTestId('new-variant').boundingBox(), await page.getByTestId('save-version').boundingBox(), await page.getByTestId('compile-settings').boundingBox());
  await shot('save-version', { clip: grow(group, 10), pad: 0, maxWidth: 1100 });
}
await page.getByTestId('save-version').click();
await page.getByTestId('save-state').getByText('Saved').waitFor();
await pdfReady(master, /010-2031/);

console.log('Edit on the PDF');
{
  const at = await pdfPoint(master, 'customer dashboard');
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  await page.getByTestId('pdf-edit-input').waitFor();
  // Select the number, as if about to change it.
  await page.getByTestId('pdf-edit-input').evaluate((el) => {
    el.focus();
    const i = el.value.indexOf('60%');
    el.setSelectionRange(i, i + 3);
  });
  await page.waitForTimeout(400);
  const pdf = await page.getByTestId('pdf-viewer').boundingBox();
  const editBox = await page.getByTestId('pdf-edit-box').boundingBox();
  const top = Math.max(pdf.y, editBox.y - 330);
  await hoverShot('pdf-edit', { clip: { x: pdf.x, y: top, width: pdf.width, height: Math.min(560, editBox.y + editBox.height + 40 - top) }, maxWidth: 1200 });
  // The landing page: source and PDF side by side, the edit box open.
  const code = await page.locator('.cm-editor').boundingBox();
  const lx = code.x + code.width * 0.35;
  await hoverShot('pdf-edit', { dir: LANDING, clip: { x: lx, y: top - 40, width: pdf.x + pdf.width - lx, height: 640 }, maxWidth: 1400 });
  await page.keyboard.press('Escape');
}

console.log('History');
await page.getByTestId('tab-history').click();
await page.getByTestId('history-panel').getByTestId('version-number').first().waitFor();
await page.waitForTimeout(300);
await shot('history', { clip: { ...(await page.getByTestId('side-panel').boundingBox()), height: 420 }, pad: 0, maxWidth: 900 });
await page.getByTestId('tab-blocks').click();

console.log('Variant builder');
await page.getByTestId('new-variant').click();
await page.getByTestId('variant-builder').waitFor();
await page.getByTestId('tag-frontend').click();
await page.getByTestId('variant-pages').waitFor({ timeout: 60_000 });
await page.waitForTimeout(2500);
await page.getByTestId('variant-name').fill('Frontend resume');
await shot('variant-builder');
await page.getByTestId('create-variant').click();
await page.getByTestId('editor-page').waitFor();
await page.getByText('variant of').waitFor();
const variant = idOf();
await pdfReady(variant);

console.log('Updates');
await page.evaluate(async (id) => {
  const { repo } = window.rc;
  const w = await repo.getWork(id);
  await repo.writeWorkText(id, 'main.tex', w.files['main.tex'].text.replace('improving load time by 60\\%', 'improving load time by 75\\%'));
  await repo.commitWork(id, 'Faster load time', 'save');
}, master);
await page.getByTestId('pull-button').waitFor({ timeout: 15_000 });
await page.waitForTimeout(300);
{
  const pull = await page.getByTestId('pull-button').boundingBox();
  const of = await page.getByText('variant of').boundingBox();
  of.x -= 24;
  of.width += 24;
  await shot('get-updates', { clip: grow(union(pull, of), 14), pad: 0, maxWidth: 1200 });
}
await page.getByTestId('pull-button').click();
await page.getByTestId('pull-page').waitFor();
await page.getByText('No conflicts').waitFor();
await page.waitForTimeout(800);
await shot('pull-page');
await page.getByTestId('finish-pull').click();
await page.getByTestId('editor-page').waitFor();
await page.getByText('up to date').waitFor();

console.log('Copy to original');
await page.evaluate(async (id) => {
  const { repo } = window.rc;
  const w = await repo.getWork(id);
  await repo.writeWorkText(id, 'main.tex', w.files['main.tex'].text.replace('Rebuilt the customer dashboard', 'Rebuilt the customer analytics dashboard'));
}, variant);
{
  const panel = page.getByTestId('blocks-panel');
  await panel.getByText('edited').first().waitFor();
  const btn = panel.locator('[aria-label$=" to original"]').first();
  await panel.getByText('edited').first().hover();
  await btn.hover();
  await page.getByRole('tooltip').first().waitFor();
  await page.waitForTimeout(300);
  const row = await panel.getByText('edited').first().boundingBox();
  const sp = await page.getByTestId('side-panel').boundingBox();
  await hoverShot('copy-to-original', { clip: { x: sp.x, y: Math.max(sp.y, row.y - 150), width: sp.width + 120, height: 260 }, pad: 0, maxWidth: 900 });
}

console.log('Map');
await page.goto(BASE);
await page.getByTestId('view-graph').click();
await page.getByTestId('doc-node-Master resume').waitFor();
await page.getByTestId('doc-node-Frontend resume').waitFor();
await page.locator('.react-flow__edge').first().waitFor({ state: 'attached' });
await page.waitForTimeout(1500);
await shot('home-map');
await page.getByTestId('graph-mode').hover();
await page.getByTestId('graph-versions').click();
await page.locator('.react-flow__node-commit').first().waitFor();
await page.mouse.move(5, 400);
await page.waitForTimeout(1200);
await page.locator('.react-flow__node-commit').last().click();
await page.getByTestId('commit-panel').waitFor();
await page.waitForTimeout(500);
{
  const nodes = [];
  for (const n of await page.locator('.react-flow__node').all()) nodes.push(await n.boundingBox());
  const area = await page.getByTestId('dashboard-content').boundingBox();
  const box = grow(union(...nodes, await page.getByTestId('commit-panel').boundingBox()), 32);
  const top = Math.max(box.y, area.y);
  await hoverShot('map-versions', { clip: { ...box, y: top, height: box.y + box.height - top }, pad: 0, maxWidth: 1400 });
}
await page.keyboard.press('Escape');
await page.getByTestId('graph-mode').hover();
await page.getByTestId('graph-family').click();
await page.mouse.move(5, 400);
await page.waitForTimeout(500);

console.log('Versions (landing)');
{
  // Two more tailored versions, each opened once so the map has its first page.
  const ids = await page.evaluate(async (m) => {
    const { createVariant } = await import('/src/variants/ops.ts');
    const recipe = (tags) => ({ include: [], exclude: [], tags, known: [] });
    const a = await createVariant(window.rc.repo, { parentId: m, name: 'Backend resume', recipe: recipe(['backend', 'infra']) });
    const b = await createVariant(window.rc.repo, { parentId: m, name: 'Data resume', recipe: recipe(['data', 'ml']) });
    return [a.id, b.id];
  }, master);
  for (const id of ids) {
    await page.goto(`${BASE}/doc/${id}`);
    await pdfReady(id);
  }
  // A fix in the master: every version shows it is waiting.
  await page.evaluate(async (id) => {
    const { repo } = window.rc;
    const w = await repo.getWork(id);
    await repo.writeWorkText(id, 'main.tex', w.files['main.tex'].text.replace('Software engineer with 7 years', 'Software engineer with 8 years'));
    await repo.commitWork(id, 'Eight years now', 'save');
  }, master);
  await page.goto(BASE);
  await page.getByTestId('doc-node-Data resume').waitFor();
  await page.getByTestId('map-vertical').click();
  await page.getByTestId('map-menu').click();
  await page.getByTestId('map-full-pages').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('map-menu').click();
  await page.getByTestId('map-fit').click();
  await page.mouse.move(5, 400);
  await page.waitForTimeout(2000);
  const nodes = [];
  for (const n of await page.locator('.react-flow__node').all()) nodes.push(await n.boundingBox());
  await shot('versions', { dir: LANDING, clip: grow(union(...nodes), 36), pad: 0, maxWidth: 1400 });
  // Back to the defaults for later pictures.
  await page.getByTestId('map-menu').click();
  await page.getByTestId('map-full-pages').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('map-horizontal').click();
}

console.log('Import menu');
await page.getByTestId('import-menu').click();
await page.getByTestId('import-files').waitFor();
await page.waitForTimeout(250);
await hoverShot('import-menu', {
  clip: grow(union(await page.getByTestId('import-menu').boundingBox(), await page.getByRole('menu').boundingBox(), await page.getByTestId('new-doc').boundingBox()), 14),
  maxWidth: 1000,
});
await page.keyboard.press('Escape');

console.log('Compare');
await page.goto(`${BASE}/compare?left=${master}&right=${variant}`);
await page.getByTestId('diff-view').waitFor();
await page.locator('.cm-mergeView').waitFor();
// Both sides' PDFs, not "Compiling…".
await page.waitForFunction(() => !/Compiling/.test(document.body.innerText) && document.querySelectorAll('canvas').length >= 2, null, { timeout: 120000 });
await page.waitForTimeout(800);
await shot('compare');

console.log('Files and problems');
writeFileSync(
  `${TMP}shots-project.zip`,
  zipSync({
    'Thesis/main.tex': strToU8(
      '\\documentclass{article}\n\\usepackage{graphicx}\n\\title{A Small Thesis}\n\\author{Sam Writer}\n\\begin{document}\n\\maketitle\n\\input{sections/intro}\n\\input{sections/method}\n\\end{document}\n',
    ),
    'Thesis/sections/intro.tex': strToU8('\\section{Introduction}\nThis project studies how people write documents together.\n'),
    'Thesis/sections/method.tex': strToU8('\\section{Method}\nWe asked twelve teams to keep a diary for a month.\n'),
  }),
);
await page.goto(BASE);
await page.getByTestId('upload-input').setInputFiles(`${TMP}shots-project.zip`);
await page.getByTestId('editor-page').waitFor();
const thesis = idOf();
await pdfReady(thesis, /twelve teams/);
await page.getByTestId('tab-files').click();
await page.getByTestId('open-file-tab').click();
await page.getByTestId('open-file-sections/intro.tex').click();
await page.getByTestId('open-file-tab').click();
await page.getByTestId('open-file-sections/method.tex').click();
await page.waitForTimeout(600);
{
  const sp = await page.getByTestId('side-panel').boundingBox();
  const tabs = await page.getByTestId('file-tabs').boundingBox();
  await shot('files', { clip: { x: sp.x, y: sp.y, width: tabs.x + tabs.width - sp.x, height: 330 }, pad: 0, maxWidth: 1400 });
}
await page.evaluate(async (id) => {
  await window.rc.repo.writeWorkText(id, 'sections/method.tex', '\\section{Method}\nWe asked twelve teams to keep a \\diary for a month.\n');
}, thesis);
await page.getByTestId('problems').getByText(/Undefined control sequence/).waitFor({ timeout: 60_000 });
await page.waitForTimeout(800);
await shot('problems', { clip: page.getByTestId('problems'), pad: 0, maxWidth: 1100 });

console.log('Settings');
await page.goto(`${BASE}/settings`);
{
  const drive = page.locator('section', { hasText: 'Google Drive' }).first();
  await drive.waitFor();
  await page.waitForTimeout(300);
  await shot('settings-drive', { clip: drive, pad: 10, maxWidth: 1300 });
}

console.log('Essay: main picture and Visual mode');
writeFileSync(
  `${TMP}essay.tex`,
  String.raw`\documentclass[11pt]{article}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage{amsmath}
\usepackage[margin=1.1in]{geometry}
\usepackage[hidelinks]{hyperref}

\title{Why Cities Plant Trees}
\author{Maya Chef}
\date{November 2026}

\begin{document}
\maketitle

\section{Introduction}
Street trees are among the cheapest climate tools a city has. A single mature tree can cool the air around it by
\textbf{two to four degrees} on a summer afternoon, and it does so for decades with \emph{very little upkeep}.

\section{What trees give back}
\begin{itemize}
  \item Shade that lowers cooling costs for nearby buildings.
  \item Roots that soak up storm water before it reaches the drains.
  \item Quieter, calmer streets that people choose to walk on.
\end{itemize}

\section{A simple estimate}
If a city plants $n$ trees and each one saves $s$ dollars of energy a year, the yearly saving is
\begin{equation}
  S = n \cdot s ,
\end{equation}
before counting health and storm-water benefits. See the \href{https://example.org/trees}{city forestry report} for local numbers.

\end{document}
`,
);
await page.goto(BASE);
await page.getByTestId('upload-input').setInputFiles(`${TMP}essay.tex`);
await page.getByTestId('editor-page').waitFor();
const essay = idOf();
await page.evaluate((id) => window.rc.repo.updateDoc(id, { name: 'Why cities plant trees' }), essay);
await pdfReady(essay, /Why Cities Plant Trees/);
// Visual mode, for the help and the landing page.
await page.getByTestId('toggle-format-bar').click();
await page.getByTestId('editor-mode-visual').click();
await page.locator('.cm-vis-h1').first().waitFor();
await page.waitForTimeout(800);
{
  const code = await page.locator('.cm-editor').boundingBox();
  const bar = await page.getByTestId('file-tabs').boundingBox();
  await shot('visual-mode', { clip: { x: bar.x, y: bar.y, width: bar.width, height: Math.min(code.y + code.height - bar.y, 560) }, pad: 0, maxWidth: 1300 });
  const pdf = await page.getByTestId('pdf-viewer').boundingBox();
  await shot('visual', { dir: LANDING, clip: { x: bar.x, y: bar.y, width: pdf.x + pdf.width - bar.x, height: 620 }, pad: 0, maxWidth: 1400 });
  await page.getByTestId('format-font').click();
  await page.waitForTimeout(250);
  const fb = await page.getByTestId('format-bar').boundingBox();
  const menu = page.getByRole('menu').last();
  await hoverShot('font-menu', { clip: grow(union(fb, await menu.boundingBox()), 10), maxWidth: 1200 });
  await page.keyboard.press('Escape');
}
await page.getByTestId('editor-mode-code').click();
await page.getByTestId('toggle-format-bar').click();
// The main picture: a narrower window (bigger text, no side panel), the essay's LaTeX and its PDF.
await page.setViewportSize({ width: 1240, height: 700 });
await page.reload();
await page.getByTestId('editor-page').waitFor();
if ((await page.getByTestId('side-panel').count()) > 0) await page.getByTestId('toggle-side').click();
await pdfReady(essay);
await page.locator('.cm-content').click({ position: { x: 200, y: 330 } });
await page.waitForTimeout(800);
await shot('hero', { dir: LANDING, maxWidth: 1920 });
await shot('hero-1280', { dir: LANDING, maxWidth: 1280 });
await page.setViewportSize({ width: 1440, height: 860 });

const entries = Object.entries(sizes)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, [w, h]]) => `  '${k}': [${w}, ${h}],`)
  .join('\n');
writeFileSync(
  `${ROOT}src/help/shots.gen.ts`,
  `// Written by scripts/screenshots.mjs: the size of each picture in public/help.\nexport const SHOTS: Record<string, [number, number]> = {\n${entries}\n};\n`,
);
console.log('Done');
await browser.close();
