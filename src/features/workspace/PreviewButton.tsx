import { Square } from 'lucide-react';
import { Spinner, Tip } from '@/components/ui';
import { usePreviewJob } from './previews';

/** Progress of "Make previews" while it runs (start it from a right-click menu); click to stop. */
export function PreviewProgress() {
  const job = usePreviewJob();
  if (!job.running) return null;
  return (
    <Tip content={job.current ? `Compiling “${job.current}”. Click to stop.` : 'Click to stop'}>
      <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-accent hover:bg-subtle" onClick={job.cancel} data-testid="previews-stop">
        <Spinner /> Previews {job.done}/{job.total}
        <Square className="size-3 fill-current" />
      </button>
    </Tip>
  );
}
