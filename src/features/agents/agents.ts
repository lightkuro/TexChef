import { create } from 'zustand';
import { db } from '@/app/repo';
import { driveProvider } from '@/features/sync/controller';

/** The "Agent replies" dialog, opened from the home page's Import menu and the editor's menu. */
export const useAgentsDialog = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));

/** Replies already reviewed (accepted or dismissed), by Drive file id. */
export async function handledReplies(): Promise<string[]> {
  return (await db.getMeta<string[]>('agents.handled')) ?? [];
}

/** Remember a reply as handled and, when it came from Drive, move it into Agents/Done. */
export async function markReplyHandled(fileId?: string) {
  if (!fileId) return;
  const done = await handledReplies();
  if (!done.includes(fileId)) await db.setMeta('agents.handled', [...done, fileId]);
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
