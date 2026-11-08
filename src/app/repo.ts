import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RCDatabase } from '@/storage/db';
import { Repo } from '@/core/repo';
import type { Commit, DocMeta, PreviewRecord, WorkingCopy } from '@/core/model';

export const db = new RCDatabase();
export const repo = new Repo(db);

if (import.meta.env.DEV) (window as unknown as { rc: unknown }).rc = { db, repo };

export function useDocs(): DocMeta[] | undefined {
  return useLiveQuery(async () => (await db.docs.toArray()).filter((d) => !d.deleted).sort((a, b) => a.createdAt - b.createdAt), []);
}

export function useDoc(id: string | undefined): DocMeta | undefined | null {
  return useLiveQuery(async () => (id ? (await db.docs.get(id)) ?? null : null), [id]);
}

/**
 * A document's working copy, plus why it couldn't be made. The copy is created the first time a
 * document is opened on this device (e.g. one that arrived from Google Drive). That happens outside
 * the live query, because Dexie refuses writes inside one.
 */
export function useWorkState(id: string | undefined): { work: WorkingCopy | undefined; error?: string; retry: () => void } {
  const work = useLiveQuery(async () => (id ? ((await db.work.get(id)) ?? null) : undefined), [id]);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id || work !== null) return;
    let cancelled = false;
    setError(undefined);
    repo.getWork(id).catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [id, work, attempt]);
  return { work: work ?? undefined, error: work ? undefined : error, retry: () => setAttempt((n) => n + 1) };
}

export function useWork(id: string | undefined): WorkingCopy | undefined {
  return useWorkState(id).work;
}

export function useDocCommits(id: string | undefined): Commit[] | undefined {
  return useLiveQuery(async () => (id ? (await db.commits.where('docId').equals(id).sortBy('createdAt')).reverse() : []), [id]);
}

export function useAllCommits(): Commit[] | undefined {
  return useLiveQuery(() => db.commits.orderBy('createdAt').toArray(), []);
}

export function usePreview(key: string | undefined): PreviewRecord | undefined {
  return useLiveQuery(async () => (key ? db.previews.get(key) : undefined), [key]);
}

export function usePreviews(): Map<string, PreviewRecord> | undefined {
  return useLiveQuery(async () => new Map((await db.previews.toArray()).map((p) => [p.key, p])), []);
}

export function useBehind(doc: DocMeta | undefined | null): number | undefined {
  return useLiveQuery(async () => (doc ? repo.commitsBehindParent(doc) : 0), [doc?.id, doc?.parent?.baseCommitId, doc?.updatedAt]);
}
