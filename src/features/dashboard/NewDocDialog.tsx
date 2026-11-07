import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FileText, Mail, BookOpen } from 'lucide-react';
import { TEMPLATES } from '@/templates';
import { repo } from '@/app/repo';
import { Button, Dialog, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ReactNode> = {
  'resume-master': <FileText className="size-5" />,
  'cover-letter': <Mail className="size-5" />,
  article: <BookOpen className="size-5" />,
};

export function NewDocDialog({ open, onOpenChange, folder }: { open: boolean; onOpenChange: (o: boolean) => void; folder?: string }) {
  const [tpl, setTpl] = useState(TEMPLATES[0].id);
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const t = TEMPLATES.find((x) => x.id === tpl)!;

  const create = async () => {
    const files = Object.fromEntries(Object.entries(t.files).map(([p, text]) => [p, { kind: 'text' as const, text }]));
    const doc = await repo.createDoc({
      name: name.trim() || (t.id === 'resume-master' ? 'Master resume' : t.name),
      files,
      engine: t.engine,
      tags: t.tags,
      folder,
    });
    onOpenChange(false);
    setName('');
    navigate(`/doc/${doc.id}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New document"
      description="Start from a template. You can upload your own .tex or Overleaf .zip from the dashboard instead."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} data-testid="create-doc">
            Create
          </Button>
        </>
      }
    >
      <div className="grid gap-2">
        {TEMPLATES.map((x) => (
          <button
            key={x.id}
            onClick={() => setTpl(x.id)}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
              tpl === x.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-subtle',
            )}
            data-testid={`template-${x.id}`}
          >
            <span className={cn('mt-0.5', tpl === x.id ? 'text-accent' : 'text-muted')}>{ICONS[x.id]}</span>
            <span>
              <span className="block text-sm font-medium">{x.name}</span>
              <span className="block text-xs text-muted">{x.description}</span>
            </span>
          </button>
        ))}
      </div>
      <label className="mt-4 block text-xs font-medium text-muted">
        Name
        <Input
          className="mt-1"
          placeholder={tpl === 'resume-master' ? 'Master resume' : t.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
      </label>
    </Dialog>
  );
}
