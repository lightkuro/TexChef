import { dirname, joinPath, normalizePath } from '@/lib/paths';

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  message: string;
  file?: string;
  /** 1-based source line. */
  line?: number;
  hint?: string;
}

const OPEN_FILE_RE = /\((?:\.\/)?([^\s()]+\.(?:tex|cls|sty))/g;

/**
 * Best-effort TeX log parser: errors (`! ...` + `l.<n>`), file:line:error style, LaTeX/package
 * warnings and bad boxes. `projectFiles` helps attribute messages to the right file.
 */
export function parseTexLog(log: string, projectFiles: string[] = [], mainFile = 'main.tex'): Diagnostic[] {
  const lines = log.split(/\r?\n/);
  const out: Diagnostic[] = [];
  const project = new Set(projectFiles);
  // TeX runs in the main file's folder, so the log names files relative to it.
  const baseDir = dirname(mainFile);
  const resolve = (p: string): string | undefined => {
    const fromMain = joinPath(baseDir, p);
    if (project.has(fromMain)) return fromMain;
    const plain = normalizePath(p);
    return project.has(plain) ? plain : undefined;
  };
  let currentFile = mainFile;
  const seen = new Set<string>();
  const push = (d: Diagnostic) => {
    const key = `${d.severity}|${d.file}|${d.line}|${d.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(d);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const m of line.matchAll(OPEN_FILE_RE)) {
      const f = resolve(m[1]);
      if (f) currentFile = f;
    }

    const fle = /^(?:\.\/)?([^:\s]+\.tex):(\d+): (.*)$/.exec(line);
    if (fle) {
      push({ severity: 'error', file: resolve(fle[1]) ?? fle[1], line: Number(fle[2]), message: fle[3].trim() });
      continue;
    }

    if (line.startsWith('! ')) {
      let message = line.slice(2).replace(/^LaTeX Error:\s*/, '').trim();
      let lineNo: number | undefined;
      let context = '';
      for (let j = i + 1; j < Math.min(lines.length, i + 14); j++) {
        const l = /^l\.(\d+)\s?(.*)$/.exec(lines[j]);
        if (l) {
          lineNo = Number(l[1]);
          context = l[2].trim();
          break;
        }
        if (j === i + 1 && lines[j] && !lines[j].startsWith('See the') && !lines[j].startsWith('Type') && !lines[j].startsWith('!')) {
          // Wrapped error message.
          if (!/^\s/.test(lines[j]) && message.length > 60) message += ' ' + lines[j].trim();
        }
      }
      if (message === 'Emergency stop.' || message.startsWith('==> Fatal error')) {
        if (out.some((d) => d.severity === 'error')) continue;
      }
      const d: Diagnostic = { severity: 'error', file: currentFile, line: lineNo, message };
      const missing = /File [`'](.+?)' not found/.exec(message);
      if (missing) {
        d.hint = `“${missing[1]}” is not in the bundled TeX Live packages. Upload it into the project, or use a package from the core bundle.`;
      } else if (/Undefined control sequence/.test(message) && context) {
        d.message = `Undefined control sequence: ${context.split(/\s/).pop()}`;
      }
      push(d);
      continue;
    }

    const latexWarn = /^(?:LaTeX|Class \S+|Package \S+) Warning: (.*)$/.exec(line);
    if (latexWarn) {
      let msg = latexWarn[1];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() && /^\s*\(\S+\)\s+/.test(lines[j])) {
        msg += ' ' + lines[j].replace(/^\s*\(\S+\)\s+/, '').trim();
        j++;
      }
      if (j < lines.length && lines[j].trim() && !/^\s*\(/.test(lines[j]) && !/Warning|Error|^\[/.test(lines[j]) && !msg.endsWith('.')) {
        msg += ' ' + lines[j].trim();
      }
      const ln = /on input line (\d+)/.exec(msg);
      // Harmless without a second pass (only affects PDF bookmarks).
      const benign = /Rerun to get outlines right|Rerun to get cross-references right|Label\(s\) may have changed/.test(msg);
      push({
        severity: benign ? 'info' : 'warning',
        file: currentFile,
        line: ln ? Number(ln[1]) : undefined,
        message: msg.replace(/\s*on input line \d+\.?/, '').trim(),
        hint: warningHint(msg),
      });
      continue;
    }

    const box = /^(Overfull|Underfull) \\([hv])box (\([^)]*\)) .*?(?:at lines? (\d+)(?:--\d+)?)?$/.exec(line);
    if (box) {
      const over = box[1] === 'Overfull';
      const pt = Number(/([\d.]+)pt too (?:wide|high)/.exec(box[3])?.[1] ?? NaN);
      // A line that sticks out by less than TINY_OVERFULL is invisible in print: list it with the bad boxes.
      const tiny = over && pt <= TINY_OVERFULL_PT;
      push({
        severity: over && !tiny ? 'warning' : 'info',
        file: currentFile,
        line: box[4] ? Number(box[4]) : undefined,
        message: `${box[1]} box ${box[3]}`,
        hint: over && Number.isFinite(pt) ? overfullHint(box[2] as 'h' | 'v', pt) : undefined,
      });
    }
  }
  return out;
}

/** Overfull boxes up to this size (about 0.35 mm) can't be seen, so they aren't counted as warnings. */
export const TINY_OVERFULL_PT = 1;

const mm = (pt: number) => (pt * 0.3515).toFixed(pt < 3 ? 2 : 1);

function overfullHint(kind: 'h' | 'v', pt: number): string {
  if (kind === 'v') return `Something on the page is ${pt}pt (${mm(pt)} mm) taller than the space for it, often a page that is too full. Check the bottom of that page in the PDF.`;
  if (pt <= TINY_OVERFULL_PT) return `A line sticks out past the margin by ${mm(pt)} mm. That's too little to see; common in dense resumes and safe to ignore.`;
  return `A line runs ${mm(pt)} mm past the right margin. Look at that line in the PDF: if it shows, reword it or let it break (e.g. a long URL).`;
}

/** Plain-language notes for common warnings. */
export function warningHint(msg: string): string | undefined {
  if (/shell[- ]?escape|write18/i.test(msg)) {
    return 'Some packages (epstopdf, svg, minted, gnuplottex) run other programs during a compile; that is called shell escape. A browser can’t run programs, so it is always off in texChef. Harmless unless the document uses .eps or .svg images or minted code: convert those images to .pdf or .png and upload them instead.';
  }
  const skip = /\\(footskip|headheight) is too small \(([\d.]+)pt\): Make it at least ([\d.]+)pt/.exec(msg);
  if (skip) {
    const what = skip[1] === 'footskip' ? 'footer' : 'header';
    return `From the fancyhdr package: the page ${what} is ${skip[3]}pt tall but only ${skip[2]}pt is set aside for it. fancyhdr makes room itself after the first page, so usually nothing visible changes; to silence it, add \\setlength{\\${skip[1]}}{${skip[3]}pt} near \\pagestyle.`;
  }
  return undefined;
}
