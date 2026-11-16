/**
 * Details shown on the Privacy Policy and Terms pages. Set them as build variables
 * (Cloudflare → Worker → Settings → Build → Variables) or in .env for local builds.
 */
export const LEGAL = {
  appName: 'TexChef',
  /** The address this copy is served from. */
  site: (import.meta.env.VITE_SITE_URL as string | undefined)?.trim() || (typeof location === 'undefined' ? '' : location.origin),
  /** Person or entity operating the site, e.g. "Jane Doe" or "Example Labs". */
  operator: (import.meta.env.VITE_LEGAL_OPERATOR as string | undefined)?.trim() || '',
  /** Contact for privacy and legal questions: an email address or a URL. */
  contact: (import.meta.env.VITE_LEGAL_CONTACT as string | undefined)?.trim() || '',
  /** Where this copy's source code is published (the GPL asks hosts to offer it). Point it at your fork if you changed the code. */
  source: (import.meta.env.VITE_SOURCE_URL as string | undefined)?.trim() || 'https://github.com/lightkuro/TexChef',
  /** Governing law, e.g. "the State of Washington, USA". */
  jurisdiction: (import.meta.env.VITE_LEGAL_JURISDICTION as string | undefined)?.trim() || '',
  /** Bump when the texts change. */
  effective: 'November 5, 2026',
};
