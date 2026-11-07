import { create } from 'zustand';

export type MapDirection = 'horizontal' | 'vertical';
export type Pos = { x: number; y: number };
type Saved = Record<MapDirection, Record<string, Pos>>;

const KEY = 'rc-map-positions';

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v.horizontal === 'object' && typeof v.vertical === 'object') return v;
  } catch {
    /* ignore */
  }
  return { horizontal: {}, vertical: {} };
}

function persist(saved: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage unavailable: positions last for this visit */
  }
}

/** Where the user dragged map cards, per layout direction (kept in this browser only). */
export const useMapPositions = create<{
  saved: Saved;
  save: (dir: MapDirection, moved: Record<string, Pos>) => void;
  reset: (dir: MapDirection) => void;
}>((set, get) => ({
  saved: load(),
  save: (dir, moved) => {
    const saved = { ...get().saved, [dir]: { ...get().saved[dir], ...moved } };
    persist(saved);
    set({ saved });
  },
  reset: (dir) => {
    const saved = { ...get().saved, [dir]: {} };
    persist(saved);
    set({ saved });
  },
}));
