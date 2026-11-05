import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Annotation, EditorState, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, HighlightStyle, indentOnInput, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, snippetCompletion, type CompletionContext } from '@codemirror/autocomplete';
import { lintGutter, setDiagnostics, type Diagnostic as CMDiagnostic } from '@codemirror/lint';
import { tags as t } from '@lezer/highlight';
import type { Diagnostic } from '@/compile/logParser';

const External = Annotation.define<boolean>();

export interface CodeEditorHandle {
  goto(line: number): void;
  /** Replace the whole document as one undoable change. */
  replaceAll(text: string): void;
  insertAtCursor(text: string): void;
  view(): EditorView | null;
  focus(): void;
}

interface Props {
  /** Identity of the file; switching it swaps editor state while preserving each file's undo history. */
  path: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  diagnostics?: Diagnostic[];
  onSave?: () => void;
  onCompile?: () => void;
  onCursorLine?: (line: number) => void;
}

const highlight = HighlightStyle.define([
  { tag: [t.tagName, t.macroName], color: 'var(--accent)' },
  { tag: t.keyword, color: 'var(--info)', fontWeight: '600' },
  { tag: t.comment, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [t.bracket, t.brace, t.squareBracket], color: 'var(--muted)' },
  { tag: [t.atom, t.number], color: 'var(--ok)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--warn)' },
  { tag: t.invalid, color: 'var(--danger)' },
  { tag: t.variableName, color: 'var(--fg)' },
]);

const markerDecorator = new MatchDecorator({
  regexp: /%+\s*@(?:block|end)\b.*$|^(?:<<<<<<<|=======|>>>>>>>).*$/gm,
  decoration: (m) => Decoration.mark({ class: m[0].startsWith('%') ? 'cm-block-marker' : 'cm-conflict-marker' }),
});

const markerHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = markerDecorator.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = markerDecorator.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

const COMMANDS = [
  'section{}', 'subsection{}', 'textbf{}', 'textit{}', 'emph{}', 'underline{}', 'href{}{}', 'url{}', 'item ', 'vspace{}', 'hspace{}',
  'newline', 'newpage', 'small', 'footnotesize', 'large', 'Large', 'LARGE', 'centering', 'includegraphics[width=]{}', 'usepackage{}',
  'documentclass{}', 'rcSection{}', 'rcEntry{}{}{}{}', 'rcProject{}{}{}', 'rcItem{}', 'rcSkill{}{}', 'rcItemListStart', 'rcItemListEnd',
  'input{}', 'label{}', 'ref{}', 'cite{}', 'today', 'textcolor{}{}', 'color{}', 'hfill', 'quad', 'noindent',
];
const ENVIRONMENTS = ['itemize', 'enumerate', 'description', 'tabular', 'center', 'minipage', 'figure', 'equation', 'align'];

function latexCompletions(ctx: CompletionContext) {
  const marker = ctx.matchBefore(/%%?\s*@\w*/);
  if (marker) {
    return {
      from: marker.from,
      options: [
        snippetCompletion('%% @block ${id} tags=${tags}\n${}\n%% @end', { label: '%% @block … %% @end', detail: 'texChef block', boost: 10 }),
        snippetCompletion('%% @end', { label: '%% @end' }),
      ],
    };
  }
  const word = ctx.matchBefore(/\\[A-Za-z]*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  return {
    from: word.from,
    options: [
      ...COMMANDS.map((c) =>
        snippetCompletion('\\' + c.replace(/\{\}/g, '{${}}').replace(/\[width=\]/, '[width=${0.8\\linewidth}]'), {
          label: '\\' + c.replace(/\{\}/g, '{}').replace(/ $/, ''),
          type: 'function',
        }),
      ),
      ...ENVIRONMENTS.map((e) =>
        snippetCompletion(`\\begin{${e}}\n\t${e === 'itemize' || e === 'enumerate' ? '\\item ' : ''}\${}\n\\end{${e}}`, {
          label: `\\begin{${e}}`,
          type: 'keyword',
        }),
      ),
    ],
  };
}

function toCM(state: EditorState, diags: Diagnostic[]): CMDiagnostic[] {
  const out: CMDiagnostic[] = [];
  for (const d of diags) {
    if (!d.line || d.line < 1 || d.line > state.doc.lines) continue;
    const line = state.doc.line(d.line);
    out.push({
      from: line.from,
      to: line.to,
      severity: d.severity,
      message: d.hint ? `${d.message}\n${d.hint}` : d.message,
      source: 'LaTeX',
    });
  }
  return out;
}

export const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const cb = useRef(props);
  cb.current = props;
  const currentPath = useRef(props.path);

  const extensions = (readOnly: boolean): Extension[] => [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(highlight),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ override: [latexCompletions] }),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    lintGutter(),
    StreamLanguage.define(stex),
    markerHighlighter,
    EditorView.lineWrapping,
    EditorState.readOnly.of(readOnly),
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => (cb.current.onSave?.(), true) },
      { key: 'Mod-Enter', preventDefault: true, run: () => (cb.current.onCompile?.(), true) },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !u.transactions.some((tr) => tr.annotation(External))) {
        cb.current.onChange?.(u.state.doc.toString());
      }
      if (u.selectionSet || u.docChanged) {
        cb.current.onCursorLine?.(u.state.doc.lineAt(u.state.selection.main.head).number);
      }
    }),
  ];

  const makeState = (doc: string) => EditorState.create({ doc, extensions: extensions(!!cb.current.readOnly) });

  useEffect(() => {
    const view = new EditorView({ state: makeState(props.value), parent: host.current! });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.readOnly]);

  // Swap files, keeping per-file undo history.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || currentPath.current === props.path) return;
    states.current.set(currentPath.current, view.state);
    currentPath.current = props.path;
    const saved = states.current.get(props.path);
    view.setState(saved && saved.doc.toString() === props.value ? saved : makeState(props.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.path]);

  // Apply external changes (pull, block copy, sync) without echoing onChange.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur !== props.value) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: props.value }, annotations: External.of(true) });
    }
  }, [props.value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(setDiagnostics(view.state, toCM(view.state, props.diagnostics ?? [])));
  }, [props.diagnostics, props.value]);

  useImperativeHandle(ref, () => ({
    goto(line: number) {
      const view = viewRef.current;
      if (!view) return;
      const l = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
      view.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
      view.focus();
    },
    replaceAll(text: string) {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    insertAtCursor(text: string) {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch(view.state.replaceSelection(text));
      view.focus();
    },
    view: () => viewRef.current,
    focus: () => viewRef.current?.focus(),
  }));

  return <div ref={host} className="h-full min-h-0 overflow-hidden" data-testid="code-editor" />;
});
