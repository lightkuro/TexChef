/** Small helpers for scroll-driven animation: `p` runs from 0 to 1 over a section. */

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** How far `p` is between `a` and `b`, from 0 to 1. */
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));

/** Smooth start and end. */
export const ease = (t: number) => t * t * (3 - 2 * t);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The story has this many steps, each an equal share of the scroll. */
export const STEPS = 5;

/** Progress within step `i` (0 before it, 1 after it). */
export const stepT = (p: number, i: number) => seg(p, i / STEPS, (i + 1) / STEPS);

/** The step `p` is in. */
export const stepOf = (p: number) => Math.min(STEPS - 1, Math.floor(clamp(p) * STEPS));
