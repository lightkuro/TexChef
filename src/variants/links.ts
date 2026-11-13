import type { FileMap, Repo } from '@/core/repo';
import type { DocMeta, DocParentLink, Recipe, WorkFile } from '@/core/model';
import { merge3 } from '@/core/merge';

/**
 * Changing which document is whose variant, after the fact, and sending a variant's changes back to
 * its original. None of the link changes touch a document's text: they only record the relationship
 * and the version updates are counted from. Each returns what it changed, so it can be undone.
 */

/** The links a change replaced: hand it to `restoreLinks` to undo the change. */
export interface LinkSnapshot {
  docs: { id: string; parent?: DocParentLink; recipe?: Recipe }[];
}

export type LinkCheck = { ok: true } | { ok: false; reason: string };

const snap = (...docs: DocMeta[]): LinkSnapshot => ({ docs: docs.map((d) => ({ id: d.id, parent: d.parent, recipe: d.recipe })) });

/** True when `ancestorId` is `docId` itself or one of the documents it was made from. */
function madeFrom(docs: Map<string, DocMeta>, docId: string, ancestorId: string): boolean {
  const seen = new Set<string>();
  let cur: string | undefined = docId;
  while (cur && !seen.has(cur)) {
    if (cur === ancestorId) return true;
    seen.add(cur);
    cur = docs.get(cur)?.parent?.docId;
  }
  return false;
}

/** May `docId` become a variant of `originalId`? One original per document, and no loops. */
export function canLink(all: DocMeta[], docId: string, originalId: string): LinkCheck {
  const docs = new Map(all.map((d) => [d.id, d]));
  const doc = docs.get(docId);
  const original = docs.get(originalId);
  if (!doc || doc.deleted) return { ok: false, reason: 'That document no longer exists.' };
  if (docId === originalId) return { ok: false, reason: 'A document can’t be a variant of itself.' };
  if (!original || original.deleted) return { ok: false, reason: 'The document to link to no longer exists.' };
  if (!original.head) return { ok: false, reason: `“${original.name}” has no saved version yet.` };
  if (doc.parent?.docId === originalId) return { ok: false, reason: `“${doc.name}” is already a variant of “${original.name}”.` };
  if (madeFrom(docs, originalId, docId)) {
    return { ok: false, reason: `“${original.name}” is itself made from “${doc.name}”, so this would go round in a circle. Use “Make this the original” to swap them.` };
  }
  return { ok: true };
}

/**
 * The version of `original` that `doc` last had everything from, when one was made from the other
 * (so only what changed since counts as an update); otherwise the original as it is now.
 */
async function sharedBase(repo: Repo, doc: DocMeta, original: DocMeta): Promise<string> {
  const base = doc.head && original.head ? await repo.mergeBase(doc.head, original.head) : null;
  if (base) {
    const owner = (await repo.getCommit(base))?.docId;
    // A version of a third document (two variants of the same master) says little about how these
    // two differ, so updates then count from now.
    if (owner === original.id || owner === doc.id) return base;
  }
  return original.head!;
}

/** Make an existing document a variant of another. Replaces the original it had, if any. */
export async function linkAsVariant(repo: Repo, docId: string, originalId: string): Promise<LinkSnapshot> {
  const all = await repo.db.docs.toArray();
  const doc = all.find((d) => d.id === docId);
  const original = all.find((d) => d.id === originalId);
  // Linking to the original it already has changes nothing (and keeps how the variant was made).
  if (doc && !doc.deleted && doc.parent?.docId === originalId && original && !original.deleted) return snap(doc);
  const check = canLink(all, docId, originalId);
  if (!check.ok) throw new Error(check.reason);
  await repo.updateDoc(docId, { parent: { docId: originalId, baseCommitId: await sharedBase(repo, doc!, original!) }, recipe: undefined, linkedAt: Date.now() });
  return snap(doc!);
}

/** Make a variant a document of its own. Its text and versions stay as they are. */
export async function unlinkVariant(repo: Repo, docId: string): Promise<LinkSnapshot> {
  const doc = await repo.getDoc(docId);
  if (!doc || doc.deleted) throw new Error('That document no longer exists.');
  if (!doc.parent) throw new Error(`“${doc.name}” is not a variant of another document.`);
  await repo.updateDoc(docId, { parent: undefined, recipe: undefined, linkedAt: Date.now() });
  return snap(doc);
}

/**
 * The newest version of `doc` that `other` has everything from: one that took updates from `other`
 * (or was made from it), or one whose changes were sent to `other`.
 */
async function lastAgreed(repo: Repo, doc: DocMeta, other: DocMeta): Promise<string | undefined> {
  if (!doc.head || !other.head) return undefined;
  const inOther = new Set<string>();
  const stack = [other.head];
  while (stack.length) {
    const id = stack.pop()!;
    if (inOther.has(id)) continue;
    inOther.add(id);
    const c = await repo.getCommit(id);
    if (c) stack.push(...c.parents);
  }
  const seen = new Set<string>();
  let id: string | undefined = doc.head;
  while (id && !seen.has(id)) {
    seen.add(id);
    const c = await repo.getCommit(id);
    if (!c || c.docId !== doc.id) return undefined;
    if (inOther.has(c.id)) return c.id;
    for (const p of c.parents) {
      // A parent in the other document's history that is not one of this document's own versions:
      // this version took updates from there (or was made from it).
      if (inOther.has(p) && (await repo.getCommit(p))?.docId !== doc.id) return c.id;
    }
    id = c.parents[0];
  }
  return undefined;
}

/**
 * Swap a variant with its original: the variant becomes the original, and its former original
 * becomes its variant. The former original's other variants stay with it. If the former original
 * was itself a variant, the promoted document takes its place.
 */
export async function makeOriginal(repo: Repo, docId: string): Promise<LinkSnapshot> {
  const doc = await repo.getDoc(docId);
  if (!doc || doc.deleted) throw new Error('That document no longer exists.');
  const old = doc.parent ? await repo.getDoc(doc.parent.docId) : undefined;
  if (!doc.parent || !old || old.deleted) throw new Error(`“${doc.name}” is not a variant of another document, so there is nothing to swap it with.`);
  if (!doc.head) throw new Error(`“${doc.name}” has no saved version yet.`);
  const above = old.parent ? await repo.getDoc(old.parent.docId) : undefined;
  // Updates for the former original count from the last version the two agreed on.
  const base = (await lastAgreed(repo, doc, old)) ?? doc.head;
  await repo.updateDoc(old.id, { parent: { docId: doc.id, baseCommitId: base }, recipe: undefined, linkedAt: Date.now() });
  await repo.updateDoc(doc.id, {
    parent: above && !above.deleted && above.head ? { docId: above.id, baseCommitId: await sharedBase(repo, doc, above) } : undefined,
    recipe: undefined,
    linkedAt: Date.now(),
  });
  return snap(doc, old);
}

/** Undo a link change. */
export async function restoreLinks(repo: Repo, snapshot: LinkSnapshot): Promise<void> {
  for (const d of snapshot.docs) {
    const cur = await repo.getDoc(d.id);
    if (cur && !cur.deleted) await repo.updateDoc(d.id, { parent: d.parent, recipe: d.recipe, linkedAt: Date.now() });
  }
}

// ---------------------------------------------------------------- sending changes to the original

export interface PushPlan {
  /** The original's files with the variant's changes worked in. */
  files: FileMap;
  conflictFiles: { path: string; conflicts: number }[];
  /** Files of the original that would change. */
  changedPaths: string[];
  notes: string[];
  /** The original's version this plan was made against. */
  originalHead: string;
  /** The original has changes this variant hasn't taken (they are kept; the variant still gets them later). */
  originalAhead: boolean;
}

const same = (a?: WorkFile, b?: WorkFile) => {
  if (!a || !b) return a === b;
  if (a.kind === 'text' && b.kind === 'text') return a.text === b.text;
  if (a.kind === 'binary' && b.kind === 'binary') return a.hash === b.hash;
  return false;
};

/** Why a variant's changes can't be sent to its original as a whole, if they can't. */
export function pushBlockedReason(variant: DocMeta | undefined | null): string | undefined {
  if (!variant?.parent) return 'This document was not made from another one, so there is no original to send changes to.';
  if (variant.recipe) {
    return 'This variant keeps only some of the original’s blocks. Sending everything back would remove the others from the original, so copy single blocks up from the Blocks panel instead.';
  }
  return undefined;
}

/**
 * "Send changes to original": the same three-way combining as getting updates, the other way round.
 *   base = original @ the version the variant last took, ours = the original now, theirs = the variant now.
 */
export async function planPush(repo: Repo, variantId: string): Promise<PushPlan> {
  const variant = await repo.getDoc(variantId);
  const blocked = pushBlockedReason(variant);
  if (blocked) throw new Error(blocked);
  const original = await repo.getDoc(variant!.parent!.docId);
  if (!original?.head || original.deleted) throw new Error('The original document is missing.');
  const base = await repo.readCommitFiles(variant!.parent!.baseCommitId);
  const ours = (await repo.getWork(original.id)).files;
  const theirs = (await repo.getWork(variantId)).files;
  const files: FileMap = {};
  const conflictFiles: { path: string; conflicts: number }[] = [];
  const changedPaths: string[] = [];
  const notes: string[] = [];
  let originalAhead = false;
  for (const path of [...new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])].sort()) {
    const b = base[path];
    const o = ours[path];
    const t = theirs[path];
    if (!same(o, b)) originalAhead = true;
    let out: WorkFile | undefined;
    if (same(t, b) || same(o, t)) out = o; // the variant didn't change it, or both made the same change
    else if (same(o, b)) out = t; // only the variant changed it
    else if (!o || !t) {
      notes.push(`${path}: deleted in one document and changed in the other; kept the changed copy.`);
      out = o ?? t;
    } else if (o.kind === 'text' && t.kind === 'text') {
      const m = merge3(o.text, b?.kind === 'text' ? b.text : '', t.text, { ours: original.name, theirs: variant!.name });
      out = { kind: 'text', text: m.text };
      if (m.conflicts) conflictFiles.push({ path, conflicts: m.conflicts });
    } else {
      notes.push(`${path}: changed in both documents; kept the original’s copy.`);
      out = o;
    }
    if (out) files[path] = out;
    if (!same(out, o)) changedPaths.push(path);
  }
  return { files, conflictFiles, changedPaths, notes, originalHead: original.head, originalAhead };
}

/**
 * Finish sending: save the result as a version of the original (after a checkpoint of each document,
 * so Restore in the original undoes it). When the variant already had everything from the original,
 * the two now agree, so the variant has no updates waiting; otherwise the updates it had not taken
 * are still offered.
 */
export async function applyPush(repo: Repo, variantId: string, files: FileMap, plan: Pick<PushPlan, 'originalHead' | 'originalAhead'>): Promise<void> {
  const variant = await repo.getDoc(variantId);
  const blocked = pushBlockedReason(variant);
  if (blocked) throw new Error(blocked);
  const originalId = variant!.parent!.docId;
  const original = await repo.getDoc(originalId);
  if (!original?.head || original.deleted) throw new Error('The original document is missing.');
  if (original.head !== plan.originalHead) throw new Error(`“${original.name}” changed while you were looking. Go back and open “Send changes” again.`);
  await repo.commitWork(variantId, 'Autosave before sending changes to the original', 'auto');
  const sent = (await repo.getDoc(variantId))!.head!;
  await repo.commitWork(originalId, 'Autosave before changes from a variant', 'auto');
  await repo.setWorkFiles(originalId, files);
  const made = await repo.commitWork(originalId, `Changes from “${variant!.name}”`, 'push-up', [sent]);
  if (made && !plan.originalAhead) await repo.updateDoc(variantId, { parent: { docId: originalId, baseCommitId: made.id }, linkedAt: Date.now() });
}
