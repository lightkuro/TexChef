import { create } from 'zustand';

export type Theme = 'system' | 'light' | 'dark';

interface Prefs {
  autoCompile: boolean;
  theme: Theme;
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
      if (patch.theme) localStorage.setItem('rc-theme', patch.theme === 'system' ? '' : patch.theme);
    } catch {
      /* storage unavailable */
    }
    if (patch.theme) applyTheme(patch.theme);
  },
}));

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
