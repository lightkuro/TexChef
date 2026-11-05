# ResumeChef

A browser LaTeX editor (in the spirit of Overleaf) built around one idea: **write one long master resume, then branch
focused variants from it** — and keep them linked.

- **Compile in the browser.** TeX Live 2026 running as WebAssembly ([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex)); pdfLaTeX, XeLaTeX, LuaLaTeX, BibTeX. No compile server.
- **Linked variants.** Build a variant by ticking sections/jobs/bullets or picking tags (`#backend`, `#ml`…) with a live PDF and page count. Later, **pull** master edits into a variant with a 3‑way merge, or **push** a reworded bullet back up.
- **Source ↔ PDF sync (SyncTeX).** Double-click the PDF to jump to the source line; the locate button highlights the cursor's line in the PDF.
- **Version history.** Every save is an immutable version; restore, branch from, download or compare any of them.
- **Graphs.** A family tree of documents (master → variants → sub‑variants) and git‑style version swimlanes.
- **Side‑by‑side compare & edit.** Any two documents (or versions); both sides editable, per‑change copy arrows, copy whole blocks across, PDFs side by side.
- **Bring your own storage.** Everything lives in your browser (IndexedDB) and, if you connect it, your own Google Drive using the narrow `drive.file` permission. There is no ResumeChef server.
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
- **Pull from parent** re‑applies the recipe to the parent's old and new versions and 3‑way merges the difference into the variant, so your rewording survives. Blocks that are new in the parent are offered for inclusion. Conflicts are shown side by side.
- **Push block to parent** copies one block (matched by id) into the parent and records it as a version there.
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

## Google Drive setup

ResumeChef uses the Google Identity Services token flow from the browser — no backend and no client secret.

1. In [Google Cloud console](https://console.cloud.google.com/), create a project and **enable the Google Drive API** and the **Google Picker API**.
2. **OAuth consent screen**: External, publishing status **Testing**. Add the scope `.../auth/drive.file` and add yourself and your friends as **Test users** (up to 100). `drive.file` is a non‑sensitive scope, so no verification is needed while you stay in Testing.
3. **Credentials → Create OAuth client ID → Web application.** Authorized JavaScript origins: `http://localhost:5173` and your deployed origin (`https://texchef.kurolight.dev`). No redirect URIs are needed.
4. **Credentials → Create API key** (for Google Picker only). Restrict it to the Picker API and to your origins as HTTP referrers.
5. Copy `.env.example` to `.env` and fill in:

   ```
   VITE_GOOGLE_CLIENT_ID=<client id>.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=<api key>
   VITE_GOOGLE_APP_ID=<project number>
   ```

What ends up in Drive:

```
ResumeChef/
  Master resume/          readable copy of each document + its latest PDF (updated when you save a version)
  Master resume · Backend/
  .resumechef/            history: index.json, packs/ (versions), blobs/ (large files) — leave as is
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

To check the production setup locally, run `pnpm build:pages`, then `pnpm preview`; it serves the sharded copy.

## Project layout

```
src/
  core/        versions: model, repo (commits, working copies, merge base), 3-way text merge, hashing
  blocks/      %% @block parser, recipe filter, auto-mark, block copy/compare
  variants/    create variant, pull from parent, push block to parent
  compile/     BusyTeX wrapper, TeX bundle planner, log parser, pdf.js helpers
  storage/     Dexie database, sync engine (packs + index), Drive and in-memory providers
  features/    dashboard, editor, graph, compare, variants UI, history, sync, settings, import/export
  templates/   master resume, cover letter, article
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
