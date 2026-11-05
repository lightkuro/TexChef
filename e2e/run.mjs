// End-to-end check of the main flows in a real browser (Chromium via Playwright).
// Usage: start `pnpm dev` (with TeX assets from `pnpm tex:assets`), then `pnpm e2e [baseUrl]`.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

let masterUrl;
let variantUrl;

await step('dashboard loads with welcome screen', async () => {
  await page.goto(BASE);
  await page.getByText('One master resume, many tailored versions').waitFor();
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
  await page.getByTestId('locate-in-pdf').click();
  await page.locator('.sync-hl').first().waitFor();
});

await step('editing the source recompiles the PDF', async () => {
  const cm = page.locator('.cm-content');
  await cm.click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('% edited in e2e\n');
  await page.waitForFunction(async () => {
    const w = await window.rc.db.work.toArray();
    return w.some((x) => x.files['main.tex']?.text?.startsWith('% edited in e2e'));
  });
  await page.getByTestId('save-version').click();
  await page.getByText('Version saved').waitFor();
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
  await page.getByTestId('pull-button').click();
  await page.getByTestId('pull-page').waitFor();
  await page.getByText('Merges cleanly').waitFor();
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

await step('dashboard graph shows master → variant', async () => {
  await page.goto(BASE);
  await page.getByTestId('view-graph').click();
  await page.getByTestId('graph-family').click();
  await page.getByTestId('doc-node-Master resume').waitFor();
  await page.getByTestId('doc-node-Frontend resume').waitFor();
  // Edges render once React Flow has measured both nodes.
  await page.locator('.react-flow__edge').first().waitFor();
  assert.equal(await page.locator('.react-flow__edge').count(), 1);
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

assert.deepEqual(errors.filter((e) => !/ResizeObserver/.test(e)), [], 'page errors');
console.log('\nAll e2e checks passed. Screenshots in e2e/out/');
await browser.close();
