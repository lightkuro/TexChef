import { latexToLabel, parseBlocks, splitLines, topLevelGroups, cleanLatex } from './parser';

/**
 * "Mark up my resume": insert `%% @block` / `%% @end` markers around sections, entries and
 * bullet items using heuristics for common resume templates. Regions already inside a block
 * are left untouched.
 */

const SECTION_RE = /^\s*\\(section|cvsection|rcSection)\*?\s*(\[[^\]]*\])?\s*\{/;
const ENTRY_RE =
  /^\s*\\(resumeSubheading|resumeSubSubheading|resumeProjectHeading|resumeEntry|cventry|cvitem|cvhonor|cvlistitem|entry|subsection|rcEntry|rcProject)\*?\b/;
const ITEM_RE = /^\s*\\(item|resumeItem|rcItem)\b/;
const LIST_OPEN_RE = /\\begin\{(itemize|enumerate|description|cventries|cvitems|cvhonors)\}|\\\w+ListStart\b/g;
const LIST_CLOSE_RE = /\\end\{(itemize|enumerate|description|cventries|cvitems|cvhonors)\}|\\\w+ListEnd\b/g;

interface Mark {
  start: number;
  end: number;
  id: string;
  kind: 'section' | 'entry' | 'item';
}

export interface AutomarkResult {
  text: string;
  added: number;
}

export function slugify(s: string, max = 32): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/g, '') || 'block'
  );
}

function braceDelta(line: string): number {
  let d = 0;
  const s = line.replace(/\\[{}]/g, '').replace(/(?<!\\)%.*$/, '');
  for (const ch of s) {
    if (ch === '{') d++;
    else if (ch === '}') d--;
  }
  return d;
}

function listDelta(line: string): number {
  const s = line.replace(/(?<!\\)%.*$/, '');
  return (s.match(LIST_OPEN_RE)?.length ?? 0) - (s.match(LIST_CLOSE_RE)?.length ?? 0);
}

export function automark(text: string): AutomarkResult {
  const lines = splitLines(text);
  const parsed = parseBlocks(text);
  const covered = new Uint8Array(lines.length);
  for (const b of parsed.all) for (let i = b.startLine; i <= b.endLine; i++) covered[i] = 1;

  const begin = Math.max(0, lines.findIndex((l) => /\\begin\{document\}/.test(l)) + 1);
  let endDoc = lines.findIndex((l) => /\\end\{document\}/.test(l));
  if (endDoc < 0) endDoc = lines.length;

  const used = new Set(parsed.all.map((b) => b.id));
  const uniqueId = (base: string) => {
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };

  // Running list depth before each line.
  const depthBefore: number[] = [];
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    depthBefore[i] = depth;
    depth += listDelta(lines[i]);
  }

  const isBlank = (i: number) => !lines[i].trim() || /^\s*%(?![%\s]*@)/.test(lines[i]);
  const trimBack = (start: number, end: number) => {
    while (end > start && isBlank(end)) end--;
    return end;
  };

  const marks: Mark[] = [];
  const sectionStarts: number[] = [];
  for (let i = begin; i < endDoc; i++) if (!covered[i] && SECTION_RE.test(lines[i])) sectionStarts.push(i);

  for (let s = 0; s < sectionStarts.length; s++) {
    const start = sectionStarts[s];
    let end = (sectionStarts[s + 1] ?? endDoc) - 1;
    for (let j = start + 1; j <= end; j++) {
      if (covered[j]) {
        end = j - 1;
        break;
      }
    }
    end = trimBack(start, end);
    const title = cleanLatex(topLevelGroups(lines[start].replace(SECTION_RE, '{'))[0] ?? '');
    const sectionId = uniqueId(`sec-${slugify(title || 'section')}`);
    marks.push({ start, end, id: sectionId, kind: 'section' });
    markEntries(start + 1, end, sectionId);
  }

  function markEntries(from: number, to: number, sectionId: string) {
    const entries: number[] = [];
    for (let i = from; i <= to; i++) if (!covered[i] && ENTRY_RE.test(lines[i])) entries.push(i);
    if (entries.length === 0) {
      markItems(from, to, sectionId);
      return;
    }
    // Items before the first entry belong directly to the section.
    markItems(from, entries[0] - 1, sectionId);
    entries.forEach((start, k) => {
      const d = depthBefore[start];
      let end = to;
      const nextEntry = entries[k + 1];
      for (let j = start + 1; j <= to; j++) {
        // Stop at the next entry, or at the line that closes the list containing this entry.
        if (j === nextEntry || depthBefore[j] + listDelta(lines[j]) < d) {
          end = j - 1;
          break;
        }
      }
      end = trimBack(start, end);
      const label = latexToLabel(lines[start]);
      const id = uniqueId(slugify(label.split(' · ')[0] || 'entry'));
      marks.push({ start, end, id, kind: 'entry' });
      markItems(start + 1, end, id);
    });
  }

  function markItems(from: number, to: number, parentId: string) {
    let n = 1;
    for (let i = from; i <= to; i++) {
      if (covered[i] || !ITEM_RE.test(lines[i]) || ENTRY_RE.test(lines[i])) continue;
      let end = i;
      let bal = braceDelta(lines[i]);
      while (bal > 0 && end + 1 <= to && !ITEM_RE.test(lines[end + 1])) {
        end++;
        bal += braceDelta(lines[end]);
      }
      // `\item text` continuing over several plain lines.
      while (
        end + 1 <= to &&
        lines[end + 1].trim() &&
        !/^\s*\\/.test(lines[end + 1]) &&
        !/^\s*%/.test(lines[end + 1])
      ) {
        end++;
      }
      marks.push({ start: i, end, id: uniqueId(`${parentId}-${n++}`), kind: 'item' });
      i = end;
    }
  }

  if (marks.length === 0) return { text, added: 0 };

  const opens = new Map<number, Mark[]>();
  const closes = new Map<number, Mark[]>();
  for (const m of marks) {
    (opens.get(m.start) ?? opens.set(m.start, []).get(m.start)!).push(m);
    (closes.get(m.end) ?? closes.set(m.end, []).get(m.end)!).push(m);
  }
  const out: string[] = [];
  lines.forEach((line, i) => {
    const indent = /^\s*/.exec(line)![0];
    // Outermost first: larger span opens first.
    for (const m of (opens.get(i) ?? []).sort((a, b) => b.end - a.end)) out.push(`${indent}%% @block ${m.id}`);
    out.push(line);
    // Innermost first: smaller span closes first.
    for (const m of (closes.get(i) ?? []).sort((a, b) => b.start - a.start)) {
      const ind = /^\s*/.exec(lines[m.start])![0];
      out.push(`${ind}%% @end`);
    }
  });
  return { text: out.join('\n'), added: marks.length };
}
