import { create } from 'zustand';
import { Button, Dialog } from '@/components/ui';

interface ConfirmRequest {
  title: string;
  body?: React.ReactNode;
  ok?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const useConfirm = create<{ req: ConfirmRequest | null }>(() => ({ req: null }));

/** Ask "are you sure?" from anywhere; resolves true when confirmed. Shown by <ConfirmHost />. */
export function confirmAction(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  useConfirm.getState().req?.resolve(false);
  return new Promise((resolve) => useConfirm.setState({ req: { ...opts, resolve } }));
}

export function ConfirmHost() {
  const req = useConfirm((s) => s.req);
  const done = (ok: boolean) => {
    req?.resolve(ok);
    useConfirm.setState({ req: null });
  };
  return (
    <Dialog
      open={!!req}
      onOpenChange={(o) => !o && done(false)}
      title={req?.title ?? ''}
      footer={
        <>
          <Button variant="ghost" onClick={() => done(false)} data-testid="confirm-cancel">
            Cancel
          </Button>
          <Button variant={req?.danger ? 'danger' : 'primary'} onClick={() => done(true)} autoFocus data-testid="confirm-ok">
            {req?.ok ?? 'OK'}
          </Button>
        </>
      }
    >
      {req?.body && <div className="space-y-2 text-sm">{req.body}</div>}
    </Dialog>
  );
}
