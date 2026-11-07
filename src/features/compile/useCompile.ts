import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { compiler, type CompileOutput, type EngineStatus } from '@/compile/compiler';
import { renderThumbnail, pageCount } from '@/compile/pdf';
import { db, repo } from '@/app/repo';
import type { FileMap } from '@/core/repo';
import type { Engine } from '@/core/model';

export interface CompileEntry {
  output?: CompileOutput;
  pages?: number;
  running: boolean;
  /** Fingerprint of the inputs of the last finished compile. */
  inputKey?: string;
  at?: number;
}

interface CompileStore {
  entries: Record<string, CompileEntry>;
  set: (key: string, patch: Partial<CompileEntry>) => void;
}

export const useCompileStore = create<CompileStore>((set) => ({
  entries: {},
  set: (key, patch) =>
    set((s) => ({ entries: { ...s.entries, [key]: { ...(s.entries[key] ?? { running: false }), ...patch } } })),
}));

if (import.meta.env.DEV) (window as unknown as { rcCompile: unknown }).rcCompile = useCompileStore;

export function useEngineStatus(): EngineStatus {
  return useSyncExternalStore(
    (cb) => compiler.onStatus(cb),
    () => compiler.status,
  );
}

function fingerprint(files: FileMap, mainFile: string, engine: Engine): string {
  let h = `${mainFile}|${engine}`;
  for (const [p, f] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    h += `|${p}:${f.kind === 'text' ? f.text.length + ':' + quickHash(f.text) : f.hash}`;
  }
  return h;
}

function quickHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface CompileRequest {
  key: string;
  files: FileMap;
  mainFile: string;
  engine: Engine;
  /** Store PDF + thumbnail as the document preview (for graph cards and downloads). */
  savePreviewAs?: string;
}

/** Compile a file map and record the result in the shared compile store. */
export async function compileFiles(req: CompileRequest): Promise<CompileOutput | undefined> {
  const store = useCompileStore.getState();
  const inputKey = fingerprint(req.files, req.mainFile, req.engine);
  store.set(req.key, { running: true });
  const files = await Promise.all(
    Object.entries(req.files).map(async ([path, f]) => ({
      path,
      content: f.kind === 'text' ? f.text : ((await repo.getBlob(f.hash)) ?? new Uint8Array()),
    })),
  );
  const output = await compiler.compile(req.key, { files, mainFile: req.mainFile, engine: req.engine });
  if (output.superseded) return undefined;
  let pages: number | undefined;
  if (output.pdf) {
    try {
      pages = await pageCount(output.pdf);
    } catch {
      pages = undefined;
    }
  }
  const prev = useCompileStore.getState().entries[req.key];
  useCompileStore.getState().set(req.key, {
    running: false,
    // Keep showing the last good PDF when a compile fails.
    output: output.pdf ? output : { ...output, pdf: prev?.output?.pdf, synctex: prev?.output?.synctex },
    pages: output.pdf ? pages : prev?.pages,
    inputKey,
    at: Date.now(),
  });
  if (output.pdf && req.savePreviewAs) {
    const pdf = output.pdf;
    const key = req.savePreviewAs;
    void renderThumbnail(pdf)
      .then(({ pages: n, thumbnail }) => db.previews.put({ key, pdf, pages: n, thumbnail, compiledAt: Date.now() }))
      .catch(() => db.previews.put({ key, pdf, pages: pages ?? 0, compiledAt: Date.now() }));
  }
  return output;
}

export function isUpToDate(key: string, files: FileMap | undefined, mainFile: string, engine: Engine): boolean {
  if (!files) return true;
  return useCompileStore.getState().entries[key]?.inputKey === fingerprint(files, mainFile, engine);
}

/**
 * Compile a document's working copy, automatically after edits (debounced) when `auto` is on.
 */
export function useAutoCompile(opts: {
  key: string;
  files: FileMap | undefined;
  mainFile: string | undefined;
  engine: Engine | undefined;
  auto: boolean;
  delayMs?: number;
  savePreviewAs?: string;
}) {
  const { key, files, mainFile, engine, auto, delayMs = 1200, savePreviewAs } = opts;
  const entry = useCompileStore((s) => s.entries[key]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(opts);
  latest.current = opts;

  /** Compile now. Pass `files` when they may be newer than the last render (e.g. right after a save). */
  const compileNow = useCallback(async (files?: FileMap) => {
    const o = latest.current;
    const f = files ?? o.files;
    if (!f || !o.mainFile || !o.engine) return undefined;
    return compileFiles({ key: o.key, files: f, mainFile: o.mainFile, engine: o.engine, savePreviewAs: o.savePreviewAs });
  }, []);

  useEffect(() => {
    if (!auto || !files || !mainFile || !engine) return;
    if (isUpToDate(key, files, mainFile, engine)) return;
    clearTimeout(timer.current);
    const first = !useCompileStore.getState().entries[key]?.output;
    timer.current = setTimeout(() => void compileNow(), first ? 0 : delayMs);
    return () => clearTimeout(timer.current);
  }, [auto, files, mainFile, engine, key, delayMs, compileNow, savePreviewAs]);

  return { entry, compileNow };
}
