// Layout checks at phone, tablet and split-screen sizes (Chromium via Playwright).
// Usage: start `pnpm dev`, then `node e2e/responsive.mjs [baseUrl]`. Screenshots go to e2e/out/responsive-*.png.
//
// For each size: the home page (folders drawer, toolbar), a new document from the master resume
// template (compiled), the editor's panes (one at a time below 900px, a folding side panel below
// 1280px), the variant builder, compare, settings, help and a legal page. Every page must fit the
// window width: no horizontal scrolling and nothing sticking out past the right edge.
import { chromium, devices } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = new URL('./out/', import.meta.url).pathname;
// One browser profile for every size, so the TeX engine downloads only once per run.
const PROFILE = `${OUT}responsive-profile`;
mkdirSync(OUT, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });

const device = (name) => {
  const { defaultBrowserType: _ignored, ...rest } = devices[name];
  return rest;
};
const SIZES = [
  { tag: 'phone', name: 'phone 390×844', options: { ...device('iPhone 13'), viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 } } },
  { tag: 'ipad-portrait', name: 'iPad portrait 820×1180', options: { ...device('iPad (gen 7)'), viewport: { width: 820, height: 1180 }, screen: { width: 820, height: 1180 } } },
  { tag: 'ipad-landscape', name: 'iPad landscape 1180×820', options: { ...device('iPad (gen 7) landscape'), viewport: { width: 1180, height: 820 }, screen: { width: 1180, height: 820 } } },
  { tag: 'split', name: 'split screen 960×900', options: { viewport: { width: 960, height: 900 } } },
];

let page;
let context;
let errors = [];
let current = '';

const step = async (name, fn) => {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`✓ [${current}] ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    await page?.screenshot({ path: `${OUT}responsive-fail-${current}-${name.replace(/\W+/g, '-')}.png` }).catch(() => {});
    console.error(`✗ [${current}] ${name}\n${e.stack}`);
    if (errors.length) console.error('Page errors:\n' + errors.join('\n'));
    await context?.close();
    process.exit(1);
  }
};

const shot = (name) => page.screenshot({ path: `${OUT}responsive-${current}-${name}.png` });

/** The page fits the window: no horizontal scroll, and nothing visible ends past the right edge. */
async function assertFits(where) {
  const r = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || b.right <= innerWidth + 1 || getComputedStyle(el).visibility === 'hidden') continue;
      // Content inside a box that scrolls or clips (and itself fits) is fine.
      let p = el.parentElement;
      let clipped = false;
      while (p && !clipped) {
        clipped = /(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX) && p.getBoundingClientRect().right <= innerWidth + 1;
        p = p.parentElement;
      }
      if (!clipped) out.push(`<${el.tagName.toLowerCase()} class="${String(el.getAttribute('class') ?? '').slice(0, 80)}"> ends at ${Math.round(b.right)}px`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, innerWidth, out };
  });
  assert.ok(r.scrollWidth <= r.innerWidth, `${where}: page scrolls sideways (scrollWidth ${r.scrollWidth} > ${r.innerWidth})`);
  assert.ok(r.bodyWidth <= r.innerWidth, `${where}: body is wider than the window (${r.bodyWidth} > ${r.innerWidth})`);
  assert.deepEqual(r.out.slice(0, 5), [], `${where}: elements stick out past the right edge`);
}

/** Whether the element is on screen (one-pane layouts hide the other pane with visibility: hidden). */
const shown = (testId) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    return !!el && getComputedStyle(el).visibility === 'visible' && el.getBoundingClientRect().width > 0;
  }, testId);

/** Double-click (or, with `touch`, double-tap) a point of page 1 of the PDF, given in PDF points. */
async function dblclickPdf(x, y, touch = false) {
  const wrap = page.locator('[data-testid=pdf-viewer] [data-page="1"]').first();
  await wrap.locator('canvas').waitFor();
  const box = await wrap.boundingBox();
  const pw = Number(await wrap.getAttribute('data-pw'));
  const ph = Number(await wrap.getAttribute('data-ph'));
  const [px, py] = [box.x + (x / pw) * box.width, box.y + (y / ph) * box.height];
  if (!touch) return page.mouse.dblclick(px, py);
  await page.touchscreen.tap(px, py);
  await page.waitForTimeout(120);
  await page.touchscreen.tap(px, py);
}

/** The PDF is drawn (it may be in the hidden pane). */
const pdfDrawn = () => page.locator('[data-testid=pdf-viewer] [data-page="1"] canvas').first().waitFor({ state: 'attached', timeout: 120_000 });

/** Jumping from the PDF needs SyncTeX data, which only a finished compile has (not the saved preview). */
const syncReady = (id) =>
  page.waitForFunction((id) => {
    const e = window.rcCompile?.getState().entries[id];
    return !!e?.output?.synctex && !e.running;
  }, id, { timeout: 120_000 });


for (const size of SIZES) {
  current = size.tag;
  const { width } = size.options.viewport;
  const layout = width >= 1280 ? 'wide' : width >= 900 ? 'split' : 'single';
  const phone = width < 640;
  context = await chromium.launchPersistentContext(PROFILE, size.options);
  page = context.pages()[0] ?? (await context.newPage());
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  console.log(`— ${size.name} (${layout} layout${phone ? ', phone' : ''})`);
  let docId;
  let variantId;

  await step('home page fits', async () => {
    await page.goto(BASE);
    await page.getByTestId('dashboard').waitFor();
    await page.getByTestId('new-doc').waitFor();
    await assertFits('home');
    await shot('home');
  });

  await step('create a document from the master resume template and compile it', async () => {
    await page.getByTestId('new-doc').click();
    await page.getByTestId('template-resume-master').click();
    await page.getByTestId('create-doc').click();
    await page.getByTestId('editor-page').waitFor();
    docId = page.url().split('/doc/')[1];
    // Attached, not visible: on one-pane layouts the PDF (and its page count) may be the hidden pane.
    await page.getByTestId('page-count').waitFor({ state: 'attached', timeout: 240_000 });
    assert.equal(await page.getByTestId('page-count').textContent(), '1 page');
    await pdfDrawn();
    await assertFits('editor');
    await shot('editor');
  });

  if (layout === 'single') {
    await step('one pane at a time: Code and PDF switch', async () => {
      assert.equal(await shown('pane-bar'), true, 'the pane switch shows');
      await page.getByTestId('pane-tab-code').click();
      assert.equal(await shown('pane-code'), true);
      assert.equal(await shown('pane-pdf'), false);
      await page.getByTestId('pane-tab-pdf').click();
      assert.equal(await shown('pane-pdf'), true);
      assert.equal(await shown('pane-code'), false);
      await page.locator('[data-testid=pdf-viewer] [data-page="1"] canvas').first().waitFor();
      await page.getByTestId('problems').waitFor();
      await assertFits('editor, PDF pane');
      await shot('editor-pdf');
    });

    await step('the last pane is remembered for the session', async () => {
      await page.reload();
      await page.getByTestId('editor-page').waitFor();
      await page.getByTestId('pane-bar').waitFor();
      assert.equal(await shown('pane-pdf'), true, 'PDF pane still shown after a reload');
    });

    await step(phone ? 'double tap in the PDF jumps to the code pane' : 'double-click in the PDF jumps to the code pane', async () => {
      await page.getByTestId('page-count').waitFor({ timeout: 120_000 });
      await syncReady(docId);
      // "Northwind Analytics" sits at about (40bp, 162bp) on page 1 of the template.
      await dblclickPdf(60, 159, phone);
      await page.waitForFunction(() => {
        const code = document.querySelector('[data-testid=pane-code]');
        return code && getComputedStyle(code).visibility === 'visible' && /Northwind Analytics/.test(document.querySelector('.cm-activeLine')?.textContent ?? '');
      });
      assert.equal(await shown('pane-pdf'), false);
    });

    await step('side panel opens as a drawer; a block jumps to the code', async () => {
      await page.getByTestId('pane-tab-pdf').click();
      await page.getByTestId('open-side').click();
      const drawer = page.getByTestId('side-drawer');
      await drawer.waitFor();
      await drawer.getByTestId('blocks-panel').getByText('Experience', { exact: true }).waitFor();
      await page.waitForTimeout(300);
      await assertFits('editor, side drawer');
      await shot('editor-drawer');
      await drawer.getByTestId('tab-files').click();
      await drawer.getByText('main.tex').first().waitFor();
      await drawer.getByTestId('tab-blocks').click();
      await drawer.getByTestId('blocks-panel').getByText('Education', { exact: true }).click();
      await drawer.waitFor({ state: 'detached' });
      assert.equal(await shown('pane-code'), true, 'picking a block shows the code');
      await page.waitForFunction(() => /Education/.test(document.querySelector('.cm-activeLine')?.textContent ?? ''));
    });

    await step('clicking a problem shows its line in the code', async () => {
      // An earlier tap on the PDF can leave an edit box open, which holds auto-compile: close it first.
      if (await page.getByTestId('pdf-edit-input').count()) await page.getByTestId('pdf-edit-input').press('Escape');
      const original = await page.evaluate(async (id) => (await window.rc.repo.getWork(id)).files['main.tex'].text, docId);
      await page.evaluate(
        async ([id, t]) => window.rc.repo.writeWorkText(id, 'main.tex', t.replace('\\begin{document}', '\\begin{document}\n\\undefinedmacro')),
        [docId, original],
      );
      await page.getByTestId('pane-tab-pdf').click();
      const problem = page.getByTestId('problems').locator('li button').filter({ hasText: /Undefined control sequence/ }).first();
      await problem.waitFor({ timeout: 60_000 });
      await assertFits('editor, problems');
      await shot('editor-problems');
      await problem.click();
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector('[data-testid=pane-code]')).visibility === 'visible' &&
          /undefinedmacro/.test(document.querySelector('.cm-activeLine')?.textContent ?? ''),
      );
      await page.evaluate(async ([id, t]) => window.rc.repo.writeWorkText(id, 'main.tex', t), [docId, original]);
      await page.getByTestId('page-count').waitFor({ state: 'attached', timeout: 60_000 });
    });
  } else {
    await step('code and PDF side by side; the side panel folds away', async () => {
      assert.equal(await page.getByTestId('pane-bar').count(), 0, 'no pane switch');
      await page.getByTestId('pdf-viewer').waitFor();
      await page.locator('.cm-content').waitFor();
      const open = await page.getByTestId('side-panel').isVisible();
      // Open by default from 1100px, closed below.
      assert.equal(open, width >= 1100, `side panel ${open ? 'open' : 'closed'} by default at ${width}px`);
      await page.getByTestId('toggle-side').click();
      assert.equal(await page.getByTestId('side-panel').isVisible(), !open);
      if (!open) {
        await page.getByTestId('blocks-panel').getByText('Experience', { exact: true }).waitFor();
        // The PDF re-renders to fit its narrower pane.
        await page.waitForFunction(() => {
          const v = document.querySelector('[data-testid=pdf-viewer]');
          const pg = v?.querySelector('[data-page="1"]');
          return v && pg && pg.getBoundingClientRect().width <= v.clientWidth;
        });
        await assertFits('editor, side panel open');
        await shot('editor-side');
      } else {
        await assertFits('editor, side panel closed');
        await shot('editor-no-side');
      }
      await page.getByTestId('toggle-side').click();
    });

    await step('double-click in the PDF jumps to the source', async () => {
      await syncReady(docId);
      await dblclickPdf(60, 159);
      await page.waitForFunction(() => /Northwind Analytics/.test(document.querySelector('.cm-activeLine')?.textContent ?? ''));
    });
  }

  await step('header: compile and the More menu fit', async () => {
    await page.getByTestId('compile-button').waitFor();
    await page.getByLabel('More').click();
    await page.getByRole('menu').waitFor();
    if (phone) {
      // Save version and New variant move into the menu on phones.
      await page.getByRole('menuitem', { name: 'Save version' }).waitFor();
      await page.getByRole('menuitem', { name: /New variant/ }).waitFor();
    }
    await assertFits('editor, More menu');
    await shot('editor-menu');
    await page.keyboard.press('Escape');
  });

  await step('variant builder fits; create a variant', async () => {
    await page.goto(`${BASE}/doc/${docId}/new-variant`);
    await page.getByTestId('variant-builder').waitFor();
    await page.getByTestId('tag-frontend').click();
    await assertFits('variant builder');
    await shot('variant-builder');
    if (phone) {
      await page.getByTestId('variant-pane-preview').click();
      await page.getByTestId('variant-pages').waitFor({ timeout: 120_000 });
      // The preview recompiles a moment after the tag changes the selection.
      await page.waitForTimeout(1500);
      await page.waitForFunction(() => !document.querySelector('[data-testid=variant-builder] .animate-spin'), null, { timeout: 120_000 });
      await shot('variant-preview');
    }
    await page.getByTestId('variant-name').fill('Frontend resume');
    await page.getByTestId('create-variant').click();
    await page.getByTestId('editor-page').waitFor();
    await page.waitForURL((u) => !u.pathname.endsWith(docId) && !u.pathname.endsWith('new-variant'));
    variantId = page.url().split('/doc/')[1];
    await page.getByTestId('page-count').waitFor({ state: 'attached', timeout: 120_000 });
    await pdfDrawn();
    await assertFits('variant editor');
    await shot('variant-editor');
  });

  await step('compare fits', async () => {
    await page.goto(`${BASE}/compare?left=${docId}&right=${variantId}`);
    await page.getByTestId('compare-page').waitFor();
    await page.getByTestId('diff-view').waitFor();
    await page.waitForTimeout(500);
    await assertFits('compare');
    await shot('compare');
    if (layout === 'single') {
      await page.getByTestId(phone ? 'compare-view-left' : 'compare-view-pdf').click();
      await page.locator('[data-testid=pdf-viewer] [data-page="1"] canvas').first().waitFor({ timeout: 120_000 });
      // Tablets show both PDFs side by side.
      if (!phone) await page.waitForFunction(() => document.querySelectorAll('[data-testid=pdf-viewer] [data-page="1"] canvas').length >= 2, null, { timeout: 120_000 });
      await assertFits('compare, PDF');
      await shot('compare-pdf');
      if (phone) {
        await page.getByTestId('compare-view-right').click();
        await page.locator('[data-testid=pdf-viewer] [data-page="1"] canvas').first().waitFor({ timeout: 120_000 });
      }
      await page.getByTestId('compare-blocks-open').click();
      await page.getByTestId('compare-blocks').waitFor();
      await page.waitForTimeout(300);
      await assertFits('compare, blocks drawer');
      await shot('compare-blocks');
      await page.keyboard.press('Escape');
    }
  });

  await step('home page with documents: folders and toolbar fit', async () => {
    await page.goto(BASE);
    await page.getByTestId('dashboard-content').waitFor();
    await page.waitForTimeout(800);
    await assertFits('home with documents');
    await shot('home-map');
    await page.getByTestId('toggle-folders').click();
    if (width < 1024) {
      // Below 1024px the folders open as a drawer over the page.
      const drawer = page.getByTestId('folder-drawer');
      await drawer.waitFor();
      await drawer.getByTestId('folder-all').waitFor();
      await page.waitForTimeout(300);
      await assertFits('home, folders drawer');
      await shot('home-folders');
      await page.keyboard.press('Escape');
      await drawer.waitFor({ state: 'detached' });
    } else {
      // Docked beside the map: the button hides and shows it.
      await page.getByTestId('folder-sidebar').waitFor({ state: 'detached' });
      await page.getByTestId('toggle-folders').click();
      await page.getByTestId('folder-sidebar').waitFor();
    }
    if (phone) {
      await page.getByTestId('home-more').click();
      await page.getByRole('menu').waitFor();
      await assertFits('home, more menu');
      await shot('home-menu');
      await page.keyboard.press('Escape');
    }
    await page.getByTestId('view-list').click();
    await page.getByTestId('doc-list').waitFor();
    await assertFits('home, list');
    await shot('home-list');
    await page.getByTestId('view-graph').click();
  });

  for (const [name, path, testId] of [
    ['settings', '/settings', null],
    ['help', '/help/variants', 'help-page'],
    ['privacy', '/privacy', 'legal-page'],
    ['ideas', '/ideas', 'ideas-page'],
  ]) {
    await step(`${name} fits`, async () => {
      await page.goto(`${BASE}${path}`);
      if (testId) await page.getByTestId(testId).waitFor();
      else await page.getByText('Appearance').waitFor();
      await assertFits(name);
      await shot(name);
      if (name === 'ideas') {
        // Start writing and See how it works respond to taps (the story section sits under the hero's bottom).
        await page.getByTestId('ideas-start').click();
        await page.getByRole('dialog').waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page.getByTestId('ideas-tour').click();
        await page.waitForFunction(() => document.querySelector('[data-testid=ideas-page]').scrollTop > 100);
        // Let the smooth scroll finish before jumping elsewhere.
        await page.waitForTimeout(1800);
        // The Compare scene (5 of 6): the pinned window still fits.
        await page.evaluate(() => {
          const s = document.querySelector('[data-testid=ideas-story]');
          const box = document.querySelector('[data-testid=ideas-page]');
          box.scrollTop = s.offsetTop + (4.5 / 6) * (s.offsetHeight - box.clientHeight);
        });
        await page.waitForFunction(() => document.querySelector('[data-testid=ideas-story]').dataset.step === '4');
        await page.waitForTimeout(500);
        await assertFits('ideas story');
        await shot('ideas-story');
      }
    });
  }

  assert.deepEqual(errors, [], `page errors at ${size.name}`);
  await context.close();
}

rmSync(PROFILE, { recursive: true, force: true });
console.log('All responsive checks passed.');
