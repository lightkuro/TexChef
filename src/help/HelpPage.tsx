import { useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { KurolightMark, Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { TOPIC_ALIASES, TOPICS } from './topics';
import { APP_VERSION } from '@/app/changelog';

/** Feature guide: one page per topic with a sidebar. */
export function HelpPage() {
  const { topic: raw } = useParams();
  const topic = raw ? (TOPIC_ALIASES[raw] ?? raw) : undefined;
  const index = Math.max(0, TOPICS.findIndex((t) => t.id === topic));
  const current = TOPICS[index];
  const prev = TOPICS[index - 1];
  const next = TOPICS[index + 1];
  const scroller = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Old addresses (/help/pulling) move to the current one.
  useEffect(() => {
    if (raw && topic !== raw) navigate(`/help/${topic}`, { replace: true });
  }, [raw, topic, navigate]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    document.title = `${current.title} · TexChef help`;
    return () => {
      document.title = 'TexChef';
    };
  }, [current]);

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Logo size={26} /> TexChef
        </Link>
        <span className="text-muted">/</span>
        <span className="text-sm">Help</span>
        <div className="flex-1" />
        <Link to="/" className="flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Back to the app
        </Link>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-64 shrink-0 flex-col overflow-auto border-r border-line bg-panel p-3 md:flex" aria-label="Help topics">
          {TOPICS.map((t) => (
            <NavLink
              key={t.id}
              to={`/help/${t.id}`}
              className={({ isActive }) =>
                cn('block rounded-md px-3 py-2 text-sm', isActive || (t === current && !topic) ? 'bg-accent-soft font-medium text-fg' : 'text-muted hover:bg-subtle hover:text-fg')
              }
            >
              {t.title}
            </NavLink>
          ))}
          <div className="mt-auto px-3 pt-6 pb-1 text-[11px] leading-relaxed text-muted">
            <p>TexChef is free and runs entirely in your browser.</p>
            <Link to="/help/whats-new" className="mt-1 inline-block hover:text-fg" data-testid="help-version">
              Version {APP_VERSION.replace(/\.0$/, '')} · What’s new
            </Link>
            <div className="mt-1.5">
              <KurolightMark />
            </div>
          </div>
        </nav>
        <div ref={scroller} className="min-w-0 flex-1 overflow-auto">
          <div className="border-b border-line bg-panel px-4 py-2 md:hidden">
            <select
              className="h-8 w-full rounded-md border border-line bg-panel px-2 text-sm"
              value={current.id}
              onChange={(e) => navigate(`/help/${e.target.value}`)}
              aria-label="Help topic"
            >
              {TOPICS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <article
            className={cn(
              'mx-auto max-w-3xl px-6 py-10 text-fg max-sm:px-4 max-sm:pt-6 max-sm:pb-[calc(2.5rem+env(safe-area-inset-bottom))]',
              current.large ? 'text-[17px]' : 'text-[15px]',
            )}
            data-testid="help-page"
          >
            <h1 className={cn('font-semibold tracking-tight', current.large ? 'text-4xl max-sm:text-3xl' : 'text-3xl max-sm:text-2xl')}>{current.title}</h1>
            <p className={cn('mt-1 text-muted', current.large && 'mt-2 text-lg')}>{current.summary}</p>
            {current.body()}
            <div className="mt-12 flex gap-3 border-t border-line pt-4 text-sm">
              {prev && (
                <Link to={`/help/${prev.id}`} className="flex items-center gap-1 text-muted hover:text-fg">
                  <ArrowLeft className="size-4" /> {prev.title}
                </Link>
              )}
              <div className="flex-1" />
              {next && (
                <Link to={`/help/${next.id}`} className="flex items-center gap-1 text-muted hover:text-fg">
                  {next.title} <ArrowRight className="size-4" />
                </Link>
              )}
            </div>
            <div className="mt-10 flex justify-center">
              <Link
                to="/"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-panel px-5 text-sm font-medium text-fg shadow-sm hover:bg-subtle"
                data-testid="help-back-bottom"
              >
                <ArrowLeft className="size-4" /> Back to the app
              </Link>
            </div>
            <div className="mt-8 flex justify-center md:hidden">
              <KurolightMark />
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
