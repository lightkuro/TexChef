import { describe, expect, it } from 'vitest';
import { modernPdfJsSupported } from './pdf';

const fn = () => undefined;
const all = (...names: string[]) => Object.fromEntries(names.map((n) => [n, fn]));

/** A pretend browser global with everything the modern pdf.js build needs. */
function browser(): typeof globalThis {
  return {
    Map: { prototype: all('getOrInsert', 'getOrInsertComputed') },
    WeakMap: { prototype: all('getOrInsert', 'getOrInsertComputed') },
    Math: all('sumPrecise'),
    Promise: all('try'),
    Set: { prototype: all('union', 'intersection', 'difference', 'symmetricDifference', 'isSubsetOf', 'isSupersetOf', 'isDisjointFrom') },
    Iterator: { prototype: all('map', 'filter', 'take', 'drop', 'flatMap', 'some', 'every', 'find', 'forEach', 'toArray') },
    Uint8Array: Object.assign(fn, { fromBase64: fn, prototype: all('toBase64', 'toHex', 'setFromBase64', 'setFromHex', 'with') }),
    URL: all('parse'),
  } as unknown as typeof globalThis;
}

describe('which pdf.js build a browser gets', () => {
  it('modern when everything it needs is there', () => {
    expect(modernPdfJsSupported(browser())).toBe(true);
  });

  it('legacy when anything is missing (Safari: Map.getOrInsertComputed)', () => {
    const safari = browser();
    delete (safari.Map.prototype as unknown as Record<string, unknown>).getOrInsertComputed;
    expect(modernPdfJsSupported(safari)).toBe(false);
    const old = browser();
    delete (old as unknown as Record<string, unknown>).Iterator;
    expect(modernPdfJsSupported(old)).toBe(false);
  });
});
