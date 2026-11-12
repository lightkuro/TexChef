import { useState } from 'react';
import { GitBranchPlus } from 'lucide-react';
import { Button, Dialog, Input } from '@/components/ui';

/** Name the variant that takes a side's unsaved edits. */
export function SaveAsVariantDialog({
  original,
  onClose,
  onSave,
  description,
  defaultName,
}: {
  original?: string;
  onClose: () => void;
  onSave: (name: string) => void;
  description?: string;
  defaultName?: string;
}) {
  const [name, setName] = useState(defaultName ?? (original ? `${original} (variant)` : ''));
  return (
    <Dialog
      open={!!original}
      onOpenChange={(o) => !o && onClose()}
      title="Save edits as a new variant"
      description={description ?? `Your unsaved edits go into a new variant of “${original}”, which goes back to its last saved version.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => onSave(name.trim())} data-testid="compare-variant-create">
            <GitBranchPlus className="size-4" /> Create variant
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <label className="text-sm font-medium" htmlFor="variant-name">
          Name
        </label>
        <Input id="variant-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full" data-testid="compare-variant-name" />
        <p className="mt-2 text-xs text-muted">It stays linked: Get updates brings in later changes to the original.</p>
      </form>
    </Dialog>
  );
}
