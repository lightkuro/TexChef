import { useState } from 'react';
import { ArchiveRestore } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Dialog, Spinner } from '@/components/ui';
import { restoreBackup, type RestorePlan } from './backup';

/** Confirm and run the restore of a TexChef backup. */
export function RestoreDialog({ plan, onClose }: { plan: RestorePlan; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const m = plan.manifest;
  const folders = new Set(m.docs.map((d) => d.folder).filter(Boolean)).size + m.emptyFolders.length;
  const run = async () => {
    setBusy(true);
    try {
      const r = await restoreBackup(plan);
      toast.success(`Restored ${r.added} document${r.added === 1 ? '' : 's'}${r.merged ? `; added history to ${r.merged} already here` : ''}`, {
        description: r.editedOutside.length
          ? `Edited outside TexChef since the backup: ${r.editedOutside.join(', ')}. Those edits are in the documents as unsaved changes.`
          : undefined,
        duration: 8000,
      });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title="Restore a TexChef backup"
      description={`Made ${new Date(m.createdAt).toLocaleString()}${m.scope ? ` from the folder “${m.scope}”` : ''}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={run} disabled={busy} data-testid="restore-backup">
            {busy ? <Spinner /> : <ArchiveRestore className="size-4" />} Restore
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm" data-testid="restore-summary">
        <p>
          <b>{m.docs.length}</b> document{m.docs.length === 1 ? '' : 's'}, <b>{plan.versions}</b> saved version{plan.versions === 1 ? '' : 's'}
          {folders ? (
            <>
              , <b>{folders}</b> folder{folders === 1 ? '' : 's'}
            </>
          ) : null}
          , with drafts, variant links, colors and previews.
        </p>
        {plan.existing.length > 0 && (
          <p className="text-muted">
            {plan.existing.length} of them {plan.existing.length === 1 ? 'is' : 'are'} already here ({plan.existing.map((d) => `“${d.name}”`).slice(0, 4).join(', ')}
            {plan.existing.length > 4 ? '…' : ''}). Those keep what they have now; the backup’s versions are added to their history.
          </p>
        )}
      </div>
    </Dialog>
  );
}
