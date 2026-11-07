/** Small helpers for project-relative paths ("sections/intro.tex"). */

/** Resolve "." and ".." segments and drop empty ones: "vision/./a/../main.tex" → "vision/main.tex". */
export function normalizePath(p: string): string {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

/** Folder of a path ("" for a file at the top). */
export function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

export function joinPath(dir: string, p: string): string {
  return normalizePath(dir ? `${dir}/${p}` : p);
}
