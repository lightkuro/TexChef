/**
 * Decides which TeX Live bundles a project needs, so the in-browser engine downloads as little as possible.
 *
 * BusyTeX resolves bundles by scanning `\usepackage` lines of the main file. A package it cannot
 * resolve (or a name with a stray space) makes it load *every* bundle (~650 MB). To stay in control we
 * rewrite the main file's `\usepackage` lines to the equivalent `\RequirePackage`, and append one
 * `\usepackage{…}` "trigger" per needed bundle after `\end{document}`, where TeX never reads it.
 * Line numbers are preserved, so diagnostics still point at the right place.
 */

export type BundleName = 'basic' | 'recommended' | 'extra';
export const BUNDLES: BundleName[] = ['basic', 'recommended', 'extra'];
export const BUNDLE_SIZE_MB: Record<BundleName, number> = { basic: 93, recommended: 201, extra: 342 };

interface BundleIndex {
  provides: Set<string>;
  /** Basenames of every .sty/.cls file in the bundle (loaded lazily). */
  files?: Set<string>;
}

export interface PackagePlan {
  /** Main file text to send to the compiler. */
  mainText: string;
  bundles: BundleName[];
  missing: string[];
}

/** Font packages whose .sty is in the core bundle but whose font files are not. */
const FONT_BUNDLE: Record<string, BundleName> = {
  charter: 'extra', helvet: 'extra', times: 'extra', mathptmx: 'extra', mathpazo: 'extra', palatino: 'extra',
  avant: 'extra', bookman: 'extra', newcent: 'extra', courier: 'extra', chancery: 'extra', utopia: 'extra',
};

const USE_RE = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;
const CLASS_RE = /\\(?:documentclass|LoadClass)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;
const PROVIDES_RE = /\\ProvidesPackage\{(.+?)\}/g;

function stripComments(text: string): string {
  return text.replace(/(?<!\\)%.*$/gm, '');
}

export function requiredPackages(text: string): { packages: string[]; classes: string[] } {
  const clean = stripComments(text);
  const packages = new Set<string>();
  const classes = new Set<string>();
  for (const m of clean.matchAll(USE_RE)) m[1].split(',').forEach((p) => p.trim() && packages.add(p.trim()));
  for (const m of clean.matchAll(CLASS_RE)) classes.add(m[1].trim());
  return { packages: [...packages], classes: [...classes] };
}

/** Rewrite `\usepackage` at line starts to `\RequirePackage` so BusyTeX's resolver ignores them. */
export function hideUsepackage(text: string): string {
  return text.replace(/^(\s*)\\usepackage\b/gm, '$1\\RequirePackage');
}

export class PackageIndex {
  private indexes = new Map<BundleName, Promise<BundleIndex>>();
  private triggers?: Promise<Partial<Record<BundleName, string>>>;

  constructor(private base: string) {}

  private load(b: BundleName): Promise<BundleIndex> {
    if (!this.indexes.has(b)) {
      this.indexes.set(
        b,
        fetch(`${this.base}/texlive-${b}.js.providespackage.txt`)
          .then((r) => (r.ok ? r.text() : ''))
          .then((t) => ({ provides: new Set([...t.matchAll(PROVIDES_RE)].map((m) => m[1].toLowerCase().trim())) })),
      );
    }
    return this.indexes.get(b)!;
  }

  private async files(b: BundleName): Promise<Set<string>> {
    const idx = await this.load(b);
    if (!idx.files) {
      const t = await fetch(`${this.base}/texlive-${b}.txt`).then((r) => (r.ok ? r.text() : ''));
      idx.files = new Set(
        t
          .split('\n')
          .filter((l) => l.endsWith('.sty') || l.endsWith('.cls'))
          .map((l) => l.slice(l.lastIndexOf('/') + 1)),
      );
    }
    return idx.files;
  }

  /** A package name that BusyTeX will resolve to exactly this bundle. */
  private trigger(b: BundleName): Promise<string | undefined> {
    if (!this.triggers) {
      this.triggers = Promise.all(BUNDLES.map((x) => this.load(x))).then(([basic, rec, extra]) => {
        const pick = (s: Set<string>, not: Set<string>[]) =>
          [...s].find((p) => /^[a-z0-9-]+$/.test(p) && not.every((n) => !n.has(p)));
        return { recommended: pick(rec.provides, [basic.provides]), extra: pick(extra.provides, [basic.provides, rec.provides]) };
      });
    }
    return this.triggers.then((t) => t[b]);
  }

  /** Basenames of every file in a bundle (loaded lazily, only when a file is reported missing). */
  private allFiles = new Map<BundleName, Promise<Set<string>>>();
  private everyFile(b: BundleName): Promise<Set<string>> {
    if (!this.allFiles.has(b)) {
      this.allFiles.set(
        b,
        fetch(`${this.base}/texlive-${b}.txt`)
          .then((r) => (r.ok ? r.text() : ''))
          .then((t) => new Set(t.split('\n').map((l) => l.slice(l.lastIndexOf('/') + 1).trim()).filter(Boolean))),
      );
    }
    return this.allFiles.get(b)!;
  }

  /** Which bundle has a file (any kind: .enc, .pfb, .tfm, .map…), preferring the smallest. */
  async locateFile(name: string): Promise<BundleName | undefined> {
    for (const b of BUNDLES) if ((await this.everyFile(b)).has(name)) return b;
    return undefined;
  }

  /** Which bundle provides a package / class file, preferring the smallest. */
  async locate(name: string, ext: 'sty' | 'cls'): Promise<BundleName | undefined> {
    if (ext === 'sty') {
      for (const b of BUNDLES) if ((await this.load(b)).provides.has(name.toLowerCase())) return b;
    }
    for (const b of BUNDLES) if ((await this.files(b)).has(`${name}.${ext}`)) return b;
    return undefined;
  }

  /** `force`: bundles to load whatever the files say (e.g. after TeX reported a file from one of them missing). */
  async plan(files: { path: string; content: string | Uint8Array }[], mainFile: string, force: BundleName[] = []): Promise<PackagePlan> {
    const local = new Set<string>();
    const localClasses = new Set<string>();
    const needs = new Set<string>();
    const classes = new Set<string>();
    for (const f of files) {
      const base = f.path.slice(f.path.lastIndexOf('/') + 1);
      if (base.endsWith('.sty')) local.add(base.slice(0, -4));
      if (base.endsWith('.cls')) localClasses.add(base.slice(0, -4));
      if (typeof f.content !== 'string') continue;
      for (const m of f.content.matchAll(PROVIDES_RE)) local.add(m[1].trim());
      const req = requiredPackages(f.content);
      req.packages.forEach((p) => needs.add(p));
      req.classes.forEach((c) => classes.add(c));
    }
    const bundles = new Set<BundleName>(['basic', ...force]);
    const missing: string[] = [];
    for (const p of needs) {
      if (local.has(p)) continue;
      const b = await this.locate(p, 'sty');
      if (b) bundles.add(b);
      else missing.push(p);
      if (FONT_BUNDLE[p]) bundles.add(FONT_BUNDLE[p]);
    }
    for (const c of classes) {
      if (localClasses.has(c)) continue;
      const b = await this.locate(c, 'cls');
      if (b) bundles.add(b);
      else missing.push(`${c} (document class)`);
    }
    const main = files.find((f) => f.path === mainFile);
    let mainText = typeof main?.content === 'string' ? hideUsepackage(main.content) : '';
    const triggers: string[] = [];
    for (const b of BUNDLES) {
      if (b === 'basic' || !bundles.has(b)) continue;
      const t = await this.trigger(b);
      if (t) triggers.push(`\\usepackage{${t}}`);
    }
    if (triggers.length) {
      // After \end{document} TeX never reads them. A main file without \end{document} (the document ends in an
      // \input file) gets \endinput first, so TeX stops reading here in any case.
      const ends = /\\end\{document\}/.test(stripComments(mainText));
      mainText = `${mainText.replace(/\s*$/, '')}\n${ends ? '' : '\\endinput\n'}${triggers.join('\n')}\n`;
    }
    return { mainText, bundles: BUNDLES.filter((b) => bundles.has(b)), missing };
  }
}
