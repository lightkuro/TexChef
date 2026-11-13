import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, Check, Cloud, Crown, FileText, GitBranch, GitPullRequestArrow, HardDrive, Pencil, Play, ServerOff, Type, X } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { Card, Chip, COPY_ROW, Footer, LINES, MiniPage, ROWS, Tex, Tile, TreeFigure, VARIANTS } from './DemoWindow';
import { ease, lerp, seg } from './motionMath';

/**
 * The cleaned-up look's demo (/ideas/clean): the same drawn TexChef window, with scenes that take a second or so,
 * no pointer, and a finished frame that is worth looking at on its own. The scene names are tabs along the top;
 * the scene number and a play-again button sit along the bottom.
 */
export const CLEAN_STORY: { short: string; title: string; text: string; secs: number }[] = [
  { short: 'Write', title: 'Type LaTeX. Watch the PDF.', text: 'A full TeX Live runs right in your browser. The PDF follows a moment after you stop typing: nothing to install, nothing uploaded.', secs: 1.1 },
  { short: 'Edit', title: 'Click the PDF. Type the change.', text: 'No hunting for the right line. Click a sentence, change a number, press Enter: TexChef edits the source for you.', secs: 1.5 },
  { short: 'Versions', title: 'One master. Many tailored versions.', text: 'Make a version per job, or per journal, and arrange them on the map. Fix something once and every version can take the fix, keeping its own edits.', secs: 1.5 },
  { short: 'Compare', title: 'Two documents, side by side.', text: 'Any two documents or versions next to each other, with the differences marked. Copy a line or a whole block across in one click.', secs: 1.1 },
  { short: 'Private', title: 'Yours, on your device.', text: 'Documents and every version live in your browser. Connect Google Drive if you want a backup and your other devices.', secs: 1.3 },
];

/** The drawn window (its header and scene), before scaling. The tabs and the bottom bar are drawn at full size. */
export const CLEAN_SIZE = { wide: { w: 880, h: 520 }, compact: { w: 520, h: 620 } } as const;
export const CLEAN_BAR = 40;
export const CLEAN_FOOT = 36;
const HEADER = 42;

/** Progress from `a` to `b` milliseconds, eased. */
type K = (a: number, b: number) => number;
interface SceneProps {
  ms: number;
  k: K;
  compact: boolean;
  body: { w: number; h: number };
}

export function CleanFrame({
  step,
  t,
  compact,
  scale,
  onStep,
  onReplay,
}: {
  step: number;
  /** How far the scene's animation has played, from 0 to 1. */
  t: number;
  compact: boolean;
  scale: number;
  onStep: (i: number) => void;
  /** Set once the scene has finished: shows the play-again button. */
  onReplay?: () => void;
}) {
  const size = compact ? CLEAN_SIZE.compact : CLEAN_SIZE.wide;
  const body = { w: size.w, h: size.h - HEADER };
  const at = (i: number) => {
    const ms = (i < step ? 1 : i === step ? t : 0) * CLEAN_STORY[i].secs * 1000;
    const k: K = (a, b) => ease(seg(ms, a, b));
    return { ms, k, compact, body };
  };
  const ms = at(step).ms;
  const status = [ms < 960 ? 'Compiling…' : 'Compiled · 1 page', ms < 1040 ? 'Compiled · 1 page' : 'Updated', '4 documents', ms < 700 ? '3 changes' : '2 changes', ms < 900 ? 'Local only' : 'Backed up'][step];
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-lg shadow-black/5 dark:shadow-black/30" style={{ width: Math.round(size.w * scale) }} data-testid="ideas-frame">
      {/* The scenes, as tabs */}
      <div role="tablist" aria-label="Scenes" className="flex shrink-0 border-b border-line bg-subtle" style={{ height: CLEAN_BAR }}>
        {CLEAN_STORY.map((s, i) => (
          <button
            key={s.short}
            role="tab"
            aria-selected={i === step}
            onClick={() => onStep(i)}
            className={cn(
              'pointer-events-auto -mb-px min-w-0 flex-1 truncate border-r border-line px-1 text-[13px] font-medium transition-colors duration-150 sm:flex-none sm:px-4',
              i === step ? 'bg-panel text-fg shadow-[inset_0_2px_0_var(--accent)]' : 'text-muted hover:bg-panel/60 hover:text-fg',
            )}
            data-testid={`ideas-step-${i}`}
          >
            {s.short}
          </button>
        ))}
      </div>
      <div className="relative overflow-hidden" style={{ height: Math.round(size.h * scale) }} aria-hidden="true">
        <div className="flex flex-col text-fg select-none" style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          {/* App header */}
          <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-3 text-[14px]" style={{ height: HEADER }}>
            <ArrowLeft className="size-4 text-muted" />
            <Logo size={20} />
            <span className="flex-1" />
            <span className="rounded-full bg-subtle px-2 py-0.5 text-[12px] text-muted tabular-nums">{status}</span>
            {!compact && (
              <span className="flex h-7 items-center gap-1 rounded-md border border-line px-2.5 text-[12.5px]">
                <GitBranch className="size-3.5" /> New variant
              </span>
            )}
            <span className="flex h-7 items-center gap-1 rounded-md bg-accent px-3 text-[12.5px] font-medium text-accent-fg">Compile</span>
          </div>
          <div className="relative min-h-0 flex-1">
            <Scene on={step === 0}>
              <WriteScene {...at(0)} />
            </Scene>
            <Scene on={step === 1}>
              <EditScene {...at(1)} />
            </Scene>
            <Scene on={step === 2}>
              <VersionsScene {...at(2)} />
            </Scene>
            <Scene on={step === 3}>
              <CompareScene {...at(3)} />
            </Scene>
            <Scene on={step === 4}>
              <PrivateScene {...at(4)} />
            </Scene>
          </div>
        </div>
      </div>
      {/* Which scene this is, and (once it has played) a button to play it again */}
      <div className="flex shrink-0 items-center border-t border-line pr-1.5 pl-3 text-xs text-muted" style={{ height: CLEAN_FOOT }}>
        <span className="font-mono tabular-nums" data-testid="ideas-count">
          {step + 1} / {CLEAN_STORY.length}
        </span>
        <span className="flex-1" />
        {onReplay && (
          <button
            onClick={onReplay}
            className="pointer-events-auto flex size-7 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-subtle hover:text-fg"
            aria-label={`Play “${CLEAN_STORY[step].short}” again`}
            title="Play again"
            data-testid="ideas-replay"
          >
            <Play className="size-3.5 fill-current" />
          </button>
        )}
      </div>
    </div>
  );
}

function Scene({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div className="absolute inset-0 transition-opacity duration-150" style={{ opacity: on ? 1 : 0, visibility: on ? 'visible' : 'hidden' }}>
      {children}
    </div>
  );
}

/** Fades and settles in as `v` goes from 0 to 1. */
const rise = (v: number): CSSProperties => ({ opacity: v, transform: v < 1 ? `translateY(${(1 - v) * 5}px)` : undefined });

// ---------------------------------------------------------------- the typeset page

/** The essay as LaTeX prints it. `show` says how far each of its three parts has appeared. */
function Page({ show, sentence, top = 36, width = 400, side = 36 }: { show: (part: number) => number; sentence: ReactNode; top?: number; width?: number; side?: number }) {
  return (
    <div className="bg-white pb-6 font-serif text-[#1a1a1a] shadow-md" style={{ width, minHeight: 540, paddingTop: top, paddingLeft: side, paddingRight: side }}>
      <div className="text-center" style={rise(show(0))}>
        <div className="text-[18px]">Why Cities Plant Trees</div>
        <div className="mt-1 text-[11px]">Maya Chef</div>
      </div>
      <div style={rise(show(1))}>
        <div className="mt-5 text-[13px] font-bold">1&nbsp;&nbsp;Introduction</div>
        <p className="mt-1.5 text-justify text-[10.5px] leading-[1.45]">
          Street trees cool the air by <b>3 degrees</b> on summer afternoons, for decades.
        </p>
        <div className="relative mt-1.5 text-[10.5px] leading-[1.45]">{sentence}</div>
      </div>
      <div style={rise(show(2))}>
        <div className="mt-4 text-[13px] font-bold">2&nbsp;&nbsp;What trees give back</div>
        <ul className="mt-1.5 space-y-0.5 pl-4 text-[10.5px] leading-[1.45]">
          <li>• Shade that lowers cooling costs</li>
          <li>• Roots that soak up storm water</li>
        </ul>
        <div className="mt-3 flex items-center text-[11.5px] italic">
          <span className="flex-1 text-center">S = n · s</span>
          <span className="not-italic">(1)</span>
        </div>
        <figure className="mt-5 flex flex-col items-center">
          <TreeFigure />
        </figure>
      </div>
    </div>
  );
}

/** One number giving way to another: the old one slides up and out as the new one comes in from below. */
function Roll({ from, to, v }: { from: string; to: string; v: number }) {
  if (v <= 0 || v >= 1) return <>{v <= 0 ? from : to}</>;
  return (
    <span className="inline-grid leading-[1.2] [clip-path:inset(0)]">
      <span className="[grid-area:1/1]" style={{ transform: `translateY(${-v * 100}%)`, opacity: 1 - v }}>
        {from}
      </span>
      <span className="[grid-area:1/1]" style={{ transform: `translateY(${(1 - v) * 100}%)`, opacity: v }}>
        {to}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- 1: write

/** The source arrives in three parts; the page follows each. */
const PART_OF = (line: number) => (line <= 6 ? 0 : line <= 10 ? 1 : 2);
const PART_MS = 320;

function WriteScene({ k, compact, body }: SceneProps) {
  const code = (part: number) => k(part * PART_MS, part * PART_MS + 180);
  const page = (part: number) => k(part * PART_MS + 140, part * PART_MS + 320);
  const codeH = compact ? 262 : body.h;
  // Small screens: the source pane is short, so it follows the newest part.
  const lastShown = LINES.reduce((last, _l, i) => (code(PART_OF(i)) > 0 ? i : last), 6);
  const shift = Math.max(0, (lastShown + 1) * 22 + 16 - (codeH - 32));
  return (
    <div className={cn('flex h-full', compact ? 'flex-col' : 'flex-row')}>
      <div className="flex min-h-0 flex-col border-line bg-panel" style={{ height: codeH, width: compact ? '100%' : '50%', borderRightWidth: compact ? 0 : 1, borderBottomWidth: compact ? 1 : 0 }}>
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3 text-[12.5px] text-muted">
          <span className="font-mono text-fg">essay.tex</span> main file
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="absolute inset-x-0 top-0 pt-2 transition-transform duration-200" style={{ transform: `translateY(${-shift}px)` }}>
            {LINES.map((l, i) => (
              <div key={i} className="flex h-[22px]" style={rise(code(PART_OF(i)))}>
                <span className="w-8 shrink-0 pr-2 text-right font-mono text-[12px] leading-[22px] text-muted/70">{i + 1}</span>
                <div className="min-w-0 flex-1 px-1 font-mono text-[13px] leading-[22px] whitespace-pre">
                  <Tex text={l.tex} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={cn('min-h-0 flex-1 overflow-hidden bg-subtle', compact ? 'px-6 pt-4' : 'px-5 pt-5')}>
        <div className="mx-auto w-[400px]">
          <Page show={page} sentence="In our survey, 60% of residents want more." />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 2: edit on the PDF

function EditScene({ ms, k, compact }: SceneProps) {
  // Small screens get a narrower page, so the zoom can stay high and the sentence readable.
  const zoom = compact ? 1.9 : 2;
  const width = compact ? 264 : 400;
  const boxZoom = compact ? 1.3 : 1;
  const picked = k(0, 150);
  const pop = k(150, 330);
  const selected = ms >= 380 && ms < 700;
  const inBox = k(620, 860);
  const pressed = ms >= 900 && ms < 1040;
  const onPage = k(1040, 1300);
  const flash = ms >= 1040 ? 1 - seg(ms, 1100, 1500) : 0;
  return (
    <div className="h-full overflow-hidden bg-subtle pt-5">
      <div className="mx-auto" style={{ width: width * zoom }}>
        <div style={{ width, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
          <Page
            show={() => 1}
            width={width}
            side={compact ? 18 : 36}
            top={compact ? 24 : 20}
            sentence={
              <>
                <span
                  className="relative -mx-1 rounded-[3px] px-1"
                  style={{
                    outline: `1px solid color-mix(in srgb, var(--accent) ${Math.round(picked * 100)}%, transparent)`,
                    background: `color-mix(in srgb, var(--accent) ${Math.round(picked * 10 + flash * 22)}%, transparent)`,
                  }}
                >
                  In our survey, <Roll from="60" to="75" v={onPage} />% of residents want more.
                </span>
                {/* The edit box, at its real size whatever the page's zoom. It stays open on the finished frame. */}
                {pop > 0.01 && (
                  <div className="absolute top-full left-[-4px] z-10 mt-1.5" style={{ transform: `scale(${boxZoom / zoom})`, transformOrigin: 'top left' }}>
                    <div
                      className="w-[300px] rounded-lg border border-line bg-panel p-2 font-sans text-fg shadow-xl"
                      style={{ opacity: pop, transform: `translateY(${(1 - pop) * -6}px) scale(${lerp(0.97, 1, pop)})`, transformOrigin: 'top left' }}
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
                        <span className={cn('rounded-[2px] transition-colors duration-150', selected && 'bg-accent/30')}>
                          <Roll from="60" to="75" v={inBox} />%
                        </span>{' '}
                        of residents want more.
                      </div>
                      <div className="mt-1.5 flex h-7 items-center gap-2 text-[10.5px] text-muted">
                        Enter saves
                        <span className="ml-auto">Cancel</span>
                        <span
                          className="rounded-md bg-accent px-2.5 py-1 font-medium text-accent-fg transition-[transform,box-shadow] duration-100"
                          style={{ transform: pressed ? 'scale(0.94)' : undefined, boxShadow: pressed ? '0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent)' : undefined }}
                        >
                          Save ↵
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 3: versions on the map

function VersionsScene({ ms, k, compact, body }: SceneProps) {
  const cw = compact ? 136 : 168;
  const thumbH = compact ? 96 : 116;
  const ch = thumbH + 66;
  const master = { x: body.w / 2, y: compact ? 40 : 24 };
  const row = compact ? body.h - ch - 70 : body.h - ch - 40;
  const xs = compact ? [body.w * 0.17, body.w * 0.5, body.w * 0.83] : [body.w * 0.2, body.w * 0.5, body.w * 0.78];
  // The three versions leave the master together; then one fix travels to all of them together.
  const out = k(150, 520);
  const edited = k(620, 760);
  const travel = k(780, 1080);
  const chips = k(1080, 1200);
  const taken = k(1320, 1440);
  return (
    <div className="relative h-full overflow-hidden bg-bg" style={{ backgroundImage: 'radial-gradient(color-mix(in srgb, var(--fg) 12%, transparent) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
      <svg className="absolute inset-0" width={body.w} height={body.h}>
        {xs.map((x, i) => {
          const x1 = master.x;
          const y1 = master.y + ch;
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={lerp(x1, x, out)} y2={lerp(y1, row, out)} stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" opacity={out > 0 ? 0.8 : 0} />
              {travel > 0 && travel < 1 && <circle cx={lerp(x1, x, travel)} cy={lerp(y1, row, travel)} r={5.5} fill="#e8a317" stroke="#fff" strokeWidth={2} />}
            </g>
          );
        })}
      </svg>
      <Card x={master.x} y={master.y} w={cw} on={k(0, 180)} color="var(--accent)" thumbH={thumbH}>
        <MiniPage lines={14} width={cw - 28} />
        <Footer icon={<Crown className="size-4 text-accent" />} name="Master resume" chips={<Chip>3 variants</Chip>} />
        {edited > 0 && (
          <span className="absolute -top-3 -right-5 flex items-center gap-1 rounded-full bg-fg px-2.5 py-0.5 text-[11.5px] font-medium text-bg shadow-md" style={{ opacity: edited, transform: `scale(${lerp(0.6, 1, edited)})` }}>
            <Pencil className="size-3" /> Fixed a typo
          </span>
        )}
      </Card>
      {VARIANTS.map((v, i) => {
        const done = i === 0 && ms >= 1320;
        const pop = done ? taken : chips;
        return (
          <Card key={v.name} x={lerp(master.x, xs[i], out)} y={lerp(master.y + 20, row, out)} w={cw} on={out} color={v.color} thumbH={thumbH}>
            <MiniPage lines={v.lines} width={cw - 28} />
            <Footer
              icon={<GitBranch className="size-4 text-muted" />}
              name={compact ? v.name : `${v.name} resume`}
              chips={
                chips > 0 ? (
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
                ) : (
                  v.tags.map((tag) => <Chip key={tag}>#{tag}</Chip>)
                )
              }
            />
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- 4: compare side by side

function CompareScene({ ms, k, compact, body }: SceneProps) {
  const pad = 16;
  const gutter = 44;
  const colW = (body.w - pad * 2 - gutter) / 2;
  const head = 40;
  const top = head + 12;
  const rowH = compact ? 28 : 36;
  const font = compact ? 'text-[11px]' : 'text-[13px]';
  // Everything is there from the start. One line is picked, crosses to the other side, and lands.
  const focus = k(120, 300);
  const move = k(320, 700);
  const copied = ms >= 700;
  const flash = copied ? 1 - seg(ms, 700, 1100) : 0;
  const toast = k(740, 900);

  const cell = (text: string, kind: 'plain' | 'del' | 'add' | 'chg' | 'gap', strong = 0) => (
    <div
      className={cn('truncate rounded px-2 font-mono', font)}
      style={{
        height: rowH - 4,
        lineHeight: `${rowH - 4}px`,
        background:
          kind === 'del'
            ? `color-mix(in srgb, var(--danger) ${Math.round(14 + strong * 10)}%, transparent)`
            : kind === 'chg'
              ? 'color-mix(in srgb, var(--info) 14%, transparent)'
              : kind === 'add'
                ? `color-mix(in srgb, var(--ok) ${Math.round(12 + flash * 24)}%, transparent)`
                : kind === 'gap'
                  ? 'repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--fg) 6%, transparent) 6px 7px)'
                  : undefined,
      }}
    >
      <Tex text={text} />
    </div>
  );

  return (
    <div className="relative h-full overflow-hidden bg-bg">
      <div className="absolute inset-x-0 top-0 flex items-center border-b border-line bg-panel text-[12.5px]" style={{ height: head, paddingLeft: pad, paddingRight: pad }}>
        <span className="flex items-center gap-1.5 truncate font-medium" style={{ width: colW }}>
          <Crown className="size-3.5 shrink-0 text-accent" /> Master resume <span className="font-normal text-muted">· current</span>
        </span>
        <span style={{ width: gutter }} />
        <span className="flex items-center gap-1.5 truncate font-medium" style={{ width: colW }}>
          <GitBranch className="size-3.5 shrink-0 text-muted" /> Frontend resume <span className="font-normal text-muted">· current</span>
        </span>
      </div>
      {ROWS.map((r, i) => {
        const isCopy = i === COPY_ROW;
        const done = isCopy && copied;
        return (
          <div key={i} className="absolute flex items-center" style={{ top: top + i * rowH, left: pad, height: rowH }}>
            <div style={{ width: colW }}>{cell(r.l, r.k === 'same' || done ? 'plain' : r.k === 'left' ? 'del' : 'chg', isCopy ? focus : 0)}</div>
            <div className="flex items-center justify-center" style={{ width: gutter }}>
              {r.k !== 'same' && !done && (
                <span
                  className="flex size-6 items-center justify-center rounded-md border bg-panel text-[13px] leading-none text-accent"
                  style={
                    isCopy
                      ? { borderColor: `color-mix(in srgb, var(--accent) ${Math.round(focus * 100)}%, var(--color-line))`, boxShadow: `0 0 0 ${focus * 3}px color-mix(in srgb, var(--accent) 22%, transparent)` }
                      : { borderColor: 'var(--color-line)' }
                  }
                >
                  →
                </span>
              )}
            </div>
            <div style={{ width: colW }}>{cell(done ? r.l : r.r, r.k === 'same' ? 'plain' : done ? 'add' : r.k === 'left' ? 'gap' : 'chg')}</div>
          </div>
        );
      })}
      {/* The line on its way across */}
      {move > 0 && !copied && (
        <div
          className={cn('absolute truncate rounded border border-accent bg-panel px-2 font-mono shadow-md', font)}
          style={{ top: top + COPY_ROW * rowH + 2, left: pad + move * (colW + gutter), width: colW, height: rowH - 4, lineHeight: `${rowH - 6}px`, opacity: seg(move, 0, 0.15) }}
        >
          <Tex text={ROWS[COPY_ROW].l} />
        </div>
      )}
      {toast > 0.01 && (
        <div className="absolute bottom-5 left-1/2 flex items-center gap-2 rounded-lg border border-line bg-panel px-3.5 py-2 text-[13px] whitespace-nowrap shadow-lg" style={{ opacity: toast, transform: `translate(-50%, ${(1 - toast) * 8}px)` }}>
          <Check className="size-4 text-ok" /> Copied the line to “Frontend resume”
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 5: where documents live

function PrivateScene({ ms, k, compact, body }: SceneProps) {
  const center = compact ? { x: body.w / 2, y: body.h * 0.25 } : { x: body.w / 2, y: body.h * 0.36 };
  const server = compact ? { x: body.w * 0.24, y: body.h * 0.62 } : { x: body.w * 0.15, y: body.h * 0.36 };
  const cloud = compact ? { x: body.w * 0.76, y: body.h * 0.62 } : { x: body.w * 0.85, y: body.h * 0.36 };
  const docs = [0, 1, 2, 3, 4].map((j) => {
    const a = -Math.PI / 2 + (j - 2) * 0.62;
    return { x: center.x + Math.cos(a) * (compact ? 150 : 210), y: center.y + Math.sin(a) * (compact ? 120 : 150) + (compact ? 30 : 50) };
  });
  // The documents arrive together; both neighbours appear together; then the one switch is flipped.
  const arrive = k(0, 380);
  const stored = k(330, 450);
  const sides = k(380, 560);
  const ring = ms >= 680 && ms < 920;
  const toggled = k(760, 900);
  const synced = ms >= 900;
  const words = [
    { text: 'Offline.', on: k(480, 620) },
    { text: 'Online.', on: k(880, 1020) },
    { text: 'Your choice.', on: k(1060, 1200) },
  ];
  const sw = { x: (center.x + cloud.x) / 2, y: (center.y + cloud.y) / 2 };
  const mid = { x: (center.x + server.x) / 2, y: (center.y + server.y) / 2 };
  return (
    <div className="relative h-full overflow-hidden bg-bg">
      <svg className="absolute inset-0" width={body.w} height={body.h}>
        <line x1={center.x} y1={center.y} x2={server.x} y2={server.y} stroke="var(--color-line)" strokeWidth={2} strokeDasharray="5 6" opacity={sides} />
        <line x1={center.x} y1={center.y} x2={cloud.x} y2={cloud.y} stroke={toggled > 0.5 ? 'var(--accent)' : 'var(--color-line)'} strokeWidth={2} strokeDasharray={toggled > 0.5 ? undefined : '6 7'} opacity={sides} />
      </svg>
      {sides > 0 && (
        <>
          <span className="absolute flex size-7 items-center justify-center rounded-full border border-line bg-panel text-danger shadow-sm" style={{ left: mid.x - 14, top: mid.y - 14, opacity: sides, transform: `scale(${lerp(0.5, 1, sides)})` }}>
            <X className="size-4" strokeWidth={2.5} />
          </span>
          <span
            className={cn('absolute flex h-6 w-11 items-center rounded-full border p-0.5 shadow-sm transition-[background-color,border-color,box-shadow] duration-150', toggled > 0.5 ? 'border-accent bg-accent' : 'border-line bg-subtle')}
            style={{ left: sw.x - 22, top: sw.y - 12, opacity: sides, boxShadow: ring ? '0 0 0 4px color-mix(in srgb, var(--accent) 28%, transparent)' : undefined }}
          >
            <span className="size-[18px] rounded-full bg-white shadow" style={{ transform: `translateX(${toggled * 20}px)` }} />
          </span>
        </>
      )}
      <Tile x={center.x} y={center.y} w={compact ? 200 : 220} on={1} strong>
        <HardDrive className="size-7 text-accent" />
        <b className="mt-2 text-[15px]">This browser</b>
        <span className="text-[12.5px] text-muted">{stored > 0.5 ? '5 documents, every version' : 'Your documents live here'}</span>
      </Tile>
      {arrive < 1 &&
        docs.map((d, j) => (
          <div
            key={j}
            className="absolute flex size-11 items-center justify-center rounded-lg border border-line bg-panel shadow-md"
            style={{ left: lerp(d.x, center.x, arrive) - 22, top: lerp(d.y, center.y, arrive) - 22, transform: `scale(${lerp(1, 0.35, arrive)}) rotate(${lerp((j - 2) * 8, 0, arrive)}deg)`, opacity: 1 - seg(arrive, 0.8, 1) }}
          >
            <FileText className="size-5 text-muted" />
          </div>
        ))}
      <Tile x={server.x} y={server.y} w={compact ? 150 : 170} on={sides}>
        <ServerOff className="size-6 text-muted" />
        <b className="mt-1.5 text-[14px]">No TexChef server</b>
        <span className="text-[11.5px] text-muted">nothing to upload to</span>
      </Tile>
      <Tile x={cloud.x} y={cloud.y} w={compact ? 150 : 170} on={sides}>
        <Cloud className={cn('size-6 transition-colors duration-150', toggled > 0.5 ? 'text-info' : 'text-muted')} />
        <b className="mt-1.5 text-[14px]">Your Google Drive</b>
        <span className="flex items-center gap-1 text-[11.5px] text-muted">
          {synced ? (
            <>
              <Check className="size-3 text-ok" /> backed up
            </>
          ) : (
            'optional backup'
          )}
        </span>
      </Tile>
      <div className="absolute inset-x-0 flex justify-center gap-3 text-[20px] font-semibold tracking-tight" style={{ top: compact ? body.h * 0.84 : body.h * 0.72 }}>
        {words.map((w, i) => (
          <span key={w.text} className={i === 2 ? 'text-accent' : 'text-fg'} style={{ opacity: w.on, transform: `translateY(${(1 - w.on) * 6}px)` }}>
            {w.text}
          </span>
        ))}
      </div>
    </div>
  );
}
