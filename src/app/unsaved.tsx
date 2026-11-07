import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';
import { create } from 'zustand';
import { db, repo } from '@/app/repo';
import { Button, Dialog } from '@/components/ui';
import { syncNow, useSync } from '@/features/sync/controller';

/**
 * Things that would be lost by leaving: an edit box with typed text, updates chosen but not
 * applied, keystrokes not yet stored. `when`: closing the tab, moving to another page, or both.
 */
export interface UnsavedReason {
  message: string;
  when: 'close' | 'navigate' | 'both';
}

export const useUnsaved = create<{ reasons: Record<string, UnsavedReason>; set: (key: string, r: UnsavedReason | null) => void }>((set) => ({
  reasons: {},
  set: (key, r) =>
    set((s) => {
      const reasons = { ...s.reasons };
      if (r) reasons[key] = r;
      else delete reasons[key];
      return { reasons };
    }),
}));

export const setUnsaved = (key: string, r: UnsavedReason | null) => useUnsaved.getState().set(key, r);

/** Register an unsaved-work reason while `active`, cleared when the component goes away. */
export function useUnsavedReason(key: string, active: boolean, message: string, when: UnsavedReason['when'] = 'both') {
  useEffect(() => {
    setUnsaved(key, active ? { message, when } : null);
    return () => setUnsaved(key, null);
  }, [key, active, message, when]);
}

/** With Google Drive connected: whether something hasn't reached Drive yet (drafts or versions). */
const usePendingUpload = create<{ pending: boolean }>(() => ({ pending: false }));

async function checkPendingUpload() {
  const connected = !['local', 'needs-signin'].includes(useSync.getState().state);
  if (!connected) return usePendingUpload.setState({ pending: false });
  const versions = await db.commits.where('synced').equals(0).count();
  const drafts = await db.work.filter((w) => w.dirty).count();
  usePendingUpload.setState({ pending: versions + drafts > 0 });
}

/**
 * Warns before losing work: the browser's "Leave site?" prompt when closing the tab, and a dialog
 * when moving to another page inside texChef.
 */
export function LeaveGuard() {
  const reasons = useUnsaved((s) => s.reasons);
  const navigateReasons = Object.values(reasons).filter((r) => r.when !== 'close');
  // Read the reasons at the moment of navigating (a page may clear its own reason right before it moves on).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname && Object.values(useUnsaved.getState().reasons).some((r) => r.when !== 'close'),
  );
  const latest = useRef(reasons);
  latest.current = reasons;

  useEffect(() => {
    void checkPendingUpload();
    const t = setInterval(() => void checkPendingUpload(), 5000);
    const offCommit = repo.on('commit', () => void checkPendingUpload());
    const offIndex = repo.on('index', () => void checkPendingUpload());
    const offSync = useSync.subscribe(() => void checkPendingUpload());
    const onUnload = (e: BeforeUnloadEvent) => {
      const local = Object.values(latest.current).some((r) => r.when !== 'navigate');
      const drive = usePendingUpload.getState().pending;
      if (!local && !drive) return;
      // Browsers show their own "Leave site? Changes may not be saved" text.
      e.preventDefault();
      e.returnValue = '';
      // If the person stays, get everything to Drive right away.
      if (drive) void repo.autosaveAll().then(() => syncNow());
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(t);
      offCommit();
      offIndex();
      offSync();
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  return (
    <Dialog
      open={blocker.state === 'blocked'}
      onOpenChange={(o) => !o && blocker.state === 'blocked' && blocker.reset()}
      title="Leave without saving?"
      footer={
        <>
          <Button variant="ghost" onClick={() => blocker.state === 'blocked' && blocker.reset()} data-testid="leave-stay">
            Stay
          </Button>
          <Button variant="danger" onClick={() => blocker.state === 'blocked' && blocker.proceed()} data-testid="leave-anyway">
            Leave without saving
          </Button>
        </>
      }
    >
      <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="leave-reasons">
        {navigateReasons.map((r) => (
          <li key={r.message}>{r.message}</li>
        ))}
      </ul>
    </Dialog>
  );
}
