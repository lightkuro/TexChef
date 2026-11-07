import { describe, expect, it } from 'vitest';
import { parseTexLog } from './logParser';

describe('parseTexLog', () => {
  it('reads TeX errors with their line from l.N', () => {
    const log = [
      '(./main.tex',
      'LaTeX2e <2025-11-01>',
      '! Undefined control sequence.',
      'l.12 Oops \\undefinedmacro',
      '                         ',
      ')',
    ].join('\n');
    expect(parseTexLog(log, ['main.tex'])).toEqual([
      { severity: 'error', file: 'main.tex', line: 12, message: 'Undefined control sequence: \\undefinedmacro' },
    ]);
  });

  it('attributes errors to the project file being read and adds a hint for missing packages', () => {
    const log = ['(./main.tex (./sections/exp.tex', "! LaTeX Error: File `fontawesome5.sty' not found.", '', 'l.3 \\usepackage'].join('\n');
    const [d] = parseTexLog(log, ['main.tex', 'sections/exp.tex']);
    expect(d.file).toBe('sections/exp.tex');
    expect(d.line).toBe(3);
    expect(d.message).toBe("File `fontawesome5.sty' not found.");
    expect(d.hint).toMatch(/not in the bundled TeX Live/);
  });

  it('parses file:line:error style output', () => {
    expect(parseTexLog('./main.tex:7: Missing $ inserted.')).toEqual([{ severity: 'error', file: 'main.tex', line: 7, message: 'Missing $ inserted.' }]);
  });

  it('joins wrapped package warnings and downgrades benign rerun warnings', () => {
    const log = [
      'Package hyperref Warning: Token not allowed in a PDF string (Unicode):',
      '(hyperref)                removing `\\textbf\' on input line 40.',
      '',
      "Package rerunfilecheck Warning: File `main.out' has changed.",
      '(rerunfilecheck)                Rerun to get outlines right',
      '(rerunfilecheck)                or use package `bookmark\'.',
      '',
      'Overfull \\hbox (12.3pt too wide) in paragraph at lines 55--56',
    ].join('\n');
    const d = parseTexLog(log, ['main.tex']);
    expect(d[0]).toMatchObject({ severity: 'warning', line: 40, message: "Token not allowed in a PDF string (Unicode): removing `\\textbf'" });
    expect(d[1]).toMatchObject({ severity: 'info' });
    expect(d[2]).toMatchObject({ severity: 'warning', line: 55, message: 'Overfull box (12.3pt too wide)' });
  });

  it('suppresses the trailing emergency stop when a real error was reported', () => {
    const log = ['! Missing } inserted.', 'l.9 }', '! Emergency stop.', 'l.9'].join('\n');
    expect(parseTexLog(log).map((d) => d.message)).toEqual(['Missing } inserted.']);
  });

  it('treats tiny overfull lines as bad boxes, bigger ones as warnings, with a plain explanation', () => {
    const log = [
      '(./main.tex',
      'Overfull \\hbox (0.55968pt too wide) in paragraph at lines 151--151',
      'Overfull \\hbox (12.5pt too wide) in paragraph at lines 160--161',
    ].join('\n');
    const [tiny, big] = parseTexLog(log, ['main.tex']);
    expect(tiny).toMatchObject({ severity: 'info', line: 151, message: 'Overfull box (0.55968pt too wide)' });
    expect(tiny.hint).toMatch(/0\.20 mm.*safe to ignore/);
    expect(big).toMatchObject({ severity: 'warning', line: 160 });
    expect(big.hint).toMatch(/4\.4 mm past the right margin/);
  });

  it('explains fancyhdr footskip and shell escape warnings', () => {
    const log = [
      'Package fancyhdr Warning: \\footskip is too small (0.0pt):',
      '(fancyhdr)                Make it at least 4.08003pt, for example:',
      '(fancyhdr)                \\setlength{\\footskip}{4.08003pt}.',
      'Package epstopdf Warning: Shell escape feature is not enabled.',
    ].join('\n');
    const [skip, shell] = parseTexLog(log);
    expect(skip.hint).toMatch(/footer is 4\.08003pt tall.*\\setlength\{\\footskip\}\{4\.08003pt\}/);
    expect(shell.message).toBe('Shell escape feature is not enabled.');
    expect(shell.hint).toMatch(/can’t run programs/);
  });
});

