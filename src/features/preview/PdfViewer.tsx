import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Minus, Plus, Maximize2, Download } from 'lucide-react';
import { Util } from 'pdfjs-dist';
import { openPdf, type LoadedPdf } from '@/compile/pdf';
import type { SyncRect } from '@/compile/synctex';
import type { PdfTextItem } from '@/pdfedit/locate';
import { Button, Spinner, Tip } from '@/components/ui';
import { cn } from '@/lib/utils';

/** What an overlay needs to draw on a page: sizes in PDF points, `k` = CSS pixels per point. */
export interface PageInfo {
  page: number;
  pw: number;
  ph: number;
  k: number;
  items: PdfTextItem[];
}

interface Props {
  pdf?: Uint8Array;
  className?: string;
  /** Show the zoom toolbar. */
  toolbar?: boolean;
  onDownload?: () => void;
  emptyMessage?: React.ReactNode;
  running?: boolean;
  pages?: number;
  /** Double-click on a page (coordinates in PDF points, top-left origin). */
  onSyncClick?: (p: { page: number; x: number; y: number }) => void;
  /** Boxes to flash (e.g. "locate cursor in PDF"); a new array re-triggers the flash and scroll. */
  highlights?: SyncRect[];
  /** Extra controls for the toolbar. */
  actions?: React.ReactNode;
  /** A strip shown under the toolbar. */
  banner?: React.ReactNode;
  /** Drawn over each page (positioned absolutely over it). */
  pageOverlay?: (page: PageInfo) => React.ReactNode;
}

interface RenderedPage {
  page: number;
  pw: number;
  ph: number;
  cssW: number;
  cssH: number;
  canvas: HTMLCanvasElement;
  items: PdfTextItem[];
}

function drawHighlights(target: HTMLElement, rects: SyncRect[], scrollIntoView: boolean) {
  target.querySelectorAll('.sync-hl').forEach((el) => el.remove());
  let first: HTMLElement | null = null;
  for (const r of rects) {
    const wrap = target.querySelector<HTMLElement>(`[data-page="${r.page}"]`);
    if (!wrap) continue;
    const k = wrap.clientWidth / Number(wrap.dataset.pw);
    const el = document.createElement('div');
    el.className = 'sync-hl';
    el.style.left = `${r.x * k - 2}px`;
    el.style.top = `${r.y * k - 2}px`;
    el.style.width = `${r.w * k + 4}px`;
    el.style.height = `${r.h * k + 4}px`;
    wrap.appendChild(el);
    first ??= el;
  }
  if (scrollIntoView && first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** Text runs of a page in PDF points (top-left origin); rotated text is skipped. */
async function textItems(page: Awaited<ReturnType<LoadedPdf['doc']['getPage']>>, transform: number[]): Promise<PdfTextItem[]> {
  const tc = await page.getTextContent();
  const out: PdfTextItem[] = [];
  for (const it of tc.items) {
    if (!('str' in it) || !it.str.trim()) continue;
    const m = Util.transform(transform, it.transform);
    if (Math.abs(m[1]) > 0.01 || Math.abs(m[2]) > 0.01) continue;
    const size = Math.abs(m[3]);
    if (!size) continue;
    const style = tc.styles[it.fontName];
    const ascent = style?.ascent || 0.8;
    const descent = style?.descent || -0.2;
    out.push({ str: it.str, x: m[4], w: it.width, base: m[5], y: m[5] - size * ascent, h: size * (ascent - descent) });
  }
  return out;
}

function CanvasSlot({ canvas }: { canvas: HTMLCanvasElement }) {
  return <div ref={(el) => void (el && el.firstChild !== canvas && el.replaceChildren(canvas))} />;
}

/** Renders every page of a PDF to canvases, keeping the scroll position across recompiles. */
export function PdfViewer({ pdf, className, toolbar = true, onDownload, emptyMessage, running, pages, onSyncClick, highlights, actions, banner, pageOverlay }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [width, setWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState<RenderedPage[]>([]);
  const highlightRef = useRef<{ rects: SyncRect[]; at: number } | null>(null);
  const scrollTopRef = useRef(0);

  useEffect(() => {
    if (!highlights?.length) return;
    highlightRef.current = { rects: highlights, at: Date.now() };
    if (container.current) drawHighlights(container.current, highlights, true);
  }, [highlights]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || width === 0) return;
    let cancelled = false;
    let loaded: LoadedPdf | undefined;
    (async () => {
      try {
        loaded = await openPdf(pdf);
        if (cancelled) return;
        const { doc } = loaded;
        const dpr = window.devicePixelRatio || 1;
        const out: RenderedPage[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const cssScale = zoom === 'fit' ? Math.max(0.2, (width - 32) / base.width) : zoom;
          const viewport = page.getViewport({ scale: cssScale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const cssW = Math.floor(viewport.width / dpr);
          const cssH = Math.floor(viewport.height / dpr);
          canvas.style.width = `${cssW}px`;
          canvas.style.height = `${cssH}px`;
          canvas.className = 'pdf-page block';
          await page.render({ canvas, viewport }).promise;
          const items = await textItems(page, base.transform).catch(() => []);
          if (cancelled) return;
          out.push({ page: i, pw: base.width, ph: base.height, cssW, cssH, canvas, items });
        }
        // Swap in all pages at once to avoid flicker.
        scrollTopRef.current = scroller.current?.scrollTop ?? 0;
        setRendered(out);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        loaded?.destroy();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, width, zoom]);

  useLayoutEffect(() => {
    if (!rendered.length) return;
    if (scroller.current) scroller.current.scrollTop = scrollTopRef.current;
    // Keep a highlight that is still fading in place across a re-render.
    const h = highlightRef.current;
    if (h && container.current && Date.now() - h.at < 2000) drawHighlights(container.current, h.rects, false);
  }, [rendered]);

  const currentScale = typeof zoom === 'number' ? zoom : 1;

  return (
    <div className={cn('relative flex h-full min-h-0 flex-col bg-subtle', className)}>
      {toolbar && (
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
          <Tip content="Zoom out">
            <Button size="icon-sm" variant="ghost" onClick={() => setZoom(Math.max(0.3, currentScale - 0.15))} aria-label="Zoom out">
              <Minus className="size-3.5" />
            </Button>
          </Tip>
          <span className="w-12 text-center text-xs text-muted tabular-nums">{zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`}</span>
          <Tip content="Zoom in">
            <Button size="icon-sm" variant="ghost" onClick={() => setZoom(currentScale + 0.15)} aria-label="Zoom in">
              <Plus className="size-3.5" />
            </Button>
          </Tip>
          <Tip content="Fit width">
            <Button size="icon-sm" variant="ghost" onClick={() => setZoom('fit')} aria-label="Fit width">
              <Maximize2 className="size-3.5" />
            </Button>
          </Tip>
          <div className="flex-1" />
          {actions}
          {pages !== undefined && (
            <span className={cn('text-xs tabular-nums', pages > 1 ? 'text-muted' : 'text-ok')} data-testid="page-count">
              {pages} {pages === 1 ? 'page' : 'pages'}
            </span>
          )}
          {running && <Spinner className="ml-2 text-accent" />}
          {onDownload && pdf && (
            <Tip content="Download PDF">
              <Button size="icon-sm" variant="ghost" onClick={onDownload} aria-label="Download PDF">
                <Download className="size-3.5" />
              </Button>
            </Tip>
          )}
        </div>
      )}
      {banner}
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-auto px-4 pt-4"
        data-testid="pdf-viewer"
        onDoubleClick={(e) => {
          const wrap = (e.target as HTMLElement).closest<HTMLElement>('[data-page]');
          if (!wrap || !onSyncClick) return;
          const rect = wrap.getBoundingClientRect();
          const pw = Number(wrap.dataset.pw);
          const ph = Number(wrap.dataset.ph);
          onSyncClick({
            page: Number(wrap.dataset.page),
            x: ((e.clientX - rect.left) / rect.width) * pw,
            y: ((e.clientY - rect.top) / rect.height) * ph,
          });
        }}
      >
        {!pdf && (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            {running ? (
              <span className="flex items-center gap-2">
                <Spinner /> Compiling…
              </span>
            ) : (
              emptyMessage ?? 'No PDF yet'
            )}
          </div>
        )}
        {error && <div className="mb-2 rounded-md bg-danger-soft p-2 text-xs text-danger">Could not render PDF: {error}</div>}
        <div ref={container} className={cn('pb-4', !pdf && 'hidden')}>
          {rendered.map((p) => (
            <div key={p.page} className="relative mx-auto mb-4" style={{ width: p.cssW, height: p.cssH }} data-page={p.page} data-pw={p.pw} data-ph={p.ph}>
              <CanvasSlot canvas={p.canvas} />
              {pageOverlay?.({ page: p.page, pw: p.pw, ph: p.ph, k: p.cssW / p.pw, items: p.items })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
