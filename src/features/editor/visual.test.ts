import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { bodyStart, visualDecorations } from './visual';

const DOC = [
  '\\documentclass{article}',
  '\\usepackage{hyperref}',
  '\\begin{document}',
  '\\section{Experience}',
  '%% @block acme tags=backend,lead',
  '\\textbf{Acme} \\& Co -- \\href{https://acme.dev}{site}',
  '\\begin{itemize}',
  '  \\item Shipped \\emph{fast}',
  '  \\item Led a team',
  '\\end{itemize}',
  '\\rcEntry{Acme}{2022 -- Now}',
  '%% @end',
  '\\end{document}',
  '',
].join('\n');

type Piece = { from: number; to: number; text: string; cls: string; replace: boolean };

function pieces(cursor: number, open = false, focused = true): Piece[] {
  const state = EditorState.create({ doc: DOC, selection: EditorSelection.single(cursor) });
  const out: Piece[] = [];
  visualDecorations(state, open, focused).between(0, DOC.length, (from, to, d) => {
    const spec = d.spec as { widget?: { text?: string; label?: string }; class?: string };
    out.push({ from, to, text: spec.widget?.text ?? spec.widget?.label ?? DOC.slice(from, to), cls: spec.class ?? '', replace: d.point && to > from });
  });
  return out;
}
const at = (s: string, n = 0) => {
  let i = -1;
  for (let k = 0; k <= n; k++) i = DOC.indexOf(s, i + 1);
  return i;
};

describe('visual mode', () => {
  const body = bodyStart(DOC);
  // Cursor in plain text ("Led a team"), so nothing around it shows its LaTeX.
  const p = pieces(at('Led a team') + 3);

  it('folds the preamble and the end of the document into bars', () => {
    expect(p.find((x) => x.from === 0 && x.replace)?.text).toBe('Preamble');
    expect(p.find((x) => x.from === at('\\end{document}') && x.replace)?.text).toBe('End of document');
  });

  it('shows headings, bold, links and escapes formatted, with their LaTeX hidden', () => {
    expect(p.find((x) => x.cls.includes('cm-vis-h1'))?.text).toBe('Experience');
    expect(p.find((x) => x.cls === 'cm-vis-bold')?.text).toBe('Acme');
    expect(p.some((x) => x.replace && x.from === at('\\textbf{') && x.to === at('Acme'))).toBe(true);
    expect(p.find((x) => x.cls === 'cm-vis-link')?.text).toBe('site');
    expect(p.some((x) => x.replace && x.from === at('\\&') && x.to === at('\\&') + 1)).toBe(true);
    expect(p.find((x) => x.from === at(' -- ') + 1)?.text).toBe('–');
  });

  it('shows list items as bullets and texChef blocks as labels', () => {
    expect(p.filter((x) => x.text === '•')).toHaveLength(2);
    expect(p.find((x) => x.from === at('\\begin{itemize}'))?.text).toBe('Bulleted list');
    expect(p.find((x) => x.from === at('%% @block'))?.text).toBe('block acme  #backend #lead');
    expect(p.find((x) => x.from === at('\\rcEntry'))?.text).toBe('rcEntry');
    expect(p.find((x) => x.from === at('}{2022') && x.replace)?.text).toBe(' · ');
  });

  it('shows the LaTeX of whatever the cursor is in', () => {
    const q = pieces(at('Acme') + 2);
    expect(q.some((x) => x.cls === 'cm-vis-bold')).toBe(false);
    expect(q.some((x) => x.replace && x.from === at('\\textbf{'))).toBe(false);
    // Everything else stays formatted.
    expect(q.find((x) => x.cls.includes('cm-vis-h1'))?.text).toBe('Experience');
  });

  it('never hides overlapping ranges', () => {
    const replaced = p.filter((x) => x.replace).sort((a, b) => a.from - b.from);
    for (let i = 1; i < replaced.length; i++) expect(replaced[i].from).toBeGreaterThanOrEqual(replaced[i - 1].to);
  });

  it('opens the preamble on request', () => {
    expect(pieces(body, true).some((x) => x.from === 0 && x.replace)).toBe(false);
  });

  it('without focus, even what the cursor is on looks formatted', () => {
    expect(pieces(body, false, false).find((x) => x.cls === 'cm-vis-h1')?.text).toBe('Experience');
    expect(pieces(body, false, true).find((x) => x.cls === 'cm-vis-h1')).toBeUndefined();
  });
});
