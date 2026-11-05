import type { Recipe } from '@/core/model';
import { parseBlocks, splitLines, type Block } from './parser';

/** Whether a block is kept by a recipe, ignoring its ancestors. */
export function blockSelected(block: Pick<Block, 'id' | 'tags'>, recipe: Recipe): boolean {
  if (recipe.exclude.includes(block.id)) return false;
  if (recipe.include.includes(block.id)) return true;
  return defaultSelected(block, recipe);
}

/** Selection implied by the tag filter alone (no per-block override). */
export function defaultSelected(block: Pick<Block, 'tags'>, recipe: Recipe): boolean {
  if (recipe.tags.length === 0) return false;
  return block.tags.length === 0 || block.tags.some((t) => recipe.tags.includes(t));
}

/** Toggle a block in a recipe, keeping include/exclude minimal relative to the tag filter. */
export function setBlockSelected(recipe: Recipe, block: Pick<Block, 'id' | 'tags'>, selected: boolean): Recipe {
  const include = recipe.include.filter((id) => id !== block.id);
  const exclude = recipe.exclude.filter((id) => id !== block.id);
  if (selected !== defaultSelected(block, recipe)) {
    (selected ? include : exclude).push(block.id);
  }
  return { ...recipe, include, exclude };
}

/** Effective inclusion including ancestors (a child of an excluded block is excluded). */
export function effectiveSelection(text: string, recipe: Recipe): Map<string, boolean> {
  const parsed = parseBlocks(text);
  const out = new Map<string, boolean>();
  const visit = (b: Block, parentOn: boolean) => {
    const on = parentOn && blockSelected(b, recipe);
    out.set(b.id, on);
    b.children.forEach((c) => visit(c, on));
  };
  parsed.roots.forEach((b) => visit(b, true));
  return out;
}

export interface FilterOptions {
  /** Remove list environments / *ListStart…*ListEnd pairs left empty by filtering. Default true. */
  pruneEmptyLists?: boolean;
}

/** Produce the variant text: drop every excluded block (marker lines included). */
export function filterTex(text: string, recipe: Recipe, opts: FilterOptions = {}): string {
  const parsed = parseBlocks(text);
  const lines = splitLines(text);
  const drop = new Uint8Array(lines.length);
  const visit = (b: Block) => {
    if (!blockSelected(b, recipe)) {
      for (let i = b.startLine; i <= b.endLine && i < lines.length; i++) drop[i] = 1;
      return;
    }
    b.children.forEach(visit);
  };
  parsed.roots.forEach(visit);
  let out = lines.filter((_, i) => !drop[i]).join('\n');
  if (opts.pruneEmptyLists !== false) out = pruneEmptyLists(out);
  return out;
}

// Whitespace or comments that are not block markers.
const FILLER = String.raw`(?:[ \t]*(?:%(?![%\s]*@)[^\n]*)?\n)*[ \t]*`;
const EMPTY_ENV_RE = new RegExp(
  String.raw`^[ \t]*\\begin\{(itemize|enumerate|description)\}(?:\[[^\]\n]*\])?[ \t]*\n` + FILLER + String.raw`\\end\{\1\}[ \t]*(?:\n|$)`,
  'gm',
);
const EMPTY_MACRO_LIST_RE = new RegExp(
  String.raw`^[ \t]*\\(\w+)ListStart\b[ \t]*\n` + FILLER + String.raw`\\\1ListEnd\b[ \t]*(?:\n|$)`,
  'gm',
);

export function pruneEmptyLists(text: string): string {
  let prev: string;
  let out = text;
  do {
    prev = out;
    out = out.replace(EMPTY_ENV_RE, '').replace(EMPTY_MACRO_LIST_RE, '');
  } while (out !== prev);
  return out;
}

/** Blocks with children where every child was filtered out (e.g. a heading with no items left). */
export function emptiedBlocks(text: string, recipe: Recipe): Block[] {
  const parsed = parseBlocks(text);
  const sel = effectiveSelection(text, recipe);
  return parsed.all.filter((b) => sel.get(b.id) && b.children.length > 0 && b.children.every((c) => !sel.get(c.id)));
}
