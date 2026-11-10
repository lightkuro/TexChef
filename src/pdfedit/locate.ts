/**
 * Finding the LaTeX behind a piece of PDF text, and choosing how much of it to edit.
 *
 * SyncTeX only knows source lines. We match the clicked PDF line's letters and digits against the
 * plain-text projection of the source (see latexText.ts), use the SyncTeX line to pick between
 * repeated matches, then grow the hit to a sensible editable unit: a macro argument such as
 * \rcItem{…}, or the run of text between structural markers (\item, \\, blank lines, &, …).
 */
import {
  alnum,
  envArgCount,
  hiddenArgCount,
  isInlineCommand,
  isWrapper,
  matchBrace,
  matchBracket,
  project,
  skipArgs,
  skipControlSpace,
  type DChar,
} from './latexText';

// ---------------------------------------------------------------------------------------------
// PDF side

/** A run of text on a PDF page, in PDF points with a top-left origin. */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Baseline y. */
  base: number;
}

export interface PdfLine {
  items: PdfTextItem[];
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Group text items into visual lines (same baseline), top to bottom, left to right. */
export function groupLines(items: PdfTextItem[]): PdfLine[] {
  const sorted = [...items].sort((a, b) => a.base - b.base || a.x - b.x);
  const lines: PdfLine[] = [];
  let cur: PdfTextItem[] = [];
  let curBase = 0;
  let curH = 0;
  for (const it of sorted) {
    if (cur.length && Math.abs(it.base - curBase) <= Math.max(1, Math.min(curH, it.h) * 0.35)) {
      cur.push(it);
      continue;
    }
    if (cur.length) lines.push(toLine(cur));
    cur = [it];
    curBase = it.base;
    curH = it.h;
  }
  if (cur.length) lines.push(toLine(cur));
  return lines;
}

function toLine(items: PdfTextItem[]): PdfLine {
  items.sort((a, b) => a.x - b.x);
  return { items, ...union(items) };
}

export function union(rs: Rect[]): Rect {
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The line under a point (with a little slack), or undefined. */
export function lineAt(lines: PdfLine[], x: number, y: number): PdfLine | undefined {
  let best: PdfLine | undefined;
  let bestD = Infinity;
  for (const l of lines) {
    const dy = y < l.y ? l.y - y : y > l.y + l.h ? y - l.y - l.h : 0;
    const dx = x < l.x ? l.x - x : x > l.x + l.w ? x - l.x - l.w : 0;
    if (dy > 2.5 || dx > 6) continue;
    const d = dy * 4 + dx;
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

/** Letters/digits of a line, each mapped to the item and character it came from. */
export function lineKey(line: PdfLine): { key: string; at: { item: number; char: number }[] } {
  let key = '';
  const at: { item: number; char: number }[] = [];
  line.items.forEach((it, item) => {
    for (let char = 0; char < it.str.length; char++) {
      const k = alnum(it.str[char]);
      for (const ch of k) {
        key += ch;
        at.push({ item, char });
      }
    }
  });
  return { key, at };
}

/** Index into lineKey().key nearest to a point on the line. */
export function keyIndexAt(line: PdfLine, at: { item: number; char: number }[], x: number): number {
  if (!at.length) return -1;
  let item = 0;
  let bestD = Infinity;
  line.items.forEach((it, i) => {
    const d = x < it.x ? it.x - x : x > it.x + it.w ? x - it.x - it.w : 0;
    if (d < bestD) {
      bestD = d;
      item = i;
    }
  });
  const it = line.items[item];
  const char = Math.max(0, Math.min(it.str.length - 1, Math.floor(((x - it.x) / Math.max(it.w, 1)) * it.str.length)));
  let best = 0;
  for (let i = 0; i < at.length; i++) {
    const p = at[i];
    if (p.item < item || (p.item === item && p.char <= char)) best = i;
  }
  // Clicked before the first alphanumeric character of the item: use the next one.
  if (at[best].item < item) {
    const next = at.findIndex((p) => p.item === item);
    if (next >= 0) best = next;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Source side

export interface SourceIndex {
  src: string;
  chars: DChar[];
  /** Letters/digits of the projection… */
  key: string;
  /** …and for each, the index into `chars`. */
  keyChar: number[];
  lineStarts: number[];
  /** Offset of \begin{document} (0 if absent): matches before it are unlikely to be body text. */
  bodyStart: number;
}

const indexCache = new Map<string, SourceIndex>();

export function indexSource(src: string): SourceIndex {
  const hit = indexCache.get(src);
  if (hit) return hit;
  const chars = project(src);
  let key = '';
  const keyChar: number[] = [];
  chars.forEach((c, i) => {
    for (const ch of alnum(c.ch)) {
      key += ch;
      keyChar.push(i);
    }
  });
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
  const body = src.indexOf('\\begin{document}');
  const index = { src, chars, key, keyChar, lineStarts, bodyStart: body < 0 ? 0 : body };
  if (indexCache.size > 24) indexCache.clear();
  indexCache.set(src, index);
  return index;
}

/** 1-based line number of an offset. */
export function lineOf(index: Pick<SourceIndex, 'lineStarts'>, offset: number): number {
  let lo = 0;
  let hi = index.lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (index.lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export interface SourceHit {
  file: string;
  /** Offset of the source character behind the clicked PDF character. */
  offset: number;
}

/**
 * Find where a clicked PDF line comes from.
 * `key`/`k`: the line's letters and digits and the clicked position in them.
 * `hint`: the SyncTeX answer for the click, used to choose between repeated text.
 */
export function findInSources(
  files: Record<string, string>,
  key: string,
  k: number,
  hint?: { file: string; line: number },
): SourceHit | undefined {
  if (!key || k < 0) return undefined;
  const order = Object.keys(files).sort((a, b) => (a === hint?.file ? -1 : b === hint?.file ? 1 : 0));
  const windows: [number, number][] = [[0, key.length]];
  for (const r of [40, 24, 14, 9, 6, 4]) {
    const s = Math.max(0, k - r);
    const e = Math.min(key.length, k + r + 1);
    if (e - s < key.length) windows.push([s, e]);
  }
  for (const [s, e] of windows) {
    const sub = key.slice(s, e);
    if (sub.length < Math.min(4, key.length)) continue;
    const short = sub.length < 10;
    let best: (SourceHit & { score: number }) | undefined;
    for (const file of order) {
      const index = indexSource(files[file]);
      for (let at = index.key.indexOf(sub); at >= 0; at = index.key.indexOf(sub, at + 1)) {
        const offset = index.chars[index.keyChar[at + (k - s)]].a;
        const line = lineOf(index, offset);
        const sameFile = hint && file === hint.file;
        if (short && hint && (!sameFile || Math.abs(line - hint.line) > 12)) continue;
        const score = (sameFile ? Math.abs(line - hint!.line) : 200) + (offset < index.bodyStart ? 500 : 0);
        if (!best || score < best.score) best = { file, offset, score };
      }
    }
    if (best) return { file: best.file, offset: best.offset };
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Choosing what to edit

export interface Group {
  open: number;
  close: number;
  /** Command this group is an argument of ('' for a bare {…} group). */
  cmd: string;
}

const groupCache = new Map<string, Group[]>();

/** All brace groups of a source, with the command each belongs to. */
export function scanGroups(src: string): Group[] {
  const hit = groupCache.get(src);
  if (hit) return hit;
  const groups: Group[] = [];
  const stack: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '%') {
      const nl = src.indexOf('\n', i);
      if (nl < 0) break;
      i = nl;
      continue;
    }
    if (c === '{') stack.push(i);
    else if (c === '}' && stack.length) groups.push({ open: stack.pop()!, close: i, cmd: '' });
  }
  groups.sort((a, b) => a.open - b.open);
  const byClose = new Map(groups.map((g) => [g.close, g]));
  for (const g of groups) g.cmd = commandBefore(src, g.open, byClose);
  if (groupCache.size > 24) groupCache.clear();
  groupCache.set(src, groups);
  return groups;
}

function commandBefore(src: string, open: number, byClose: Map<number, Group>): string {
  let k = open - 1;
  for (let guard = 0; guard < 40 && k >= 0; guard++) {
    while (k >= 0 && (src[k] === ' ' || src[k] === '\t' || (src[k] === '\n' && src[k - 1] !== '\n'))) k--;
    if (k < 0) return '';
    if (src[k] === '}') {
      const prev = byClose.get(k);
      return prev ? prev.cmd : '';
    }
    if (src[k] === ']') {
      // Walk back to the matching '['.
      let depth = 0;
      let j = k;
      for (; j >= 0; j--) {
        if (src[j] === ']') depth++;
        else if (src[j] === '[' && --depth === 0) break;
      }
      k = j - 1;
      continue;
    }
    if (src[k] === '*') k--;
    let j = k;
    while (j >= 0 && /[A-Za-z@]/.test(src[j])) j--;
    if (j < k && src[j] === '\\' && src[j - 1] !== '\\') return src.slice(j + 1, k + 1);
    return '';
  }
  return '';
}

export interface Unit {
  file: string;
  /** Source range of the editable text. */
  start: number;
  end: number;
}

/**
 * The piece of source to edit for a hit at `offset`: the innermost macro argument around it
 * (formatting like \textbf is looked through), narrowed to the stretch between structural
 * markers inside that argument.
 */
export function pickUnit(src: string, file: string, offset: number): Unit | undefined {
  const groups = scanGroups(src);
  const ancestors = groups.filter((g) => g.open < offset && offset < g.close).sort((a, b) => b.open - a.open);
  const container = ancestors.find((g) => g.cmd && !isWrapper(g.cmd) && g.cmd !== 'begin');
  const cStart = container ? container.open + 1 : 0;
  const cEnd = container ? container.close : src.length;
  // Step outside formatting groups between the container and the hit, so they stay whole.
  const wrappers = ancestors.filter((g) => g.open >= cStart && g.close < cEnd);
  const outer = wrappers.length ? wrappers[wrappers.length - 1] : undefined;
  const from = outer ? outer.open : offset;
  const to = outer ? outer.close + 1 : offset;

  const tokens = topTokens(src, cStart, cEnd);
  let left = cStart;
  let right = cEnd;
  for (const t of tokens) {
    if (!t.boundary) continue;
    if (t.b <= from) left = Math.max(left, t.b);
    else if (t.a >= to) {
      right = Math.min(right, t.a);
      break;
    } else if (t.a < from && t.b > from) {
      // The hit sits in a group swallowed by a structural command (e.g. "\cvline{…}{text}" of unknown
      // arity): edit just that group.
      left = from;
      right = to > from ? to : t.b;
      break;
    }
  }
  // Trim surrounding whitespace.
  while (left < right && /\s/.test(src[left])) left++;
  while (right > left && /\s/.test(src[right - 1])) right--;
  if (right <= left) return undefined;
  return { file, start: left, end: right };
}

interface Token {
  a: number;
  b: number;
  boundary: boolean;
}

/** Top-level tokens of src[s, e): groups are atomic; marks which tokens split text into units. */
export function topTokens(src: string, s: number, e: number): Token[] {
  const out: Token[] = [];
  const arities = macroArities(src);
  let i = s;
  let lineStart = true;
  while (i < e) {
    const c = src[i];
    if (c === '%') {
      const nl = src.indexOf('\n', i);
      const end = nl < 0 || nl >= e ? e : nl + 1;
      out.push({ a: i, b: end, boundary: lineStart });
      i = end;
      lineStart = true;
      continue;
    }
    if (c === '\n') {
      let j = i;
      let nl = 0;
      while (j < e && /\s/.test(src[j])) {
        if (src[j] === '\n') nl++;
        j++;
      }
      out.push({ a: i, b: j, boundary: nl >= 2 });
      i = j;
      lineStart = true;
      continue;
    }
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    const atLineStart = lineStart;
    lineStart = false;
    if (c === '{') {
      const close = matchBrace(src, i, e);
      const end = close < 0 ? e : close + 1;
      out.push({ a: i, b: end, boundary: false });
      i = end;
      continue;
    }
    if (c === '&') {
      out.push({ a: i, b: i + 1, boundary: true });
      i++;
      continue;
    }
    if (c === '$') {
      let j = i + 1;
      while (j < e && src[j] !== '$') j += src[j] === '\\' ? 2 : 1;
      if (src[j + 1] === '$') j++;
      out.push({ a: i, b: Math.min(e, j + 1), boundary: false });
      i = Math.min(e, j + 1);
      continue;
    }
    if (c === '\\') {
      const n = src[i + 1];
      if (n === '\\') {
        let j = i + 2;
        if (src[j] === '*') j++;
        const k = skipControlSpace(src, j, e);
        if (src[k] === '[') {
          const close = matchBracket(src, k, e);
          if (close > 0) j = close + 1;
        }
        out.push({ a: i, b: j, boundary: true });
        i = j;
        continue;
      }
      if (n && /[A-Za-z@]/.test(n)) {
        let j = i + 1;
        while (j < e && /[A-Za-z@]/.test(src[j])) j++;
        const name = src.slice(i + 1, j);
        if (src[j] === '*') j++;
        if (isInlineCommand(name) && name !== 'par') {
          out.push({ a: i, b: j, boundary: false });
          i = j;
          continue;
        }
        // A structural command swallows its arguments: \rcSection{…}, \vspace{…}, \begin{tabular}{…}.
        let end = j;
        if (name === 'begin' || name === 'end') {
          const k = skipControlSpace(src, j, e);
          if (src[k] === '{') {
            const close = matchBrace(src, k, e);
            if (close > 0) {
              end = close + 1;
              if (name === 'begin') end = skipArgs(src, end, envArgCount(src.slice(k + 1, close).trim()), e);
            }
          }
        } else if (NO_ARGS.has(name)) {
          end = skipArgs(src, j, 0, e);
        } else {
          const n = hiddenArgCount(name) ?? arities.get(name);
          end = n === undefined ? skipSameLineArgs(src, j, e) : skipArgs(src, j, n, e);
          // An unknown command without arguments in the middle of a line (\footnotemark, \xspace) is inline.
          if (end === j && n === undefined && !atLineStart) {
            out.push({ a: i, b: j, boundary: false });
            i = j;
            continue;
          }
        }
        out.push({ a: i, b: end, boundary: true });
        i = end;
        continue;
      }
      out.push({ a: i, b: Math.min(e, i + 2), boundary: false });
      i += 2;
      continue;
    }
    out.push({ a: i, b: i + 1, boundary: false });
    i++;
  }
  return out;
}

/** Structural commands without arguments (only an optional [..] is skipped). */
const NO_ARGS = new Set([
  'item', 'par', 'newline', 'linebreak', 'pagebreak', 'newpage', 'clearpage', 'hline', 'toprule', 'midrule', 'bottomrule',
  'medskip', 'bigskip', 'smallskip', 'maketitle', 'tableofcontents', 'makecvtitle', 'makecvheader', 'cvitems', 'vfill',
]);

/** Arguments of a macro with unknown arity: brace/bracket groups that follow on the same line. */
function skipSameLineArgs(src: string, i: number, e: number): number {
  let k = i;
  for (;;) {
    let j = k;
    while (j < e && (src[j] === ' ' || src[j] === '\t')) j++;
    if (src[j] === '{') {
      const close = matchBrace(src, j, e);
      if (close < 0) return k;
      k = close + 1;
    } else if (src[j] === '[') {
      const close = matchBracket(src, j, e);
      if (close < 0) return k;
      k = close + 1;
    } else return k;
  }
}

const arityCache = new Map<string, Map<string, number>>();

/** Arity of macros defined in the source with \newcommand / \renewcommand / \def. */
function macroArities(src: string): Map<string, number> {
  const hit = arityCache.get(src);
  if (hit) return hit;
  const out = new Map<string, number>();
  const re = /\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z@]+)\}?\s*(?:\[(\d)\])?/g;
  for (let m = re.exec(src); m; m = re.exec(src)) out.set(m[1], Number(m[2] ?? 0));
  const def = /\\def\\([A-Za-z@]+)((?:#\d)*)\s*\{/g;
  for (let m = def.exec(src); m; m = def.exec(src)) out.set(m[1], m[2].length / 2);
  if (arityCache.size > 24) arityCache.clear();
  arityCache.set(src, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The editor cursor's line, in the PDF

/** Letters and digits that source line `line` (1-based) prints, for matching it against PDF text. */
export function sourceLineKey(src: string, line: number): string {
  const rows = src.split('\n');
  if (line < 1 || line > rows.length) return '';
  let a = 0;
  for (let n = 0; n < line - 1; n++) a += rows[n].length + 1;
  return alnum(project(src, a, a + rows[line - 1].length).map((c) => c.ch).join(''));
}

/**
 * Trim SyncTeX's boxes for a source line to the words that line prints.
 *
 * SyncTeX only records the spaces between words, and their line numbers are off at the edges: the
 * first space of each printed line carries the paragraph's last line, and a space where two source
 * lines meet can carry the next one. So a box can start a word late (missing the first word of a
 * printed line) or a word early (taking the previous line's last word). Each box is matched against
 * the letters of its PDF line and narrowed to the run that comes from `key` (see sourceLineKey).
 * Boxes without a confident match are left as they are.
 */
export function fitToSourceText<R extends Rect>(rects: R[], items: PdfTextItem[], key: string): R[] {
  if (!rects.length || key.length < 2 || !items.length) return rects;
  const lines = groupLines(items);
  return rects.map((r) => {
    const mid = r.y + r.h / 2;
    const line = lines.find((l) => mid >= l.y - 1 && mid <= l.y + l.h + 1 && r.x < l.x + l.w + 4 && r.x + r.w > l.x - 4);
    if (!line) return r;
    const { key: k, at } = lineKey(line);
    if (!k) return r;
    // Where SyncTeX put it, in letters of the line, with a word or two of slack each way.
    const h0 = keyIndexAt(line, at, r.x) - 8;
    const h1 = keyIndexAt(line, at, r.x + r.w) + 8;
    // The longest run of the line's letters that also appears in the source line, near that.
    let best = { a: 0, b: 0 };
    let prev = new Array<number>(key.length + 1).fill(0);
    for (let i = 1; i <= k.length; i++) {
      const cur = new Array<number>(key.length + 1).fill(0);
      for (let j = 1; j <= key.length; j++) {
        if (k[i - 1] !== key[j - 1]) continue;
        const len = (cur[j] = prev[j - 1] + 1);
        const a = i - len;
        if (i < h0 || a > h1) continue;
        if (len > best.b - best.a) best = { a, b: i };
      }
      prev = cur;
    }
    if (best.b - best.a < Math.min(3, key.length)) return r;
    // A number at the very start of the line that the source doesn't spell out (a section or item number).
    const a = best.a > 0 && best.a <= 4 && /^[0-9]+$/.test(k.slice(0, best.a)) ? 0 : best.a;
    const left = charEdge(line, at[a], 0);
    const right = charEdge(line, at[best.b - 1], 1);
    return { ...r, x: left, w: Math.max(right - left, 4) };
  });
}

/** Left (side 0) or right (side 1) edge of a character, assuming even spacing within its item. */
function charEdge(line: PdfLine, p: { item: number; char: number }, side: 0 | 1): number {
  const it = line.items[p.item];
  return it.x + (it.w * (p.char + side)) / Math.max(1, it.str.length);
}
