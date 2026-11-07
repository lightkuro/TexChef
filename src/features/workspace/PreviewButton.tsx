import { Images, Square } from 'lucide-react';
import type { DocMeta } from '@/core/model';
import { usePreviews } from '@/app/repo';
import { Spinner, Tip } from '@/components/ui';
import { makePreviews, usePreviewJob } from './previews';

/** Compile the documents of the open folder that have no preview (or an old one). */
export function PreviewButton({ docs }: { docs: DocMeta[] }) {
  const previews = usePreviews();
  const job = usePreviewJob();
  const missing = docs.filter((d) => !previews?.get(d.id)).length;
  if (job.running) {
    return (
      <Tip content={job.current ? `Compiling “${job.current}”. Click to stop.` : 'Click to stop'}>
        <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-accent hover:bg-subtle" onClick={job.cancel} data-testid="previews-stop">
          <Spinner /> Previews {job.done}/{job.total}
          <Square className="size-3 fill-current" />
        </button>
      </Tip>
    );
  }
  return (
    <Tip content="Compile the documents here that have no preview or an out-of-date one, so the map shows their pages">
      <button
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted hover:bg-subtle hover:text-fg disabled:opacity-40"
        onClick={() => void makePreviews(docs)}
        disabled={!docs.length}
        data-testid="make-previews"
      >
        <Images className="size-3.5" /> Make previews{missing ? ` (${missing} missing)` : ''}
      </button>
    </Tip>
  );
}
