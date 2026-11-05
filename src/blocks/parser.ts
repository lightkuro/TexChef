/**
 * Block markers live in LaTeX comments, so the compiler never sees them:
 *
 *   %% @block exp-acme tags=backend,lead title="Acme Corp"
 *   ...latex...
 *   %% @end
 *
 * Blocks may nest. IDs must be unique within a project.
 */

export interface Block {
  id: string;
  tags: string[];
  title?: string;
  /** 0-based line index of the `@block` marker. */
  startLine: number;
  /** 0-based line index of the `@end` marker. */
  endLine: number;
  depth: number;
  parentId: string | null;
  children: Block[];
  /** Human label derived from `title=` or the first content line. */
  label: string;
}

export interface BlockIssue {
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface ParsedBlocks {
  roots: Block[];
  /** All blocks in document order. */
  all: Block[];
  byId: Map<string, Block>;
  issues: BlockIssue[];
}

export const BLOCK_START_RE = /^\s*%+\s*@block\s+([^\s]+)(.*)$/;
export const BLOCK_END_RE = /^\s*%+\s*@end(?:block)?\b/;
const ATTR_RE = /(\w+)\s*=\s*("([^"]*)"|[^\s]+)/g;

export function splitLines(text: string): string[] {
  return text.split('\n');
}

function parseAttrs(rest: string): { tags: string[]; title?: string } {
  const out: { tags: string[]; title?: string } = { tags: [] };
  for (const m of rest.matchAll(ATTR_RE)) {
    const key = m[1].toLowerCase();
    const value = m[3] ?? m[2];
    if (key === 'tags' || key === 'tag') {
      out.tags = value
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    } else if (key === 'title') {
      out.title = value;
    }
  }
  return out;
}

export function parseBlocks(text: string): ParsedBlocks {
  const lines = splitLines(text);
  const roots: Block[] = [];
  const all: Block[] = [];
  const byId = new Map<string, Block>();
  const issues: BlockIssue[] = [];
  const stack: Block[] = [];

  lines.forEach((line, i) => {
    const start = BLOCK_START_RE.exec(line);
    if (start) {
      const { tags, title } = parseAttrs(start[2] ?? '');
      const parent = stack[stack.length - 1] ?? null;
      const block: Block = {
        id: start[1],
        tags,
        title,
        startLine: i,
        endLine: -1,
        depth: stack.length,
        parentId: parent?.id ?? null,
        children: [],
        label: title ?? '',
      };
      if (byId.has(block.id)) {
        issues.push({ line: i, severity: 'error', message: `Duplicate block id “${block.id}”` });
      } else {
        byId.set(block.id, block);
      }
      (parent ? parent.children : roots).push(block);
      all.push(block);
      stack.push(block);
      return;
    }
    if (BLOCK_END_RE.test(line)) {
      const block = stack.pop();
      if (!block) {
        issues.push({ line: i, severity: 'error', message: '@end without a matching @block' });
        return;
      }
      block.endLine = i;
      if (!block.label) block.label = deriveLabel(lines, block.startLine + 1, i) || block.id;
    }
  });

  for (const open of stack) {
    issues.push({ line: open.startLine, severity: 'error', message: `Block “${open.id}” is never closed with %% @end` });
    open.endLine = lines.length - 1;
    if (!open.label) open.label = deriveLabel(lines, open.startLine + 1, lines.length) || open.id;
  }

  return { roots, all, byId, issues };
}

function deriveLabel(lines: string[], from: number, to: number): string {
  for (let i = from; i < to; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('%')) continue;
    // A bare macro whose arguments start on the next lines (\resumeSubheading⏎ {…}{…}).
    const strip = (l: string) => l.replace(/(?<!\\)%.*$/, '').trim();
    let text = strip(raw);
    if (/^\\[A-Za-z@]+\*?$/.test(text)) {
      for (let j = i + 1; j < Math.min(to, i + 5) && /^\s*\{/.test(lines[j]); j++) text += strip(lines[j]);
    }
    const label = latexToLabel(text);
    if (label) return label;
  }
  return '';
}

/** Turn a LaTeX source line into a short readable label. */
export function latexToLabel(line: string): string {
  const s = line.trim().replace(/(?<!\\)%.*$/, '');
  const macro = /^\\([A-Za-z@]+)\*?\s*(?:\[[^\]]*\])?\s*(\{.*)$/.exec(s);
  if (macro && macro[1] !== 'item') {
    const groups = topLevelGroups(macro[2]).map(cleanLatex).filter(Boolean);
    if (groups.length) return truncate(groups.join(' · '), 90);
  }
  return truncate(cleanLatex(s.replace(/^\\item\b\s*(\[[^\]]*\])?/, '')), 90);
}

export function topLevelGroups(s: string): string[] {
  const groups: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      if (depth > 0) cur += ch + s[i + 1];
      i++;
      continue;
    }
    if (ch === '{') {
      if (depth > 0) cur += ch;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        groups.push(cur);
        cur = '';
      } else if (depth > 0) cur += ch;
      else break;
    } else if (depth > 0) {
      cur += ch;
    } else if (!/\s/.test(ch) && ch !== '[' && ch !== ']') {
      // Text after the macro arguments ends the argument list.
      if (groups.length) break;
    }
  }
  if (depth > 0 && cur) groups.push(cur);
  return groups;
}

export function cleanLatex(s: string): string {
  return s
    .replace(/\\href\{[^}]*\}/g, '')
    .replace(/\\(?:textbf|textit|emph|underline|textsc|small|footnotesize|large|Large|bfseries|itshape)\b/g, '')
    .replace(/\\\\/g, ' ')
    .replace(/\\[A-Za-z@]+\*?(\[[^\]]*\])?/g, ' ')
    .replace(/\\([&%$#_{}])/g, '$1')
    .replace(/[{}$~]/g, ' ')
    .replace(/--/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Collect every tag used in a document, sorted. */
export function allTags(parsed: ParsedBlocks): string[] {
  const set = new Set<string>();
  parsed.all.forEach((b) => b.tags.forEach((t) => set.add(t)));
  return [...set].sort();
}

/** Parse blocks across several .tex files, tagging each with its file. */
export function parseProjectBlocks(texFiles: Record<string, string>): Map<string, { file: string; block: Block }> {
  const out = new Map<string, { file: string; block: Block }>();
  for (const [file, text] of Object.entries(texFiles)) {
    for (const block of parseBlocks(text).all) {
      if (!out.has(block.id)) out.set(block.id, { file, block });
    }
  }
  return out;
}
