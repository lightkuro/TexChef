import { useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Cpu, GitBranch, HardDrive, MousePointerClick, Plus, Upload, type LucideIcon } from 'lucide-react';
import { TEMPLATES } from '@/templates';
import { Button, Tip } from '@/components/ui';
import { cn } from '@/lib/utils';
import { NewDocDialog } from './NewDocDialog';

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Cpu, title: 'Compiles in your browser', text: 'Full TeX Live on your device. No server, no install.' },
  { icon: MousePointerClick, title: 'Edit on the PDF', text: 'Click text in the preview, or use Visual mode.' },
  { icon: GitBranch, title: 'Master and variants', text: 'Tailor a resume per role; master edits flow in.' },
  { icon: HardDrive, title: 'Your files stay yours', text: 'In this browser, and your own Google Drive if you like.' },
];

/** Short card text and a sketch of the first page for each template. */
const STARTERS: Record<string, { blurb: string; sketch: ReactNode }> = {
  'resume-master': { blurb: 'Split into tagged blocks, ready for variants.', sketch: <ResumeSketch /> },
  'cover-letter': { blurb: 'Opening, body and closing as blocks.', sketch: <LetterSketch /> },
  article: { blurb: 'Math and graphics packages included.', sketch: <ArticleSketch /> },
};

/** What new users see on the home page before they have any documents. */
export function Landing({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  const [template, setTemplate] = useState<string | null>(null);
  return (
    <div className="overflow-x-clip" data-testid="landing">
      <div className="mx-auto w-full max-w-6xl px-4 pt-12 pb-10 sm:px-6 sm:pt-20">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="text-[2rem] leading-tight font-semibold tracking-tight text-balance sm:text-5xl sm:leading-[1.1]">
            The LaTeX editor that runs in your browser
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-pretty text-muted sm:text-lg">
            Compile, preview and edit right on the PDF, with nothing to install. Great for resumes too: keep one master and make tailored
            variants.
          </p>
          <div className="mx-auto mt-8 flex max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Button variant="primary" className="h-10 px-5" onClick={onNew} data-testid="landing-new">
              <Plus className="size-4" /> New document
            </Button>
            <Tip content="A .tex file, an Overleaf or Prism .zip, or a texChef backup">
              <Button variant="outline" className="h-10 px-5" onClick={onImport} data-testid="landing-import">
                <Upload className="size-4" /> Import
              </Button>
            </Tip>
          </div>
          <Link to="/help" className="group mt-6 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            New here? <span className="font-medium text-accent group-hover:underline">Read how texChef works</span>
            <ArrowRight className="size-3.5 text-accent transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>

        <div className="relative isolate mx-auto mt-12 max-w-5xl sm:mt-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-[10%] -top-6 bottom-1/3 -z-10 rounded-full bg-accent/15 blur-3xl" />
          <Shot
            src="/landing/editor-1280.webp"
            srcSet="/landing/editor-1280.webp 1280w, /landing/editor.webp 1920w"
            sizes="(min-width: 1072px) 1024px, calc(100vw - 48px)"
            width={1920}
            height={1067}
            fetchPriority="high"
            alt="The texChef editor: a resume's blocks and tags on the left, its LaTeX source in the middle and the compiled PDF on the right."
          />
        </div>

        <ul className="mx-auto mt-16 grid max-w-5xl gap-8 sm:mt-20 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10" aria-label="Features">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4 lg:flex-col lg:gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-sm text-pretty text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>

        <section className="mx-auto mt-20 grid max-w-5xl items-center gap-10 sm:mt-28 lg:grid-cols-12 lg:gap-14">
          <div className="max-w-xl lg:col-span-5">
            <p className="text-sm font-medium text-accent">Made for resumes</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">One master, many tailored variants</h2>
            <p className="mt-4 text-pretty text-muted">
              Split your resume into tagged blocks, then make a variant for each role in a few clicks. Variants stay linked, so later edits to
              the master flow in.
            </p>
            <Link to="/help/variants" className="group mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              How variants work <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="relative pb-[12%] lg:col-span-7">
            <Shot
              src="/landing/variants.webp"
              width={1400}
              height={854}
              loading="lazy"
              alt="Making a variant: the #frontend tag is picked, and the live preview shows the tailored one-page resume."
            />
            <Shot
              src="/landing/map.webp"
              width={860}
              height={310}
              loading="lazy"
              alt="The map: Master resume, linked to its Frontend resume variant."
              className="absolute bottom-0 -left-2 w-[58%] shadow-2xl sm:-left-4 lg:-left-10"
            />
          </div>
        </section>

        <section className="mt-20 sm:mt-28">
          <h2 className="text-center text-xl font-semibold tracking-tight sm:text-2xl">Start from a template</h2>
          <div className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-3 sm:gap-4">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id)}
                className={cn(
                  'group flex overflow-hidden rounded-xl border border-line bg-panel text-left transition sm:flex-col',
                  'hover:border-accent/60 hover:shadow-lg hover:shadow-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                )}
                data-testid={`landing-template-${t.id}`}
              >
                <span className="flex w-28 shrink-0 justify-center overflow-hidden bg-subtle px-3 pt-4 sm:h-40 sm:w-auto sm:pt-6" aria-hidden="true">
                  {STARTERS[t.id]?.sketch ?? <ArticleSketch />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center p-4 sm:justify-start">
                  <span className="flex items-center gap-1 font-medium">
                    {t.name}
                    <ArrowRight className="size-3.5 text-accent opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </span>
                  <span className="mt-1 text-sm text-muted">{STARTERS[t.id]?.blurb ?? t.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <p className="mx-auto mt-16 max-w-xl text-center text-xs text-pretty text-muted sm:mt-20">
          Your documents are stored in this browser and, if you connect it, in your own Google Drive. By using texChef you agree to the{' '}
          <Link to="/terms" className="underline hover:text-fg">
            Terms
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="underline hover:text-fg">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
      <NewDocDialog open={template !== null} onOpenChange={(o) => !o && setTemplate(null)} initialTemplate={template ?? undefined} />
    </div>
  );
}

/** A screenshot in a frame that sits well on light and dark themes. */
function Shot({ className, alt, ...img }: ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-line bg-white shadow-xl shadow-black/10 dark:shadow-black/40', className)}>
      <img alt={alt} decoding="async" className="block h-auto w-full dark:brightness-[0.92]" {...img} />
    </div>
  );
}

// ---------- Template sketches: a page drawn with theme colors ----------

function Page({ children }: { children: ReactNode }) {
  return (
    <span className="flex aspect-[8.5/11] w-20 shrink-0 flex-col gap-[3px] rounded-t-[3px] border border-b-0 border-line bg-panel p-2.5 shadow-sm sm:w-32 sm:gap-1 sm:p-3.5">
      {children}
    </span>
  );
}

const Line = ({ w, className }: { w: string; className?: string }) => <span className={cn('block h-[3px] shrink-0 rounded-full bg-line', className)} style={{ width: w }} />;

function ResumeSketch() {
  const section = (lines: string[]) => (
    <>
      <Line w="38%" className="mt-1 bg-accent/70" />
      <span className="block h-px w-full shrink-0 bg-accent/40" />
      {lines.map((w, i) => (
        <Line key={i} w={w} />
      ))}
    </>
  );
  return (
    <Page>
      <Line w="50%" className="mx-auto h-1 bg-fg/60" />
      <Line w="78%" className="mx-auto" />
      {section(['92%', '84%'])}
      {section(['70%', '95%', '88%', '60%'])}
      {section(['90%', '76%'])}
    </Page>
  );
}

function LetterSketch() {
  return (
    <Page>
      <Line w="40%" className="ml-auto bg-fg/50" />
      <Line w="34%" className="ml-auto" />
      <Line w="30%" className="ml-auto" />
      <Line w="28%" className="mt-2" />
      <Line w="36%" className="mt-1 bg-fg/40" />
      {['96%', '90%', '94%', '70%'].map((w, i) => (
        <Line key={i} w={w} className={i === 0 ? 'mt-1' : undefined} />
      ))}
      {['92%', '88%', '54%'].map((w, i) => (
        <Line key={i} w={w} className={i === 0 ? 'mt-1' : undefined} />
      ))}
      <Line w="30%" className="mt-2" />
      <Line w="38%" className="mt-1 bg-accent/60" />
    </Page>
  );
}

function ArticleSketch() {
  return (
    <Page>
      <Line w="64%" className="mx-auto h-1 bg-fg/60" />
      <Line w="40%" className="mx-auto" />
      <Line w="30%" className="mt-2 bg-fg/50" />
      {['96%', '92%', '88%'].map((w, i) => (
        <Line key={i} w={w} />
      ))}
      <Line w="44%" className="mx-auto my-1 bg-accent/60" />
      {['94%', '90%', '62%'].map((w, i) => (
        <Line key={i} w={w} />
      ))}
      <Line w="34%" className="mt-2 bg-fg/50" />
      {['92%', '86%'].map((w, i) => (
        <Line key={i} w={w} />
      ))}
    </Page>
  );
}
