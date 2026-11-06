import type { Node } from '@xyflow/react';

/** New nodes, with the measured size of the node they replace. */
export function keepMeasured<N extends Node>(current: N[], next: N[]): N[] {
  const prev = new Map(current.map((n) => [n.id, n]));
  return next.map((n) => {
    const m = prev.get(n.id)?.measured;
    return m && !n.measured ? { ...n, measured: m } : n;
  });
}
