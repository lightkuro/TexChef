import { ArrowUp, ChevronRight, Files, FolderTree, LayoutGrid } from 'lucide-react';
import { Tip } from '@/components/ui';
import { cn } from '@/lib/utils';
import { inFolder, parentFolder } from './folderTree';
import { useDocDrop } from './FolderSidebar';
import type { FolderMode } from './folderView';

/** Where you are (All documents › Jobs › 2026), with the way up, and how folders are shown. */
export function FolderBar({
  current,
  onSelect,
  mode,
  onMode,
  extra,
}: {
  current: string | null;
  onSelect: (f: string | null) => void;
  mode: FolderMode;
  onMode: (m: FolderMode) => void;
  extra?: React.ReactNode;
}) {
  const drop = useDocDrop((from, to) => current && inFolder(current, from) && onSelect(to + current.slice(from.length)));
  const parts = current ? current.split('/') : [];
  const crumb = (label: React.ReactNode, path: string | null, key: string, last: boolean) => (
    <button
      key={key}
      onClick={() => onSelect(path)}
      className={cn('flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5', last ? 'font-semibold text-fg' : 'text-muted hover:bg-subtle hover:text-fg', drop.over === key && 'ring-2 ring-accent')}
      {...drop.props(path ?? undefined, key)}
      data-testid={`crumb-${path ?? 'all'}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-panel/80 px-3 text-sm" data-testid="folder-bar">
      <Tip content="Up one folder">
        <button
          className="rounded p-1 text-muted hover:bg-subtle hover:text-fg disabled:opacity-30"
          disabled={!current}
          onClick={() => onSelect(current ? (parentFolder(current) ?? null) : null)}
          aria-label="Up one folder"
          data-testid="folder-up"
        >
          <ArrowUp className="size-4" />
        </button>
      </Tip>
      <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden" aria-label="Folder path">
        {crumb(
          <>
            <Files className="size-3.5 shrink-0" /> All documents
          </>,
          null,
          'all',
          parts.length === 0,
        )}
        {parts.map((p, i) => (
          <span key={i} className="flex min-w-0 items-center gap-0.5">
            <ChevronRight className="size-3.5 shrink-0 text-muted" />
            {crumb(<span className="truncate">{p}</span>, parts.slice(0, i + 1).join('/'), `c${i}`, i === parts.length - 1)}
          </span>
        ))}
      </nav>
      {extra}
      <div className="inline-flex shrink-0 rounded-lg bg-subtle p-0.5 text-xs font-medium">
        <Tip content="Show every document inside, including those in subfolders, grouped by folder">
          <button
            onClick={() => onMode('grouped')}
            className={cn('flex h-6 items-center gap-1.5 rounded-md px-2', mode === 'grouped' ? 'bg-panel shadow-sm' : 'text-muted')}
            aria-pressed={mode === 'grouped'}
            data-testid="folder-mode-grouped"
          >
            <FolderTree className="size-3.5" /> Expanded
          </button>
        </Tip>
        <Tip content="Show subfolders as folders; open one to see what's inside">
          <button
            onClick={() => onMode('browse')}
            className={cn('flex h-6 items-center gap-1.5 rounded-md px-2', mode === 'browse' ? 'bg-panel shadow-sm' : 'text-muted')}
            aria-pressed={mode === 'browse'}
            data-testid="folder-mode-browse"
          >
            <LayoutGrid className="size-3.5" /> Folders
          </button>
        </Tip>
      </div>
    </div>
  );
}
