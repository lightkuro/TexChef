import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, CornerDownLeft, FileSearch, Type, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PageInfo } from '@/features/preview/PdfViewer';
import { pdfToSource, type SyncData } from '@/compile/synctex';
import { alnum, displayText, project } from '@/pdfedit/latexText';
import { findInSources, groupLines, indexSource, lineAt, lineKey, lineOf, pickUnit, union, keyIndexAt, type PdfLine, type PdfTextItem, type Rect } from '@/pdfedit/locate';
import { applyPlainEdit, applyRawEdit, unitPlainText, type SourceChange } from '@/pdfedit/applyEdit';
import { locateInOriginal } from '@/variants/ops';
import { Button, Checkbox } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface PdfEditOptions {
  enabled: boolean;
  /** The PDF on screen. */
  pdf: Uint8Array | undefined;
  /** Whether that PDF was compiled from the current text (so every edit shows in it). */
  upToDate: boolean;
  sync: SyncData | null;
  /** Current .tex sources of the document (unsaved typing included). */
  readSources: () => Promise<Record<string, string>>;
  /** Write a change to one file of the document. */
  writeChange: (path: string, change: SourceChange, oldText: string) => Promise<void>;
  showInSource: (path: string, from: number, to: number) => void;
  /** The document this variant was made from, to offer "also change it there". */
  original?: { id: string; name: string; readText: (path: string) => Promise<string | undefined> };
  applyToOriginal?: (path: string, variantText: string, unitStart: number, oldText: string, newText: string) => Promise<boolean>;
  revertOriginal?: (path: string, oldText: string, newText: string) => Promise<void>;
  /** Leave edit mode (Esc with no edit box open). */
  onExit: () => void;
  /** Recompile after each saved change. */
  autoUpdate?: boolean;
  /** Called after a change (and any change to the original) has been written. */
  onSaved?: () => void;
}

interface Session {
  page: number;
  rects: Rect[];
  file: string;
  start: number;
  end: number;
  /** Source of the unit when the box opened. */
  original: string;
  before: string;
  after: string;
  plain: string;
  caret: number;
  hasLinks: boolean;
  hasRaw: boolean;
  line: number;
  /** Whether the same text exists once in the original document. */
  inOriginal: boolean;
}

interface Notice {
  page: number;
  rect: Rect;
  message: string;
  source?: { file: string; line: number };
}

interface Pending {
  id: number;
  page: number;
  rects: Rect[];
  file: string;
  start: number;
  unitText: string;
}

const linesCache = new WeakMap<PdfTextItem[], PdfLine[]>();
function linesOf(items: PdfTextItem[]): PdfLine[] {
  let l = linesCache.get(items);
  if (!l) linesCache.set(items, (l = groupLines(items)));
  return l;
}

/** Highlight boxes for a unit: matching runs on the clicked line, plus whole neighbouring lines it continues onto. */
function unitRects(lines: PdfLine[], line: PdfLine, unitKey: string): Rect[] {
  const inUnit = (it: PdfTextItem) => {
    const a = alnum(it.str);
    return a.length > 0 && unitKey.includes(a);
  };
  const first = line.items.filter(inUnit);
  const rects: Rect[] = [first.length ? union(first) : line];
  const li = lines.indexOf(line);
  for (const dir of [-1, 1]) {
    let prev = line;
    for (let j = li + dir; j >= 0 && j < lines.length; j += dir) {
      const l = lines[j];
      const gap = dir < 0 ? prev.y - (l.y + l.h) : l.y - (prev.y + prev.h);
      const key = lineKey(l).key;
      if (gap > Math.max(l.h, prev.h) * 0.9 || key.length < 3 || !unitKey.includes(key)) break;
      rects.push(union(l.items.filter(inUnit).length ? l.items.filter(inUnit) : l.items));
      prev = l;
    }
  }
  return rects;
}

export function usePdfEdit(opts: PdfEditOptions) {
  const o = useRef(opts);
  o.current = opts;
  const [hover, setHover] = useState<{ page: number; rect: Rect } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [alsoOriginal, setAlsoOriginal] = useState(false);
  const nextId = useRef(1);

  // Once the PDF is compiled from the current text, the "not in the PDF yet" markers go. An open
  // edit box stays: it works on the source, not on the picture.
  useEffect(() => {
    setNotice(null);
    setHover(null);
  }, [opts.pdf]);
  useEffect(() => {
    if (opts.upToDate) setPending([]);
  }, [opts.pdf, opts.upToDate]);

  useEffect(() => {
    if (!opts.enabled) {
      setSession(null);
      setNotice(null);
      setHover(null);
    }
  }, [opts.enabled]);

  useEffect(() => {
    if (!opts.enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (session || notice) {
        setSession(null);
        setNotice(null);
      } else if (!(e.target as HTMLElement)?.closest?.('.cm-editor')) o.current.onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts.enabled, session, notice]);

  const openUnit = useCallback(async (page: number, rects: Rect[], file: string, src: string, start: number, end: number, clickOffset?: number) => {
    const plain = unitPlainText(src, start, end, clickOffset);
    const original = src.slice(start, end);
    const s: Session = {
      page,
      rects,
      file,
      start,
      end,
      original,
      before: src.slice(0, start),
      after: src.slice(end),
      plain: plain.text,
      caret: plain.caret,
      hasLinks: plain.hasLinks,
      hasRaw: plain.hasRaw,
      line: lineOf(indexSource(src), start),
      inOriginal: false,
    };
    setNotice(null);
    setSession(s);
    const orig = o.current.original;
    if (orig) {
      const text = await orig.readText(file).catch(() => undefined);
      if (text !== undefined && locateInOriginal(src, start, original, text) !== undefined) {
        setSession((cur) => (cur && cur.start === start && cur.file === file ? { ...cur, inOriginal: true } : cur));
      }
    }
  }, []);

  const onPageClick = useCallback(
    async (info: PageInfo, x: number, y: number) => {
      const lines = linesOf(info.items);
      const line = lineAt(lines, x, y);
      if (!line) {
        setSession(null);
        setNotice(null);
        return;
      }
      const sources = await o.current.readSources();
      // Clicked something edited since the last compile: reopen that edit.
      const p = pending.find((q) => q.page === info.page && q.rects.some((r) => x >= r.x - 1 && x <= r.x + r.w + 1 && y >= r.y - 1 && y <= r.y + r.h + 1));
      if (p) {
        const src = sources[p.file];
        if (src !== undefined) {
          let at = src.slice(p.start, p.start + p.unitText.length) === p.unitText ? p.start : src.indexOf(p.unitText, Math.max(0, p.start - 400));
          if (at < 0) at = src.indexOf(p.unitText);
          if (at >= 0) return openUnit(info.page, p.rects, p.file, src, at, at + p.unitText.length);
        }
      }
      const { key, at } = lineKey(line);
      const k = keyIndexAt(line, at, x);
      const sync = o.current.sync;
      const hint = sync ? pdfToSource(sync, info.page, x, y) : undefined;
      const hit = findInSources(sources, key, k, hint && sources[hint.file] !== undefined ? hint : undefined);
      const unit = hit ? pickUnit(sources[hit.file], hit.file, hit.offset) : undefined;
      if (!hit || !unit) {
        setSession(null);
        setNotice({
          page: info.page,
          rect: line,
          message: hint
            ? 'This text isn’t typed in your document. It comes from the template or a command’s definition, so change it in the source.'
            : 'Couldn’t find this text in your document. Use Update PDF if you just changed it, or edit it in the source.',
          source: hint && sources[hint.file] !== undefined ? hint : undefined,
        });
        return;
      }
      const src = sources[hit.file];
      const unitKey = alnum(displayText(project(src, unit.start, unit.end)));
      await openUnit(info.page, unitRects(lines, line, unitKey), unit.file, src, unit.start, unit.end, hit.offset);
    },
    [openUnit, pending],
  );

  const save = useCallback(
    async (value: string, mode: 'text' | 'latex', also: boolean) => {
      const s = session;
      if (!s) return;
      let newUnit: string;
      try {
        if (mode === 'latex') newUnit = applyRawEdit(s.original, 0, s.original.length, value)?.unitText ?? s.original;
        else {
          const full = s.before + s.original + s.after;
          newUnit = applyPlainEdit(full, s.before.length, s.before.length + s.original.length, value)?.unitText ?? s.original;
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        return;
      }
      setSession(null);
      if (newUnit === s.original) return;
      const sources = await o.current.readSources();
      const src = sources[s.file];
      if (src === undefined) return;
      // The source may have moved since the box opened (typing in the editor): find the unit again.
      let at = src.slice(s.start, s.end) === s.original ? s.start : src.indexOf(s.original, Math.max(0, s.start - 400));
      if (at < 0) at = src.indexOf(s.original);
      if (at < 0) {
        toast.error('This text changed while you were editing it. Click it again to edit the new version.');
        return;
      }
      const change: SourceChange = { from: at, to: at + s.original.length, insert: newUnit };
      await o.current.writeChange(s.file, change, src);
      const delta = newUnit.length - s.original.length;
      setPending((list) => [
        ...list
          .filter((q) => !(q.file === s.file && q.start >= at && q.start <= at + s.original.length))
          .map((q) => (q.file === s.file && q.start > at ? { ...q, start: q.start + delta } : q)),
        { id: nextId.current++, page: s.page, rects: s.rects, file: s.file, start: at, unitText: newUnit },
      ]);
      let alsoDone = false;
      if (also && s.inOriginal && o.current.applyToOriginal) alsoDone = await o.current.applyToOriginal(s.file, src, at, s.original, newUnit);
      const name = o.current.original?.name;
      o.current.onSaved?.();
      toast.success(alsoDone ? `Changed here and in “${name}”` : 'Text changed', {
        description: o.current.autoUpdate ? 'Updating the PDF…' : 'The PDF updates when you click Update PDF.',
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: async () => {
            const now = (await o.current.readSources())[s.file];
            if (now === undefined) return;
            const pos = now.slice(at, at + newUnit.length) === newUnit ? at : now.indexOf(newUnit);
            if (pos < 0) return;
            await o.current.writeChange(s.file, { from: pos, to: pos + newUnit.length, insert: s.original }, now);
            if (alsoDone) await o.current.revertOriginal?.(s.file, s.original, newUnit);
            setPending((list) => list.filter((q) => !(q.file === s.file && q.unitText === newUnit)));
          },
        },
      });
    },
    [session],
  );

  const renderPage = useCallback(
    (info: PageInfo) => {
      if (!opts.enabled) return null;
      const k = info.k;
      const box = (r: Rect, pad = 1.5) => ({ left: (r.x - pad) * k, top: (r.y - pad) * k, width: (r.w + pad * 2) * k, height: (r.h + pad * 2) * k });
      const toPt = (e: React.MouseEvent) => {
        const el = e.currentTarget.getBoundingClientRect();
        return { x: (e.clientX - el.left) / k, y: (e.clientY - el.top) / k };
      };
      return (
        <div
          className="absolute inset-0 z-10 cursor-text"
          data-testid={`pdf-edit-layer-${info.page}`}
          onMouseMove={(e) => {
            const { x, y } = toPt(e);
            const line = lineAt(linesOf(info.items), x, y);
            setHover(line ? { page: info.page, rect: line } : null);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const { x, y } = toPt(e);
            void onPageClick(info, x, y);
          }}
        >
          {pending
            .filter((p) => p.page === info.page)
            .map((p) =>
              p.rects.map((r, i) => (
                <div key={`${p.id}-${i}`} className="pointer-events-none absolute rounded-[3px] border border-dashed border-warn bg-warn/10" style={box(r)} data-testid="pdf-edit-pending">
                  {i === 0 && <span className="absolute -top-2 -right-1 rounded bg-warn px-1 text-[9px] leading-3 font-semibold text-white">edited</span>}
                </div>
              )),
            )}
          {hover?.page === info.page && !session && (
            <div className="pointer-events-none absolute rounded-[3px] bg-accent/10 ring-1 ring-accent/40" style={box(hover.rect)} />
          )}
          {session?.page === info.page &&
            session.rects.map((r, i) => <div key={i} className="pointer-events-none absolute rounded-[3px] bg-accent/15 ring-2 ring-accent" style={box(r)} />)}
          {session?.page === info.page && (
            <EditBox
              key={`${session.file}:${session.start}`}
              session={session}
              info={info}
              originalName={opts.original?.name}
              also={alsoOriginal}
              onAlso={setAlsoOriginal}
              onCancel={() => setSession(null)}
              onSave={save}
              onShowSource={() => {
                o.current.showInSource(session.file, session.start, session.end);
                setSession(null);
              }}
            />
          )}
          {notice?.page === info.page && (
            <Popover info={info} anchor={notice.rect} width={300}>
              <p className="text-xs leading-relaxed">{notice.message}</p>
              <div className="mt-2 flex justify-end gap-1">
                {notice.source && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const src = notice.source!;
                      void o.current.readSources().then((all) => {
                        const text = all[src.file] ?? '';
                        const lines = text.split('\n');
                        const from = lines.slice(0, src.line - 1).join('\n').length + (src.line > 1 ? 1 : 0);
                        o.current.showInSource(src.file, from, from + (lines[src.line - 1]?.length ?? 0));
                      });
                      setNotice(null);
                    }}
                  >
                    <FileSearch className="size-3.5" /> Show in source
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>
                  Close
                </Button>
              </div>
            </Popover>
          )}
        </div>
      );
    },
    [opts.enabled, opts.original?.name, pending, hover, session, notice, alsoOriginal, onPageClick, save],
  );

  return { renderPage, pendingCount: pending.length, close: () => (setSession(null), setNotice(null)) };
}

/** A card attached below (or above) a box on the page. */
function Popover({ info, anchor, width, children, testId }: { info: PageInfo; anchor: Rect; width: number; children: React.ReactNode; testId?: string }) {
  const k = info.k;
  const pageW = info.pw * k;
  const pageH = info.ph * k;
  const w = Math.min(pageW - 16, Math.max(width, anchor.w * k + 24));
  const left = Math.max(8, Math.min(anchor.x * k - 12, pageW - w - 8));
  const below = (anchor.y + anchor.h) * k + 8;
  const placeAbove = below + 200 > pageH && anchor.y * k > 220;
  return (
    <div
      className="absolute z-30 rounded-lg border border-line bg-panel p-2.5 text-fg shadow-xl"
      style={{ left, width: w, ...(placeAbove ? { bottom: pageH - anchor.y * k + 8 } : { top: below }) }}
      onClick={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

function EditBox({
  session,
  info,
  originalName,
  also,
  onAlso,
  onCancel,
  onSave,
  onShowSource,
}: {
  session: Session;
  info: PageInfo;
  originalName?: string;
  also: boolean;
  onAlso: (v: boolean) => void;
  onCancel: () => void;
  onSave: (value: string, mode: 'text' | 'latex', also: boolean) => void;
  onShowSource: () => void;
}) {
  const [mode, setMode] = useState<'text' | 'latex'>('text');
  // LaTeX typed in the LaTeX tab becomes the base the plain text is shown from.
  const [base, setBase] = useState(session.original);
  const [value, setValue] = useState(session.plain);
  const [error, setError] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const anchor = useMemo(() => union(session.rects), [session.rects]);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(session.caret, session.caret);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(240, el.scrollHeight + 2)}px`;
  }, [value, mode]);

  const currentLatex = (): string => {
    if (mode === 'latex') return value;
    const full = session.before + base + session.after;
    return applyPlainEdit(full, session.before.length, session.before.length + base.length, value)?.unitText ?? base;
  };

  const switchTo = (next: 'text' | 'latex') => {
    if (next === mode) return;
    setError(null);
    if (next === 'latex') {
      setValue(currentLatex());
    } else {
      setBase(value);
      setValue(displayText(project(value)));
    }
    setMode(next);
    requestAnimationFrame(() => ta.current?.focus());
  };

  const submit = () => {
    try {
      const latex = currentLatex();
      if (mode === 'latex') applyRawEdit(session.original, 0, session.original.length, latex);
      onSave(latex, 'latex', also);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Popover info={info} anchor={anchor} width={360} testId="pdf-edit-box">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="flex rounded-md bg-subtle p-0.5 text-[11px] font-medium">
          <button
            className={cn('flex items-center gap-1 rounded px-2 py-0.5', mode === 'text' ? 'bg-panel shadow-sm' : 'text-muted hover:text-fg')}
            onClick={() => switchTo('text')}
            data-testid="pdf-edit-mode-text"
          >
            <Type className="size-3" /> Text
          </button>
          <button
            className={cn('flex items-center gap-1 rounded px-2 py-0.5', mode === 'latex' ? 'bg-panel shadow-sm' : 'text-muted hover:text-fg')}
            onClick={() => switchTo('latex')}
            data-testid="pdf-edit-mode-latex"
          >
            <Code2 className="size-3" /> LaTeX
          </button>
        </div>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
          {session.file} · line {session.line}
        </span>
        <button className="rounded p-0.5 text-muted hover:bg-subtle hover:text-fg" onClick={onCancel} aria-label="Cancel">
          <X className="size-3.5" />
        </button>
      </div>
      <textarea
        ref={ta}
        value={value}
        spellCheck={mode === 'text'}
        onChange={(e) => {
          setError(null);
          setValue(mode === 'text' ? e.target.value.replace(/\n/g, ' ') : e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Enter' && (mode === 'text' ? !e.shiftKey : e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Enter' && mode === 'text') e.preventDefault();
        }}
        className={cn(
          'block w-full resize-none rounded-md border border-line bg-bg px-2 py-1.5 leading-snug focus:border-accent focus:outline-none',
          mode === 'text' ? 'text-[13px]' : 'font-mono text-[12px]',
        )}
        rows={2}
        aria-label={mode === 'text' ? 'Text' : 'LaTeX source'}
        data-testid="pdf-edit-input"
      />
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
      {mode === 'text' && (session.hasLinks || session.hasRaw) && (
        <p className="mt-1 text-[11px] leading-snug text-muted">
          {session.hasLinks ? 'Link addresses aren’t shown here; ' : ''}
          {session.hasRaw ? 'math and web addresses are shown as written; ' : ''}
          switch to LaTeX to see everything.
        </p>
      )}
      {session.inOriginal && originalName && (
        <label
          className="mt-2 flex cursor-pointer items-center gap-2 text-xs"
          data-testid="pdf-edit-also"
          onKeyDown={(e) => {
            // Enter on the checkbox saves, like in the text box.
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        >
          <Checkbox checked={also} onCheckedChange={onAlso} aria-label={`Also change it in ${originalName}`} />
          <span className="min-w-0 truncate">
            Also change it in <b>{originalName}</b>
          </span>
        </label>
      )}
      <div className="mt-2 flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onShowSource} className="text-muted">
          <FileSearch className="size-3.5" /> Show in source
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={submit} data-testid="pdf-edit-save">
          Save <CornerDownLeft className="size-3" />
        </Button>
      </div>
      <p className="mt-1.5 text-[10.5px] text-muted">
        {mode === 'text' ? 'Enter saves · Esc cancels' : 'Ctrl/⌘ + Enter saves · Esc cancels'}
      </p>
    </Popover>
  );
}
