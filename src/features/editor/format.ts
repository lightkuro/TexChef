import { EditorSelection, type ChangeSpec, type EditorState } from '@codemirror/state';
import type { EditorView, KeyBinding } from '@codemirror/view';
import { matchBrace } from './visual';

/**
 * Formatting commands for the toolbar and shortcuts. They edit the LaTeX text (so they work the same
 * in code and visual mode) and are one undo step each.
 */

/**
 * The innermost `\cmd{…}` (with `args` arguments, e.g. 2 for \textcolor{c}{…}) around [from, to]:
 * positions of `\`, the first `{`, and the `{`/`}` of the last argument.
 */
export function enclosingCommand(
  state: EditorState,
  cmds: string[],
  from: number,
  to = from,
  args = 1,
): { start: number; open: number; lastOpen: number; close: number; name: string } | null {
  const text = state.doc.toString();
  const re = new RegExp(`\\\\(${cmds.join('|')})\\{`, 'g');
  let best: { start: number; open: number; lastOpen: number; close: number; name: string } | null = null;
  for (const m of text.matchAll(re)) {
    const start = m.index!;
    if (start > from) break;
    const open = start + m[0].length - 1;
    let lastOpen = open;
    let close = matchBrace(text, open);
    for (let i = 1; i < args && close > 0; i++) {
      if (text[close + 1] !== '{') {
        close = -1;
        break;
      }
      lastOpen = close + 1;
      close = matchBrace(text, lastOpen);
    }
    if (close < 0 || close < to) continue;
    if (!best || start > best.start) best = { start, open, lastOpen, close, name: m[1] };
  }
  return best;
}

/** Wrap the selection in \cmd{…}, or remove it when the selection is already inside one. */
export function toggleCommand(view: EditorView, cmd: string, aliases: string[] = []): boolean {
  const { state } = view;
  const names = [cmd, ...aliases];
  const tr = state.changeByRange((range) => {
    const around = enclosingCommand(state, names, range.from, range.to);
    if (around) {
      const changes: ChangeSpec[] = [
        { from: around.start, to: around.open + 1 },
        { from: around.close, to: around.close + 1 },
      ];
      const shift = around.open + 1 - around.start;
      return { changes, range: EditorSelection.range(range.anchor - (range.anchor > around.open ? shift : 0), range.head - (range.head > around.open ? shift : 0)) };
    }
    const before = `\\${cmd}{`;
    return {
      changes: [
        { from: range.from, insert: before },
        { from: range.to, insert: '}' },
      ],
      range: EditorSelection.range(range.from + before.length, range.to + before.length),
    };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
  view.focus();
  return true;
}

const HEADINGS = ['section', 'subsection', 'subsubsection'];

/** The paragraph style of the cursor's line: 0 = normal text, 1–3 = heading level. */
export function headingLevel(state: EditorState): number {
  const line = state.doc.lineAt(state.selection.main.head);
  const m = /^\s*\\(section|subsection|subsubsection)\*?\{/.exec(line.text);
  return m ? HEADINGS.indexOf(m[1]) + 1 : 0;
}

/** Make the cursor's line a heading (level 1–3) or normal text (0). */
export function setHeading(view: EditorView, level: number): boolean {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const text = state.doc.toString();
  const m = /^(\s*)\\(section|subsection|subsubsection)(\*?)\{/.exec(line.text);
  let content: string;
  let star = '';
  if (m) {
    const open = line.from + m[0].length - 1;
    const close = matchBrace(text, open);
    if (close < 0) return false;
    content = text.slice(open + 1, close) + text.slice(close + 1, line.to);
    star = m[3];
  } else content = line.text.trim();
  const indent = m ? m[1] : (/^\s*/.exec(line.text)?.[0] ?? '');
  const insert = level ? `${indent}\\${HEADINGS[level - 1]}${star}{${content}}` : `${indent}${content}`;
  const cursor = line.from + insert.length - (level ? 1 : 0);
  view.dispatch({ changes: { from: line.from, to: Math.max(line.to, m ? matchBrace(text, line.from + m[0].length - 1) + 1 : line.to), insert }, selection: { anchor: cursor }, userEvent: 'input.format' });
  view.focus();
  return true;
}

/** Turn the selected lines into a list (each line an \item), or start an empty one. */
export function insertList(view: EditorView, env: 'itemize' | 'enumerate'): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const first = state.doc.lineAt(sel.from);
  const last = state.doc.lineAt(sel.to);
  const lines: string[] = [];
  for (let n = first.number; n <= last.number; n++) lines.push(state.doc.line(n).text.trim());
  const items = lines.filter(Boolean);
  if (!items.length) {
    const insert = `\\begin{${env}}\n  \\item \n\\end{${env}}`;
    view.dispatch({ changes: { from: first.from, to: last.to, insert }, selection: { anchor: first.from + insert.indexOf('\\item ') + 6 }, userEvent: 'input.format' });
  } else {
    const insert = `\\begin{${env}}\n${items.map((t) => `  \\item ${t.replace(/^\\item\s*/, '')}`).join('\n')}\n\\end{${env}}`;
    view.dispatch({ changes: { from: first.from, to: last.to, insert }, selection: { anchor: first.from + insert.length - `\\end{${env}}`.length - 1 }, userEvent: 'input.format' });
  }
  view.focus();
  return true;
}

/** Changes that add `\usepackage{pkg}` before \begin{document} unless it (or `alsoOk`) is already loaded. */
export function ensurePackage(state: EditorState, pkg: string, alsoOk: string[] = []): ChangeSpec | null {
  const text = state.doc.toString();
  const names = [pkg, ...alsoOk].join('|');
  if (new RegExp(`^[^%\\n]*\\\\(?:usepackage|RequirePackage)\\s*(?:\\[[^\\]]*\\])?\\s*\\{[^}]*\\b(?:${names})\\b[^}]*\\}`, 'm').test(text)) return null;
  const begin = /^[^%\n]*\\begin\{document\}/m.exec(text);
  if (!begin) return null;
  return { from: begin.index, insert: `\\usepackage{${pkg}}\n` };
}

/** Wrap the selection in a link (\href{url}{text}); adds hyperref if missing. */
export function insertLink(view: EditorView, url: string): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const label = state.sliceDoc(sel.from, sel.to) || url.replace(/^mailto:|^https?:\/\//, '');
  const insert = `\\href{${url}}{${label}}`;
  const pkg = ensurePackage(state, 'hyperref');
  const changes: ChangeSpec[] = [{ from: sel.from, to: sel.to, insert }];
  if (pkg) changes.push(pkg);
  const set = state.changes(changes);
  view.dispatch({ changes: set, selection: { anchor: set.mapPos(sel.from, -1) + insert.length }, userEvent: 'input.format' });
  view.focus();
  return true;
}

export const SIZE_NAMES = ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge'] as const;

/** Set the text size of the selection ({\large …}); "normalsize" removes it. */
export function setSize(view: EditorView, size: (typeof SIZE_NAMES)[number]): boolean {
  const { state } = view;
  const text = state.doc.toString();
  const sel = state.selection.main;
  // Already inside {\small …}: change or remove that.
  const re = new RegExp(`\\{\\\\(${SIZE_NAMES.join('|')})\\s?`, 'g');
  let around: { open: number; close: number; inner: number } | null = null;
  for (const m of text.matchAll(re)) {
    if (m.index! > sel.from) break;
    const close = matchBrace(text, m.index!);
    if (close >= sel.to) around = { open: m.index!, close, inner: m.index! + m[0].length };
  }
  if (around) {
    const insert = size === 'normalsize' ? '' : `{\\${size} `;
    view.dispatch({
      changes: [
        { from: around.open, to: around.inner, insert },
        ...(size === 'normalsize' ? [{ from: around.close, to: around.close + 1 }] : []),
      ],
      userEvent: 'input.format',
    });
  } else if (size !== 'normalsize') {
    const before = `{\\${size} `;
    view.dispatch({
      changes: [
        { from: sel.from, insert: before },
        { from: sel.to, insert: '}' },
      ],
      selection: { anchor: sel.from + before.length, head: sel.to + before.length },
      userEvent: 'input.format',
    });
  }
  view.focus();
  return true;
}

/** Color the selection (\textcolor{name}{…}); adds xcolor if missing. */
export function setColor(view: EditorView, color: string | null): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const around = enclosingCommand(state, ['textcolor'], sel.from, sel.to, 2);
  if (around) {
    const changes: ChangeSpec[] = color
      ? [{ from: around.open + 1, to: around.lastOpen - 1, insert: color }]
      : [
          { from: around.start, to: around.lastOpen + 1 },
          { from: around.close, to: around.close + 1 },
        ];
    view.dispatch({ changes, userEvent: 'input.format' });
  } else if (color) {
    const before = `\\textcolor{${color}}{`;
    const pkg = ensurePackage(state, 'xcolor', ['color']);
    const changes: ChangeSpec[] = [
      { from: sel.from, insert: before },
      { from: sel.to, insert: '}' },
    ];
    if (pkg) changes.push(pkg);
    const set = state.changes(changes);
    const start = set.mapPos(sel.from, -1) + before.length;
    view.dispatch({ changes: set, selection: { anchor: start, head: start + (sel.to - sel.from) }, userEvent: 'input.format' });
  }
  view.focus();
  return true;
}

/** Insert text at the cursor (replacing the selection). */
export function insertText(view: EditorView, text: string): boolean {
  view.dispatch(view.state.replaceSelection(text), { userEvent: 'input' });
  view.focus();
  return true;
}

// ---- Document font (pdfLaTeX) ----

export interface FontChoice {
  key: string;
  label: string;
  /** CSS font stack for the menu preview. */
  css: string;
  /** Preamble lines. Empty: the template's own font. */
  lines: string[];
  sans?: boolean;
}

/** Fonts that come with the in-browser TeX Live (checked to compile). */
export const FONTS: FontChoice[] = [
  { key: 'default', label: 'Template default', css: 'inherit', lines: [] },
  { key: 'charter', label: 'Charter', css: '"Charter", "Bitstream Charter", Georgia, serif', lines: ['\\usepackage[T1]{fontenc}', '\\usepackage{charter}'] },
  { key: 'times', label: 'Times', css: '"Times New Roman", Times, serif', lines: ['\\usepackage[T1]{fontenc}', '\\usepackage{tgtermes}'] },
  { key: 'palatino', label: 'Palatino', css: '"Palatino Linotype", Palatino, "Book Antiqua", serif', lines: ['\\usepackage[T1]{fontenc}', '\\usepackage{tgpagella}'] },
  { key: 'schoolbook', label: 'Century Schoolbook', css: '"Century Schoolbook", "New Century Schoolbook", serif', lines: ['\\usepackage[T1]{fontenc}', '\\usepackage{tgschola}'] },
  { key: 'bookman', label: 'Bookman', css: '"Bookman Old Style", Bookman, serif', lines: ['\\usepackage[T1]{fontenc}', '\\usepackage{tgbonum}'] },
  { key: 'utopia', label: 'Utopia', css: 'Utopia, Georgia, serif', lines: ['\\usepackage[T1]{fontenc}', '\\usepackage{utopia}'] },
  { key: 'libertine', label: 'Linux Libertine', css: '"Linux Libertine", "Libertinus Serif", Georgia, serif', lines: ['\\usepackage[T1]{fontenc}', '\\usepackage{libertine}'] },
  {
    key: 'helvetica',
    label: 'Helvetica (sans)',
    css: 'Helvetica, Arial, sans-serif',
    lines: ['\\usepackage[T1]{fontenc}', '\\usepackage{tgheros}', '\\renewcommand{\\familydefault}{\\sfdefault}'],
    sans: true,
  },
  {
    key: 'avantgarde',
    label: 'Avant Garde (sans)',
    css: '"Avant Garde", "Century Gothic", sans-serif',
    lines: ['\\usepackage[T1]{fontenc}', '\\usepackage{tgadventor}', '\\renewcommand{\\familydefault}{\\sfdefault}'],
    sans: true,
  },
];

const FONT_BLOCK = /^% texChef font: .*\n(?:.*\n)*?% end texChef font\n?/m;

/** Which font the document uses through the Font menu ('default' if none). */
export function currentFont(text: string): string {
  const m = /^% texChef font: (\w+)/m.exec(text);
  return m && FONTS.some((f) => f.key === m[1]) ? m[1] : 'default';
}

/** Set the document font: a small, marked block just before \begin{document}, replaced on each change. */
export function setDocumentFont(view: EditorView, key: string): boolean {
  const { state } = view;
  const text = state.doc.toString();
  const font = FONTS.find((f) => f.key === key);
  if (!font) return false;
  const block = font.lines.length
    ? `% texChef font: ${font.key} (change it with the Font menu)\n${font.lines
        .filter((l) => !(l.includes('{fontenc}') && /^[^%\n]*\\usepackage\[[^\]]*T1[^\]]*\]\{fontenc\}/m.test(text.replace(FONT_BLOCK, ''))))
        .concat(font.sans ? [] : ['\\renewcommand{\\familydefault}{\\rmdefault}'])
        .join('\n')}\n% end texChef font\n`
    : '';
  const existing = FONT_BLOCK.exec(text);
  if (existing) {
    view.dispatch({ changes: { from: existing.index, to: existing.index + existing[0].length, insert: block }, userEvent: 'input.format' });
  } else if (block) {
    const begin = /^[^%\n]*\\begin\{document\}/m.exec(text);
    if (!begin) return false;
    view.dispatch({ changes: { from: begin.index, insert: block }, userEvent: 'input.format' });
  }
  return true;
}

/** The base font size from \documentclass[11pt]{…}, if set. */
export function baseSize(text: string): string | undefined {
  return /\\documentclass\s*\[[^\]]*?\b(10|11|12)pt\b/.exec(text)?.[1];
}

/** Set the base font size (10/11/12pt) in the \documentclass options. */
export function setBaseSize(view: EditorView, pt: '10' | '11' | '12'): boolean {
  const { state } = view;
  const text = state.doc.toString();
  const m = /\\documentclass\s*(\[([^\]]*)\])?\s*\{/.exec(text);
  if (!m) return false;
  if (m[1]) {
    const opts = m[2].split(',').map((o) => o.trim()).filter((o) => o && !/^(10|11|12)pt$/.test(o));
    const insert = `[${[...opts, `${pt}pt`].join(',')}]`;
    const from = m.index + m[0].indexOf('[');
    view.dispatch({ changes: { from, to: from + m[1].length, insert }, userEvent: 'input.format' });
  } else {
    const from = m.index + '\\documentclass'.length;
    view.dispatch({ changes: { from, insert: `[${pt}pt]` }, userEvent: 'input.format' });
  }
  return true;
}

export const formatKeymap: KeyBinding[] = [
  { key: 'Mod-b', preventDefault: true, run: (v) => toggleCommand(v, 'textbf') },
  { key: 'Mod-i', preventDefault: true, run: (v) => toggleCommand(v, 'textit', ['emph']) },
  { key: 'Mod-u', preventDefault: true, run: (v) => toggleCommand(v, 'underline') },
];

// ---- Telling the toolbar that the selection moved (one editor at a time) ----
const listeners = new Set<() => void>();
export function notifyEditorUpdate() {
  listeners.forEach((l) => l());
}
export function onEditorUpdate(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
