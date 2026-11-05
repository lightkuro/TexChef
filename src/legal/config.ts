/**
 * Details shown on the Privacy Policy and Terms pages. Set them as build variables
 * (Cloudflare → Worker → Settings → Build → Variables) or in .env for local builds.
 */
export const LEGAL = {
  appName: 'texChef',
  site: 'https://texchef.kurolight.dev',
  /** Person or entity operating the site, e.g. "Jane Doe" or "Kurolight". */
  operator: (import.meta.env.VITE_LEGAL_OPERATOR as string | undefined)?.trim() || '',
  /** Contact for privacy and legal questions: an email address or a URL. */
  contact: (import.meta.env.VITE_LEGAL_CONTACT as string | undefined)?.trim() || '',
  /** Governing law, e.g. "the State of Washington, USA". */
  jurisdiction: (import.meta.env.VITE_LEGAL_JURISDICTION as string | undefined)?.trim() || '',
  /** Bump when the texts change. */
  effective: 'November 5, 2026',
};
