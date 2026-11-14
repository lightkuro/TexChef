import { describe, expect, it } from 'vitest';
import { textChanges } from './changes';

const doc = ['\\section{Summary}', 'Eight years of data platforms.', '', '\\section{Skills}', 'Go, Python, TypeScript.', '', 'Thanks.', '\\end{document}'].join('\n');

describe('an agent’s edits, change by change', () => {
  const agent = doc.replace('data platforms.', 'real-time data platforms.').replace('Go, Python, TypeScript.', 'Go, Python, Flink.\nKafka.').replace('\nThanks.', '');
  const c = textChanges(doc, agent);

  it('lists each place that differs', () => {
    expect(c.changes.map((x) => [x.kind, x.preview])).toEqual([
      ['changed', 'Eight years of real-time data platforms.'],
      ['changed', 'Go, Python, Flink.'],
      ['removed', 'Thanks.'],
    ]);
  });

  it('with everything kept it is the agent’s text; with everything left out, the document', () => {
    expect(c.apply().text).toBe(agent);
    expect(c.apply(new Set([0, 1, 2])).text).toBe(doc);
  });

  it('leaves out single changes, and says where each one sits', () => {
    const r = c.apply(new Set([1]));
    expect(r.text).toBe(doc.replace('data platforms.', 'real-time data platforms.').replace('\nThanks.', ''));
    expect(r.lines).toEqual([2, 5, 7]);
  });

  it('finds nothing when the texts are the same', () => {
    expect(textChanges(doc, doc).changes).toEqual([]);
    expect(textChanges(doc, doc).apply().text).toBe(doc);
  });
});
