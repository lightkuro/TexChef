# texChef

A browser LaTeX editor (in the spirit of Overleaf) built around one idea: **write one long master resume, then branch
focused variants from it** — and keep them linked.

- **Compile in the browser.** TeX Live 2026 running as WebAssembly ([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex)); pdfLaTeX, XeLaTeX, LuaLaTeX, BibTeX. No compile server.
- **Linked variants.** Build a variant by ticking sections/jobs/bullets or picking tags (`#backend`, `#ml`…) with a live PDF and page count. Later, **get updates** from the original (master edits are combined with a 3‑way merge), or **copy** a reworded bullet back to the original.
- **Edit on the PDF.** Turn on *Edit text* and click any sentence in the PDF to change it as plain text; texChef finds the LaTeX behind it (SyncTeX + text matching), rewrites only the changed characters, escapes `& % $ # _`, and keeps formatting. Optionally makes the same change in the variant's original.
- **Source ↔ PDF sync (SyncTeX).** Double-click the PDF to jump to the source line; the locate button highlights the cursor's line in the PDF.
- **Version history.** Every save is an immutable version; restore, branch from, download or compare any of them.
- **Map.** A family tree of documents (master → variants → sub‑variants, straight or right‑angled lines, update counts by each arrow) and git‑style version swimlanes.
- **Side‑by‑side compare & edit.** Any two documents (or versions); both sides editable, per‑change copy arrows, copy whole blocks across, PDFs side by side.
- **Bring your own storage.** Everything lives in your browser (IndexedDB) and, if you connect it, your own Google Drive using the narrow `drive.file` permission. There is no texChef server.
- **Themes.** Six color themes (Kitchen, Ocean, Forest, Plum, Graphite, Nord), each in light and dark.
- **Privacy Policy and Terms** at `/privacy` and `/terms`, linked from every page footer (needed for Google's branding review).
- **Upload / download.** `.tex`, `.cls`, `.sty`, `.bib`, images, fonts, Overleaf `.zip` exports; download PDF, sources or a project `.zip`, or all PDFs at once.

## Blocks: how variants work

Blocks are marked with LaTeX comments, so the compiler ignores them:

```tex
%% @block exp-acme tags=backend,lead
\rcEntry{Acme}{2022 -- Now}{Senior Engineer}{Remote}
\rcItemListStart
  %% @block acme-k8s tags=infra
  \rcItem{Migrated 40 services to Kubernetes.}
  %% @end
\rcItemListEnd
%% @end
```

- Blocks nest and need ids that are unique in the project. `tags=` is optional; `title="…"` overrides the label.
- A variant keeps a *recipe*: blocks you ticked, or tags you picked (tag mode keeps untagged structure plus matching blocks), with per‑block overrides.
- **Get updates** (called *pull* in the code) re‑applies the recipe to the original's old and new versions and 3‑way merges the difference into the variant, so your rewording survives. Blocks that are new in the original are offered for inclusion. Conflicts are shown side by side.
- **Copy to original** (called *push* in the code) copies one block (matched by id) into the original and records it as a version there.

The UI says *original* for what the code calls the *parent* document.
- Item lists left empty by filtering are removed automatically so LaTeX doesn't fail with "missing \item".
- Already have a resume? Upload it and press **Auto‑mark** in the Blocks panel: it wraps sections, entries (`\resumeSubheading`, `\cventry`, `\subsection`, …) and bullets (`\item`, `\resumeItem`) in blocks. Undo with Ctrl/⌘+Z.

The **Master resume** template is already split into tagged blocks.

## Run locally

Requires Node 20+ and pnpm.

```bash
pnpm install
```

```bash
pnpm tex:assets   # downloads the BusyTeX engine + TeX Live data (~520 MB download, ~700 MB on disk) into tex-assets/
```

```bash
pnpm dev          # http://localhost:5173
```

The dev server serves `tex-assets/busytex` at `/core/busytex` (see `vite.config.ts`); it is not copied into the build.
The browser downloads the 93 MB core bundle once and caches it; the `recommended` (201 MB) and `extra` (342 MB)
collections download only when a document uses a package from them (e.g. `titlesec`, `enumitem`, the Charter font).

Other scripts:

| Command | What it does |
| --- | --- |
| `pnpm test` | Unit tests (blocks, merge, versions, variants, sync, log parser) |
| `pnpm typecheck` | TypeScript |
| `pnpm build` | Production build into `dist/` (~3 MB, without the TeX engine) |
| `pnpm build:pages` | Build plus the gzipped, sharded TeX engine in `dist/core/busytex` (what gets deployed) |
| `pnpm e2e http://localhost:5173` | Browser end‑to‑end checks with Playwright against a running dev server |
| `pnpm e2e:engines http://localhost:5173` | Engine coverage: XeLaTeX + fontspec, LuaLaTeX, BibTeX, images, TikZ, moderncv (downloads the larger bundles) |

Without Google configuration the app runs in **Local only** mode: fully functional, data stays in this browser.

The Privacy Policy and Terms send questions to https://kurolight.dev/contact. Optionally set `VITE_LEGAL_OPERATOR`
(who runs the site), `VITE_LEGAL_CONTACT` (another email or URL) and `VITE_LEGAL_JURISDICTION` (governing law) as build
variables. The texts in `src/legal/` are written for this app's actual data flows, not legal advice; have them reviewed
if the stakes matter.

## Google Drive setup

texChef uses the Google Identity Services token flow from the browser — no backend and no client secret.

1. **Project.** In [Google Cloud console](https://console.cloud.google.com/), create a project (e.g. `texchef`)
   and note its **project number** (Dashboard / project settings) — that is `VITE_GOOGLE_APP_ID`.
2. **APIs.** APIs & Services → Library: enable **Google Drive API** and **Google Picker API**.
3. **Google Auth Platform** (left menu; formerly "OAuth consent screen"):
   - **Branding:** app name (`texChef`), support email, logo `brand/logo-120.png` (120×120 PNG), app home page
     `https://texchef.kurolight.dev`, privacy policy `https://texchef.kurolight.dev/privacy`, terms of service
     `https://texchef.kurolight.dev/terms`, developer contact; under **Authorized domains** add `kurolight.dev`.
     Google shows the name and logo on the sign-in screen only after a brand verification (a few days); until then it
     shows the domain, which is fine for testing.
   - **Audience:** user type **External**, publishing status **Testing**; add yourself and friends as **Test users**
     (up to 100).
   - **Data Access:** Add or remove scopes → `.../auth/drive.file` ("See, edit, create and delete only the specific
     Google Drive files you use with this app"). It is non‑sensitive, so no verification is needed in Testing.
   - **Clients:** Create client → **Web application**. Authorized JavaScript origins: `https://texchef.kurolight.dev`
     and `http://localhost:5173`. No redirect URIs. Copy the **Client ID** (the secret is not used).
4. **API key** (Google Picker only): APIs & Services → Credentials → Create credentials → API key. Restrict it:
   application restriction **Websites** with `https://texchef.kurolight.dev/*` and `http://localhost:5173/*`;
   API restriction **Google Picker API**.
5. Copy `.env.example` to `.env` for local development, and set the same three values as **build** variables in
   Cloudflare (Worker → Settings → Build → Variables and secrets), then redeploy:

   ```
   VITE_GOOGLE_CLIENT_ID=<client id>.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=<api key>
   VITE_GOOGLE_APP_ID=<project number>
   ```

What ends up in Drive:

```
texChef/
  Master resume/          readable copy of each document + its latest PDF (updated when you save a version)
  Master resume · Backend/
  .texchef/            history: index.json, packs/ (versions), blobs/ (large files) — leave as is
```

Sync runs after saves, when the tab regains focus and every minute. Edits made offline or on two devices at once are
never lost: when two devices change the same document, you get a banner to merge (3‑way) or compare. Access tokens last
an hour and are kept in the tab's session storage; after that the app shows **Reconnect Drive**.

**Import from Drive** (dashboard) opens Google Picker; picking a file is what grants a `drive.file` app access to it.

## Deploy (Cloudflare Workers static assets, free plan)

The app is fully static, so it deploys as an **assets-only Worker**: no Worker code runs, asset requests are free
and unlimited, and no R2 or paid features are needed. Free-plan limits that matter: 25 MiB per file and 20,000
files per deployment (we use ~70).

The engine's big files exceed 25 MiB, so `scripts/shard-tex-assets.mjs` gzips every `.wasm`/`.data` file and splits
it into ≤24 MiB parts (`texlive-basic.data.gz.000`, `.001`, …) listed in `shards.json`; `busytex_worker.js` is
replaced by a small wrapper (`scripts/busytex-worker-shim.js`) that streams the parts back together and gunzips them
in the browser. Result: 46 engine files, about 520 MB (from ~700 MB). Gzip also makes the first visit lighter:
about 80 MB instead of 125 MB for the engine core.

**Git-connected Worker (Workers & Pages → Create → Import a repository):**

1. Build command: `pnpm cf:build` (downloads the engine from the texlyre-busytex GitHub release, builds, shards).
   Deploy command: `npx wrangler deploy` (the default). `wrangler.toml` serves `dist/` as static assets with
   single-page-app fallback. Its build step (`scripts/ensure-site.mjs`) also completes `dist/` if the build command
   was left at a plain `npm run build`, so a deploy never ships without the TeX engine.
2. Settings → Build → **Variables and secrets** (build variables, not runtime ones — Vite bakes them in at build
   time): `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID`.
3. Settings → Domains & Routes → Add → **Custom domain** → `texchef.kurolight.dev`. If Cloudflare reports an
   existing DNS record for that name, delete the record and add the domain again (Cloudflare creates its own).
   To manage the domain from code instead, uncomment the `routes` line in `wrangler.toml`.
4. In Google Cloud → Credentials → your OAuth client, add `https://texchef.kurolight.dev` to **Authorized JavaScript
   origins** (and to the API key's allowed referrers as `https://texchef.kurolight.dev/*`).

**Or deploy from your machine:**

```bash
pnpm tex:assets && pnpm build:pages
```

```bash
npx wrangler deploy
```

Uploads are de-duplicated by content hash and the shards are deterministic, so after the first deploy only changed
files are uploaded.

**Caching.** Engine parts are named after a hash of their content (`/core/busytex-parts/…`) and cached by the
browser for a year; the TeX packages are also stored in IndexedDB by the engine. The small loader files and
`shards.json` are always revalidated (`304 Not Modified` when unchanged), so reopening the site downloads none of
the large files, and a new engine version is picked up immediately without mixing old and new parts. The app asks
the browser for persistent storage after the first save (status and usage are shown in Settings).

To check the production setup locally, run `pnpm build:pages`, then `pnpm preview`; it serves the sharded copy.

## Project layout

```
src/
  core/        versions: model, repo (commits, working copies, merge base), 3-way text merge, hashing
  blocks/      %% @block parser, recipe filter, auto-mark, block copy/compare
  variants/    create variant, get updates (pull), copy block to original (push)
  pdfedit/     edit on the PDF: LaTeX → plain text projection, PDF text → source matching, edit write-back
  compile/     BusyTeX wrapper, TeX bundle planner, log parser, pdf.js helpers
  storage/     Dexie database, sync engine (packs + index), Drive and in-memory providers
  features/    dashboard, editor, graph, compare, variants UI, history, sync, settings, import/export
  templates/   master resume, cover letter, article
  legal/       Privacy Policy and Terms pages (details from VITE_LEGAL_* variables)
brand/         logo sources (SVG) and exported PNGs (120 px for Google, 512 px)
scripts/       engine sharding, the worker wrapper that reassembles shards, deploy helper
e2e/           Playwright end-to-end checks
```

## Limits and notes

- First compile needs the 93 MB core download; packages outside it trigger larger one‑time downloads. A package that
  isn't in TeX Live 2026's bundled collections can be uploaded as a `.sty` into the project.
- Fonts: XeLaTeX/LuaLaTeX can use fonts in TeX Live or fonts you upload into the project. The template uses Latin Modern;
  `\usepackage{charter}` works but pulls the 342 MB `extra` bundle.
- No real‑time co‑editing; one person per workspace. Share PDFs or the Drive folder.
- Licensing: texlyre-busytex is AGPL‑3.0 and TeX Live programs are GPL. Fine for private use; if you ever offer this
  publicly, you must offer the corresponding source.

## Ideas for later

A visual PDF diff overlay, offline PWA shell, a GitHub storage provider, and AI tailoring
(paste a job description → suggested tags/blocks and bullet rewrites with your own API key).
