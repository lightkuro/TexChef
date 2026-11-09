import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { currentFont, insertLink, insertList, setBaseSize, setColor, setDocumentFont, setHeading, setSize, toggleCommand } from './format';

/** Just enough of an EditorView for the formatting commands. */
function fakeView(doc: string, anchor: number, head = anchor) {
  const v = {
    state: EditorState.create({ doc, selection: EditorSelection.single(anchor, head) }),
    dispatch(...specs: TransactionSpec[] | [import('@codemirror/state').Transaction]) {
      const first = specs[0] as { state?: EditorState };
      v.state = first && 'startState' in (first as object) ? (first as unknown as { state: EditorState }).state : v.state.update(...(specs as TransactionSpec[])).state;
    },
    focus() {},
  };
  return v as unknown as EditorView & { state: EditorState };
}
const sel = (v: EditorView) => v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);

const DOC = '\\documentclass{article}\n\\begin{document}\nHello world\n\\end{document}\n';

describe('formatting commands', () => {
  it('bold wraps the selection and unwraps it again', () => {
    const at = DOC.indexOf('world');
    const v = fakeView(DOC, at, at + 5);
    toggleCommand(v, 'textbf');
    expect(v.state.doc.toString()).toContain('Hello \\textbf{world}');
    expect(sel(v)).toBe('world');
    toggleCommand(v, 'textbf');
    expect(v.state.doc.toString()).toBe(DOC);
    expect(sel(v)).toBe('world');
  });

  it('italic with nothing selected inserts an empty \\textit{} with the cursor inside', () => {
    const at = DOC.indexOf('Hello');
    const v = fakeView(DOC, at);
    toggleCommand(v, 'textit', ['emph']);
    expect(v.state.doc.toString()).toContain('\\textit{}Hello');
    expect(v.state.selection.main.head).toBe(at + '\\textit{'.length);
  });

  it('headings: line to section, to subsection, back to normal text', () => {
    const v = fakeView(DOC, DOC.indexOf('Hello') + 2);
    setHeading(v, 1);
    expect(v.state.doc.toString()).toContain('\n\\section{Hello world}\n');
    setHeading(v, 2);
    expect(v.state.doc.toString()).toContain('\n\\subsection{Hello world}\n');
    setHeading(v, 0);
    expect(v.state.doc.toString()).toBe(DOC);
  });

  it('lists: selected lines become items', () => {
    const doc = '\\begin{document}\nOne\nTwo\n\\end{document}\n';
    const v = fakeView(doc, doc.indexOf('One'), doc.indexOf('Two') + 3);
    insertList(v, 'itemize');
    expect(v.state.doc.toString()).toBe('\\begin{document}\n\\begin{itemize}\n  \\item One\n  \\item Two\n\\end{itemize}\n\\end{document}\n');
  });

  it('links add hyperref when it is missing', () => {
    const at = DOC.indexOf('world');
    const v = fakeView(DOC, at, at + 5);
    insertLink(v, 'https://example.com');
    const out = v.state.doc.toString();
    expect(out).toContain('\\usepackage{hyperref}\n\\begin{document}');
    expect(out).toContain('Hello \\href{https://example.com}{world}');
  });

  it('sizes and colors wrap, change and remove', () => {
    const at = DOC.indexOf('world');
    const v = fakeView(DOC, at, at + 5);
    setSize(v, 'large');
    expect(v.state.doc.toString()).toContain('{\\large world}');
    setSize(v, 'small');
    expect(v.state.doc.toString()).toContain('{\\small world}');
    setSize(v, 'normalsize');
    expect(v.state.doc.toString()).toBe(DOC);
    const w = fakeView(DOC, at, at + 5);
    setColor(w, 'teal');
    expect(w.state.doc.toString()).toContain('\\usepackage{xcolor}');
    expect(w.state.doc.toString()).toContain('\\textcolor{teal}{world}');
    expect(sel(w)).toBe('world');
    setColor(w, 'red');
    expect(w.state.doc.toString()).toContain('\\textcolor{red}{world}');
    setColor(w, null);
    expect(w.state.doc.toString()).toContain('Hello world');
  });

  it('document font: a block written before the TexChef rename is still found and replaced', () => {
    const old = DOC.replace('\\begin{document}', '% texChef font: times (change it with the Font menu)\n\\usepackage{tgtermes}\n% end texChef font\n\\begin{document}');
    const v = fakeView(old, 0);
    expect(currentFont(old)).toBe('times');
    setDocumentFont(v, 'default');
    expect(v.state.doc.toString()).toBe(DOC);
  });

  it('document font: one marked block, replaced and removed', () => {
    const v = fakeView(DOC, 0);
    setDocumentFont(v, 'times');
    let out = v.state.doc.toString();
    expect(currentFont(out)).toBe('times');
    expect(out).toMatch(/% TexChef font: times[^\n]*\n\\usepackage\[T1\]\{fontenc\}\n\\usepackage\{tgtermes\}\n\\renewcommand\{\\familydefault\}\{\\rmdefault\}\n% end TexChef font\n\\begin\{document\}/);
    setDocumentFont(v, 'helvetica');
    out = v.state.doc.toString();
    expect(currentFont(out)).toBe('helvetica');
    expect(out.match(/TexChef font:/g)).toHaveLength(1);
    expect(out).toContain('\\renewcommand{\\familydefault}{\\sfdefault}');
    setDocumentFont(v, 'default');
    expect(v.state.doc.toString()).toBe(DOC);
  });

  it('base size goes into the \\documentclass options', () => {
    const v = fakeView('\\documentclass[letterpaper,10pt]{article}\n', 0);
    setBaseSize(v, '11');
    expect(v.state.doc.toString()).toBe('\\documentclass[letterpaper,11pt]{article}\n');
    const w = fakeView('\\documentclass{article}\n', 0);
    setBaseSize(w, '12');
    expect(w.state.doc.toString()).toBe('\\documentclass[12pt]{article}\n');
  });
});
