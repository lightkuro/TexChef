/**
 * Writing plain-text edits back into LaTeX.
 *
 * The user edits the plain text of a unit (see latexText.project). We diff old and new text word by
 * word and replace only the characters that changed, escaping what was typed, so formatting
 * commands, links and macros around unchanged words stay exactly as they were.
 */
import { diffPatch } from 'node-diff3';
import { bracesBalanced, displayText, escapeLatex, project, type DChar } from './latexText';

export interface SourceChange {
  from: number;
  to: number;
  insert: string;
}

const TOKEN_RE = /[\p{L}\p{N}]+|\s+|[^\p{L}\p{N}\s]/gu;

function tokenize(s: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  for (const m of s.matchAll(TOKEN_RE)) out.push({ text: m[0], start: m.index!, end: m.index! + m[0].length });
  return out;
}

/** Where each UTF-16 position of the display string comes from (index into chars). */
function charIndex(chars: DChar[]): number[] {
  const out: number[] = [];
  chars.forEach((c, i) => {
    for (let k = 0; k < c.ch.length; k++) out.push(i);
  });
  return out;
}

/**
 * Source changes that turn the unit's plain text into `next`.
 * `chars` is project(src, unit.start, unit.end).
 */
export function plainEditChanges(src: string, unitStart: number, chars: DChar[], next: string): SourceChange[] {
  const prev = displayText(chars);
  if (prev === next) return [];
  const idx = charIndex(chars);
  const a = tokenize(prev);
  const b = tokenize(next);
  const patches = diffPatch(
    a.map((t) => t.text),
    b.map((t) => t.text),
  );
  const changes: SourceChange[] = [];

  /** Runs of the display range [s, e) that are contiguous in the source (structural spaces skipped). */
  const runsOf = (s: number, e: number): [number, number][] => {
    const runs: [number, number][] = [];
    for (let d = idx[s]; d <= idx[e - 1]; d++) {
      const c = chars[d];
      if (c.kind === 'virtual') continue;
      const last = runs[runs.length - 1];
      if (last && chars[last[1]].b === c.a) last[1] = d;
      else runs.push([d, d]);
    }
    return runs;
  };

  /** Replace display range [s, e) (s === e: insert at s) with typed text. */
  const emit = (s: number, e: number, insertText: string) => {
    if (e > s) {
      const runs = runsOf(s, e);
      if (!runs.length) {
        // Only structural spaces were "deleted": insert the new text before the structure.
        if (insertText) changes.push(insertion(src, chars[idx[s]].a, insertText, false));
        return;
      }
      const raw = runs.every(([x, y]) => chars.slice(x, y + 1).every((c) => c.kind === 'raw'));
      runs.forEach(([x, y], i) => {
        const from = chars[x].a;
        const to = chars[y].b;
        changes.push(i === 0 ? { from, to, insert: guardControlWord(src, from, raw ? insertText : escapeLatex(insertText)) } : { from, to, insert: '' });
      });
    } else if (insertText) {
      const d = s < prev.length ? idx[s] : chars.length;
      const before = chars[d - 1];
      const after = chars[d];
      const pos = before ? before.b : after ? after.a : unitStart;
      const raw = !!before && !!after && before.kind === 'raw' && after.kind === 'raw';
      changes.push(insertion(src, pos, insertText, raw));
    }
  };

  for (const p of patches) {
    const insertText = (p.buffer2.chunk as string[]).join('');
    const off = p.buffer1.offset as number;
    const len = p.buffer1.length as number;
    if (len === 0) {
      emit(off < a.length ? a[off].start : prev.length, off < a.length ? a[off].start : prev.length, insertText);
      continue;
    }
    const s = a[off].start;
    const e = a[off + len - 1].end;
    if (runsOf(s, e).length <= 1 || !insertText) {
      emit(s, e, insertText);
      continue;
    }
    // The replaced words cross hidden markup (\textbf{…}, \\): refine character by character so
    // unchanged characters, and the markup between them, stay put.
    const sub = diffPatch([...prev.slice(s, e)], [...insertText]);
    for (const q of sub) {
      const qs = s + (q.buffer1.offset as number);
      emit(qs, qs + (q.buffer1.length as number), (q.buffer2.chunk as string[]).join(''));
    }
  }
  return changes;
}

function insertion(src: string, pos: number, text: string, raw: boolean): SourceChange {
  return { from: pos, to: pos, insert: guardControlWord(src, pos, raw ? text : escapeLatex(text)) };
}

/** `\ldots` + "abc" would read as `\ldotsabc`: put `{}` between a control word and letters. */
function guardControlWord(src: string, pos: number, insert: string): string {
  if (!/^[A-Za-z@]/.test(insert)) return insert;
  return /\\[A-Za-z@]+$/.test(src.slice(Math.max(0, pos - 40), pos)) ? `{}${insert}` : insert;
}

/** Apply non-overlapping changes to a string. */
export function applyChanges(src: string, changes: SourceChange[]): string {
  let out = src;
  for (const c of [...changes].sort((x, y) => y.from - x.from || y.to - x.to)) out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  return out;
}

const EMPTY_WRAPPER = /\\(?:textbf|textit|emph|underline|textsc|texttt|textsl|textsf|textrm)\{\s*\}/g;

export interface EditResult {
  /** The whole new file. */
  text: string;
  /** The single change that turns the old file into the new one (for undo-friendly editor updates). */
  change: SourceChange;
  /** New source text of the unit. */
  unitText: string;
}

/** Replace a unit's plain text. Returns null if nothing changed. */
export function applyPlainEdit(src: string, start: number, end: number, next: string): EditResult | null {
  const chars = project(src, start, end);
  const changes = plainEditChanges(src, start, chars, next.replace(/\s*\n\s*/g, (m) => (/\n\s*\n/.test(m) ? '\n\n' : ' ')));
  if (!changes.length) return null;
  const oldUnit = src.slice(start, end);
  const shifted = changes.map((c) => ({ ...c, from: c.from - start, to: c.to - start }));
  let unitText = applyChanges(oldUnit, shifted);
  const before = oldUnit.match(EMPTY_WRAPPER)?.length ?? 0;
  if ((unitText.match(EMPTY_WRAPPER)?.length ?? 0) > before) unitText = unitText.replace(EMPTY_WRAPPER, '');
  if (unitText === oldUnit) return null;
  return { text: src.slice(0, start) + unitText + src.slice(end), change: { from: start, to: end, insert: unitText }, unitText };
}

/** Replace a unit's LaTeX source directly. Throws if braces would end up unbalanced. */
export function applyRawEdit(src: string, start: number, end: number, next: string): EditResult | null {
  const oldUnit = src.slice(start, end);
  if (next === oldUnit) return null;
  if (bracesBalanced(oldUnit) && !bracesBalanced(next)) throw new Error('The { and } braces don’t match up. Check them before saving.');
  return { text: src.slice(0, start) + next + src.slice(end), change: { from: start, to: end, insert: next }, unitText: next };
}

/** Plain text for the edit box, and where the clicked character is in it. */
export function unitPlainText(src: string, start: number, end: number, clickOffset?: number): { text: string; caret: number; hasLinks: boolean; hasRaw: boolean } {
  const chars = project(src, start, end);
  const text = displayText(chars);
  let caret = text.length;
  if (clickOffset !== undefined) {
    let pos = 0;
    for (const c of chars) {
      if (c.a <= clickOffset && clickOffset < Math.max(c.b, c.a + 1)) {
        // End of the clicked word.
        const rest = text.slice(pos);
        const m = /^[\p{L}\p{N}]*/u.exec(rest);
        caret = pos + (m ? m[0].length : 0);
        break;
      }
      pos += c.ch.length;
    }
  }
  const unit = src.slice(start, end);
  return { text, caret, hasLinks: /\\href\s*\{/.test(unit), hasRaw: chars.some((c) => c.kind === 'raw') };
}
