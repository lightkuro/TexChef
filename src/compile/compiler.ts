import { BusyTexRunner, deletePackageCache, type DownloadProgress } from 'texlyre-busytex';
import type { Engine } from '@/core/model';
import { parseTexLog, type Diagnostic } from './logParser';
import { BUNDLE_SIZE_MB, PackageIndex, type BundleName } from './packages';

export interface CompileFile {
  path: string;
  content: string | Uint8Array;
}

export interface CompileInput {
  files: CompileFile[];
  mainFile: string;
  engine: Engine;
}

export interface CompileOutput {
  ok: boolean;
  pdf?: Uint8Array;
  synctex?: Uint8Array;
  log: string;
  diagnostics: Diagnostic[];
  durationMs: number;
  /** A newer compile for the same key replaced this one before it ran. */
  superseded?: boolean;
  bundles?: BundleName[];
}

/** Pluggable compiler so a server-side TeX Live backend can be added later. */
export interface Compiler {
  compile(key: string, input: CompileInput): Promise<CompileOutput>;
}

export type EngineStatus =
  | { state: 'idle' }
  | { state: 'loading'; percent?: number; loadedMB?: number; totalMB?: number; label?: string }
  | { state: 'ready' }
  | { state: 'error'; message: string };

const DRIVERS = {
  pdflatex: 'pdftex_bibtex8',
  xelatex: 'xetex_bibtex8_dvipdfmx',
  lualatex: 'luahbtex_bibtex8',
} as const;

const BASE = (import.meta.env.VITE_TEX_ASSETS_URL as string | undefined)?.replace(/\/$/, '') || '/core/busytex';
const REMOTE = (import.meta.env.VITE_TEX_REMOTE_ENDPOINT as string | undefined) || undefined;

/** BusyTeX (TeX Live 2026 compiled to WebAssembly) running in a Web Worker. */
export class BusyTexCompiler implements Compiler {
  private runner?: BusyTexRunner;
  private initPromise?: Promise<void>;
  private chain: Promise<unknown> = Promise.resolve();
  private latest = new Map<string, CompileInput>();
  private packages = new PackageIndex(BASE);
  private loadingLabel = 'Downloading TeX Live core (93 MB, one time)';
  private statusListeners = new Set<(s: EngineStatus) => void>();
  status: EngineStatus = { state: 'idle' };

  onStatus(fn: (s: EngineStatus) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(s: EngineStatus) {
    this.status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  ensureReady(): Promise<void> {
    if (!this.initPromise) {
      this.setStatus({ state: 'loading', label: this.loadingLabel });
      this.runner = new BusyTexRunner({
        busytexBasePath: BASE,
        preloadDataPackages: [`${BASE}/texlive-basic.js`],
        catalogDataPackages: [`${BASE}/texlive-recommended.js`, `${BASE}/texlive-extra.js`],
        onDownloadProgress: (p: DownloadProgress) =>
          this.setStatus({
            state: 'loading',
            percent: Math.round(p.percent),
            loadedMB: Math.round(p.loaded / 1e6),
            totalMB: Math.round(p.total / 1e6),
            label: this.loadingLabel,
          }),
      });
      this.initPromise = this.runner
        .initialize(true)
        .then(() => this.setStatus({ state: 'ready' }))
        .catch((e: unknown) => {
          this.initPromise = undefined;
          this.runner = undefined;
          this.setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) });
          throw e;
        });
    }
    return this.initPromise;
  }

  compile(key: string, input: CompileInput): Promise<CompileOutput> {
    this.latest.set(key, input);
    const job = this.chain.then(() => this.run(key, input));
    this.chain = job.catch(() => undefined);
    return job;
  }

  private async run(key: string, input: CompileInput, retry?: { force: BundleName[] }): Promise<CompileOutput> {
    if (this.latest.get(key) !== input) {
      return { ok: false, log: '', diagnostics: [], durationMs: 0, superseded: true };
    }
    const t0 = performance.now();
    await this.ensureReady();
    const main = input.files.find((f) => f.path === input.mainFile);
    const mainText = typeof main?.content === 'string' ? main.content : '';
    const plan = await this.packages.plan(input.files, input.mainFile, retry?.force);
    const files = input.files.map((f) => (f.path === input.mainFile ? { path: f.path, content: plan.mainText } : f));
    const extra = plan.bundles.filter((b) => b !== 'basic');
    for (const b of extra) {
      if (!(await this.runner!.isPackageCached(`${BASE}/texlive-${b}.js`))) {
        this.loadingLabel = `Downloading TeX Live “${b}” packages (${BUNDLE_SIZE_MB[b]} MB, one time)`;
        this.setStatus({ state: 'loading', label: this.loadingLabel });
      }
    }
    const hasBib = input.files.some((f) => f.path.endsWith('.bib'));
    const usesBiblatex = /\\addbibresource\b/.test(mainText);
    const bibtex = hasBib && /\\bibliography\{/.test(mainText);
    const rerun = bibtex || usesBiblatex || /\\(tableofcontents|ref|pageref|cite|listoffigures)\b/.test(mainText);
    try {
      const r = await this.runner!.compile(
        files,
        input.mainFile,
        bibtex,
        hasBib && usesBiblatex,
        null,
        rerun,
        'silent',
        DRIVERS[input.engine],
        null,
        REMOTE,
      );
      if (this.status.state !== 'ready') this.setStatus({ state: 'ready' });
      const log = r.log || r.logs?.map((l) => l.log || l.stdout).join('\n') || '';
      const pdf = r.pdf && r.pdf.byteLength > 0 ? r.pdf : undefined;
      const diagnostics = parseTexLog(
        log,
        input.files.map((f) => f.path),
        input.mainFile,
      );
      // TeX couldn't find a package or class that comes with one of the TeX Live bundles: that bundle didn't
      // load (an interrupted download, or one the plan didn't know about). Download it again and retry once.
      const lost = await this.bundlesForMissingFiles(log);
      if (lost.length && !retry) {
        const stale = lost.filter((b) => plan.bundles.includes(b));
        for (const b of stale) await deletePackageCache(`${BASE}/texlive-${b}.js`);
        if (stale.length) {
          this.runner?.terminate();
          this.runner = undefined;
          this.initPromise = undefined;
          this.loadingLabel = `Downloading TeX Live “${stale[0]}” packages again (${BUNDLE_SIZE_MB[stale[0]]} MB)`;
        }
        return this.run(key, input, { force: lost });
      }
      for (const d of diagnostics) {
        const file = /File [`'](.+?\.(?:sty|cls))' not found/.exec(d.message)?.[1];
        const b = file && (await this.packages.locate(file.replace(/\.(sty|cls)$/, ''), file.endsWith('.cls') ? 'cls' : 'sty'));
        if (b) {
          d.hint = `“${file}” comes with TeX Live’s “${b}” package set (${BUNDLE_SIZE_MB[b]} MB), but it didn’t load in this browser. Check your connection and free disk space, then press Compile. Settings → Clear downloaded TeX packages makes texChef fetch them fresh.`;
        }
      }
      for (const m of plan.missing) {
        diagnostics.unshift({
          severity: diagnostics.some((d) => d.severity === 'error') ? 'error' : 'warning',
          message: `Package “${m}” is not in the in-browser TeX Live.`,
          hint: 'Upload its .sty/.cls file into the project, or pick an alternative package.',
        });
      }
      return {
        ok: !!pdf && r.success,
        pdf,
        synctex: r.synctex,
        log,
        diagnostics,
        durationMs: Math.round(performance.now() - t0),
        bundles: plan.bundles,
      };
    } catch (e) {
      // A crashed worker cannot be reused.
      this.runner?.terminate();
      this.runner = undefined;
      this.initPromise = undefined;
      this.setStatus({ state: 'idle' });
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        log: message,
        diagnostics: [{ severity: 'error', message: `Compiler crashed: ${message}` }],
        durationMs: Math.round(performance.now() - t0),
      };
    }
  }

  /** Bundles that provide the .sty/.cls files TeX reported as not found. */
  private async bundlesForMissingFiles(log: string): Promise<BundleName[]> {
    const out = new Set<BundleName>();
    for (const m of log.matchAll(/File [`'](.+?)\.(sty|cls)' not found/g)) {
      const b = await this.packages.locate(m[1], m[2] as 'sty' | 'cls');
      if (b) out.add(b);
    }
    return [...out];
  }

  async clearCache(): Promise<void> {
    const r = this.runner ?? new BusyTexRunner({ busytexBasePath: BASE });
    await r.clearAllPackageCache();
    this.runner = undefined;
    this.initPromise = undefined;
    this.setStatus({ state: 'idle' });
  }
}

export const compiler = new BusyTexCompiler();
