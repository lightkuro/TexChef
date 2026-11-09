import { StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from '@codemirror/view';

/**
 * Visual mode for LaTeX: the text stays exactly the same LaTeX, only its display changes (headings
 * look like headings, \textbf{x} shows a bold x, \item a bullet, the preamble folds away). Whatever
 * the cursor is in shows its LaTeX again, so it can be edited. Switching modes never changes the file.
 */

export const setPreambleOpen = StateEffect.define<boolean>();

export const setFocused = StateEffect.define<boolean>();
/** Whether the editor has focus: without it, nothing shows its LaTeX (the page looks fully formatted). */
const focused = StateField.define<boolean>({
  create: () => false,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setFocused)) v = e.value;
    return v;
  },
});

const setFrozen = StateEffect.define<boolean>();
/**
 * While the mouse button is down (and briefly after, for double-clicks), what is shown as LaTeX stays as
 * it was: revealing under the pointer mid-click would shift the text and the click would land elsewhere.
 */
const frozen = StateField.define<boolean>({
  create: () => false,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setFrozen)) v = e.value;
    return v;
  },
});

const preambleOpen = StateField.define<boolean>({
  create: () => false,
  update(open, tr) {
    for (const e of tr.effects) if (e.is(setPreambleOpen)) open = e.value;
    return open;
  },
});

class TextWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly cls: string,
    readonly title = '',
  ) {
    super();
  }
  eq(o: TextWidget) {
    return o.text === this.text && o.cls === this.cls && o.title === this.title;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = this.cls;
    s.textContent = this.text;
    if (this.title) s.title = this.title;
    return s;
  }
  ignoreEvent() {
    return false;
  }
}

class BlockBar extends WidgetType {
  constructor(
    readonly label: string,
    readonly detail: string,
    readonly action: string,
    readonly open: boolean,
  ) {
    super();
  }
  eq(o: BlockBar) {
    return o.label === this.label && o.detail === this.detail && o.action === this.action && o.open === this.open;
  }
  toDOM(view: EditorView) {
    const d = document.createElement('div');
    d.className = 'cm-vis-bar';
    const l = document.createElement('span');
    l.className = 'cm-vis-bar-label';
    l.textContent = this.label;
    const t = document.createElement('span');
    t.className = 'cm-vis-bar-detail';
    t.textContent = this.detail;
    d.append(l, t);
    if (this.action) {
      const b = document.createElement('button');
      b.className = 'cm-vis-bar-button';
      b.textContent = this.action;
      b.dataset.testid = this.open ? 'preamble-hide' : 'preamble-show';
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => view.dispatch({ effects: setPreambleOpen.of(!this.open) });
      d.append(b);
    }
    return d;
  }
  ignoreEvent() {
    return true;
  }
}

const LIST_ENVS: Record<string, string> = { itemize: 'Bulleted list', enumerate: 'Numbered list', description: 'Description list' };
const SECTION_LEVEL: Record<string, number> = { part: 1, chapter: 1, section: 1, subsection: 2, subsubsection: 3, paragraph: 3, subparagraph: 3 };
const INLINE: Record<string, string> = {
  textbf: 'cm-vis-bold',
  textit: 'cm-vis-italic',
  emph: 'cm-vis-italic',
  textsl: 'cm-vis-italic',
  underline: 'cm-vis-underline',
  uline: 'cm-vis-underline',
  texttt: 'cm-vis-mono',
  textsc: 'cm-vis-smallcaps',
  textsf: 'cm-vis-sans',
  textrm: '',
  textnormal: '',
  textup: '',
  mbox: '',
};
const SIZES: Record<string, string> = {
  tiny: '0.6em',
  scriptsize: '0.7em',
  footnotesize: '0.8em',
  small: '0.9em',
  normalsize: '1em',
  large: '1.15em',
  Large: '1.3em',
  LARGE: '1.5em',
  huge: '1.7em',
  Huge: '1.9em',
};
const SYMBOLS: Record<string, string> = {
  ldots: '…',
  dots: '…',
  LaTeX: 'LaTeX',
  TeX: 'TeX',
  textbullet: '•',
  textbar: '|',
  textendash: '–',
  textemdash: '—',
  textasciitilde: '~',
  textbackslash: '\\',
  textellipsis: '…',
  copyright: '©',
  textcopyright: '©',
  textregistered: '®',
  texttrademark: '™',
  quad: ' ',
  qquad: '  ',
  enspace: ' ',
  newline: '↵',
  linebreak: '↵',
};
const BREAKS = new Set(['newpage', 'clearpage', 'pagebreak']);

/** Index of the brace closing the one at `open`, or -1 (skips escaped braces and comments). */
export function matchBrace(text: string, open: number, max = text.length): number {
  let depth = 0;
  for (let i = open; i < max; i++) {
    const c = text[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '%') {
      const nl = text.indexOf('\n', i);
      if (nl < 0) return -1;
      i = nl;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

function matchBracket(text: string, open: number, max: number): number {
  let depth = 0;
  for (let i = open; i < max; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === ']' && depth === 0) return i;
    else if (c === '\n' && text[i + 1] === '\n') return -1;
  }
  return -1;
}

/** Positions of `{…}` arguments right after `pos` (optionally after `*` and one `[…]`). */
function readArgs(text: string, pos: number, max: number, count: number): { optional?: [number, number]; args: [number, number][]; end: number } {
  let p = pos;
  if (text[p] === '*') p++;
  let optional: [number, number] | undefined;
  if (text[p] === '[') {
    const close = matchBracket(text, p, max);
    if (close < 0) return { args: [], end: pos };
    optional = [p, close];
    p = close + 1;
  }
  const args: [number, number][] = [];
  while (args.length < count && text[p] === '{') {
    const close = matchBrace(text, p, max);
    if (close < 0) break;
    args.push([p, close]);
    p = close + 1;
  }
  return { optional, args, end: p };
}

const hide = Decoration.replace({});
const mark = (cls: string, attrs?: Record<string, string>) => Decoration.mark({ class: cls, attributes: attrs });
const widget = (text: string, cls: string, title = '') => Decoration.replace({ widget: new TextWidget(text, cls, title) });

/** Build the visual-mode decorations for a document. Exported for tests. */
export function visualDecorations(state: EditorState, open = state.field(preambleOpen, false) ?? false, hasFocus = state.field(focused, false) ?? true): DecorationSet {
  const text = state.doc.toString();
  const out: Range<Decoration>[] = [];
  const sel = state.selection.ranges;
  /** Whether the cursor or selection is in [from, to] (edges included): that piece shows its LaTeX. */
  const touched = (from: number, to: number) => hasFocus && sel.some((r) => r.from <= to && r.to >= from);
  const lineAt = (pos: number) => state.doc.lineAt(pos);

  // The preamble (before \begin{document}) folds into one bar; so does everything after \end{document}.
  const begin = /^[^%\n]*\\begin\{document\}/m.exec(text);
  let bodyStart = 0;
  if (begin) {
    const beginLine = lineAt(begin.index + begin[0].length);
    bodyStart = beginLine.to;
    const lines = beginLine.number;
    if (open) {
      out.push(Decoration.widget({ widget: new BlockBar('Preamble', 'Packages, page layout and commands for the whole document', 'Hide', true), block: true, side: -1 }).range(0));
    } else if (!touched(0, beginLine.to)) {
      out.push(
        Decoration.replace({
          widget: new BlockBar('Preamble', `${lines} lines of settings: packages, page layout and commands for the whole document`, 'Show', false),
          block: true,
        }).range(0, beginLine.to),
      );
    }
  }
  const endMatch = /^[^%\n]*\\end\{document\}/m.exec(text.slice(bodyStart));
  let bodyEnd = text.length;
  if (endMatch) {
    const endLine = lineAt(bodyStart + endMatch.index + endMatch[0].length - 1);
    bodyEnd = endLine.from;
    if (!touched(endLine.from, text.length)) {
      out.push(Decoration.replace({ widget: new BlockBar('End of document', '', '', false), block: true }).range(endLine.from, text.length));
    }
  }

  const lists: { env: string; n: number }[] = [];
  const re = /\\(?:([A-Za-z@]+)|([^A-Za-z@]))|%|\$\$?|---?|``|''|~/g;
  re.lastIndex = bodyStart;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m.index < bodyEnd) {
    const at = m.index;
    const tok = m[0];
    // Comments, TexChef block markers.
    if (tok === '%') {
      const line = lineAt(at);
      const marker = /^%%?\s*@(block|end)\b\s*(\S*)\s*(.*)$/.exec(text.slice(at, line.to));
      if (marker && !touched(line.from, line.to)) {
        const label = marker[1] === 'end' ? 'end of block' : `block ${marker[2]}`;
        const tags = marker[1] === 'block' ? marker[3].replace(/^tags=/, '').split(',').filter(Boolean).map((t) => `#${t.trim()}`).join(' ') : '';
        out.push(widget(tags ? `${label}  ${tags}` : label, marker[1] === 'end' ? 'cm-vis-block cm-vis-block-end' : 'cm-vis-block', 'TexChef block: variants pick these').range(at, line.to));
      } else if (at < line.to) {
        out.push(mark('cm-vis-comment').range(at, line.to));
      }
      re.lastIndex = line.to;
      continue;
    }
    // Math: leave as typed, styled.
    if (tok === '$' || tok === '$$') {
      let close = text.indexOf(tok, at + tok.length);
      while (close > 0 && text[close - 1] === '\\') close = text.indexOf(tok, close + 1);
      if (close < 0 || close > bodyEnd) continue;
      out.push(mark('cm-vis-math').range(at, close + tok.length));
      re.lastIndex = close + tok.length;
      continue;
    }
    if (tok === '---' || tok === '--') {
      if (!touched(at, at + tok.length)) out.push(widget(tok === '---' ? '—' : '–', 'cm-vis-sym').range(at, at + tok.length));
      continue;
    }
    if (tok === '``' || tok === "''") {
      if (!touched(at, at + 2)) out.push(widget(tok === '``' ? '“' : '”', 'cm-vis-sym').range(at, at + 2));
      continue;
    }
    if (tok === '~') {
      if (!touched(at, at + 1)) out.push(widget(' ', 'cm-vis-nbsp', 'non-breaking space').range(at, at + 1));
      continue;
    }
    // \& \% \$ \# \_ \{ \} show the character; \\ shows a line break.
    if (m[2] !== undefined) {
      const c = m[2];
      if ('&%$#_{}'.includes(c)) {
        if (!touched(at, at + 2)) out.push(hide.range(at, at + 1), mark('cm-vis-plain').range(at + 1, at + 2));
      } else if (c === '\\') {
        if (!touched(at, at + 2)) out.push(widget('↵', 'cm-vis-break', 'line break').range(at, at + 2));
      }
      continue;
    }
    const name = m[1];
    const nameEnd = at + 1 + name.length;

    if (name === 'begin' || name === 'end') {
      const { args, end } = readArgs(text, nameEnd, bodyEnd, 1);
      if (!args.length) continue;
      const env = text.slice(args[0][0] + 1, args[0][1]).trim();
      if (name === 'begin' && LIST_ENVS[env]) lists.push({ env, n: 0 });
      if (name === 'end' && lists.length && lists[lists.length - 1].env === env) lists.pop();
      if (!touched(at, end)) {
        if (LIST_ENVS[env]) out.push(widget(name === 'begin' ? LIST_ENVS[env] : `end of ${LIST_ENVS[env].toLowerCase()}`, 'cm-vis-env').range(at, end));
        else out.push(mark('cm-vis-envraw').range(at, end));
      }
      re.lastIndex = end;
      continue;
    }

    if (name === 'item') {
      const list = lists[lists.length - 1];
      if (list) list.n++;
      const { optional } = readArgs(text, nameEnd, bodyEnd, 0);
      const end = optional ? optional[1] + 1 : nameEnd;
      const after = text[end] === ' ' ? end + 1 : end;
      if (!touched(at, after)) {
        if (optional) {
          out.push(hide.range(at, optional[0] + 1), mark('cm-vis-bold').range(optional[0] + 1, optional[1]), widget(' ', 'cm-vis-item').range(optional[1], after));
        } else {
          out.push(widget(list?.env === 'enumerate' ? `${list.n}.` : '•', 'cm-vis-item').range(at, after));
        }
      }
      re.lastIndex = end;
      continue;
    }

    // Headings: \section{…}, \subsection*{…}, and template commands like \resumeSection{…}.
    const level = SECTION_LEVEL[name] ?? (/[a-z]Section$|Heading$/.test(name) ? 1 : 0);
    if (level) {
      const { args, end } = readArgs(text, nameEnd, bodyEnd, 1);
      if (args.length && !touched(at, end)) {
        const [o, c] = args[0];
        out.push(hide.range(at, o + 1), mark(`cm-vis-h${level}`).range(o + 1, c), hide.range(c, c + 1));
        const line = lineAt(at);
        if (line.from === at || /^\s*$/.test(text.slice(line.from, at))) out.push(Decoration.line({ class: `cm-vis-hline cm-vis-hline${level}` }).range(line.from));
        re.lastIndex = o + 1;
      } else re.lastIndex = args.length ? args[0][0] + 1 : nameEnd;
      continue;
    }

    if (name in INLINE || name === 'textcolor' || name === 'href' || name === 'url') {
      const count = name === 'textcolor' || name === 'href' ? 2 : 1;
      const { args, end } = readArgs(text, nameEnd, bodyEnd, count);
      if (args.length < count) continue;
      const [o, c] = args[count - 1];
      if (touched(at, end)) {
        re.lastIndex = o + 1;
        continue;
      }
      if (name === 'url') {
        out.push(hide.range(at, o + 1), mark('cm-vis-link', { title: text.slice(o + 1, c) }).range(o + 1, c), hide.range(c, c + 1));
        re.lastIndex = end;
        continue;
      }
      out.push(hide.range(at, o + 1), hide.range(c, c + 1));
      if (name === 'href') out.push(mark('cm-vis-link', { title: text.slice(args[0][0] + 1, args[0][1]) }).range(o + 1, c));
      else if (name === 'textcolor') {
        const color = text.slice(args[0][0] + 1, args[0][1]).trim();
        out.push(mark('cm-vis-color', /^[A-Za-z]+$/.test(color) ? { style: `color: ${color.toLowerCase()}` } : undefined).range(o + 1, c));
      } else if (INLINE[name]) out.push(mark(INLINE[name]).range(o + 1, c));
      re.lastIndex = o + 1;
      continue;
    }

    // {\large text}: the text in that size.
    if (name in SIZES && text[at - 1] === '{') {
      const close = matchBrace(text, at - 1, bodyEnd);
      if (close > 0 && !touched(at - 1, close + 1)) {
        const after = text[nameEnd] === ' ' ? nameEnd + 1 : nameEnd;
        out.push(hide.range(at - 1, after), mark('cm-vis-size', { style: `font-size: ${SIZES[name]}` }).range(after, close), hide.range(close, close + 1));
        re.lastIndex = after;
        continue;
      }
    }

    if (name in SYMBOLS) {
      const end = text.slice(nameEnd, nameEnd + 2) === '{}' ? nameEnd + 2 : nameEnd;
      if (!touched(at, end)) out.push(widget(SYMBOLS[name], name === 'newline' || name === 'linebreak' ? 'cm-vis-break' : 'cm-vis-sym').range(at, end));
      continue;
    }
    if (BREAKS.has(name)) {
      if (!touched(at, nameEnd)) out.push(widget('page break', 'cm-vis-cmd').range(at, nameEnd));
      continue;
    }

    // Anything else (\vspace{4pt}, \rcEntry{A}{B}{C}{D}, \hfill): a small label for the command, its
    // arguments shown as text with thin separators.
    const { optional, args, end } = readArgs(text, nameEnd, bodyEnd, 9);
    if (touched(at, end)) {
      re.lastIndex = args.length ? args[0][0] + 1 : nameEnd;
      continue;
    }
    out.push(widget(name, 'cm-vis-cmd', `\\${name}`).range(at, nameEnd));
    if (optional) out.push(mark('cm-vis-opt').range(optional[0], optional[1] + 1));
    args.forEach(([o, c], i) => {
      out.push(i === 0 ? hide.range(o, o + 1) : widget(' · ', 'cm-vis-sep').range(o - 1, o + 1));
      if (i === args.length - 1) out.push(hide.range(c, c + 1));
    });
    re.lastIndex = args.length ? args[0][0] + 1 : optional ? optional[1] + 1 : nameEnd;
  }
  // Two hidden ranges must never overlap (e.g. a brace hidden for a command's argument and for {\large …}):
  // keep the first.
  out.sort((x, y) => x.from - y.from);
  let replacedTo = -1;
  const kept = out.filter((r) => {
    if (!(r.value.point && r.to > r.from)) return true;
    if (r.from < replacedTo) return false;
    replacedTo = r.to;
    return true;
  });
  return Decoration.set(kept, true);
}

/** Where the document body starts (after \begin{document}), or 0. */
export function bodyStart(text: string): number {
  const begin = /^[^%\n]*\\begin\{document\}/m.exec(text);
  if (!begin) return 0;
  const nl = text.indexOf('\n', begin.index + begin[0].length);
  return nl < 0 ? text.length : nl + 1;
}

/**
 * Keeps the `focused` field in step with the editor (from its own focus/blur events), and, with the
 * preamble folded, moves a cursor left at the very start (which would type above \documentclass)
 * into the body.
 */
const thaw = new WeakMap<EditorView, ReturnType<typeof setTimeout>>();
const focusAndCursor = ViewPlugin.define(
  (view) => {
    queueMicrotask(() => {
      const effects = view.state.field(focused, false) !== view.hasFocus ? [setFocused.of(view.hasFocus)] : [];
      const sel = view.state.selection.main;
      const start = bodyStart(view.state.doc.toString());
      const move = sel.empty && sel.head === 0 && !view.state.field(preambleOpen, false) && start > 0 && start <= view.state.doc.length;
      if (effects.length || move) view.dispatch({ effects, selection: move ? { anchor: start } : undefined });
    });
    return {};
  },
  {
    eventHandlers: {
      mousedown(_e, view) {
        clearTimeout(thaw.get(view));
        if (!view.state.field(frozen)) view.dispatch({ effects: setFrozen.of(true) });
        const up = () => {
          document.removeEventListener('mouseup', up, true);
          thaw.set(
            view,
            setTimeout(() => view.state.field(frozen, false) && view.dispatch({ effects: setFrozen.of(false) }), 300),
          );
        };
        document.addEventListener('mouseup', up, true);
      },
      focus: (_e, view) => void queueMicrotask(() => view.dispatch({ effects: setFocused.of(true) })),
      blur: (_e, view) => void queueMicrotask(() => view.hasFocus || view.dispatch({ effects: setFocused.of(false) })),
    },
  },
);

const decorations = StateField.define<DecorationSet>({
  create: (state) => visualDecorations(state),
  update(deco, tr) {
    const unfreeze = tr.effects.some((e) => e.is(setFrozen) && !e.value);
    if (tr.state.field(frozen) && !tr.docChanged && !tr.effects.some((e) => e.is(setPreambleOpen))) return deco;
    if (unfreeze || tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setPreambleOpen) || e.is(setFocused))) return visualDecorations(tr.state);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.baseTheme({
  '&.cm-visual .cm-content': { fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)', fontSize: '14.5px', lineHeight: '1.65' },
  '.cm-vis-h1': { fontSize: '1.45em', fontWeight: '700' },
  '.cm-vis-h2': { fontSize: '1.2em', fontWeight: '700' },
  '.cm-vis-h3': { fontSize: '1.05em', fontWeight: '700' },
  '.cm-vis-hline1': { paddingTop: '0.5em', borderBottom: '1px solid var(--border)' },
  '.cm-vis-hline2': { paddingTop: '0.3em' },
  '.cm-vis-bold': { fontWeight: '700' },
  '.cm-vis-italic': { fontStyle: 'italic' },
  '.cm-vis-underline': { textDecoration: 'underline' },
  '.cm-vis-mono': { fontFamily: 'ui-monospace, monospace', fontSize: '0.92em' },
  '.cm-vis-smallcaps': { fontVariant: 'small-caps' },
  '.cm-vis-sans': { fontFamily: 'ui-sans-serif, system-ui, sans-serif' },
  '.cm-vis-link': { color: 'var(--info)', textDecoration: 'underline', textUnderlineOffset: '2px' },
  '.cm-vis-math': { fontFamily: 'Georgia, serif', fontStyle: 'italic', color: 'var(--ok)' },
  '.cm-vis-comment': { color: 'var(--muted)', fontStyle: 'italic', fontSize: '0.9em' },
  '.cm-vis-item': { color: 'var(--accent)', fontWeight: '700', display: 'inline-block', minWidth: '1.4em' },
  '.cm-vis-env': {
    color: 'var(--muted)',
    fontSize: '0.75em',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: '1px dashed var(--border)',
  },
  '.cm-vis-envraw': { color: 'var(--muted)', fontSize: '0.85em' },
  '.cm-vis-cmd': {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '0.72em',
    color: 'var(--muted)',
    background: 'var(--subtle)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '0 4px',
    margin: '0 3px 0 0',
    verticalAlign: '1px',
  },
  '.cm-vis-opt': { color: 'var(--muted)', fontSize: '0.85em' },
  '.cm-vis-sep': { color: 'var(--muted)' },
  '.cm-vis-sym': {},
  '.cm-vis-plain': { color: 'var(--fg) !important' },
  '.cm-vis-plain *': { color: 'var(--fg) !important' },
  '.cm-vis-nbsp': { background: 'color-mix(in oklab, var(--border) 40%, transparent)' },
  '.cm-vis-break': { color: 'var(--muted)', fontSize: '0.8em', padding: '0 2px' },
  '.cm-vis-block': {
    fontSize: '0.72em',
    color: 'var(--accent)',
    background: 'var(--accent-soft)',
    borderRadius: '4px',
    padding: '1px 6px',
  },
  '.cm-vis-block-end': { opacity: '0.7' },
  '.cm-vis-bar': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    margin: '4px 0',
    padding: '6px 10px',
    borderRadius: '8px',
    background: 'var(--subtle)',
    border: '1px solid var(--border)',
    fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
    fontSize: '12px',
  },
  '.cm-vis-bar-label': { fontWeight: '600' },
  '.cm-vis-bar-detail': { color: 'var(--muted)', flex: '1' },
  '.cm-vis-bar-button': {
    border: '1px solid var(--border)',
    background: 'var(--panel)',
    borderRadius: '6px',
    padding: '2px 10px',
    cursor: 'pointer',
    font: 'inherit',
  },
});

/** The visual-mode extension for LaTeX files. */
export function visualMode(): Extension {
  return [
    focused,
    frozen,
    preambleOpen,
    decorations,
    theme,
    focusAndCursor,
    EditorView.editorAttributes.of({ class: 'cm-visual' }),
  ];
}
