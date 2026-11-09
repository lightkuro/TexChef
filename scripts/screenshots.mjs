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

/** Numbered markers drawn over the page, for tours. Each is [locator, number, corner]. */
async function annotate(marks) {
  const at = [];
  for (const [loc, n, corner = 'tl', dx = 0, dy = 0, size = 30] of marks) {
    const b = await loc.boundingBox();
    const x = corner.includes('r') ? b.x + b.width : corner.includes('c') ? b.x + b.width / 2 : b.x;
    const y = corner.includes('b') ? b.y + b.height : corner.includes('m') ? b.y + b.height / 2 : b.y;
    at.push({ n, x: x + dx, y: y + dy, size });
  }
  await page.evaluate((at) => {
    const layer = document.createElement('div');
    layer.id = 'shot-marks';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999';
    for (const { n, x, y, size } of at) {
      const m = document.createElement('div');
      m.textContent = String(n);
      m.style.cssText = `position:absolute;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:var(--accent);color:var(--accent-fg);font:700 ${Math.round(size / 2)}px/${size}px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2.5px #fff,0 3px 10px rgba(0,0,0,.25)`;
      layer.append(m);
    }
    document.body.append(layer);
  }, at);
}
const clearMarks = () => page.evaluate(() => document.getElementById('shot-marks')?.remove());

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
await page.getByTestId('new-doc').click();
await page.getByTestId('template-resume-master').click();
await page.waitForTimeout(300);
await shot('new-document', { clip: page.getByRole('dialog'), pad: 0, maxWidth: 1400 });
await page.getByTestId('create-doc').click();
await page.getByTestId('editor-page').waitFor();
const master = idOf();
await page.getByTestId('page-count').waitFor({ timeout: 180_000 });
await pdfReady(master);

console.log('Editor');
await shot('editor', { dir: LANDING, maxWidth: 1920 });
await shot('editor-1280', { dir: LANDING, maxWidth: 1280 });
await annotate([
  [page.getByTestId('side-panel'), 1, 'tr', -26, 88],
  [page.locator('.cm-editor'), 2, 'tr', -34, 66],
  [page.getByTestId('pdf-viewer'), 3, 'tl', 26, 26],
  // On the buttons' icons, so their labels stay readable.
  [page.getByTestId('compile-button'), 4, 'lm', 19, 0, 24],
  [page.getByTestId('save-version'), 5, 'lm', 19, 0, 24],
  [page.getByTestId('new-variant'), 6, 'lm', 19, 0, 24],
]);
await shot('editor-tour');
await clearMarks();
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

console.log('Visual mode');
await page.getByTestId('toggle-format-bar').click();
await page.getByTestId('editor-mode-visual').click();
await page.locator('.cm-vis-h1').first().waitFor();
await page.evaluate(() => {
  const h = [...document.querySelectorAll('.cm-vis-h1')].find((e) => e.textContent.includes('Experience'));
  h.scrollIntoView({ block: 'start' });
  document.querySelector('.cm-scroller').scrollTop -= 100;
});
await page.waitForTimeout(600);
{
  const code = await page.locator('.cm-editor').boundingBox();
  const bar = await page.getByTestId('file-tabs').boundingBox();
  await shot('visual-mode', { clip: { x: bar.x, y: bar.y, width: bar.width, height: Math.min(code.y + code.height - bar.y, 560) }, pad: 0, maxWidth: 1300 });
  await page.getByTestId('format-font').click();
  await page.waitForTimeout(250);
  const fb = await page.getByTestId('format-bar').boundingBox();
  const menu = page.getByRole('menu').last();
  await hoverShot('font-menu', { clip: grow(union(fb, await menu.boundingBox()), 10), maxWidth: 1200 });
  await page.keyboard.press('Escape');
}
await page.getByTestId('editor-mode-code').click();
await page.getByTestId('toggle-format-bar').click();

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
await shot('variants', { dir: LANDING, maxWidth: 1400 });
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
await shot('map', {
  dir: LANDING,
  clip: grow(union(await page.getByTestId('doc-node-Master resume').boundingBox(), await page.getByTestId('doc-node-Frontend resume').boundingBox()), 28),
  maxWidth: 1000,
});
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
await page.waitForTimeout(2500);
await shot('compare');

console.log('Files and problems');
writeFileSync(
  `${TMP}shots-project.zip`,
  zipSync({
    'Thesis/main.tex': strToU8(
      '\\documentclass{article}\n\\usepackage{graphicx}\n\\title{A Small Thesis}\n\\author{Sam Rivera}\n\\begin{document}\n\\maketitle\n\\input{sections/intro}\n\\input{sections/method}\n\\end{document}\n',
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
