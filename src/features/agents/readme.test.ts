import { describe, expect, it } from 'vitest';
import type { DocMeta } from '@/core/model';
import { buildAgentsReadme } from './readme';

const doc = (id: string, name: string, parent?: string) => ({ id, name, mainFile: 'main.tex', parent: parent ? { docId: parent, baseCommitId: 'c0' } : undefined }) as DocMeta;

describe('agents read-me', () => {
  it('lists each document with its id, base version, folder and family, and how to reply', () => {
    const master = doc('m1', 'Master resume');
    const variant = { ...doc('v1', 'Frontend resume', 'm1'), folder: 'Applications' };
    const md = buildAgentsReadme(
      [
        { doc: master, base: 'c9', folder: 'Master resume', files: ['main.tex'] },
        { doc: variant, base: 'c7', folder: 'Frontend resume', files: ['main.tex'] },
      ],
      [master, variant],
    );
    expect(md).toContain('| Master resume | `m1` | `c9` | TexChef/Master resume/ | main.tex | 1 | – | variants: “Frontend resume” |');
    expect(md).toContain('| Frontend resume | `v1` | `c7` | TexChef/Frontend resume/ | main.tex | 1 | Applications | variant of “Master resume” |');
    expect(md).toContain('Folders in use: `Applications`.');
    expect(md).toContain('variant-of=<id>');
    expect(md).toContain('rename="<new name>"');
    expect(md).toContain('archive=yes');
    expect(md).toContain('unlink=yes');
    expect(md).toContain('To **link** an existing document as a variant of another');
    expect(md).toContain('% texchef-reply doc=<id> base=<base> file=main.tex note=');
    expect(md).toContain('Agents(optional_AI)');
  });
});
