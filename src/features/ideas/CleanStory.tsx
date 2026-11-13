import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import { animate, useMotionValueEvent, useScroll } from 'motion/react';
import { ArrowRight, BookOpen } from 'lucide-react';
import type { MenuAction } from '@/components/ActionMenu';
import { StartMenu } from './StartMenu';
import { cn } from '@/lib/utils';
import { CLEAN_BAR, CLEAN_FOOT, CLEAN_SIZE, CLEAN_STORY, CleanFrame } from './CleanDemo';

const N = CLEAN_STORY.length;

/**
 * The cleaned-up look's story: the scene's title and text beside a pinned TexChef window (above it on narrower
 * screens). Each scene plays once, for a second or so, the first time it is reached; after that it shows its
 * finished frame, with a button to play it again. Nothing moves on its own, and the text changes at once.
 */
export function CleanStory({
  storyRef,
  scroller,
  vh,
  nav,
  reduce,
  onStep,
  bottomRoom,
  onStart,
  upload,
  guide,
}: {
  /** New document, beside the scenes. */
  onStart: () => void;
  upload: MenuAction[] | (() => void);
  /** Show the Guide button too (not inside the help, which is the guide). */
  guide: boolean;
  /** Keep the bottom of the window clear of something fixed there (the links between the ideas pages). */
  bottomRoom?: boolean;
  storyRef: RefObject<HTMLElement | null>;
  scroller: RefObject<HTMLDivElement | null>;
  vh: number;
  nav: number;
  reduce: boolean;
  onStep: (i: number) => void;
}) {
  const { scrollYProgress } = useScroll({ container: scroller, target: storyRef, offset: ['start start', 'end end'] });
  const { scrollYProgress: entry } = useScroll({ container: scroller, target: storyRef, offset: ['start end', 'start start'] });
  const [step, setStep] = useState(0);
  const [arrived, setArrived] = useState(false);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setStep(Math.min(N - 1, Math.max(0, Math.floor(v * N)))));
  useMotionValueEvent(entry, 'change', (v) => setArrived(v > 0.6));

  // A scene plays the first time it is reached. Scrolled past or finished, it then stays on its last frame.
  const played = useRef(new Set<number>());
  const again = useRef(false);
  const [t, setT] = useState(0);
  const [replays, setReplays] = useState(0);
  useEffect(() => {
    if (reduce || (played.current.has(step) && !again.current)) {
      setT(1);
      return;
    }
    setT(0);
    if (!arrived) return;
    again.current = false;
    let started = false;
    const run = animate(0, 1, {
      duration: CLEAN_STORY[step].secs,
      ease: 'linear',
      onUpdate: (v) => {
        started ||= v > 0;
        setT(v);
      },
      onComplete: () => played.current.add(step),
    });
    return () => {
      run.stop();
      if (started) played.current.add(step);
    };
  }, [step, arrived, replays, reduce]);

  // The window is drawn at a fixed size and scaled to fit the space it has.
  const pinned = vh - nav;
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, compact: false });
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const compact = el.clientWidth < 600;
      const s = compact ? CLEAN_SIZE.compact : CLEAN_SIZE.wide;
      const scale = Math.max(0.3, Math.min(1.2, el.clientWidth / s.w, (el.clientHeight - CLEAN_BAR - CLEAN_FOOT - 2) / s.h));
      setFit((cur) => (cur.compact === compact && Math.abs(cur.scale - scale) < 0.002 ? cur : { compact, scale }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section ref={storyRef} className="pointer-events-none relative" style={{ height: pinned + N * vh * 0.8 }} data-testid="ideas-story" data-step={step}>
      <div
        className={cn('sticky mx-auto flex max-w-[90rem] flex-col gap-4 overflow-hidden px-4 pt-5 pb-5 sm:px-6 sm:pt-8 lg:px-12 xl:grid xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:items-center xl:gap-12 xl:py-10', bottomRoom && 'pb-16 xl:pb-16')}
        style={{ top: nav, height: pinned }}
      >
        {/* A fixed height, so the window doesn't change size (or the title and buttons move) from one scene to the next. */}
        <div className="flex min-h-[9.75rem] shrink-0 flex-col sm:min-h-[8.5rem] sm:[@media(min-height:900px)]:min-h-[12.75rem] xl:h-[23.5rem] xl:min-h-0">
          <div data-testid="ideas-step-text">
            <h2 className="text-[1.45rem] leading-tight font-semibold tracking-tight text-balance sm:text-4xl xl:text-[2.5rem] xl:leading-[1.1]">{CLEAN_STORY[step].title}</h2>
            <p className="mt-2 text-[15px] text-pretty text-muted sm:mt-3 sm:text-lg xl:mt-5">{CLEAN_STORY[step].text}</p>
          </div>
          {/* Where there is room: wide screens (beside the window) and tall tablets. Phones have Start writing in the top bar. */}
          <div className="pointer-events-auto mt-auto hidden flex-wrap items-center gap-3 pt-4 sm:[@media(min-height:900px)]:flex xl:flex" data-testid="ideas-story-actions">
            <StartMenu onNew={onStart} upload={upload}>
              <button className="flex h-11 items-center gap-2 rounded-lg bg-accent px-5 font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover" data-testid="ideas-story-start">
                New document <ArrowRight className="size-4" />
              </button>
            </StartMenu>
            {guide && (
              <Link to="/help/getting-started" className="flex h-11 items-center gap-2 rounded-lg border border-line px-5 font-medium transition-colors duration-150 hover:bg-subtle" data-testid="ideas-story-guide">
                <BookOpen className="size-4" /> Guide
              </Link>
            )}
          </div>
        </div>
        <div ref={stage} className="flex min-h-0 w-full flex-1 items-start xl:h-full xl:items-center xl:justify-end">
          <CleanFrame
            step={step}
            t={t}
            compact={fit.compact}
            scale={fit.scale}
            onStep={onStep}
            onReplay={
              t >= 1 && !reduce
                ? () => {
                    again.current = true;
                    setReplays((n) => n + 1);
                  }
                : undefined
            }
          />
        </div>
      </div>
    </section>
  );
}
