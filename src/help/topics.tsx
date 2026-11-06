import type { ReactNode } from 'react';
import { C, Code, Grid, H2, H3, HelpLink, Kbd, Legend, Lines, Note, OL, P, Steps, Table, UL } from './kit';

export interface Topic {
  id: string;
  title: string;
  summary: string;
  body: () => ReactNode;
}

export const TOPICS: Topic[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    summary: 'What texChef is and a five-minute tour.',
    body: () => (
      <>
        <P>
          texChef is a LaTeX editor that runs entirely in your browser. It is built around one idea: write <b>one long master resume</b> with
          everything you have ever done, then make <b>variants</b> of it (shorter, or focused on a kind of role) that stay linked to the master. When
          you fix a typo or add a job in the master, each variant can pull that change in, without losing the edits you made in the variant.
        </P>
        <P>It is also a normal LaTeX editor: you can write letters, papers or anything else, with several files, images and bibliographies.</P>
        <H2>A five-minute tour</H2>
        <Steps
          items={[
            <>
              On the home page, click <b>New document</b> and pick <b>Master resume</b>. It opens in the editor and compiles to a PDF on the right.
            </>,
            <>
              Edit the text in the middle. The PDF updates after you pause typing. Click <b>Save version</b> (<Kbd>Ctrl/⌘ S</Kbd>) whenever you reach
              a point you may want to come back to.
            </>,
            <>
              Look at the <b>Blocks</b> panel on the left. The template is split into blocks (sections, jobs, bullets), and some have tags such as{' '}
              <C>backend</C> or <C>ml</C>. See <HelpLink to="blocks">Blocks and tags</HelpLink>.
            </>,
            <>
              Click <b>New variant</b>, pick the <C>#frontend</C> tag, watch the preview and the page count, then <b>Create variant</b>. See{' '}
              <HelpLink to="variants">Variants</HelpLink>.
            </>,
            <>
              Go back to the master (the “variant of …” link at the top), change your phone number and save. Open the variant again: it says{' '}
              <b>Pull 1 update</b>. Click it to bring the change in. See <HelpLink to="pulling">Pulling updates (how merges work)</HelpLink>.
            </>,
            <>
              Back on the home page, the <b>Graph</b> shows how documents relate, and <b>Versions</b> shows every saved version over time. See{' '}
              <HelpLink to="graphs">Graphs</HelpLink>.
            </>,
          ]}
        />
        <Note kind="tip">
          Your documents live in this browser. Connect Google Drive (top right) to back them up and use them on other devices. See{' '}
          <HelpLink to="sync">Google Drive and devices</HelpLink>.
        </Note>
        <H2>Words used in texChef</H2>
        <Table
          head={['Word', 'Meaning']}
          rows={[
            [<b>Document</b>, 'A LaTeX project: one or more files that compile to one PDF.'],
            [<b>Master</b>, 'Any document you make variants from. Usually your full resume.'],
            [<b>Variant</b>, 'A document made from another one (its parent) by picking some of its blocks. It stays linked to its parent.'],
            [<b>Block</b>, 'A marked piece of a document (a section, a job, a bullet) that variants can keep or leave out.'],
            [<b>Version</b>, 'A saved snapshot of a document. You can compare, restore or branch from any version.'],
            [<b>Pull</b>, 'Bring the parent’s newer changes into a variant.'],
            [<b>Push</b>, 'Copy one block from a variant back into its parent.'],
          ]}
        />
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
            texChef uses it to recognise the same block in the master and in its variants, so avoid renaming ids once you have variants.
          </li>
          <li>Blocks can be nested: the job above contains two bullet blocks.</li>
          <li>
            <C>tags=backend,data</C> is optional. Tags describe what a block is about and let you build a variant by picking tags instead of ticking
            boxes one by one.
          </li>
          <li>
            You can add <C>title="…"</C> to choose the name shown in the Blocks panel; otherwise texChef uses the first line of the block.
          </li>
          <li>Everything outside blocks (the preamble, your name and contact line) is always kept in every variant.</li>
        </UL>
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
          A variant is a new document made from another document (its <b>parent</b>) by keeping some of its blocks. After you create it, it is a
          normal document: you can reword anything in it. It remembers which blocks you picked (its <b>recipe</b>) so that later changes in the
          parent can be pulled in.
        </P>
        <H2>Creating a variant</H2>
        <Steps
          items={[
            <>
              Open the master and click <b>New variant</b> (or right-click a document in the graph). To start from an older state, use{' '}
              <b>Branch here</b> on a version in the History panel or the Versions graph.
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
            ['Any', 'its parent block is kept too. Unticking a job removes all of its bullets.'],
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
          A variant can have its own variants: for example <i>Master → Backend → Backend (Staff, 1 page)</i>. Each one pulls from its own parent.
          The family graph on the home page shows the whole tree.
        </P>
        <H3>Duplicate vs. variant</H3>
        <P>
          <b>Duplicate</b> (document menu) makes a full copy that is still linked to the original but keeps <i>everything</i>: when you pull, all of
          the parent’s changes come in, with nothing filtered out.
        </P>
      </>
    ),
  },
  {
    id: 'pulling',
    title: 'Pulling updates (how merges work)',
    summary: 'Bring the parent’s changes into a variant without losing your own edits.',
    body: () => (
      <>
        <P>
          When the parent of a variant changes, the variant shows <b>Pull N updates</b> in its header and a “behind” badge in the graph. Pulling
          brings those changes in. It is called a <b>merge</b> because texChef combines two sets of changes: the ones made in the parent and the
          ones you made in the variant.
        </P>
        <H2>The three versions texChef compares</H2>
        <P>To merge, texChef looks at three versions of the text, line by line:</P>
        <OL>
          <li>
            <b>Base</b>: the parent as it was the last time this variant was in sync with it (when you created it, or at your last pull), with your
            recipe applied.
          </li>
          <li>
            <b>Parent now</b>: the parent as it is today, with the same recipe applied.
          </li>
          <li>
            <b>Your variant now</b>, including any rewording you did in it.
          </li>
        </OL>
        <P>
          Comparing <i>base → parent now</i> tells texChef what the parent changed. Comparing <i>base → your variant</i> tells it what you changed.
          It then applies both.
        </P>
        <H2>Example 1: a clean merge</H2>
        <P>You changed your phone number in the master, and separately reworded a bullet in the Frontend variant.</P>
        <Legend />
        <Grid cols={3}>
          <Lines
            title="Base"
            subtitle="master when you last synced"
            lines={[
              ['same', 'Jordan Rivera · (555) 010-2030'],
              ['same', 'Rebuilt the dashboard, 60% faster'],
              ['same', 'Built a component library'],
              ['same', 'University of Washington, 2019'],
            ]}
          />
          <Lines
            title="Master now"
            subtitle="what the parent changed"
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
          title="After the pull"
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
            ['Changed only in the parent', 'The parent’s new text is used.'],
            ['Changed only in your variant', 'Your text is kept.'],
            ['Changed the same way in both', 'Kept once (no conflict).'],
            ['Changed differently in both', <b>Conflict: you choose.</b>],
            ['Added in the parent inside a block you kept', 'Added to the variant.'],
            ['Changed in the parent inside a block your variant leaves out', 'Ignored: the block is filtered out, so the variant never sees it.'],
          ]}
        />
        <H2>Example 2: a conflict</H2>
        <P>
          This time the master changed “60% faster” to “70% faster”, and you had reworded the same line in the variant. texChef cannot know which
          one you want, so it shows both, between conflict markers:
        </P>
        <Lines
          title="After the pull (needs a decision)"
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
        <P>On the pull page each conflict has three buttons:</P>
        <UL>
          <li>
            <b>Keep mine</b>: keep the variant’s line (“much faster for 2M users”).
          </li>
          <li>
            <b>Use parent</b>: take the master’s line (“70% faster”).
          </li>
          <li>
            <b>Both</b>: keep both lines, then edit them in the right-hand pane.
          </li>
        </UL>
        <P>
          You can also edit the right-hand side (“After pull”) directly, for example to write “Rebuilt the dashboard, 70% faster for 2M users”.
          <b> Finish pull</b> becomes available when no conflicts are left.
        </P>
        <H2>New blocks in the parent</H2>
        <P>
          If the parent gained blocks since you last synced (say, a new job or bullet), the pull page lists them under <b>New in …</b> with a
          checkbox. If your variant was made with tags, blocks matching your tags are ticked for you. If it was made by ticking blocks, new blocks
          are unticked, so a focused variant does not grow by surprise.
        </P>
        <H2>What happens when you finish</H2>
        <UL>
          <li>Unsaved edits in the variant are saved first, so nothing is lost.</li>
          <li>
            The result is saved as a <b>merge</b> version. In the Versions graph it has two arrows: one from the variant’s previous version and one
            (dashed) from the parent’s version it was merged with.
          </li>
          <li>The variant is now “up to date” and the parent’s current version becomes the new base for the next pull.</li>
        </UL>
        <Note kind="tip">
          Not sure? Use <b>Compare</b> first to see the parent and the variant side by side, or pull and look at the result: every pull is a version
          in History, so you can always restore the variant as it was before.
        </Note>
        <H3>Merges between devices</H3>
        <P>
          The same three-way merge is used when one document was edited on two devices before they synced. See{' '}
          <HelpLink to="sync">Google Drive and devices</HelpLink>.
        </P>
      </>
    ),
  },
  {
    id: 'pushing',
    title: 'Pushing a block to the parent',
    summary: 'Copy an improvement made in a variant back into the master.',
    body: () => (
      <>
        <P>
          Sometimes you improve a bullet while tailoring a variant and want the master to have it too. In the variant’s <b>Blocks</b> panel, blocks
          that differ from the parent are marked <b>edited</b> (or <b>new</b> if the parent does not have them). Hover one and click the{' '}
          <b>push</b> arrow.
        </P>
        <Steps
          items={[
            <>texChef finds the block with the same id in the parent and replaces it with your version (or adds it next to its neighbours).</>,
            <>
              The parent gets a new version named “Pushed ‘…’ from ‘your variant’”, so it is easy to find and undo in History.
            </>,
            <>
              The next pull into the variant is clean: both sides now have the same text, which counts as “changed the same way in both”.
            </>,
          ]}
        />
        <Note kind="warn">
          If the parent also changed that block since your last pull, texChef asks before replacing it, so you do not overwrite someone else’s (or
          your own earlier) edit by accident.
        </Note>
        <P>
          You can copy blocks between <i>any</i> two documents, not just variant and parent, from the <HelpLink to="compare">Compare</HelpLink>{' '}
          view.
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
          Open it from a document menu (<b>Compare with parent</b>), the editor’s <b>⌄</b> menu, or the compare button on any version. At the top
          you choose the <b>Left</b> and <b>Right</b> document, and for each one either <b>Current (editable)</b> or any saved version.
        </P>
        <UL>
          <li>
            Changed lines are highlighted. <b>Only changes</b> hides the unchanged parts.
          </li>
          <li>
            Both sides are editable when they show a current document. Edits are saved into that document as you type; <b>Save both</b> saves a
            version of each.
          </li>
          <li>
            The arrows between the two sides copy one change across. <b>Arrows copy left → right</b> switches their direction.
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
    id: 'history',
    title: 'Versions and history',
    summary: 'Save, restore, branch from and download any version.',
    body: () => (
      <>
        <P>
          Every document keeps its full history. Open the <b>History</b> tab in the editor’s left panel.
        </P>
        <Table
          head={['Kind', 'When it is made']}
          rows={[
            [<b>Saved version</b>, <>When you click <b>Save version</b> or press <Kbd>Ctrl/⌘ S</Kbd> (optionally with a message).</>],
            [<b>Autosave</b>, 'After a minute without typing, and when you leave the page. Hidden by default; tick “autosaves” to see them.'],
            [<b>Variant / merge / push</b>, 'When you create a variant, pull from the parent, or a block is pushed into this document.'],
            [<b>Restore</b>, 'When you restore an older version.'],
          ]}
        />
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
            <b>Branch here</b>: make a variant from that version.
          </li>
          <li>
            <b>Download</b> it as a .zip.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: 'graphs',
    title: 'Graphs',
    summary: 'See how documents relate and how they changed over time.',
    body: () => (
      <>
        <P>
          The home page has two graphs (switch with <b>Documents</b> / <b>Versions</b>) and a <b>List</b> view.
        </P>
        <H2>Documents graph</H2>
        <UL>
          <li>Each card is a document, with a thumbnail of its first page and its page count.</li>
          <li>Arrows go from a parent to its variants; the label shows the tags the variant was made with.</li>
          <li>
            A dashed arrow and a <b>behind</b> badge mean the variant has updates to pull.
          </li>
          <li>
            <b>edited elsewhere</b> means another device changed it too (see <HelpLink to="sync">sync</HelpLink>).
          </li>
          <li>Click a card to open it; right-click it (or use ⋯) for every action: new variant, compare, pull, duplicate, color, archive, delete.</li>
        </UL>
        <H2>Versions graph</H2>
        <UL>
          <li>Each row (lane) is a document; each dot is a version, oldest on the left. The icon in the dot shows its kind.</li>
          <li>
            A dashed arrow between lanes shows where a variant was created from its parent, or where a pull merged the parent’s version into it.
          </li>
          <li>Click a dot for details and actions: open, compare, branch here, restore.</li>
        </UL>
        <H2>Colors and archiving</H2>
        <P>
          Give a document a color with <b>Color…</b> in its menu (or click the colored dot next to its name in the editor). The color is used for the
          card border, the list, the graph arrows and its lane in the Versions graph. Old variants you no longer need can be <b>archived</b>: they
          disappear from the graphs and list until you click <b>Show archived</b>.
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
        <UL>
          <li>
            <b>Upload .tex / .zip</b> on the home page (or drop files onto it) makes a new document. An <b>Overleaf</b> project downloaded as .zip
            works as is; the file with <C>\documentclass</C> becomes the main file.
          </li>
          <li>
            <b>Import from Drive</b> (when Drive is connected) opens Google’s file picker. texChef can only read files you pick there.
          </li>
          <li>
            Inside a document, the <b>Files</b> tab has <b>upload</b> (images, <C>.cls</C>, <C>.sty</C>, <C>.bib</C>, fonts, or a .zip) and{' '}
            <b>new file</b>. Use paths like <C>sections/experience.tex</C> for folders.
          </li>
        </UL>
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
            Editor ⌄ menu: <b>Download PDF</b>, the current file, or the whole project as <b>.zip</b> (sources + PDF).
          </li>
          <li>Any version in History can be downloaded as a .zip.</li>
          <li>
            <b>Export all PDFs</b> on the home page downloads the latest PDF of every document in one .zip.
          </li>
          <li>With Drive connected, each document also has a readable folder in your Drive with its sources and latest PDF.</li>
        </UL>
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
          texChef runs a full TeX Live 2026 in your browser. Nothing is uploaded to compile. The first compile downloads the core engine (about 80
          MB, once); later visits reuse it.
        </P>
        <H2>Engines</H2>
        <UL>
          <li>
            <b>pdfLaTeX</b>: the default, fastest, works with most templates.
          </li>
          <li>
            <b>XeLaTeX</b> / <b>LuaLaTeX</b>: for <C>fontspec</C>, system-style fonts and full Unicode. Upload <C>.ttf</C>/<C>.otf</C> files into
            the project to use your own fonts.
          </li>
        </UL>
        <P>
          The ⚡ button turns automatic compiling on or off; <b>Compile</b> (<Kbd>Ctrl/⌘ Enter</Kbd>) compiles now.
        </P>
        <H2>Errors and warnings</H2>
        <P>
          The <b>Problems</b> panel under the PDF lists errors and warnings with their line; click one to jump there. Errors are also underlined in
          the editor. <b>Raw log</b> shows the full TeX log. If a compile fails, the last good PDF stays visible.
        </P>
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
            The <b>◎</b> button above the PDF highlights where the line under your cursor appears in the PDF.
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
          Everything is saved in this browser first, so texChef works offline and without an account. Browser storage can be cleared (private
          windows, “clear site data”, a full disk), so connect Drive if your documents matter. Settings → Local data shows whether the browser has
          agreed to keep texChef’s data permanently.
        </P>
        <H2>Connecting Google Drive</H2>
        <UL>
          <li>
            Click <b>Local only · Connect Drive</b> at the top right and sign in. texChef asks only for access to the files it creates and the
            files you pick, not your whole Drive.
          </li>
          <li>
            It syncs after you save, when you come back to the tab, and every minute. The indicator shows “Synced … ago”; its menu has <b>Sync now</b>{' '}
            and <b>Open texChef folder in Drive</b>.
          </li>
          <li>
            Google sign-ins last about an hour. When it expires the indicator says <b>Reconnect Drive</b>; your work keeps saving locally meanwhile.
          </li>
        </UL>
        <Code title="In your Google Drive">{`
texChef/
  Master resume/          ← main.tex, other files, and Master resume.pdf
  Master resume · Backend/
  .texchef/               ← history used for syncing; leave it alone`}</Code>
        <H2>Edits on two devices</H2>
        <P>
          If the same document was changed on two devices before they synced, nothing is overwritten. The document shows <b>edited elsewhere</b> and
          a banner with three choices:
        </P>
        <UL>
          <li>
            <b>Merge them</b>: combines both sets of changes with the same three-way merge as{' '}
            <HelpLink to="pulling">pulling</HelpLink>. If the same lines were changed differently, conflict markers (<C>{'<<<<<<<'}</C>,{' '}
            <C>=======</C>, <C>{'>>>>>>>'}</C>) are left in the text for you to tidy up in the editor.
          </li>
          <li>
            <b>Compare</b>: look at both first.
          </li>
          <li>
            <b>Keep mine</b>: keep this device’s version; the other one stays available in history.
          </li>
        </UL>
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
            [<Kbd>Ctrl/⌘ Z</Kbd>, 'Undo (also undoes Auto-mark)'],
            [<Kbd>Tab</Kbd>, 'Indent; also accepts a suggestion'],
            [<Kbd>\</Kbd>, 'Start typing a command to get suggestions'],
            [<C>%% @</C>, 'Suggests a block snippet'],
            ['Double-click the PDF', 'Jump to the source line'],
          ]}
        />
        <H2>Tips</H2>
        <UL>
          <li>Keep one master with everything; make a variant per kind of role, and per application only when you need to tailor further.</li>
          <li>Fix shared things (contact details, dates, typos) in the master, then pull into the variants.</li>
          <li>Use the page-count badge in the variant builder to land on exactly one page.</li>
          <li>Archive variants for applications you are done with instead of deleting them.</li>
          <li>The palette button at the top right switches between light and dark and six color themes.</li>
        </UL>
      </>
    ),
  },
];
