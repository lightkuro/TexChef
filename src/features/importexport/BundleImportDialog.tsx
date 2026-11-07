import { useState } from 'react';
import { FileText, Package } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Checkbox, Dialog, Input, Spinner } from '@/components/ui';
import { createDocumentFromProject, type ImportPlan } from './io';

/** An upload that holds several documents (e.g. a Prism export): choose which to import. */
export function BundleImportDialog({ plan, onClose }: { plan: ImportPlan; onClose: () => void }) {
  const [picked, setPicked] = useState<boolean[]>(() => plan.projects.map(() => true));
  const [names, setNames] = useState<string[]>(() => plan.projects.map((p) => p.name));
  const [busy, setBusy] = useState<number | null>(null);
  const count = picked.filter(Boolean).length;

  const run = async () => {
    let done = 0;
    for (let i = 0; i < plan.projects.length; i++) {
      if (!picked[i]) continue;
      setBusy(i);
      try {
        await createDocumentFromProject({ ...plan.projects[i], name: names[i].trim() || plan.projects[i].name });
        done++;
      } catch (e) {
        toast.error(`${names[i]}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setBusy(null);
    toast.success(`Imported ${done} document${done === 1 ? '' : 's'}`, { description: 'Open one to compile it.' });
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && busy === null && onClose()}
      title={`${plan.projects.length} documents in this upload`}
      description="Each folder with its own main .tex file becomes a separate document, with its images and other files."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
          <Button variant="primary" onClick={run} disabled={busy !== null || count === 0} data-testid="bundle-import">
            {busy !== null ? <Spinner /> : <Package className="size-4" />} Import {count} document{count === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5" data-testid="bundle-list">
        {plan.projects.map((p, i) => {
          const n = Object.keys(p.files).length + Object.keys(p.binaries).length;
          return (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
              <Checkbox
                checked={picked[i]}
                onCheckedChange={(c) => setPicked(picked.map((v, j) => (j === i ? c : v)))}
                aria-label={`Import ${p.name}`}
              />
              <FileText className="size-4 shrink-0 text-muted" />
              <Input
                className="h-7 min-w-0 flex-1 text-sm"
                value={names[i]}
                onChange={(e) => setNames(names.map((v, j) => (j === i ? e.target.value : v)))}
                aria-label={`Name for ${p.name}`}
              />
              <span className="shrink-0 text-xs text-muted">
                {p.mainFile ?? 'no main file'} · {n} file{n === 1 ? '' : 's'}
              </span>
              {busy === i && <Spinner />}
            </div>
          );
        })}
      </div>
      {plan.skipped.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          Not imported ({plan.skipped.length}): files outside any document folder, such as {plan.skipped.slice(0, 3).join(', ')}
          {plan.skipped.length > 3 ? '…' : ''}.
        </p>
      )}
    </Dialog>
  );
}
