import { describe, expect, it } from 'vitest';
import { RCDatabase } from '@/storage/db';
import { Repo } from '@/core/repo';
import { parseReply, planReply } from './reply';

let n = 0;

describe('agent replies', () => {
  it('reads the header, the note and one file', () => {
    const r = parseReply('% texchef-reply doc=abc base=c1 file=main.tex note="Tailored for Acme"\n\\documentclass{article}\nHi\n');
    expect(r).toMatchObject({ doc: 'abc', base: 'c1', note: 'Tailored for Acme' });
    expect(r.files).toEqual({ 'main.tex': '\\documentclass{article}\nHi\n' });
  });

  it('reads several files, a new document, a code fence and chatter before the header', () => {
    const r = parseReply('```latex\nHere you go:\n% texchef-reply doc=new name="Cover letter, Acme"\n% texchef-file: main.tex\nA\n% texchef-file: parts/b.tex\nB\n```');
    expect(r.doc).toBe('new');
    expect(r.name).toBe('Cover letter, Acme');
    expect(r.files).toEqual({ 'main.tex': 'A', 'parts/b.tex': 'B' });
  });

  it('reads proposed actions: rename, move to a folder, a new variant; a reply may carry no text', () => {
    const move = parseReply('% texchef-reply doc=abc rename="Resume, Acme" folder="Applications/Acme" note="Filed"\n');
    expect(move).toMatchObject({ doc: 'abc', rename: 'Resume, Acme', folder: 'Applications/Acme', note: 'Filed' });
    expect(move.files).toEqual({});
    expect(move.archive).toBeUndefined();
    expect(parseReply('% texchef-reply doc=abc archive=yes').archive).toBe(true);
    expect(parseReply('% texchef-reply doc=abc archive=no').archive).toBe(false);
    const variant = parseReply('% texchef-reply doc=new name="Letter" folder="Drafts" variant-of=m1\nBody');
    expect(variant).toMatchObject({ doc: 'new', name: 'Letter', folder: 'Drafts', variantOf: 'm1' });
    expect(variant.files).toEqual({ '': 'Body' });
    expect(variant.unlink).toBeUndefined();
    // For a document that already exists: link it as a variant of another, or unlink it.
    expect(parseReply('% texchef-reply doc=abc variant-of=m1')).toMatchObject({ doc: 'abc', variantOf: 'm1', files: {} });
    expect(parseReply('% texchef-reply doc=abc unlink=yes').unlink).toBe(true);
    expect(parseReply('% texchef-reply doc=abc unlink=no').unlink).toBeUndefined();
  });

  it('without a header, the whole text is the main file', () => {
    expect(parseReply('\\section{X}')).toEqual({ files: { '': '\\section{X}' } });
  });

  it('keeps edits made after the agent read the file, and shows clashes as conflicts', async () => {
    const repo = new Repo(new RCDatabase(`agents-${n++}`));
    const doc = await repo.createDoc({ name: 'R', files: { 'main.tex': { kind: 'text', text: 'a\nb\nc\nd' } } });
    const base = doc.head!;
    await repo.writeWorkText(doc.id, 'main.tex', 'A\nb\nc\nd');
    const clean = await planReply(repo, doc.id, parseReply(`% texchef-reply doc=${doc.id} base=${base}\na\nb\nc\nD`));
    expect(clean.baseKnown).toBe(true);
    expect(clean.files[0]).toMatchObject({ path: 'main.tex', current: 'A\nb\nc\nd', proposed: 'A\nb\nc\nD', conflicts: 0 });
    const clash = await planReply(repo, doc.id, parseReply(`% texchef-reply doc=${doc.id} base=${base}\nX\nb\nc\nd`));
    expect(clash.conflicts).toBe(1);
    expect(clash.files[0].proposed).toContain('<<<<<<< yours');
  });

  it('an unknown base replaces the file as it is', async () => {
    const repo = new Repo(new RCDatabase(`agents-${n++}`));
    const doc = await repo.createDoc({ name: 'R', files: { 'main.tex': { kind: 'text', text: 'old' } } });
    const p = await planReply(repo, doc.id, parseReply(`% texchef-reply doc=${doc.id} base=nope\nnew`));
    expect(p.baseKnown).toBe(false);
    expect(p.files[0]).toMatchObject({ current: 'old', proposed: 'new' });
  });
});
