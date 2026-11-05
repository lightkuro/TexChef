import { diff3Merge } from 'node-diff3';

export const MARK_OURS = '<<<<<<<';
export const MARK_SEP = '=======';
export const MARK_THEIRS = '>>>>>>>';

export interface TextMerge {
  text: string;
  conflicts: number;
}

/**
 * Line-based 3-way merge. Conflicts are written git-style so they can be edited in place:
 *   <<<<<<< ours-label / ======= / >>>>>>> theirs-label
 */
export function merge3(
  ours: string,
  base: string,
  theirs: string,
  labels: { ours: string; theirs: string } = { ours: 'this document', theirs: 'parent' },
): TextMerge {
  if (ours === theirs) return { text: ours, conflicts: 0 };
  if (base === theirs) return { text: ours, conflicts: 0 };
  if (base === ours) return { text: theirs, conflicts: 0 };
  const regions = diff3Merge(ours.split('\n'), base.split('\n'), theirs.split('\n'), { excludeFalseConflicts: true });
  const out: string[] = [];
  let conflicts = 0;
  for (const r of regions) {
    if (r.ok) out.push(...(r.ok as string[]));
    else if (r.conflict) {
      conflicts++;
      out.push(`${MARK_OURS} ${labels.ours}`, ...r.conflict.a, MARK_SEP, ...r.conflict.b, `${MARK_THEIRS} ${labels.theirs}`);
    }
  }
  return { text: out.join('\n'), conflicts };
}

export interface ConflictRegion {
  index: number;
  /** Line indexes of the three markers. */
  start: number;
  sep: number;
  end: number;
  ours: string[];
  theirs: string[];
}

export function findConflicts(text: string): ConflictRegion[] {
  const lines = text.split('\n');
  const out: ConflictRegion[] = [];
  let start = -1;
  let sep = -1;
  lines.forEach((l, i) => {
    if (l.startsWith(MARK_OURS)) {
      start = i;
      sep = -1;
    } else if (l.startsWith(MARK_SEP) && start >= 0 && l.trim() === MARK_SEP) {
      sep = i;
    } else if (l.startsWith(MARK_THEIRS) && start >= 0 && sep >= 0) {
      out.push({
        index: out.length,
        start,
        sep,
        end: i,
        ours: lines.slice(start + 1, sep),
        theirs: lines.slice(sep + 1, i),
      });
      start = -1;
      sep = -1;
    }
  });
  return out;
}

export type ConflictChoice = 'ours' | 'theirs' | 'both';

export function resolveConflict(text: string, index: number, choice: ConflictChoice): string {
  const region = findConflicts(text)[index];
  if (!region) return text;
  const lines = text.split('\n');
  const replacement =
    choice === 'ours' ? region.ours : choice === 'theirs' ? region.theirs : [...region.ours, ...region.theirs];
  return [...lines.slice(0, region.start), ...replacement, ...lines.slice(region.end + 1)].join('\n');
}

export function resolveAll(text: string, choice: ConflictChoice): string {
  let out = text;
  while (findConflicts(out).length) out = resolveConflict(out, 0, choice);
  return out;
}
