import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBlocks, latexToLabel, allTags } from './parser';
import { filterTex, pruneEmptyLists, setBlockSelected, effectiveSelection } from './filter';
import { upsertBlock, removeBlock, compareBlocks, getBlockText } from './ops';
import { automark } from './automark';
import { emptyRecipe } from '@/core/model';

const master = readFileSync(new URL('../templates/resume-master.tex', import.meta.url), 'utf8');

describe('parseBlocks', () => {
  it('parses nested blocks, tags and labels from the template', () => {
    const p = parseBlocks(master);
    expect(p.issues).toEqual([]);
    expect(p.roots.map((b) => b.id)).toEqual(['summary', 'sec-experience', 'sec-projects', 'sec-skills', 'sec-education']);
    const exp = p.byId.get('sec-experience')!;
    expect(exp.children.map((c) => c.id)).toEqual(['exp-northwind', 'exp-contoso', 'exp-intern']);
    expect(p.byId.get('northwind-k8s')!.tags).toEqual(['infra', 'backend']);
    expect(p.byId.get('exp-northwind')!.label).toBe('Northwind Analytics · Mar 2022 – Present · Senior Software Engineer · Seattle, WA');
    expect(p.byId.get('sec-experience')!.label).toBe('Experience');
    expect(allTags(p)).toContain('frontend');
  });

  it('reports unbalanced and duplicate markers', () => {
    const p = parseBlocks('%% @block a\nx\n%% @block a\n%% @end\n%% @end\n%% @end');
    expect(p.issues.map((i) => i.message)).toEqual(['Duplicate block id “a”', '@end without a matching @block']);
    const q = parseBlocks('%% @block open\nx');
    expect(q.issues[0].message).toMatch(/never closed/);
  });

  it('labels common LaTeX lines', () => {
    expect(latexToLabel('  \\item Built \\textbf{fast} things % note')).toBe('Built fast things');
    expect(latexToLabel('\\rcSkill{Languages}{Go, Python}')).toBe('Languages · Go, Python');
  });
});

describe('filterTex', () => {
  it('select mode keeps only included blocks (and drops children of excluded ones)', () => {
    const recipe = { ...emptyRecipe(), include: ['sec-experience', 'exp-northwind', 'northwind-ingest', 'sec-education', 'edu-bs'] };
    const out = filterTex(master, recipe);
    expect(out).toContain('streaming ingestion');
    expect(out).not.toContain('Kubernetes with Terraform');
    expect(out).not.toContain('Contoso');
    expect(out).not.toContain('\\rcSection{Projects}');
    expect(out).toContain('University of Washington');
    expect(out).toContain('\\begin{document}');
    expect(parseBlocks(out).issues).toEqual([]);
  });

  it('tag mode keeps untagged structure and matching tags', () => {
    const out = filterTex(master, { ...emptyRecipe(), tags: ['frontend'] });
    expect(out).toContain('Rebuilt the customer dashboard');
    expect(out).not.toContain('streaming ingestion');
    expect(out).toContain('\\rcSection{Summary}');
    // Intern entry is tagged early-career, so it is excluded with its bullets.
    expect(out).not.toContain('Fabrikam');
  });

  it('prunes item lists left empty', () => {
    // Exclude every Contoso bullet: the empty \rcItemListStart/End pair must disappear.
    const recipe = { ...emptyRecipe(), tags: ['ml'], exclude: [] };
    const out = filterTex(master, recipe);
    const contoso = getBlockText(out, 'exp-contoso')!;
    expect(contoso).not.toContain('rcItemListStart');
    expect(pruneEmptyLists('a\n\\begin{itemize}\n  % c\n\\end{itemize}\nb')).toBe('a\nb');
    expect(pruneEmptyLists('\\begin{itemize}\n%% @block x\n\\item y\n%% @end\n\\end{itemize}')).toContain('itemize');
  });

  it('setBlockSelected keeps overrides minimal', () => {
    let r = { ...emptyRecipe(), tags: ['backend'] };
    const b = { id: 'northwind-ui', tags: ['frontend'] };
    r = setBlockSelected(r, b, true);
    expect(r.include).toEqual(['northwind-ui']);
    r = setBlockSelected(r, b, false);
    expect(r.include).toEqual([]);
    expect(r.exclude).toEqual([]);
    const sel = effectiveSelection(master, { ...emptyRecipe(), include: ['northwind-ingest'] });
    expect(sel.get('northwind-ingest')).toBe(false); // ancestors not included
  });
});

describe('block ops', () => {
  it('upserts a block into a document that lacks it, next to its sibling', () => {
    const variant = filterTex(master, { ...emptyRecipe(), tags: ['backend'] });
    expect(variant).not.toContain('northwind-ui');
    const back = upsertBlock(variant, master, 'northwind-ui')!;
    const ids = parseBlocks(back).byId.get('exp-northwind')!.children.map((c) => c.id);
    expect(ids).toContain('northwind-ui');
    expect(ids.indexOf('northwind-ui')).toBeGreaterThan(ids.indexOf('northwind-k8s'));
  });

  it('replaces an existing block and reports block status', () => {
    const edited = master.replace('40k events/s', '60k events/s');
    const out = upsertBlock(master, edited, 'northwind-ingest')!;
    expect(out).toContain('60k events/s');
    const status = compareBlocks(master, edited);
    expect(status.get('northwind-ingest')).toBe('changed');
    expect(status.get('exp-northwind')).toBe('changed');
    expect(status.get('edu-bs')).toBe('same');
    expect(compareBlocks(removeBlock(master, 'edu-bs'), master).get('edu-bs')).toBe('only-there');
  });
});

describe('automark', () => {
  it('re-creates sensible markers for an unmarked resume', () => {
    const unmarked = master
      .split('\n')
      .filter((l) => !/^\s*%%\s*@(block|end)/.test(l))
      .join('\n');
    const { text, added } = automark(unmarked);
    const p = parseBlocks(text);
    expect(p.issues).toEqual([]);
    expect(added).toBeGreaterThan(15);
    expect(p.roots.map((b) => b.id)).toEqual(['sec-summary', 'sec-experience', 'sec-projects', 'sec-skills', 'sec-education']);
    const exp = p.byId.get('sec-experience')!;
    expect(exp.children.map((c) => c.id)).toEqual(['northwind-analytics', 'contoso-cloud', 'fabrikam-labs']);
    expect(p.byId.get('northwind-analytics')!.children).toHaveLength(5);
    // The entry block must contain its whole bullet list.
    expect(getBlockText(text, 'northwind-analytics')).toContain('\\rcItemListEnd');
    expect(automark(text).added).toBe(0);
  });

  it('handles multi-line entry macros (Jake’s Resume style) and filters them cleanly', () => {
    const src = [
      '\\begin{document}',
      '\\section{Experience}',
      '  \\resumeSubHeadingListStart',
      '    \\resumeSubheading',
      '      {Research Assistant}{June 2020 -- Present}',
      '      {State University}{College Town, TX}',
      '      \\resumeItemListStart',
      '        \\resumeItem{Built a REST API with FastAPI.}',
      '        \\resumeItem{Wrote a data pipeline.}',
      '      \\resumeItemListEnd',
      '    \\resumeSubheading',
      '      {IT Support}{2018 -- 2020}',
      '      {Campus IT}{College Town, TX}',
      '      \\resumeItemListStart',
      '        \\resumeItem{Fixed printers.}',
      '      \\resumeItemListEnd',
      '  \\resumeSubHeadingListEnd',
      '\\end{document}',
    ].join('\n');
    const marked = automark(src).text;
    const p = parseBlocks(marked);
    expect(p.issues).toEqual([]);
    expect(p.byId.get('sec-experience')!.children.map((c) => c.id)).toEqual(['research-assistant', 'it-support']);
    expect(p.byId.get('research-assistant')!.label).toBe('Research Assistant · June 2020 – Present · State University · College Town, TX');
    expect(p.byId.get('research-assistant')!.children.map((c) => c.id)).toEqual(['research-assistant-1', 'research-assistant-2']);
    // Dropping every IT Support bullet removes its now-empty item list too.
    const all = p.all.map((b) => b.id).filter((id) => id !== 'it-support-1');
    const out = filterTex(marked, { ...emptyRecipe(), include: all });
    expect(getBlockText(out, 'it-support')).not.toContain('resumeItemListStart');
    expect(out).toContain('\\resumeSubHeadingListEnd');
  });

  it('marks awesome-cv style entries whose bullets live inside an argument', () => {
    const src = [
      '\\begin{document}',
      '\\cvsection{Experience}',
      '\\begin{cventries}',
      '  \\cventry',
      '    {Engineer} % Job title',
      '    {Northwind} % Organization',
      '    {Remote} % Location',
      '    {2022 - Now} % Date(s)',
      '    {',
      '      \\begin{cvitems}',
      '        \\item {Shipped the thing.}',
      '      \\end{cvitems}',
      '    }',
      '\\end{cventries}',
      '\\end{document}',
    ].join('\n');
    const marked = automark(src).text;
    const p = parseBlocks(marked);
    expect(p.issues).toEqual([]);
    expect(p.byId.get('sec-experience')!.children.map((c) => c.id)).toEqual(['engineer']);
    expect(p.byId.get('engineer')!.children).toHaveLength(1);
    expect(p.byId.get('engineer')!.label).toBe('Engineer · Northwind · Remote · 2022 - Now');
    const out = filterTex(marked, { ...emptyRecipe(), include: ['sec-experience', 'engineer'] });
    expect(out).not.toContain('cvitems');
    expect(out).toContain('\\end{cventries}');
  });

  it('marks plain itemize bullets under sections', () => {
    const src = [
      '\\begin{document}',
      '\\section{Skills}',
      '\\begin{itemize}',
      '  \\item Go and Rust',
      '  \\item Kubernetes',
      '\\end{itemize}',
      '\\end{document}',
    ].join('\n');
    const p = parseBlocks(automark(src).text);
    expect(p.byId.get('sec-skills')!.children.map((c) => c.id)).toEqual(['sec-skills-1', 'sec-skills-2']);
  });
});
