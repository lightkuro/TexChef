import type { Repo, FileMap } from '@/core/repo';
import { fileText } from '@/core/repo';
import { merge3 } from '@/core/merge';

/**
 * Replies from AI agents (experimental, opt-in). An agent reads the readable copies TexChef keeps in
 * Google Drive and writes a new plain-text file that starts with a header line:
 *
 *   % texchef-reply doc=<document id> base=<version id> file=main.tex note="Tailored for Acme"
 *   % texchef-reply doc=<document id> rename="Resume, Acme" folder="Applications/Acme"
 *   % texchef-reply doc=new name="Cover letter, Acme" folder="Applications/Acme" variant-of=<document id>
 *   % texchef-reply doc=<document id> archive=yes
 *   % texchef-reply doc=<document id> variant-of=<document id>      (link an existing document as a variant)
 *   % texchef-reply doc=<document id> unlink=yes                    (make a variant a document of its own)
 *   % texchef-reply doc=<document id> make-original=yes             (swap a variant with its original)
 *   % texchef-reply doc=<variant id> base=<version> merged=<original's version id>   (text that already includes the original's changes)
 *   % texchef-reply doc=<variant id> then=get-updates | then=send-changes           (open TexChef's own merge review afterwards)
 *
 * The rest of the file is the whole edited file (it may be left out when only renaming or moving). Several files
 * are separated by `% texchef-file: <path>` lines. Nothing is applied until the person reviews it, and each
 * proposed action can be unticked there. Agents cannot delete anything; archiving (which only hides a document,
 * and can be undone) is a proposal like the others.
 */
export interface AgentReply {
  /** A document id, 'new' for a new document, or undefined when the header is missing. */
  doc?: string;
  base?: string;
  name?: string;
  note?: string;
  /** A new name for an existing document. */
  rename?: string;
  /** The folder to move the document to, or to create a new one in ("A/B"). */
  folder?: string;
  /** Make the document (new or existing) a linked variant of this document. */
  variantOf?: string;
  /** For an existing variant: unlink it from its original. */
  unlink?: boolean;
  /** For an existing variant: swap it with its original. */
  makeOriginal?: boolean;
  /**
   * For a variant: the proposed text already includes its original's changes up to this version of the original
   * (the agent did the merging). Accepting counts those changes as taken.
   */
  merged?: string;
  /** For a variant: after accepting, open TexChef's review for getting updates from, or sending changes to, its original. */
  then?: 'get-updates' | 'send-changes';
  /** Move the document to the archive (true) or bring it back (false). */
  archive?: boolean;
  /** path → full text. A path of '' means "the document's main file". */
  files: Record<string, string>;
}

const HEADER = /^%+\s*texchef-reply\b(.*)$/i;
const FILE = /^%+\s*texchef-file:\s*(.+?)\s*$/i;

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w-]+)=(?:"((?:[^"\\]|\\.)*)"|“([^”]*)”|(\S+))/g)) out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4]).replace(/\\"/g, '"');
  return out;
}

/** Read a reply. Tolerates a code fence around it and a few lines of chatter before the header. */
export function parseReply(raw: string): AgentReply {
  let text = raw.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const fenced = /^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/.exec(text);
  if (fenced) text = fenced[1];
  const lines = text.split('\n');
  const at = lines.slice(0, 8).findIndex((l) => HEADER.test(l.trim()));
  if (at < 0) return { files: { '': text } };
  const a = attrs(HEADER.exec(lines[at].trim())![1]);
  const files: Record<string, string> = {};
  let path = a.file ?? '';
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join('\n');
    if (body.trim() || path) files[path] = body.replace(/^\n+/, '');
    buf = [];
  };
  for (const line of lines.slice(at + 1)) {
    const f = FILE.exec(line.trim());
    if (f) {
      if (buf.some((l) => l.trim())) flush();
      else buf = [];
      path = f[1];
      continue;
    }
    buf.push(line);
  }
  flush();
  const flag = (v: string | undefined) => (v === undefined ? undefined : /^(yes|true|1)$/i.test(v) ? true : /^(no|false|0)$/i.test(v) ? false : undefined);
  return {
    doc: a.doc,
    base: a.base,
    name: a.name,
    note: a.note,
    rename: a.rename,
    folder: a.folder,
    variantOf: a['variant-of'] ?? a.variantof,
    unlink: flag(a.unlink) || undefined,
    makeOriginal: flag(a['make-original'] ?? a.makeoriginal) || undefined,
    merged: a.merged,
    then: a.then === 'get-updates' || a.then === 'send-changes' ? a.then : undefined,
    archive: flag(a.archive),
    files,
  };
}

export interface ReplyFilePlan {
  path: string;
  /** The document's current text ('' for a new file). */
  current: string;
  /** What accepting would write: the reply merged with edits made since the agent read the file. */
  proposed: string;
  conflicts: number;
}

export interface ReplyPlan {
  files: ReplyFilePlan[];
  /** False when the version the agent read isn't known here: the reply replaces the files as they are. */
  baseKnown: boolean;
  conflicts: number;
}

/** Combine a reply with the document: 3-way, so edits made after the agent read the file are kept. */
export async function planReply(repo: Repo, docId: string, reply: AgentReply): Promise<ReplyPlan> {
  const doc = await repo.getDoc(docId);
  if (!doc) throw new Error('That document isn’t on this device');
  const ours: FileMap = (await repo.getWork(docId)).files;
  const base = reply.base ? await repo.readCommitFiles(reply.base).catch(() => undefined) : undefined;
  const files: ReplyFilePlan[] = [];
  for (const [p, theirs] of Object.entries(reply.files)) {
    const path = p || doc.mainFile;
    const current = fileText(ours, path) ?? '';
    const before = base && fileText(base, path);
    const m = before === undefined ? { text: theirs, conflicts: 0 } : merge3(current, before, theirs, { ours: 'yours', theirs: 'agent' });
    files.push({ path, current, proposed: m.text, conflicts: m.conflicts });
  }
  return { files, baseKnown: !!base, conflicts: files.reduce((n, f) => n + f.conflicts, 0) };
}

export const hasConflictMarkers = (text: string) => /^<<<<<<< /m.test(text) && /^>>>>>>> /m.test(text);
