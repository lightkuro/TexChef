import { create } from 'zustand';
import { toast } from 'sonner';
import { db, repo } from '@/app/repo';
import type { DocMeta } from '@/core/model';
import { compileFiles } from '@/features/compile/useCompile';

interface PreviewJob {
  running: boolean;
  done: number;
  total: number;
  current?: string;
  cancelled: boolean;
  cancel: () => void;
}

/** Progress of "make previews" (one job at a time). */
export const usePreviewJob = create<PreviewJob>((set) => ({
  running: false,
  done: 0,
  total: 0,
  cancelled: false,
  cancel: () => set({ cancelled: true }),
}));

/** When a document's text last changed (its draft, or its latest version). */
async function changedAt(doc: DocMeta): Promise<number> {
  const work = await db.work.get(doc.id);
  if (work) return work.updatedAt;
  return doc.head ? ((await db.commits.get(doc.head))?.createdAt ?? 0) : 0;
}

/** Documents whose preview is missing, or older than their text. */
export async function docsNeedingPreview(docs: DocMeta[]): Promise<DocMeta[]> {
  const out: DocMeta[] = [];
  for (const d of docs) {
    const p = await db.previews.get(d.id);
    if (!p || p.compiledAt < (await changedAt(d))) out.push(d);
  }
  return out;
}

/**
 * Compile documents one after another so each gets an up-to-date PDF and map thumbnail.
 * `all`: recompile every one, not only those that are missing or out of date.
 */
export async function makePreviews(docs: DocMeta[], opts: { all?: boolean; quiet?: boolean } = {}): Promise<{ made: number; failed: DocMeta[] }> {
  const job = usePreviewJob;
  if (job.getState().running) {
    toast.info('Already making previews.');
    return { made: 0, failed: [] };
  }
  const todo = opts.all ? docs : await docsNeedingPreview(docs);
  if (!todo.length) {
    if (!opts.quiet) toast.success('Every preview here is up to date.');
    return { made: 0, failed: [] };
  }
  job.setState({ running: true, done: 0, total: todo.length, cancelled: false });
  const failed: DocMeta[] = [];
  let made = 0;
  try {
    for (const d of todo) {
      if (job.getState().cancelled) break;
      job.setState({ current: d.name });
      const files = (await repo.getWork(d.id)).files;
      const out = await compileFiles({ key: `preview:${d.id}`, files, mainFile: d.mainFile, engine: d.engine, savePreviewAs: d.id });
      if (out?.pdf && out.ok) made++;
      else if (!out?.pdf) failed.push(d);
      else made++; // compiled with warnings/errors but produced a PDF
      job.setState((s) => ({ done: s.done + 1 }));
    }
  } finally {
    const cancelled = job.getState().cancelled;
    job.setState({ running: false, current: undefined, cancelled: false });
    if (!opts.quiet) {
      const msg = `${cancelled ? 'Stopped. ' : ''}Made ${made} preview${made === 1 ? '' : 's'}`;
      if (failed.length) toast.warning(msg, { description: `${failed.map((d) => `“${d.name}”`).join(', ')} didn’t compile. Open ${failed.length === 1 ? 'it' : 'them'} to see the problems.` });
      else toast.success(msg);
    }
  }
  return { made, failed };
}
