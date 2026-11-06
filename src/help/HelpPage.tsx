import { useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { TOPIC_ALIASES, TOPICS } from './topics';

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
    document.title = `${current.title} · texChef help`;
    return () => {
      document.title = 'texChef';
    };
  }, [current]);

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Logo size={26} /> texChef
        </Link>
        <span className="text-muted">/</span>
        <span className="text-sm">Help</span>
        <div className="flex-1" />
        <Link to="/" className="flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Back to the app
        </Link>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-64 shrink-0 overflow-auto border-r border-line bg-panel p-3 md:block" aria-label="Help topics">
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
          <article className="mx-auto max-w-3xl px-6 py-10 text-[15px] text-fg" data-testid="help-page">
            <h1 className="text-3xl font-semibold tracking-tight">{current.title}</h1>
            <p className="mt-1 text-muted">{current.summary}</p>
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
          </article>
        </div>
      </div>
    </div>
  );
}
