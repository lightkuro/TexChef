import type { FileMap, Repo } from '@/core/repo';
import { isTexPath, type DocMeta, type Recipe, type WorkFile } from '@/core/model';
import { filterTex } from '@/blocks/filter';
import { parseBlocks, type Block } from '@/blocks/parser';
import { blockAtLine, getBlockText, upsertBlock } from '@/blocks/ops';
import { merge3 } from '@/core/merge';

/** Apply a recipe to every .tex file of a project. */
export function filterFiles(files: FileMap, recipe: Recipe): FileMap {
  const out: FileMap = {};
  for (const [path, f] of Object.entries(files)) {
    out[path] = f.kind === 'text' && isTexPath(path) ? { kind: 'text', text: filterTex(f.text, recipe) } : f;
  }
  return out;
}

/** All block ids across the project's .tex files. */
export function projectBlockIds(files: FileMap): string[] {
  const ids: string[] = [];
  for (const [path, f] of Object.entries(files)) {
    if (f.kind === 'text' && isTexPath(path)) ids.push(...parseBlocks(f.text).all.map((b) => b.id));
  }
  return ids;
}

export function projectBlocks(files: FileMap): { file: string; block: Block }[] {
  const out: { file: string; block: Block }[] = [];
  for (const [path, f] of Object.entries(files)) {
    if (f.kind === 'text' && isTexPath(path)) parseBlocks(f.text).all.forEach((block) => out.push({ file: path, block }));
  }
  return out;
}

export interface CreateVariantInput {
  parentId: string;
  /** Parent commit to branch from (defaults to parent head; parent edits are autosaved first). */
  fromCommitId?: string;
  name: string;
  recipe: Recipe;
  tags?: string[];
}

export async function createVariant(repo: Repo, input: CreateVariantInput): Promise<DocMeta> {
  const parent = await repo.getDoc(input.parentId);
  if (!parent) throw new Error('The original document was not found');
  if (!input.fromCommitId) await repo.commitWork(parent.id, 'Autosave before creating a variant', 'auto');
  const fresh = (await repo.getDoc(parent.id))!;
  const base = input.fromCommitId ?? fresh.head;
  if (!base) throw new Error('The original has no saved versions yet');
  const parentFiles = await repo.readCommitFiles(base);
  const recipe: Recipe = { ...input.recipe, known: projectBlockIds(parentFiles) };
  return repo.createDoc({
    name: input.name,
    files: filterFiles(parentFiles, recipe),
    mainFile: parent.mainFile,
    engine: parent.engine,
    tags: input.tags ?? parent.tags,
    parent: { docId: parent.id, baseCommitId: base },
    recipe,
  });
}

/** Duplicate a document at a commit as an unlinked copy (a plain fork that keeps lineage). */
export async function forkDocument(repo: Repo, docId: string, name: string, fromCommitId?: string): Promise<DocMeta> {
  const doc = await repo.getDoc(docId);
  if (!doc) throw new Error('Document not found');
  if (!fromCommitId) await repo.commitWork(doc.id, 'Autosave before duplicating', 'auto');
  const base = fromCommitId ?? (await repo.getDoc(doc.id))!.head!;
  const files = await repo.readCommitFiles(base);
  return repo.createDoc({
    name,
    files,
    mainFile: doc.mainFile,
    engine: doc.engine,
    tags: doc.tags,
    parent: { docId: doc.id, baseCommitId: base },
    // No recipe: a plain fork pulls every parent change unfiltered.
  });
}

export interface PullPlan {
  files: FileMap;
  conflictFiles: { path: string; conflicts: number }[];
  changedPaths: string[];
  notes: string[];
  parentHead: string;
}

export interface NewBlockInfo {
  file: string;
  block: Block;
}

/** Blocks in the parent head that the variant has never seen (candidates to include on pull). */
export async function newParentBlocks(repo: Repo, variant: DocMeta): Promise<NewBlockInfo[]> {
  if (!variant.parent || !variant.recipe) return [];
  const parent = await repo.getDoc(variant.parent.docId);
  if (!parent?.head) return [];
  const files = await repo.readCommitFiles(parent.head);
  const known = new Set(variant.recipe?.known ?? []);
  return projectBlocks(files).filter(({ block }) => !known.has(block.id));
}

/**
 * 3-way merge of parent changes into the variant:
 *   base   = filter(parent @ baseCommit), theirs = filter(parent @ head), ours = variant working copy.
 */
export async function planPull(repo: Repo, variantId: string, recipeOverride?: Recipe): Promise<PullPlan> {
  const variant = await repo.getDoc(variantId);
  if (!variant?.parent) throw new Error('This document was not made from another one, so there is nothing to update from');
  const parent = await repo.getDoc(variant.parent.docId);
  if (!parent?.head) throw new Error('The original document is missing');
  const recipe = recipeOverride ?? variant.recipe ?? { include: [], exclude: [], tags: [], known: [] };
  // A plain fork (recipe never set) keeps everything.
  const passthrough = !variant.recipe;
  const filt = (files: FileMap) => (passthrough ? files : filterFiles(files, recipe));
  const base = filt(await repo.readCommitFiles(variant.parent.baseCommitId));
  const theirs = filt(await repo.readCommitFiles(parent.head));
  const ours = (await repo.getWork(variantId)).files;

  const out: FileMap = {};
  const conflictFiles: { path: string; conflicts: number }[] = [];
  const changedPaths: string[] = [];
  const notes: string[] = [];
  const paths = new Set([...Object.keys(base), ...Object.keys(theirs), ...Object.keys(ours)]);
  for (const path of [...paths].sort()) {
    const b = base[path];
    const t = theirs[path];
    const o = ours[path];
    const result = mergeFile(path, o, b, t, notes, `${variant.name}`, `${parent.name}`);
    if (result.file) out[path] = result.file;
    if (result.conflicts) conflictFiles.push({ path, conflicts: result.conflicts });
    if (!sameFile(result.file, o)) changedPaths.push(path);
  }
  return { files: out, conflictFiles, changedPaths, notes, parentHead: parent.head };
}

/** 3-way merge of whole projects (file by file). */
export function mergeFileMaps(
  ours: FileMap,
  base: FileMap,
  theirs: FileMap,
  labels: { ours: string; theirs: string },
): { files: FileMap; conflictFiles: { path: string; conflicts: number }[]; notes: string[] } {
  const files: FileMap = {};
  const conflictFiles: { path: string; conflicts: number }[] = [];
  const notes: string[] = [];
  const paths = new Set([...Object.keys(base), ...Object.keys(theirs), ...Object.keys(ours)]);
  for (const path of [...paths].sort()) {
    const r = mergeFile(path, ours[path], base[path], theirs[path], notes, labels.ours, labels.theirs);
    if (r.file) files[path] = r.file;
    if (r.conflicts) conflictFiles.push({ path, conflicts: r.conflicts });
  }
  return { files, conflictFiles, notes };
}

function sameFile(a?: WorkFile, b?: WorkFile): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'text' && b.kind === 'text') return a.text === b.text;
  if (a.kind === 'binary' && b.kind === 'binary') return a.hash === b.hash;
  return false;
}

function mergeFile(
  path: string,
  o: WorkFile | undefined,
  b: WorkFile | undefined,
  t: WorkFile | undefined,
  notes: string[],
  oursLabel: string,
  theirsLabel: string,
): { file?: WorkFile; conflicts: number } {
  if (sameFile(t, b)) return { file: o, conflicts: 0 }; // parent unchanged
  if (sameFile(o, b)) return { file: t, conflicts: 0 }; // variant unchanged
  if (sameFile(o, t)) return { file: o, conflicts: 0 }; // same change on both sides
  if (!o || !t) {
    // Deleted on one side, changed on the other: keep the changed file.
    notes.push(`${path}: deleted on one side and changed on the other; kept the changed copy.`);
    return { file: o ?? t, conflicts: 0 };
  }
  if (o.kind === 'text' && t.kind === 'text') {
    const baseText = b?.kind === 'text' ? b.text : '';
    const m = merge3(o.text, baseText, t.text, { ours: oursLabel, theirs: theirsLabel });
    return { file: { kind: 'text', text: m.text }, conflicts: m.conflicts };
  }
  notes.push(`${path}: changed in both documents; kept this document's copy.`);
  return { file: o, conflicts: 0 };
}

/** Finish a pull: write merged files and record a merge commit with both heads as parents. */
export async function applyPull(
  repo: Repo,
  variantId: string,
  files: FileMap,
  parentHead: string,
  recipe?: Recipe,
): Promise<void> {
  const variant = await repo.getDoc(variantId);
  if (!variant?.parent) throw new Error('This document was not made from another one');
  await repo.commitWork(variantId, 'Autosave before getting updates', 'auto');
  await repo.setWorkFiles(variantId, files);
  const parent = await repo.getDoc(variant.parent.docId);
  await repo.commitWork(variantId, `Got updates from “${parent?.name ?? 'the original'}”`, 'merge', [parentHead]);
  const parentFiles = await repo.readCommitFiles(parentHead);
  const nextRecipe = recipe ?? variant.recipe;
  await repo.updateDoc(variantId, {
    parent: { docId: variant.parent.docId, baseCommitId: parentHead },
    recipe: nextRecipe ? { ...nextRecipe, known: projectBlockIds(parentFiles) } : undefined,
  });
}

/**
 * Where the same piece of text sits in the original document, if it appears there exactly once
 * (inside the same block when the text is in a block). Used by "also change it in the original".
 */
export function locateInOriginal(variantText: string, unitStart: number, unitText: string, originalText: string): number | undefined {
  if (!unitText.trim()) return undefined;
  const line = variantText.slice(0, unitStart).split('\n').length - 1;
  const block = blockAtLine(variantText, line);
  const unique = (from: number, to: number) => {
    const scope = originalText.slice(from, to);
    const first = scope.indexOf(unitText);
    if (first < 0 || scope.indexOf(unitText, first + 1) >= 0) return undefined;
    return from + first;
  };
  if (block) {
    const b = parseBlocks(originalText).byId.get(block.id);
    if (b) {
      const lines = originalText.split('\n');
      const from = lines.slice(0, b.startLine).join('\n').length;
      const to = lines.slice(0, b.endLine + 1).join('\n').length;
      const inBlock = unique(from, to);
      if (inBlock !== undefined) return inBlock;
    }
  }
  return unique(0, originalText.length);
}

/** Make the same text change in the variant's original, as a saved version there. */
export async function applyTextToOriginal(
  repo: Repo,
  variantId: string,
  path: string,
  variantText: string,
  unitStart: number,
  oldText: string,
  newText: string,
): Promise<{ ok: boolean; name?: string }> {
  const variant = await repo.getDoc(variantId);
  if (!variant?.parent) return { ok: false };
  const original = await repo.getDoc(variant.parent.docId);
  const work = await repo.getWork(variant.parent.docId);
  const file = work.files[path];
  if (!original || file?.kind !== 'text') return { ok: false };
  const at = locateInOriginal(variantText, unitStart, oldText, file.text);
  if (at === undefined) return { ok: false };
  await repo.commitWork(original.id, 'Autosave before a change from a variant', 'auto');
  await repo.writeWorkText(original.id, path, file.text.slice(0, at) + newText + file.text.slice(at + oldText.length));
  await repo.commitWork(original.id, `Text changed from “${variant.name}”`, 'push-up');
  return { ok: true, name: original.name };
}

export interface PushResult {
  ok: boolean;
  /** Parent changed this block since the variant's base; caller should confirm before forcing. */
  parentChanged?: boolean;
  message: string;
}

/** Copy one block from a variant into its parent and commit it there. */
export async function pushBlockToParent(
  repo: Repo,
  variantId: string,
  blockId: string,
  force = false,
): Promise<PushResult> {
  const variant = await repo.getDoc(variantId);
  if (!variant?.parent) return { ok: false, message: 'This document was not made from another one' };
  const parentId = variant.parent.docId;
  const ours = (await repo.getWork(variantId)).files;
  const located = projectBlocks(ours).find((x) => x.block.id === blockId);
  if (!located) return { ok: false, message: `Block “${blockId}” not found` };
  const sourceText = (ours[located.file] as { text: string }).text;

  const parentWork = await repo.getWork(parentId);
  const target = parentWork.files[located.file];
  if (!target || target.kind !== 'text') return { ok: false, message: `${located.file} does not exist in the original` };

  if (!force) {
    const baseText = await repo.readCommitText(variant.parent.baseCommitId, located.file);
    const before = baseText ? getBlockText(baseText, blockId) : undefined;
    const now = getBlockText(target.text, blockId);
    const mine = getBlockText(sourceText, blockId);
    if (before !== undefined && now !== undefined && now !== before && now !== mine) {
      return { ok: false, parentChanged: true, message: 'The original changed this block too.' };
    }
  }
  const updated = upsertBlock(target.text, sourceText, blockId);
  if (updated === null) return { ok: false, message: 'Could not find where to put this block in the original' };
  if (updated === target.text) return { ok: true, message: 'The original already has this version of the block' };
  await repo.commitWork(parentId, 'Autosave before copying from a variant', 'auto');
  await repo.writeWorkText(parentId, located.file, updated);
  await repo.commitWork(parentId, `Copied “${located.block.label}” from “${variant.name}”`, 'push-up');
  return { ok: true, message: `Updated “${located.block.label}” in “${(await repo.getDoc(parentId))?.name ?? 'the original'}”` };
}
