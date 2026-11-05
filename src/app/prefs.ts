import { create } from 'zustand';

/** Light/dark mode. */
export type Theme = 'system' | 'light' | 'dark';

/** Color theme; each has a light and a dark variant (see index.css). */
export type Palette = 'kitchen' | 'ocean' | 'forest' | 'plum' | 'graphite' | 'nord';

export const PALETTES: { id: Palette; name: string; light: [string, string, string]; dark: [string, string, string] }[] = [
  // [background, panel, accent] used for the swatches
  { id: 'kitchen', name: 'Kitchen', light: ['#f7f5f2', '#ffffff', '#c2410c'], dark: ['#121110', '#1a1917', '#f0782f'] },
  { id: 'ocean', name: 'Ocean', light: ['#f3f6fb', '#ffffff', '#1d5fd1'], dark: ['#0c121e', '#121a29', '#5b9cff'] },
  { id: 'forest', name: 'Forest', light: ['#f4f7f2', '#ffffff', '#2e7d32'], dark: ['#0e130d', '#151c13', '#62c266'] },
  { id: 'plum', name: 'Plum', light: ['#f8f5fa', '#ffffff', '#8a3ebd'], dark: ['#130e17', '#1b1420', '#c487fc'] },
  { id: 'graphite', name: 'Graphite', light: ['#f5f5f5', '#ffffff', '#262626'], dark: ['#101010', '#181818', '#e6e6e6'] },
  { id: 'nord', name: 'Nord', light: ['#eceff4', '#f8f9fb', '#5e81ac'], dark: ['#2b303b', '#323846', '#88c0d0'] },
];

interface Prefs {
  autoCompile: boolean;
  theme: Theme;
  palette: Palette;
  graphMode: 'family' | 'versions';
  dashboardView: 'graph' | 'list';
  showAutosaves: boolean;
  showArchived: boolean;
  set: (patch: Partial<Omit<Prefs, 'set'>>) => void;
}

const KEY = 'rc-prefs';

function load(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export const usePrefs = create<Prefs>((set, get) => ({
  autoCompile: true,
  theme: 'system',
  palette: 'kitchen',
  graphMode: 'family',
  dashboardView: 'graph',
  showAutosaves: false,
  showArchived: false,
  ...load(),
  set: (patch) => {
    set(patch);
    const { set: _omit, ...rest } = { ...get(), ...patch };
    void _omit;
    try {
      localStorage.setItem(KEY, JSON.stringify(rest));
      // Read by the inline script in index.html to theme the page before React loads.
      if (patch.theme) localStorage.setItem('rc-theme', patch.theme === 'system' ? '' : patch.theme);
      if (patch.palette) localStorage.setItem('rc-palette', patch.palette);
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
