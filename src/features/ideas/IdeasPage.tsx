import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { ArrowRight, BookOpen, Columns2, Cpu, FolderTree, History, MousePointerClick, Smartphone, Sparkles } from 'lucide-react';
import { KurolightMark, Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { DEMO_SIZE, DemoWindow } from './DemoWindow';
import { STEPS, stepOf, stepT } from './motionMath';

/** What the left column says at each step of the story. */
const STORY: { eyebrow: string; short: string; title: string; text: string }[] = [
  { eyebrow: 'Write', short: 'Write', title: 'Type LaTeX. Watch the PDF.', text: 'A full TeX Live runs right in your browser. The PDF follows a moment after you stop typing: nothing to install, nothing uploaded.' },
  { eyebrow: 'Edit on the PDF', short: 'Edit', title: 'Click the PDF. Type the change.', text: 'No hunting for the right line. Click a sentence, change a number, press Enter: TexChef edits the source for you.' },
  { eyebrow: 'Visual mode', short: 'Visual', title: 'Write without the backslashes.', text: 'Headings, bold text and lists show formatted as you write, with buttons for the rest. Same LaTeX underneath: switch back any time.' },
  { eyebrow: 'Versions', short: 'Versions', title: 'One master. Many tailored versions.', text: 'Make a version per job, or per journal, from one master. Fix something once and every version can take the fix, keeping its own edits.' },
  { eyebrow: 'Private', short: 'Private', title: 'Yours, on your device.', text: 'Documents and every version live in your browser. Connect Google Drive if you want a backup and your other devices.' },
];

const GLYPHS = ['\\section', '∑', '{ }', '∫', '\\textbf', 'π', '\\item', '$x^2$', '\\begin', '∂', '%', '\\\\'];

/** A scroll-driven take on the landing page: the features act themselves out as you scroll. */
export function IdeasPage() {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const story = useRef<HTMLElement>(null);
  const lenis = useRef<Lenis | null>(null);
  const reduce = useReducedMotion();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'TexChef: edit with LaTeX easily';
    return () => {
      document.title = 'TexChef';
    };
  }, []);

  // Smooth scrolling (skipped for people who ask for less motion).
  useEffect(() => {
    if (reduce || !scroller.current || !content.current) return;
    const l = new Lenis({ wrapper: scroller.current, content: content.current, lerp: 0.09, autoRaf: true });
    lenis.current = l;
    return () => {
      l.destroy();
      lenis.current = null;
    };
  }, [reduce]);

  const scrollTo = (y: number) => (lenis.current ? lenis.current.scrollTo(y, { duration: 1.4 }) : scroller.current?.scrollTo({ top: y, behavior: 'smooth' }));
  /** Scroll to the middle of step `i` of the story. */
  const goToStep = (i: number) => {
    const s = story.current;
    const box = scroller.current;
    if (!s || !box) return;
    const travel = s.offsetHeight - box.clientHeight;
    scrollTo(s.offsetTop + travel * ((i + 0.55) / STEPS));
  };

  return (
    <div ref={scroller} className="h-full overflow-x-clip overflow-y-auto bg-bg" data-testid="ideas-page">
      <style>{KEYFRAMES}</style>
      <div ref={content}>
        <Nav onStart={() => navigate('/')} />
        <Hero scroller={scroller} onStart={() => navigate('/')} onTour={() => goToStep(0)} reduce={!!reduce} />
        <Story ref={story} scroller={scroller} onStep={goToStep} />
        <Bento />
        <Cta onStart={() => navigate('/')} />
        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-line px-4 py-6 text-xs text-muted">
          <span>TexChef</span>
          <Link to="/help" className="hover:text-fg">
            Guide
          </Link>
          <Link to="/help/whats-new" className="hover:text-fg">
            What’s new
          </Link>
          <Link to="/privacy" className="hover:text-fg">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-fg">
            Terms
          </Link>
          <KurolightMark />
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- top bar and hero

function Nav({ onStart }: { onStart: () => void }) {
  return (
    <div className="sticky top-0 z-30 border-b border-line/60 bg-bg/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Logo size={26} /> TexChef
        </Link>
        <div className="flex-1" />
        <Link to="/help" className="hidden text-sm text-muted hover:text-fg sm:inline">
          Guide
        </Link>
        <button onClick={onStart} className="h-9 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg hover:bg-accent-hover" data-testid="ideas-nav-start">
          Open TexChef
        </button>
      </div>
    </div>
  );
}

function Hero({ scroller, onStart, onTour, reduce }: { scroller: React.RefObject<HTMLDivElement | null>; onStart: () => void; onTour: () => void; reduce: boolean }) {
  const { scrollY } = useScroll({ container: scroller });
  const fade = useTransform(scrollY, [0, 300], [1, 0]);
  const lift = useTransform(scrollY, [0, 420], [0, -60]);
  const words = ['Edit', 'with', 'LaTeX', 'easily,'];
  const words2 = ['all', 'in', 'the', 'browser'];
  const word = (w: string, i: number, accent?: boolean) => (
    <motion.span
      key={w + i}
      className={cn('inline-block', accent && 'bg-gradient-to-r from-accent to-[#2a9d8f] bg-clip-text text-transparent')}
      initial={reduce ? false : { opacity: 0, y: 24, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.7, delay: 0.15 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
    >
      {w}&nbsp;
    </motion.span>
  );
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_50%_35%,black_30%,transparent_75%)]"
        style={{ backgroundImage: 'radial-gradient(color-mix(in srgb, var(--fg) 14%, transparent) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />
      <div aria-hidden="true" className="absolute top-24 left-1/2 -z-10 size-[560px] -translate-x-1/2 rounded-full bg-accent/20 blur-[110px]" />
      <Glyphs scrollY={scrollY} />
      <motion.div style={{ opacity: fade, y: lift }} className="mx-auto max-w-4xl px-4 pt-20 pb-10 text-center sm:pt-28 sm:pb-14">
        <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-7 flex justify-center">
          <span className="shine inline-flex items-center gap-1.5 rounded-full border border-line bg-panel/80 px-3 py-1 text-xs text-muted">
            <Sparkles className="size-3.5 text-accent" /> Visual mode and editing on the PDF, in your browser
          </span>
        </motion.div>
        <h1 className="text-[2.4rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl">
          <span className="mb-2 flex items-center justify-center gap-3 text-accent">
            <motion.span initial={reduce ? false : { scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}>
              <Logo size={48} className="size-10 sm:size-14" />
            </motion.span>
            {word('TexChef:', 0)}
          </span>
          {words.map((w, i) => word(w, i + 1))}
          <br className="hidden sm:block" />
          {words2.map((w, i) => word(w, i + 5, true))}
        </h1>
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.85 }}
          className="mx-auto mt-6 max-w-xl text-base text-pretty text-muted sm:text-lg"
        >
          Compile, preview and edit right on the PDF. Split a master document into tailored versions. All of it on your device.
        </motion.p>
        <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 1 }} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button onClick={onStart} className="group flex h-11 items-center gap-2 rounded-xl bg-accent px-6 font-medium text-accent-fg shadow-lg shadow-accent/25 hover:bg-accent-hover" data-testid="ideas-start">
            Start writing <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button onClick={onTour} className="flex h-11 items-center gap-2 rounded-xl border border-line bg-panel px-6 font-medium hover:bg-subtle" data-testid="ideas-tour">
            See how it works
          </button>
        </motion.div>
      </motion.div>
    </section>
  );
}

/** LaTeX bits drifting behind the hero, at different speeds as you scroll. */
function Glyphs({ scrollY }: { scrollY: MotionValue<number> }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 hidden font-mono text-muted/40 md:block">
      {GLYPHS.map((g, i) => (
        <Glyph key={i} g={g} i={i} scrollY={scrollY} />
      ))}
    </div>
  );
}

function Glyph({ g, i, scrollY }: { g: string; i: number; scrollY: MotionValue<number> }) {
  const depth = 0.3 + (i % 4) * 0.25;
  const y = useTransform(scrollY, [0, 800], [0, -260 * depth]);
  const left = i % 2 ? 6 + ((i * 13) % 22) : 72 + ((i * 11) % 22);
  const top = 12 + ((i * 37) % 70);
  return (
    <motion.span className="absolute" style={{ left: `${left}%`, top: `${top}%`, y, fontSize: 12 + depth * 14, rotate: (i % 3) * 6 - 6 }}>
      {g}
    </motion.span>
  );
}

// ---------------------------------------------------------------- the story: a pinned window that acts out each step

function Story({ ref, scroller, onStep }: { ref: React.Ref<HTMLElement>; scroller: React.RefObject<HTMLDivElement | null>; onStep: (i: number) => void }) {
  const self = useRef<HTMLElement>(null);
  const setRefs = (el: HTMLElement | null) => {
    self.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.RefObject<HTMLElement | null>).current = el;
  };
  const { scrollYProgress } = useScroll({ container: scroller, target: self, offset: ['start start', 'end end'] });
  const { scrollYProgress: entry } = useScroll({ container: scroller, target: self, offset: ['start end', 'start start'] });
  const tilt = useTransform(entry, [0, 1], [24, 0]);
  const scale = useTransform(entry, [0, 1], [0.86, 1]);
  const textIn = useTransform(entry, [0.55, 1], [0, 1]);
  const [p, setP] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setP(v));
  const step = stepOf(p);

  // The window is drawn at a fixed size and scaled to fit the space it has.
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, compact: false, left: 0, top: 0 });
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const compact = el.clientWidth < 600;
      const s = compact ? DEMO_SIZE.compact : DEMO_SIZE.wide;
      const scale = Math.min(1, el.clientWidth / s.w, el.clientHeight / s.h);
      // Side by side (large screens) the window is centred; stacked under the text, it sits just below it.
      const stacked = window.innerWidth < 1024;
      setFit({ compact, scale, left: (el.clientWidth - s.w * scale) / 2, top: stacked ? 8 : (el.clientHeight - s.h * scale) / 2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const size = fit.compact ? DEMO_SIZE.compact : DEMO_SIZE.wide;

  return (
    <section
      ref={setRefs}
      // Pulled up under the hero, so the window already peeks in at the bottom of the first screen.
      className="pointer-events-none relative -mt-[24svh]"
      style={{ height: `${STEPS * 120 + 100}svh` }}
      data-testid="ideas-story"
      data-step={step}
    >
      <div className="sticky top-14 mx-auto flex h-[calc(100svh-3.5rem)] max-w-6xl flex-col gap-4 overflow-hidden px-4 pt-4 pb-4 sm:px-6 lg:flex-row lg:items-center lg:gap-10 lg:pt-0 lg:pb-0">
        {/* What is happening */}
        <motion.div style={{ opacity: textIn }} className="pointer-events-auto mx-auto w-full max-w-xl shrink-0 lg:mx-0 lg:w-[32%] lg:max-w-none">
          <ol className="mb-5 hidden gap-1.5 lg:flex" aria-label="Steps">
            {STORY.map((s, i) => (
              <li key={s.eyebrow} className="flex-1">
                <button onClick={() => onStep(i)} className="group w-full text-left" aria-current={i === step ? 'step' : undefined} data-testid={`ideas-step-${i}`}>
                  <span className="block h-1 overflow-hidden rounded-full bg-line">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${stepT(p, i) * 100}%` }} />
                  </span>
                  <span className={cn('mt-1.5 block truncate text-[11px] transition-colors', i === step ? 'text-fg' : 'text-muted group-hover:text-fg')}>{s.short}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="relative min-h-[150px] sm:min-h-[170px] lg:min-h-[230px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                data-testid="ideas-step-text"
              >
                <p className="text-sm font-medium text-accent">
                  <span className="mr-2 font-mono text-muted lg:hidden">
                    {step + 1}/{STEPS}
                  </span>
                  {STORY[step].eyebrow}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-4xl">{STORY[step].title}</h2>
                <p className="mt-3 text-pretty text-muted sm:mt-4 sm:text-lg">{STORY[step].text}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
        {/* The window */}
        <div ref={stage} className="relative min-h-0 w-full flex-1 lg:h-[min(640px,calc(100svh-7rem))] lg:w-auto" style={{ perspective: 1400 }}>
          <div className="absolute" style={{ left: fit.left, top: fit.top, width: size.w, height: size.h, transform: `scale(${fit.scale})`, transformOrigin: '0 0' }}>
            <motion.div style={{ rotateX: tilt, scale, transformOrigin: '50% 100%' }} className="h-full w-full">
              <DemoWindow p={p} compact={fit.compact} />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- everything else, as a grid

const BENTO: { icon: typeof Cpu; title: string; text: string; wide?: boolean; art: ReactNode }[] = [
  {
    icon: Cpu,
    title: 'TeX Live in your browser',
    text: 'pdfLaTeX, XeLaTeX and LuaLaTeX, with packages fetched as you need them.',
    wide: true,
    art: <CompileArt />,
  },
  { icon: MousePointerClick, title: 'Jump between PDF and source', text: 'Double-click the PDF to find the line; your cursor shows in the PDF.', art: <SyncArt /> },
  { icon: History, title: 'Every version kept', text: 'Numbered versions with what changed. Restore or branch from any.', art: <HistoryArt /> },
  { icon: Columns2, title: 'Compare side by side', text: 'Two documents or versions, both editable, with arrows to copy changes.', art: <CompareArt /> },
  { icon: FolderTree, title: 'Folders, tags and colors', text: 'Keep essays, letters and resumes apart, on a map or in a list.', art: <FolderArt /> },
  { icon: Smartphone, title: 'Phones and tablets too', text: 'One pane at a time on small screens, with buttons sized for fingers.', wide: true, art: <PhoneArt /> },
];

function Bento() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
      <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6 }} className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium text-accent">And the rest of the kitchen</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Everything a LaTeX document needs</h2>
      </motion.div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BENTO.map((b, i) => (
          <motion.div
            key={b.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.55, delay: (i % 3) * 0.08 }}
            className={cn(b.wide && 'lg:col-span-2')}
          >
            <Spotlight className="h-full">
              <div className="flex h-32 items-center justify-center overflow-hidden rounded-xl border border-line/70 bg-subtle/60">{b.art}</div>
              <div className="mt-4 flex items-center gap-2">
                <b.icon className="size-4 text-accent" />
                <h3 className="font-semibold">{b.title}</h3>
              </div>
              <p className="mt-1 text-sm text-pretty text-muted">{b.text}</p>
            </Spotlight>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/** A card with a soft light that follows the pointer. */
function Spotlight({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        ref.current!.style.setProperty('--x', `${e.clientX - r.left}px`);
        ref.current!.style.setProperty('--y', `${e.clientY - r.top}px`);
      }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-accent/40',
        'before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity hover:before:opacity-100',
        'before:bg-[radial-gradient(300px_circle_at_var(--x)_var(--y),color-mix(in_srgb,var(--accent)_12%,transparent),transparent_70%)]',
        className,
      )}
    >
      <div className="relative">{children}</div>
    </div>
  );
}

const inView = { initial: 'off', whileInView: 'on', viewport: { once: false, margin: '-40px' } } as const;

function CompileArt() {
  return (
    <motion.div {...inView} className="flex w-[78%] flex-col gap-2 text-[11px]">
      <div className="flex justify-between font-mono text-muted">
        <span>pdflatex essay.tex</span>
        <motion.span variants={{ off: { opacity: 0 }, on: { opacity: 1, transition: { delay: 1.3 } } }} className="text-ok">
          ✓ 1 page · 0.9 s
        </motion.span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <motion.div className="h-full rounded-full bg-accent" variants={{ off: { width: '0%' }, on: { width: '100%', transition: { duration: 1.2, ease: 'easeInOut' } } }} />
      </div>
      <div className="flex gap-1.5 font-mono text-[10px] text-muted">
        {['amsmath', 'hyperref', 'geometry', 'fontspec'].map((p, i) => (
          <motion.span key={p} className="rounded bg-panel px-1.5 py-0.5" variants={{ off: { opacity: 0, y: 4 }, on: { opacity: 1, y: 0, transition: { delay: 0.2 + i * 0.2 } } }}>
            {p}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

function SyncArt() {
  return (
    <motion.div {...inView} className="flex items-center gap-3">
      <div className="flex w-20 flex-col gap-1.5 rounded-md bg-panel p-2 font-mono text-[8px] text-muted">
        <span>\section{'{'}…{'}'}</span>
        <motion.span className="rounded-sm px-0.5" variants={{ off: { backgroundColor: 'rgba(0,0,0,0)' }, on: { backgroundColor: 'var(--accent-soft)', transition: { delay: 0.8 } } }}>
          Street trees…
        </motion.span>
        <span>\item …</span>
      </div>
      <motion.div variants={{ off: { opacity: 0, x: 8 }, on: { opacity: 1, x: 0, transition: { delay: 0.4 } } }}>
        <ArrowRight className="size-4 rotate-180 text-accent" />
      </motion.div>
      <div className="flex w-20 flex-col gap-1.5 bg-white p-2">
        <span className="h-1 w-3/4 rounded bg-black/40" />
        <motion.span className="h-1 w-full rounded bg-black/20" variants={{ off: { outline: '0px solid transparent' }, on: { outline: '2px solid var(--accent)', transition: { delay: 0.2 } } }} />
        <span className="h-1 w-5/6 rounded bg-black/20" />
        <span className="h-1 w-2/3 rounded bg-black/20" />
      </div>
    </motion.div>
  );
}

function HistoryArt() {
  return (
    <motion.div {...inView} className="flex items-center">
      {['v1', 'v1.1', 'v2', 'v3'].map((v, i) => (
        <div key={v} className="flex items-center">
          {i > 0 && <motion.span className="block h-0.5 w-6 origin-left bg-accent/60" variants={{ off: { scaleX: 0 }, on: { scaleX: 1, transition: { delay: i * 0.25 } } }} />}
          <motion.span
            className="flex size-9 items-center justify-center rounded-full border-2 border-accent bg-panel text-[10px] font-medium"
            variants={{ off: { scale: 0.4, opacity: 0 }, on: { scale: 1, opacity: 1, transition: { delay: i * 0.25 + 0.1, type: 'spring', stiffness: 260, damping: 16 } } }}
          >
            {v}
          </motion.span>
        </div>
      ))}
    </motion.div>
  );
}

function CompareArt() {
  const row = (w: string, tone?: 'add' | 'del') => <span className={cn('block h-1.5 rounded', tone === 'add' ? 'bg-ok/50' : tone === 'del' ? 'bg-danger/40' : 'bg-black/15 dark:bg-white/15')} style={{ width: w }} />;
  return (
    <motion.div {...inView} className="flex gap-2">
      {[0, 1].map((side) => (
        <motion.div key={side} className="flex w-24 flex-col gap-1.5 rounded-md bg-panel p-2" variants={{ off: { x: side ? 14 : -14, opacity: 0 }, on: { x: 0, opacity: 1, transition: { delay: 0.1 } } }}>
          {row('80%')}
          {row('92%', side ? 'add' : 'del')}
          {row('70%')}
          {row('86%', side ? 'add' : undefined)}
          {row('60%')}
        </motion.div>
      ))}
    </motion.div>
  );
}

function FolderArt() {
  const items = [
    ['Essays', '#2a9d8f'],
    ['Letters', '#d9661f'],
    ['Resumes', 'var(--accent)'],
  ];
  return (
    <motion.div {...inView} className="flex gap-2.5">
      {items.map(([name, c], i) => (
        <motion.div key={name} className="w-20 rounded-lg border border-line bg-panel p-2 text-[10px]" variants={{ off: { y: 14, opacity: 0 }, on: { y: 0, opacity: 1, transition: { delay: i * 0.15 } } }}>
          <span className="mb-1.5 block h-1.5 w-8 rounded-full" style={{ background: c }} />
          <b>{name}</b>
          <span className="block text-muted">{3 - i + 1} docs</span>
        </motion.div>
      ))}
    </motion.div>
  );
}

function PhoneArt() {
  return (
    <motion.div {...inView} className="flex items-end gap-4">
      <motion.div className="h-24 w-14 rounded-xl border-2 border-fg/70 bg-panel p-1.5" variants={{ off: { y: 20, opacity: 0 }, on: { y: 0, opacity: 1 } }}>
        <span className="block h-full rounded-md bg-white p-1">
          <span className="mb-1 block h-1 w-3/4 rounded bg-black/40" />
          <span className="mb-0.5 block h-0.5 rounded bg-black/20" />
          <span className="mb-0.5 block h-0.5 w-5/6 rounded bg-black/20" />
        </span>
      </motion.div>
      <motion.div className="h-20 w-28 rounded-xl border-2 border-fg/70 bg-panel p-1.5" variants={{ off: { y: 20, opacity: 0 }, on: { y: 0, opacity: 1, transition: { delay: 0.15 } } }}>
        <span className="flex h-full gap-1">
          <span className="block flex-1 rounded-md bg-subtle" />
          <span className="block flex-1 rounded-md bg-white" />
        </span>
      </motion.div>
      <motion.div className="h-16 w-36 rounded-lg border-2 border-fg/70 bg-panel p-1.5" variants={{ off: { y: 20, opacity: 0 }, on: { y: 0, opacity: 1, transition: { delay: 0.3 } } }}>
        <span className="flex h-full gap-1">
          <span className="block w-1/5 rounded bg-subtle" />
          <span className="block flex-1 rounded bg-subtle" />
          <span className="block flex-1 rounded bg-white" />
        </span>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- the end

function Cta({ onStart }: { onStart: () => void }) {
  return (
    <section className="px-4 pb-24 sm:px-6 sm:pb-32">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6 }}
        className="beam relative mx-auto max-w-4xl overflow-hidden rounded-3xl p-px"
      >
        <div className="relative rounded-[23px] bg-panel px-6 py-14 text-center sm:py-20">
          <div aria-hidden="true" className="absolute inset-x-0 -top-24 mx-auto size-72 rounded-full bg-accent/20 blur-3xl" />
          <h2 className="relative text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Start writing. It’s free.</h2>
          <p className="relative mx-auto mt-4 max-w-md text-pretty text-muted">A blank article, a master resume or a cover letter: pick one and the PDF is ready in seconds.</p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button onClick={onStart} className="group flex h-11 items-center gap-2 rounded-xl bg-accent px-6 font-medium text-accent-fg shadow-lg shadow-accent/25 hover:bg-accent-hover">
              New document <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <Link to="/help" className="flex h-11 items-center gap-2 rounded-xl border border-line px-6 font-medium hover:bg-subtle">
              <BookOpen className="size-4" /> TexChef Guide
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

const KEYFRAMES = `
@keyframes demo-dash { to { stroke-dashoffset: -26; } }
@keyframes ideas-shine { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@keyframes ideas-beam { to { transform: rotate(1turn); } }
.shine { background-image: linear-gradient(110deg, transparent 35%, color-mix(in srgb, var(--accent) 18%, transparent) 50%, transparent 65%); background-size: 200% 100%; animation: ideas-shine 4s linear infinite; }
.beam::before { content: ''; position: absolute; inset: -60%; background: conic-gradient(from 0deg, transparent 0 70%, var(--accent) 85%, #2a9d8f 92%, transparent 100%); animation: ideas-beam 6s linear infinite; }
.beam::after { content: ''; position: absolute; inset: 0; border-radius: 1.5rem; border: 1px solid var(--color-line); pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .shine, .beam::before, [class*='demo-dash'] { animation: none !important; } }
`;
