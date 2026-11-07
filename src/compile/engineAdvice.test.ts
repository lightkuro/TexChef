import { describe, expect, it } from 'vitest';
import { engineAdvice } from './engineAdvice';

describe('engineAdvice', () => {
  it('suggests XeLaTeX for fontspec under pdfLaTeX', () => {
    const log = '! Fatal Package fontspec Error: The fontspec package requires either XeTeX or\n(fontspec)                      LuaTeX.';
    expect(engineAdvice(log, 'pdflatex')?.engine).toBe('xelatex');
  });

  it('suggests LuaLaTeX for Lua code under pdfLaTeX', () => {
    expect(engineAdvice('! Undefined control sequence.\nl.5 \\directlua\n', 'pdflatex')?.engine).toBe('lualatex');
  });

  it('suggests XeLaTeX for characters pdfLaTeX can’t print', () => {
    const log = '! LaTeX Error: Unicode character ★ (U+2605)\n               not set up for use with LaTeX.';
    expect(engineAdvice(log.replace('\n               ', ' '), 'pdflatex')?.engine).toBe('xelatex');
  });

  it('suggests pdfLaTeX for resume templates with \\pdfgentounicode under XeLaTeX', () => {
    const log = '! Undefined control sequence.\nl.22 \\pdfgentounicode\n                     =1';
    const a = engineAdvice(log, 'xelatex', '\\pdfgentounicode=1');
    expect(a?.engine).toBe('pdflatex');
    expect(a?.reason).toMatch(/pdfgentounicode/);
  });

  it('says nothing for ordinary errors', () => {
    expect(engineAdvice('! Undefined control sequence.\nl.3 \\oops', 'pdflatex')).toBeUndefined();
    expect(engineAdvice('! Missing } inserted.', 'xelatex')).toBeUndefined();
  });
});
