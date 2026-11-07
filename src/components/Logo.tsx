import { Umbrella } from 'lucide-react';

/** texChef mark: a chef's hat with a TeX backslash, drawn in the current theme's accent colors. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden="true">
      <rect width="120" height="120" rx="28" fill="var(--accent)" />
      <g fill="var(--accent-fg)">
        <circle cx="39" cy="49" r="16" />
        <circle cx="60" cy="39" r="19" />
        <circle cx="81" cy="49" r="16" />
        <rect x="34" y="47" width="52" height="33" />
        <rect x="31" y="83" width="58" height="13" rx="4" />
      </g>
      <path d="M50 53 L70 77" stroke="var(--accent)" strokeWidth="8.5" strokeLinecap="round" />
    </svg>
  );
}

/** Tiny "a kurolight.dev project" credit for footers. */
export function KurolightMark({ className }: { className?: string }) {
  return (
    <a
      href="https://kurolight.dev"
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center gap-1 text-[11px] text-muted opacity-80 transition-opacity hover:text-fg hover:opacity-100 ${className ?? ''}`}
      data-testid="kurolight-mark"
    >
      <Umbrella className="size-3" aria-hidden="true" />a kurolight.dev project
    </a>
  );
}
