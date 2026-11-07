import { describe, expect, it } from 'vitest';
import { splitProjects } from './split';

const split = (paths: string[], mains: string[]) => splitProjects(paths, (p) => mains.includes(p));

describe('splitting a bundle of documents', () => {
  it('keeps an ordinary project whole', () => {
    expect(split(['main.tex', 'sections/a.tex', 'img/x.png'], ['main.tex'])).toEqual({ roots: [''], leftovers: [] });
    // Main file in a subfolder, assets next to it: one document found, so the importer keeps the
    // whole upload together (planImport only splits when there are two or more).
    expect(split(['src/main.tex', 'images/x.png'], ['src/main.tex']).roots).toHaveLength(1);
  });

  it('finds one document per project folder', () => {
    const r = split(
      ['vision/main.tex', 'vision/fig.png', 'resume/resume.tex', 'resume/res.cls', 'cover/src/letter.tex', 'cover/images/sig.png', 'README.md', 'notes/todo.txt'],
      ['vision/main.tex', 'resume/resume.tex', 'cover/src/letter.tex'],
    );
    expect(r.roots.sort()).toEqual(['cover', 'resume', 'vision']);
    expect(r.leftovers.sort()).toEqual(['README.md', 'notes/todo.txt']);
  });

  it('handles groups of projects inside folders', () => {
    const r = split(['Resumes/AI/main.tex', 'Resumes/Robotics/main.tex', 'Papers/thesis/main.tex', 'Papers/thesis/ch1.tex'], [
      'Resumes/AI/main.tex',
      'Resumes/Robotics/main.tex',
      'Papers/thesis/main.tex',
    ]);
    expect(r.roots.sort()).toEqual(['Papers', 'Resumes/AI', 'Resumes/Robotics']);
  });
});
