/** Patch notes, newest first. Shown on the help page “What’s new”; the first entry is the app's version. */

export type NoteKind = 'new' | 'improved' | 'fixed';

export interface Release {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  notes: [NoteKind, string][];
}

export const RELEASES: Release[] = [
  {
    version: '0.12.0',
    date: '2026-11-13',
    title: 'Lighter Drive sync, linking documents, a new first page',
    notes: [
      ['new', 'Google Drive sync takes only what a device needs: the current version of each document, with older versions fetched when you open History, compare or take updates. Settings → Google Drive → “This device keeps” also offers Data saver (a document comes down when you open it; no checking every minute; PDFs left out of uploads) and Everything.'],
      ['improved', 'Sync sends less: the readable copy in Drive is no longer sent again after every compile, only changed files go up, and the list of documents isn’t downloaded again when nothing changed. Bigger images are stored one by one and fetched when a document needs them.'],
      ['new', 'Stay signed in: when Google’s hour-long sign-in runs out, TexChef renews it on your next click and shows a small “Drive resynced” note, instead of waiting for you to press Reconnect. On by default with a mouse; a switch in Settings.'],
      ['new', 'On phones and limited data, a document that needs extra font or package sets (200 MB and more) asks before downloading them.'],
      ['new', 'Link documents that already exist: from a document’s menu, or by dragging a line between two cards on the map, make one a variant of another, unlink a variant, or make a variant the original. No text changes, loops are refused, and each change has Undo.'],
      ['new', 'Send changes to original: the review you know from getting updates, the other way round. See what would change in the original, settle conflicts first, then send; it is saved there as a version you can restore past.'],
      ['improved', 'Restoring a variant to a version from before it took updates puts those updates back on offer. With AI agents on, an assistant can also propose linking or unlinking a document.'],
      ['new', 'Folders panel: Recent (the documents changed last) and Archive beside All documents. The panel’s menu has New folder, Show Recent, Show Archive, Reorder and Hide this panel. Archived documents now wait under Archive instead of mixing into the map.'],
      ['improved', 'The folders button sits on the path bar, next to a back arrow that goes up one folder.'],
      ['new', 'A new first page for new visitors: five short scenes in a tabbed window, each playing once in about a second. Start writing first asks whether to create a new document or upload one.'],
    ],
  },
  {
    version: '0.11.0',
    date: '2026-11-12',
    title: 'AI agents through Google Drive (experimental, off by default)',
    notes: [
      ['new', 'Experimental and opt-in (Settings → Experimental): TexChef can keep a TexChef/Agents(optional_AI) folder in your Google Drive with instructions for an AI assistant you connect to Drive yourself. TexChef never sends anything to an AI.'],
      ['new', 'Replies from AI agents (Import menu, or the editor’s ⌄ menu): pick a reply in Drive or paste one, then review it side by side. Edits you made after the agent read the file are kept; Accept, keep it as a new variant, or Dismiss.'],
      ['new', 'With AI agents on, an AI updates button on the home page and in the editor shows how many replies are waiting. An assistant can now also propose renaming a document, moving it to a folder or to the archive, or creating one as a linked variant; each shows in the review with a tick box. Versions made this way are marked with a small robot.'],
      ['improved', 'Autosaves are small dots on the line in the Versions view and one-line rows in History, so they no longer crowd out the versions you saved. The toggles to show or hide them stay.'],
      ['improved', 'Versions view: point at a version to see what it is (its number, what kind of version, which document, when, and how many files) without waiting for the browser’s tooltip.'],
      ['improved', 'Picking AI replies in Google Drive opens in the Agents folder, and the hint for Brave explains its sign-in step. The tip shown while Google’s picker is open has a “Don’t show again” button (and a switch in Settings).'],
      ['improved', 'When the browser’s storage is full, TexChef says so and what to do instead of failing quietly.'],
      ['fixed', 'Versions view: links between documents go around the versions in between instead of through them, and a link that brings updates in arrives from above or below.'],
      ['fixed', 'Coloured borders show as designed (the selected template and colour theme, ticked boxes, update badges, tip boxes), and the “working” spinner shows as a turning arc.'],
    ],
  },
  {
    version: '0.10.0',
    date: '2026-11-11',
    title: 'Room to work',
    notes: [
      ['new', 'Editor panels fold away: drag the line between two panels onto the next one and the panel becomes a slim strip at the edge; click the strip to open it again. The side panel button does the same on large screens, and the layout is remembered.'],
      ['new', 'Compare: Save has a menu to save only one side, or to keep one side’s edits as a new variant and put the original back as it was.'],
      ['new', 'Compare: each side can be set to view only (the eye), to look at one document while writing another.'],
      ['improved', 'Compare: Blocks that differ has a hide button; Blocks at the top brings it back.'],
      ['improved', 'Compare: each side’s document and version now sit right above that side, with a pencil, eye or lock instead of “Current (editable)”. Swap and the button that sets which way the copy arrows go sit between them, above the arrows; the top bar keeps only the view options and Save.'],
    ],
  },
  {
    version: '0.9.0',
    date: '2026-11-10',
    title: 'A cover page that shows instead of tells',
    notes: [
      ['new', 'New visitors get a short animated tour: as you scroll, a TexChef window acts out writing, editing on the PDF, Visual mode, versions on the map, comparing side by side, and where your documents live.'],
      ['improved', 'Each scene plays at its own pace, however fast you scroll, then moves on to the next by itself two seconds later; scrolling back starts a scene over. The page eases onto the nearest scene when you stop scrolling.'],
      ['improved', 'On large screens the scene is centred, with its title above and its description below, the scenes on a vertical roller at the side, and a quiet glass Start writing button at the bottom.'],
      ['improved', 'Start writing stays within reach during the tour; See how it works scrolls you into it.'],
      ['new', 'The tour is also the Intro page of the help.'],
      ['improved', 'The cover page fills the whole screen, with its own bar (Start writing, Google Drive, themes); on phones Start writing stays in that bar instead of floating over the demo.'],
      ['improved', 'A tidier footer: the version, Terms (with a link to the Privacy Policy) and “made by kurolight.dev”.'],
      ['fixed', 'Start writing and See how it works now respond to taps on phones.'],
      ['improved', 'One swipe on a phone, or one wheel or trackpad gesture on a computer, moves exactly one scene (a flick used to skip one).'],
    ],
  },
  {
    version: '0.8.0',
    date: '2026-11-10',
    title: 'Patch notes and a clearer start',
    notes: [
      ['new', 'What’s new: notes for every version, starting with this one.'],
      ['new', 'Landing page: a Visual interface section, editing on the PDF shown first, and new pictures that show what variants are for.'],
      ['improved', 'New document starts with Blank article; the resume and cover letter templates are a click away.'],
      ['improved', 'The editor tour in Getting started shows each part up close instead of numbers on a small picture.'],
      ['improved', 'Help pages end with a Back to the app button, so you don’t have to scroll up for it.'],
      ['improved', 'Pictures and wording show articles and essays too, not only resumes.'],
      ['fixed', 'The cursor’s line in the PDF is highlighted word for word: it no longer takes the last word of the line before, or skips the first word of a wrapped line.'],
    ],
  },
  {
    version: '0.7.0',
    date: '2026-11-09',
    title: 'TexChef',
    notes: [
      ['improved', 'New spelling: TexChef. Your Google Drive folder is renamed on the next sync; nothing moves.'],
      ['new', 'A new landing page: “Edit with LaTeX easily, all in the browser”, with New document (its arrow uploads files or a folder) and the TexChef Guide.'],
      ['new', 'Every help topic has pictures of the app, and Getting started is easier to read.'],
      ['improved', 'Import and Export icons point in and out; the folders button hides until there are folders to show.'],
      ['fixed', 'The Google Drive picker can always be closed, and explains what to do when the browser blocks it (Brave’s Shields, Safari).'],
    ],
  },
  {
    version: '0.6.0',
    date: '2026-11-08',
    title: 'Phones, tabs and a tidier editor',
    notes: [
      ['new', 'Works on phones, iPads and split-screen windows: one pane at a time, with bigger buttons to tap.'],
      ['new', 'File tabs above the editor for documents with several files; + opens another.'],
      ['new', 'The Compile button’s menu: engine (pdfLaTeX marked as default), auto-compile and Download PDF.'],
      ['new', 'History numbers versions (v1, v1.1…) and shows how many lines each changed.'],
      ['new', 'Import menu (files, a folder, Google Drive) and Export → Backup TexChef, also straight to Drive.'],
      ['improved', 'The formatting bar stays hidden until you open it with Aa; folders look different from documents at a glance.'],
      ['improved', 'The edit box on the PDF can be resized, and selecting text in it no longer jumps to another line.'],
      ['improved', 'Many “overfull box” warnings fold into “N hidden”, one click to show.'],
      ['fixed', 'PDFs didn’t show on Safari (iPhone, iPad, Mac).'],
      ['fixed', 'Documents synced from Google Drive could open to a blank screen.'],
    ],
  },
  {
    version: '0.5.0',
    date: '2026-11-07',
    title: 'Visual mode',
    notes: [
      ['new', 'Visual mode: headings, bold text and bullets show formatted while you edit. Switching back changes nothing in the file.'],
      ['new', 'Formatting bar: bold, italic, underline, size, color, lists, links, headings and more.'],
      ['new', 'Font menu: Charter, Times, Palatino, Helvetica and others, for the whole document.'],
      ['new', 'When an error needs XeLaTeX or LuaLaTeX, TexChef says so and switches in one click.'],
      ['fixed', 'Packages from TeX Live’s larger sets load reliably, including documents that pull them in through \\input.'],
    ],
  },
  {
    version: '0.4.0',
    date: '2026-11-07',
    title: 'Folders and backups',
    notes: [
      ['new', 'Folders on the home page: drag documents in, move them with right-click menus, browse or see everything expanded.'],
      ['new', 'Full backup and restore: every version, folder and setting, as a .zip or into a folder on your computer.'],
      ['new', 'First-page previews on the map, plus layout options (snap to grid, full pages).'],
      ['new', 'A .zip holding several projects (such as a Prism export) imports as separate documents.'],
      ['new', 'TexChef asks before you leave with text that isn’t saved yet.'],
      ['improved', 'Green is the default color theme; the cursor’s line is highlighted in the PDF (can be turned off).'],
    ],
  },
  {
    version: '0.3.0',
    date: '2026-11-06',
    title: 'Edit on the PDF',
    notes: [
      ['new', 'Click text in the PDF to change it, without looking for it in the LaTeX.'],
      ['new', 'Help guides for every feature.'],
      ['new', 'Color labels for documents.'],
      ['improved', 'Plain wording everywhere: Get updates, Copy to original, Versions.'],
      ['fixed', 'Right-click menus on the map, and straight lines between documents.'],
    ],
  },
  {
    version: '0.2.0',
    date: '2026-11-05',
    title: 'A name and a look',
    notes: [
      ['improved', 'A name (texChef), a logo and color themes.'],
      ['new', 'Privacy Policy and Terms.'],
      ['new', 'Double-click the PDF to jump to that line of the source, and find the cursor’s line in the PDF.'],
      ['new', 'Archive documents you don’t need on the home page.'],
      ['improved', 'The TeX engine is kept between visits, so later visits start fast.'],
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-05',
    title: 'First version',
    notes: [
      ['new', 'LaTeX compiled in your browser with TeX Live 2026: nothing to install, nothing sent to a server.'],
      ['new', 'Master documents and linked variants made by picking tagged blocks; Get updates brings later changes in.'],
      ['new', 'A map of documents and versions, and compare-and-edit side by side.'],
      ['new', 'Saved in your browser first, with optional Google Drive sync between devices.'],
    ],
  },
];

export const APP_VERSION = RELEASES[0].version;
