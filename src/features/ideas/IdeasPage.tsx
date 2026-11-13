import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, animate, motion, useInView, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { ArrowRight, BookOpen, ChevronDown, Columns2, Cpu, FolderTree, GitBranch, HardDrive, History, MousePointerClick, RotateCcw, Smartphone, type LucideIcon } from 'lucide-react';
import { KurolightMark, Logo } from '@/components/Logo';
import { ActionDropdown, type MenuAction } from '@/components/ActionMenu';
import { NewDocDialog } from '@/features/dashboard/NewDocDialog';
import { APP_VERSION } from '@/app/changelog';
import { cn } from '@/lib/utils';
import { DEMO_SIZE, DemoWindow } from './DemoWindow';
import { CLEAN_STORY } from './CleanDemo';
import { CleanStory } from './CleanStory';

/** What the story says at each scene, and how long the scene's animation plays (seconds). */
const STORY: { short: string; title: string; text: string; secs: number }[] = [
  { short: 'Write', title: 'Type LaTeX. Watch the PDF.', text: 'A full TeX Live runs right in your browser. The PDF follows a moment after you stop typing: nothing to install, nothing uploaded.', secs: 5 },
  { short: 'Edit', title: 'Click the PDF. Type the change.', text: 'No hunting for the right line. Click a sentence, change a number, press Enter: TexChef edits the source for you.', secs: 5.5 },
  { short: 'Visual', title: 'Write without the backslashes.', text: 'Headings, bold text and lists show formatted as you write, with buttons for the rest. Same LaTeX underneath: switch back any time.', secs: 3.5 },
  { short: 'Versions', title: 'One master. Many tailored versions.', text: 'Make a version per job, or per journal, and arrange them on the map. Fix something once and every version can take the fix, keeping its own edits.', secs: 6 },
  { short: 'Compare', title: 'Two documents, side by side.', text: 'Any two documents or versions next to each other, with the differences marked. Copy a line or a whole block across in one click.', secs: 4.5 },
  { short: 'Private', title: 'Yours, on your device.', text: 'Documents and every version live in your browser. Connect Google Drive if you want a backup and your other devices.', secs: 4 },
];
const N = STORY.length;

const PITCH: { icon: LucideIcon; text: string }[] = [
  { icon: MousePointerClick, text: 'Compile, preview and edit right on the PDF.' },
  { icon: GitBranch, text: 'Split master documents into multiple versions.' },
  { icon: HardDrive, text: 'Processed locally, with optional Drive backup.' },
];

export interface CoverProps {
  /** Ease onto the nearest scene when scrolling stops. */
  snap?: boolean;
  /** 'page': a page of its own (with a top bar and footer); 'app': the home page for new users; 'help': the help's Intro. */
  mode?: 'page' | 'app' | 'help';
  /** Start a document (the home page passes its own dialog); otherwise the page opens New document itself. */
  onNew?: () => void;
  /** Shown under the arrow beside Start writing. */
  uploadActions?: MenuAction[];
  /** More controls for the top bar (the home page adds Drive sync and themes). */
  navExtra?: ReactNode;
  testId?: string;
  /**
   * 'clean' is a design study (/ideas/clean): the same page left-aligned, with no gradients, glass or
   * entrance animations, and with scene changes kept under 400 ms.
   */
  look?: 'default' | 'clean';
  /** Show the links between the landing page ideas (the /ideas pages only). */
  switcher?: boolean;
}

/**
 * The landing page as a story: a pinned TexChef window plays one scene per screen of scrolling. Scrolling picks the
 * scene; each scene then plays at its own pace, so a fast flick doesn't rush it and a slow reader needn't scroll it out.
 */
export function IdeasPage({ snap = true, mode = 'page', onNew, uploadActions, navExtra, testId = 'ideas-page', look = 'default', switcher }: CoverProps) {
  const clean = look === 'clean';
  // The clean look tells the story in five scenes (no Visual scene).
  const scenes = clean ? CLEAN_STORY : STORY;
  const n = scenes.length;
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const story = useRef<HTMLElement>(null);
  const heroCta = useRef<HTMLDivElement>(null);
  const endCta = useRef<HTMLDivElement>(null);
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  const [newOpen, setNewOpen] = useState(false);
  const reduce = !!useReducedMotion();
  const nav = mode === 'page' ? 56 : 0;
  const start = onNew ?? (() => setNewOpen(true));

  useEffect(() => {
    if (mode !== 'page') return;
    document.title = 'TexChef: edit with LaTeX easily';
    return () => {
      document.title = 'TexChef';
    };
  }, [mode]);

  // The page scrolls inside its own box (it can sit under the app's header), so heights follow that box.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVh(el.clientHeight));
    ro.observe(el);
    setVh(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Smooth scrolling (skipped for people who ask for less motion).
  useEffect(() => {
    if (reduce || !scroller.current || !content.current) return;
    const l = new Lenis({ wrapper: scroller.current, content: content.current, lerp: 0.1, autoRaf: true });
    setLenis(l);
    return () => {
      l.destroy();
      setLenis(null);
    };
  }, [reduce]);

  /** Where scrolling must be for scene `i` to be in the middle of its stretch. */
  const sceneY = (i: number) => {
    const s = story.current;
    const box = scroller.current;
    if (!s || !box) return 0;
    const topY = s.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    return topY + (s.offsetHeight - box.clientHeight) * ((i + 0.5) / n);
  };
  const scrollTo = (y: number) => (lenis ? lenis.scrollTo(y, { duration: clean ? 0.4 : 1.2, force: true }) : scroller.current?.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' }));

  // Inside the story, one gesture moves exactly one scene: a swipe on touch screens (the browser's own momentum would
  // carry a flick across two or three), and, where the page snaps, one wheel or trackpad gesture (however long its
  // inertia runs). Taps and sideways swipes are left alone.
  useEffect(() => {
    const box = scroller.current;
    const inner = content.current;
    if (!box || !inner) return;
    let startY = 0;
    let startX = 0;
    let inStory = false;
    let target = -1;
    let until = 0;
    const storyEnd = () => {
      const s = story.current!;
      const topY = s.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      return topY + s.offsetHeight - box.clientHeight;
    };
    const current = () => {
      if (Date.now() < until && target >= 0) return target;
      const y = box.scrollTop;
      let best = 0;
      scenes.forEach((_, i) => Math.abs(sceneY(i) - y) < Math.abs(sceneY(best) - y) && (best = i));
      return best;
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !story.current) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      const y = box.scrollTop;
      inStory = y >= sceneY(0) - vh * 0.3 && y <= sceneY(n - 1) + vh * 0.3;
    };
    const onMove = (e: TouchEvent) => {
      if (!inStory) return;
      const dy = startY - e.touches[0].clientY;
      const dx = startX - e.touches[0].clientX;
      if (Math.abs(dy) > Math.abs(dx)) e.preventDefault();
    };
    /** Move one scene forward (1) or back (-1), or out of the story at either end. */
    const go = (dir: 1 | -1) => {
      const i = current();
      const next = i + dir;
      until = Date.now() + (clean ? 500 : 900);
      if (next < 0) {
        target = -1;
        scrollTo(0);
      } else if (next >= n) {
        target = -1;
        scrollTo(storyEnd() + vh * 0.6);
      } else {
        target = next;
        scrollTo(sceneY(next));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (!inStory) return;
      inStory = false;
      const t = e.changedTouches[0];
      const dy = startY - t.clientY;
      if (Math.abs(dy) < 60 || Math.abs(dy) < Math.abs(startX - t.clientX)) return;
      go(dy > 0 ? 1 : -1);
    };
    // Wheel: one move per gesture. A gesture is a run of wheel events less than a fifth of a second apart, so a
    // trackpad's inertia or a spun mouse wheel still counts as one.
    let lastWheel = 0;
    let movedThisGesture = false;
    const onWheel = (e: WheelEvent) => {
      if (!snap || e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX) || !story.current) return;
      const now = Date.now();
      if (now - lastWheel > 200) movedThisGesture = false;
      lastWheel = now;
      const y = box.scrollTop;
      const inside = y >= sceneY(0) - vh * 0.3 && y <= sceneY(n - 1) + vh * 0.3;
      if (!inside && !movedThisGesture) return;
      // Keep Lenis (listening on the scroll box) from scrolling as well.
      e.preventDefault();
      e.stopPropagation();
      if (movedThisGesture || Math.abs(e.deltaY) < 2) return;
      movedThisGesture = true;
      go(e.deltaY > 0 ? 1 : -1);
    };
    box.addEventListener('touchstart', onStart, { passive: true });
    box.addEventListener('touchmove', onMove, { passive: false });
    box.addEventListener('touchend', onEnd, { passive: true });
    inner.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      box.removeEventListener('touchstart', onStart);
      box.removeEventListener('touchmove', onMove);
      box.removeEventListener('touchend', onEnd);
      inner.removeEventListener('wheel', onWheel);
    };
    // sceneY and scrollTo read the DOM and Lenis when called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vh, lenis, snap, clean]);

  // Gentle snapping: once scrolling stops inside the story, ease onto the nearest scene.
  useEffect(() => {
    if (!snap || !lenis) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    const off = lenis.on('scroll', () => {
      if (busy) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const ys = scenes.map((_, i) => sceneY(i));
        const y = lenis.scroll;
        const margin = vh * 0.45;
        if (y < ys[0] - margin || y > ys[n - 1] + margin) return;
        const target = ys.reduce((best, c) => (Math.abs(c - y) < Math.abs(best - y) ? c : best));
        if (Math.abs(target - y) < 4) return;
        busy = true;
        const release = setTimeout(() => (busy = false), clean ? 600 : 1100);
        lenis.scrollTo(target, {
          duration: clean ? 0.35 : 0.7,
          onComplete: () => {
            clearTimeout(release);
            busy = false;
          },
        });
      }, 160);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
    // sceneY reads the DOM each time, so it needn't be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, lenis, vh, clean]);

  const heroInView = useInView(heroCta, { root: scroller });
  const endInView = useInView(endCta, { root: scroller, margin: '0px 0px -10% 0px' });
  const [pastHero, setPastHero] = useState(false);
  const { scrollY } = useScroll({ container: scroller });
  useMotionValueEvent(scrollY, 'change', (y) => setPastHero(y > vh * 0.3));
  // The clean look's page keeps Start writing in its top bar, so nothing needs to float over the window.
  const floating = pastHero && !heroInView && !endInView && !(clean && mode === 'page');

  return (
    <div ref={scroller} className="relative h-full overflow-x-clip overflow-y-auto bg-bg" data-testid={testId} data-mode={mode} data-look={look}>
      <style>{KEYFRAMES}</style>
      <div ref={content}>
        {mode === 'page' && <Nav onStart={start} extra={navExtra} clean={clean} />}
        {clean ? (
          <CleanHero ctaRef={heroCta} onStart={start} uploadActions={uploadActions} onTour={() => scrollTo(sceneY(0))} compactTop={mode !== 'page'} />
        ) : (
          <Hero ctaRef={heroCta} onStart={start} uploadActions={uploadActions} onTour={() => scrollTo(sceneY(0))} reduce={reduce} compactTop={mode !== 'page'} scroller={scroller} />
        )}
        {clean ? (
          <CleanStory storyRef={story} scroller={scroller} vh={vh} nav={nav} reduce={reduce} bottomRoom={switcher} onStep={(i) => scrollTo(sceneY(i))} />
        ) : (
          <Story storyRef={story} scroller={scroller} vh={vh} nav={nav} reduce={reduce} floatRoom={mode === 'page' ? 'tablet' : 'stacked'} onStep={(i) => scrollTo(sceneY(i))} />
        )}
        {clean ? <FeatureList /> : <Bento />}
        {clean ? <CleanCta ctaRef={endCta} onStart={start} /> : <Cta ctaRef={endCta} onStart={start} />}
        {mode === 'page' && (
          <footer className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-6 text-xs text-muted', clean ? 'mx-auto max-w-[90rem] sm:px-6 lg:px-12' : 'justify-center')}>
            <Link to="/help/whats-new" className="hover:text-fg" data-testid="link-version">
              TexChef v{APP_VERSION.replace(/\.0$/, '')}
            </Link>
            <Link to="/terms" className="hover:text-fg" data-testid="link-terms">
              Terms
            </Link>
            <KurolightMark />
          </footer>
        )}
      </div>
      {/* Start writing stays within reach while the story plays. */}
      <AnimatePresence>
        {floating && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: clean ? 0.2 : 0.25 }}
            // Phones already have Start writing in the top bar.
            className={cn('fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2', mode === 'page' && 'max-sm:hidden')}
          >
            {/* Frosted glass: a gentle invitation rather than another green button. */}
            <button
              onClick={start}
              className={cn(
                'group flex h-12 min-w-[17rem] items-center justify-center gap-2 px-10 text-[15px] font-medium text-fg',
                clean
                  ? 'rounded-lg border border-line bg-panel shadow-sm transition-colors duration-150 hover:bg-subtle'
                  : [
                      'rounded-full border border-white/60 bg-white/35 shadow-[0_8px_32px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl backdrop-saturate-150',
                      'transition hover:bg-white/55 dark:border-white/15 dark:bg-white/10 dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.12)] dark:hover:bg-white/15',
                    ],
              )}
              data-testid="ideas-float-start"
            >
              Start writing <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {!onNew && <NewDocDialog open={newOpen} onOpenChange={setNewOpen} />}
      {switcher && <IdeasSwitcher current={clean ? '/ideas/clean' : '/ideas'} />}
    </div>
  );
}

/** Links between the landing page ideas. Plain links: the typeset and product-first pages are static files, not app routes. */
function IdeasSwitcher({ current }: { current: string }) {
  const items = [
    ['/ideas', 'Current'],
    ['/ideas/clean', 'Cleaned up'],
    ['/ideas/typeset', 'Typeset'],
    ['/ideas/split', 'Product-first'],
  ];
  return (
    <nav
      aria-label="Landing page ideas"
      className="fixed right-3 bottom-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center overflow-x-auto rounded-md border border-line bg-panel font-mono text-xs whitespace-nowrap max-sm:left-3"
      data-testid="ideas-switch"
    >
      <span className="px-2.5 py-2.5 text-muted">Ideas</span>
      {items.map(([href, label]) => (
        <a key={href} href={href} aria-current={href === current ? 'page' : undefined} className={cn('border-l border-line px-2.5 py-2.5', href === current ? 'bg-fg text-bg' : 'hover:bg-subtle')}>
          {label}
        </a>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------- top bar and hero

function Nav({ onStart, extra, clean }: { onStart: () => void; extra?: ReactNode; clean?: boolean }) {
  return (
    <div className={cn('sticky top-0 z-30 border-b', clean ? 'border-line bg-bg' : 'border-line/60 bg-bg/80 backdrop-blur-md')}>
      <div className={cn('mx-auto flex h-14 items-center gap-3 px-4 sm:px-6', clean ? 'max-w-[90rem] lg:px-12' : 'max-w-6xl')}>
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Logo size={26} /> TexChef
        </Link>
        <div className="flex-1" />
        <Link to="/help/getting-started" className="hidden text-sm text-muted hover:text-fg sm:inline">
          Guide
        </Link>
        {extra}
        <button onClick={onStart} className="h-9 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg hover:bg-accent-hover" data-testid="ideas-nav-start">
          Start writing
        </button>
      </div>
    </div>
  );
}

function StartButton({ onStart, uploadActions, plain }: { onStart: () => void; uploadActions?: MenuAction[]; plain?: boolean }) {
  // `plain` (the clean look): no coloured shadow, squarer corners, a quick colour change on hover.
  const r = plain ? ['rounded-l-lg', 'rounded-lg', 'rounded-r-lg'] : ['rounded-l-xl', 'rounded-xl', 'rounded-r-xl'];
  const tone = plain ? 'transition-colors duration-150' : 'shadow-lg shadow-accent/20';
  const main = (
    <button
      onClick={onStart}
      className={cn('group flex h-12 items-center gap-2 bg-accent px-6 font-medium text-accent-fg hover:bg-accent-hover', tone, uploadActions ? r[0] : r[1])}
      data-testid="ideas-start"
    >
      Start writing <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
  if (!uploadActions?.length) return main;
  return (
    <div className="flex">
      {main}
      <ActionDropdown
        align="end"
        label="Or upload"
        actions={uploadActions}
        trigger={
          <button className={cn('flex h-12 items-center border-l border-accent-fg/25 bg-accent px-3 text-accent-fg hover:bg-accent-hover', tone, r[2])} aria-label="Upload files or a folder instead" data-testid="landing-upload">
            <ChevronDown className="size-4" />
          </button>
        }
      />
    </div>
  );
}

function Hero({
  ctaRef,
  onStart,
  uploadActions,
  onTour,
  reduce,
  compactTop,
  scroller,
}: {
  ctaRef: RefObject<HTMLDivElement | null>;
  onStart: () => void;
  uploadActions?: MenuAction[];
  onTour: () => void;
  reduce: boolean;
  compactTop: boolean;
  scroller: RefObject<HTMLDivElement | null>;
}) {
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
      transition={{ duration: 0.7, delay: 0.1 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      {w}&nbsp;
    </motion.span>
  );
  const later = (delay: number) => ({ initial: reduce ? false : { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay } }) as const;
  return (
    <section className="relative isolate">
      {/* A soft wash of the theme colour across the top, fading into the page. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-full bg-gradient-to-b from-accent-soft/70 via-accent-soft/20 to-transparent" />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        style={{ backgroundImage: 'radial-gradient(color-mix(in srgb, var(--fg) 10%, transparent) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />
      <motion.div style={{ opacity: fade, y: lift }} className={cn('mx-auto max-w-4xl px-4 pb-10 text-center sm:pb-14', compactTop ? 'pt-14 sm:pt-20' : 'pt-20 sm:pt-28')}>
        <h1 className="text-[2.3rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl">
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
        <motion.ul {...later(0.7)} className="mx-auto mt-7 inline-flex flex-col items-start gap-2 text-left text-base text-muted sm:text-lg" aria-label="What TexChef does">
          {PITCH.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5">
              <Icon className="size-[18px] shrink-0 text-accent" aria-hidden="true" />
              {text}
            </li>
          ))}
        </motion.ul>
        <motion.div ref={ctaRef} {...later(0.9)} className="mt-9 flex flex-col items-center justify-center gap-4">
          <StartButton onStart={onStart} uploadActions={uploadActions} />
          <button onClick={onTour} className="group flex flex-col items-center gap-0.5 text-sm font-medium text-muted hover:text-fg" data-testid="ideas-tour">
            See how it works
            <motion.span animate={reduce ? undefined : { y: [0, 5, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
              <ChevronDown className="size-5 text-accent" />
            </motion.span>
          </button>
        </motion.div>
      </motion.div>
    </section>
  );
}

/** The clean look's hero: left-aligned on the story's grid, everything visible at once, nothing animated. */
function CleanHero({
  ctaRef,
  onStart,
  uploadActions,
  onTour,
  compactTop,
}: {
  ctaRef: RefObject<HTMLDivElement | null>;
  onStart: () => void;
  uploadActions?: MenuAction[];
  onTour: () => void;
  compactTop: boolean;
}) {
  return (
    <section className={cn('mx-auto max-w-[90rem] px-4 pb-8 sm:px-6 sm:pb-6 lg:px-12', compactTop ? 'pt-12 sm:pt-16' : 'pt-14 sm:pt-24')}>
      <h1 className="max-w-3xl text-[2.3rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl">
        Edit with LaTeX easily, <span className="text-accent">all in the browser.</span>
      </h1>
      <ul className="mt-7 flex flex-col gap-2 text-base text-muted sm:text-lg" aria-label="What TexChef does">
        {PITCH.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2.5">
            <Icon className="size-[18px] shrink-0 text-accent" aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>
      <div ref={ctaRef} className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
        <StartButton onStart={onStart} uploadActions={uploadActions} plain />
        <button onClick={onTour} className="flex items-center gap-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:text-fg" data-testid="ideas-tour">
          See how it works <ChevronDown className="size-4 text-accent" />
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the story: a pinned window, one scene per screen

function Story({
  storyRef,
  scroller,
  vh,
  nav,
  reduce,
  floatRoom,
  onStep,
}: {
  /** Where the floating Start writing button needs room below the window: only tablets, or every stacked layout. */
  floatRoom: 'tablet' | 'stacked';
  storyRef: RefObject<HTMLElement | null>;
  scroller: RefObject<HTMLDivElement | null>;
  vh: number;
  nav: number;
  reduce: boolean;
  onStep: (i: number) => void;
}) {
  const { scrollYProgress } = useScroll({ container: scroller, target: storyRef, offset: ['start start', 'end end'] });
  const { scrollYProgress: entry } = useScroll({ container: scroller, target: storyRef, offset: ['start end', 'start start'] });
  const tilt = useTransform(entry, [0, 1], [22, 0]);
  const scale = useTransform(entry, [0, 1], [0.88, 1]);
  const textIn = useTransform(entry, [0.55, 1], [0, 1]);
  const [step, setStep] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [done, setDone] = useState(false);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setStep(Math.min(N - 1, Math.max(0, Math.floor(v * N))));
    setDone(v >= 0.999);
  });
  useMotionValueEvent(entry, 'change', (v) => setArrived(v > 0.9));

  // Each scene plays from the start on its own clock whenever it comes on screen (in either direction).
  const [t, setT] = useState(0);
  const [replays, setReplays] = useState(0);
  useEffect(() => {
    if (reduce) {
      setT(1);
      return;
    }
    setT(0);
    if (!arrived) return;
    const run = animate(0, 1, { duration: STORY[step].secs, ease: 'linear', onUpdate: setT });
    return () => run.stop();
  }, [step, arrived, replays, reduce]);

  // Two seconds after a scene finishes, move on to the next one (scrolling there, so scrolling back still works).
  useEffect(() => {
    if (reduce || !arrived || done || t < 1 || step >= N - 1) return;
    const next = setTimeout(() => onStep(step + 1), 2000);
    return () => clearTimeout(next);
    // onStep is a fresh function each render; the scene and its progress are what matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, step, arrived, done, reduce]);

  // The window is drawn at a fixed size and scaled to fit the space it has.
  const pinned = vh - nav;
  // Large screens: the window gets at most this much height, and its box hugs it so the title and text sit close.
  const stageMax = Math.max(300, Math.min(640, pinned - 300));
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, compact: false, left: 0, stacked: false });
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const compact = el.clientWidth < 600;
      const s = compact ? DEMO_SIZE.compact : DEMO_SIZE.wide;
      const stacked = window.innerWidth < 1024;
      const sc = Math.min(1.2, el.clientWidth / s.w, (stacked ? el.clientHeight : stageMax) / s.h);
      setFit({ compact, scale: sc, left: (el.clientWidth - s.w * sc) / 2, stacked });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageMax]);
  const size = fit.compact ? DEMO_SIZE.compact : DEMO_SIZE.wide;
  const scene = (key: string, node: ReactNode, className?: string) => (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={`${key}-${step}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className={className}
      >
        {node}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <section
      ref={storyRef}
      // Pulled up under the hero, so the window already peeks in at the bottom of the first screen.
      className="pointer-events-none relative"
      style={{ height: pinned + N * vh * 0.8, marginTop: -vh * 0.2 }}
      data-testid="ideas-story"
      data-step={step}
    >
      <div
        className={cn(
          'sticky mx-auto flex max-w-[90rem] flex-col gap-3 overflow-hidden px-4 pt-3 pb-4 sm:px-6',
          'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_15rem] lg:items-center lg:gap-8 lg:pt-0 lg:pb-20',
          floatRoom === 'tablet' ? 'sm:max-lg:pb-20' : 'max-lg:pb-20',
        )}
        style={{ top: nav, height: pinned }}
      >
        {/* Large screens: the scenes on a vertical roller, and Start writing under it */}
        <motion.div style={{ opacity: textIn }} className="hidden flex-col items-start gap-8 lg:flex">
          <Roller step={step} onStep={onStep} onReplay={t >= 1 && !reduce ? () => setReplays((n) => n + 1) : undefined} />
        </motion.div>
        {/* The scene: title, window, description */}
        <div className="flex min-h-0 w-full flex-1 flex-col gap-3 lg:h-full lg:justify-center lg:gap-5">
          <motion.div style={{ opacity: textIn }} className="mx-auto w-full max-w-xl shrink-0 lg:max-w-none">
            <div data-testid="ideas-step-text">
              {scene(
                'title',
                <h2 className={cn('text-[1.45rem] leading-tight font-semibold tracking-tight text-balance sm:text-4xl lg:text-center lg:text-[2.1rem]')}>
                  <span className="mr-2 align-middle font-mono text-sm font-normal text-muted lg:hidden">
                    {step + 1}/{N}
                  </span>
                  {STORY[step].title}
                </h2>,
              )}
              {/* Under the title on small screens; under the window on large ones */}
              {scene('text', <p className="mt-2 text-[15px] text-pretty text-muted sm:mt-3 sm:text-lg">{STORY[step].text}</p>, 'lg:hidden')}
            </div>
          </motion.div>
          <div ref={stage} className="relative min-h-0 w-full flex-1 lg:flex-none" style={{ perspective: 1400, height: fit.stacked ? undefined : size.h * fit.scale }}>
            <div className="absolute" style={{ left: fit.left, top: fit.stacked ? 4 : 0, width: size.w, height: size.h, transform: `scale(${fit.scale})`, transformOrigin: '0 0' }}>
              <motion.div style={{ rotateX: tilt, scale, transformOrigin: '50% 100%' }} className="h-full w-full">
                <DemoWindow step={step} t={t} compact={fit.compact} />
              </motion.div>
            </div>
          </div>
          <motion.div style={{ opacity: textIn }} className="hidden min-h-[3.5rem] shrink-0 lg:block">
            {scene('text-lg', <p className="mx-auto max-w-2xl text-center text-lg text-pretty text-muted">{STORY[step].text}</p>)}
          </motion.div>
        </div>
        <div className="hidden lg:block" aria-hidden="true" />
      </div>
    </section>
  );
}

/** The scenes on a vertical roller: the current one large in the middle, the others turning away above and below. */
/** `onReplay` is set once the current scene has finished: a small icon beside its name plays it again. */
function Roller({ step, onStep, onReplay }: { step: number; onStep: (i: number) => void; onReplay?: () => void }) {
  const ITEM = 56;
  return (
    <nav aria-label="Scenes" className="relative h-[19rem] w-full [mask-image:linear-gradient(to_bottom,transparent,black_22%,black_78%,transparent)]" style={{ perspective: 600 }}>
      <ol className="absolute inset-x-0 top-1/2">
        {STORY.map((s, i) => {
          const d = i - step;
          const far = Math.min(Math.abs(d), 3);
          return (
            <li
              key={s.short}
              className="absolute inset-x-0 transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
              style={{
                transform: `translateY(${d * ITEM - ITEM / 2}px) rotateX(${-d * 18}deg) scale(${1 - far * 0.12})`,
                transformOrigin: 'left center',
                opacity: 1 - far * 0.3,
              }}
            >
              <div className="flex h-14 items-center gap-2">
                <button
                  onClick={() => onStep(i)}
                  className={cn('pointer-events-auto flex items-baseline gap-2.5 text-left', d === 0 ? 'text-fg' : 'text-muted hover:text-fg')}
                  aria-current={d === 0 ? 'step' : undefined}
                  data-testid={`ideas-step-${i}`}
                >
                  <span className="font-mono text-sm text-muted">{String(i + 1).padStart(2, '0')}</span>
                  <span className={cn('tracking-tight', d === 0 ? 'text-[1.7rem] font-semibold' : 'text-xl font-medium')}>{s.short}</span>
                </button>
                {d === 0 && onReplay && (
                  <button
                    onClick={onReplay}
                    className="pointer-events-auto flex size-7 items-center justify-center rounded-full text-muted transition hover:bg-subtle hover:text-fg"
                    aria-label={`Replay ${s.short}`}
                    title="Replay"
                    data-testid="ideas-replay"
                  >
                    <RotateCcw className="size-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
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

/** A card that lifts a little on hover. */
function Spotlight({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('group relative overflow-hidden rounded-2xl border border-line bg-panel p-4 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-black/5', className)}>
      {children}
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

/** The clean look's version of the grid above: the same features as a numbered, ruled list. */
function FeatureList() {
  return (
    <section className="mx-auto max-w-[90rem] px-4 py-20 sm:px-6 sm:py-28 lg:px-12">
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Everything a LaTeX document needs</h2>
      <ol className="mt-10 grid border-t border-fg sm:grid-cols-2 sm:gap-x-12 lg:grid-cols-3">
        {BENTO.map((b, i) => (
          <li key={b.title} className="flex gap-4 border-b border-line py-5">
            <span className="pt-0.5 font-mono text-sm text-muted">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h3 className="font-semibold">{b.title}</h3>
              <p className="mt-1 text-sm text-pretty text-muted">{b.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- the end

function Cta({ ctaRef, onStart }: { ctaRef: RefObject<HTMLDivElement | null>; onStart: () => void }) {
  return (
    <section className="px-4 pb-24 sm:px-6 sm:pb-32">
      <motion.div
        ref={ctaRef}
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6 }}
        className="beam relative mx-auto max-w-4xl overflow-hidden rounded-3xl p-px"
      >
        <div className="relative rounded-[23px] bg-panel px-6 py-14 text-center sm:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Start writing. It’s free.</h2>
          <p className="mx-auto mt-4 max-w-md text-pretty text-muted">A blank article, a master resume or a cover letter: pick one and the PDF is ready in seconds.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button onClick={onStart} className="group flex h-11 items-center gap-2 rounded-xl bg-accent px-6 font-medium text-accent-fg shadow-lg shadow-accent/20 hover:bg-accent-hover" data-testid="ideas-end-start">
              New document <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <Link to="/help/getting-started" className="flex h-11 items-center gap-2 rounded-xl border border-line px-6 font-medium hover:bg-subtle">
              <BookOpen className="size-4" /> TexChef Guide
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/** The clean look's closing section: a rule, a line and the two buttons, with nothing moving. */
function CleanCta({ ctaRef, onStart }: { ctaRef: RefObject<HTMLDivElement | null>; onStart: () => void }) {
  return (
    <section className="mx-auto max-w-[90rem] px-4 pb-20 sm:px-6 sm:pb-28 lg:px-12">
      <div ref={ctaRef} className="flex flex-wrap items-end justify-between gap-x-12 gap-y-8 border-t border-fg pt-10">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">Start writing. It’s free.</h2>
          <p className="mt-4 max-w-md text-pretty text-muted">A blank article, a master resume or a cover letter: pick one and the PDF is ready in seconds.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onStart} className="flex h-11 items-center gap-2 rounded-lg bg-accent px-6 font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover" data-testid="ideas-end-start">
            New document <ArrowRight className="size-4" />
          </button>
          <Link to="/help/getting-started" className="flex h-11 items-center gap-2 rounded-lg border border-line px-6 font-medium transition-colors duration-150 hover:bg-subtle">
            <BookOpen className="size-4" /> TexChef Guide
          </Link>
        </div>
      </div>
    </section>
  );
}

const KEYFRAMES = `
@keyframes demo-dash { to { stroke-dashoffset: -26; } }
@keyframes demo-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes ideas-beam { to { transform: rotate(1turn); } }
.beam::before { content: ''; position: absolute; inset: -60%; background: conic-gradient(from 0deg, transparent 0 70%, var(--accent) 85%, #2a9d8f 92%, transparent 100%); animation: ideas-beam 6s linear infinite; }
.beam::after { content: ''; position: absolute; inset: 0; border-radius: 1.5rem; border: 1px solid var(--color-line); pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .beam::before { animation: none !important; } }
`;
