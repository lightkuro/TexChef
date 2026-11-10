import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, Check, Cloud, Code2, Crown, Eye, FileText, GitBranch, GitPullRequestArrow, HardDrive, Pencil, ServerOff, Type, X } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { clamp, ease, lerp, seg, stepT } from './motionMath';

/**
 * A drawn TexChef window that acts out the story as `p` goes from 0 to 1 (one fifth per step):
 * typing LaTeX, editing on the PDF, Visual mode, versions, and where documents live.
 * It is laid out at a fixed size and scaled to fit by its parent, so positions can be in pixels.
 */
export const DEMO_SIZE = { wide: { w: 880, h: 560 }, compact: { w: 520, h: 660 } } as const;
const CHROME = 34 + 42;

// ---------------------------------------------------------------- the essay, line by line

type Kind = 'pre' | 'blank' | 'begin' | 'cmd' | 'h' | 'p' | 'ls' | 'le' | 'item' | 'eq' | 'end';
interface Line {
  tex: string;
  kind: Kind;
  /** How the line looks in Visual mode. */
  vis?: ReactNode;
}

const TARGET = 10;
const lineAt = (changed: boolean): Line => ({
  tex: `In our survey, ${changed ? '75' : '60'}\\% of residents want more.`,
  kind: 'p',
  vis: <>In our survey, {changed ? '75' : '60'}% of residents want more.</>,
});

const LINES: Line[] = [
  { tex: '\\documentclass{article}', kind: 'pre' },
  { tex: '\\usepackage{amsmath}', kind: 'pre' },
  { tex: '\\title{Why Cities Plant Trees}', kind: 'pre' },
  { tex: '\\author{Maya Chen}', kind: 'pre' },
  { tex: '', kind: 'blank' },
  { tex: '\\begin{document}', kind: 'begin' },
  { tex: '\\maketitle', kind: 'cmd', vis: <span className="rounded border border-line bg-subtle px-1.5 font-mono text-[10px] text-muted">maketitle</span> },
  { tex: '\\section{Introduction}', kind: 'h', vis: 'Introduction' },
  {
    tex: 'Street trees cool the air by \\textbf{3 degrees}',
    kind: 'p',
    vis: (
      <>
        Street trees cool the air by <b>3 degrees</b>
      </>
    ),
  },
  { tex: 'on summer afternoons, for decades.', kind: 'p', vis: 'on summer afternoons, for decades.' },
  lineAt(false),
  { tex: '\\section{What trees give back}', kind: 'h', vis: 'What trees give back' },
  { tex: '\\begin{itemize}', kind: 'ls', vis: 'Bulleted list' },
  { tex: '  \\item Shade that lowers cooling costs', kind: 'item', vis: 'Shade that lowers cooling costs' },
  { tex: '  \\item Roots that soak up storm water', kind: 'item', vis: 'Roots that soak up storm water' },
  { tex: '\\end{itemize}', kind: 'le', vis: 'End of list' },
  { tex: '\\[ S = n \\cdot s \\]', kind: 'eq', vis: 'S = n · s' },
  { tex: '\\end{document}', kind: 'end' },
];

const OFFSETS = LINES.reduce<number[]>((acc, _l, i) => [...acc, i === 0 ? 0 : acc[i - 1] + LINES[i - 1].tex.length + 1], []);
const TOTAL = OFFSETS[OFFSETS.length - 1] + LINES[LINES.length - 1].tex.length;
/** Already typed when the story starts: the preamble. */
const START = OFFSETS[4];

const RAW_H = 22;
const VIS_H: Record<Kind, number> = { pre: 0, blank: 0, begin: 0, end: 0, cmd: 26, h: 36, p: 22, ls: 18, le: 18, item: 22, eq: 30 };

/** LaTeX with its commands in the accent color. */
function Tex({ text }: { text: string }) {
  const parts = text.split(/(\\[a-zA-Z]+|\\.|[{}])/g);
  return (
    <>
      {parts.map((s, i) =>
        /^\\/.test(s) ? (
          <span key={i} className="text-accent">
            {s}
          </span>
        ) : s === '{' || s === '}' ? (
          <span key={i} className="text-muted">
            {s}
          </span>
        ) : (
          s
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------- the window

/** The story's scenes, in order. The editor acts out the first three. */
export const SCENES = ['write', 'edit', 'visual', 'versions', 'compare', 'private'] as const;

/**
 * `step` is the scene showing and `t` (0 to 1) how far its animation has played; earlier scenes count as finished.
 */
export function DemoWindow({ step, t, compact }: { step: number; t: number; compact: boolean }) {
  const size = compact ? DEMO_SIZE.compact : DEMO_SIZE.wide;
  const body = { w: size.w, h: size.h - CHROME };
  const tOf = (i: number) => (i < step ? 1 : i === step ? t : 0);
  // The editor's three scenes were written against one progress value: the first three fifths.
  const p = step <= 2 ? (step + t) / 5 : 3 / 5;
  const typed = Math.round(lerp(START, TOTAL, ease(seg(p, 0.005, 0.17))));
  const doneTyping = typed >= TOTAL;
  const saved = stepT(p, 1) >= 0.86;
  const scene = step <= 2 ? 'editor' : SCENES[step];
  const name = { editor: 'Why cities plant trees', versions: 'All documents', compare: 'Compare', private: 'Settings · Storage' }[scene as string];
  const status =
    scene === 'editor' ? (doneTyping ? (saved && step === 1 ? 'Updated' : 'Compiled · 1 page') : 'Typing…') : scene === 'versions' ? '4 documents' : scene === 'compare' ? '3 changes' : 'Local only';
  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-panel text-fg shadow-2xl ring-1 shadow-black/15 ring-black/5 select-none dark:shadow-black/50"
      style={{ width: size.w, height: size.h }}
      aria-hidden="true"
    >
      {/* Browser chrome */}
      <div className="flex h-[34px] shrink-0 items-center gap-1.5 border-b border-line bg-subtle px-3.5">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="mx-auto -translate-x-6 rounded-md bg-panel px-10 py-0.5 text-[11px] text-muted">texchef.kurolight.dev</span>
      </div>
      {/* App header */}
      <div className="flex h-[42px] shrink-0 items-center gap-2.5 border-b border-line px-3 text-[14px]">
        <ArrowLeft className="size-4 text-muted" />
        <Logo size={20} />
        <span key={name} className="min-w-0 flex-1 animate-[demo-in_.4s_ease-out] truncate font-semibold">
          {name}
        </span>
        <span className="rounded-full bg-subtle px-2 py-0.5 text-[12px] text-muted tabular-nums">{status}</span>
        {!compact && (
          <span className="flex h-7 items-center gap-1 rounded-md border border-line px-2.5 text-[12.5px]">
            <GitBranch className="size-3.5" /> New variant
          </span>
        )}
        <span
          className="flex h-7 items-center gap-1 rounded-md bg-accent px-3 text-[12.5px] font-medium text-accent-fg transition-shadow"
          style={{ boxShadow: scene === 'editor' && !doneTyping && p > 0.01 ? '0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent)' : undefined }}
        >
          Compile
        </span>
      </div>
      {/* The scenes, cross-fading */}
      <div className="relative min-h-0 flex-1">
        <Scene on={scene === 'editor'}>
          <EditorScene p={p} typed={typed} compact={compact} body={body} />
        </Scene>
        <Scene on={scene === 'versions'} grow>
          <MapScene t={tOf(3)} compact={compact} body={body} />
        </Scene>
        <Scene on={scene === 'compare'} grow>
          <CompareScene t={tOf(4)} compact={compact} />
        </Scene>
        <Scene on={scene === 'private'} grow>
          <DeviceScene t={tOf(5)} compact={compact} body={body} />
        </Scene>
      </div>
    </div>
  );
}

function Scene({ on, grow, children }: { on: boolean; grow?: boolean; children: ReactNode }) {
  return (
    <div
      className="absolute inset-0 transition-[opacity,transform] duration-500 ease-out"
      style={{ opacity: on ? 1 : 0, transform: grow && !on ? 'scale(0.97)' : undefined, pointerEvents: 'none' }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- 1–3: the editor

function EditorScene({ p, typed, compact, body }: { p: number; typed: number; compact: boolean; body: { w: number; h: number } }) {
  const t1 = stepT(p, 1);
  const changed = t1 >= 0.86;
  const lines = LINES.map((l, i) => (i === TARGET ? lineAt(changed) : l));
  const vis = (i: number) => ease(seg(p, 0.43 + i * 0.003, 0.46 + i * 0.003));
  const bar = ease(seg(p, 0.4, 0.42));
  const knob = ease(seg(p, 0.42, 0.44));
  const codeH = compact ? 262 : body.h;
  const fileBar = 32;
  const heights = lines.map((l, i) => {
    if (OFFSETS[i] > typed && i > 0) return 0;
    return lerp(RAW_H, VIS_H[l.kind], vis(i));
  });
  const preamble = vis(0);
  const contentH = heights.reduce((a, b) => a + b, 0) + preamble * 34 + 16;
  const paneH = codeH - fileBar - bar * 34;
  const shift = Math.max(0, contentH - paneH);
  const syncLine = t1 > 0.32 && p < 0.42;
  const flash = 1 - seg(t1, 0.88, 1);

  const code = (
    <div className="flex min-h-0 flex-col border-line bg-panel" style={{ height: codeH, width: compact ? '100%' : '50%', borderRightWidth: compact ? 0 : 1, borderBottomWidth: compact ? 1 : 0 }}>
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3 text-[12.5px] text-muted">
        <span className="font-mono text-fg">essay.tex</span> main file
        <span className={cn('ml-auto rounded px-1.5 font-serif text-[13px] italic', bar > 0.5 ? 'bg-accent-soft text-accent' : '')}>Aa</span>
      </div>
      <div className="flex shrink-0 items-center gap-2 overflow-hidden border-b border-line bg-panel px-2 text-[11.5px] text-muted" style={{ height: bar * 34, opacity: bar, borderBottomWidth: bar > 0.02 ? 1 : 0 }}>
        <span className="relative flex rounded-md bg-subtle p-0.5">
          <span className="absolute inset-y-0.5 w-[62px] rounded bg-panel shadow-sm" style={{ left: 2 + knob * 62 }} />
          <span className={cn('relative flex w-[62px] items-center justify-center gap-1 py-0.5', knob < 0.5 && 'text-fg')}>
            <Code2 className="size-3" /> Code
          </span>
          <span className={cn('relative flex w-[62px] items-center justify-center gap-1 py-0.5', knob >= 0.5 && 'text-fg')}>
            <Eye className="size-3" /> Visual
          </span>
        </span>
        <span className="ml-1 font-bold text-fg">B</span>
        <span className="font-serif italic">I</span>
        <span className="underline">U</span>
        <span>• List</span>
        <span>Link</span>
        <span className="flex items-center gap-0.5">
          <Type className="size-3" /> Font
        </span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-x-0 top-0 pt-2" style={{ transform: `translateY(${-shift}px)` }}>
          <div className="mx-2 overflow-hidden rounded-md border border-line bg-subtle/70 text-[11px]" style={{ height: preamble * 30, opacity: preamble, marginBottom: preamble * 4, borderWidth: preamble > 0.05 ? 1 : 0 }}>
            <div className="flex h-[28px] items-center gap-2 px-2.5">
              <b>Preamble</b>
              <span className="text-muted">6 lines of settings</span>
              <span className="ml-auto rounded border border-line bg-panel px-1.5 text-[10px]">Show</span>
            </div>
          </div>
          {lines.map((l, i) => {
            const h = heights[i];
            if (h <= 0.2) return null;
            const v = vis(i);
            const shown = i === 0 ? l.tex : l.tex.slice(0, clamp(typed - OFFSETS[i], 0, l.tex.length));
            const caret = typed < TOTAL && typed >= OFFSETS[i] && typed <= OFFSETS[i] + l.tex.length;
            const highlight = i === TARGET && (syncLine || (changed && flash > 0 && p < 0.42));
            return (
              <div key={i} className="relative flex" style={{ height: h }}>
                <span className="w-8 shrink-0 pr-2 text-right font-mono text-[12px] leading-[22px] text-muted/70">{h > 12 ? i + 1 : ''}</span>
                <div className={cn('relative min-w-0 flex-1 rounded-sm', highlight && 'bg-accent-soft')}>
                  <div className="absolute inset-x-1 top-0 font-mono text-[13px] leading-[22px] whitespace-pre" style={{ opacity: 1 - seg(v, 0, 0.45) }}>
                    <Tex text={shown} />
                    {caret && <span className="ml-px inline-block h-3.5 w-[1.5px] translate-y-0.5 animate-pulse bg-fg" />}
                  </div>
                  {v > 0 && l.vis && (
                    <div className="absolute inset-x-1 top-0" style={{ opacity: seg(v, 0.45, 1), transform: `translateY(${(1 - v) * 4}px)` }}>
                      <VisualLine line={l} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn('flex h-full', compact ? 'flex-col' : 'flex-row')}>
      {code}
      <PdfPane typed={typed} t1={t1} compact={compact} changed={changed} flash={flash} />
    </div>
  );
}

function VisualLine({ line }: { line: Line }) {
  switch (line.kind) {
    case 'h':
      return <div className="text-[22px] leading-[36px] font-bold tracking-tight">{line.vis}</div>;
    case 'ls':
    case 'le':
      return <div className="text-[10px] leading-[18px] tracking-wider text-muted uppercase">{line.vis}</div>;
    case 'item':
      return (
        <div className="pl-3 text-[14.5px] leading-[22px]">
          <span className="mr-2 text-accent">•</span>
          {line.vis}
        </div>
      );
    case 'eq':
      return <div className="text-center font-serif text-[17px] leading-[30px] italic">{line.vis}</div>;
    case 'cmd':
      return <div className="leading-6">{line.vis}</div>;
    default:
      return <div className="text-[14.5px] leading-[22px] whitespace-nowrap">{line.vis}</div>;
  }
}

/** The typeset page. Each part appears once its line is typed. */
function PdfPane({ typed, t1, compact, changed, flash }: { typed: number; t1: number; compact: boolean; changed: boolean; flash: number }) {
  const done = (i: number) => typed >= OFFSETS[i] + LINES[i].tex.length;
  const appear = (on: boolean): CSSProperties => ({ opacity: on ? 1 : 0, transform: on ? 'none' : 'translateY(4px)', transition: 'opacity .35s, transform .35s' });
  // Editing on the PDF (step 2 of the story).
  const cursorIn = ease(seg(t1, 0.04, 0.3));
  const toSave = ease(seg(t1, 0.74, 0.8));
  const cursor = { x: lerp(lerp(190, 74, cursorIn), 240, toSave), y: lerp(lerp(150, 8, cursorIn), 120, toSave) };
  const showCursor = t1 > 0.02 && t1 < 0.97;
  const hover = t1 > 0.22 && t1 < 0.32;
  const picked = t1 >= 0.32 && t1 < 0.88;
  const ripple = seg(t1, 0.32, 0.44);
  const ripple2 = seg(t1, 0.82, 0.92);
  const pop = ease(seg(t1, 0.34, 0.4)) * (1 - ease(seg(t1, 0.86, 0.9)));
  const selected = t1 > 0.46 && t1 < 0.62;
  const typing = Math.floor(seg(t1, 0.62, 0.74) * 3);
  const newNum = '75%'.slice(0, typing);
  const pressed = t1 > 0.81 && t1 < 0.87;

  return (
    <div className={cn('relative min-h-0 flex-1 overflow-hidden bg-subtle', compact ? 'px-6 pt-4' : 'px-5 pt-5')}>
      <div className="mx-auto bg-white px-9 pt-9 pb-6 font-serif text-[#1a1a1a] shadow-md" style={{ width: 400, minHeight: 540 }}>
        <div className="text-center" style={appear(done(6))}>
          <div className="text-[18px]">Why Cities Plant Trees</div>
          <div className="mt-1 text-[11px]">Maya Chen</div>
        </div>
        <div className="mt-5 text-[13px] font-bold" style={appear(done(7))}>
          1&nbsp;&nbsp;Introduction
        </div>
        <p className="mt-1.5 text-justify text-[10.5px] leading-[1.45]">
          <span style={appear(done(8))}>
            Street trees cool the air by <b>3 degrees</b>{' '}
          </span>
          <span style={appear(done(9))}>on summer afternoons, for decades.</span>
        </p>
        <div className="relative mt-1.5 text-[10.5px] leading-[1.45]" style={appear(done(10))}>
          <span
            className="relative -mx-1 rounded-[3px] px-1 transition-colors"
            style={{
              outline: hover ? '1.5px dashed color-mix(in srgb, var(--accent) 70%, transparent)' : picked ? '1.5px solid var(--accent)' : undefined,
              background: picked ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : changed && flash > 0 ? `color-mix(in srgb, var(--accent) ${Math.round(flash * 30)}%, transparent)` : undefined,
            }}
          >
            In our survey, {changed ? '75' : '60'}% of residents want more.
          </span>
          {/* The edit box */}
          {pop > 0.01 && (
            <div
              className="absolute top-full left-[-12px] z-10 mt-2 w-[292px] rounded-lg border border-line bg-panel p-2 font-sans text-fg shadow-xl"
              style={{ opacity: pop, transform: `translateY(${(1 - pop) * -6}px) scale(${lerp(0.96, 1, pop)})`, transformOrigin: 'top left' }}
            >
              <div className="flex h-6 items-center gap-1.5 text-[10.5px]">
                <span className="flex items-center gap-1 rounded bg-subtle px-1.5 py-0.5 font-medium">
                  <Type className="size-3" /> Text
                </span>
                <span className="text-muted">LaTeX</span>
                <span className="text-muted">essay.tex · line 11</span>
                <X className="ml-auto size-3 text-muted" />
              </div>
              <div className="mt-1.5 rounded-md border border-line bg-subtle/60 px-2 py-1.5 text-[12px] leading-[18px]">
                In our survey,{' '}
                {t1 < 0.62 ? (
                  <span className={cn('rounded-[2px]', selected && 'bg-accent/30')}>60%</span>
                ) : (
                  <>
                    {newNum}
                    {typing < 3 && <span className="ml-px inline-block h-3.5 w-[1.5px] translate-y-0.5 bg-fg" />}
                  </>
                )}{' '}
                of residents want more.
              </div>
              <div className="mt-1.5 flex h-7 items-center gap-2 text-[10.5px] text-muted">
                Enter saves
                <span className="ml-auto">Cancel</span>
                <span
                  className="rounded-md bg-accent px-2.5 py-1 font-medium text-accent-fg transition-transform"
                  style={{ transform: pressed ? 'scale(0.92)' : undefined, filter: pressed ? 'brightness(0.9)' : undefined }}
                >
                  Save ↵
                </span>
              </div>
            </div>
          )}
          {/* The pointer, with a ripple on each click */}
          {showCursor && (
            <div className="pointer-events-none absolute top-0 left-0 z-20" style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
              {[ripple, ripple2].map((r, i) =>
                r > 0 && r < 1 ? (
                  <span key={i} className="absolute -top-3 -left-3 size-6 rounded-full border-2 border-accent" style={{ transform: `scale(${0.3 + r * 1.6})`, opacity: 1 - r }} />
                ) : null,
              )}
              <svg width="18" height="22" viewBox="0 0 18 22" className="drop-shadow">
                <path d="M1 1 L1 17 L5.5 13 L8.5 20 L11.5 18.7 L8.6 12 L14.5 12 Z" fill="#111" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
        <div className="mt-4 text-[13px] font-bold" style={appear(done(11))}>
          2&nbsp;&nbsp;What trees give back
        </div>
        <ul className="mt-1.5 space-y-0.5 pl-4 text-[10.5px] leading-[1.45]">
          <li style={appear(done(13))}>• Shade that lowers cooling costs</li>
          <li style={appear(done(14))}>• Roots that soak up storm water</li>
        </ul>
        <div className="mt-3 flex items-center text-[11.5px] italic" style={appear(done(16))}>
          <span className="flex-1 text-center">S = n · s</span>
          <span className="not-italic">(1)</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 4: versions on the map

const VARIANTS = [
  { name: 'Frontend', tags: ['frontend'], color: '#1f7aa8', lines: 7 },
  { name: 'Backend', tags: ['backend'], color: '#c2185b', lines: 9 },
  { name: 'Data', tags: ['data', 'ml'], color: '#d9661f', lines: 6 },
];

function MiniPage({ lines, width }: { lines: number; width: number }) {
  const ws = [86, 72, 94, 60, 88, 78, 92, 66, 84, 70, 90, 58, 80, 74];
  return (
    <div className="mx-auto flex flex-col gap-[3px] bg-white px-3 pt-3 pb-2" style={{ width }}>
      <span className="mx-auto mb-1 block h-[4px] w-1/2 rounded-full bg-black/60" />
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={cn('block h-[3px] rounded-full', i % 4 === 0 ? 'mt-1 bg-[#b5562f]/70' : 'bg-black/20')} style={{ width: `${ws[i % ws.length]}%` }} />
      ))}
    </div>
  );
}

function MapScene({ t, compact, body }: { t: number; compact: boolean; body: { w: number; h: number } }) {
  const cw = compact ? 136 : 168;
  const thumbH = compact ? 96 : 116;
  const ch = thumbH + 66;
  const master = { x: body.w / 2, y: compact ? 40 : 24 };
  const row = compact ? body.h - ch - 70 : body.h - ch - 40;
  const xs = compact ? [body.w * 0.17, body.w * 0.5, body.w * 0.83] : [body.w * 0.2, body.w * 0.5, body.w * 0.78];
  const appear = ease(seg(t, 0, 0.08));
  // A pointer drags the last card to a new spot: the map is yours to arrange.
  const drag = ease(seg(t, 0.38, 0.5));
  const dragOff = compact ? { x: 0, y: -26 } : { x: 40, y: -34 };
  const spot = (i: number, s: number) => {
    const x = lerp(master.x, xs[i], s) + (i === 2 ? dragOff.x * drag : 0);
    const y = lerp(master.y + 20, row, s) + (i === 2 ? dragOff.y * drag : 0);
    return { x, y };
  };
  const grab = { x: xs[2] + 18, y: row + 40 };
  const cursorIn = ease(seg(t, 0.28, 0.37));
  const cursorOut = ease(seg(t, 0.52, 0.6));
  const cursor = {
    x: lerp(lerp(grab.x + 120, grab.x, cursorIn), grab.x + 140, cursorOut) + dragOff.x * drag,
    y: lerp(lerp(grab.y + 90, grab.y, cursorIn), grab.y + 110, cursorOut) + dragOff.y * drag,
  };
  const holding = t > 0.37 && t < 0.51;
  const edited = ease(seg(t, 0.56, 0.6));
  const merged = t >= 0.92;

  return (
    <div className="relative h-full overflow-hidden bg-bg" style={{ backgroundImage: 'radial-gradient(color-mix(in srgb, var(--fg) 12%, transparent) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
      <svg className="absolute inset-0" width={body.w} height={body.h}>
        {xs.map((_, i) => {
          const d = ease(seg(t, 0.1 + i * 0.05, 0.3 + i * 0.05));
          const end = spot(i, 1);
          const x1 = master.x;
          const y1 = master.y + ch;
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={lerp(x1, end.x, d)} y2={lerp(y1, end.y, d)} stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" opacity={d > 0 ? 0.8 : 0} />
              {(() => {
                const k = ease(seg(t, 0.6 + i * 0.03, 0.76 + i * 0.03));
                if (k <= 0 || k >= 1) return null;
                return <circle cx={lerp(x1, end.x, k)} cy={lerp(y1, end.y, k)} r={5.5} fill="#e8a317" stroke="#fff" strokeWidth={2} />;
              })()}
            </g>
          );
        })}
      </svg>
      {/* The master */}
      <Card x={master.x} y={master.y} w={cw} on={appear} color="var(--accent)" thumbH={thumbH}>
        <MiniPage lines={14} width={cw - 28} />
        <Footer icon={<Crown className="size-4 text-accent" />} name="Master resume" chips={<Chip>3 variants</Chip>} />
        {edited > 0 && (
          <span
            className="absolute -top-3 -right-5 flex items-center gap-1 rounded-full bg-fg px-2.5 py-0.5 text-[11.5px] font-medium text-bg shadow-md"
            style={{ opacity: edited, transform: `scale(${lerp(0.6, 1, edited)})` }}
          >
            <Pencil className="size-3" /> Fixed a typo
          </span>
        )}
      </Card>
      {/* The variants */}
      {VARIANTS.map((v, i) => {
        const s = ease(seg(t, 0.06 + i * 0.05, 0.24 + i * 0.05));
        const arrived = t >= 0.76 + i * 0.03;
        const pop = ease(seg(t, 0.76 + i * 0.03, 0.8 + i * 0.03));
        const done = merged && i === 0;
        const at = spot(i, s);
        return (
          <Card key={v.name} x={at.x} y={at.y} w={cw} on={s} color={v.color} thumbH={thumbH} lifted={i === 2 && holding}>
            <MiniPage lines={v.lines} width={cw - 28} />
            <Footer
              icon={<GitBranch className="size-4 text-muted" />}
              name={`${v.name} resume`}
              chips={
                <>
                  {arrived && (
                    <span style={{ transform: `scale(${lerp(0.5, 1, pop)})`, opacity: pop }} className="inline-flex">
                      {done ? (
                        <Chip tone="ok">
                          <Check className="size-3" /> up to date
                        </Chip>
                      ) : (
                        <Chip tone="warn">
                          <GitPullRequestArrow className="size-3" /> 1 update
                        </Chip>
                      )}
                    </span>
                  )}
                  {!arrived && v.tags.map((tag) => <Chip key={tag}>#{tag}</Chip>)}
                </>
              }
            />
          </Card>
        );
      })}
      {t > 0.28 && t < 0.6 && <Pointer x={cursor.x} y={cursor.y} pressed={holding} />}
    </div>
  );
}

/** A mouse pointer, slightly smaller while the button is held. */
function Pointer({ x, y, pressed }: { x: number; y: number; pressed?: boolean }) {
  return (
    <div className="pointer-events-none absolute top-0 left-0 z-30" style={{ transform: `translate(${x}px, ${y}px) scale(${pressed ? 0.88 : 1})` }}>
      <svg width="20" height="24" viewBox="0 0 18 22" className="drop-shadow">
        <path d="M1 1 L1 17 L5.5 13 L8.5 20 L11.5 18.7 L8.6 12 L14.5 12 Z" fill="#111" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Card({ x, y, w, on, color, thumbH, lifted, children }: { x: number; y: number; w: number; on: number; color: string; thumbH: number; lifted?: boolean; children: ReactNode }) {
  if (on <= 0.001) return null;
  return (
    <div
      className={cn('absolute flex flex-col overflow-visible rounded-xl border bg-panel transition-shadow', lifted ? 'z-20 border-accent/60 shadow-2xl' : 'border-line shadow-lg')}
      style={{ left: x - w / 2, top: y, width: w, opacity: on, transform: `scale(${lerp(0.85, 1, on) * (lifted ? 1.04 : 1)})` }}
    >
      <div className="h-1.5 rounded-t-xl" style={{ background: color }} />
      <div className="overflow-hidden bg-subtle/60 pt-2" style={{ height: thumbH }}>
        {(children as ReactNode[])[0]}
      </div>
      {(children as ReactNode[]).slice(1)}
    </div>
  );
}

function Footer({ icon, name, chips }: { icon: ReactNode; name: string; chips: ReactNode }) {
  return (
    <div className="border-t border-line px-2.5 py-2">
      <div className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold">
        {icon}
        {name}
      </div>
      <div className="mt-1 flex h-5 flex-wrap gap-1 overflow-hidden">{chips}</div>
    </div>
  );
}

function Chip({ tone, children }: { tone?: 'ok' | 'warn'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium',
        tone === 'ok' ? 'bg-ok-soft text-ok' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent',
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- 5: compare side by side

type RowKind = 'same' | 'left' | 'changed';
const ROWS: { l: string; r: string; k: RowKind }[] = [
  { l: '\\section{Experience}', r: '\\section{Experience}', k: 'same' },
  { l: '\\rcEntry{Northwind Analytics}', r: '\\rcEntry{Northwind Analytics}', k: 'same' },
  { l: '\\rcItem{Streaming ingestion in Go}', r: '', k: 'left' },
  { l: '\\rcItem{Moved 35 services to K8s}', r: '', k: 'left' },
  { l: '\\rcItem{Rebuilt the dashboard}', r: '\\rcItem{Rebuilt the dashboard, 2x faster}', k: 'changed' },
  { l: '\\section{Projects}', r: '\\section{Projects}', k: 'same' },
  { l: '\\rcProject{TexChef}{TypeScript}', r: '\\rcProject{TexChef}{TypeScript}', k: 'same' },
  { l: '\\rcProject{Forecast}{Python}', r: '', k: 'left' },
];
/** The row whose block gets copied across. */
const COPY_ROW = 3;

function CompareScene({ t, compact }: { t: number; compact: boolean }) {
  const W = compact ? DEMO_SIZE.compact.w : DEMO_SIZE.wide.w;
  const pad = 16;
  const gutter = 44;
  const colW = (W - pad * 2 - gutter) / 2;
  const head = 40;
  const top = head + 12;
  const rowH = compact ? 28 : 36;
  const slide = ease(seg(t, 0, 0.14));
  const hl = ease(seg(t, 0.18, 0.3));
  const copied = t >= 0.58;
  const flash = 1 - seg(t, 0.58, 0.9);
  const toast = ease(seg(t, 0.62, 0.68)) * (1 - ease(seg(t, 0.95, 1)));
  const arrow = { x: pad + colW + gutter / 2, y: top + COPY_ROW * rowH + rowH / 2 };
  const pIn = ease(seg(t, 0.36, 0.52));
  const pointer = { x: lerp(arrow.x + 150, arrow.x - 4, pIn) + ease(seg(t, 0.62, 0.75)) * 90, y: lerp(arrow.y + 130, arrow.y - 4, pIn) + ease(seg(t, 0.62, 0.75)) * 70 };
  const ripple = seg(t, 0.54, 0.66);
  const font = compact ? 'text-[11px]' : 'text-[13px]';

  const cell = (text: string, kind: 'plain' | 'del' | 'add' | 'chg' | 'gap', key: string) => (
    <div
      key={key}
      className={cn('truncate rounded px-2 font-mono', font)}
      style={{
        height: rowH - 4,
        lineHeight: `${rowH - 4}px`,
        background:
          kind === 'del'
            ? `color-mix(in srgb, var(--danger) ${Math.round(hl * 14)}%, transparent)`
            : kind === 'chg'
              ? `color-mix(in srgb, var(--info) ${Math.round(hl * 14)}%, transparent)`
              : kind === 'add'
                ? `color-mix(in srgb, var(--ok) ${Math.round(10 + flash * 25)}%, transparent)`
                : kind === 'gap'
                  ? `repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--fg) ${Math.round(hl * 6)}%, transparent) 6px 7px)`
                  : undefined,
      }}
    >
      <Tex text={text} />
    </div>
  );

  return (
    <div className="relative h-full overflow-hidden bg-bg">
      {/* Which document is on each side */}
      <div className="absolute inset-x-0 top-0 flex items-center border-b border-line bg-panel text-[12.5px]" style={{ height: head, paddingLeft: pad, paddingRight: pad }}>
        <span className="flex items-center gap-1.5 font-medium" style={{ width: colW }}>
          <Crown className="size-3.5 text-accent" /> Master resume <span className="font-normal text-muted">· current</span>
        </span>
        <span style={{ width: gutter }} />
        <span className="flex items-center gap-1.5 font-medium" style={{ width: colW }}>
          <GitBranch className="size-3.5 text-muted" /> Frontend resume <span className="font-normal text-muted">· current</span>
        </span>
      </div>
      {ROWS.map((r, i) => {
        const shown = ease(seg(t, 0.04 + i * 0.015, 0.16 + i * 0.015));
        const isCopy = i === COPY_ROW;
        const leftKind = r.k === 'same' || (isCopy && copied) ? 'plain' : r.k === 'left' ? 'del' : 'chg';
        const rightKind = r.k === 'same' ? 'plain' : isCopy && copied ? 'add' : r.k === 'left' ? 'gap' : 'chg';
        const rightText = isCopy && copied ? r.l : r.r;
        const showArrow = r.k !== 'same' && !(isCopy && copied);
        return (
          <div key={i} className="absolute flex items-center" style={{ top: top + i * rowH, left: pad, height: rowH, opacity: shown }}>
            <div style={{ width: colW, transform: `translateX(${(1 - slide) * -16}px)` }}>{cell(r.l, leftKind, 'l')}</div>
            <div className="flex items-center justify-center" style={{ width: gutter }}>
              {showArrow && (
                <span
                  className={cn('flex size-6 items-center justify-center rounded-md border bg-panel text-[13px] leading-none text-accent', isCopy && t > 0.5 ? 'border-accent shadow' : 'border-line')}
                  style={{ opacity: hl }}
                >
                  →
                </span>
              )}
            </div>
            <div style={{ width: colW, transform: `translateX(${(1 - slide) * 16}px)` }}>{cell(rightText, rightKind, 'r')}</div>
          </div>
        );
      })}
      {ripple > 0 && ripple < 1 && (
        <span className="absolute size-7 rounded-full border-2 border-accent" style={{ left: arrow.x - 14, top: arrow.y - 14, transform: `scale(${0.4 + ripple * 1.4})`, opacity: 1 - ripple }} />
      )}
      {t > 0.34 && t < 0.8 && <Pointer x={pointer.x} y={pointer.y} pressed={t > 0.53 && t < 0.58} />}
      {toast > 0.01 && (
        <div
          className="absolute bottom-5 left-1/2 flex items-center gap-2 rounded-lg border border-line bg-panel px-3.5 py-2 text-[13px] shadow-lg"
          style={{ opacity: toast, transform: `translate(-50%, ${(1 - toast) * 10}px)` }}
        >
          <Check className="size-4 text-ok" /> Copied the block to “Frontend resume”
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 5: where documents live

function DeviceScene({ t, compact, body }: { t: number; compact: boolean; body: { w: number; h: number } }) {
  const center = { x: body.w / 2, y: compact ? body.h * 0.32 : body.h * 0.44 };
  const cloud = compact ? { x: body.w * 0.74, y: body.h * 0.76 } : { x: body.w * 0.84, y: body.h * 0.44 };
  const server = compact ? { x: body.w * 0.26, y: body.h * 0.76 } : { x: body.w * 0.16, y: body.h * 0.44 };
  const docs = [0, 1, 2, 3, 4].map((j) => {
    const a = -Math.PI / 2 + (j - 2) * 0.62;
    return { x: center.x + Math.cos(a) * (compact ? 170 : 230), y: center.y + Math.sin(a) * (compact ? 150 : 190) + (compact ? 40 : 60) };
  });
  const stored = ease(seg(t, 0.3, 0.4));
  const cloudOn = ease(seg(t, 0.42, 0.52));
  const synced = t >= 0.62;
  const serverOn = ease(seg(t, 0.66, 0.76));
  return (
    <div className="relative h-full overflow-hidden bg-bg">
      {/* the line to Drive */}
      <svg className="absolute inset-0" width={body.w} height={body.h} style={{ opacity: cloudOn }}>
        <line x1={center.x} y1={center.y} x2={cloud.x} y2={cloud.y} stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 7" className="animate-[demo-dash_1s_linear_infinite]" />
      </svg>
      {/* the browser */}
      <Tile x={center.x} y={center.y} w={compact ? 200 : 220} on={1} strong>
        <HardDrive className="size-7 text-accent" />
        <b className="mt-2 text-[15px]">This browser</b>
        <span className="text-[12.5px] text-muted" style={{ opacity: 0.4 + stored * 0.6 }}>
          {stored > 0.5 ? '5 documents, every version' : 'Your documents live here'}
        </span>
      </Tile>
      {docs.map((d, j) => {
        const k = ease(seg(t, 0.04 + j * 0.04, 0.28 + j * 0.04));
        if (k >= 1) return null;
        return (
          <div
            key={j}
            className="absolute flex size-11 items-center justify-center rounded-lg border border-line bg-panel shadow-md"
            style={{ left: lerp(d.x, center.x, k) - 22, top: lerp(d.y, center.y, k) - 22, transform: `scale(${lerp(1, 0.35, k)}) rotate(${lerp((j - 2) * 8, 0, k)}deg)`, opacity: 1 - seg(k, 0.8, 1) }}
          >
            <FileText className="size-5 text-muted" />
          </div>
        );
      })}
      <Tile x={cloud.x} y={cloud.y} w={compact ? 170 : 170} on={cloudOn}>
        <Cloud className="size-6 text-info" />
        <b className="mt-1.5 text-[14px]">Google Drive</b>
        <span className="flex items-center gap-1 text-[11px] text-muted">
          {synced ? (
            <>
              <Check className="size-3 text-ok" /> backed up
            </>
          ) : (
            'optional backup'
          )}
        </span>
      </Tile>
      <Tile x={server.x} y={server.y} w={compact ? 170 : 170} on={serverOn}>
        <ServerOff className="size-6 text-muted" />
        <b className="mt-1.5 text-[14px]">No TexChef server</b>
        <span className="text-[11px] text-muted">nothing to upload to</span>
      </Tile>
    </div>
  );
}

function Tile({ x, y, w, on, strong, children }: { x: number; y: number; w: number; on: number; strong?: boolean; children: ReactNode }) {
  if (on <= 0.001) return null;
  return (
    <div
      className={cn('absolute flex flex-col items-center rounded-2xl border bg-panel px-4 py-4 text-center shadow-lg', strong ? 'border-accent/50 shadow-accent/10' : 'border-line')}
      style={{ left: x - w / 2, top: y - 58, width: w, opacity: on, transform: `translateY(${(1 - on) * 10}px)` }}
    >
      {children}
    </div>
  );
}
