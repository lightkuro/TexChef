import type { ReactNode } from 'react';
import { Eye, GitBranch, HardDrive, MousePointerClick } from 'lucide-react';
import { Changelog } from './Changelog';
import { C, Cards, Code, Figure, Grid, H2, H3, HelpLink, Kbd, Legend, Lines, Note, OL, P, Steps, Table, TourCards, UL } from './kit';

export interface Topic {
  id: string;
  title: string;
  summary: string;
  body: () => ReactNode;
  /** Bigger text (the first page new users read). */
  large?: boolean;
  /** Listed only while Settings → Experimental → AI agents is on. */
  agentsOnly?: boolean;
}

/** Old topic addresses that still work. */
export const TOPIC_ALIASES: Record<string, string> = { pulling: 'updates', pushing: 'copy-to-original', graphs: 'map' };

export const TOPICS: Topic[] = [
  {
    id: 'intro',
    title: 'Intro',
    summary: 'TexChef in a minute: scroll through what it does.',
    // Shown by HelpPage as the home page's scroll story.
    body: () => null,
  },
  {
    id: 'getting-started',
    title: 'Getting started',
    summary: 'What TexChef is, and your first document in five minutes.',
    large: true,
    body: () => (
      <>
        <p className="my-5 text-[1.12em] leading-relaxed text-pretty">
          TexChef is a LaTeX editor that runs entirely in your browser: nothing to install, and your documents stay on your device. It is made for
          resumes but works for anything LaTeX does: letters, papers, notes.
        </p>
        <Cards
          items={[
            { icon: <MousePointerClick className="size-[18px]" />, title: 'Edit on the PDF', text: 'Click text in the preview and type the change.', to: 'edit-on-pdf' },
            { icon: <Eye className="size-[18px]" />, title: 'Visual mode', text: 'See headings and bold text instead of commands.', to: 'visual-editor' },
            { icon: <GitBranch className="size-[18px]" />, title: 'One master, many versions', text: 'Tailored copies that still get your later fixes.', to: 'variants' },
            { icon: <HardDrive className="size-[18px]" />, title: 'Yours, on your device', text: 'Saved in this browser; back up to Google Drive if you like.', to: 'sync' },
          ]}
        />

        <H2>1. Start a document</H2>
        <P>
          On the home page, click <b>New document</b>. <b>Blank article</b> is ready for an essay, notes or a paper; <b>Master resume</b> comes
          already split into pieces you can make tailored versions from. Have a file already? The arrow next to New document (or{' '}
          <b>Import</b>) uploads a <C>.tex</C> file, a folder, or a .zip from Overleaf.
        </P>
        <Figure src="new-document" alt="The New document window: Blank article (chosen), Master resume and Cover letter." />

        <H2>2. Find your way around the editor</H2>
        <P>
          The editor has three columns: the parts of your document on the left, its LaTeX in the middle and the PDF on the right. The buttons
          you need most sit at the top right.
        </P>
        <Figure src="editor" alt="The editor: Blocks, Files and History on the left, the LaTeX in the middle, the PDF on the right, and the buttons at the top right." />
        <TourCards
          items={[
            { src: 'tour-side', title: 'Blocks, Files, History', text: 'The pieces of your document, its files, and every saved version.' },
            { src: 'tour-code', title: 'Your LaTeX', text: 'Type here. Aa, at the right of this bar, opens the formatting buttons and Visual mode.' },
            { src: 'tour-pdf', title: 'The PDF', text: 'Updates a moment after you stop typing. Click text in it to edit; zoom and download are above it.' },
            { src: 'tour-compile', title: 'Compile', text: 'Updates the PDF right now. Its arrow holds the engine, auto-compile and Download PDF.' },
            { src: 'tour-save', title: 'Save version', text: <>A snapshot you can come back to (<Kbd>Ctrl/⌘ S</Kbd>). Your typing is kept anyway.</> },
            { src: 'tour-variant', title: 'New variant', text: 'A tailored copy of this document that stays linked to it.' },
          ]}
        />

        <Note kind="tip">
          Need more room? Drag the line between two panels onto the next one and the panel folds into a slim strip at the edge; click the strip
          to bring it back. The button at the top left hides or shows the Blocks, Files and History panel.
        </Note>

        <H2>3. Make a change right on the PDF</H2>
        <P>
          Click a sentence in the PDF. A box opens with its words, without any LaTeX. Type your change and press <Kbd>Enter</Kbd>: TexChef edits
          the source for you and updates the PDF.
        </P>
        <Figure src="pdf-edit" alt="A bullet in the PDF, clicked: a small box shows its text, ready to edit, with Save and Cancel." />
        <Note kind="tip">
          Your work is kept as you type, even if you close the tab. <b>Save version</b> marks a point you may want to come back to. See{' '}
          <HelpLink to="saving">Saving</HelpLink>.
        </Note>

        <H2>4. Tailor it with a variant</H2>
        <P>
          Click <b>New variant</b> and pick what to keep, one piece at a time or by tag (here, everything tagged <C>#frontend</C>). The preview
          and page count update as you choose.
        </P>
        <Figure src="variant-builder" alt="Making a variant: the frontend tag is picked, and the preview shows the shorter resume and its page count." />
        <P>
          Later, when you fix something in the master, the variant shows <b>Get 1 update</b>. One click brings the fix in and keeps the edits you
          made in the variant.
        </P>
        <Figure src="get-updates" alt="The variant’s header: variant of Master resume, and a Get 1 update button." />

        <H2>5. See everything on the map</H2>
        <P>
          Back on the home page, the <b>Map</b> shows your documents and how they are linked. Switch to <b>List</b> for a plain list, or to{' '}
          <b>Versions</b> to see every saved version over time. Folders on the left keep things tidy.
        </P>
        <Figure src="home-map" alt="The home page map: the Master resume card with a line to its Frontend resume variant." />

        <Note>
          Want your documents on another computer, or a backup? Connect Google Drive at the top right. See{' '}
          <HelpLink to="sync">Google Drive and devices</HelpLink>.
        </Note>

        <H2>Words used in TexChef</H2>
        <Table
          head={['Word', 'Meaning']}
          rows={[
            [<b>Document</b>, 'A LaTeX project: one or more files that compile to one PDF.'],
            [<b>Master</b>, 'The document you make variants from. Usually your full resume.'],
            [<b>Variant</b>, 'A document made from another one by picking some of its blocks. It stays linked to the document it came from.'],
            [<b>Original</b>, 'The document a variant was made from. For most variants that is your master; a variant of a variant has that variant as its original.'],
            [<b>Block</b>, 'A marked piece of a document (a section, a job, a bullet) that variants can keep or leave out.'],
            [<b>Version</b>, 'A saved snapshot of a document. You can compare, restore, or start a new variant from any version.'],
            [<b>Updates</b>, 'Changes made in the original since the variant last caught up. Get updates brings them into the variant.'],
            [<b>Copy to original</b>, 'Send an improvement made in a variant back to its original.'],
            [<b>Conflict</b>, 'A line that was changed differently in the variant and in the original. You choose which to keep.'],
          ]}
        />
      </>
    ),
  },
  {
    id: 'edit-on-pdf',
    title: 'Editing on the PDF',
    summary: 'Click text in the PDF to change it, without hunting through the LaTeX.',
    body: () => (
      <>
        <P>
          For small fixes (a typo, a date, a number in a bullet) you do not need to find the line in the LaTeX: click the words in the PDF. This
          is on by default; <b>Edit text</b> in the bar above the PDF turns it off and on.
        </P>
        <Figure src="pdf-edit" alt="A clicked bullet in the PDF, outlined in green, with the edit box open under it." />
        <Steps
          items={[
            <>
              Move the mouse over the PDF: the line under it is outlined. While an edit box is open, the PDF waits, so nothing moves under your
              cursor.
            </>,
            <>
              Click a sentence. A box opens under it with the text as plain words: no backslashes or braces. The matching piece of the PDF is
              highlighted, and the box shows which file and line it comes from.
            </>,
            <>
              Change the text and press <Kbd>Enter</Kbd> (or <b>Save</b>). <Kbd>Esc</Kbd> cancels. Drag the box's bottom corners to make it
              bigger for long text.
            </>,
            <>
              With <b>Update PDF after saving</b> ticked (at the bottom of the box, on by default) the PDF recompiles straight away. Untick it to
              collect several changes first: they get an orange <b>edited</b> outline, and a bar above the PDF offers <b>Update PDF</b> when you
              are ready. TexChef remembers the choice.
            </>,
          ]}
        />
        <H2>What gets changed</H2>
        <P>
          TexChef only rewrites the characters you changed. Formatting around them stays as it was, and characters LaTeX treats specially are
          written the way LaTeX needs them:
        </P>
        <Grid cols={2}>
          <Lines title="You type" lines={[['changed', 'Grew revenue 25% & cut costs – Q1_2024']]} />
          <Lines title="Saved in the LaTeX" lines={[['changed', 'Grew revenue 25\\% \\& cut costs -- Q1\\_2024']]} />
        </Grid>
        <Grid cols={2}>
          <Lines title="Before" subtitle="“Kubernetes” is bold in the source" lines={[['same', 'Migrated 35 services to \\textbf{Kubernetes}']]} />
          <Lines title="After typing “42” and “K8s”" subtitle="bold is kept" lines={[['changed', 'Migrated 42 services to \\textbf{K8s}']]} />
        </Grid>
        <H2>How much text the box shows</H2>
        <UL>
          <li>
            Text inside a command such as <C>{'\\rcItem{…}'}</C> or <C>{'\\section{…}'}</C>: the whole of it, even when it wraps onto two lines in the
            PDF.
          </li>
          <li>
            A line of a table-like heading (company on the left, dates on the right): just the part you clicked, because they are separate pieces
            in the LaTeX.
          </li>
          <li>
            A list item or a paragraph: the text up to the next item, line break (<C>\\</C>) or blank line.
          </li>
        </UL>
        <H2>The LaTeX tab</H2>
        <P>
          The box has <b>Text</b> and <b>LaTeX</b> tabs. Switch to LaTeX to make a word bold, fix a link address, or change math. Save there with{' '}
          <Kbd>Ctrl/⌘ Enter</Kbd>. TexChef will not save LaTeX whose <C>{'{'}</C> and <C>{'}'}</C> don’t match. In the Text tab, link
          addresses are hidden and math is shown as written; a note in the box says so.
        </P>
        <H2>In a variant: change the original too</H2>
        <P>
          When you edit a variant and the same text appears in its original, the box offers <b>Also change it in “…”</b>. Tick it to fix a typo in
          both at once. The original gets a new version named “Text changed from ‘your variant’”. The variant will then show an update, which comes
          in cleanly because both already have the same text.
        </P>
        <H2>Undo</H2>
        <UL>
          <li>
            Each change shows a message with <b>Undo</b> for a few seconds.
          </li>
          <li>
            The change is also made in the code editor, so <Kbd>Ctrl/⌘ Z</Kbd> there undoes it like any other edit.
          </li>
          <li>
            Click an <b>edited</b> outline to open that change again.
          </li>
        </UL>
        <Note kind="info">
          Some text in the PDF is not typed in your document: section names written in capitals by the template, labels such as “Phone:”, page
          numbers, dates from <C>\today</C>. Clicking it explains that and offers <b>Show in source</b>, which opens the line that produces it.
        </Note>
      </>
    ),
  },
  {
    id: 'visual-editor',
    title: 'Visual editor and formatting',
    summary: 'See the LaTeX formatted while you edit, and format text with buttons instead of commands.',
    body: () => (
      <>
        <P>
          The <b>Aa</b> button at the right of the bar above the editor opens the formatting bar (it stays out of the way until you want it).
          There, <b>Code</b> shows the LaTeX as typed and <b>Visual</b> shows it formatted: headings look like headings,{' '}
          <C>\textbf{'{'}…{'}'}</C> shows bold text, <C>\item</C> a bullet, <C>\&amp;</C> an ampersand, and links are underlined. The settings
          before <C>\begin{'{'}document{'}'}</C> (the preamble) fold into a bar; <b>Show</b> opens it.
        </P>
        <UL>
          <li>
            <b>It is the same file.</b> Visual only changes how the text looks on screen, never the text itself, so you can switch back and
            forth at any time and nothing changes. Compiling, versions, variants and editing on the PDF work the same in both.
          </li>
          <li>
            <b>Whatever the cursor is in shows its LaTeX</b>, so you can still edit it: click a heading and you see{' '}
            <C>\section{'{'}Experience{'}'}</C>; move away and it is a heading again.
          </li>
          <li>
            Commands the visual editor doesn't know (a template's own, like <C>\resumeSubheading</C>) show as a small grey label with their
            parts separated by dots, so the text in them stays readable and editable.
          </li>
          <li>
            TexChef blocks show as small green labels (<b>block exp-acme #backend</b>), so you can still see what variants pick from.
          </li>
        </UL>
        <Figure src="visual-mode" alt="Visual mode on an essay: the formatting bar on top, section headings shown large, bold and italic words, a bullet list and a link." />
        <H2>The formatting bar</H2>
        <Table
          head={['Button', 'What it does']}
          rows={[
            ['Normal text / Section / Subsection', 'Turns the line the cursor is on into a heading, or back into normal text.'],
            ['B  I  U', 'Bold, italic, underline for the selected text (Ctrl/⌘ B, I, U). Click again inside to remove it.'],
            ['Aa', 'Text size of the selection, from tiny to huge. “Normal” removes it.'],
            ['Color', 'Colors the selection (adds the xcolor package if the document doesn’t load one).'],
            ['Lists', 'Turns the selected lines into a bulleted or numbered list, or starts an empty one.'],
            ['Link', 'Makes the selection a link to a web address or an email address (adds hyperref if needed).'],
            ['+', 'Line break, page break, space, a horizontal line, special characters (& % $ # _ – — •), and comment out lines.'],
            ['Font', 'The font of the whole document and its base size (10, 11 or 12 pt).'],
          ]}
        />
        <H2>Fonts</H2>
        <P>
          The <b>Font</b> menu sets the font of the whole document: Charter, Times, Palatino, Century Schoolbook, Bookman, Utopia, Linux
          Libertine, Helvetica or Avant Garde, all included with the in-browser TeX Live. TexChef adds a small, marked block just before{' '}
          <C>\begin{'{'}document{'}'}</C> (between <C>% TexChef font</C> and <C>% end TexChef font</C>) and replaces it when you pick another;{' '}
          <b>Template default</b> takes it out again. It comes last, so it wins over a font the template sets.
        </P>
        <Figure src="font-menu" alt="The Font menu: Template default, Charter, Times, Palatino and more, and the base size." />
        <P>
          The menu works with pdfLaTeX documents. XeLaTeX and LuaLaTeX documents set fonts with <C>\setmainfont</C>; upload a{' '}
          <C>.ttf</C> or <C>.otf</C> file to use your own, e.g. <C>\setmainfont{'{'}MyFont.ttf{'}'}[Path=./]</C>.
        </P>
      </>
    ),
  },
  {
    id: 'blocks',
    title: 'Blocks and tags',
    summary: 'How a document is split into pieces that variants can pick from.',
    body: () => (
      <>
        <P>
          A <b>block</b> is a piece of your document between two special comment lines. Because they start with <C>%</C>, LaTeX ignores them: they
          never appear in the PDF.
        </P>
        <Code title="main.tex">{`
%% @block exp-northwind
\\rcEntry{Northwind Analytics}{2022 -- Present}{Senior Engineer}{Seattle}
\\rcItemListStart
  %% @block northwind-ingest tags=backend,data
  \\rcItem{Designed a streaming ingestion service handling 40k events/s.}
  %% @end
  %% @block northwind-ui tags=frontend
  \\rcItem{Rebuilt the customer dashboard in React, 60% faster.}
  %% @end
\\rcItemListEnd
%% @end`}</Code>
        <UL>
          <li>
            <C>%% @block id</C> starts a block and <C>%% @end</C> ends it. The <b>id</b> (here <C>exp-northwind</C>) must be unique in the document.
            TexChef uses it to recognise the same block in the master and in its variants, so avoid renaming ids once you have variants.
          </li>
          <li>Blocks can be nested: the job above contains two bullet blocks.</li>
          <li>
            <C>tags=backend,data</C> is optional. Tags describe what a block is about and let you build a variant by picking tags instead of ticking
            boxes one by one.
          </li>
          <li>
            You can add <C>title="…"</C> to choose the name shown in the Blocks panel; otherwise TexChef uses the first line of the block.
          </li>
          <li>Everything outside blocks (the preamble, your name and contact line) is always kept in every variant.</li>
        </UL>
        <Figure src="blocks-panel" alt="The Blocks panel: the resume’s sections, jobs and bullets, with their tags." caption="The Blocks panel lists them, with their tags. Click one to jump to it." />
        <H2>Adding blocks</H2>
        <UL>
          <li>
            <b>Auto-mark</b> (Blocks panel) wraps sections, entries and bullets of an existing resume in blocks for you. It understands common
            templates (Jake’s Resume, moderncv, awesome-cv, plain <C>\section</C> + <C>\item</C>). Press <Kbd>Ctrl/⌘ Z</Kbd> to undo it.
          </li>
          <li>
            The <b>+</b> button inserts an empty block at the cursor. Typing <C>%% @</C> in the editor also suggests a block snippet.
          </li>
          <li>The tag icon next to a block (hover it) edits its tags.</li>
        </UL>
        <Note kind="tip">
          Good tags describe the kind of job a line is useful for: <C>backend</C>, <C>frontend</C>, <C>ml</C>, <C>lead</C>, <C>academic</C>. Leave
          things that belong in every version untagged.
        </Note>
        <Note kind="warn">
          If the Blocks panel shows a red message such as “@end without a matching @block”, a marker is missing or duplicated. Click the message to
          jump to the line.
        </Note>
      </>
    ),
  },
  {
    id: 'variants',
    title: 'Variants',
    summary: 'Make shorter or role-focused versions of a document that stay linked to it.',
    body: () => (
      <>
        <P>
          A variant is a new document made from another document (its <b>original</b>) by keeping some of its blocks. After you create it, it is a
          normal document: you can reword anything in it. It remembers which blocks and tags you picked, so later changes in the original can be
          brought in, filtered the same way.
        </P>
        <H2>Creating a variant</H2>
        <Steps
          items={[
            <>
              Open the master and click <b>New variant</b> (or right-click a document on the map). To start from an older state, use{' '}
              <b>New variant from here</b> on a version in the History panel or the Versions map.
            </>,
            <>
              Either click <b>tags</b> under “Focus by tag”, or tick and untick <b>blocks</b> in the list. You can combine both: tags choose the
              starting point, ticks override single blocks.
            </>,
            <>
              Watch the <b>live preview</b> on the right and the page count badge (“Fits on 1 page”).
            </>,
            <>
              Give it a name and click <b>Create variant</b>.
            </>,
          ]}
        />
        <Figure src="variant-builder" alt="The variant builder: blocks with checkboxes on the left, tags to pick, and the live preview with its page count." />
        <H2>How the choice works</H2>
        <Table
          head={['You picked…', 'A block is kept when…']}
          rows={[
            [
              'No tags (just ticks)',
              <>
                its box is ticked. <b>All</b> ticks everything; <b>None</b> unticks everything.
              </>,
            ],
            [
              'One or more tags',
              <>
                it has <b>no tags</b> (structure such as section headings), or it has <b>at least one</b> of the picked tags, unless you unticked it.
                You can also tick a block that does not match.
              </>,
            ],
            ['Any', 'the block around it is kept too. Unticking a job removes all of its bullets.'],
          ]}
        />
        <P>
          Example: picking <C>#frontend</C> on the template keeps the Summary, the Experience heading, each job heading (untagged), and only the
          bullets tagged <C>frontend</C>. The intern job is tagged <C>early-career</C>, so it is left out with its bullets.
        </P>
        <Note kind="info">
          Lists left empty by filtering (for example a job whose bullets were all removed) are removed automatically, because LaTeX cannot compile an
          empty list. A ⚠ appears next to a block whose contents were all left out.
        </Note>
        <H2>Variants of variants</H2>
        <P>
          A variant can have its own variants: for example <i>Master → Backend → Backend (Staff, 1 page)</i>. Each one gets updates from the document
          it was made from. The map on the home page shows the whole tree.
        </P>
        <H3>Duplicate vs. variant</H3>
        <P>
          <b>Duplicate</b> (document menu) makes a full copy that is still linked to the original but keeps <i>everything</i>: when you get updates,
          all of the original’s changes come in, with nothing filtered out.
        </P>
        <H2>Linking documents that already exist</H2>
        <P>
          Two documents don’t have to start as original and variant. From a document’s <b>⋯</b> menu (or a right-click on its card):
        </P>
        <UL>
          <li>
            <b>Link as variant of…</b> picks the document it should take updates from. On the map you can also drag a line from the small dot on
            one card’s edge to another card: the second becomes a variant of the first.
          </li>
          <li>
            <b>Unlink from original</b> makes a variant a document of its own again.
          </li>
          <li>
            <b>Make this the original</b> swaps a variant with its original: the variant becomes the one the other takes updates from.
          </li>
        </UL>
        <P>
          None of these change the text of either document; they only change who gets updates from whom, and each shows an <b>Undo</b> button
          right after. A document has one original, and TexChef refuses a link that would go round in a circle (a document can’t become a variant
          of one of its own variants).
        </P>
        <Note kind="info">
          Which changes count as updates after linking? If one document was made from the other, only what changed since they last agreed. If
          they have nothing in common, changes made to the original from that moment on.
        </Note>
      </>
    ),
  },
  {
    id: 'updates',
    title: 'Getting updates from the original',
    summary: 'Bring the original’s changes into a variant without losing your own edits.',
    body: () => (
      <>
        <P>
          When the original of a variant changes, the variant shows <b>Get N updates</b> in its header and an <b>updates</b> label on the map.
          Getting updates brings those changes in. TexChef <b>combines</b> two sets of changes: the ones made in the original and the ones you made in
          the variant. (Developers call this a <i>merge</i>.)
        </P>
        <Figure src="get-updates" alt="A variant’s header: variant of Master resume, and a Get 1 update button." />
        <H2>The three versions TexChef compares</H2>
        <P>To combine them, TexChef looks at three versions of the text, line by line:</P>
        <OL>
          <li>
            <b>Starting point</b>: the original as it was the last time this variant caught up with it (when you created it, or the last time you got
            updates), filtered to the blocks you picked.
          </li>
          <li>
            <b>Original now</b>: the original as it is today, filtered the same way.
          </li>
          <li>
            <b>Your variant now</b>, including any rewording you did in it.
          </li>
        </OL>
        <P>
          Comparing <i>starting point → original now</i> tells TexChef what the original changed. Comparing <i>starting point → your variant</i>{' '}
          tells it what you changed. It then applies both.
        </P>
        <H2>Example 1: no conflict</H2>
        <P>You changed your phone number in the master, and separately reworded a bullet in the Frontend variant.</P>
        <Legend />
        <Grid cols={3}>
          <Lines
            title="Starting point"
            subtitle="master when the variant last caught up"
            lines={[
              ['same', 'Jordan Rivera · (555) 010-2030'],
              ['same', 'Rebuilt the dashboard, 60% faster'],
              ['same', 'Built a component library'],
              ['same', 'University of Washington, 2019'],
            ]}
          />
          <Lines
            title="Master now"
            subtitle="what the original changed"
            lines={[
              ['changed', 'Jordan Rivera · (555) 999-0000'],
              ['same', 'Rebuilt the dashboard, 60% faster'],
              ['same', 'Built a component library'],
              ['same', 'University of Washington, 2019'],
            ]}
          />
          <Lines
            title="Your variant now"
            subtitle="what you changed"
            lines={[
              ['same', 'Jordan Rivera · (555) 010-2030'],
              ['same', 'Rebuilt the dashboard, 60% faster'],
              ['changed', 'Built a shared React component library'],
              ['same', 'University of Washington, 2019'],
            ]}
          />
        </Grid>
        <P>The two changes touch different lines, so both are kept automatically:</P>
        <Lines
          title="After getting updates"
          className="md:max-w-md"
          lines={[
            ['changed', 'Jordan Rivera · (555) 999-0000   ← from master'],
            ['same', 'Rebuilt the dashboard, 60% faster'],
            ['changed', 'Built a shared React component library   ← yours'],
            ['same', 'University of Washington, 2019'],
          ]}
        />
        <H2>The rules, line by line</H2>
        <Table
          head={['What happened to a line', 'Result']}
          rows={[
            ['Changed only in the original', 'The original’s new text is used.'],
            ['Changed only in your variant', 'Your text is kept.'],
            ['Changed the same way in both', 'Kept once (no conflict).'],
            ['Changed differently in both', <b>Conflict: you choose.</b>],
            ['Added in the original inside a block you kept', 'Added to the variant.'],
            ['Changed in the original inside a block your variant leaves out', 'Ignored: the variant doesn’t include that block.'],
          ]}
        />
        <H2>Example 2: a conflict</H2>
        <P>
          This time the master changed “60% faster” to “70% faster”, and you had reworded the same line in the variant. TexChef cannot know which
          one you want, so it shows both, between conflict markers:
        </P>
        <Lines
          title="After getting updates (needs a decision)"
          className="md:max-w-xl"
          lines={[
            ['same', 'Jordan Rivera · (555) 999-0000'],
            ['conflict', '<<<<<<< Frontend resume'],
            ['conflict', 'Rebuilt the dashboard, much faster for 2M users'],
            ['conflict', '======='],
            ['conflict', 'Rebuilt the dashboard, 70% faster'],
            ['conflict', '>>>>>>> Master resume'],
            ['same', 'Built a shared React component library'],
          ]}
        />
        <P>On the updates page each conflict has three buttons:</P>
        <UL>
          <li>
            <b>Keep mine</b>: keep the variant’s line (“much faster for 2M users”).
          </li>
          <li>
            <b>Use original’s</b>: take the master’s line (“70% faster”).
          </li>
          <li>
            <b>Keep both</b>: keep both lines, then edit them in the right-hand pane.
          </li>
        </UL>
        <P>
          You can also edit the right-hand side (“After updating”) directly, for example to write “Rebuilt the dashboard, 70% faster for 2M users”.
          <b> Apply updates</b> becomes available when no conflicts are left.
        </P>
        <H2>New blocks in the original</H2>
        <P>
          If the original gained blocks since the variant last caught up (say, a new job or bullet), the updates page lists them under{' '}
          <b>New in …</b> with a checkbox. If your variant was made with tags, blocks matching your tags are ticked for you. If it was made by ticking
          blocks, new blocks are unticked, so a focused variant does not grow by surprise.
        </P>
        <Figure src="pull-page" alt="The Get updates page: what changed in the original, the result, and No conflicts." caption="Before anything changes, you see what comes in and the result." />
        <H2>What happens when you apply them</H2>
        <UL>
          <li>Unsaved edits in the variant are saved first, so nothing is lost.</li>
          <li>
            The result is saved as a new version. In the Versions map it has two arrows: one from the variant’s previous version and one (dashed)
            from the original’s version the updates came from.
          </li>
          <li>The variant is now “up to date”, and the original’s current version becomes the new starting point for next time.</li>
        </UL>
        <Note kind="tip">
          Not sure? Use <b>Compare</b> first to see the original and the variant side by side, or apply the updates and look at the result: every
          update is a version in History, so you can always restore the variant as it was before. Restoring a version from before an update
          also puts that update back on offer, so you can take it again later.
        </Note>
        <H3>Combining edits from two devices</H3>
        <P>
          The same three-way comparison is used when one document was edited on two devices before they synced. See{' '}
          <HelpLink to="sync">Google Drive and devices</HelpLink>.
        </P>
      </>
    ),
  },
  {
    id: 'copy-to-original',
    title: 'Copying changes back to the original',
    summary: 'Send an improvement made in a variant back to the master.',
    body: () => (
      <>
        <P>
          Sometimes you improve a bullet while tailoring a variant and want the master to have it too. There are two ways to send it back.
        </P>
        <H2>A whole block</H2>
        <P>
          In the variant’s <b>Blocks</b> panel, blocks that differ from the original are marked <b>edited</b> (or <b>new</b> if the original does
          not have them). Hover one and click the <b>Copy to original</b> arrow.
        </P>
        <Figure src="copy-to-original" alt="The variant’s Blocks panel: edited blocks, and the Copy this block into Master resume button with its tooltip." />
        <Steps
          items={[
            <>TexChef finds the block with the same id in the original and replaces it with your version (or adds it next to its neighbours).</>,
            <>
              The original gets a new version named “Copied ‘…’ from ‘your variant’”, so it is easy to find and undo in History.
            </>,
            <>
              The next update into the variant has no conflict: both sides now have the same text, which counts as “changed the same way in both”.
            </>,
          ]}
        />
        <Note kind="warn">
          If the original also changed that block since the variant last caught up, TexChef asks before replacing it, so you do not overwrite an
          earlier edit by accident.
        </Note>
        <H2>A piece of text, from the PDF</H2>
        <P>
          When you <HelpLink to="edit-on-pdf">edit on the PDF</HelpLink> in a variant, tick <b>Also change it in “…”</b> to make the same change in
          the original. This changes only that text, not the whole block.
        </P>
        <H2>Everything at once</H2>
        <P>
          <b>Send changes to original</b> (a variant’s <b>⋯</b> menu, or the <b>⌄</b> menu in the editor) is <HelpLink to="updates">Get updates</HelpLink>{' '}
          the other way round. It shows the original as it is and as it would become, with the same conflict choices where both documents changed
          the same lines. Nothing changes until you press <b>Send changes</b>; the result is saved in the original as a new version, so restoring
          the version before it takes it back.
        </P>
        <Note kind="info">
          This is for variants that keep everything (duplicates, and documents you linked yourself). A variant made by picking tags or blocks holds
          only part of the original, so sending it back whole would remove the rest: copy single blocks instead.
        </Note>
        <P>
          You can copy blocks between <i>any</i> two documents from the <HelpLink to="compare">Compare</HelpLink> view.
        </P>
      </>
    ),
  },
  {
    id: 'compare',
    title: 'Compare and edit side by side',
    summary: 'Look at two documents or versions together and move text between them.',
    body: () => (
      <>
        <P>
          Open it from a document menu (<b>Compare with original</b>), the editor’s <b>⌄</b> menu, or the compare button on any version. Above each
          side you choose its document, and for each one either <b>Current</b> or any saved version.
        </P>
        <P>
          Each side's document menu lists a few from the same folder (and the original and variants, if they're elsewhere).{' '}
          <b>Other files…</b> opens a browser with every folder, a search box, page thumbnails and each document's saved versions.
        </P>
        <Figure src="compare" alt="Compare: the master on the left and its variant on the right, with changed lines highlighted and arrows to copy blocks across." />
        <UL>
          <li>
            Changed lines are highlighted. <b>Only changes</b> hides the unchanged parts.
          </li>
          <li>
            A side showing a current document can be edited (a pencil next to it). Click the pencil to make that side view only (an eye), when
            you only want to look at one document while writing the other; a saved version shows a lock. Edits are kept in the document as you
            type. <b>Save</b> saves a version of each side that changed; its <b>⌄</b> menu saves only one side, or keeps one side's edits as a{' '}
            <b>new variant</b> and puts the original back as it was.
          </li>
          <li>
            The arrows between the two sides copy one change across. The <b>Copy →</b> button above them, between the two names, flips their
            direction.
          </li>
          <li>
            The <b>Blocks</b> panel lists blocks that differ. Use ← or → to copy a whole section, job or bullet to the other side; a missing block is
            inserted next to its neighbours.
          </li>
          <li>
            <b>Text + PDF</b> shows both PDFs under the text, each compiled on its own, so you can compare layout and page count.
          </li>
        </UL>
        <Note kind="tip">
          To see what changed in one document over time, pick the same document on both sides with an older version on the left.
        </Note>
      </>
    ),
  },
  {
    id: 'saving',
    title: 'Saving, autosave and leaving',
    summary: 'What is saved when, and when TexChef warns you before leaving.',
    body: () => (
      <>
        <P>You never have to press save to keep your work: TexChef stores it as you go. There are three layers:</P>
        <Table
          head={['', 'When', 'Where']}
          rows={[
            [
              <b>Draft</b>,
              'Every edit, a fraction of a second after you type (also edits made on the PDF, in Compare and by Get updates).',
              'This browser. It survives reloads, closing the tab and restarting the computer.',
            ],
            [
              <b>Autosave version</b>,
              'After a minute without typing, and when you switch away from or close the tab.',
              'History (hidden unless you tick “autosaves”), and Google Drive if connected.',
            ],
            [<b>Saved version</b>, <>When you click <b>Save version</b> or press <Kbd>Ctrl/⌘ S</Kbd>.</>, 'History, and Google Drive if connected.'],
          ]}
        />
        <P>
          In the editor, the badge next to the name says <b>Draft saved</b> while your latest edits are only a draft, and <b>Saved</b> once they
          are part of a version.
        </P>
        <Grid cols={2}>
          <Figure className="my-0" src="draft-saved" alt="The editor header: Master resume, with the Draft saved badge." caption="Edits kept as a draft" />
          <Figure className="my-0" src="save-version" alt="New variant, Save version and Compile buttons." caption="Save version makes a version" />
        </Grid>
        <H2>Google Drive</H2>
        <P>
          Versions (saved and autosave) upload to Drive when you save, when you come back to the tab, and every minute. Drafts do not: they upload
          once they become a version, which happens by itself after a minute without typing.
        </P>
        <H2>When TexChef asks before you leave</H2>
        <UL>
          <li>
            <b>Closing the tab or reloading</b> while your last keystrokes are still being stored (a fraction of a second), while the edit box on
            the PDF holds text you haven’t saved, or, with Drive connected, while something hasn’t reached Drive yet. The browser shows its own
            “Leave site?” message; if you stay, TexChef saves and uploads right away.
          </li>
          <li>
            <b>Going to another page in TexChef</b> while the edit box on the PDF holds unsaved text, or while you have made choices on the
            Get updates page without applying them. You can stay, or leave without saving.
          </li>
        </UL>
        <Note kind="info">
          Without Drive, closing the tab never loses work: drafts stay in this browser. The one exception is clearing the browser’s site data;
          export a backup (Export → Backup TexChef) if you want a copy elsewhere.
        </Note>
      </>
    ),
  },
  {
    id: 'history',
    title: 'Versions and history',
    summary: 'Save, restore, start a variant from, and download any version.',
    body: () => (
      <>
        <P>
          Every document keeps its full history. Open the <b>History</b> tab in the editor’s left panel.
        </P>
        <Figure src="history" alt="The History tab: versions numbered v1, v2…, each with its date and how many lines changed." />
        <Table
          head={['Kind', 'When it is made']}
          rows={[
            [<b>Saved version</b>, <>When you click <b>Save version</b> or press <Kbd>Ctrl/⌘ S</Kbd> (optionally with a message).</>],
            [<b>Autosave</b>, 'After a minute without typing, and when you leave the page. Hidden by default; tick “autosaves” to see them.'],
            [<b>Variant created</b>, 'The first version of a variant.'],
            [<b>Updates</b>, 'When you get updates from the original, or combine edits from two devices.'],
            [<b>From a variant</b>, 'When a block or a piece of text was copied in from one of this document’s variants.'],
            [<b>Restore</b>, 'When you restore an older version.'],
          ]}
        />
        <P>
          Versions are numbered: <b>v1</b>, <b>v2</b>… for saved versions, and autosaves after v3 as <b>v3.1</b>, <b>v3.2</b>. Next to each,{' '}
          <span className="text-ok">+12</span> <span className="text-danger">−3</span> is how many lines it added and removed compared with the
          version before.
        </P>
        <P>Hover a version to:</P>
        <UL>
          <li>
            <b>Compare</b> it with the current text.
          </li>
          <li>
            <b>Restore</b> it. This does not delete anything: the old content becomes a new version on top, and the versions in between stay in
            history.
          </li>
          <li>
            <b>New variant from here</b>: make a variant from that version.
          </li>
          <li>
            <b>Download</b> it as a .zip.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: 'map',
    title: 'The map',
    summary: 'See how documents relate and how they changed over time.',
    body: () => (
      <>
        <P>
          The home page shows your documents as a <b>Map</b> or a <b>List</b>. The map has two kinds: <b>Documents</b> (the default) and{' '}
          <b>Versions</b>: hover the <b>Documents</b> button next to Map / List (or tap it) to switch between them.
        </P>
        <Figure src="home-map" alt="The home page map: Master resume linked to its Frontend resume variant, with folders on the left." />
        <H2>Documents</H2>
        <UL>
          <li>Each card is a document, with a thumbnail of its first page and its page count.</li>
          <li>Lines go from an original to its variants. A variant’s card shows the tags it was made with.</li>
          <li>
            A dashed line with an <b>N updates</b> label next to the arrow means the original has changes that variant hasn’t brought in yet.
            Click the label to get them.
          </li>
          <li>
            Lines are straight. Settings → Appearance → <b>Lines on the map</b> switches to right-angled lines.
          </li>
          <li>
            <b>edited elsewhere</b> means another device changed it too (see <HelpLink to="sync">sync</HelpLink>).
          </li>
          <li>
            Click a card to open it; right-click it (or use ⋯) for every action: new variant, compare, get updates, duplicate, rename, color,
            archive, delete. Delete asks first, and suggests archiving if you only want it out of the way.
          </li>
          <li>
            A <b>crown</b> next to a name marks the top of a tree: a document variants were made from that wasn’t made from another one itself
            (usually your master).
          </li>
        </UL>
        <H3>Map options</H3>
        <P>The small bar at the top right of the map has the layout direction and a ☰ menu:</P>
        <Table
          head={['Option', 'What it does']}
          rows={[
            [<b>→ / ↓</b>, 'Left to right (originals on the left), or top down (master at the top, variants branching down).'],
            [<b>Full-page previews</b>, 'Cards show the whole first page instead of its top.'],
            [
              <b>Snap to grid</b>,
              'Shows a grid of card-sized cells. Cards you drag land in the middle of a cell, and the automatic layout uses the grid too, with a free cell between generations so lines and labels have room.',
            ],
            [<b>Right-angled lines</b>, 'Lines with corners instead of straight ones (also in Settings → Appearance).'],
            [<b>Fit to screen</b>, 'Zooms so every card is in view.'],
            [<b>Reset card positions…</b>, 'Once you have dragged cards: puts them back in the automatic layout (it asks first).'],
          ]}
        />
        <P>
          You can drag any card to where you want it; the map remembers it in this browser (separately for each direction) until you reset.
        </P>
        <H2>Versions</H2>
        <UL>
          <li>Each row (lane) is a document; each dot is a version, oldest on the left. The icon in the dot shows its kind.</li>
          <li>
            A dashed arrow between lanes shows where a variant was made from its original, or where updates from the original were brought in.
          </li>
          <li>Click a dot for details and actions: open, compare, new variant from here, restore.</li>
        </UL>
        <Figure src="map-versions" alt="The Versions map: one lane per document, dots for versions, dashed lines where the variant was made and got updates. A clicked version shows its details." />
        <H2>Folders</H2>
        <P>
          Documents can live in folders, and folders in folders. The home page works like a file browser: the bar above the map or list shows
          where you are (<b>All documents › Jobs › 2026</b>; click a part, or ↑, to go back up), and the <b>Folders</b> panel on the left shows
          the whole tree (the ▤ button hides it).
        </P>
        <Table
          head={['View', 'What you see']}
          rows={[
            [
              <b>Folders</b>,
              'The default. The open folder’s subfolders appear as folder cards (map) or folder rows (list), next to the documents directly in it. At the top level you see only your folders and the documents in no folder. Click a folder to open it.',
            ],
            [
              <b>Expanded</b>,
              'Every document inside the open folder, including those in subfolders, grouped by folder: framed groups on the map, sections in the list. Searching always looks through everything inside the open folder.',
            ],
          ]}
        />
        <UL>
          <li>
            On the map, a dotted line from a document to a folder card means some of its variants are in that folder (or its original is).
          </li>
          <li>
            <b>New folder</b>: the folder-plus button, or right-click empty space. With a folder open, the new one goes inside it.
          </li>
          <li>
            <b>Put documents in</b>: drag a document onto a folder (a folder card on the map, a folder row in the list, a folder in the panel, or
            a part of the path bar), or use ⋯ / right-click → <b>Move to folder…</b>. New documents and uploads go into the folder that is open,
            and a variant starts in its original’s folder.
          </li>
          <li>
            <b>Move a folder</b> into another one: drag it onto the other folder (in the panel, the list, the path bar, or folder card onto
            folder card on the map), or right-click → <b>Move to…</b>.
          </li>
          <li>
            <b>Rename or delete</b>: hover a folder and use its ⋯ menu. Deleting a folder never deletes documents: they move to the folder
            around it.
          </li>
          <li>
            Folders sync with Google Drive along with the documents in them. A brand-new empty folder stays on this device until you put a
            document in it.
          </li>
          <li>
            Importing a .zip with several documents (a Prism export, say) offers to put them all in a new folder.
          </li>
        </UL>
        <H2>Right-click menus</H2>
        <UL>
          <li>
            <b>Empty space</b> on the map or in the list: new document or folder, upload files or a folder, make previews, export, view options
            (map, versions map or list, expanded or folders, archived documents, the folders panel), map layout, and actions for the open folder.
          </li>
          <li>
            <b>A folder</b>: open, new folder inside, rename, move, make previews, export, delete.
          </li>
          <li>
            <b>A document</b>: everything in its ⋯ menu.
          </li>
        </UL>
        <H2>Previews</H2>
        <P>
          Cards show the first page of each document’s last PDF. Documents you just imported have none until they are compiled: right-click
          empty space (or a folder) → <b>Previews → Make missing previews…</b> compiles every document there (subfolders included) that has no preview or
          an out-of-date one, one after another, after asking. Progress shows next to the folder path; click it to stop.{' '}
          <b>Recompile all previews…</b> compiles all of them.
        </P>
        <H2>Colors and archiving</H2>
        <P>
          Give a document a color with <b>Color…</b> in its menu (or click the colored dot next to its name in the editor). The color is used for the
          card border, the list, the lines on the map and its lane in the Versions view. Old variants you no longer need can be <b>archived</b>:
          they disappear from the map and list until you click <b>Show archived</b>.
        </P>
      </>
    ),
  },
  {
    id: 'files',
    title: 'Files, upload and download',
    summary: 'Multi-file projects, images, fonts, Overleaf imports and exports.',
    body: () => (
      <>
        <H2>Bringing work in</H2>
        <Figure src="import-menu" alt="The Import menu: Upload files or a .zip, Upload a folder, and From Google Drive." />
        <UL>
          <li>
            <b>Import</b> on the home page (<b>Upload files or a .zip</b>, <b>Upload a folder</b>, or <b>From Google Drive</b>; or drop files onto the page) makes a new document. An <b>Overleaf</b> project downloaded as .zip
            works as is; the file with <C>\documentclass</C> becomes the main file.
          </li>
          <li>
            A .zip holding <b>several documents</b>, such as an export of all your <b>Prism</b> projects, is recognised: each folder with its own
            main .tex file becomes a separate document, with its images and other files. A list lets you untick or rename them before importing.
          </li>
          <li>
            <b>Import → From Google Drive</b> opens Google’s file picker (connecting Drive first if needed). TexChef can only read files you pick there. If
            Google’s window is stuck on “Sign in” or shows an error, the browser is blocking the cookies it needs (Brave’s Shields do this): allow
            cookies for this site, or download the file from Drive and use <b>Import → Upload</b>.
          </li>
          <li>
            Inside a document, the <b>Files</b> tab has <b>upload</b> (images, <C>.cls</C>, <C>.sty</C>, <C>.bib</C>, fonts, or a .zip) and{' '}
            <b>new file</b>. Use paths like <C>sections/experience.tex</C> for folders.
          </li>
          <li>
            A document with several files shows them as <b>tabs</b> above the editor; <b>+</b> opens another file, × closes a tab (the file stays).
          </li>
        </UL>
        <Figure src="files" alt="A document with three files: the Files tab on the left, and tabs for main.tex, intro.tex and method.tex above the editor." />
        <H2>The main file</H2>
        <P>
          The file with the ★ is compiled. Use a file’s ⋯ menu to rename it, move it into a folder, delete it, or make another <C>.tex</C> file the
          main file. Other files are included from it as usual:
        </P>
        <Code>{`\\input{sections/experience}
\\includegraphics[width=2cm]{photo.jpg}
\\bibliography{refs}`}</Code>
        <H2>Getting work out</H2>
        <UL>
          <li>
            The <b>Compile</b> button’s menu has <b>Download PDF</b>; the editor’s ⌄ menu also has the current file and the whole project as <b>.zip</b> (sources + PDF).
          </li>
          <li>Any version in History can be downloaded as a .zip.</li>
          <li>With Drive connected, each document also has a readable folder in your Drive with its sources and latest PDF.</li>
        </UL>
        <H2>Export</H2>
        <P>
          <b>Export</b> on the home page (or right-click a folder or empty space) gives PDFs or LaTeX projects of the open folder and everything
          inside it (at the top level, everything); folders become folders in the export. <b>Backup TexChef</b> always covers everything.
        </P>
        <Table
          head={['Format', 'What you get']}
          rows={[
            ['PDFs (.zip)', 'One PDF per document. Documents without an up-to-date PDF are compiled first.'],
            ['LaTeX projects (.zip)', 'Each document’s files in its own folder, as they are now (unsaved drafts included).'],
            [
              'Backup TexChef',
              'The LaTeX projects, untouched, plus a .texchef folder with everything else: every saved version, drafts, folders, colors, tags, variant links and choices, previews and map positions. As a .zip; written straight into a folder on your computer (Chrome and Edge; Brave has it behind brave://flags → File System Access API); or saved to your Google Drive, in TexChef/Backups. Unzipping the .zip gives the same folder.',
            ],
          ]}
        />
        <H3>Restoring a backup</H3>
        <P>
          Import the backup .zip (<b>Import → Upload files</b>, or <b>From Google Drive</b> for one saved there), or <b>Import → Upload a folder…</b> and pick the backup folder, on any TexChef, even an empty one: TexChef recognises
          it and restores everything with the same documents, history and links. Documents already there keep what they have and get the
          backup’s versions added. If you edited the LaTeX files in the backup outside TexChef, those edits come in as changes.
        </P>
        <Note kind="tip">
          A backup folder is a normal set of LaTeX projects, so you can also open it in any other LaTeX editor. Leave the <C>.texchef</C> folder
          alone if you want to restore it later.
        </Note>
      </>
    ),
  },
  {
    id: 'compiling',
    title: 'Compiling, errors and packages',
    summary: 'Engines, the problems panel, packages and jumping between PDF and source.',
    body: () => (
      <>
        <P>
          TexChef runs a full TeX Live 2026 in your browser. Nothing is uploaded to compile. The first compile downloads the core engine (about 80
          MB, once); later visits reuse it.
        </P>
        <H2>Engines</H2>
        <P>
          The engine is the program that turns your LaTeX into a PDF. All three read the same LaTeX; they differ in fonts and characters. Pick
          one in the <b>Compile</b> button’s menu (hover it, or tap its arrow); pdfLaTeX is marked as the default, so you can always find your way
          back. If a template's instructions name one, use that.
        </P>
        <Figure src="compile-menu" alt="The Compile button’s menu: auto-compile, the three engines with pdfLaTeX as default, and Download PDF." />
        <UL>
          <li>
            <b>pdfLaTeX</b> (default): the oldest and fastest. Uses TeX's own fonts, picked with packages such as <C>\usepackage{'{'}charter{'}'}</C>. Most
            resume templates (Jake's Resume, most of Overleaf's gallery) are made for it.
          </li>
          <li>
            <b>XeLaTeX</b>: for <C>fontspec</C> and ordinary font files (<C>.ttf</C>, <C>.otf</C>) you upload into the project, and for
            text in any alphabet typed straight in (accents, Greek, Chinese…). Templates that use <C>\setmainfont</C>, such as Awesome-CV,
            need it (or LuaLaTeX).
          </li>
          <li>
            <b>LuaLaTeX</b>: like XeLaTeX (same font handling) with a built-in scripting language some newer packages use. Usually a bit slower
            to compile.
          </li>
        </UL>
        <P>
          The same menu turns automatic compiling on or off (⚡ on the button means it is on) and downloads the PDF; <b>Compile</b> (<Kbd>Ctrl/⌘ Enter</Kbd>) compiles now.
        </P>
        <P>
          <b>Wrong engine?</b> When a compile fails because the document was written for another engine (fontspec or emoji under pdfLaTeX,
          Lua code, or a pdfLaTeX-only line like <C>\pdfgentounicode=1</C> under XeLaTeX), the problem says so and offers{' '}
          <b>Switch to …</b>. Templates that need a particular engine usually say so in their first lines.
        </P>
        <P>
          What none of the three can do here: run other programs during a compile (“shell escape”: <C>minted</C>, <C>svg</C>,
          converting <C>.eps</C> images), and making an index (<C>\makeindex</C> / <C>\printindex</C>). Bibliographies work with both BibTeX
          (<C>\bibliography</C>) and biblatex with Biber. Other engines (ConTeXt, plain TeX, Japanese pTeX) aren't included.
        </P>
        <H2>Errors and warnings</H2>
        <P>
          The <b>Problems</b> panel under the PDF lists errors and warnings with their line; click one to jump there. Errors are also underlined in
          the editor. <b>Raw log</b> shows the full TeX log. If a compile fails, the last good PDF stays visible. Common ones come with a
          plain explanation underneath. Notes that don't change the PDF (loosely spaced lines, rerun notices, harmless messages) are tucked
          behind <b>N hidden</b> at the top of the panel; click it to see them.
        </P>
        <Figure src="problems" alt="The Problems panel: 1 error, Undefined control sequence: \diary, at sections/method.tex line 2." />
        <P>
          Warnings don't stop the PDF. Errors usually do. A few you can normally ignore:
        </P>
        <UL>
          <li>
            <b>Overfull box (… too wide)</b>: a line sticks out past the margin by that much. 1pt is about a third of a millimetre, so anything
            that small is invisible; the explanation under it says how far it sticks out. Bigger ones are worth a look in the PDF; dense resumes get a
            few.
          </li>
          <li>
            <b>\footskip is too small</b> or <b>\headheight is too small</b> (from <C>fancyhdr</C>): the page header or footer has less room
            than it needs. fancyhdr fixes it after page 1; add the <C>\setlength</C> line it suggests to silence it.
          </li>
          <li>
            <b>Shell escape … not enabled</b>: some packages run other programs while compiling (<C>epstopdf</C> for <C>.eps</C> images,{' '}
            <C>svg</C>, <C>minted</C>). A browser can't do that, so it is always off in TexChef. Harmless unless those images or that code
            are used; convert such images to <C>.pdf</C> or <C>.png</C>.
          </li>
        </UL>
        <H2>Packages</H2>
        <P>
          Common packages are in the core download. Bigger collections are downloaded once, only when a document needs them: “recommended” (about
          160 MB, e.g. <C>xcolor</C>, <C>tikz</C>, <C>fontspec</C>) and “extra” (about 260 MB, e.g. <C>titlesec</C>, <C>enumitem</C>,{' '}
          <C>moderncv</C>, the Charter font). A banner shows the download. A package that is not in TeX Live can be used by uploading its{' '}
          <C>.sty</C> file into the project.
        </P>
        <H2>Jump between PDF and source</H2>
        <UL>
          <li>
            <b>Double-click</b> anywhere in the PDF to jump to the line that produced it.
          </li>
          <li>
            The line under your cursor in the editor is highlighted in the PDF, and the PDF scrolls to it when it is out of view. The <b>◎</b>{' '}
            button above the PDF turns this off and on.
          </li>
          <li>
            The <b>▯</b> button fits a whole page in the preview; <b>⤢</b> goes back to fitting the width. Your choice is remembered.
          </li>
          <li>
            <b>Edit text</b> lets you change text by clicking it in the PDF. See <HelpLink to="edit-on-pdf">Editing on the PDF</HelpLink>.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: 'sync',
    title: 'Google Drive and devices',
    summary: 'Where your data lives, syncing, and what happens with edits on two devices.',
    body: () => (
      <>
        <H2>Where your documents live</H2>
        <P>
          Everything is saved in this browser first, so TexChef works offline and without an account. Browser storage can be cleared (private
          windows, “clear site data”, a full disk), so connect Drive if your documents matter. Settings → Local data shows whether the browser has
          agreed to keep TexChef’s data permanently.
        </P>
        <H2>Connecting Google Drive</H2>
        <UL>
          <li>
            Click <b>Local only · Connect Drive</b> at the top right and sign in. TexChef asks only for access to the files it creates and the
            files you pick, not your whole Drive.
          </li>
          <li>
            It syncs after you save, when you come back to the tab, and every minute. The indicator shows “Synced … ago”; its menu has <b>Sync now</b>{' '}
            and <b>Open TexChef folder in Drive</b>.
          </li>
          <li>
            Google sign-ins last about an hour. When it expires the indicator says <b>Reconnect Drive</b>; your work keeps saving locally meanwhile.
          </li>
        </UL>
        <Code title="In your Google Drive">{`
TexChef/
  Master resume/          ← main.tex, other files, and Master resume.pdf
  Master resume · Backend/
  .texchef/               ← history used for syncing; leave it alone`}</Code>
        <Figure src="settings-drive" alt="Settings → Storage: documents live in this browser first; Connect Google Drive." />
        <H2>Edits on two devices</H2>
        <P>
          If the same document was changed on two devices before they synced, nothing is overwritten. The document shows <b>edited elsewhere</b> and
          a banner with three choices:
        </P>
        <UL>
          <li>
            <b>Combine both</b>: keeps both sets of changes, the same way as <HelpLink to="updates">getting updates</HelpLink>. If the same lines
            were changed differently, both versions are left in the text between conflict markers (<C>{'<<<<<<<'}</C>, <C>=======</C>,{' '}
            <C>{'>>>>>>>'}</C>) for you to tidy up in the editor.
          </li>
          <li>
            <b>Compare</b>: look at both first.
          </li>
          <li>
            <b>Keep this one</b>: keep this device’s version; the other one stays available in history.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: 'agents',
    title: 'AI agents through Google Drive (experimental)',
    summary: 'Let an AI assistant you connect to Drive suggest edits, and review them before they change anything.',
    agentsOnly: true,
    body: () => (
      <>
        <Note>
          This is an <b>experimental, opt-in</b> feature (Settings → Experimental). TexChef never sends your documents to an AI. You connect an
          assistant to your own Google Drive, and it reads what TexChef already keeps there.
        </Note>
        <H2>How it works</H2>
        <OL>
          <li>
            With the switch on and Google Drive connected, TexChef adds a <b>TexChef/Agents(optional_AI)</b> folder with a file called{' '}
            <b>Read me first (for AI agents)</b>. It lists your documents and explains exactly how to reply.
          </li>
          <li>
            Connect your assistant to Google Drive (for example Claude with its Google Drive connector) and ask it something like:{' '}
            <i>“Open TexChef/Agents(optional_AI)/Read me first, then tailor my Master resume for this job: …”</i>
          </li>
          <li>
            The assistant reads the document’s readable copy (its LaTeX and PDF) and writes a <b>new file</b> in the Agents folder: the whole
            edited file, starting with a <C>% texchef-reply</C> line that names the document and the version it read.
          </li>
          <li>
            In TexChef, press <b>AI updates</b> (on the home page and in the editor; on phones it is in the <b>⋯</b> and <b>⌄</b> menus). It
            shows how many replies are waiting. Pick the reply in Google Drive, or paste it if the assistant gave it to you in the chat.
          </li>
          <li>
            Review it side by side: your document on the left, with the agent’s edits on the right. Edits you made after the agent read the file
            are kept. <b>Accept</b> saves a new version, <b>As a new variant</b> keeps your document as it is, <b>Dismiss</b> changes nothing.
            Handled replies move to <b>Done</b>.
          </li>
        </OL>
        <H2>What an assistant can propose</H2>
        <UL>
          <li>
            <b>Edit</b> a document: one file or several.
          </li>
          <li>
            <b>Create</b> a document, in a folder if it names one, and linked as a <b>variant</b> of one of yours if it asks for that.
          </li>
          <li>
            <b>Rename</b> a document, <b>move</b> it to a folder, or move it to the <b>archive</b>. These show under <b>Also proposed</b> in
            the review, each with a tick box.
          </li>
          <li>
            <b>Link</b> one of your documents as a variant of another, or <b>unlink</b> a variant. No text changes, and the same rules apply as when
            you do it yourself.
          </li>
          <li>It cannot delete anything, and nothing happens until you accept.</li>
        </UL>
        <P>
          Versions made this way are marked with a small robot in <b>History</b> and in the <b>Versions</b> view.
        </P>
        <H2>Why you pick replies</H2>
        <P>
          TexChef asks Google only for the narrow <C>drive.file</C> permission: it can see the files it made and the files you pick, nothing else
          in your Drive. A reply is a file the assistant made, so TexChef can read it once you pick it.
        </P>
        <H2>If Google’s file picker shows an error</H2>
        <P>
          “The API developer key is invalid” means the picker’s API key doesn’t allow this site. Whoever runs this copy of TexChef fixes it in the
          Google Cloud console: allow both the site’s address and <C>https://docs.google.com/*</C> under the key’s website restrictions, and allow
          the Google Picker API and Google Drive API. Until then, <b>Paste a reply</b> works without the picker.
        </P>
        <P>
          In Brave, and in Safari with cross-site tracking protection on, the picker first shows <b>Sign in</b>: click it and the picker opens
          in a small window of its own. That is Google’s way around blocked cookies. To have it open in the page instead, allow cookies for
          this site (in Brave: the lion icon in the address bar).
        </P>
        <H2>Turning it off</H2>
        <P>
          Switch it off in Settings → Experimental. TexChef stops updating the folder, hides the buttons, and offers to move the Agents folder to
          the Drive trash.
        </P>
      </>
    ),
  },
  {
    id: 'shortcuts',
    title: 'Shortcuts and tips',
    summary: 'Keyboard shortcuts, editor tricks, themes.',
    body: () => (
      <>
        <Table
          head={['Keys', 'Action']}
          rows={[
            [<Kbd>Ctrl/⌘ S</Kbd>, 'Save a version'],
            [<Kbd>Ctrl/⌘ Enter</Kbd>, 'Compile now'],
            [<Kbd>Ctrl/⌘ F</Kbd>, 'Find and replace in the editor'],
            [<Kbd>Ctrl/⌘ Z</Kbd>, 'Undo (also undoes Auto-mark and edits made on the PDF)'],
            [<Kbd>Tab</Kbd>, 'Indent; also accepts a suggestion'],
            [<Kbd>\</Kbd>, 'Start typing a command to get suggestions'],
            [<C>%% @</C>, 'Suggests a block snippet'],
            [<>Edit text, then click the PDF</>, 'Change that text in place'],
            [<Kbd>Enter</Kbd>, 'Save an edit made on the PDF (Ctrl/⌘ Enter in the LaTeX tab)'],
            [<Kbd>Esc</Kbd>, 'Close the edit box'],
            ['Double-click the PDF (also while editing on it)', 'Jump to the source line'],
            ['Right-click empty space on the home page', 'New document or folder, upload, previews, export, view options'],
            ['Drag a document onto a folder', 'Move it into that folder (map, list, folders panel or path bar)'],
          ]}
        />
        <H2>Tips</H2>
        <UL>
          <li>Keep one master with everything; make a variant per kind of role, and per application only when you need to tailor further.</li>
          <li>Fix shared things (contact details, dates, typos) in the master, then get updates in the variants.</li>
          <li>Use the page-count badge in the variant builder to land on exactly one page.</li>
          <li>Archive variants for applications you are done with instead of deleting them.</li>
          <li>Use folders to keep groups apart, such as resumes, cover letters and papers.</li>
          <li>The palette button at the top right switches between light and dark and six color themes.</li>
        </UL>
      </>
    ),
  },
  {
    id: 'whats-new',
    title: 'What’s new',
    summary: 'Patch notes: what changed in each version of TexChef.',
    body: () => <Changelog />,
  },
];
