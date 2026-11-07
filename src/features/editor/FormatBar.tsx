import { useEffect, useReducer, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { redo, toggleComment, undo } from '@codemirror/commands';
import {
  Bold,
  ChevronDown,
  Code2,
  Eye,
  Italic,
  Link2,
  List,
  ListOrdered,
  Palette,
  Plus,
  Redo2,
  Type,
  Underline,
  Undo2,
  ALargeSmall,
} from 'lucide-react';
import type { Engine } from '@/core/model';
import { ActionDropdown, type MenuAction } from '@/components/ActionMenu';
import { Button, Dialog, Input, Tip } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  baseSize,
  currentFont,
  enclosingCommand,
  FONTS,
  headingLevel,
  insertLink,
  insertList,
  insertText,
  onEditorUpdate,
  setBaseSize,
  setColor,
  setDocumentFont,
  setHeading,
  setSize,
  SIZE_NAMES,
  toggleCommand,
} from './format';

const SIZE_LABELS: Record<string, string> = {
  tiny: 'Tiny',
  scriptsize: 'Script',
  footnotesize: 'Footnote',
  small: 'Small',
  normalsize: 'Normal',
  large: 'Large',
  Large: 'Larger',
  LARGE: 'Even larger',
  huge: 'Huge',
  Huge: 'Huger',
};
const COLORS: [string, string][] = [
  ['black', '#000'],
  ['darkgray', '#404040'],
  ['gray', '#808080'],
  ['red', '#e00'],
  ['orange', '#f80'],
  ['olive', '#808000'],
  ['teal', '#008080'],
  ['blue', '#00f'],
  ['violet', '#800080'],
];
const HEADING_LABELS = ['Normal text', 'Section', 'Subsection', 'Sub-subsection'];

/** Code / visual switch and formatting buttons above the editor. */
export function FormatBar({
  view,
  visual,
  onVisual,
  isTex,
  engine,
  readOnly,
}: {
  view: () => EditorView | null;
  visual: boolean;
  onVisual: (v: boolean) => void;
  isTex: boolean;
  engine: Engine;
  readOnly?: boolean;
}) {
  // Re-render when the cursor moves, so B / I / U and the paragraph style show what is under it.
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onEditorUpdate(refresh), []);
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState('https://');
  const v = view();
  const state = v?.state;
  const sel = state?.selection.main;
  const active = (cmds: string[], args = 1) => !!(state && sel && enclosingCommand(state, cmds, sel.from, sel.to, args));
  const level = state ? headingLevel(state) : 0;
  const text = state?.doc.toString() ?? '';
  const font = currentFont(text);
  const size = baseSize(text);
  const run = (fn: (v: EditorView) => boolean) => () => {
    const ed = view();
    if (ed) fn(ed);
  };
  const disabled = readOnly || !isTex;

  const btn = (label: string, tip: string, icon: React.ReactNode, onClick: () => void, on = false, testId?: string) => (
    <Tip content={tip}>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={on}
        className={cn('flex size-7 items-center justify-center rounded-md disabled:opacity-40', on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle hover:text-fg')}
        data-testid={testId}
      >
        {icon}
      </button>
    </Tip>
  );
  const drop = (label: React.ReactNode, actions: MenuAction[], testId: string, tip: string, menuLabel?: string) => (
    <ActionDropdown
      align="start"
      label={menuLabel}
      actions={actions}
      trigger={
        <button
          onMouseDown={(e) => e.preventDefault()}
          disabled={disabled}
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted hover:bg-subtle hover:text-fg disabled:opacity-40"
          aria-label={tip}
          title={tip}
          data-testid={testId}
        >
          {label}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      }
    />
  );
  const sep = <span className="mx-0.5 h-4 w-px shrink-0 bg-line @max-[720px]:hidden" />;
  const pdfFonts = engine === 'pdflatex';

  return (
    <div className="@container shrink-0 border-b border-line bg-panel" data-testid="format-bar">
    <div className="flex min-h-9 flex-wrap items-center gap-0.5 px-2 py-1">
      <div className="mr-1 inline-flex rounded-lg bg-subtle p-0.5 text-xs font-medium @max-[560px]:[&_button]:px-1.5">
        {(
          [
            [false, Code2, 'Code', 'The LaTeX as you type it'],
            [true, Eye, 'Visual', 'Formatted: headings, bold, bullets. The LaTeX stays the same; whatever the cursor is in shows its code.'],
          ] as const
        ).map(([on, Icon, label, tip]) => (
          <Tip key={label} content={tip}>
            <button
              onClick={() => onVisual(on)}
              disabled={!isTex && on}
              className={cn('flex h-6 items-center gap-1 rounded-md px-2 disabled:opacity-40', visual === on ? 'bg-panel shadow-sm' : 'text-muted')}
              aria-pressed={visual === on}
              data-testid={`editor-mode-${on ? 'visual' : 'code'}`}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          </Tip>
        ))}
      </div>
      <span className="contents @max-[720px]:hidden">
        {btn('Undo', 'Undo (Ctrl/⌘ Z)', <Undo2 className="size-3.5" />, run((e) => undo(e)))}
        {btn('Redo', 'Redo (Ctrl/⌘ Shift Z)', <Redo2 className="size-3.5" />, run((e) => redo(e)))}
        {sep}
      </span>
      {drop(
        <span className="w-20 truncate text-left @max-[720px]:w-14">{HEADING_LABELS[level]}</span>,
        HEADING_LABELS.map((l, i) => ({ key: String(i), label: l, checked: i === level, run: run((e) => setHeading(e, i)), testId: `heading-${i}` })),
        'paragraph-style',
        'Paragraph style: normal text or a heading',
      )}
      {sep}
      {btn('Bold', 'Bold (Ctrl/⌘ B)', <Bold className="size-3.5" />, run((e) => toggleCommand(e, 'textbf')), active(['textbf']), 'format-bold')}
      {btn('Italic', 'Italic (Ctrl/⌘ I)', <Italic className="size-3.5" />, run((e) => toggleCommand(e, 'textit', ['emph'])), active(['textit', 'emph']), 'format-italic')}
      {btn('Underline', 'Underline (Ctrl/⌘ U)', <Underline className="size-3.5" />, run((e) => toggleCommand(e, 'underline')), active(['underline']), 'format-underline')}
      {drop(
        <ALargeSmall className="size-3.5" />,
        SIZE_NAMES.map((s) => ({ key: s, label: SIZE_LABELS[s], hint: `\\${s}`, run: run((e) => setSize(e, s)) })),
        'format-size',
        'Text size of the selection',
        'Text size',
      )}
      {drop(
        <Palette className="size-3.5" />,
        [
          ...COLORS.map(([name, css]) => ({
            key: name,
            label: name,
            icon: <span className="size-3 rounded-full border border-line" style={{ background: css }} />,
            run: run((e) => setColor(e, name)),
          })),
          { key: 'none', label: 'No color', separatorBefore: true, run: run((e) => setColor(e, null)) },
        ],
        'format-color',
        'Text color of the selection',
        'Text color',
      )}
      {sep}
      {btn('Bulleted list', 'Bulleted list (selected lines become items)', <List className="size-3.5" />, run((e) => insertList(e, 'itemize')), false, 'format-bullets')}
      {btn('Numbered list', 'Numbered list', <ListOrdered className="size-3.5" />, run((e) => insertList(e, 'enumerate')), false, 'format-numbers')}
      {btn('Link', 'Link (web address or email)', <Link2 className="size-3.5" />, () => setLinking(true), active(['href'], 2), 'format-link')}
      {drop(
        <Plus className="size-3.5" />,
        [
          { key: 'br', label: 'Line break', hint: '\\\\', run: run((e) => insertText(e, '\\\\\n')) },
          { key: 'page', label: 'Page break', hint: '\\newpage', run: run((e) => insertText(e, '\n\\newpage\n')) },
          { key: 'vspace', label: 'Vertical space', hint: '\\vspace{6pt}', run: run((e) => insertText(e, '\\vspace{6pt}')) },
          { key: 'hfill', label: 'Push the rest to the right', hint: '\\hfill', run: run((e) => insertText(e, '\\hfill ')) },
          { key: 'rule', label: 'Horizontal line', run: run((e) => insertText(e, '\n\\noindent\\rule{\\linewidth}{0.4pt}\n')) },
          {
            key: 'chars',
            label: 'Special character',
            separatorBefore: true,
            sub: [
              ['&', '\\&'],
              ['%', '\\%'],
              ['$', '\\$'],
              ['#', '\\#'],
              ['_', '\\_'],
              ['– (range: 2020–2024)', '--'],
              ['— (dash)', '---'],
              ['•', '\\textbullet{}'],
              ['©', '\\textcopyright{}'],
              ['non-breaking space', '~'],
              ['“quotes”', "``''"],
            ].map(([label, tex]) => ({ key: tex, label, hint: tex, run: run((e) => insertText(e, tex)) })),
          },
          { key: 'comment', label: 'Comment out line(s)', hint: 'Ctrl/⌘ /', separatorBefore: true, run: run((e) => toggleComment(e)) },
        ],
        'format-insert',
        'Insert',
        'Insert',
      )}
      {sep}
      {drop(
        <span className="flex items-center gap-1">
          <Type className="size-3.5" />
          <span className="max-w-24 truncate @max-[720px]:hidden">{FONTS.find((f) => f.key === font)?.label ?? 'Font'}</span>
        </span>,
        pdfFonts
          ? [
              ...FONTS.map((f) => ({
                key: f.key,
                label: <span style={{ fontFamily: f.css }}>{f.label}</span>,
                checked: f.key === font,
                run: run((e) => setDocumentFont(e, f.key)),
                testId: `font-${f.key}`,
              })),
              ...(['10', '11', '12'] as const).map((pt, i) => ({
                key: `size-${pt}`,
                label: `Base size ${pt}pt`,
                separatorBefore: i === 0,
                checked: size === pt,
                run: run((e) => setBaseSize(e, pt)),
                testId: `base-size-${pt}`,
              })),
            ]
          : [
              {
                key: 'xetex',
                label: 'This document uses XeLaTeX/LuaLaTeX: set its font with \\setmainfont (upload .ttf/.otf files to use your own).',
                disabled: true,
              },
            ],
        'format-font',
        'Font for the whole document',
        'Document font',
      )}
      <Dialog
        open={linking}
        onOpenChange={setLinking}
        title="Add a link"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLinking(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!/\S+[.:@]\S+/.test(url)}
              onClick={() => {
                const ed = view();
                const target = /^[^@\s/]+@[^@\s]+$/.test(url) ? `mailto:${url}` : url;
                if (ed) insertLink(ed, target);
                setLinking(false);
                setUrl('https://');
              }}
              data-testid="link-ok"
            >
              Add link
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-muted">The selected text becomes the link. An email address works too.</p>
        <Input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !/\S+[.:@]\S+/.test(url)) return;
            const ed = view();
            if (ed) insertLink(ed, /^[^@\s/]+@[^@\s]+$/.test(url) ? `mailto:${url}` : url);
            setLinking(false);
            setUrl('https://');
          }}
          aria-label="Link address"
          data-testid="link-url"
        />
      </Dialog>
    </div>
    </div>
  );
}
