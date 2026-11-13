// End-to-end check of the main flows in a real browser (Chromium via Playwright).
// Usage: start `pnpm dev` (with TeX assets from `pnpm tex:assets`), then `pnpm e2e [baseUrl]`.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { crc32, deflateSync } from 'node:zlib';
import { zipSync, strToU8, unzipSync } from 'fflate';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// pdf.js comes in a modern and a legacy build; this browser has everything, so it must never load the legacy one.
const legacyRequests = [];
page.on('request', (r) => /pdfjs-dist.*legacy/.test(r.url()) && legacyRequests.push(r.url()));
page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));

const step = async (name, fn) => {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    await page.screenshot({ path: `${OUT}fail-${name.replace(/\W+/g, '-')}.png` });
    console.error(`✗ ${name}\n${e.stack}`);
    if (errors.length) console.error('Page errors:\n' + errors.join('\n'));
    await browser.close();
    process.exit(1);
  }
};

/**
 * Like page.waitForFunction, but for functions that return a promise: waitForFunction treats the promise
 * itself as a truthy result and returns at once, so it can't wait on async checks.
 */
async function waitUntil(fn, arg, { timeout = 30_000, polling = 250 } = {}) {
  const t0 = Date.now();
  let error;
  while (Date.now() - t0 < timeout) {
    try {
      const v = await page.evaluate(fn, arg);
      if (v) return v;
    } catch (e) {
      error = e; // e.g. the page navigated mid-check
    }
    await page.waitForTimeout(polling);
  }
  throw new Error(`Timed out after ${timeout} ms waiting for: ${fn.toString().slice(0, 200)}${error ? `\nLast error: ${error.message}` : ''}`);
}

const pdfText = () =>
  page.evaluate(async () => {
    // Use the app's live instances (exposed in dev) so hot reloads can't hand us a stale module copy.
    const { pdfText } = await import('/src/compile/pdf.ts');
    const entries = Object.values(window.rcCompile.getState().entries);
    const latest = entries.filter((e) => e.output?.pdf).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
    return latest ? pdfText(latest.output.pdf) : '';
  });

/** Where a piece of PDF text is on screen (page coordinates), from the PDF the editor for `key` shows. */
const pdfPoint = (key, needle) =>
  page.evaluate(
    async ([key, needle]) => {
      const { openPdf } = await import('/src/compile/pdf.ts');
      const pdf = window.rcCompile.getState().entries[key]?.output?.pdf;
      if (!pdf) return null;
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
    [key, needle],
  );

const workText = (id) => page.evaluate(async (id) => (await window.rc.repo.getWork(id)).files['main.tex'].text, id);

let masterUrl;
let variantUrl;

/** Click an entry in the map's ☰ options menu. */
async function mapOption(testId) {
  await page.getByTestId('map-menu').click();
  await page.getByTestId(testId).click();
}

await step('dashboard loads with welcome screen', async () => {
  await page.goto(BASE);
  await page.getByTestId('landing').waitFor();
  // New users get the scroll story, with Start writing (and an arrow for uploads) at the top.
  await page.getByTestId('landing').getByTestId('ideas-story').waitFor({ state: 'attached' });
  assert.equal(await page.getByTestId('ideas-float-start').count(), 0, 'no floating button at the top');
  // Blank article comes first and is chosen by default.
  await page.getByTestId('landing').getByTestId('ideas-start').click();
  assert.equal(await page.locator('[data-testid^="template-"]').first().getAttribute('data-testid'), 'template-article');
  await page.getByRole('dialog').getByText('Blank article').first().waitFor();
  assert.equal(await page.getByRole('dialog').getByRole('textbox').inputValue(), '');
  await page.keyboard.press('Escape');
});

await step('home page links to Terms (and from there Privacy); themes switch', async () => {
  assert.match(await page.getByTestId('link-version').textContent(), /^TexChef v\d+\.\d+/);
  await page.getByTestId('link-terms').click();
  await page.getByTestId('legal-page').getByText('Limitation of liability').waitFor();
  await page.getByTestId('terms-privacy').click();
  await page.getByTestId('legal-page').getByText('Limited Use requirements', { exact: false }).waitFor();
  await page.goto(BASE);
  // Green (Forest) is the default color theme.
  assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), 'forest');
  await page.getByTestId('theme-menu').click();
  await page.getByTestId('palette-ocean').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), 'ocean');
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  assert.equal(accent, '#1d5fd1');
  await page.screenshot({ path: `${OUT}00-theme-ocean.png` });
  await page.getByTestId('theme-menu').click();
  await page.getByTestId('palette-kitchen').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.palette ?? 'kitchen'), 'kitchen');
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.palette ?? 'kitchen'), 'kitchen', 'a chosen theme sticks');
  await page.getByTestId('theme-menu').click();
  await page.getByTestId('palette-forest').click();
});

await step('create master resume from template and compile it', async () => {
  await page.getByTestId('ideas-nav-start').click();
  await page.getByTestId('template-resume-master').click();
  await page.getByTestId('create-doc').click();
  await page.getByTestId('editor-page').waitFor();
  masterUrl = page.url();
  await page.getByTestId('page-count').waitFor({ timeout: 180_000 });
  assert.equal(await page.getByTestId('page-count').textContent(), '1 page');
  await page.screenshot({ path: `${OUT}01-editor.png` });
});

await step('blocks panel lists the resume structure', async () => {
  const panel = page.getByTestId('blocks-panel');
  await panel.getByText('Experience', { exact: true }).waitFor();
  await panel.getByText(/Northwind Analytics/).first().waitFor();
});

await step('SyncTeX: double-click PDF jumps to source, locate highlights PDF', async () => {
  await page.locator('[data-testid=pdf-viewer] [data-page="1"] canvas').waitFor();
  const wrap = page.locator('[data-testid=pdf-viewer] [data-page="1"]');
  const box = await wrap.boundingBox();
  const pw = Number(await wrap.getAttribute('data-pw'));
  const ph = Number(await wrap.getAttribute('data-ph'));
  // "Northwind Analytics" sits at about (40bp, 162bp) on page 1 of the template.
  await page.mouse.dblclick(box.x + (60 / pw) * box.width, box.y + (159 / ph) * box.height);
  await page.waitForFunction(() => /Northwind Analytics/.test(document.querySelector('.cm-activeLine')?.textContent ?? ''));
  // The cursor's line stays highlighted in the PDF (on by default); the button turns it off and on.
  await page.getByTestId('cursor-hl').first().waitFor();
  assert.equal(await page.getByTestId('locate-in-pdf').getAttribute('aria-pressed'), 'true');
  await page.getByTestId('locate-in-pdf').click();
  await page.getByTestId('cursor-hl').first().waitFor({ state: 'detached' });
  await page.getByTestId('locate-in-pdf').click();
  await page.getByTestId('cursor-hl').first().waitFor();
});

await step('whole-page preview toggle fits a page in the pane', async () => {
  await page.getByTestId('pdf-whole-page').click();
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid=pdf-viewer]');
    const p = v?.querySelector('[data-page="1"]');
    return v && p && p.getBoundingClientRect().height <= v.clientHeight;
  });
  assert.equal(await page.getByTestId('pdf-whole-page').getAttribute('aria-pressed'), 'true');
  await page.getByTestId('pdf-whole-page').click();
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid=pdf-viewer]');
    const p = v?.querySelector('[data-page="1"]');
    return v && p && p.getBoundingClientRect().width > v.clientWidth - 40;
  });
});

await step('panels fold into rails: drag an edge onto the next one, click the rail to open it again', async () => {
  const pdf = page.getByTestId('pdf-panel');
  const sep = page.locator('[data-separator]').nth(1);
  const box = await sep.boundingBox();
  // Drag the line between the code and the PDF almost to the right edge: the PDF folds.
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(1430, box.y + 200, { steps: 12 });
  await page.mouse.up();
  await page.getByTestId('pdf-panel-rail').waitFor();
  assert.ok((await pdf.boundingBox()).width < 40);
  await page.screenshot({ path: `${OUT}02c-pdf-folded.png` });
  await page.getByTestId('pdf-panel-rail').click();
  await page.getByTestId('pdf-viewer').waitFor();
  assert.ok((await pdf.boundingBox()).width > 200);
  // The header button folds and opens the side panel.
  await page.getByTestId('toggle-side').click();
  await page.getByTestId('side-panel-rail').waitFor();
  assert.equal(await page.getByTestId('toggle-side').getAttribute('aria-pressed'), 'false');
  await page.getByTestId('side-panel-rail').click();
  await page.getByTestId('tab-blocks').waitFor();
  assert.equal(await page.getByTestId('toggle-side').getAttribute('aria-pressed'), 'true');
});

await step('editing the source recompiles the PDF', async () => {
  const cm = page.locator('.cm-content');
  await cm.click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('% edited in e2e\n');
  // Closing the tab right now would lose keystrokes not stored yet: the browser asks first.
  const leaveNow = () => page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  assert.equal(await leaveNow(), true, 'warns while typing is not stored');
  await waitUntil(async () => {
    const w = await window.rc.db.work.toArray();
    return w.some((x) => x.files['main.tex']?.text?.startsWith('% edited in e2e'));
  });
  // Stored in the browser (and no Google Drive here): closing is safe, no prompt.
  await page.waitForFunction(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return !e.defaultPrevented;
  });
  assert.equal((await page.getByTestId('save-state').textContent()).trim(), 'Draft saved');
  await page.getByTestId('save-version').click();
  await page.getByText('Version saved').waitFor();
  await page.getByTestId('save-state').getByText('Saved').waitFor();
});

await step('variant builder: pick #frontend, see live preview, create variant', async () => {
  await page.getByTestId('new-variant').click();
  await page.getByTestId('variant-builder').waitFor();
  await page.getByTestId('tag-frontend').click();
  await page.getByTestId('variant-pages').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const text = await pdfText();
  assert.match(text, /customer dashboard/);
  assert.doesNotMatch(text, /streaming ingestion/);
  await page.screenshot({ path: `${OUT}02-variant-builder.png` });
  await page.getByTestId('variant-name').fill('Frontend resume');
  await page.getByTestId('create-variant').click();
  await page.getByTestId('editor-page').waitFor();
  await page.getByText('variant of').waitFor();
  variantUrl = page.url();
  assert.notEqual(variantUrl, masterUrl);
  await page.getByTestId('page-count').waitFor({ timeout: 60_000 });
});

await step('edit master, then pull the update into the variant', async () => {
  await page.evaluate(async (masterId) => {
    const { repo } = window.rc;
    const w = await repo.getWork(masterId);
    const t = w.files['main.tex'].text.replace('improving load time by 60\\%', 'improving load time by 75\\%').replace('(555) 010-2030', '(555) 444-1212');
    await repo.writeWorkText(masterId, 'main.tex', t);
    await repo.commitWork(masterId, 'Update numbers', 'save');
  }, masterUrl.split('/doc/')[1]);
  await page.getByTestId('pull-button').waitFor({ timeout: 10_000 });
  assert.match(await page.getByTestId('pull-button').textContent(), /Get 1 update/);
  await page.getByTestId('pull-button').click();
  await page.getByTestId('pull-page').waitFor();
  await page.getByText('No conflicts').waitFor();
  await page.screenshot({ path: `${OUT}03-pull.png` });
  await page.getByTestId('finish-pull').click();
  await page.getByTestId('editor-page').waitFor();
  await page.getByText('up to date').waitFor();
  const text = await page.evaluate(async (id) => {
    const { repo } = window.rc;
    return (await repo.getWork(id)).files['main.tex'].text;
  }, variantUrl.split('/doc/')[1]);
  assert.match(text, /75\\%/);
  assert.match(text, /444-1212/);
  assert.doesNotMatch(text, /streaming ingestion/);
});

const pdfHas = (v, re) =>
  waitUntil(
    async ([v, src]) => {
      const e = window.rcCompile.getState().entries[v];
      if (!e?.output?.pdf || e.running) return false;
      const { pdfText } = await import('/src/compile/pdf.ts');
      return new RegExp(src).test(await pdfText(e.output.pdf));
    },
    [v, re.source],
    { timeout: 60_000, polling: 500 },
  );

await step('edit text on the PDF (and in the original too)', async () => {
  const v = variantUrl.split('/doc/')[1];
  const m = masterUrl.split('/doc/')[1];
  // Edit text is on by default.
  assert.equal(await page.getByTestId('pdf-edit-toggle').getAttribute('aria-pressed'), 'true');
  // Auto-compile still works in edit mode: the variant's PDF catches up with the update it just got.
  await pdfHas(v, /75%/);
  const at = await pdfPoint(v, 'customer dashboard');
  assert.ok(at, 'bullet found in the PDF');
  await page.mouse.click(at.x, at.y);
  const input = page.getByTestId('pdf-edit-input');
  await input.waitFor();
  assert.equal(await input.inputValue(), 'Rebuilt the customer dashboard in React and TypeScript, improving load time by 75%.');
  // Selecting text in the box and letting go over the page keeps this edit open (no new edit where the mouse is let go).
  const ib = await input.boundingBox();
  const elsewhere = await pdfPoint(v, 'Northwind Analytics');
  await page.mouse.move(ib.x + 20, ib.y + ib.height / 2);
  await page.mouse.down();
  await page.mouse.move(elsewhere.x, elsewhere.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(await input.inputValue(), 'Rebuilt the customer dashboard in React and TypeScript, improving load time by 75%.');
  // The box's bottom corners resize it.
  const box0 = await page.getByTestId('pdf-edit-box').boundingBox();
  const grip = await page.getByTestId('pdf-edit-resize-right').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 60, grip.y + 70, { steps: 6 });
  await page.mouse.up();
  const box1 = await page.getByTestId('pdf-edit-box').boundingBox();
  assert.ok(box1.width > box0.width + 30 && box1.height > box0.height + 40, `resized: ${JSON.stringify([box0, box1])}`);
  assert.ok((await input.boundingBox()).height > ib.height + 30, 'the text field grows with the box');
  // "Update PDF after saving" sits in the box and is on by default; turn it off to collect changes first.
  assert.equal(await page.getByTestId('pdf-edit-auto').getAttribute('aria-checked'), 'true');
  await page.getByTestId('pdf-edit-auto').click();
  await input.fill('Rebuilt the customer dashboard in React & TypeScript, improving load time by 80%.');
  await page.getByLabel('Also change it in Master resume').click();
  await page.screenshot({ path: `${OUT}08-edit-on-pdf.png` });
  await page.getByTestId('pdf-edit-save').click();
  await page.getByTestId('pdf-edit-pending').first().waitFor();
  await page.getByTestId('pdf-edit-banner').getByText('1 change').waitFor();
  const want = /\\rcItem\{Rebuilt the customer dashboard in React \\& TypeScript, improving load time by 80\\%\.\}/;
  // The original is changed right after the variant.
  for (const id of [v, m]) await waitUntil(async (id) => /80\\%/.test((await window.rc.repo.getWork(id)).files['main.tex'].text), id);
  assert.match(await workText(v), want);
  assert.match(await workText(m), want);
  // While changes wait, auto-compile holds off; Update PDF brings them in.
  await page.waitForTimeout(2500);
  await page.getByTestId('pdf-edit-pending').first().waitFor();
  await page.getByTestId('pdf-edit-update').click();
  await page.getByTestId('pdf-edit-pending').first().waitFor({ state: 'detached', timeout: 60_000 });
  await page.getByTestId('pdf-edit-banner').waitFor({ state: 'detached' });
  assert.match(await pdfText(), /React & TypeScript, improving\s+load\s+time\s+by\s+80%/);
  // With "Update PDF after saving" on, a saved change reaches the PDF right away.
  const role = await pdfPoint(v, 'Senior Software Engineer');
  await page.mouse.click(role.x, role.y);
  await page.getByTestId('pdf-edit-input').waitFor();
  await page.getByTestId('pdf-edit-auto').click();
  await page.getByTestId('pdf-edit-input').fill('Staff Software Engineer');
  await page.keyboard.press('Enter');
  await pdfHas(v, /Staff Software Engineer/);
  await page.getByTestId('pdf-edit-pending').first().waitFor({ state: 'detached' });
  assert.equal(await page.getByTestId('pdf-edit-banner').count(), 0);
  // Edits right after one another each reach the PDF (no stale compile).
  const role2 = await pdfPoint(v, 'Staff Software Engineer');
  await page.mouse.click(role2.x, role2.y);
  await page.getByTestId('pdf-edit-input').fill('Principal Software Engineer');
  await page.keyboard.press('Enter');
  await pdfHas(v, /Principal Software Engineer/);
  // Double-clicking still jumps to the source in edit mode.
  const head = await pdfPoint(v, 'Northwind Analytics');
  await page.mouse.dblclick(head.x, head.y);
  await page.waitForFunction(() => /Northwind Analytics/.test(document.querySelector('.cm-activeLine')?.textContent ?? ''));
  await page.getByTestId('pdf-edit-box').waitFor({ state: 'detached' });
  // Leaving with text typed in the edit box asks first.
  await page.mouse.click(head.x, head.y);
  await page.getByTestId('pdf-edit-input').fill('Distinguished Engineer');
  await page.getByLabel('Back to documents').click();
  await page.getByTestId('leave-reasons').getByText('edit box').waitFor();
  await page.getByTestId('leave-stay').click();
  assert.equal(await page.getByTestId('pdf-edit-input').inputValue(), 'Distinguished Engineer');
  await page.getByTestId('pdf-edit-input').press('Escape');
  await page.getByTestId('pdf-edit-box').waitFor({ state: 'detached' });
});

await step('map shows master → variant with a straight line and the updates by the arrow', async () => {
  await page.goto(BASE);
  await page.getByTestId('view-graph').click();
  assert.equal((await page.getByTestId('view-graph').textContent()).trim(), 'Map');
  // Documents / Versions is its own control next to Map / List.
  assert.equal((await page.getByTestId('graph-mode').textContent()).trim(), 'Documents');
  await page.getByTestId('doc-node-Master resume').waitFor();
  await page.getByTestId('doc-node-Frontend resume').waitFor();
  // Edges render once React Flow has measured both nodes (a level straight line has no height, so wait for it to exist).
  await page.locator('.react-flow__edge').first().waitFor({ state: 'attached' });
  assert.equal(await page.locator('.react-flow__edge').count(), 1);
  const d = await page.locator('.react-flow__edge path.react-flow__edge-path').first().getAttribute('d');
  assert.match(d, /^M\s*[\d.-]+[\s,]+[\d.-]+\s*L\s*[\d.-]+[\s,]+[\d.-]+\s*$/, `straight line, got ${d}`);
  // The variant got an update from the PDF edit above; its label sits next to the variant's end of the line.
  const v = variantUrl.split('/doc/')[1];
  const pill = await page.getByTestId(`edge-updates-${v}`).boundingBox();
  const src = await page.getByTestId('doc-node-Master resume').boundingBox();
  const dst = await page.getByTestId('doc-node-Frontend resume').boundingBox();
  const cx = pill.x + pill.width / 2;
  assert.ok(Math.abs(cx - dst.x) < Math.abs(cx - (src.x + src.width)), 'updates label is nearer the variant');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}04-graph.png` });
  // Versions is in the menu that opens below "Documents" on hover.
  await page.getByTestId('graph-mode').hover();
  await page.getByTestId('graph-mode-menu').waitFor();
  await page.screenshot({ path: `${OUT}04d-view-menu.png` });
  await page.getByTestId('graph-versions').click();
  assert.equal((await page.getByTestId('graph-mode').textContent()).trim(), 'Versions');
  assert.equal((await page.getByTestId('view-graph').textContent()).trim(), 'Map');
  await page.locator('.react-flow__node-commit').first().waitFor();
  const commits = await page.locator('.react-flow__node-commit').count();
  assert.ok(commits >= 4, `expected ≥4 visible versions, got ${commits}`);
  await page.locator('.react-flow__node-commit').last().click();
  await page.getByTestId('commit-panel').waitFor();
  await page.screenshot({ path: `${OUT}05-versions.png` });
  await page.getByTestId('graph-mode').hover();
  await page.getByTestId('graph-family').click();
  await page.mouse.move(5, 300);
  await page.getByTestId('graph-mode-menu').waitFor({ state: 'detached' });
});

await step('right-click menu on the map works without opening the document; delete warns', async () => {
  await page.getByTestId('doc-node-Frontend resume').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Frontend resume v2');
  await page.getByRole('dialog').getByRole('button', { name: 'Rename' }).click();
  await page.getByTestId('doc-node-Frontend resume v2').waitFor();
  assert.equal(new URL(page.url()).pathname, '/');
  await page.getByTestId('doc-node-Frontend resume v2').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await page.getByTestId('delete-warning').getByText('This can’t be undone').waitFor();
  await page.screenshot({ path: `${OUT}04b-delete-warning.png` });
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).pathname, '/');
  await page.getByTestId('doc-node-Frontend resume v2').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Frontend resume');
  await page.getByRole('dialog').getByRole('textbox').press('Enter');
  await page.getByTestId('doc-node-Frontend resume').waitFor();
  // A second variant, so the lines are not level.
  await page.evaluate(async (m) => {
    const { createVariant } = await import('/src/variants/ops.ts');
    await createVariant(window.rc.repo, { parentId: m, name: 'Backend resume', recipe: { include: [], exclude: [], tags: ['backend'], known: [] } });
  }, masterUrl.split('/doc/')[1]);
  await page.getByTestId('doc-node-Backend resume').waitFor();
  const paths = () => page.locator('.react-flow__edge path.react-flow__edge-path').evaluateAll((els) => els.map((e) => e.getAttribute('d')));
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__edge').length === 2);
  assert.ok((await paths()).every((d) => !/Q/.test(d)), 'straight lines by default');
  // Right-angled lines are a setting.
  await page.goto(`${BASE}/settings`);
  await page.getByTestId('settings-map-lines').selectOption('angled');
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__edge').length === 2);
  assert.ok((await paths()).every((d) => /Q/.test(d)), `right-angled lines, got ${await paths()}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}04c-angled.png` });
  await page.goto(`${BASE}/settings`);
  await page.getByTestId('settings-map-lines').selectOption('straight');
  await page.goto(BASE);
  // Top-down layout: the master sits above its variants, with a crown as the top of the tree.
  await page.getByTestId('map-vertical').click();
  await page.waitForTimeout(600);
  const m = await page.getByTestId('doc-node-Master resume').boundingBox();
  const f = await page.getByTestId('doc-node-Frontend resume').boundingBox();
  assert.ok(f.y > m.y + m.height, 'variant below the master');
  await page.getByTestId('doc-node-Master resume').getByTestId('root-indicator').waitFor();
  assert.equal(await page.getByTestId('doc-node-Frontend resume').getByTestId('root-indicator').count(), 0);
  // Full pages make the cards tall enough for the whole first page.
  const before = (await page.getByTestId('doc-node-Master resume').boundingBox()).height / (m.width / 232);
  await mapOption('map-full-pages');
  await page.waitForTimeout(600);
  const box = await page.getByTestId('doc-node-Master resume').boundingBox();
  assert.ok(box.height / (box.width / 232) > before + 150, 'full-page cards are taller');
  await mapOption('map-full-pages');
  // Snap to grid: a dragged card lands in a grid cell, is remembered, and Reset (after asking) puts it back.
  await mapOption('map-snap');
  await page.waitForTimeout(600);
  const card = await page.getByTestId('doc-node-Backend resume').boundingBox();
  await page.mouse.move(card.x + card.width / 2, card.y + card.height * 0.85);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width / 2 + card.width * 1.2, card.y + card.height * 0.85 + 20, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('rc-map-positions') ?? '{}').vertical ?? {}).length > 0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rc-map-positions')).vertical);
  const [pos] = Object.values(saved);
  assert.ok(pos && pos.x % 272 === 0 && pos.y % 250 === 0, `snapped to the grid, got ${JSON.stringify(pos)}`);
  // The grid lines sit half a gap outside the card, so the card is in the middle of its cell.
  const pattern = await page.locator('pattern[id$="grid"]').getAttribute('patternTransform');
  const zoom = await page.evaluate(() => Number(/scale\(([\d.]+)\)/.exec(document.querySelector('.react-flow__viewport').style.transform)[1]));
  const shift = Number(/translate\(-([\d.]+)/.exec(pattern)[1]);
  assert.ok(Math.abs(shift - (20 + 136) * zoom) < 0.5, `grid offset by half a gap, got ${shift} at zoom ${zoom}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}04e-snap.png` });
  assert.equal(new URL(page.url()).pathname, '/');
  await mapOption('map-reset');
  await page.getByTestId('confirm-ok').click();
  await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('rc-map-positions')).vertical).length === 0);
  await mapOption('map-snap');
  await page.getByTestId('map-horizontal').click();
  // Delete from the map: asks first, then removes the card and stays on the map.
  await page.getByTestId('doc-node-Backend resume').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await page.getByTestId('confirm-delete').click();
  await page.getByTestId('doc-node-Backend resume').waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).pathname, '/');
});

await step('document color label shows on the graph card', async () => {
  await page.getByTestId('view-list').click();
  await page.getByLabel('Actions for Frontend resume').click();
  await page.getByRole('menuitem', { name: 'Color…' }).click();
  await page.getByTestId('color-blue').click();
  await page.getByTestId('view-graph').click();
  const border = await page.getByTestId('doc-node-Frontend resume').evaluate((el) => getComputedStyle(el).borderTopColor);
  assert.equal(border, 'rgb(29, 78, 216)');
});

/** Scroll position (in the page's own scroll box) of the middle of scene `i` of the story. */
await step('versions view: links between documents go around the versions in between', async () => {
  // A master, two versions made from the same master version, and one of them taking a later fix after an edit of
  // its own: drawn as straight lines, those links would run through other versions.
  const made = await page.evaluate(async () => {
    const { repo } = window.rc;
    const { createVariant, planPull, applyPull } = await import('/src/variants/ops.ts');
    const tick = () => new Promise((r) => setTimeout(r, 15));
    const tex = (body) => `\\documentclass{article}\n\\begin{document}\n%% @block a tags=x\n${body}\n%% @end\n%% @block b tags=y\nSecond.\n%% @end\n\\end{document}\n`;
    const recipe = (tags) => ({ include: [], exclude: [], tags, known: [] });
    const m = await repo.createDoc({ name: 'Lines master', files: { 'main.tex': { kind: 'text', text: tex('First.') } } });
    await tick();
    const a = await createVariant(repo, { parentId: m.id, name: 'Lines A', recipe: recipe(['x']) });
    await tick();
    const b = await createVariant(repo, { parentId: m.id, name: 'Lines B', recipe: recipe(['y']) });
    await tick();
    await repo.writeWorkText(m.id, 'main.tex', tex('First, fixed.'));
    await repo.commitWork(m.id, 'A fix', 'save');
    await tick();
    // (An autosave on the way: hidden unless autosaves are shown.)
    await repo.writeWorkText(a.id, 'main.tex', (await repo.getWork(a.id)).files['main.tex'].text.replace('\\end{document}', 'Draft.\n\\end{document}'));
    await repo.commitWork(a.id, '', 'auto');
    await tick();
    await repo.writeWorkText(a.id, 'main.tex', (await repo.getWork(a.id)).files['main.tex'].text.replace('Draft.', 'Own edit.'));
    await repo.commitWork(a.id, 'Own edit', 'save');
    await tick();
    const plan = await planPull(repo, a.id);
    await applyPull(repo, a.id, plan.files, plan.parentHead);
    await tick();
    // The master is autosaved, and a version is made from that autosave: it stays on the line as a dot.
    await repo.writeWorkText(m.id, 'main.tex', tex('First, fixed again.'));
    await repo.commitWork(m.id, '', 'auto');
    await tick();
    const c = await createVariant(repo, { parentId: m.id, name: 'Lines C', recipe: recipe(['x']) });
    return [m.id, a.id, b.id, c.id];
  });
  /** Links that come closer to a version they don't connect than that version's own edge. */
  const throughVersions = () =>
    page.evaluate((ids) => {
      const nodes = [...document.querySelectorAll('.react-flow__node-commit')].map((n) => {
        const r = n.getBoundingClientRect();
        return { id: n.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2, rad: r.width / 2 };
      });
      const out = [];
      let cross = 0;
      for (const e of document.querySelectorAll('.react-flow__edge')) {
        const [from, to] = (e.dataset.id ?? e.getAttribute('data-testid').replace('rf__edge-', '')).split('->');
        const path = e.querySelector('path.react-flow__edge-path');
        const m = path.getScreenCTM();
        const len = path.getTotalLength();
        if (getComputedStyle(path).strokeDasharray !== 'none') cross++;
        for (const n of nodes) {
          if (n.id === from || n.id === to) continue;
          for (let d = 0; d <= len; d += 1.5) {
            const p = path.getPointAtLength(d);
            if (Math.hypot(p.x * m.a + p.y * m.c + m.e - n.x, p.x * m.b + p.y * m.d + m.f - n.y) < n.rad + 1) {
              out.push(`${from.slice(-4)}->${to.slice(-4)} runs through ${n.id.slice(-4)}`);
              break;
            }
          }
        }
      }
      return { out, cross, versions: nodes.length, ids: ids.length };
    }, made);
  await page.goto(BASE);
  await page.getByTestId('graph-mode').hover();
  await page.getByTestId('graph-versions').click();
  await page.locator('.react-flow__node-commit').first().waitFor();
  await page.mouse.move(5, 500);
  await page.waitForTimeout(1000);
  const straight = await throughVersions();
  assert.ok(straight.cross >= 4, `links between documents are drawn (found ${straight.cross}; other documents add their own)`);
  assert.deepEqual(straight.out, [], 'slanted lines');
  // Autosaves are small dots on the line. Hidden by default, except one another document was made from.
  const dots = () => page.locator('.react-flow__node-commit [data-autosave]');
  assert.equal(await dots().count(), 1, 'the autosave a version was made from stays, as a dot');
  assert.ok((await dots().first().boundingBox()).width < (await page.locator('.react-flow__node-commit').first().boundingBox()).width / 2, 'a dot is much smaller than a version');
  await page.getByLabel('Show autosaves').check();
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node-commit [data-autosave]').length === 2);
  await page.mouse.move(5, 500);
  await page.waitForTimeout(800);
  assert.deepEqual((await throughVersions()).out, [], 'with autosaves shown');
  await page.screenshot({ path: `${OUT}07c-versions-links.png` });
  await page.getByLabel('Show autosaves').uncheck();
  // The right-angled line style, too.
  await page.goto(`${BASE}/settings`);
  await page.getByTestId('settings-map-lines').selectOption('angled');
  await page.goto(BASE);
  await page.locator('.react-flow__node-commit').first().waitFor();
  await page.mouse.move(5, 500);
  await page.waitForTimeout(1000);
  assert.deepEqual((await throughVersions()).out, [], 'right-angled lines');
  await page.goto(`${BASE}/settings`);
  await page.getByTestId('settings-map-lines').selectOption('straight');
  // Back to how the next checks expect things: the map, and without these documents.
  await page.goto(BASE);
  await page.getByTestId('graph-mode').hover();
  await page.getByTestId('graph-family').click();
  await page.evaluate(async (ids) => {
    for (const id of ids.reverse()) await window.rc.repo.deleteDoc(id);
  }, made);
  await page.waitForTimeout(300);
});

const sceneY = (i) =>
  page.evaluate((i) => {
    const s = document.querySelector('[data-testid=ideas-story]');
    const box = s.closest('[data-mode]');
    const top = s.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    return top + (s.offsetHeight - box.clientHeight) * ((i + 0.5) / 6);
  }, i);
const storyTop = () => page.evaluate(() => document.querySelector('[data-testid=ideas-story]').closest('[data-mode]').scrollTop);

await step('/ideas: one scene per screen, each playing at its own pace; one gesture per scene, and /ideas/1 without it', async () => {
  await page.goto(`${BASE}/ideas`);
  await page.getByTestId('ideas-page').waitFor();
  const story = page.getByTestId('ideas-story');
  // Each scene's title, reached from the step bar.
  const texts = [];
  for (let i = 0; i < 6; i++) {
    await page.getByTestId(`ideas-step-${i}`).click();
    await page.waitForFunction((n) => document.querySelector('[data-testid=ideas-story]').dataset.step === String(n), i);
    await page.waitForTimeout(450);
    // (The h2 also holds a small 'n/6' counter that only phones see.)
    texts.push((await page.getByTestId('ideas-step-text').locator('h2').textContent()).replace(/^\d\/6/, ''));
  }
  assert.deepEqual(texts, [
    'Type LaTeX. Watch the PDF.',
    'Click the PDF. Type the change.',
    'Write without the backslashes.',
    'One master. Many tailored versions.',
    'Two documents, side by side.',
    'Yours, on your device.',
  ]);
  // A scene plays from the start on its own clock (also when going back); Replay shows once it's done, and two
  // seconds later the story moves on to the next scene by itself.
  await page.getByTestId('ideas-step-1').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=ideas-story]').dataset.step === '1');
  assert.equal(await page.getByTestId('ideas-replay').count(), 0, 'scene restarts when going back to it');
  await page.getByTestId('ideas-replay').waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid=ideas-story]').dataset.step === '2', null, { timeout: 5000 });
  // During the story Start writing floats at the bottom centre (a glass button), and there is no timer bar.
  await page.getByTestId('ideas-float-start').waitFor();
  // One wheel gesture moves exactly one scene, even a long trackpad-like run of events with inertia.
  const before = Number(await story.getAttribute('data-step'));
  await page.mouse.move(700, 500);
  for (let k = 0; k < 30; k++) {
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(1600);
  assert.equal(Number(await story.getAttribute('data-step')), before + 1, 'one gesture, one scene');
  assert.ok(Math.abs((await storyTop()) - (await sceneY(before + 1))) < 12, 'landed on the middle of the scene');
  await page.screenshot({ path: `${OUT}14-ideas.png` });
  // /ideas/1: the same story without snapping.
  await page.goto(`${BASE}/ideas/1`);
  await page.getByTestId('ideas-page').waitFor();
  await page.getByTestId('ideas-step-3').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=ideas-story]').dataset.step === '3');
  await page.waitForTimeout(1500);
  const at = await storyTop();
  const gap = ((await sceneY(4)) - (await sceneY(3))) * 0.3;
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, gap);
  await page.waitForTimeout(2500);
  assert.ok(Math.abs((await storyTop()) - (at + gap)) < 12, 'no snapping on /ideas/1');
  // The earlier landing page is kept at /ideas/classic.
  await page.goto(`${BASE}/ideas/classic`);
  await page.getByTestId('classic-landing').waitFor();
  await page.goto(BASE);
  await page.getByTestId('dashboard').waitFor();
});

await step('landing page ideas: static typeset and product-first pages, and the cleaned-up story', async () => {
  // The two static pages carry their headline and Start writing in the HTML itself (no app shell).
  for (const name of ['typeset', 'split']) {
    const html = await (await fetch(`${BASE}/ideas/${name}`)).text();
    assert.match(html, /<h1>Edit with/, `${name}: headline is in the HTML`);
    assert.match(html, /Start writing/, `${name}: Start writing is in the HTML`);
    assert.doesNotMatch(html, /id="root"/, `${name}: not the app shell`);
  }
  // They work with JavaScript off, too.
  const plain = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const pp = await plain.newPage();
  for (const name of ['typeset', 'split']) {
    await pp.goto(`${BASE}/ideas/${name}`);
    await pp.locator('h1').waitFor();
    assert.ok(await pp.getByTestId('ideas-static-start').isVisible());
    assert.ok(await pp.locator('main img').first().isVisible());
  }
  await plain.close();
  // Start writing opens New document on the home page, and the address is tidied.
  await page.goto(`${BASE}/ideas/typeset`);
  await page.locator('h1').waitFor();
  await page.screenshot({ path: `${OUT}14b-ideas-typeset.png` });
  await page.getByTestId('ideas-static-start').click();
  await page.getByTestId('create-doc').waitFor();
  await page.waitForFunction(() => !location.search.includes('new'));
  await page.keyboard.press('Escape');
  // Product-first: pointing at a feature row swaps the picture beside the list.
  await page.goto(`${BASE}/ideas/split`);
  const rows = page.locator('[data-row]');
  await rows.first().scrollIntoViewIfNeeded();
  const opacity = (i) => rows.nth(i).locator('figure').evaluate((f) => Number(getComputedStyle(f).opacity));
  assert.equal(await opacity(0), 1);
  await rows.nth(3).hover();
  await page.waitForTimeout(350);
  assert.equal(await opacity(3), 1, 'the hovered row shows its picture');
  assert.equal(await opacity(0), 0, 'and the first row’s is gone, within 350 ms');
  await page.screenshot({ path: `${OUT}14c-ideas-split.png` });
  // The switcher leads to the cleaned-up story, where everything is on screen at once and scene changes are short.
  await page.getByTestId('ideas-switch').getByRole('link', { name: 'Cleaned up' }).click();
  await page.locator('[data-testid=ideas-page][data-look=clean]').waitFor();
  assert.ok(await page.getByTestId('ideas-start').isVisible());
  assert.equal(await page.getByTestId('ideas-start').evaluate((el) => getComputedStyle(el).opacity), '1', 'no entrance animation on Start writing');
  await page.getByTestId('ideas-step-1').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=ideas-story]').dataset.step === '1');
  await page.waitForTimeout(700);
  await page.mouse.move(700, 500);
  for (let k = 0; k < 30; k++) {
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(700);
  assert.equal(await page.getByTestId('ideas-story').getAttribute('data-step'), '2', 'one gesture, one scene');
  assert.ok(Math.abs((await storyTop()) - (await sceneY(2))) < 12, 'and it has landed within 0.7 s of the gesture ending');
  await page.screenshot({ path: `${OUT}14d-ideas-clean.png` });
  await page.goto(BASE);
  await page.getByTestId('dashboard').waitFor();
});

await step('/ideas on a touch phone: one swipe moves one scene', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/ideas`);
  await p.getByTestId('ideas-page').waitFor();
  const cdp = await ctx.newCDPSession(p);
  /** A quick flick from one height to another, like a thumb. */
  const swipe = async (from, to) => {
    const at = (y) => [{ x: 200, y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) });
    for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(from + ((to - from) * k) / 6) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(1600);
  };
  const scene = () => p.getByTestId('ideas-story').getAttribute('data-step');
  await p.getByTestId('ideas-tour').tap();
  await p.waitForTimeout(1800);
  assert.equal(await scene(), '0');
  await swipe(650, 250);
  assert.equal(await scene(), '1');
  await swipe(650, 250);
  assert.equal(await scene(), '2');
  await swipe(250, 650);
  assert.equal(await scene(), '1');
  await ctx.close();
});

await step('help pages explain the features', async () => {
  // The help opens on the Intro: the home page's scroll story.
  await page.getByTestId('help-link').click();
  await page.getByTestId('help-intro').getByTestId('ideas-story').waitFor({ state: 'attached' });
  await page.goto(`${BASE}/help/getting-started`);
  await page.getByRole('heading', { name: '1. Start a document' }).waitFor();
  // The pictures load (they come from public/help, made by scripts/screenshots.mjs).
  const tour = page.locator('figure', { hasText: 'Blocks, Files, History' }).locator('img');
  await tour.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=help-page] img')].slice(0, 4).every((i) => i.complete && i.naturalWidth > 0));
  // Patch notes, linked from the help sidebar; the newest version is the app's.
  await page.getByTestId('help-version').click();
  await page.getByTestId('changelog').waitFor();
  assert.match(await page.getByTestId('help-version').textContent(), /Version \d+\.\d+/);
  assert.ok((await page.getByTestId('changelog').locator('section').count()) >= 8, 'every release listed');
  // A way back at the bottom of every help page.
  await page.getByTestId('help-back-bottom').click();
  await page.getByTestId('dashboard').waitFor();
  await page.goto(`${BASE}/help`);
  await page.getByRole('link', { name: 'Getting updates from the original' }).first().click();
  await page.getByRole('heading', { name: 'Example 2: a conflict' }).waitFor();
  await page.goto(`${BASE}/help/pulling`);
  await page.getByRole('heading', { name: 'Getting updates from the original', level: 1 }).waitFor();
  await page.getByRole('link', { name: 'Editing on the PDF' }).first().click();
  await page.getByRole('heading', { name: 'The LaTeX tab' }).waitFor();
  await page.screenshot({ path: `${OUT}07-help-pulling.png`, fullPage: false });
  await page.goto(BASE);
});

await step('archive hides a document until "show archived" is on', async () => {
  await page.getByTestId('view-list').click();
  await page.getByLabel('Actions for Frontend resume').click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await page.getByTestId('toggle-archived').waitFor();
  assert.equal(await page.getByTestId('doc-list').getByText('Frontend resume').count(), 0);
  await page.getByTestId('toggle-archived').click();
  await page.getByTestId('doc-list').getByText('Frontend resume').waitFor();
  await page.getByLabel('Actions for Frontend resume').click();
  await page.getByRole('menuitem', { name: 'Unarchive' }).click();
  await page.getByTestId('toggle-archived').waitFor({ state: 'detached' });
  await page.getByTestId('view-graph').click();
});

await step('folders: create, drag in, move via menu, folders and expanded views, rename, move a folder, delete', async () => {
  await page.goto(BASE);
  await page.getByTestId('folder-sidebar').waitFor();
  // New folder (opens it; it is empty).
  await page.getByTestId('new-folder').click();
  await page.getByTestId('folder-name').fill('Applications');
  await page.getByTestId('folder-dialog-ok').click();
  await page.getByTestId('empty-folder').waitFor();
  // At the top level it shows as a folder next to the documents.
  await page.getByTestId('crumb-all').click();
  await page.getByTestId('view-list').click();
  await page.getByTestId('folder-row-Applications').waitFor();
  // Drag a document onto the folder row.
  await page.getByTestId('doc-row-Frontend resume').dragTo(page.getByTestId('folder-row-Applications'));
  await page.getByText('Moved document to “Applications”').waitFor();
  await page.getByTestId('doc-row-Frontend resume').waitFor({ state: 'detached' });
  // Move another one with the menu.
  await page.getByLabel('Actions for Master resume').click();
  await page.getByRole('menuitem', { name: 'Move to folder…' }).click();
  await page.getByTestId('move-to-Applications').click();
  await page.getByTestId('move-folder-ok').click();
  await page.getByTestId('doc-row-Master resume').waitFor({ state: 'detached' });
  await page.getByTestId('folder-row-Applications').getByText('2 documents').waitFor();
  // "Expanded" (left of "Folders") shows everything, grouped by folder.
  const modes = await page.getByTestId('folder-bar').locator('[data-testid^="folder-mode-"]').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  assert.deepEqual(modes, ['Expanded', 'Folders']);
  await page.getByTestId('folder-mode-grouped').click();
  await page.getByTestId('group-Applications').getByTestId('doc-row-Master resume').waitFor();
  await page.getByTestId('folder-mode-browse').click();
  // Open the folder by clicking anywhere on its row (here, near the right end): its documents show, on the list and on the map.
  const frow = await page.getByTestId('folder-row-Applications').boundingBox();
  await page.mouse.click(frow.x + frow.width * 0.6, frow.y + 3);
  await page.getByTestId('doc-row-Master resume').waitFor();
  assert.equal(await page.getByTestId('doc-list').locator('[data-testid^="doc-row-"]').count(), 2);
  await page.getByTestId('view-graph').click();
  await page.getByTestId('doc-node-Master resume').waitFor();
  assert.equal(await page.locator('.react-flow__node').count(), 2);
  await page.getByTestId('crumb-all').click();
  await page.getByTestId('folder-node-Applications').waitFor();
  await page.screenshot({ path: `${OUT}11-folders.png` });
  // Rename, then delete the folder: documents are kept and come back to the top level.
  await page.getByTestId('folder-Applications').hover();
  await page.getByLabel('Actions for folder Applications').click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await page.getByTestId('folder-name').fill('Jobs');
  await page.getByTestId('folder-dialog-ok').click();
  await page.getByTestId('folder-Jobs').waitFor();
  await page.getByTestId('folder-Applications').waitFor({ state: 'detached' });
  await waitUntil(async () => (await window.rc.repo.listDocs()).filter((d) => d.folder === 'Jobs').length === 2);
  // The edge of a sidebar row opens the folder too.
  const srow = await page.getByTestId('folder-Jobs').boundingBox();
  await page.mouse.click(srow.x + srow.width * 0.4, srow.y + srow.height - 2);
  await page.getByTestId('crumb-Jobs').waitFor();
  await page.getByTestId('crumb-all').click();
  // Folders move too: drag one onto another in the panel, and back out with Move to….
  await page.getByTestId('new-folder').click();
  await page.getByTestId('folder-name').fill('Inner');
  await page.getByTestId('folder-dialog-ok').click();
  await page.getByTestId('folder-Inner').dragTo(page.getByTestId('folder-Jobs'));
  await page.getByTestId('folder-Jobs/Inner').waitFor();
  await page.getByTestId('crumb-Jobs').waitFor(); // the open folder followed the move (Jobs/Inner)
  await page.getByTestId('folder-Jobs/Inner').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.getByTestId('move-to-Jobs/Inner').waitFor({ state: 'detached' }); // can't move into itself
  await page.getByTestId('move-to-none').click();
  await page.getByTestId('move-folder-ok').click();
  await page.getByTestId('folder-Inner').waitFor();
  await page.getByTestId('folder-Inner').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete folder…' }).click();
  await page.getByTestId('folder-dialog-ok').click();
  await page.getByTestId('folder-Inner').waitFor({ state: 'detached' });
  await page.getByTestId('folder-Jobs').hover();
  await page.getByLabel('Actions for folder Jobs').click();
  await page.getByRole('menuitem', { name: 'Delete folder…' }).click();
  await page.getByRole('dialog').getByText('are kept').waitFor();
  await page.getByTestId('folder-dialog-ok').click();
  await page.getByTestId('folder-Jobs').waitFor({ state: 'detached' });
  await waitUntil(async () => (await window.rc.repo.listDocs()).every((d) => !d.folder));
  await page.getByTestId('doc-node-Master resume').waitFor();
});

await step('right-click empty space: new folder, previews, export menu', async () => {
  const box = await page.getByTestId('dashboard-content').boundingBox();
  await page.mouse.click(box.x + 40, box.y + box.height - 60, { button: 'right' });
  // Make previews asks first (the button is gone; it lives in the menus).
  assert.equal(await page.getByTestId('make-previews').count(), 0);
  await page.getByTestId('previews-menu').hover();
  await page.getByRole('menuitem', { name: 'Recompile all previews' }).click();
  await page.getByRole('dialog').getByText('so the map shows').waitFor();
  await page.getByTestId('confirm-cancel').click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.mouse.click(box.x + 40, box.y + box.height - 60, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Export everything' }).hover();
  await page.getByTestId('backup-menu').hover();
  await page.getByTestId('backup-zip').waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.mouse.click(box.x + 40, box.y + box.height - 60, { button: 'right' });
  await page.getByRole('menuitem', { name: 'New folder…' }).click();
  await page.getByTestId('folder-name').fill('Scratch');
  await page.getByTestId('folder-dialog-ok').click();
  await page.getByTestId('crumb-Scratch').waitFor();
  await page.getByTestId('folder-up').click();
  await page.getByTestId('folder-node-Scratch').waitFor();
});

await step('compare side by side, copy a block across', async () => {
  const m = masterUrl.split('/doc/')[1];
  const v = variantUrl.split('/doc/')[1];
  await page.goto(`${BASE}/compare?left=${m}&right=${v}`);
  await page.getByTestId('diff-view').waitFor();
  await page.locator('.cm-mergeView').waitFor();
  const blocks = page.getByTestId('compare-blocks');
  await blocks.getByText(/streaming ingestion/).waitFor();
  await page.getByLabel('Copy northwind-ingest to right').click();
  await page.getByText('Copied block to “Frontend resume”').waitFor();
  const text = await page.evaluate(async (id) => {
    const { repo } = window.rc;
    return (await repo.getWork(id)).files['main.tex'].text;
  }, v);
  assert.match(text, /streaming ingestion/);
  // Blocks that differ can be hidden, and come back from Blocks at the top.
  await page.getByTestId('compare-blocks-hide').click();
  await blocks.waitFor({ state: 'detached' });
  await page.getByTestId('compare-blocks-toggle').click();
  await blocks.waitFor();
  // The arrows' direction sits above them, between the two names.
  const dir = page.getByTestId('compare-direction');
  assert.equal(await dir.getAttribute('aria-label'), 'Arrows copy left to right');
  await dir.click();
  assert.equal(await dir.getAttribute('aria-label'), 'Arrows copy right to left');
  await dir.click();
  // A side can be view only: its copy arrows stop.
  assert.equal(await page.getByTestId('compare-edit-right').getAttribute('data-state'), 'edit');
  await page.getByTestId('compare-edit-right').click();
  assert.equal(await page.getByTestId('compare-edit-right').getAttribute('data-state'), 'view');
  assert.equal(await page.locator('.cm-merge-revert button').count(), 0);
  await page.getByTestId('compare-edit-right').click();
  await page.locator('.cm-merge-revert button').first().waitFor();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}06-compare.png` });
  // Choosing a document: a few nearby in the menu, everything in "Other files…" (with versions).
  await page.getByTestId('right-doc-picker').click();
  await page.getByRole('menuitem', { name: /Master resume/ }).waitFor();
  await page.getByRole('menuitem', { name: 'Other files…' }).click();
  await page.getByTestId('doc-picker-search').fill('master');
  await page.getByTestId('picker-doc-Master resume').click();
  await page.locator('[data-testid^="picker-version-"]').nth(1).click();
  await page.screenshot({ path: `${OUT}06b-compare-picker.png` });
  await page.getByTestId('doc-picker-ok').click();
  await page.waitForFunction((id) => new URL(location.href).searchParams.get('right')?.startsWith(id + '@'), m);
  await page.getByTestId('right-doc-picker').getByText('Master resume').waitFor();
  assert.equal(await page.getByTestId('compare-edit-right').getAttribute('data-state'), 'pinned');
  // Save only one side: the variant (left now) gets a version, nothing else.
  await page.goto(`${BASE}/compare?left=${v}&right=${m}`);
  await page.locator('.cm-mergeView').waitFor();
  const versions = async (id) => page.evaluate((id) => window.rc.db.commits.where('docId').equals(id).count(), id);
  const [vBefore, mBefore] = [await versions(v), await versions(m)];
  await page.getByTestId('compare-save-menu').click();
  await page.getByTestId('compare-save-left').click();
  await page.getByText('Saved 1 version').waitFor();
  assert.equal(await versions(v), vBefore + 1);
  assert.equal(await versions(m), mBefore);
  // Keep one side's edits as a new variant instead: the original goes back to its last version.
  await page.evaluate(async (id) => {
    const { repo } = window.rc;
    const t = (await repo.getWork(id)).files['main.tex'].text;
    await repo.writeWorkText(id, 'main.tex', t.replace('\\end{document}', 'A trial paragraph.\n\\end{document}'));
  }, m);
  await page.getByTestId('compare-save-menu').click();
  await page.getByTestId('compare-variant-right').click();
  await page.getByTestId('compare-variant-name').fill('Master trial');
  await page.getByTestId('compare-variant-create').click();
  await page.waitForFunction((id) => new URL(location.href).searchParams.get('right') !== id, m);
  const newId = new URL(page.url()).searchParams.get('right');
  const check = await page.evaluate(async ([nid, mid]) => {
    const { repo } = window.rc;
    const nv = await repo.getDoc(nid);
    return { name: nv.name, parent: nv.parent?.docId, trial: (await repo.getWork(nid)).files['main.tex'].text.includes('A trial paragraph'), back: !(await repo.getWork(mid)).files['main.tex'].text.includes('A trial paragraph') };
  }, [newId, m]);
  assert.deepEqual(check, { name: 'Master trial', parent: m, trial: true, back: true });
  await page.evaluate((id) => window.rc.repo.deleteDoc(id), newId);
});

await step('AI agents (experimental): off by default; on, a pasted reply is reviewed, accepted or dismissed', async () => {
  const m = masterUrl.split('/doc/')[1];
  // Off by default: no menu entry, no help topic.
  await page.goto(BASE);
  await page.getByTestId('import-menu').waitFor();
  assert.equal(await page.getByTestId('agents-button').count(), 0);
  await page.goto(`${BASE}/help/agents`);
  assert.equal(await page.getByRole('link', { name: /AI agents through Google Drive/ }).count(), 0);
  // Turn it on in Settings → Experimental (no Drive here: it asks to connect).
  await page.goto(`${BASE}/settings`);
  await page.getByTestId('settings-agents-toggle').check();
  await page.getByText('This needs Google Drive.').waitFor();
  // A reply that edits a line the document still has as the agent read it.
  const { head, text } = await page.evaluate(async (id) => {
    const { repo } = window.rc;
    await repo.commitWork(id, 'before agent', 'save');
    const d = await repo.getDoc(id);
    return { head: d.head, text: (await repo.getWork(id)).files['main.tex'].text };
  }, m);
  assert.match(text, /Seattle, WA/);
  const reply = `% texchef-reply doc=${m} base=${head} file=main.tex note="Moved to Portland"\n${text.replace('Seattle, WA', 'Portland, OR')}`;
  const openPaste = async (t) => {
    await page.goto(BASE);
    await page.getByTestId('agents-button').click();
    await page.getByTestId('agent-replies-paste').click();
    await page.getByTestId('agent-replies-paste-text').fill(t);
    await page.getByTestId('agent-replies-paste-review').click();
    await page.getByTestId('agent-reply-page').waitFor();
  };
  // Meanwhile the person edits a line next to the agent's: a conflict, and Accept waits until it's resolved.
  await page.evaluate(async ([id, t]) => window.rc.repo.writeWorkText(id, 'main.tex', t.replace('{jordan@example.com}', '{jo@example.com}')), [m, text]);
  await openPaste(reply);
  await page.getByText('1 file has conflicts').waitFor();
  assert.equal(await page.getByTestId('agent-reply-accept').isDisabled(), true);
  await page.screenshot({ path: `${OUT}06d-agent-conflict.png` });
  await page.getByTestId('agent-reply-dismiss').click();
  await page.waitForURL(`**/doc/${m}`);
  // Now an edit far from the agent's: it must survive.
  await page.evaluate(async ([id, t]) => window.rc.repo.writeWorkText(id, 'main.tex', t.replace('\\rcEntry{Northwind Analytics}', '\\rcEntry{Northwind Analytics Inc.}')), [m, text]);
  await openPaste(reply);
  await page.getByText('“Moved to Portland”').waitFor();
  await page.getByText('Your later edits are kept').waitFor();
  await page.locator('.cm-mergeView').waitFor();
  await page.screenshot({ path: `${OUT}06c-agent-reply.png` });
  await page.getByTestId('agent-reply-accept').click();
  await page.waitForURL(`**/doc/${m}`);
  const after = await page.evaluate(async (id) => {
    const { repo, db } = window.rc;
    const d = await repo.getDoc(id);
    const c = await db.commits.get(d.head);
    return { message: c.message, text: (await repo.getWork(id)).files['main.tex'].text };
  }, m);
  assert.equal(after.message, 'Edits from an AI agent: Moved to Portland');
  assert.match(after.text, /Portland, OR/);
  assert.match(after.text, /Northwind Analytics Inc\./);
  // Dismiss changes nothing.
  await openPaste(`% texchef-reply doc=${m} base=${head}\n\\documentclass{article}\\begin{document}Nope\\end{document}`);
  await page.getByTestId('agent-reply-dismiss').click();
  await page.waitForURL(`**/doc/${m}`);
  assert.equal(await workText(m), after.text);
  // No header: choose the document (here: a new one).
  await openPaste('\\documentclass{article}\n\\begin{document}\nFrom the chat.\n\\end{document}\n');
  await page.getByTestId('agent-reply-doc').selectOption('new');
  await page.getByTestId('agent-reply-accept').click();
  await page.getByTestId('editor-page').waitFor();
  assert.match(await page.evaluate(async (id) => (await window.rc.repo.getWork(id)).files['main.tex'].text, page.url().split('/doc/')[1]), /From the chat/);
  // Besides text, a reply can propose a new linked variant in a folder, and later a rename and a move; each can be unticked.
  await openPaste(`% texchef-reply doc=new name="Agent letter" folder="Agent drafts" variant-of=${m} note="A letter"\n\\documentclass{article}\n\\begin{document}\nDear team.\n\\end{document}\n`);
  await page.getByTestId('agent-reply-actions').getByText('Link it as a variant of “Master resume”').waitFor();
  await page.getByTestId('agent-reply-actions').getByText('Put it in the folder “Agent drafts”').waitFor();
  await page.getByTestId('agent-reply-accept').click();
  await page.getByTestId('editor-page').waitFor();
  const letter = page.url().split('/doc/')[1];
  const made = await page.evaluate(async (id) => {
    const { repo, db } = window.rc;
    const d = await repo.getDoc(id);
    return { name: d.name, folder: d.folder, parent: d.parent?.docId, kind: (await db.commits.get(d.head)).kind };
  }, letter);
  assert.deepEqual(made, { name: 'Agent letter', folder: 'Agent drafts', parent: m, kind: 'agent' });
  // The version is marked with the robot in History.
  await page.getByTestId('tab-history').click();
  await page.locator('[data-testid=history-panel] li[data-kind=agent]').waitFor();
  await page.getByTestId('tab-blocks').click();
  // A reply with no text: rename and move. The move is unticked, the rename accepted.
  await openPaste(`% texchef-reply doc=${letter} rename="Agent letter, sent" folder="Sent" note="Filed"`);
  await page.getByText('This reply doesn’t change any text').waitFor();
  await page.getByTestId('agent-action-folder').uncheck();
  await page.getByTestId('agent-reply-accept').click();
  await page.waitForURL(`**/doc/${letter}`);
  const after2 = await page.evaluate(async (id) => {
    const d = await window.rc.repo.getDoc(id);
    return { name: d.name, folder: d.folder };
  }, letter);
  assert.deepEqual(after2, { name: 'Agent letter, sent', folder: 'Agent drafts' });
  // Archiving is a proposal too: nothing happens until it is accepted here.
  await openPaste(`% texchef-reply doc=${letter} archive=yes note="No longer needed"`);
  await page.getByTestId('agent-action-archive').waitFor();
  assert.equal(await page.evaluate(async (id) => !!(await window.rc.repo.getDoc(id)).archived, letter), false, 'not archived before approval');
  await page.getByTestId('agent-reply-accept').click();
  await page.waitForURL(`**/doc/${letter}`);
  assert.equal(await page.evaluate(async (id) => !!(await window.rc.repo.getDoc(id)).archived, letter), true);
  await page.evaluate((id) => window.rc.repo.deleteDoc(id), letter);
  // The help topic is listed while it's on; switching off hides the button again.
  await page.goto(`${BASE}/help/agents`);
  await page.getByRole('heading', { name: 'Why you pick replies' }).waitFor();
  await page.goto(`${BASE}/settings`);
  await page.getByTestId('settings-agents-toggle').uncheck();
  await page.goto(BASE);
  await page.getByTestId('import-menu').waitFor();
  assert.equal(await page.getByTestId('agents-button').count(), 0);
});

await step('upload a .zip as a new document and download it again', async () => {
  const zip = zipSync({
    'proj/main.tex': strToU8('\\documentclass{article}\n\\begin{document}\nHello from a zip.\n\\input{part}\n\\end{document}\n'),
    'proj/part.tex': strToU8('Second file.\n'),
    'proj/__MACOSX/junk': strToU8('x'),
  });
  writeFileSync(`${OUT}upload.zip`, zip);
  await page.goto(BASE);
  await page.getByTestId('upload-input').setInputFiles(`${OUT}upload.zip`);
  await page.getByTestId('editor-page').waitFor();
  await page.getByTestId('page-count').waitFor({ timeout: 60_000 });
  assert.match(await pdfText(), /Hello from a zip\. Second file\./);
  await page.getByLabel('More').click();
  const dl = page.waitForEvent('download');
  await page.getByText('Download project (.zip)').click();
  const file = await (await dl).path();
  const entries = unzipSync(new Uint8Array(readFileSync(file)));
  assert.deepEqual(Object.keys(entries).sort(), ['main.tex', 'part.tex', 'upload.pdf']);
});

await step('compile errors are reported with line numbers', async () => {
  await page.evaluate(async (id) => {
    const { repo } = window.rc;
    await repo.writeWorkText(id, 'main.tex', '\\documentclass{article}\n\\begin{document}\nOops \\undefinedmacro\n\\end{document}\n');
  }, page.url().split('/doc/')[1]);
  await page.getByTestId('problems').getByText(/Undefined control sequence/).waitFor({ timeout: 30_000 });
  await page.getByTestId('problems').getByText('main.tex:3').waitFor();
});

/** Pick the engine in the Compile button's menu. */
async function setEngine(engine) {
  await page.getByTestId('compile-settings').click();
  await page.getByTestId(`engine-${engine}`).click();
  await page.waitForFunction((e) => document.querySelector('[data-testid=compile-button]')?.dataset.engine === e, engine);
}

/** Double-click a word in the editor (at the word itself, not the middle of its line). */
async function dblclickWord(word) {
  const p = await page.evaluate((word) => {
    const walker = document.createTreeWalker(document.querySelector('.cm-content'), NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent.indexOf(word);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + word.length);
      const b = r.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }
    return null;
  }, word);
  assert.ok(p, `"${word}" is in the editor`);
  await page.mouse.dblclick(p.x, p.y);
}

/** Wait until any compiled PDF's text matches `re`; returns that text. */
async function waitPdf(re, timeout) {
  const t0 = Date.now();
  let texts = [];
  while (Date.now() - t0 < timeout) {
    texts = await page.evaluate(async () => {
      const { pdfText } = await import('/src/compile/pdf.ts');
      const entries = Object.entries(window.rcCompile.getState().entries).filter(([, x]) => x.output?.pdf);
      return Promise.all(entries.map(async ([k, x]) => [k, await pdfText(x.output.pdf)]));
    });
    const hit = texts.find(([, t]) => re.test(t));
    if (hit) return hit[1];
    await page.waitForTimeout(1000);
  }
  const last = await page.evaluate(() => {
    const e = Object.values(window.rcCompile.getState().entries).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
    return e ? { ok: e.output?.ok, ms: e.output?.durationMs, diags: e.output?.diagnostics, log: (e.output?.log ?? '').slice(-1500) } : null;
  });
  throw new Error(`No PDF matched ${re}. PDFs: ${JSON.stringify(texts.map(([k, t]) => [k, t.slice(0, 120)]))}\nLatest compile: ${JSON.stringify(last, null, 1)}`);
}

/** A small valid RGB PNG (a colored square), made here so the test needs no image files. */
function makePng(size = 24) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(Buffer.from([0, ...Array.from({ length: size }, () => [46, 125, 50]).flat()]));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

await step('packages from the bigger TeX Live sets load: a package TexChef can’t spot, and a document ending in an \\input file', async () => {
  // A package loaded through a macro: TexChef's scan misses it, TeX reports it missing, TexChef loads its set and retries.
  writeFileSync(`${OUT}hidden.tex`, '\\documentclass{article}\n\\def\\pkg{tabto}\n\\expandafter\\usepackage\\expandafter{\\pkg}\n\\begin{document}\nHidden \\tabto{3cm}package loaded.\n\\end{document}\n');
  await page.goto(BASE);
  await page.getByTestId('upload-input').setInputFiles(`${OUT}hidden.tex`);
  await page.getByTestId('editor-page').waitFor();
  await waitPdf(/Hidden\s+package loaded\./, 180_000);
  await page.getByTestId('problems').getByText('No problems').waitFor();
  const used = await page.evaluate(() => Object.values(window.rcCompile.getState().entries).map((e) => e.output?.bundles ?? []));
  assert.ok(used.some((b) => b.includes('extra')), `the retry loaded the "extra" set: ${JSON.stringify(used)}`);
  // The document ends in an \input file: main.tex has no \end{document}.
  const zip = zipSync({
    'cv/main.tex': strToU8('\\documentclass{article}\n\\usepackage[empty]{fullpage}\n\\usepackage{titlesec}\n\\input{body}\n'),
    'cv/body.tex': strToU8('\\begin{document}\n\\section{Body}Ends in an input file.\n\\end{document}\n'),
  });
  writeFileSync(`${OUT}input-end.zip`, zip);
  await page.goto(BASE);
  await page.getByTestId('upload-input').setInputFiles(`${OUT}input-end.zip`);
  await page.getByTestId('editor-page').waitFor();
  await waitPdf(/Ends in an input file\./, 120_000);
});

await step('file types: .tex alone, then .cls .sty .bib .png together; a .ttf font with XeLaTeX; project download keeps every byte', async () => {
  const dir = `${OUT}formats/`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // A lone .tex file becomes a document.
  writeFileSync(`${dir}solo.tex`, '\\documentclass{article}\n\\begin{document}\nJust one file.\n\\end{document}\n');
  await page.goto(BASE);
  await page.getByTestId('upload-input').setInputFiles(`${dir}solo.tex`);
  await page.getByTestId('editor-page').waitFor();
  await page.getByTestId('page-count').waitFor({ timeout: 60_000 });
  await waitPdf(/Just one file\./, 60_000);
  // Loose files of several kinds, uploaded together: one document using all of them.
  const files = {
    'main.tex': [
      '\\documentclass{mycv}',
      '\\usepackage{mystyle}',
      '\\usepackage{graphicx}',
      '\\begin{document}',
      '\\hello\\ \\includegraphics[width=1cm]{logo.png}',
      'As shown by \\cite{knuth}.',
      '\\bibliographystyle{plain}',
      '\\bibliography{refs}',
      '\\end{document}',
      '',
    ].join('\n'),
    'mycv.cls': '\\NeedsTeXFormat{LaTeX2e}\n\\ProvidesClass{mycv}\n\\LoadClass{article}\n\\AtBeginDocument{Custom class works.\\par}\n',
    'mystyle.sty': '\\NeedsTeXFormat{LaTeX2e}\n\\ProvidesPackage{mystyle}\n\\newcommand{\\hello}{Custom style works.}\n',
    'refs.bib': '@book{knuth, author = {Donald E. Knuth}, title = {The {\\TeX}book}, publisher = {Addison-Wesley}, year = {1984}}\n',
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(dir + name, text);
  const png = makePng();
  writeFileSync(`${dir}logo.png`, png);
  await page.goto(BASE);
  await page.getByTestId('upload-input').setInputFiles([...Object.keys(files), 'logo.png'].map((n) => dir + n));
  await page.getByTestId('editor-page').waitFor();
  const text = await waitPdf(/The TE?X?book|The TEXbook/i, 90_000);
  for (const re of [/Custom class works\./, /Custom style works\./, /Knuth/, /\[1\]/]) assert.match(text, re);
  // The image made it into the PDF (an image XObject).
  const hasImage = await page.evaluate(() =>
    Object.values(window.rcCompile.getState().entries).some((x) => x.output?.pdf && /\/Subtype\s*\/Image/.test(new TextDecoder('latin1').decode(x.output.pdf))),
  );
  assert.ok(hasImage, 'the PNG is in the PDF');
  await page.screenshot({ path: `${OUT}12-formats.png` });
  // A font file added to the document, used with XeLaTeX and fontspec.
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf';
  const id = page.url().split('/doc/')[1];
  await page.getByTestId('tab-files').click();
  await page.getByTestId('upload-into-doc').setInputFiles(font);
  await page.getByText('Added 1 file').waitFor();
  await setEngine('xelatex');
  await page.evaluate(async (id) => {
    await window.rc.repo.writeWorkText(id, 'main.tex', '\\documentclass{article}\n\\usepackage{fontspec}\n\\setmainfont{DejaVuSerif-Bold.ttf}[Path=./]\n\\begin{document}\nUploaded font in XeLaTeX.\n\\end{document}\n');
  }, id);
  await waitPdf(/Uploaded font in XeLaTeX/, 240_000);
  // No font errors, and fontspec set up the uploaded font (XeLaTeX compresses the PDF's font tables, so check its log).
  const fontCheck = await page.evaluate(async () => {
    const { pdfText } = await import('/src/compile/pdf.ts');
    for (const x of Object.values(window.rcCompile.getState().entries)) {
      if (!x.output?.pdf || !/Uploaded font in XeLaTeX/.test(await pdfText(x.output.pdf))) continue;
      // fontspec writes the fonts it sets up into the log.
      const names = (x.output.log.match(/[\w-]*DejaVuSerif-Bold[\w.()-]*/g) ?? []).slice(0, 4);
      return { errors: x.output.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message), names };
    }
    return null;
  });
  assert.ok(fontCheck, 'found the XeLaTeX PDF');
  assert.deepEqual(fontCheck.errors, []);
  const usesFont = fontCheck.names.some((n) => /DejaVuSerif-Bold/.test(n ?? ''));
  console.log('    font mentions in the XeLaTeX log:', fontCheck.names.join(', '));
  assert.ok(usesFont, 'the uploaded font is embedded in the PDF');
  // Several files: tabs, and "+" opens another one.
  await page.getByTestId('tab-file-main.tex').waitFor();
  await page.getByTestId('open-file-tab').click();
  await page.getByTestId('open-file-refs.bib').click();
  await page.locator('.cm-content', { hasText: '@book{knuth' }).waitFor();
  assert.equal(await page.getByTestId('tab-file-refs.bib').getAttribute('aria-selected'), 'true');
  await page.getByTestId('tab-file-main.tex').click();
  await page.locator('.cm-content', { hasText: 'Uploaded font in XeLaTeX' }).waitFor();
  await page.screenshot({ path: `${OUT}12b-tabs.png` });
  // Download the project: every file comes back byte for byte (binaries included).
  await page.getByLabel('More').click();
  const dl = page.waitForEvent('download');
  await page.getByText('Download project (.zip)').click();
  const entries = unzipSync(new Uint8Array(readFileSync(await (await dl).path())));
  const names = Object.keys(entries);
  for (const n of ['mycv.cls', 'mystyle.sty', 'refs.bib', 'logo.png', 'DejaVuSerif-Bold.ttf', 'main.tex']) assert.ok(names.some((x) => x.endsWith(n)), `${n} in the zip (${names})`);
  const get = (n) => entries[names.find((x) => x.endsWith(n))];
  assert.deepEqual(Buffer.from(get('logo.png')), png);
  assert.deepEqual(Buffer.from(get('DejaVuSerif-Bold.ttf')), readFileSync(font));
  assert.equal(new TextDecoder().decode(get('refs.bib')), files['refs.bib']);
  assert.ok(names.some((x) => x.endsWith('.pdf')), 'the PDF is included');
  await page.goto(BASE);
});

await step('compile menu (engine with its default, auto-compile, download) and numbered history', async () => {
  await page.goto(masterUrl);
  await page.getByTestId('editor-page').waitFor();
  // One file: no tabs, just its name.
  assert.equal(await page.locator('[data-testid^="tab-file-"]').count(), 0);
  await page.getByTestId('compile-settings').click();
  await page.getByTestId('compile-menu').waitFor();
  assert.match(await page.getByTestId('engine-pdflatex').textContent(), /pdfLaTeX\s*default/);
  assert.equal(await page.getByTestId('engine-pdflatex').getAttribute('aria-checked'), 'true');
  await page.getByTestId('toggle-auto-compile').waitFor();
  await page.getByTestId('download-pdf').waitFor();
  await page.screenshot({ path: `${OUT}09-compile-menu.png` });
  await page.keyboard.press('Escape');
  // History numbers versions and shows how much each one changed.
  await page.getByTestId('tab-history').click();
  await page.getByTestId('history-panel').getByTestId('version-number').first().waitFor();
  const numbers = await page.getByTestId('history-panel').getByTestId('version-number').allTextContents();
  assert.ok(numbers.every((n) => /^v\d+(\.\d+)?$/.test(n)) && numbers.includes('v1'), `version numbers: ${numbers}`);
  await page.getByTestId('history-panel').getByTestId('edit-count').first().waitFor();
  assert.match(await page.getByTestId('history-panel').getByTestId('edit-count').first().textContent(), /^\+\d+ −\d+/);
  await page.screenshot({ path: `${OUT}09b-history.png` });
  await page.getByTestId('tab-blocks').click();
});

await step('visual mode, formatting toolbar, fonts, and the engine suggestion', async () => {
  const tex = [
    '\\documentclass{article}',
    '\\usepackage{hyperref}',
    '\\begin{document}',
    '\\section{Experience}',
    'Built reliable systems at Acme \\& Co.',
    '\\begin{itemize}',
    '  \\item Shipped fast',
    '\\end{itemize}',
    '\\end{document}',
    '',
  ].join('\n');
  writeFileSync(`${OUT}visual.tex`, tex);
  await page.goto(BASE);
  await page.getByTestId('upload-input').setInputFiles(`${OUT}visual.tex`);
  await page.getByTestId('editor-page').waitFor();
  await waitPdf(/Built reliable systems/, 60_000);
  const id = page.url().split('/doc/')[1];
  const textNow = () => page.evaluate(async (id) => (await window.rc.repo.getWork(id)).files['visual.tex'].text, id);
  // Visual: the preamble folds away, the heading and bullets show formatted; switching changes nothing.
  // The formatting bar (with Code / Visual) is hidden until the toggle at the right of the file bar.
  assert.equal(await page.getByTestId('format-bar').count(), 0);
  await page.getByTestId('toggle-format-bar').click();
  await page.getByTestId('editor-mode-visual').click();
  await page.getByTestId('preamble-show').waitFor();
  await page.locator('.cm-vis-h1', { hasText: 'Experience' }).waitFor();
  assert.equal(await page.locator('.cm-vis-item').first().textContent(), '•');
  assert.ok(!(await page.locator('.cm-content').textContent()).includes('\\section'), 'LaTeX hidden');
  await page.screenshot({ path: `${OUT}13-visual.png` });
  // Select a word and make it bold with the toolbar, then undo it with Ctrl+B.
  await dblclickWord('reliable');
  await page.getByTestId('format-bold').click();
  await waitUntil(async (id) => /\\textbf\{reliable\}/.test((await window.rc.repo.getWork(id)).files['visual.tex'].text), id, { timeout: 5000 });
  await page.keyboard.press('Control+b');
  await waitUntil(async (id) => !/textbf/.test((await window.rc.repo.getWork(id)).files['visual.tex'].text), id, { timeout: 5000 });
  // A link on the selected word.
  await dblclickWord('systems');
  await page.getByTestId('format-link').click();
  await page.getByTestId('link-url').fill('https://acme.dev');
  await page.getByTestId('link-ok').click();
  await waitUntil(async (id) => /\\href\{https:\/\/acme\.dev\}\{systems\}/.test((await window.rc.repo.getWork(id)).files['visual.tex'].text), id, { timeout: 5000 });
  // Font for the whole document: compiles, and "Template default" takes it out again.
  await page.getByTestId('format-font').click();
  await page.getByTestId('font-palatino').click();
  await waitUntil(async (id) => /% TexChef font: palatino/.test((await window.rc.repo.getWork(id)).files['visual.tex'].text), id, { timeout: 5000 });
  await waitPdf(/Built reliable/, 60_000);
  await page.getByTestId('problems').getByText('No problems').waitFor({ timeout: 60_000 });
  await page.getByTestId('format-font').click();
  await page.getByTestId('font-default').click();
  await waitUntil(async (id) => !/TexChef font/.test((await window.rc.repo.getWork(id)).files['visual.tex'].text), id, { timeout: 5000 });
  // Switching back to code shows the same LaTeX.
  const before = await textNow();
  await page.getByTestId('editor-mode-code').click();
  await page.locator('.cm-content', { hasText: '\\section{Experience}' }).waitFor();
  assert.equal(await textNow(), before);
  // Written for XeLaTeX but compiled with pdfLaTeX: the problem offers the switch.
  await page.evaluate((id) => window.rc.repo.writeWorkText(id, 'visual.tex', '\\documentclass{article}\n\\usepackage{fontspec}\n\\begin{document}\nNeeds XeLaTeX.\n\\end{document}\n'), id);
  await page.locator('.cm-content', { hasText: 'Needs XeLaTeX.' }).waitFor();
  await page.getByTestId('switch-engine').waitFor({ timeout: 60_000 });
  assert.match(await page.getByTestId('switch-engine').textContent(), /Switch to XeLaTeX/);
  await page.getByTestId('switch-engine').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=compile-button]')?.dataset.engine === 'xelatex');
  await waitPdf(/Needs XeLaTeX\./, 120_000);
  await page.getByTestId('problems').getByText('No problems').waitFor({ timeout: 120_000 });
});

await step('a zip with several documents (Prism export) imports as separate documents', async () => {
  const zip = zipSync({
    'prism-export/vision/main.tex': strToU8('\\documentclass{article}\n\\begin{document}\nVision paper.\n\\input{sec}\n\\end{document}\n'),
    'prism-export/vision/sec.tex': strToU8('Section text.\n'),
    'prism-export/resume/resume.tex': strToU8('\\documentclass{article}\n\\begin{document}\nResume doc.\n\\end{document}\n'),
    'prism-export/README.md': strToU8('exported'),
  });
  writeFileSync(`${OUT}bundle.zip`, zip);
  await page.goto(BASE);
  await page.getByTestId('upload-input').setInputFiles(`${OUT}bundle.zip`);
  const list = page.getByTestId('bundle-list');
  await list.waitFor();
  assert.equal(await list.getByRole('checkbox').count(), 2);
  await page.getByRole('dialog').getByText('README.md').waitFor();
  await page.screenshot({ path: `${OUT}10-bundle.png` });
  await page.getByTestId('bundle-import').click();
  await page.getByText('Imported 2 documents').waitFor();
  await page.getByTestId('view-list').click();
  await page.getByTestId('doc-list').getByText('resume', { exact: true }).waitFor();
  await page.getByTestId('doc-list').getByText('vision', { exact: true }).click();
  await page.getByTestId('editor-page').waitFor();
  await page.getByTestId('page-count').waitFor({ timeout: 60_000 });
  assert.match(await pdfText(), /Vision paper\. Section text\./);
});

/** What a restore must bring back: documents with their details, history and drafts. */
const snapshot = () =>
  page.evaluate(async () => {
    const { repo, db } = window.rc;
    const docs = (await repo.listDocs()).filter((d) => !d.deleted).sort((a, b) => a.id.localeCompare(b.id));
    const work = {};
    for (const d of docs) work[d.id] = (await repo.getWork(d.id)).files['main.tex']?.text ?? null;
    return {
      docs: docs.map((d) => ({ id: d.id, name: d.name, folder: d.folder ?? null, parent: d.parent ?? null, head: d.head, recipe: d.recipe ?? null, color: d.color ?? null, archived: !!d.archived })),
      // Versions of the documents that exist (a deleted document is not backed up).
      commits: (await db.commits.toArray()).filter((c) => docs.some((d) => d.id === c.docId)).length,
      work,
    };
  });

await step('a document that came from Drive (no working copy on this device yet) opens; missing files explain themselves', async () => {
  writeFileSync(`${OUT}synced.tex`, '\\documentclass{article}\n\\begin{document}\nArrived from Drive.\n\\end{document}\n');
  await page.goto(BASE);
  await page.getByTestId('upload-input').setInputFiles(`${OUT}synced.tex`);
  await page.getByTestId('editor-page').waitFor();
  const id = page.url().split('/doc/')[1];
  // Like a sync from Drive: the document and its versions are here, but no working copy yet.
  await page.evaluate(async (id) => {
    await window.rc.repo.commitWork(id, 'Saved version', 'save');
    await window.rc.db.work.delete(id);
  }, id);
  await page.goto(BASE);
  await page.goto(`${BASE}/doc/${id}`);
  await page.locator('.cm-content', { hasText: 'Arrived from Drive.' }).waitFor({ timeout: 15_000 });
  // A version whose file contents aren't on this device (and Drive isn't connected): an explanation, not an endless spinner.
  const missing = await page.evaluate(async (id) => {
    const { db } = window.rc;
    const doc = await db.docs.get(id);
    const head = await db.commits.get(doc.head);
    const copy = { ...doc, id: `${id}x`, name: 'Not downloaded', head: `${head.id}x` };
    await db.commits.put({ ...head, id: `${head.id}x`, docId: copy.id, tree: { 'synced.tex': 'f'.repeat(64) } });
    await db.docs.put(copy);
    return copy.id;
  }, id);
  await page.goto(`${BASE}/doc/${missing}`);
  await page.getByTestId('doc-retry').waitFor({ timeout: 15_000 });
  await page.getByTestId('doc-loading').getByText('hasn’t been downloaded').waitFor();
  await page.evaluate((id) => window.rc.db.docs.delete(id), missing);
});

await step('PDFs render on browsers without the newest JavaScript (as on Safari)', async () => {
  // Safari doesn't have Map.prototype.getOrInsertComputed yet; the modern pdf.js build relies on it.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    for (const C of [Map, WeakMap]) {
      delete C.prototype.getOrInsertComputed;
      delete C.prototype.getOrInsert;
    }
    window.__removedNewJs = typeof Map.prototype.getOrInsertComputed === 'undefined';
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  // Meanwhile the normal page (a browser with everything) has only ever loaded the modern build.
  assert.equal(await page.evaluate(async () => (await (await import('/src/compile/pdf.ts')).loadPdfJs(), window.rcPdfJs)), 'modern');
  assert.deepEqual(legacyRequests, []);
  await p.goto(BASE);
  // Gone before the app loaded (pdf.js's legacy build then brings its own).
  assert.equal(await p.evaluate(() => window.__removedNewJs), true);
  await p.getByTestId('ideas-nav-start').click();
  await p.getByTestId('template-cover-letter').click();
  await p.getByTestId('create-doc').click();
  await p.getByTestId('page-count').waitFor({ timeout: 180_000 });
  await p.locator('canvas').first().waitFor();
  assert.equal(await p.getByText('Could not render PDF').count(), 0);
  // This one needed the legacy build, and got it.
  assert.equal(await p.evaluate(() => window.rcPdfJs), 'legacy');
  assert.deepEqual(errs.filter((m) => /getOrInsert/.test(m)), []);
  await p.screenshot({ path: `${OUT}14-no-new-js.png` });
  await ctx.close();
});

await step('full backup: export, wipe, restore everything (zip, then a folder with outside edits)', async () => {
  await page.goto(BASE);
  // A draft that is not a saved version yet must survive too.
  const draftId = masterUrl.split('/doc/')[1];
  await page.evaluate(async (id) => {
    const { repo } = window.rc;
    const t = (await repo.getWork(id)).files['main.tex'].text;
    await repo.writeWorkText(id, 'main.tex', t + '\n% draft not saved as a version\n');
  }, draftId);
  const before = await snapshot();
  assert.ok(before.docs.length >= 5 && before.docs.some((d) => d.folder));
  await page.getByTestId('folder-all').getByRole('button').first().click();
  await page.getByTestId('export-menu').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('backup-menu').hover();
  await page.getByTestId('backup-zip').click();
  const zipPath = `${OUT}backup.zip`;
  await (await dl).saveAs(zipPath);
  const entries = unzipSync(new Uint8Array(readFileSync(zipPath)));
  assert.ok(entries['.texchef/backup.json'] && entries['.texchef/commits.json']);
  // The readable projects are untouched LaTeX.
  const masterTex = Object.keys(entries).find((p) => /^Master resume\/main\.tex$/.test(p));
  assert.ok(masterTex, 'readable Master resume/main.tex');
  assert.match(new TextDecoder().decode(entries[masterTex]), /% draft not saved as a version/);

  const wipe = async () => {
    await page.evaluate(async () => {
      await window.rc.db.delete();
      localStorage.removeItem('rc-empty-folders');
      localStorage.removeItem('rc-map-positions');
    });
    await page.goto(BASE);
    await page.getByTestId('landing').waitFor();
  };
  await wipe();
  await page.getByTestId('upload-input').setInputFiles(zipPath);
  await page.getByTestId('restore-summary').waitFor();
  await page.getByTestId('restore-backup').click();
  await page.getByText(/^Restored \d+ documents/).waitFor();
  const after = await snapshot();
  assert.deepEqual(after.docs, before.docs);
  assert.equal(after.commits, before.commits);
  assert.deepEqual(after.work, before.work);

  // Edit a project outside TexChef, then restore the backup from a folder: the edit comes in as a change.
  const dir = `${OUT}backup-folder/TexChef backup`;
  rmSync(`${OUT}backup-folder`, { recursive: true, force: true });
  for (const [p, data] of Object.entries(entries)) {
    mkdirSync(`${dir}/${p.split('/').slice(0, -1).join('/')}`, { recursive: true });
    writeFileSync(`${dir}/${p}`, p === masterTex ? new TextDecoder().decode(data).replace('Jordan Rivera', 'Jordan Q. Rivera') : data);
  }
  await wipe();
  await page.getByTestId('upload-folder-input').setInputFiles(dir);
  await page.getByTestId('restore-backup').click();
  await page.getByText(/^Restored \d+ documents/).waitFor();
  const edited = await page.evaluate(async (id) => {
    const w = await window.rc.repo.getWork(id);
    return { text: w.files['main.tex'].text, dirty: w.dirty };
  }, draftId);
  assert.match(edited.text, /Jordan Q\. Rivera/);
  assert.equal(edited.dirty, true);
  const again = await snapshot();
  assert.deepEqual(again.docs, before.docs);
});

assert.deepEqual(errors.filter((e) => !/ResizeObserver/.test(e)), [], 'page errors');
console.log('\nAll e2e checks passed. Screenshots in e2e/out/');
await browser.close();
