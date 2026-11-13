import { create } from 'zustand';

/** Light/dark mode. */
export type Theme = 'system' | 'light' | 'dark';

/** Color theme; each has a light and a dark variant (see index.css). */
export type Palette = 'kitchen' | 'ocean' | 'forest' | 'plum' | 'graphite' | 'nord';

export const PALETTES: { id: Palette; name: string; light: [string, string, string]; dark: [string, string, string] }[] = [
  // [background, panel, accent] used for the swatches. Forest is the default.
  { id: 'forest', name: 'Forest', light: ['#f4f7f2', '#ffffff', '#2e7d32'], dark: ['#0e130d', '#151c13', '#62c266'] },
  { id: 'kitchen', name: 'Kitchen', light: ['#f7f5f2', '#ffffff', '#c2410c'], dark: ['#121110', '#1a1917', '#f0782f'] },
  { id: 'ocean', name: 'Ocean', light: ['#f3f6fb', '#ffffff', '#1d5fd1'], dark: ['#0c121e', '#121a29', '#5b9cff'] },
  { id: 'plum', name: 'Plum', light: ['#f8f5fa', '#ffffff', '#8a3ebd'], dark: ['#130e17', '#1b1420', '#c487fc'] },
  { id: 'graphite', name: 'Graphite', light: ['#f5f5f5', '#ffffff', '#262626'], dark: ['#101010', '#181818', '#e6e6e6'] },
  { id: 'nord', name: 'Nord', light: ['#eceff4', '#f8f9fb', '#5e81ac'], dark: ['#2b303b', '#323846', '#88c0d0'] },
];

interface Prefs {
  autoCompile: boolean;
  /** Keep the editor cursor's line highlighted in the PDF. */
  followCursor: boolean;
  /** PDF preview zoom when not zoomed by hand: page width, or the whole page. */
  pdfFit: 'width' | 'page';
  /** Clicking text in the PDF opens an edit box ("Edit text" in the PDF toolbar). */
  pdfEditMode: boolean;
  /** When editing text on the PDF, recompile after every saved change instead of on "Update PDF". */
  pdfEditAutoUpdate: boolean;
  /** The editor shows LaTeX formatted (headings, bold, bullets) instead of as code. */
  editorVisual: boolean;
  /** The formatting bar (code/visual switch, bold, lists, fonts…) under the file name. */
  showFormatBar: boolean;
  theme: Theme;
  palette: Palette;
  graphMode: 'family' | 'versions';
  dashboardView: 'graph' | 'list';
  /** How the map draws links between documents. */
  mapLines: 'straight' | 'angled';
  /** Map layout: master on the left branching right, or at the top branching down. */
  mapDirection: 'horizontal' | 'vertical';
  /** Map cards show the whole first page instead of its top. */
  mapFullPages: boolean;
  /** Dragged map cards snap to a grid of card-sized cells. */
  mapSnap: boolean;
  showAutosaves: boolean;
  showArchived: boolean;
  /** Folder sidebar on the home page. */
  showFolders: boolean;
  /** Home page: show subfolders as folders (browse) or everything inside, grouped by folder. */
  folderMode: 'browse' | 'grouped';
  /** Folder open on the home page: a path, "__unfiled__", or null for all documents. */
  currentFolder: string | null;
  /** Experimental, opt-in: an Agents(optional_AI) folder in Drive that AI agents read and reply into. */
  agentsEnabled: boolean;
  /** Show the tip (with a Close picker button) while Google's file picker is open. */
  pickerTip: boolean;
  set: (patch: Partial<Omit<Prefs, 'set'>>) => void;
}

const KEY = 'rc-prefs';
/** Bumped when a default changes in a way saved preferences should pick up. */
const PREFS_VERSION = 2;

function load(): Partial<Prefs> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs> & { version?: number };
    if ((saved.version ?? 1) < 2) {
      // Version 2: the default color theme changed from Kitchen (orange) to Forest (green).
      if (!saved.palette || saved.palette === 'kitchen') saved.palette = 'forest';
      saved.version = PREFS_VERSION;
      localStorage.setItem(KEY, JSON.stringify(saved));
    }
    delete saved.version;
    return saved;
  } catch {
    return {};
  }
}

export const usePrefs = create<Prefs>((set, get) => ({
  autoCompile: true,
  followCursor: true,
  pdfFit: 'width',
  pdfEditMode: true,
  pdfEditAutoUpdate: true,
  editorVisual: false,
  showFormatBar: false,
  theme: 'system',
  palette: 'forest',
  graphMode: 'family',
  dashboardView: 'graph',
  mapLines: 'straight',
  mapDirection: 'horizontal',
  mapFullPages: false,
  mapSnap: false,
  showAutosaves: false,
  showArchived: false,
  showFolders: true,
  folderMode: 'browse',
  currentFolder: null,
  agentsEnabled: false,
  pickerTip: true,
  ...load(),
  set: (patch) => {
    set(patch);
    const { set: _omit, ...rest } = { ...get(), ...patch };
    void _omit;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...rest, version: PREFS_VERSION }));
      // Read by the inline script in index.html to theme the page before React loads.
      if (patch.theme) localStorage.setItem('rc-theme', patch.theme === 'system' ? '' : patch.theme);
      if (patch.palette) localStorage.setItem('rc-palette-v2', patch.palette);
    } catch {
      /* storage unavailable */
    }
    if (patch.theme) applyTheme(patch.theme);
    if (patch.palette) applyPalette(patch.palette);
  },
}));

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function applyPalette(palette: Palette) {
  if (palette === 'kitchen') delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = palette;
}
