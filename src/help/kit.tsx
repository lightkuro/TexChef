import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Info, Lightbulb, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SHOTS } from './shots.gen';

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-10 mb-3 scroll-mt-16 text-xl font-semibold tracking-tight">
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 mb-2 font-semibold">{children}</h3>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="my-3 leading-relaxed">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="my-3 list-disc space-y-1.5 pl-6 leading-relaxed">{children}</ul>;
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="my-3 list-decimal space-y-1.5 pl-6 leading-relaxed">{children}</ol>;
}

export function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-subtle px-1 py-0.5 font-mono text-[0.85em]">{children}</code>;
}

export function Code({ children, title }: { children: string; title?: string }) {
  return (
    <figure className="my-4 overflow-hidden rounded-lg border border-line bg-panel">
      {title && <figcaption className="border-b border-line bg-subtle px-3 py-1.5 text-xs font-medium text-muted">{title}</figcaption>}
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-5">{children.replace(/^\n/, '').replace(/\n\s*$/, '')}</pre>
    </figure>
  );
}

export function Note({ kind = 'info', children }: { kind?: 'info' | 'tip' | 'warn'; children: ReactNode }) {
  const Icon = kind === 'tip' ? Lightbulb : kind === 'warn' ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        'my-4 flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm leading-relaxed',
        kind === 'tip' && 'border-ok/30 bg-ok-soft',
        kind === 'warn' && 'border-warn/30 bg-warn-soft',
        kind === 'info' && 'border-info/30 bg-info-soft',
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', kind === 'tip' ? 'text-ok' : kind === 'warn' ? 'text-warn' : 'text-info')} />
      <div className="text-fg">{children}</div>
    </div>
  );
}

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="my-4 space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-fg">{i + 1}</span>
          <div className="pt-0.5 leading-relaxed">{item}</div>
        </li>
      ))}
    </ol>
  );
}

export function HelpLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={`/help/${to}`} className="text-accent underline">
      {children}
    </Link>
  );
}

export type LineKind = 'same' | 'changed' | 'added' | 'removed' | 'conflict' | 'faded';

/** A small "file" with highlighted lines, used to illustrate merges. */
export function Lines({ title, subtitle, lines, className }: { title: string; subtitle?: string; lines: [LineKind, string][]; className?: string }) {
  return (
    <div className={cn('min-w-0 overflow-hidden rounded-lg border border-line bg-panel', className)}>
      <div className="border-b border-line bg-subtle px-3 py-1.5">
        <div className="text-xs font-semibold">{title}</div>
        {subtitle && <div className="text-[11px] text-muted">{subtitle}</div>}
      </div>
      <div className="py-1 font-mono text-[12px] leading-5">
        {lines.map(([kind, text], i) => (
          <div
            key={i}
            className={cn(
              'px-3 whitespace-pre-wrap break-words',
              kind === 'changed' && 'bg-info-soft text-info',
              kind === 'added' && 'bg-ok-soft text-ok',
              kind === 'removed' && 'bg-danger-soft text-danger line-through',
              kind === 'conflict' && 'bg-warn-soft text-warn',
              kind === 'faded' && 'text-muted opacity-60',
            )}
            title={text}
          >
            {text || ' '}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Grid({ cols = 3, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  return (
    <div className={cn('my-4 grid gap-3', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'md:grid-cols-3', cols === 4 && 'md:grid-cols-2 xl:grid-cols-4')}>{children}</div>
  );
}

export function Legend() {
  return (
    <div className="my-2 flex flex-wrap gap-3 text-[11px] text-muted">
      <span className="flex items-center gap-1">
        <span className="inline-block size-3 rounded-sm bg-info-soft ring-1 ring-info/40" /> changed
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block size-3 rounded-sm bg-ok-soft ring-1 ring-ok/40" /> added
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block size-3 rounded-sm bg-danger-soft ring-1 ring-danger/40" /> removed
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block size-3 rounded-sm bg-warn-soft ring-1 ring-warn/40" /> conflict
      </span>
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="bg-subtle text-left text-xs text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 leading-relaxed">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap">{children}</kbd>;
}

/**
 * A screenshot from public/help (made by scripts/screenshots.mjs). It is shown no bigger than it was on screen,
 * and opens full size when clicked.
 */
export function Figure({ src, alt, caption, className }: { src: string; alt: string; caption?: ReactNode; className?: string }) {
  const [w, h] = SHOTS[src] ?? [1600, 1000];
  const url = `/help/${src}.webp`;
  return (
    <figure className={cn('my-6', className)}>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mx-auto block overflow-hidden rounded-xl border border-line bg-white shadow-lg shadow-black/5 transition hover:shadow-xl dark:shadow-black/30"
        style={{ maxWidth: Math.round(w / 2) }}
        title="Open full size"
      >
        <img src={url} width={w} height={h} alt={alt} loading="lazy" decoding="async" className="block h-auto w-full dark:brightness-[0.92]" />
      </a>
      {caption && <figcaption className="mx-auto mt-2 text-center text-sm text-pretty text-muted" style={{ maxWidth: Math.max(320, Math.round(w / 2)) }}>{caption}</figcaption>}
    </figure>
  );
}

/** The parts of a screen, one card each: a close-up picture, a name and a line of text. */
export function TourCards({ items }: { items: { src: string; title: ReactNode; text: ReactNode }[] }) {
  return (
    <div className="my-6 grid gap-4 sm:grid-cols-2">
      {items.map((it) => {
        const [w, h] = SHOTS[it.src] ?? [800, 400];
        return (
          <figure key={it.src} className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="flex min-h-36 items-center justify-center overflow-hidden border-b border-line bg-white p-3 dark:bg-subtle">
              <img
                src={`/help/${it.src}.webp`}
                width={w}
                height={h}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-auto rounded-md border border-line/60 dark:brightness-[0.92]"
                style={{ maxWidth: `min(100%, ${Math.round(w / 2)}px)` }}
              />
            </div>
            <figcaption className="p-4">
              <b>{it.title}</b>
              <span className="mt-0.5 block text-[0.9em] leading-snug text-muted">{it.text}</span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/** A row of small cards, each with an icon, a title and a line of text. */
export function Cards({ items }: { items: { icon: ReactNode; title: ReactNode; text: ReactNode; to?: string }[] }) {
  return (
    <div className="my-6 grid gap-3 sm:grid-cols-2">
      {items.map((c, i) => {
        const body = (
          <>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{c.icon}</span>
            <span className="min-w-0">
              <span className="block font-semibold">{c.title}</span>
              <span className="mt-0.5 block text-[0.9em] leading-snug text-muted">{c.text}</span>
            </span>
          </>
        );
        const cls = 'flex gap-3 rounded-xl border border-line bg-panel p-4';
        return c.to ? (
          <Link key={i} to={`/help/${c.to}`} className={cn(cls, 'transition hover:border-accent/60 hover:shadow-md')}>
            {body}
          </Link>
        ) : (
          <div key={i} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
