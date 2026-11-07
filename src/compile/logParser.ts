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
      });
      continue;
    }

    const box = /^(Overfull|Underfull) \\[hv]box (\([^)]*\)) .*?(?:at lines? (\d+)(?:--\d+)?)?$/.exec(line);
    if (box) {
      push({
        severity: box[1] === 'Overfull' ? 'warning' : 'info',
        file: currentFile,
        line: box[3] ? Number(box[3]) : undefined,
        message: `${box[1]} box ${box[2]}`,
      });
    }
  }
  return out;
}
