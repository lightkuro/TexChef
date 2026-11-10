import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { alnum, displayText, escapeLatex, project } from './latexText';
import { findInSources, fitToSourceText, pickUnit, groupLines, lineKey, keyIndexAt, sourceLineKey, type PdfTextItem } from './locate';
import { applyPlainEdit, applyRawEdit, unitPlainText } from './applyEdit';

const resume = readFileSync(resolve(__dirname, '../templates/resume-master.tex'), 'utf8');

/** Find the unit behind a piece of visible text, as a click on it would. */
function unitFor(src: string, visible: string, clickOn = visible) {
  const key = alnum(visible);
  const k = alnum(visible.slice(0, visible.indexOf(clickOn))).length;
  const hit = findInSources({ 'main.tex': src }, key, k);
  if (!hit) return undefined;
  const unit = pickUnit(src, 'main.tex', hit.offset);
  if (!unit) return undefined;
  return { ...unit, text: unitPlainText(src, unit.start, unit.end).text, hit };
}

describe('project', () => {
  it('shows text and hides markup', () => {
    const src = "\\textbf{Led} a team of 5 engineers \\& mentored \\emph{two} -- see~more $\\cdot$ 40\\% ``quoted''";
    expect(displayText(project(src))).toBe('Led a team of 5 engineers & mentored two – see\u00a0more · 40% “quoted”');
  });

  it('hides arguments that never print and keeps link text', () => {
    const src = String.raw`\href{mailto:a@b.co}{a@b.co} \vspace{3pt} \textcolor{accent}{Red} \url{x.com/a_b}`;
    expect(displayText(project(src))).toBe('a@b.co Red x.com/a_b');
  });

  it('composes accents and drops comments', () => {
    expect(displayText(project("Caf\\'e na\\\"{\\i}ve % note\nend"))).toBe('Café naïve end');
  });

  it('maps every character back to the source', () => {
    const src = String.raw`\rcItem{Cut costs by 60\%.}`;
    for (const c of project(src)) if (c.kind !== 'virtual') expect(src.slice(c.a, c.b).length).toBeGreaterThan(0);
  });
});

describe('locating clicked text', () => {
  it('finds a bullet and edits the whole macro argument', () => {
    const u = unitFor(resume, 'Migrated 35 services to Kubernetes with Terraform modules, cutting deploy time from 40 to 6', 'Kubernetes');
    expect(u?.text).toBe('Migrated 35 services to Kubernetes with Terraform modules, cutting deploy time from 40 to 6 minutes.');
  });

  it('picks one argument of a multi-argument macro', () => {
    // PDF line of \rcEntry: "Northwind Analytics" ... "Mar 2022 – Present"
    expect(unitFor(resume, 'Northwind Analytics Mar 2022 – Present', 'Northwind')?.text).toBe('Northwind Analytics');
    expect(unitFor(resume, 'Northwind Analytics Mar 2022 – Present', '2022')?.text).toBe('Mar 2022 – Present');
  });

  it('handles uppercased section titles and the header lines', () => {
    expect(unitFor(resume, 'SUMMARY')?.text).toBe('Summary');
    expect(unitFor(resume, 'Jordan Rivera')?.text).toBe('Jordan Rivera');
    const contact = unitFor(resume, 'Seattle, WA · (555) 010-2030 · jordan@example.com', '010');
    expect(contact?.text).toBe('Seattle, WA · (555) 010-2030 · jordan@example.com · github.com/example · linkedin.com/in/example');
  });

  it('keeps a paragraph inside a formatting group together', () => {
    const u = unitFor(resume, 'Software engineer with 7 years building reliable backend platforms', 'reliable');
    expect(u?.text.startsWith('Software engineer with 7 years')).toBe(true);
    expect(u?.text.endsWith('to on-call.')).toBe(true);
    expect(u?.text).not.toContain('Summary');
  });

  it('uses the SyncTeX line to choose between repeated text', () => {
    const src = 'A\n\\begin{document}\n\\section{One}\nPython here.\n\\section{Two}\nPython here.\n\\end{document}\n';
    const hit = findInSources({ 'main.tex': src }, alnum('Python here.'), 0, { file: 'main.tex', line: 6 });
    expect(src.slice(0, hit!.offset).split('\n').length).toBe(6);
  });

  it('finds \\item text and stops at the next item', () => {
    const src = '\\begin{itemize}\n  \\item First \\textbf{bold} point\n  \\item Second point\n\\end{itemize}\n';
    expect(unitFor(src, 'First bold point', 'bold')?.text).toBe('First bold point');
    expect(unitFor(src, 'Second point')?.text).toBe('Second point');
  });

  it('falls back to a window around the click when the line does not match as a whole', () => {
    const src = '\\begin{document}\nSome words \\footnotemark here and more text\n\\end{document}';
    // PDF shows a footnote number "1" after "words".
    const u = unitFor(src, 'Some words1 here and more text', 'more');
    expect(u?.text).toBe('Some words here and more text');
  });
});

describe('plain-text edits', () => {
  const unitOf = (src: string, visible: string) => {
    const u = unitFor(src, visible)!;
    return (next: string) => applyPlainEdit(src, u.start, u.end, next)?.text;
  };

  it('changes words without touching formatting', () => {
    const src = String.raw`\rcItem{Migrated 35 services to \textbf{Kubernetes}, cutting costs 30\%.}`;
    expect(unitOf(src, 'Migrated 35 services')('Migrated 42 services to Kubernetes, cutting costs 30%.')).toBe(
      String.raw`\rcItem{Migrated 42 services to \textbf{Kubernetes}, cutting costs 30\%.}`,
    );
  });

  it('escapes typed special characters', () => {
    const src = String.raw`\rcItem{Grew revenue}`;
    expect(unitOf(src, 'Grew revenue')('Grew revenue 25% & profit #1 in Q1_2024')).toBe(
      String.raw`\rcItem{Grew revenue 25\% \& profit \#1 in Q1\_2024}`,
    );
  });

  it('edits inside bold text and drops formatting that became empty', () => {
    const src = String.raw`\rcItem{Used \textbf{Kubernetes} daily}`;
    const edit = unitOf(src, 'Used Kubernetes daily');
    expect(edit('Used K8s daily')).toBe(String.raw`\rcItem{Used \textbf{K8s} daily}`);
    expect(edit('Used daily')).toBe(String.raw`\rcItem{Used daily}`);
  });

  it('inserts new words outside neighbouring formatting', () => {
    const src = String.raw`\rcItem{Used \textbf{Kubernetes} daily}`;
    expect(unitOf(src, 'Used Kubernetes daily')('Used managed Kubernetes daily')).toBe(String.raw`\rcItem{Used managed \textbf{Kubernetes} daily}`);
  });

  it('keeps dashes and non-breaking spaces as LaTeX', () => {
    const src = String.raw`\rcEntry{Acme}{Jun 2019 -- Feb 2022}{SWE}{Remote}`;
    expect(unitOf(src, 'Jun 2019 – Feb 2022')('Jun 2019 – Mar 2023')).toBe(String.raw`\rcEntry{Acme}{Jun 2019 -- Mar 2023}{SWE}{Remote}`);
  });

  it('never deletes structure such as \\\\ when text around it is removed', () => {
    const src = '\\begin{document}\n\\cvline{\\textbf{Alpha \\\\ Beta}}\n\\end{document}';
    const u = unitFor(src, 'Alpha Beta')!;
    expect(u.text).toBe('Alpha Beta');
    // Removing the space keeps the line break: structure is never deleted from plain text.
    expect(applyPlainEdit(src, u.start, u.end, 'AlphaBeta')?.text).toBe('\\begin{document}\n\\cvline{\\textbf{Alpha\\\\ Beta}}\n\\end{document}');
    expect(applyPlainEdit(src, u.start, u.end, 'Alpha Gamma')?.text).toBe('\\begin{document}\n\\cvline{\\textbf{Alpha \\\\ Gamma}}\n\\end{document}');
  });

  it('protects control words from letters typed right after them', () => {
    const src = String.raw`\rcItem{Wait\ldots}`;
    expect(unitOf(src, 'Wait…')('Wait…ok')).toBe(String.raw`\rcItem{Wait\ldots{}ok}`);
  });

  it('the PDF text after an edit is what was typed', () => {
    const src = String.raw`\rcItem{Migrated \emph{35} services to \textbf{Kubernetes}, cutting $\sim$40\% of deploy time -- fast.}`;
    const u = unitFor(src, 'Migrated 35 services')!;
    for (const typed of [
      'Moved 35 services to K8s and cut ~40% of deploy time – fast.',
      'Migrated services to Kubernetes, cutting deploy time.',
      'X',
      'Migrated 35 services to Kubernetes, cutting · 40% of deploy time – fast & cheap {really} #1_a.',
      'Kubernetes, Migrated 35 services to cutting 40% of deploy time — fast.',
    ]) {
      const out = applyPlainEdit(src, u.start, u.end, typed)!;
      const start = out.text.indexOf('{') + 1;
      const end = out.text.lastIndexOf('}');
      expect(displayText(project(out.text, start, end))).toBe(typed);
    }
  });

  it('raw LaTeX edits must keep braces balanced', () => {
    const src = String.raw`\rcItem{Text}`;
    expect(() => applyRawEdit(src, 8, 12, '\\textbf{Text')).toThrow();
    expect(applyRawEdit(src, 8, 12, '\\textbf{Text}')?.text).toBe(String.raw`\rcItem{\textbf{Text}}`);
  });

  it('escapeLatex covers the special characters', () => {
    expect(escapeLatex('a & b % c $ d # e _ f { g } h ~ i ^ j \\ k')).toBe(
      String.raw`a \& b \% c \$ d \# e \_ f \{ g \} h \textasciitilde{} i \textasciicircum{} j \textbackslash{} k`,
    );
  });
});

describe('PDF lines', () => {
  it('groups items by baseline and maps a click to a character', () => {
    const items: PdfTextItem[] = [
      { str: 'Mar 2022 – Present', x: 400, y: 98, w: 80, h: 10, base: 106 },
      { str: 'Northwind Analytics', x: 40, y: 98, w: 90, h: 10, base: 106 },
      { str: 'Senior Software Engineer', x: 40, y: 110, w: 110, h: 10, base: 118 },
    ];
    const lines = groupLines(items);
    expect(lines).toHaveLength(2);
    expect(lines[0].items.map((i) => i.str)).toEqual(['Northwind Analytics', 'Mar 2022 – Present']);
    const { key, at } = lineKey(lines[0]);
    expect(key).toBe('northwindanalyticsmar2022present');
    const k = keyIndexAt(lines[0], at, 425);
    expect(key[k]).toMatch(/[0-9]/);
  });
});

describe('the cursor line in the PDF', () => {
  // A paragraph typed over two source lines (7 and 8), as pdfLaTeX printed it and SyncTeX described it.
  const src = [
    '\\documentclass{article}',
    '\\begin{document}',
    '\\section{Introduction}',
    '',
    '',
    '',
    'Street trees are among the cheapest climate tools a city has. A single mature tree can cool the air around it by',
    '\\textbf{two to four degrees} on a summer afternoon, and it does so for decades with \\emph{very little upkeep}.',
    '',
    '\\end{document}',
  ].join('\n');
  const item = (str: string, x: number, w: number, base: number): PdfTextItem => ({ str, x, w, base, y: base - 8, h: 10 });
  const items = [
    item('1', 79.2, 8.1, 90.2),
    item('Introduction', 103.4, 88.8, 90.2),
    item('Street trees are among the cheapest climate tools a city has. A single mature tree can cool the', 79.2, 453.6, 114.5),
    item('air around it by', 79.2, 75.6, 128.1),
    item('two to four degrees', 158.4, 105.8, 128.1),
    item('on a summer afternoon, and it does so for decades with', 267.8, 265.0, 128.1),
    item('very little upkeep', 79.2, 80.4, 141.6),
    item('.', 159.6, 3.0, 141.6),
  ];

  it('knows the letters a source line prints', () => {
    expect(sourceLineKey(src, 8)).toBe('twotofourdegreesonasummerafternoonanditdoessofordecadeswithverylittleupkeep');
    expect(sourceLineKey(src, 3)).toBe('introduction');
    expect(sourceLineKey(src, 4)).toBe('');
    expect(sourceLineKey(src, 99)).toBe('');
  });

  it("trims SyncTeX's boxes to the words the line prints", () => {
    // SyncTeX's boxes for line 8: the first starts at "by" (line 7's last word); the second misses "very".
    const rects = [
      { page: 1, x: 143.3, y: 120.1, w: 389.5, h: 10 },
      { page: 1, x: 103.0, y: 133.6, w: 59.7, h: 10 },
    ];
    const [a, b] = fitToSourceText(rects, items, sourceLineKey(src, 8));
    expect(a.x).toBeCloseTo(158.4, 1);
    expect(a.x + a.w).toBeCloseTo(532.8, 1);
    expect(b.x).toBeCloseTo(79.2, 1);
    expect(b.x + b.w).toBeCloseTo(159.6, 1);
    expect(a.page).toBe(1);
  });

  it('keeps a section number with its heading, and leaves boxes it cannot match alone', () => {
    const [h] = fitToSourceText([{ page: 1, x: 79.2, y: 82.2, w: 113, h: 10 }], items, 'introduction');
    expect(h.x).toBeCloseTo(79.2, 1);
    const box = { page: 1, x: 90, y: 106.5, w: 100, h: 10 };
    expect(fitToSourceText([box], items, 'nothinglikethis')).toEqual([box]);
    expect(fitToSourceText([box], items, '')).toEqual([box]);
  });
});
