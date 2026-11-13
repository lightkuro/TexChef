# Landing page ideas (static pages)

Design studies for the home page, served as plain HTML next to the app:

| Address | File | Idea |
| --- | --- | --- |
| `/ideas/typeset` | `typeset.html` | The page as a typeset document: Computer Modern headings, numbered sections, ruled lines. |
| `/ideas/split` | `split.html` | Product first: the editor large beside a left-aligned headline, features as a ruled list. |

`/ideas/clean` (today's scroll story with the decoration removed) and `/ideas` (the current page) live in the app:
`src/features/ideas/IdeasPage.tsx`.

Rules these pages follow: left-aligned on a 12-column grid; paper, ink and one accent; no gradients; nothing animated on
load; no transition over 300 ms; real screenshots of the app, as close-ups where the whole window would make its text
tiny. The typeset page uses two typefaces only (Computer Modern for headings, the system sans for the rest), writes
"LaTeX" plainly, and keeps each section to a title, a few lines, a picture and at most one short line under it.

- **Build:** the pages are extra Vite inputs (`vite.config.ts`, `IDEAS_PAGES`). The host serves `/ideas/typeset` from
  `dist/ideas/typeset.html`; a small dev-server rewrite does the same for `pnpm dev`.
- **Pictures:** `node scripts/ideas-shots.mjs [baseUrl]` (with `pnpm dev` running) writes
  `public/landing/ideas-<scene>[-focus]-<light|dark>[-800].webp` (`-focus` are the close-ups).
- **Font:** `fonts/texchef-modern-*.woff2` are Latin subsets of CMU Serif (Computer Modern Unicode), renamed as the
  SIL Open Font License asks of modified versions. Licence: `fonts/OFL.txt`.
- **Start writing** links to `/?new=1`, which opens the app's New document dialog.
