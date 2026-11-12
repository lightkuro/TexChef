import type { DocMeta } from '@/core/model';
import { AGENTS_FOLDER } from '@/storage/providers/gdrive';

export interface ReadmeDoc {
  doc: DocMeta;
  /** The saved version the readable copy in Drive shows. */
  base: string;
  /** Name of the document's folder in TexChef/. */
  folder: string;
  files: string[];
}

/** The instructions AI agents read first, with the list of documents they can work on. */
export function buildAgentsReadme(items: ReadmeDoc[], all: DocMeta[]): string {
  const name = (id?: string) => all.find((d) => d.id === id)?.name;
  const rows = items
    .slice()
    .sort((a, b) => a.doc.name.localeCompare(b.doc.name))
    .map(({ doc, base, folder, files }) => {
      const parent = doc.parent ? `variant of “${name(doc.parent.docId) ?? doc.parent.docId}”` : '';
      const kids = all.filter((d) => d.parent?.docId === doc.id && !d.deleted).map((d) => `“${d.name}”`);
      const family = [parent, kids.length ? `variants: ${kids.join(', ')}` : ''].filter(Boolean).join('; ');
      return `| ${doc.name} | \`${doc.id}\` | \`${base}\` | TexChef/${folder}/ | ${doc.mainFile} | ${files.length} | ${family || '–'} |`;
    });
  return `# Read me first (for AI agents)

This folder exists because the owner of this Google Drive turned on **AI agents (experimental)** in TexChef
(https://texchef.kurolight.dev), a LaTeX editor. TexChef never sends documents to an AI itself; you are reading
this because the owner connected you to their Drive. Follow these rules exactly.

## What you can read

Each document has a readable copy in its own folder inside \`TexChef/\`: its LaTeX files and a PDF of the last
compile. The copy shows the saved version listed as **base** below.

| Document | id | base | Folder | Main file | Files | Family |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n') || '| (no documents yet) | | | | | | |'}

Never change or delete anything in \`TexChef/\` outside this \`${AGENTS_FOLDER}\` folder. \`TexChef/.texchef/\`
holds the history: don't touch it.

## How to reply

TexChef can't apply edits you make anywhere else. Write each answer as **one new file in this folder**:

1. **Plain text**, not a Google Doc (if your tool converts uploads, turn conversion off).
2. Name it \`<Document name> - <what changed>.tex\`, for example \`Master resume - tailored for Acme.tex\`.
3. The **first line** must be the header, then the **whole** edited file (not a diff, not an excerpt):

\`\`\`latex
% texchef-reply doc=<id> base=<base> file=main.tex note="One sentence on what you changed"
\\documentclass{article}
…the complete file…
\`\`\`

- To change several files of one document, leave out \`file=\` and start each file with a line
  \`% texchef-file: <path>\`, followed by that file's complete text.
- To propose a **new document**, use \`doc=new name="<new document name>"\` instead of \`doc=\` and \`base=\`.
- Keep every comment line that starts with \`%% @block\` or \`%% @end\`: TexChef uses them to build tailored
  versions of a document.
- Keep the document compiling with pdfLaTeX unless it already uses another engine.

The owner reviews every reply in TexChef side by side with their document before anything changes. Edits they
made after you read the file are kept. Handled replies are moved to \`Done/\`.
`;
}
