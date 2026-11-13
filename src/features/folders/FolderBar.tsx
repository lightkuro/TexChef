import { Archive, ArrowLeft, ChevronRight, Clock, Files, FolderTree, LayoutGrid, PanelLeft } from 'lucide-react';
import { Tip } from '@/components/ui';
import { cn } from '@/lib/utils';
import { inFolder, parentFolder } from './folderTree';
import { useDocDrop, type SpecialView } from './FolderSidebar';
import type { FolderMode } from './folderView';

/** Where you are (All documents › Jobs › 2026), with the way up, and how folders are shown. */
export function FolderBar({
  current,
  special = null,
  onSelect,
  mode,
  onMode,
  extra,
  folders,
}: {
  current: string | null;
  /** Recent or Archive is open instead of a folder. */
  special?: SpecialView;
  onSelect: (f: string | null) => void;
  /** How subfolders are shown; leave out where that choice doesn't apply (Recent, Archive, the Versions view). */
  mode?: FolderMode;
  onMode?: (m: FolderMode) => void;
  extra?: React.ReactNode;
  /** The button that shows or hides the folders panel. */
  folders?: { shown: boolean; docked: boolean; toggle: () => void };
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
      {folders && (
        <Tip content={folders.docked ? (folders.shown ? 'Hide folders' : 'Show folders') : 'Folders'}>
          <button className="rounded p-1 text-muted hover:bg-subtle hover:text-fg" onClick={folders.toggle} aria-label="Folders" aria-pressed={folders.shown} data-testid="toggle-folders">
            <PanelLeft className="size-4" />
          </button>
        </Tip>
      )}
      <Tip content={special ? 'Back to all documents' : 'Up one folder'}>
        <button
          className="rounded p-1 text-muted hover:bg-subtle hover:text-fg disabled:opacity-30"
          disabled={!current && !special}
          onClick={() => onSelect(current ? (parentFolder(current) ?? null) : null)}
          aria-label={special ? 'Back to all documents' : 'Up one folder'}
          data-testid="folder-up"
        >
          <ArrowLeft className="size-4" />
        </button>
      </Tip>
      <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden" aria-label="Folder path">
        {crumb(
          <>
            <Files className="size-3.5 shrink-0" /> <span className="truncate">All documents</span>
          </>,
          null,
          'all',
          parts.length === 0 && !special,
        )}
        {special && (
          <span className="flex min-w-0 items-center gap-0.5">
            <ChevronRight className="size-3.5 shrink-0 text-muted" />
            <span className="flex items-center gap-1 px-1.5 py-0.5 font-semibold" data-testid={`crumb-${special}`}>
              {special === 'recent' ? <Clock className="size-3.5 shrink-0" /> : <Archive className="size-3.5 shrink-0" />} {special === 'recent' ? 'Recent' : 'Archive'}
            </span>
          </span>
        )}
        {parts.map((p, i) => (
          <span key={i} className="flex min-w-0 items-center gap-0.5">
            <ChevronRight className="size-3.5 shrink-0 text-muted" />
            {crumb(<span className="truncate">{p}</span>, parts.slice(0, i + 1).join('/'), `c${i}`, i === parts.length - 1)}
          </span>
        ))}
      </nav>
      {extra}
      {/* Icons only on phones, so the bar fits beside the folders panel. */}
      {mode && onMode && (
      <div className="inline-flex shrink-0 rounded-lg bg-subtle p-0.5 text-xs font-medium">
        <Tip content="Show every document inside, including those in subfolders, grouped by folder">
          <button
            onClick={() => onMode('grouped')}
            className={cn('flex h-6 items-center gap-1.5 rounded-md px-2', mode === 'grouped' ? 'bg-panel shadow-sm' : 'text-muted')}
            aria-pressed={mode === 'grouped'}
            data-testid="folder-mode-grouped"
          >
            <FolderTree className="size-3.5" /> <span className="max-sm:sr-only">Expanded</span>
          </button>
        </Tip>
        <Tip content="Show subfolders as folders; open one to see what's inside">
          <button
            onClick={() => onMode('browse')}
            className={cn('flex h-6 items-center gap-1.5 rounded-md px-2', mode === 'browse' ? 'bg-panel shadow-sm' : 'text-muted')}
            aria-pressed={mode === 'browse'}
            data-testid="folder-mode-browse"
          >
            <LayoutGrid className="size-3.5" /> <span className="max-sm:sr-only">Folders</span>
          </button>
        </Tip>
      </div>
      )}
    </div>
  );
}
