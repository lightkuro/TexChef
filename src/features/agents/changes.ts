import { diffComm } from 'node-diff3';

/** One place where the agent's text differs from the document: some lines replaced, added or removed. */
export interface TextChange {
  index: number;
  kind: 'changed' | 'added' | 'removed';
  removed: string[];
  added: string[];
  /** A line to show for it: the first new line that says something (or the first one removed). */
  preview: string;
}

export interface TextChanges {
  changes: TextChange[];
  /**
   * The text with the changes in `off` left out (those places read as in the document), and for each change the
   * line (1-based) where it sits in that text.
   */
  apply(off?: ReadonlySet<number>): { text: string; lines: number[] };
}

const firstTelling = (lines: string[]) => (lines.find((l) => l.trim()) ?? lines[0] ?? '').trim();

/** The agent's edits to one file, change by change, so each can be kept or left out. */
export function textChanges(current: string, proposed: string): TextChanges {
  const parts = diffComm(current.split('\n'), proposed.split('\n'));
  const changes: TextChange[] = [];
  for (const part of parts) {
    if (!('buffer1' in part)) continue;
    const removed = part.buffer1 ?? [];
    const added = part.buffer2 ?? [];
    const kind = removed.length && added.length ? 'changed' : added.length ? 'added' : 'removed';
    changes.push({ index: changes.length, kind, removed, added, preview: firstTelling(added.length ? added : removed) });
  }
  return {
    changes,
    apply(off = new Set()) {
      const out: string[] = [];
      const lines: number[] = [];
      let i = 0;
      for (const part of parts) {
        if (!('buffer1' in part)) {
          out.push(...(part.common ?? []));
          continue;
        }
        lines.push(out.length + 1);
        out.push(...((off.has(i) ? part.buffer1 : part.buffer2) ?? []));
        i++;
      }
      return { text: out.join('\n'), lines };
    },
  };
}
