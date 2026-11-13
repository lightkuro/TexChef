import { create } from 'zustand';
import { db } from '@/app/repo';
import { useEffect } from 'react';
import { usePrefs } from '@/app/prefs';
import { driveProvider, useSync } from '@/features/sync/controller';

/** The "AI updates" dialog (opened from its button on the home page and in the editor), and how many replies wait. */
export const useAgentsDialog = create<{ open: boolean; set: (open: boolean) => void; waiting: number }>((set) => ({ open: false, set: (open) => set({ open }), waiting: 0 }));

/** Replies in the Agents folder that TexChef can see and that haven't been reviewed. */
export async function waitingReplies(): Promise<{ id: string; name: string }[]> {
  const provider = driveProvider();
  if (!provider) return [];
  const handled = new Set(await handledReplies());
  const list = (await provider.listAgentReplies()).filter((r) => !handled.has(r.id));
  useAgentsDialog.setState({ waiting: list.length });
  return list;
}

/** Keeps the count on the AI updates button current: checked after each sync while the feature is on. */
export function useAgentReplyCount(): number {
  const enabled = usePrefs((s) => s.agentsEnabled);
  const lastSync = useSync((s) => s.lastSync);
  const state = useSync((s) => s.state);
  useEffect(() => {
    if (!enabled || state === 'local' || state === 'needs-signin') {
      useAgentsDialog.setState({ waiting: 0 });
      return;
    }
    void waitingReplies().catch(() => undefined);
  }, [enabled, lastSync, state]);
  return useAgentsDialog((s) => s.waiting);
}

/** Replies already reviewed (accepted or dismissed), by Drive file id. */
export async function handledReplies(): Promise<string[]> {
  return (await db.getMeta<string[]>('agents.handled')) ?? [];
}

/** Remember a reply as handled and, when it came from Drive, move it into Agents/Done. */
export async function markReplyHandled(fileId?: string) {
  if (!fileId) return;
  const done = await handledReplies();
  if (!done.includes(fileId)) await db.setMeta('agents.handled', [...done, fileId]);
  useAgentsDialog.setState((s) => ({ waiting: Math.max(0, s.waiting - 1) }));
  const provider = driveProvider();
  if (!provider) return;
  try {
    const { done: folder } = await provider.ensureAgentsFolder();
    await provider.moveTo(fileId, folder);
  } catch (e) {
    console.warn('Could not move the reply to Done', e);
  }
}

/** A reply pasted by hand waits in this tab's session storage until it's reviewed. */
export function stashPastedReply(text: string): string {
  const key = Math.random().toString(36).slice(2, 10);
  try {
    sessionStorage.setItem(`agent-paste-${key}`, text);
  } catch {
    /* storage unavailable: the review page says the reply is gone */
  }
  return key;
}

export function pastedReply(key: string): string | undefined {
  try {
    return sessionStorage.getItem(`agent-paste-${key}`) ?? undefined;
  } catch {
    return undefined;
  }
}

export function dropPastedReply(key: string) {
  try {
    sessionStorage.removeItem(`agent-paste-${key}`);
  } catch {
    /* ignore */
  }
}
