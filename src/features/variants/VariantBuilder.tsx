import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, GitBranch, AlertTriangle, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import { repo, useDoc, useWork } from '@/app/repo';
import type { FileMap } from '@/core/repo';
import { emptyRecipe, isTexPath, type Recipe } from '@/core/model';
import { parseBlocks, allTags, type Block } from '@/blocks/parser';
import { blockSelected, emptiedBlocks, setBlockSelected } from '@/blocks/filter';
import { createVariant, filterFiles, projectBlockIds } from '@/variants/ops';
import { useAutoCompile, useEngineStatus } from '@/features/compile/useCompile';
import { PdfViewer } from '@/features/preview/PdfViewer';
import { EngineBanner } from '@/features/compile/EngineBanner';
import { Badge, Button, Checkbox, EmptyState, Input, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

export function VariantBuilder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const from = params.get('from') ?? undefined;
  const parent = useDoc(id);
  const work = useWork(id);
  const navigate = useNavigate();
  const engine = useEngineStatus();
  const [commitFiles, setCommitFiles] = useState<FileMap>();
  const [name, setName] = useState('');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (from) void repo.readCommitFiles(from).then(setCommitFiles);
  }, [from]);

  const source = from ? commitFiles : work?.files;
  const texFiles = useMemo(() => {
    const out: [string, string][] = [];
    for (const [p, f] of Object.entries(source ?? {})) if (f.kind === 'text' && isTexPath(p)) out.push([p, f.text]);
    // Main file first.
    return out.sort(([a], [b]) => (a === parent?.mainFile ? -1 : b === parent?.mainFile ? 1 : a.localeCompare(b)));
  }, [source, parent?.mainFile]);
  const parsed = useMemo(() => texFiles.map(([p, t]) => [p, parseBlocks(t)] as const), [texFiles]);
  const tags = useMemo(() => [...new Set(parsed.flatMap(([, p]) => allTags(p)))].sort(), [parsed]);
  const allIds = useMemo(() => (source ? projectBlockIds(source) : []), [source]);

  useEffect(() => {
    if (source && recipe === null) setRecipe({ ...emptyRecipe(), include: allIds });
  }, [source, recipe, allIds]);

  const filtered = useMemo(() => (source && recipe ? filterFiles(source, recipe) : undefined), [source, recipe]);
  const { entry } = useAutoCompile({
    key: `variant-preview-${id}`,
    files: filtered,
    mainFile: parent?.mainFile,
    engine: parent?.engine,
    auto: true,
    delayMs: 700,
  });

  const warnings = useMemo(() => {
    if (!recipe) return new Set<string>();
    return new Set(texFiles.flatMap(([, t]) => emptiedBlocks(t, recipe).map((b) => b.id)));
  }, [texFiles, recipe]);

  if (parent === null) return <EmptyState title="Document not found" />;
  if (!parent || !source || !recipe) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const tagMode = recipe.tags.length > 0;
  const toggleTag = (t: string) => {
    const has = recipe.tags.includes(t);
    const nextTags = has ? recipe.tags.filter((x) => x !== t) : [...recipe.tags, t];
    if (nextTags.length === 0) setRecipe({ ...recipe, tags: [], include: allIds, exclude: [] });
    else if (!tagMode) setRecipe({ ...recipe, tags: nextTags, include: [], exclude: [] });
    else setRecipe({ ...recipe, tags: nextTags });
  };

  const selectedCount = (() => {
    let n = 0;
    const visit = (b: Block, on: boolean) => {
      const s = on && blockSelected(b, recipe);
      if (s) n++;
      b.children.forEach((c) => visit(c, s));
    };
    parsed.forEach(([, p]) => p.roots.forEach((b) => visit(b, true)));
    return n;
  })();

  const create = async () => {
    setCreating(true);
    try {
      const doc = await createVariant(repo, {
        parentId: parent.id,
        fromCommitId: from,
        name: name.trim() || defaultName(parent.name, recipe.tags),
        recipe,
      });
      toast.success(`Created variant “${doc.name}”`);
      navigate(`/doc/${doc.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  };

  const renderBlock = (b: Block, parentOn: boolean) => {
    const on = parentOn && blockSelected(b, recipe);
    return (
      <div key={b.id}>
        <label
          className={cn('flex cursor-pointer items-center gap-2 rounded-md py-1 pr-2 text-sm hover:bg-subtle', !parentOn && 'opacity-45')}
          style={{ paddingLeft: 8 + b.depth * 18 }}
        >
          <Checkbox
            checked={on}
            disabled={!parentOn}
            onCheckedChange={(c) => setRecipe(setBlockSelected(recipe, b, c))}
            aria-label={`Include ${b.label}`}
          />
          <span className={cn('min-w-0 flex-1 truncate', b.depth === 0 && 'font-medium')} title={b.label}>
            {b.label}
          </span>
          {warnings.has(b.id) && on && (
            <span title="Nothing left inside this block" className="text-warn">
              <AlertTriangle className="size-3.5" />
            </span>
          )}
          {b.tags.map((t) => (
            <Badge key={t} tone={recipe.tags.includes(t) ? 'accent' : 'neutral'} className="px-1.5 py-0 text-[10px]">
              {t}
            </Badge>
          ))}
        </label>
        {b.children.map((c) => renderBlock(c, on))}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col" data-testid="variant-builder">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <GitBranch className="size-4 text-accent" />
        <span className="text-sm font-semibold">New variant of “{parent.name}”</span>
        {from && <Badge tone="info">from an earlier version</Badge>}
        <div className="flex-1" />
        <Input
          className="w-72"
          placeholder={defaultName(parent.name, recipe.tags)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Variant name"
          data-testid="variant-name"
        />
        <Button variant="primary" onClick={create} disabled={creating} data-testid="create-variant">
          {creating ? <Spinner /> : <GitBranch className="size-4" />} Create variant
        </Button>
      </header>
      <EngineBanner status={engine} />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[44%] min-w-80 flex-col border-r border-line bg-panel">
          <div className="space-y-3 border-b border-line p-4">
            <div>
              <div className="text-xs font-semibold tracking-wide text-muted uppercase">Focus by tag</div>
              <p className="mt-0.5 text-xs text-muted">
                Pick tags to keep matching blocks plus untagged structure. Fine-tune with the checkboxes below.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.length === 0 && <span className="text-xs text-muted">No tags yet. Add tags=… to block markers to filter by role.</span>}
                {tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTag(t)}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                      recipe.tags.includes(t) ? 'border-accent bg-accent text-accent-fg' : 'border-line hover:bg-subtle',
                    )}
                    data-testid={`tag-${t}`}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Button size="sm" variant="ghost" onClick={() => setRecipe({ ...recipe, tags: [], include: allIds, exclude: [] })}>
                <CheckSquare className="size-3.5" /> All
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRecipe({ ...recipe, tags: [], include: [], exclude: [] })}>
                <Square className="size-3.5" /> None
              </Button>
              <span className="ml-auto text-muted">
                {selectedCount} of {allIds.length} blocks
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {allIds.length === 0 ? (
              <EmptyState title="This document has no blocks">
                Open it and use <b>Auto-mark</b> in the Blocks panel to split it into sections, entries and bullets. You can still create a full copy.
              </EmptyState>
            ) : (
              parsed.map(([path, p]) => (
                <div key={path} className="mb-2">
                  {texFiles.length > 1 && <div className="px-2 py-1 font-mono text-xs text-muted">{path}</div>}
                  {p.roots.map((b) => renderBlock(b, true))}
                </div>
              ))
            )}
          </div>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 text-xs">
            <span className="font-medium">Live preview</span>
            {entry?.pages !== undefined && (
              <Badge tone={entry.pages === 1 ? 'ok' : 'warn'} data-testid="variant-pages">
                {entry.pages === 1 ? 'Fits on 1 page' : `${entry.pages} pages`}
              </Badge>
            )}
            {entry?.output && !entry.output.ok && <Badge tone="danger">Compile error</Badge>}
            {entry?.running && <Spinner className="text-accent" />}
          </div>
          <PdfViewer pdf={entry?.output?.pdf} running={entry?.running} toolbar={false} className="flex-1" />
        </section>
      </div>
    </div>
  );
}

function defaultName(parentName: string, tags: string[]) {
  return tags.length ? `${parentName} · ${tags.map((t) => (t.length <= 3 ? t.toUpperCase() : t[0].toUpperCase() + t.slice(1))).join(' + ')}` : `${parentName} (variant)`;
}
