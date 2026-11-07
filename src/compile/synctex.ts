import { joinPath, normalizePath } from '@/lib/paths';

/**
 * Minimal SyncTeX reader for click-to-source (PDF → line) and locate-in-PDF (line → boxes).
 * Coordinates are converted to PDF points (bp) with the origin at the top-left of the page.
 */

export interface SyncRecord {
  file: string;
  line: number;
  page: number;
  /** Left edge / baseline in bp. */
  x: number;
  y: number;
  /** Width, height above and depth below the baseline in bp (0 for point records). */
  w: number;
  h: number;
  d: number;
  kind: 'hbox' | 'vbox' | 'void' | 'point';
}

export interface SyncData {
  records: SyncRecord[];
  pages: number;
}

export interface SyncRect {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const RECORD_RE = /^([[(vhxkg$])(\d+),(\d+)(?:,-?\d+)?:(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/;

/**
 * Map a SyncTeX input path to a project-relative path, or null for TeX Live files. TeX runs in the
 * main file's folder, so paths look like ".../project_dir/vision/./main.tex" or "./part.tex".
 */
function projectPath(path: string, baseDir: string): string | null {
  const m = /project_dir\/(.+)$/.exec(path);
  if (m) return normalizePath(m[1]);
  if (path.startsWith('/')) return null;
  return joinPath(baseDir, path);
}

export async function decodeSynctex(bytes: Uint8Array): Promise<string> {
  const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gz) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** `baseDir`: folder of the main file within the project ("" when it is at the top). */
export function parseSynctex(text: string, baseDir = ''): SyncData {
  const inputs = new Map<string, string | null>();
  let unit = 1;
  let mag = 1000;
  let xOff = 0;
  let yOff = 0;
  let page = 0;
  let pages = 0;
  const records: SyncRecord[] = [];
  let content = false;
  for (const line of text.split('\n')) {
    if (!content) {
      if (line.startsWith('Input:')) {
        const [, tag, ...rest] = line.split(':');
        inputs.set(tag, projectPath(rest.join(':'), baseDir));
      } else if (line.startsWith('Unit:')) unit = Number(line.slice(5)) || 1;
      else if (line.startsWith('Magnification:')) mag = Number(line.slice(14)) || 1000;
      else if (line.startsWith('X Offset:')) xOff = Number(line.slice(9)) || 0;
      else if (line.startsWith('Y Offset:')) yOff = Number(line.slice(9)) || 0;
      else if (line.startsWith('Content:')) content = true;
      continue;
    }
    const c = line[0];
    if (c === '{') {
      page = Number(line.slice(1));
      pages = Math.max(pages, page);
      continue;
    }
    if (line.startsWith('Input:')) {
      const [, tag, ...rest] = line.split(':');
      inputs.set(tag, projectPath(rest.join(':'), baseDir));
      continue;
    }
    const m = RECORD_RE.exec(line);
    if (!m) continue;
    const file = inputs.get(m[2]);
    if (!file) continue;
    const k = (unit * mag) / 1000 / 65536 * (72 / 72.27);
    const kind = m[1] === '(' ? 'hbox' : m[1] === '[' ? 'vbox' : m[1] === 'h' || m[1] === 'v' ? 'void' : 'point';
    records.push({
      file,
      line: Number(m[3]),
      page,
      x: Number(m[4]) * k + xOff * k,
      y: Number(m[5]) * k + yOff * k,
      w: m[6] && kind !== 'point' ? Math.abs(Number(m[6])) * k : 0,
      h: m[7] ? Number(m[7]) * k : 0,
      d: m[8] ? Number(m[8]) * k : 0,
      kind,
    });
  }
  return { records, pages };
}

/** Source location for a point on a PDF page (bp, top-left origin). */
export function pdfToSource(data: SyncData, page: number, x: number, y: number): { file: string; line: number } | undefined {
  let best: SyncRecord | undefined;
  let bestScore = Infinity;
  for (const r of data.records) {
    if (r.page !== page || r.kind === 'vbox') continue;
    // Prefer the smallest horizontal box containing the point; otherwise the nearest point on the same text line.
    let score: number;
    const top = r.y - Math.max(r.h, 8);
    const bottom = r.y + Math.max(r.d, 2);
    if (r.kind === 'hbox' && r.w > 0 && x >= r.x && x <= r.x + r.w && y >= top && y <= bottom) {
      score = r.w * 0.001;
    } else {
      const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
      const dx = r.w > 0 ? (x < r.x ? r.x - x : x > r.x + r.w ? x - r.x - r.w : 0) : Math.abs(x - r.x);
      score = 1 + dy * 6 + dx * 0.25;
    }
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best && bestScore < 400 ? { file: best.file, line: best.line } : undefined;
}

/**
 * Boxes in the PDF produced by a source line. Falls back to the nearest earlier line that produced
 * output; with `maxBack`, only if it is at most that many lines up (otherwise nothing).
 */
export function sourceToPdf(data: SyncData, file: string, line: number, maxBack?: number): SyncRect[] {
  const inFile = data.records.filter((r) => r.file === file && r.kind !== 'vbox');
  if (!inFile.length) return [];
  let target = line;
  if (!inFile.some((r) => r.line === line)) {
    const earlier = inFile.filter((r) => r.line < line).map((r) => r.line);
    const later = inFile.filter((r) => r.line > line).map((r) => r.line);
    if (maxBack !== undefined) {
      const near = earlier.length ? Math.max(...earlier) : -Infinity;
      if (line - near > maxBack) return [];
      target = near;
    } else target = earlier.length ? Math.max(...earlier) : Math.min(...later);
  }
  const hits = inFile.filter((r) => r.line === target);
  // Group by page and text line (baseline), then merge into rectangles.
  const groups = new Map<string, SyncRecord[]>();
  for (const r of hits) {
    const key = `${r.page}|${Math.round(r.y)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const rects: SyncRect[] = [];
  for (const rs of groups.values()) {
    const x0 = Math.min(...rs.map((r) => r.x));
    const x1 = Math.max(...rs.map((r) => r.x + r.w));
    const h = Math.max(8, ...rs.map((r) => r.h));
    const d = Math.max(2, ...rs.map((r) => r.d));
    rects.push({ page: rs[0].page, x: x0, y: rs[0].y - h, w: Math.max(x1 - x0, 6), h: h + d });
  }
  return rects.sort((a, b) => a.page - b.page || a.y - b.y).slice(0, 12);
}
