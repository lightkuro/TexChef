import { RELEASES, type NoteKind } from '@/app/changelog';
import { cn } from '@/lib/utils';

const KIND: Record<NoteKind, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-accent-soft text-accent' },
  improved: { label: 'Better', className: 'bg-info-soft text-info' },
  fixed: { label: 'Fixed', className: 'bg-warn-soft text-warn' },
};

const when = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

/** Every release, newest first. */
export function Changelog() {
  return (
    <div className="mt-8 space-y-10" data-testid="changelog">
      {RELEASES.map((r, i) => (
        <section key={r.version} id={`v${r.version}`} className="scroll-mt-16">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-xl font-semibold tracking-tight">
              <span className="font-mono text-[0.9em] text-accent">v{r.version.replace(/\.0$/, '')}</span> · {r.title}
            </h2>
            {i === 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-fg">Latest</span>}
            <span className="text-sm text-muted">{when(r.date)}</span>
          </div>
          <ul className="mt-3 space-y-2">
            {r.notes.map(([kind, text], j) => (
              <li key={j} className="flex items-start gap-2.5 leading-relaxed">
                <span className={cn('mt-[3px] w-14 shrink-0 rounded px-1.5 py-px text-center text-[11px] font-medium', KIND[kind].className)}>{KIND[kind].label}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
