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

export function useWork(id: string | undefined): WorkingCopy | undefined {
  return useLiveQuery(async () => (id ? repo.getWork(id).catch(() => undefined) : undefined), [id]);
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
