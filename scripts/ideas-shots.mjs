// Screenshots of the real app for the static landing page alternatives (ideas/*.html), in light and dark.
// Usage: start `pnpm dev` (with TeX assets from `pnpm tex:assets`), then `node scripts/ideas-shots.mjs [baseUrl]`.
// Writes public/landing/ideas-<scene>-<light|dark>[-800].webp and prints each picture's size.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const ROOT = new URL('../', import.meta.url).pathname;
const OUT = `${ROOT}public/landing/`;
const TMP = `${ROOT}e2e/out/`;
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

// A window small enough that the app's text stays readable when the picture is shown at half size.
const VIEW = { width: 1120, height: 700 };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, colorScheme: 'light' });
const page = await context.newPage();
const encoder = await context.newPage();
let scheme = 'light';

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
      return [c.toDataURL('image/webp', 0.84).split(',')[1], c.width, c.height];
    },
    [png.toString('base64'), maxWidth],
  );
  return { data: Buffer.from(b64[0], 'base64'), width: b64[1], height: b64[2] };
}

/** A 16:10 close-up, `w` CSS pixels wide, centred on (cx, cy) and kept inside the window. */
const closeUp = (cx, cy, w = 640) => {
  const h = (w * 10) / 16;
  return { x: Math.round(Math.max(0, Math.min(VIEW.width - w, cx - w / 2))), y: Math.round(Math.max(0, Math.min(VIEW.height - h, cy - h / 2))), width: w, height: h };
};

/** Save one scene at two widths. `clip` is a box in CSS pixels; without one, the whole window. */
async function shot(name, { clip, keepMouse = false } = {}) {
  if (!keepMouse) {
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.mouse.move(1, 1);
    await page.waitForTimeout(150);
  }
  const png = await page.screenshot({ clip, animations: 'disabled' });
  for (const [suffix, w] of [
    ['', 1600],
    ['-800', 800],
  ]) {
    const img = await toWebp(png, w);
    writeFileSync(`${OUT}ideas-${name}-${scheme}${suffix}.webp`, img.data);
    console.log(`  ideas-${name}-${scheme}${suffix}.webp ${img.width}×${img.height} ${(img.data.length / 1024).toFixed(0)} KB`);
  }
}

async function waitUntil(fn, arg, timeout = 90_000) {
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

async function pdfReady(id) {
  await waitUntil((id) => {
    const e = window.rcCompile.getState().entries[id];
    return !!e?.output?.pdf && !e.running;
  }, id);
  await page.locator('[data-testid=pdf-viewer] [data-page="1"] canvas').first().waitFor();
  await page.waitForTimeout(900);
}

const pdfPoint = (id, needle) =>
  page.evaluate(
    async ([id, needle]) => {
      const { openPdf } = await import('/src/compile/pdf.ts');
      const pdf = window.rcCompile.getState().entries[id]?.output?.pdf;
      const { doc, destroy } = await openPdf(pdf);
      try {
        const pg = await doc.getPage(1);
        const vp = pg.getViewport({ scale: 1 });
        const it = (await pg.getTextContent()).items.find((i) => i.str?.includes(needle));
        if (!it) return null;
        const [, , , size, x0, base] = it.transform;
        const x = x0 + (it.width * (it.str.indexOf(needle) + needle.length / 2)) / it.str.length;
        const y = vp.height - base - size * 0.3;
        const r = document.querySelector('[data-testid=pdf-viewer] [data-page="1"]').getBoundingClientRect();
        return { x: r.left + (x / vp.width) * r.width, y: r.top + (y / vp.height) * r.height };
      } finally {
        destroy();
      }
    },
    [id, needle],
  );

const ESSAY = String.raw`\documentclass[11pt]{article}
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
before counting health and storm-water benefits.

\end{document}
`;

// ---- Documents: an essay, and a master resume with three tailored versions ------------------------------
console.log('Setting up documents');
await page.goto(BASE);
await waitUntil(() => !!window.rc);
const ids = await page.evaluate(async (essayText) => {
  const { repo } = window.rc;
  const { createVariant } = await import('/src/variants/ops.ts');
  const master = (await import('/src/templates/resume-master.tex?raw')).default;
  const essay = await repo.createDoc({ name: 'Why cities plant trees', files: { 'main.tex': { kind: 'text', text: essayText } } });
  const m = await repo.createDoc({ name: 'Master resume', files: { 'main.tex': { kind: 'text', text: master } } });
  const recipe = (tags) => ({ include: [], exclude: [], tags, known: [] });
  const f = await createVariant(repo, { parentId: m.id, name: 'Frontend resume', recipe: recipe(['frontend']) });
  const b = await createVariant(repo, { parentId: m.id, name: 'Backend resume', recipe: recipe(['backend', 'infra']) });
  const d = await createVariant(repo, { parentId: m.id, name: 'Data resume', recipe: recipe(['data', 'ml']) });
  return { essay: essay.id, master: m.id, frontend: f.id, variants: [f.id, b.id, d.id] };
}, ESSAY);
// Open each once, so the map has its first page.
for (const id of [ids.master, ...ids.variants, ids.essay]) {
  await page.goto(`${BASE}/doc/${id}`);
  await page.getByTestId('editor-page').waitFor();
  await pdfReady(id);
}
// The variant gets an edit of its own, and the master a later fix: the map shows versions waiting, compare shows both.
await page.evaluate(async ({ master, frontend }) => {
  const { repo } = window.rc;
  const v = await repo.getWork(frontend);
  await repo.writeWorkText(frontend, 'main.tex', v.files['main.tex'].text.replace('improving load time by 60\\%', 'cutting load time by 75\\%'));
  await repo.commitWork(frontend, 'Sharper dashboard bullet', 'save');
  const w = await repo.getWork(master);
  await repo.writeWorkText(master, 'main.tex', w.files['main.tex'].text.replace('Software engineer with 7 years', 'Software engineer with 8 years'));
  await repo.commitWork(master, 'Eight years now', 'save');
}, ids);

async function openEssay() {
  await page.goto(`${BASE}/doc/${ids.essay}`);
  await page.getByTestId('editor-page').waitFor();
  if ((await page.getByTestId('side-panel').count()) > 0 && (await page.getByTestId('side-panel').isVisible())) await page.getByTestId('toggle-side').click();
  await pdfReady(ids.essay);
}

for (scheme of ['light', 'dark']) {
  console.log(`Pictures (${scheme})`);
  await page.emulateMedia({ colorScheme: scheme });

  // 1. The editor: the essay's LaTeX and its PDF.
  await openEssay();
  await page.locator('.cm-content').click({ position: { x: 200, y: 300 } });
  await page.waitForTimeout(700);
  await shot('editor', { keepMouse: true });

  // 2. Edit on the PDF: the box open on a sentence, a few words selected.
  {
    const at = (await pdfPoint(ids.essay, 'two to four')) ?? (await pdfPoint(ids.essay, 'degrees')) ?? (await pdfPoint(ids.essay, 'Street trees'));
    await page.mouse.click(at.x, at.y);
    const input = page.getByTestId('pdf-edit-input');
    await input.waitFor();
    await input.evaluate((el) => {
      el.focus();
      const i = el.value.indexOf('two to four');
      if (i >= 0) el.setSelectionRange(i, i + 'two to four'.length);
    });
    await page.waitForTimeout(400);
    await shot('pdf-edit', { keepMouse: true });
    // Close-up: the sentence and its edit box.
    const box = await page.getByTestId('pdf-edit-box').boundingBox();
    await shot('pdf-edit-focus', { keepMouse: true, clip: closeUp(box.x + box.width / 2, box.y + box.height / 2 - 60, 560) });
    await page.keyboard.press('Escape');
  }

  // 3. Visual mode.
  await page.getByTestId('toggle-format-bar').click();
  await page.getByTestId('editor-mode-visual').click();
  await page.locator('.cm-vis-h1').first().waitFor();
  await page.waitForTimeout(700);
  await shot('visual');
  {
    // Close-up: the formatting bar and the text shown formatted.
    const bar = await page.getByTestId('file-tabs').boundingBox();
    await shot('visual-focus', { clip: { x: Math.round(bar.x), y: Math.round(bar.y), width: 560, height: 350 } });
  }
  await page.getByTestId('editor-mode-code').click();
  await page.getByTestId('toggle-format-bar').click();

  // 4. The map: a master and its tailored versions, each waiting for the master's fix.
  await page.goto(BASE);
  await page.getByTestId('doc-node-Data resume').waitFor();
  if (scheme === 'light') {
    await page.getByTestId('map-vertical').click();
    await page.getByTestId('map-menu').click();
    await page.getByTestId('map-full-pages').click();
    await page.keyboard.press('Escape');
  }
  await page.getByTestId('map-menu').click();
  await page.getByTestId('map-fit').click();
  await page.mouse.move(5, 400);
  await page.waitForTimeout(2000);
  {
    const area = await page.getByTestId('dashboard-content').boundingBox();
    await shot('map', { clip: { x: area.x, y: area.y, width: area.width, height: Math.min(area.height, VIEW.height - area.y) } });
    // Close-up: the master and its versions only (the essay steps aside).
    await page.evaluate((id) => window.rc.repo.updateDoc(id, { archived: true }), ids.essay);
    await page.getByTestId('doc-node-Why cities plant trees').waitFor({ state: 'detached' });
    await page.getByTestId('map-menu').click();
    await page.getByTestId('map-fit').click();
    await page.mouse.move(5, 400);
    await page.waitForTimeout(1500);
    const boxes = [];
    for (const n of await page.locator('.react-flow__node').all()) boxes.push(await n.boundingBox());
    const x0 = Math.min(...boxes.map((b) => b.x));
    const x1 = Math.max(...boxes.map((b) => b.x + b.width));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const y1 = Math.max(...boxes.map((b) => b.y + b.height));
    const w = Math.min(VIEW.width - area.x, Math.max(x1 - x0 + 48, ((y1 - y0 + 32) * 16) / 10));
    const h = (w * 10) / 16;
    await shot('map-focus', { clip: { x: Math.round(Math.max(area.x, (x0 + x1) / 2 - w / 2)), y: Math.round(Math.max(area.y, Math.min(VIEW.height - h, (y0 + y1) / 2 - h / 2))), width: Math.round(w), height: Math.round(Math.min(h, VIEW.height - area.y)) } });
    await page.evaluate((id) => window.rc.repo.updateDoc(id, { archived: false }), ids.essay);
  }

  // 5. Compare: the master beside its Frontend version, text only.
  await page.goto(`${BASE}/compare?left=${ids.master}&right=${ids.frontend}`);
  await page.locator('.cm-mergeView').waitFor();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.waitForTimeout(1200);
  await shot('compare');
  {
    // Close-up: the two columns around the arrows between them.
    const view = await page.locator('.cm-mergeView').boundingBox();
    await shot('compare-focus', { clip: { x: Math.round(view.x + view.width / 2 - 320), y: Math.round(view.y - 46), width: 640, height: 400 } });
  }
}

console.log('Done');
await browser.close();
