import { diffComm } from 'node-diff3';
import type { Commit } from '@/core/model';
import type { FileMap } from '@/core/repo';

/** Version numbers: saved versions count 1, 2, 3…; autosaves after version 3 are 3.1, 3.2…. Oldest first. */
export function versionNumbers(commits: Commit[]): Map<string, string> {
  const out = new Map<string, string>();
  let major = 0;
  let minor = 0;
  for (const c of [...commits].sort((a, b) => a.createdAt - b.createdAt)) {
    if (c.kind === 'auto') {
      minor++;
      out.set(c.id, `${major}.${minor}`);
    } else {
      major++;
      minor = 0;
      out.set(c.id, String(major));
    }
  }
  return out;
}

export interface EditStats {
  /** Lines added and removed in text files, compared with the version before. */
  added: number;
  removed: number;
  /** Files added, removed or changed (text or binary). */
  files: number;
}

const lines = (t: string) => (t ? t.split('\n') : []);

/** What changed from `before` (the previous version, or nothing) to `after`. */
export function editStats(before: FileMap | undefined, after: FileMap): EditStats {
  let added = 0;
  let removed = 0;
  let files = 0;
  const paths = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  for (const p of paths) {
    const a = before?.[p];
    const b = after[p];
    if (a && b && a.kind === 'text' && b.kind === 'text') {
      if (a.text === b.text) continue;
      files++;
      for (const part of diffComm(lines(a.text), lines(b.text))) {
        if ('buffer1' in part) {
          removed += part.buffer1?.length ?? 0;
          added += part.buffer2?.length ?? 0;
        }
      }
    } else if (a && b && a.kind === 'binary' && b.kind === 'binary') {
      if (a.hash !== b.hash) files++;
    } else {
      files++;
      if (a?.kind === 'text') removed += lines(a.text).length;
      if (b?.kind === 'text') added += lines(b.text).length;
    }
  }
  return { added, removed, files };
}
