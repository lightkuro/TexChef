import { useState } from 'react';
import { Check } from 'lucide-react';
import type { DocMeta } from '@/core/model';
import { repo } from '@/app/repo';
import { Button, Dialog } from '@/components/ui';
import { cn, DOC_COLORS, docColor } from '@/lib/utils';

export const LABEL_COLORS: { color: string; name: string }[] = [
  { color: '#c2410c', name: 'Terracotta' },
  { color: '#dc2626', name: 'Red' },
  { color: '#d97706', name: 'Amber' },
  { color: '#4d7c0f', name: 'Olive' },
  { color: '#15803d', name: 'Green' },
  { color: '#0f766e', name: 'Teal' },
  { color: '#0e7490', name: 'Cyan' },
  { color: '#1d4ed8', name: 'Blue' },
  { color: '#4338ca', name: 'Indigo' },
  { color: '#7c3aed', name: 'Violet' },
  { color: '#be185d', name: 'Pink' },
  { color: '#57534e', name: 'Stone' },
];

/** Pick a document's color label (card border, list icon, graph edges, version lane). */
export function ColorDialog({ doc, open, onOpenChange }: { doc: DocMeta; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [custom, setCustom] = useState(doc.color ?? docColor(doc.id));
  const apply = async (color: string | undefined) => {
    await repo.updateDoc(doc.id, { color });
    onOpenChange(false);
  };
  const auto = DOC_COLORS.includes(docColor(doc.id)) ? docColor(doc.id) : undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Color for “${doc.name}”`}
      description="Used for the card border, the list icon, graph arrows and the document's lane in the version graph."
      footer={
        <Button variant="ghost" onClick={() => apply(undefined)}>
          Reset to automatic
        </Button>
      }
    >
      <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Color">
        {LABEL_COLORS.map((c) => (
          <button
            key={c.color}
            role="radio"
            aria-checked={doc.color === c.color}
            aria-label={c.name}
            title={c.name}
            onClick={() => apply(c.color)}
            className={cn('flex aspect-square items-center justify-center rounded-lg border-2', doc.color === c.color ? 'border-fg' : 'border-transparent')}
            style={{ background: c.color }}
            data-testid={`color-${c.name.toLowerCase()}`}
          >
            {doc.color === c.color && <Check className="size-4 text-white" />}
          </button>
        ))}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        Custom
        <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-line bg-panel" />
        <Button size="sm" variant="outline" onClick={() => apply(custom)}>
          Use this color
        </Button>
        {!doc.color && auto && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted">
            Automatic: <span className="inline-block size-3 rounded-full" style={{ background: auto }} />
          </span>
        )}
      </label>
    </Dialog>
  );
}
