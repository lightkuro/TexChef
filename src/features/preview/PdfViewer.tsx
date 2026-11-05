import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Maximize2, Download } from 'lucide-react';
import { openPdf, type LoadedPdf } from '@/compile/pdf';
import { Button, Spinner, Tip } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Props {
  pdf?: Uint8Array;
  className?: string;
  /** Show the zoom toolbar. */
  toolbar?: boolean;
  onDownload?: () => void;
  emptyMessage?: React.ReactNode;
  running?: boolean;
  pages?: number;
}

/** Renders every page of a PDF to canvases, keeping the scroll position across recompiles. */
export function PdfViewer({ pdf, className, toolbar = true, onDownload, emptyMessage, running, pages }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [width, setWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !container.current || width === 0) return;
    let cancelled = false;
    let loaded: LoadedPdf | undefined;
    const target = container.current;
    (async () => {
      try {
        loaded = await openPdf(pdf);
        if (cancelled) return;
        const { doc } = loaded;
        const dpr = window.devicePixelRatio || 1;
        const canvases: HTMLCanvasElement[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const cssScale = zoom === 'fit' ? Math.max(0.2, (width - 32) / base.width) : zoom;
          const viewport = page.getViewport({ scale: cssScale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
          canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
          canvas.className = 'pdf-page mx-auto mb-4 block';
          canvas.dataset.page = String(i);
          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;
          canvases.push(canvas);
        }
        // Swap in all pages at once to avoid flicker.
        const scrollTop = scroller.current?.scrollTop ?? 0;
        target.replaceChildren(...canvases);
        if (scroller.current) scroller.current.scrollTop = scrollTop;
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
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto px-4 pt-4" data-testid="pdf-viewer">
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
        <div ref={container} className={cn(!pdf && 'hidden')} />
      </div>
    </div>
  );
}
