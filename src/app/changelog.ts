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
    version: '0.10.0',
    date: '2026-11-11',
    title: 'Room to work',
    notes: [
      ['new', 'Editor panels fold away: drag the line between two panels onto the next one and the panel becomes a slim strip at the edge; click the strip to open it again. The side panel button does the same on large screens, and the layout is remembered.'],
      ['new', 'Compare: Save has a menu to save only one side, or to keep one side’s edits as a new variant and put the original back as it was.'],
      ['new', 'Compare: each side can be set to view only (the eye), to look at one document while writing another.'],
      ['improved', 'Compare: a pencil, eye or lock next to each side replaces “Current (editable)”, and the button that sets which way the copy arrows go sits right above them.'],
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
