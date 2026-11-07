// End-to-end check of the main flows in a real browser (Chromium via Playwright).
// Usage: start `pnpm dev` (with TeX assets from `pnpm tex:assets`), then `pnpm e2e [baseUrl]`.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { zipSync, strToU8, unzipSync } from 'fflate';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
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

await step('dashboard loads with welcome screen', async () => {
  await page.goto(BASE);
  await page.getByText('One master resume, many tailored versions').waitFor();
});

await step('home page links to Privacy and Terms; themes switch', async () => {
  await page.getByTestId('link-privacy').click();
  await page.getByTestId('legal-page').getByText('Limited Use requirements', { exact: false }).waitFor();
  await page.goto(`${BASE}/terms`);
  await page.getByTestId('legal-page').getByText('Limitation of liability').waitFor();
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
  await page.getByTestId('new-doc').click();
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
  await page.waitForFunction(async () => {
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
  page.waitForFunction(
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
  for (const id of [v, m]) await page.waitForFunction(async (id) => /80\\%/.test((await window.rc.repo.getWork(id)).files['main.tex'].text), id);
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
  await page.getByTestId('graph-family').click();
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
  await page.getByTestId('graph-versions').click();
  await page.locator('.react-flow__node-commit').first().waitFor();
  const commits = await page.locator('.react-flow__node-commit').count();
  assert.ok(commits >= 4, `expected ≥4 visible versions, got ${commits}`);
  await page.locator('.react-flow__node-commit').last().click();
  await page.getByTestId('commit-panel').waitFor();
  await page.screenshot({ path: `${OUT}05-versions.png` });
  await page.getByTestId('graph-family').click();
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
  await page.getByTestId('map-full-pages').click();
  await page.waitForTimeout(600);
  const box = await page.getByTestId('doc-node-Master resume').boundingBox();
  assert.ok(box.height / (box.width / 232) > before + 150, 'full-page cards are taller');
  await page.getByTestId('map-full-pages').click();
  // Snap to grid: a dragged card lands on a grid cell, is remembered, and Reset puts it back.
  await page.getByTestId('map-snap').click();
  await page.waitForTimeout(600);
  const card = await page.getByTestId('doc-node-Backend resume').boundingBox();
  await page.mouse.move(card.x + card.width / 2, card.y + card.height * 0.85);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width / 2 + card.width * 1.2, card.y + card.height * 0.85 + 20, { steps: 12 });
  await page.mouse.up();
  await page.getByTestId('map-reset').waitFor();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rc-map-positions')).vertical);
  const [pos] = Object.values(saved);
  assert.ok(pos && pos.x % 272 === 0 && pos.y % 250 === 0, `snapped to the grid, got ${JSON.stringify(pos)}`);
  assert.equal(new URL(page.url()).pathname, '/');
  await page.getByTestId('map-reset').click();
  await page.getByTestId('map-reset').waitFor({ state: 'detached' });
  await page.getByTestId('map-snap').click();
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

await step('help pages explain the features', async () => {
  await page.getByTestId('help-link').click();
  await page.getByRole('heading', { name: 'A five-minute tour' }).waitFor();
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

await step('folders: create, drag in, move via menu, browse and grouped views, rename, delete', async () => {
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
  // "All, grouped" shows everything, grouped by folder.
  await page.getByTestId('folder-mode-grouped').click();
  await page.getByTestId('group-Applications').getByTestId('doc-row-Master resume').waitFor();
  await page.getByTestId('folder-mode-browse').click();
  // Open the folder: its documents show, on the list and on the map.
  await page.getByTestId('folder-row-Applications').getByRole('button', { name: 'Applications', exact: true }).click();
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
  await page.waitForFunction(async () => (await window.rc.repo.listDocs()).filter((d) => d.folder === 'Jobs').length === 2);
  await page.getByTestId('folder-Jobs').hover();
  await page.getByLabel('Actions for folder Jobs').click();
  await page.getByRole('menuitem', { name: 'Delete folder…' }).click();
  await page.getByRole('dialog').getByText('are kept').waitFor();
  await page.getByTestId('folder-dialog-ok').click();
  await page.getByTestId('folder-Jobs').waitFor({ state: 'detached' });
  await page.waitForFunction(async () => (await window.rc.repo.listDocs()).every((d) => !d.folder));
  await page.getByTestId('doc-node-Master resume').waitFor();
});

await step('right-click empty space: new folder, previews, export menu', async () => {
  const box = await page.getByTestId('dashboard-content').boundingBox();
  await page.mouse.click(box.x + 40, box.y + box.height - 60, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Make missing previews' }).waitFor();
  await page.getByRole('menuitem', { name: 'Export everything' }).hover();
  await page.getByRole('menuitem', { name: 'Backup with history (.zip)' }).waitFor();
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
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}06-compare.png` });
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
  await page.getByRole('menuitem', { name: 'Backup with history (.zip)' }).click();
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
    await page.getByText('One master resume, many tailored versions').waitFor();
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

  // Edit a project outside texChef, then restore the backup from a folder: the edit comes in as a change.
  const dir = `${OUT}backup-folder/texChef backup`;
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
