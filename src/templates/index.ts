import resumeMaster from './resume-master.tex?raw';
import coverLetter from './cover-letter.tex?raw';
import article from './article.tex?raw';
import type { Engine } from '@/core/model';

export interface Template {
  id: string;
  name: string;
  description: string;
  engine: Engine;
  files: Record<string, string>;
  tags: string[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'resume-master',
    name: 'Master resume',
    description: 'One-column resume, already split into tagged blocks so you can make variants right away.',
    engine: 'pdflatex',
    files: { 'main.tex': resumeMaster },
    tags: ['resume'],
  },
  {
    id: 'cover-letter',
    name: 'Cover letter',
    description: 'Simple letter with blocks for the opening, body and closing.',
    engine: 'pdflatex',
    files: { 'main.tex': coverLetter },
    tags: ['cover-letter'],
  },
  {
    id: 'article',
    name: 'Blank article',
    description: 'General LaTeX article with math and graphics packages.',
    engine: 'pdflatex',
    files: { 'main.tex': article },
    tags: [],
  },
];
