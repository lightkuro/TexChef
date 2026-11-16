import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { LEGAL } from './config';

export function Operator() {
  return LEGAL.operator ? <>{LEGAL.operator}</> : <>the operator of {LEGAL.appName}</>;
}

export function Contact() {
  if (!LEGAL.contact) return <>the operator of this site (no contact details have been set for this copy of {LEGAL.appName})</>;
  const isEmail = LEGAL.contact.includes('@') && !LEGAL.contact.startsWith('http');
  return (
    <a className="text-accent underline" href={isEmail ? `mailto:${LEGAL.contact}` : LEGAL.contact} rel="noopener">
      {LEGAL.contact}
    </a>
  );
}

export function Jurisdiction() {
  return LEGAL.jurisdiction ? <>{LEGAL.jurisdiction}</> : <>the place where the operator of {LEGAL.appName} is based</>;
}

export function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="text-accent underline" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-2 text-lg font-semibold">{children}</h2>;
}

export function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={`my-2 leading-relaxed ${className ?? ''}`}>{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="my-2 list-disc space-y-1 pl-6 leading-relaxed">{children}</ul>;
}

/** Shared layout for the public legal pages (no sign-in needed, linked from the home page). */
export function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="h-full overflow-auto bg-bg">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-line bg-panel px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <Logo size={26} /> {LEGAL.appName}
        </Link>
        {/* Phones: the page title is right below, as the heading. */}
        <span className="text-muted max-sm:hidden">/</span>
        <span className="truncate text-sm max-sm:hidden">{title}</span>
        <div className="flex-1" />
        <Link to="/" className="flex shrink-0 items-center gap-1 text-sm whitespace-nowrap text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Back to the app
        </Link>
      </header>
      <article className="mx-auto max-w-3xl px-6 py-10 text-[15px] text-fg max-sm:px-4 max-sm:pt-6 max-sm:pb-[calc(2.5rem+env(safe-area-inset-bottom))]" data-testid="legal-page">
        <h1 className="text-3xl font-semibold tracking-tight max-sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-muted">Effective {LEGAL.effective}</p>
        {children}
        <footer className="mt-12 border-t border-line pt-4 text-sm text-muted">
          <Link to="/privacy" className="hover:text-fg">
            Privacy Policy
          </Link>{' '}
          ·{' '}
          <Link to="/terms" className="hover:text-fg">
            Terms of Service
          </Link>
        </footer>
      </article>
    </div>
  );
}
