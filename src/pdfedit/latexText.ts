/**
 * A plain-text view of LaTeX source that remembers where every visible character came from.
 *
 * `project()` turns `\textbf{Led} a team of 5 engineers \& mentored` into
 * "Led a team of 5 engineers & mentored", with each character pointing back at its source range.
 * Edits made to that plain text can then be written back without touching the markup around it.
 */

export type CharKind =
  /** Ordinary text: edits are escaped (& → \&, % → \%, …). */
  | 'text'
  /** Stands for a whole piece of inline markup (a math symbol, \hfill); edited as one unit. */
  | 'atom'
  /** Shown verbatim (unknown math, URLs): edits inside it are written as typed. */
  | 'raw'
  /** A space that represents structure (\\, &, \begin…): never removed from the source. */
  | 'virtual';

export interface DChar {
  ch: string;
  /** Source range [a, b). Virtual characters have a === b. */
  a: number;
  b: number;
  kind: CharKind;
}

/** Commands whose `{…}` arguments are part of the surrounding text. */
export const WRAPPERS = new Set([
  'textbf', 'textit', 'emph', 'underline', 'uline', 'textsc', 'texttt', 'textrm', 'textsf', 'textup', 'textsl', 'textmd',
  'textnormal', 'mbox', 'makebox', 'hbox', 'text', 'textcolor', 'colorbox', 'fcolorbox', 'href', 'hl', 'sout', 'MakeUppercase',
  'MakeLowercase', 'uppercase', 'lowercase', 'textsuperscript', 'textsubscript', 'footnote', 'raisebox', 'scalebox', 'phantom',
  'small', 'large', 'footnotesize', 'scriptsize', 'tiny', 'normalsize', 'Large', 'LARGE', 'huge', 'Huge', 'bfseries',
  'itshape', 'textls', 'url', 'nolinkurl',
]);

/** Argument-less commands that format text in place (they never split an editable piece of text). */
const INLINE_DECLARATIONS = new Set([
  'small', 'large', 'Large', 'LARGE', 'huge', 'Huge', 'tiny', 'scriptsize', 'footnotesize', 'normalsize', 'bfseries',
  'itshape', 'mdseries', 'scshape', 'upshape', 'slshape', 'rmfamily', 'sffamily', 'ttfamily', 'normalfont', 'em', 'bf',
  'it', 'sc', 'tt', 'rm', 'sf', 'sl', 'centering', 'raggedright', 'raggedleft', 'noindent', 'nobreak', 'relax',
  'selectfont', 'strut', 'unskip', 'ignorespaces', 'null', 'protect', 'today',
]);

/** Commands that print a fixed piece of text. */
const SYMBOLS: Record<string, string> = {
  LaTeX: 'LaTeX', TeX: 'TeX', LaTeXe: 'LaTeX2e', ldots: '…', dots: '…', textellipsis: '…', textbar: '|', textbullet: '•',
  textendash: '–', textemdash: '—', textasciitilde: '~', textasciicircum: '^', textbackslash: '\\', textless: '<',
  textgreater: '>', copyright: '©', textcopyright: '©', textregistered: '®', texttrademark: '™', S: '§', P: '¶', ss: 'ß',
  o: 'ø', O: 'Ø', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', textdegree: '°',
  euro: '€', texteuro: '€', pounds: '£', textsterling: '£', textperiodcentered: '·', textquoteright: '’',
  textquoteleft: '‘', textquotedblleft: '“', textquotedblright: '”', textdollar: '$', textunderscore: '_',
  checkmark: '✓', textasteriskcentered: '∗', slash: '/',
};

/** Commands that make horizontal space; shown as a space that can be deleted. */
const SPACES = new Set(['quad', 'qquad', 'enspace', 'enskip', 'hfill', 'hfil', 'hss', 'space', 'thinspace', 'nobreakspace', 'hspace']);

/** Commands whose first N brace arguments never appear as text in the PDF. */
const HIDDEN_ARGS: Record<string, number> = {
  vspace: 1, hspace: 1, label: 1, ref: 1, eqref: 1, pageref: 1, autoref: 1, cref: 1, Cref: 1, cite: 1, citep: 1, citet: 1,
  nocite: 1, includegraphics: 1, input: 1, include: 1, usepackage: 1, RequirePackage: 1, documentclass: 1, setlength: 2,
  addtolength: 2, setcounter: 2, addtocounter: 2, color: 1, pagecolor: 1, definecolor: 3, rule: 2, raisebox: 1,
  fontsize: 2, newcommand: 2, renewcommand: 2, providecommand: 2, newenvironment: 3, renewenvironment: 3,
  DeclareRobustCommand: 2, NewDocumentCommand: 3, RenewDocumentCommand: 3, def: 0, let: 0, hyphenation: 1,
  linespread: 1, thispagestyle: 1, pagestyle: 1, bibliographystyle: 1, bibliography: 1, addbibresource: 1, geometry: 1,
  newgeometry: 1, hypersetup: 1, setmainfont: 1, setsansfont: 1, setmonofont: 1, faIcon: 1, textcolor: 1, colorbox: 1,
  fcolorbox: 2, href: 1, hphantom: 1, vphantom: 1, multicolumn: 2, multirow: 2, resizebox: 2, scalebox: 1,
  titleformat: 5, titlespacing: 4, newlength: 1, columnbreak: 0, makebox: 0, parbox: 1, settowidth: 2, enlargethispage: 1,
  graphicspath: 1, urlstyle: 1, setlist: 1, pdfbookmark: 2, phantomsection: 0, newpage: 0, clearpage: 0,
};

/** Environments whose opening `\begin{…}` takes extra arguments (column specs and the like). */
const ENV_ARGS: Record<string, number> = {
  tabular: 1, 'tabular*': 2, tabularx: 2, tabulary: 2, array: 1, longtable: 1, minipage: 1, multicols: 1, 'multicols*': 1,
  wrapfigure: 2, tcolorbox: 0, adjustwidth: 2, list: 2, picture: 1, tikzpicture: 0,
};

/** Commands that never break up a piece of text when picking what to edit. */
const INLINE_HIDDEN = new Set([
  'hspace', 'label', 'ref', 'eqref', 'pageref', 'autoref', 'cref', 'Cref', 'cite', 'citep', 'citet', 'color', 'faIcon',
  'hphantom', 'vphantom', 'phantom', 'nocite', 'index',
]);

const ACCENTS: Record<string, string> = {
  "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇',
  c: '̧', v: '̌', u: '̆', H: '̋', k: '̨', r: '̊',
};

const MATH_SYMBOLS: Record<string, string> = {
  cdot: '·', bullet: '•', sim: '~', approx: '≈', times: '×', pm: '±', mp: '∓', geq: '≥', ge: '≥', leq: '≤', le: '≤',
  neq: '≠', rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔',
  longrightarrow: '⟶', uparrow: '↑', downarrow: '↓', star: '⋆', ast: '∗', circ: '∘', diamond: '◇', vert: '|',
  mid: '|', infty: '∞', checkmark: '✓', cdots: '⋯', ldots: '…', dots: '…', diamondsuit: '♢', heartsuit: '♡',
  bigstar: '★', blacksquare: '■', square: '□', triangleright: '▹', rhd: '▷', gg: '≫', ll: '≪', degree: '°',
};

export function isSpaceChar(ch: string): boolean {
  return ch === ' ' || ch === '\n';
}

/** Index of the `}` matching the `{` at `open` (skips escapes and comments); -1 if unbalanced. */
export function matchBrace(src: string, open: number, limit = src.length): number {
  let depth = 0;
  for (let i = open; i < limit; i++) {
    const c = src[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '%') {
      const nl = src.indexOf('\n', i);
      if (nl < 0 || nl >= limit) return -1;
      i = nl;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Index of the `]` matching the `[` at `open`, ignoring brackets inside braces; -1 if none. */
export function matchBracket(src: string, open: number, limit = src.length): number {
  let depth = 0;
  for (let i = open + 1; i < limit; i++) {
    const c = src[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '{') {
      const close = matchBrace(src, i, limit);
      if (close < 0) return -1;
      i = close;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      if (depth === 0) return i;
      depth--;
    } else if (c === '\n' && src[i + 1] === '\n') return -1;
  }
  return -1;
}

/** Skip spaces and tabs, plus at most one line break (what TeX does after a control word). */
export function skipControlSpace(src: string, i: number, limit = src.length): number {
  let nl = false;
  while (i < limit) {
    const c = src[i];
    if (c === ' ' || c === '\t') i++;
    else if (c === '\n' && !nl && src[i + 1] !== '\n') {
      nl = true;
      i++;
    } else break;
  }
  return i;
}

/** Skip `[…]` and `{…}` arguments: `count` brace groups, plus any optional arguments around them. */
export function skipArgs(src: string, i: number, count: number, limit = src.length): number {
  let k = i;
  let left = count;
  for (;;) {
    const j = skipControlSpace(src, k, limit);
    if (src[j] === '[') {
      const close = matchBracket(src, j, limit);
      if (close < 0) return k;
      k = close + 1;
      continue;
    }
    if (left > 0 && src[j] === '{') {
      const close = matchBrace(src, j, limit);
      if (close < 0) return k;
      k = close + 1;
      left--;
      continue;
    }
    return k;
  }
}

function mathDisplay(inner: string): string | null {
  const t = inner.trim();
  const sym = /^\\([A-Za-z]+)$/.exec(t);
  if (sym && MATH_SYMBOLS[sym[1]]) return MATH_SYMBOLS[sym[1]];
  if (/^[|<>+=/:;,.!?*-]$/.test(t)) return t === '-' ? '−' : t;
  if (/^\^\s*\{?\s*\\circ\s*\}?$/.test(t)) return '°';
  if (/^\\[,;:!]?$/.test(t) || t === '') return '';
  return null;
}

/**
 * The visible text of `src[from, to)`, one entry per displayed character.
 * Whitespace is collapsed, leading and trailing whitespace is dropped.
 */
export function project(src: string, from = 0, to = src.length): DChar[] {
  const out: DChar[] = [];

  const push = (ch: string, a: number, b: number, kind: CharKind = 'text') => {
    out.push({ ch, a, b, kind });
  };
  const pushSpace = (a: number, b: number, kind: CharKind, ch: ' ' | '\n' = ' ') => {
    const prev = out[out.length - 1];
    if (!prev) return; // no leading whitespace
    if (isSpaceChar(prev.ch)) {
      // Already a space here. Real whitespace right after real whitespace widens it; anything else is hidden.
      if (kind !== 'virtual' && prev.kind !== 'virtual' && prev.b === a) {
        prev.b = b;
        if (ch === '\n') prev.ch = '\n';
      }
      return;
    }
    out.push({ ch, a, b: kind === 'virtual' ? a : b, kind });
  };

  let i = from;
  while (i < to) {
    const c = src[i];
    if (c === '%') {
      const nl = src.indexOf('\n', i);
      if (nl < 0 || nl >= to) break;
      let j = nl + 1;
      while (j < to && (src[j] === ' ' || src[j] === '\t')) j++;
      // A whole-line comment between two lines of text still separates words only if the next line is blank.
      i = j;
      continue;
    }
    if (c === '\\') {
      i = backslash(i);
      continue;
    }
    if (c === '{' || c === '}') {
      i++;
      continue;
    }
    if (c === '$') {
      const dbl = src[i + 1] === '$';
      const start = i;
      let j = i + (dbl ? 2 : 1);
      while (j < to) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === '$') break;
        j++;
      }
      const end = Math.min(to, j + (dbl ? 2 : 1));
      emitMath(start, end, src.slice(start + (dbl ? 2 : 1), j));
      i = end;
      continue;
    }
    if (c === '~') {
      push(' ', i, i + 1);
      i++;
      continue;
    }
    if (c === '&') {
      pushSpace(i, i, 'virtual');
      i++;
      continue;
    }
    if (c === '-' && src[i + 1] === '-' && i + 1 < to) {
      if (src[i + 2] === '-' && i + 2 < to) {
        push('—', i, i + 3);
        i += 3;
      } else {
        push('–', i, i + 2);
        i += 2;
      }
      continue;
    }
    if (c === '`' && src[i + 1] === '`' && i + 1 < to) {
      push('“', i, i + 2);
      i += 2;
      continue;
    }
    if (c === "'" && src[i + 1] === "'" && i + 1 < to) {
      push('”', i, i + 2);
      i += 2;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      let j = i;
      let nl = 0;
      while (j < to && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) {
        if (src[j] === '\n') nl++;
        j++;
      }
      pushSpace(i, j, 'text', nl >= 2 ? '\n' : ' ');
      i = j;
      continue;
    }
    push(c, i, i + 1);
    i++;
  }
  while (out.length && isSpaceChar(out[out.length - 1].ch)) out.pop();
  return out;

  function emitMath(start: number, end: number, inner: string) {
    const sym = mathDisplay(inner);
    if (sym === '') return;
    if (sym !== null) {
      push(sym, start, end, 'atom');
      return;
    }
    for (let k = start; k < end; k++) {
      const ch = src[k];
      if (ch === '\n') pushSpace(k, k + 1, 'raw');
      else push(ch, k, k + 1, 'raw');
    }
  }

  function backslash(i: number): number {
    const n = src[i + 1];
    if (n === undefined || i + 1 >= to) return i + 1;
    if (n === '\\') {
      let j = i + 2;
      if (src[j] === '*') j++;
      const k = skipControlSpace(src, j, to);
      if (src[k] === '[') {
        const close = matchBracket(src, k, to);
        if (close > 0) j = close + 1;
      }
      pushSpace(i, i, 'virtual');
      return j;
    }
    if ('&%$#_{}'.includes(n)) {
      push(n, i, i + 2);
      return i + 2;
    }
    if (n === ' ' || n === '\n' || n === '\t' || n === ',' || n === ';' || n === ':' || n === '>') {
      pushSpace(i, i + 2, 'text');
      return i + 2;
    }
    if (n === '(' || n === '[') {
      const close = src.indexOf(n === '(' ? '\\)' : '\\]', i + 2);
      const end = close < 0 || close >= to ? to : close + 2;
      emitMath(i, end, src.slice(i + 2, close < 0 ? to : close));
      return end;
    }
    if (ACCENTS[n] && (!/[A-Za-z]/.test(n) || !/[A-Za-z]/.test(src[i + 2] ?? '') || src[i + 2] === '{')) {
      // \'e  \'{e}  \"{\i}  \c{c}
      let j = i + 2;
      if (/[A-Za-z]/.test(n)) j = skipControlSpace(src, j, to);
      let letter: string | undefined;
      let end = j;
      if (src[j] === '{') {
        const close = matchBrace(src, j, to);
        if (close > 0) {
          letter = src.slice(j + 1, close).trim().replace(/^\\i$/, 'i').replace(/^\\j$/, 'j');
          end = close + 1;
        }
      } else if (/[A-Za-z]/.test(src[j] ?? '')) {
        letter = src[j];
        end = j + 1;
      }
      if (letter && letter.length === 1) {
        push((letter + ACCENTS[n]).normalize('NFC'), i, end);
        return end;
      }
      return i + 2;
    }
    if (/[A-Za-z@]/.test(n)) {
      let j = i + 1;
      while (j < to && /[A-Za-z@]/.test(src[j])) j++;
      const name = src.slice(i + 1, j);
      if (src[j] === '*' && j < to) j++;
      const afterName = j;
      const next = skipControlSpace(src, j, to);
      return command(name, i, afterName, next);
    }
    // Other control symbols (\- \/ \! \@ …) print nothing.
    return i + 2;
  }

  function command(name: string, start: number, afterName: number, next: number): number {
    if (name === 'begin' || name === 'end') {
      if (src[next] !== '{') return next;
      const close = matchBrace(src, next, to);
      if (close < 0) return next;
      const env = src.slice(next + 1, close).trim();
      let k = close + 1;
      if (name === 'begin' && ENV_ARGS[env]) k = skipArgs(src, k, ENV_ARGS[env], to);
      pushSpace(start, start, 'virtual');
      return k;
    }
    if (name === 'url' || name === 'nolinkurl' || name === 'path') {
      if (src[next] !== '{') return next;
      const close = matchBrace(src, next, to);
      if (close < 0) return next;
      for (let k = next + 1; k < close; k++) push(src[k], k, k + 1, 'raw');
      return close + 1;
    }
    if (name === 'item') {
      pushSpace(start, start, 'virtual');
      return skipArgs(src, afterName, 0, to);
    }
    if (name === 'par' || name === 'newline' || name === 'linebreak' || name === 'break' || name === 'newpage' || name === 'clearpage') {
      pushSpace(start, start, 'virtual');
      return next;
    }
    if (SYMBOLS[name] !== undefined) {
      // A trailing {} (as in \LaTeX{}) belongs to the symbol.
      let end = next;
      if (src[next] === '{' && src[next + 1] === '}') end = next + 2;
      push(SYMBOLS[name], start, end === next ? afterName : end, 'atom');
      return end;
    }
    if (HIDDEN_ARGS[name] !== undefined) {
      const end = skipArgs(src, afterName, HIDDEN_ARGS[name], to);
      if (SPACES.has(name)) pushSpace(start, end, 'atom');
      else if (!INLINE_HIDDEN.has(name) && !WRAPPERS.has(name)) pushSpace(start, start, 'virtual');
      return end;
    }
    if (SPACES.has(name)) {
      pushSpace(start, next, 'atom');
      return next;
    }
    // Wrappers, declarations and unknown macros: hide the name (and optional args); their {…} text shows.
    if (src[next] === '[') {
      const close = matchBracket(src, next, to);
      if (close > 0) return close + 1;
    }
    return next;
  }
}

/** The display string of a projection. */
export function displayText(chars: DChar[]): string {
  return chars.map((c) => c.ch).join('');
}

const ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  ' ': '~',
  '–': '--',
  '—': '---',
  '“': '``',
  '”': "''",
};

/** Turn typed plain text into LaTeX that prints it. */
export function escapeLatex(s: string): string {
  return s.replace(/\r?\n/g, ' ').replace(/[\\{}&%$#_~^ –—“”]/g, (ch) => ESCAPES[ch]);
}

/** Letters and digits only, lowercased and without accents: what both PDF text and source agree on. */
export function alnum(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Whether `{`/`}` in a piece of LaTeX are balanced (escaped braces and comments ignored). */
export function bracesBalanced(s: string): boolean {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '%') {
      const nl = s.indexOf('\n', i);
      if (nl < 0) break;
      i = nl;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

export function isWrapper(cmd: string): boolean {
  return WRAPPERS.has(cmd);
}

/** Commands that keep an editable piece of text together (formatting, symbols, inline spacing). */
export function isInlineCommand(name: string): boolean {
  return (
    WRAPPERS.has(name) ||
    INLINE_DECLARATIONS.has(name) ||
    SYMBOLS[name] !== undefined ||
    SPACES.has(name) ||
    INLINE_HIDDEN.has(name) ||
    name === 'url' ||
    name === 'nolinkurl'
  );
}

export function hiddenArgCount(name: string): number | undefined {
  return HIDDEN_ARGS[name];
}

export function envArgCount(env: string): number {
  return ENV_ARGS[env] ?? 0;
}
