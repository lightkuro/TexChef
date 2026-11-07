/**
 * Split uploaded paths into separate documents when they hold several (an export of many projects,
 * like Prism's): every folder with its own main .tex file becomes a document. A folder that holds
 * exactly one document keeps all its files (images, styles) even when the main file sits deeper.
 * Returns the project roots and the files that belong to none of them.
 */
export function splitProjects(paths: string[], isMain: (path: string) => boolean): { roots: string[]; leftovers: string[] } {
  const walk = (dir: string, inside: string[]): { roots: string[]; leftovers: string[] } => {
    const rel = (p: string) => (dir ? p.slice(dir.length + 1) : p);
    // A main file right here: this folder is one document.
    if (inside.some((p) => !rel(p).includes('/') && isMain(p))) return { roots: [dir], leftovers: [] };
    const groups = new Map<string, string[]>();
    const loose: string[] = [];
    for (const p of inside) {
      const r = rel(p);
      const slash = r.indexOf('/');
      if (slash < 0) loose.push(p);
      else {
        const sub = (dir ? dir + '/' : '') + r.slice(0, slash);
        (groups.get(sub) ?? groups.set(sub, []).get(sub)!).push(p);
      }
    }
    const roots: string[] = [];
    const leftovers = [...loose];
    for (const [sub, files] of groups) {
      if (!files.some(isMain)) {
        leftovers.push(...files);
        continue;
      }
      const r = walk(sub, files);
      // One document somewhere inside: the whole folder is that document.
      if (r.roots.length === 1) roots.push(sub);
      else {
        roots.push(...r.roots);
        leftovers.push(...r.leftovers);
      }
    }
    return { roots, leftovers };
  };
  return walk('', paths);
}
