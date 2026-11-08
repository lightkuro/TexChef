import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, X } from 'lucide-react';
import { ActionDropdown } from '@/components/ActionMenu';
import { Tip } from '@/components/ui';
import { cn } from '@/lib/utils';

const key = (docId: string) => `rc-tabs:${docId}`;

function loadTabs(docId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(docId)) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);

/**
 * The bar above the editor. With one file it just names it; with several, open files are tabs (like
 * Overleaf) and “+” opens another. `right` sits at the right end (the formatting toggle).
 */
export function FileTabs({
  docId,
  files,
  mainFile,
  active,
  onOpen,
  right,
}: {
  docId: string;
  /** Files that can open in the editor (text files and images), sorted. */
  files: string[];
  mainFile: string;
  active: string;
  onOpen: (path: string) => void;
  right?: React.ReactNode;
}) {
  const [tabs, setTabs] = useState<string[]>(() => loadTabs(docId));
  // Whatever file opens (from the file list, a problem, the PDF) becomes a tab and stays one.
  useEffect(() => {
    if (active) setTabs((t) => (t.includes(active) ? t : [...t, active]));
  }, [active]);
  // Files that were deleted or renamed drop out.
  const shown = useMemo(() => {
    const list = tabs.filter((t) => files.includes(t));
    if (active && !list.includes(active)) list.push(active);
    return list;
  }, [tabs, files, active]);
  useEffect(() => {
    try {
      localStorage.setItem(key(docId), JSON.stringify(shown));
    } catch {
      /* storage unavailable */
    }
  }, [docId, shown]);
  const close = (p: string) => {
    const i = shown.indexOf(p);
    const rest = shown.filter((t) => t !== p);
    setTabs(rest);
    if (p === active && rest.length) onOpen(rest[Math.max(0, i - 1)]);
  };
  const others = files.filter((f) => !shown.includes(f));
  const many = files.length > 1;

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-panel pr-1 text-xs" data-testid="file-tabs">
      {!many ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-muted">
          <span className="truncate font-mono text-fg">{active}</span>
          {active === mainFile && <span className="shrink-0">main file</span>}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Open files">
          {shown.map((p) => (
            <div
              key={p}
              role="tab"
              aria-selected={p === active}
              className={cn(
                'group flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-line pr-1.5 pl-3',
                p === active ? 'bg-bg/60 text-fg shadow-[inset_0_-2px_0_var(--accent)]' : 'text-muted hover:bg-subtle hover:text-fg',
              )}
              onClick={() => onOpen(p)}
              onAuxClick={(e) => e.button === 1 && shown.length > 1 && close(p)}
              title={p}
              data-testid={`tab-file-${p}`}
            >
              <span className="max-w-44 truncate font-mono">{base(p)}</span>
              {p === mainFile && <span className="rounded bg-subtle px-1 text-[10px] text-muted">main</span>}
              <button
                className={cn('rounded p-0.5 hover:bg-line', shown.length > 1 ? 'opacity-0 group-hover:opacity-100 focus:opacity-100' : 'invisible')}
                onClick={(e) => {
                  e.stopPropagation();
                  close(p);
                }}
                aria-label={`Close ${p}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {others.length > 0 && (
            <ActionDropdown
              align="start"
              label="Open a file"
              actions={others.map((f) => ({ key: f, label: <span className="font-mono text-xs">{f}</span>, icon: <FileText className="size-4" />, run: () => onOpen(f), testId: `open-file-${f}` }))}
              trigger={
                <button className="flex shrink-0 items-center px-2 text-muted hover:bg-subtle hover:text-fg" aria-label="Open another file" title="Open another file" data-testid="open-file-tab">
                  <Plus className="size-3.5" />
                </button>
              }
            />
          )}
        </div>
      )}
      {right && <div className="flex shrink-0 items-center gap-1 pl-1">{right}</div>}
    </div>
  );
}

/** The small button at the right of the file bar that shows or hides the formatting bar. */
export function FormatToggle({ on, visual, onToggle }: { on: boolean; visual: boolean; onToggle: () => void }) {
  return (
    <Tip content={on ? 'Hide the formatting bar' : visual ? 'Formatting bar (visual mode is on)' : 'Formatting bar and visual mode'}>
      <button
        onClick={onToggle}
        aria-pressed={on}
        aria-label="Formatting bar"
        className={cn('flex h-7 items-center gap-1 rounded-md px-2 font-medium', on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle hover:text-fg')}
        data-testid="toggle-format-bar"
      >
        <span className="font-serif text-[13px] leading-none italic">Aa</span>
        {visual && !on && <span className="text-[10px] tracking-wide uppercase">Visual</span>}
      </button>
    </Tip>
  );
}
