import { parseBlocks, splitLines, type Block } from './parser';

export function getBlockText(text: string, id: string): string | undefined {
  const b = parseBlocks(text).byId.get(id);
  if (!b) return undefined;
  return splitLines(text)
    .slice(b.startLine, b.endLine + 1)
    .join('\n');
}

function replaceLines(lines: string[], start: number, endInclusive: number, insert: string[]): string[] {
  return [...lines.slice(0, start), ...insert, ...lines.slice(endInclusive + 1)];
}

/**
 * Copy block `id` from `source` into `target`: replaces the block with the same id, or inserts it
 * next to its nearest sibling / inside its parent when the target does not have it yet.
 * Returns null when the source lacks the block or no sensible insertion point exists.
 */
export function upsertBlock(target: string, source: string, id: string): string | null {
  const src = parseBlocks(source);
  const block = src.byId.get(id);
  if (!block) return null;
  const blockLines = splitLines(source).slice(block.startLine, block.endLine + 1);
  const tgt = parseBlocks(target);
  const lines = splitLines(target);
  const existing = tgt.byId.get(id);
  if (existing) return replaceLines(lines, existing.startLine, existing.endLine, blockLines).join('\n');

  const siblings: Block[] = block.parentId ? src.byId.get(block.parentId)!.children : src.roots;
  const idx = siblings.findIndex((s) => s.id === id);
  for (let i = idx - 1; i >= 0; i--) {
    const anchor = tgt.byId.get(siblings[i].id);
    if (anchor) return replaceLines(lines, anchor.endLine + 1, anchor.endLine, blockLines).join('\n');
  }
  for (let i = idx + 1; i < siblings.length; i++) {
    const anchor = tgt.byId.get(siblings[i].id);
    if (anchor) return replaceLines(lines, anchor.startLine, anchor.startLine - 1, blockLines).join('\n');
  }
  if (block.parentId) {
    const parent = tgt.byId.get(block.parentId);
    if (parent) {
      // Insert before the parent's closing marker, after its last child (or its first content line).
      const lastChild = parent.children[parent.children.length - 1];
      const at = lastChild ? lastChild.endLine + 1 : parent.endLine;
      return replaceLines(lines, at, at - 1, blockLines).join('\n');
    }
    return null;
  }
  const endDoc = lines.findIndex((l) => /^\s*\\end\{document\}/.test(l));
  if (endDoc < 0) return null;
  return replaceLines(lines, endDoc, endDoc - 1, blockLines).join('\n');
}

export function removeBlock(text: string, id: string): string {
  const b = parseBlocks(text).byId.get(id);
  if (!b) return text;
  return replaceLines(splitLines(text), b.startLine, b.endLine, []).join('\n');
}

/** Line → innermost block id at that line. */
export function blockAtLine(text: string, line: number): Block | undefined {
  let best: Block | undefined;
  for (const b of parseBlocks(text).all) {
    if (b.startLine <= line && line <= b.endLine && (!best || b.depth > best.depth)) best = b;
  }
  return best;
}

export type BlockStatus = 'same' | 'changed' | 'only-here' | 'only-there';

/** Compare blocks between two texts by id. */
export function compareBlocks(a: string, b: string): Map<string, BlockStatus> {
  const pa = parseBlocks(a);
  const pb = parseBlocks(b);
  const la = splitLines(a);
  const lb = splitLines(b);
  const out = new Map<string, BlockStatus>();
  for (const blk of pa.all) {
    const other = pb.byId.get(blk.id);
    if (!other) {
      out.set(blk.id, 'only-here');
      continue;
    }
    const ta = la.slice(blk.startLine, blk.endLine + 1).join('\n');
    const tb = lb.slice(other.startLine, other.endLine + 1).join('\n');
    out.set(blk.id, ta === tb ? 'same' : 'changed');
  }
  for (const blk of pb.all) if (!pa.byId.has(blk.id)) out.set(blk.id, 'only-there');
  return out;
}
