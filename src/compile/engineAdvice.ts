import type { Engine } from '@/core/model';

export interface EngineAdvice {
  engine: Engine;
  /** Why, in plain words. */
  reason: string;
  /** Matches the log line (or diagnostic message) the advice belongs to. */
  match: RegExp;
}

const NAMES: Record<Engine, string> = { pdflatex: 'pdfLaTeX', xelatex: 'XeLaTeX', lualatex: 'LuaLaTeX' };
export const engineName = (e: Engine) => NAMES[e];

/**
 * When a compile failed because the document was written for another engine, which engine to use.
 * Looks at the TeX log (and the main file, for pdfTeX-only commands under XeLaTeX/LuaLaTeX).
 */
export function engineAdvice(log: string, engine: Engine, mainText = ''): EngineAdvice | undefined {
  if (engine === 'pdflatex') {
    const lua = /\\directlua|\bluacode\b|LuaTeX is required|requires LuaTeX\b/i;
    if (lua.test(log)) return { engine: 'lualatex', reason: 'This document runs Lua code, which only LuaLaTeX can do.', match: lua };
    if (/requires either XeTeX or LuaTeX|fontspec .*(XeTeX|LuaTeX)|Cannot run with pdfTeX|polyglossia.*(XeTeX|LuaTeX)/i.test(log)) {
      return {
        engine: 'xelatex',
        reason: 'This document sets its fonts with fontspec (or uses unicode-math / polyglossia), which needs XeLaTeX or LuaLaTeX.',
        match: /fontspec|unicode-math|polyglossia|XeTeX or LuaTeX|Cannot run with pdfTeX/i,
      };
    }
    if (/Unicode character .* not set up for use with LaTeX/.test(log)) {
      return {
        engine: 'xelatex',
        reason: 'pdfLaTeX can’t print some characters typed in this document (emoji, some symbols or alphabets). XeLaTeX can, with a font that has them.',
        match: /Unicode character .* not set up/,
      };
    }
  } else {
    // pdfTeX-only commands: common in resume templates (\pdfgentounicode, \input{glyphtounicode}).
    const pdftex = /Undefined control sequence[\s\S]{0,200}?\\(pdfgentounicode|pdfglyphtounicode|pdfoutput|pdfminorversion|pdfcompresslevel|pdfsuppresswarningpagegroup)\b/.exec(log);
    if (pdftex || (/\\pdfgentounicode\s*=/.test(mainText) && /Undefined control sequence/.test(log))) {
      return {
        engine: 'pdflatex',
        reason: `This document uses pdfLaTeX-only commands (like \\${pdftex?.[1] ?? 'pdfgentounicode'}), common in resume templates. Switch to pdfLaTeX, or delete those lines.`,
        match: /Undefined control sequence/,
      };
    }
    if (/Package inputenc Error|Font T1\/.* not loadable|fontenc.*not found/.test(log) && engine === 'lualatex') {
      return { engine: 'pdflatex', reason: 'This document is set up for pdfLaTeX fonts.', match: /inputenc|not loadable/ };
    }
  }
  return undefined;
}
