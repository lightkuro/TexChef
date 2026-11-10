import { useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, BookOpen, ChevronDown, Cpu, GitBranch, HardDrive, MousePointerClick, Plus, type LucideIcon } from 'lucide-react';
import { TEMPLATES } from '@/templates';
import { Button } from '@/components/ui';
import { ActionDropdown, type MenuAction } from '@/components/ActionMenu';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { NewDocDialog } from './NewDocDialog';

const PITCH: { icon: LucideIcon; text: string }[] = [
  { icon: MousePointerClick, text: 'Compile, preview and edit right on the PDF.' },
  { icon: GitBranch, text: 'Split master documents into multiple versions.' },
  { icon: HardDrive, text: 'Processed locally, with optional Drive backup.' },
];

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Cpu, title: 'Compiles in your browser', text: 'Full TeX Live on your device. No server, no install.' },
  { icon: MousePointerClick, title: 'Edit on the PDF', text: 'Click text in the preview, or use Visual mode.' },
  { icon: GitBranch, title: 'Master and variants', text: 'A resume per job, a paper per venue; master edits flow in.' },
  { icon: HardDrive, title: 'Your files stay yours', text: 'In this browser, and your own Google Drive if you like.' },
];

/** Short card text and a sketch of the first page for each template. */
const STARTERS: Record<string, { blurb: string; sketch: ReactNode }> = {
  'resume-master': { blurb: 'Split into tagged blocks, ready for tailored versions.', sketch: <ResumeSketch /> },
  'cover-letter': { blurb: 'Opening, body and closing as blocks.', sketch: <LetterSketch /> },
  article: { blurb: 'Essays, notes, papers: a clean page to start from.', sketch: <ArticleSketch /> },
};

/** What new users see on the home page before they have any documents. */
export function Landing({ onNew, uploadActions }: { onNew: () => void; uploadActions: MenuAction[] }) {
  const [template, setTemplate] = useState<string | null>(null);
  const navigate = useNavigate();
  return (
    <div className="overflow-x-clip" data-testid="classic-landing">
      <div className="mx-auto w-full max-w-6xl px-4 pt-12 pb-10 sm:px-6 sm:pt-20">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="text-[2rem] leading-tight font-semibold tracking-tight text-balance sm:text-5xl sm:leading-[1.1]">
            <span className="inline-flex items-center gap-2.5 text-accent sm:gap-3.5">
              <Logo size={44} className="size-9 sm:size-12" /> TexChef:
            </span>
            <span className="block">Edit with LaTeX easily, all in the browser</span>
          </h1>
          <ul className="mx-auto mt-6 inline-flex flex-col items-start gap-2 text-left text-base text-muted sm:mt-7 sm:text-lg" aria-label="What TexChef does">
            {PITCH.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5">
                <Icon className="size-[18px] shrink-0 text-accent" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
          <div className="mx-auto mt-8 flex max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <div className="flex">
              <Button variant="primary" className="h-10 flex-1 rounded-r-none px-5" onClick={onNew} data-testid="landing-new">
                <Plus className="size-4" /> New document
              </Button>
              <ActionDropdown
                align="end"
                label="Or upload"
                actions={uploadActions}
                trigger={
                  <Button variant="primary" className="h-10 rounded-l-none border-l border-accent-fg/25 px-2.5" aria-label="Upload files or a folder instead" data-testid="landing-upload">
                    <ChevronDown className="size-4" />
                  </Button>
                }
              />
            </div>
            <Button variant="outline" className="h-10 px-5" onClick={() => navigate('/help/getting-started')} data-testid="landing-guide">
              <BookOpen className="size-4" /> TexChef Guide
            </Button>
          </div>
        </section>

        <div className="relative isolate mx-auto mt-12 max-w-5xl sm:mt-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-[8%] -top-8 bottom-1/4 -z-10 rounded-full bg-accent/20 blur-3xl" />
          <Shot
            window
            src="/landing/hero.webp"
            srcSet="/landing/hero-1280.webp 1280w, /landing/hero.webp 1920w"
            sizes="(min-width: 1072px) 1024px, calc(100vw - 48px)"
            width={1920}
            height={1084}
            fetchPriority="high"
            alt="The TexChef editor: an essay in Visual mode on the left, with its heading and list formatted, and the typeset PDF on the right."
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

        <Feature
          testId="landing-pdf-edit"
          eyebrow="Edit on the PDF"
          title="Click the PDF, type the change"
          link={['/help/edit-on-pdf', 'How editing on the PDF works']}
          image={
            <Shot
              src="/landing/pdf-edit.webp"
              width={1400}
              height={953}
              loading="lazy"
              alt="Editing on the PDF: a clicked bullet opens a small box with its words, and the number 60% is selected, ready to change."
            />
          }
        >
          No hunting through LaTeX for the right line. Click a sentence in the preview, change a number or a word, and press Enter: TexChef
          edits the matching source and recompiles.
        </Feature>

        <Feature
          testId="landing-versions"
          flip
          eyebrow="Made for resumes"
          title="One master, many tailored versions"
          link={['/help/variants', 'How variants work']}
          image={
            <Shot
              src="/landing/versions.webp"
              width={1160}
              height={1304}
              className="mx-auto max-w-[540px]"
              loading="lazy"
              alt="The map: a Master resume linked to three tailored versions (data, backend and frontend), each a different length, each with an update from the master waiting."
            />
          }
        >
          Keep everything in one master, then make a version for each job in a few clicks by picking the parts or tags it needs. Fix a typo in
          the master and every version can take the fix, keeping its own edits. Handy beyond resumes too: one paper, two venues.
        </Feature>

        <Feature
          testId="landing-visual"
          eyebrow="Visual interface"
          title="Write without the backslashes"
          link={['/help/visual-editor', 'About Visual mode']}
          image={
            <Shot
              src="/landing/visual.webp"
              width={1400}
              height={754}
              loading="lazy"
              alt="Visual mode: the formatting toolbar above an essay whose headings, bold words, bullet list and link show formatted."
            />
          }
        >
          Visual mode shows headings, bold text, lists and links formatted as you type, with buttons for the usual formatting and a font menu.
          It is the same LaTeX underneath: switch back to the code any time and nothing has changed.
        </Feature>


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
          Your documents are stored in this browser and, if you connect it, in your own Google Drive. By using TexChef you agree to the{' '}
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

/** A screenshot in a frame that sits well on light and dark themes; `window` adds a browser-style title bar. */
function Shot({ className, alt, window: win, ...img }: ImgHTMLAttributes<HTMLImageElement> & { alt: string; window?: boolean }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-line bg-white shadow-xl shadow-black/10 dark:shadow-black/40',
        win && 'rounded-2xl shadow-2xl ring-1 ring-black/5',
        className,
      )}
    >
      {win && (
        <div className="flex h-8 items-center gap-1.5 border-b border-line bg-subtle px-3.5 sm:h-9" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="mx-auto -translate-x-6 rounded-md bg-panel px-10 py-0.5 text-[11px] text-muted max-sm:hidden">texchef.kurolight.dev</span>
        </div>
      )}
      <img alt={alt} decoding="async" className="block h-auto w-full dark:brightness-[0.92]" {...img} />
    </div>
  );
}

/** A picture with a short pitch beside it; `flip` puts the picture on the left. */
function Feature({
  eyebrow,
  title,
  children,
  link,
  image,
  flip,
  testId,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  link: [string, string];
  image: ReactNode;
  flip?: boolean;
  testId?: string;
}) {
  return (
    <section className="mx-auto mt-20 grid max-w-5xl items-center gap-10 sm:mt-28 lg:grid-cols-12 lg:gap-14" data-testid={testId}>
      <div className={cn('max-w-xl lg:col-span-5', flip && 'lg:order-2')}>
        <p className="text-sm font-medium text-accent">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
        <p className="mt-4 text-pretty text-muted">{children}</p>
        <Link to={link[0]} className="group mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
          {link[1]} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className={cn('lg:col-span-7', flip && 'lg:order-1')}>{image}</div>
    </section>
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
