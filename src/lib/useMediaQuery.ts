import { useCallback, useSyncExternalStore } from 'react';

/** Window widths (px) where layouts change; `phone`, `labels`, `dock` and `wide` match Tailwind's `sm`, `md`, `lg` and `xl`. */
export const BREAKPOINTS = {
  /** Phones below this. */
  phone: 640,
  /** Toolbar buttons keep their text labels from here (Tailwind's `md`). */
  labels: 768,
  /** The home page's folder panel docks from here; below, it opens as a drawer. */
  dock: 1024,
  /** Editor and compare: one pane at a time below this (phones, iPad portrait, small windows). */
  split: 900,
  /** Editor: the side panel opens by default from here (when narrower than `wide`). */
  side: 1100,
  /** The full desktop layout from here. */
  wide: 1280,
} as const;

/** Whether a CSS media query matches, updating when it starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (on: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', on);
      return () => mq.removeEventListener('change', on);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True when the window is at least `px` wide. */
export const useMinWidth = (px: number) => useMediaQuery(`(min-width: ${px}px)`);

/**
 * How a page with several panes (editor, compare) arranges them for the window width: the full
 * desktop layout, two panes side by side, or one pane at a time.
 */
export type PaneLayout = 'wide' | 'split' | 'single';

export function usePaneLayout(): PaneLayout {
  const wide = useMinWidth(BREAKPOINTS.wide);
  const split = useMinWidth(BREAKPOINTS.split);
  return wide ? 'wide' : split ? 'split' : 'single';
}

/** Phones (below Tailwind's `sm`). */
export const usePhone = () => !useMinWidth(BREAKPOINTS.phone);

/** A value kept for this browser tab's session (sessionStorage), e.g. the last editor pane. */
export function readSession<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = sessionStorage.getItem(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
