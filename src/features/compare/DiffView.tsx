import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { MergeView } from '@codemirror/merge';
import { Annotation, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, MatchDecorator, ViewPlugin, Decoration, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { tags as t } from '@lezer/highlight';

const External = Annotation.define<boolean>();

const highlight = HighlightStyle.define([
  { tag: [t.tagName, t.macroName], color: 'var(--accent)' },
  { tag: t.keyword, color: 'var(--info)', fontWeight: '600' },
  { tag: t.comment, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [t.bracket], color: 'var(--muted)' },
]);

const markers = new MatchDecorator({
  regexp: /%+\s*@(?:block|end)\b.*$|^(?:<<<<<<<|=======|>>>>>>>).*$/gm,
  decoration: (m) => Decoration.mark({ class: m[0].startsWith('%') ? 'cm-block-marker' : 'cm-conflict-marker' }),
});
const markerPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(v: EditorView) {
      this.decorations = markers.createDeco(v);
    }
    update(u: ViewUpdate) {
      this.decorations = markers.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

export interface DiffViewHandle {
  setA(text: string): void;
  setB(text: string): void;
  gotoB(line: number): void;
}

interface Props {
  a: string;
  b: string;
  aEditable?: boolean;
  bEditable?: boolean;
  onChangeA?: (text: string) => void;
  onChangeB?: (text: string) => void;
  /** Direction of the per-chunk copy arrows. */
  revert?: 'a-to-b' | 'b-to-a';
  collapseUnchanged?: boolean;
  /** Changing this key rebuilds the view (e.g. when switching files). */
  resetKey?: string;
}

function ext(editable: boolean, onChange: () => ((text: string) => void) | undefined): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    StreamLanguage.define(stex),
    syntaxHighlighting(highlight),
    markerPlugin,
    EditorView.lineWrapping,
    EditorState.readOnly.of(!editable),
    EditorView.editable.of(editable),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !u.transactions.some((tr) => tr.annotation(External))) onChange()?.(u.state.doc.toString());
    }),
  ];
}

/** Side-by-side diff with both sides optionally editable (CodeMirror MergeView). */
export const DiffView = forwardRef<DiffViewHandle, Props>(function DiffView(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const mv = useRef<MergeView | null>(null);
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    const view = new MergeView({
      a: { doc: props.a, extensions: ext(!!props.aEditable, () => cb.current.onChangeA) },
      b: { doc: props.b, extensions: ext(!!props.bEditable, () => cb.current.onChangeB) },
      parent: host.current!,
      revertControls: props.revert,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: props.collapseUnchanged ? { margin: 3, minSize: 6 } : undefined,
    });
    mv.current = view;
    return () => {
      view.destroy();
      mv.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.aEditable, props.bEditable, props.revert, props.collapseUnchanged, props.resetKey]);

  const set = (side: 'a' | 'b', text: string) => {
    const v = mv.current?.[side];
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur !== text) v.dispatch({ changes: { from: 0, to: cur.length, insert: text }, annotations: External.of(true) });
  };

  useEffect(() => set('a', props.a), [props.a]);
  useEffect(() => set('b', props.b), [props.b]);

  useImperativeHandle(ref, () => ({
    setA: (text) => mv.current?.a.dispatch({ changes: { from: 0, to: mv.current.a.state.doc.length, insert: text } }),
    setB: (text) => mv.current?.b.dispatch({ changes: { from: 0, to: mv.current.b.state.doc.length, insert: text } }),
    gotoB: (line) => {
      const v = mv.current?.b;
      if (!v) return;
      const l = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines)));
      v.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
    },
  }));

  return <div ref={host} className="h-full min-h-0 overflow-auto bg-panel" data-testid="diff-view" />;
});
