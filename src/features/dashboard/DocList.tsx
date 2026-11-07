import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { GitBranch, FileText, GitPullRequestArrow, AlertTriangle, Folder, GripVertical } from 'lucide-react';
import type { DocMeta } from '@/core/model';
import { repo, usePreviews } from '@/app/repo';
import { Badge } from '@/components/ui';
import { docColor, timeAgo } from '@/lib/utils';
import { DocActionsMenu } from './DocActions';
import { DOC_DRAG_TYPE } from '@/features/folders/FolderSidebar';

/** Indented tree list of documents (master → variants). */
export function DocList({ docs, showFolder }: { docs: DocMeta[]; showFolder?: boolean }) {
  const previews = usePreviews();
  const [behind, setBehind] = useState<Record<string, number>>({});
  useEffect(() => {
    void Promise.all(docs.map(async (d) => [d.id, await repo.commitsBehindParent(d)] as const)).then((p) => setBehind(Object.fromEntries(p)));
  }, [docs]);

  const ids = new Set(docs.map((d) => d.id));
  const rows: { doc: DocMeta; depth: number }[] = [];
  const visit = (d: DocMeta, depth: number) => {
    rows.push({ doc: d, depth });
    docs.filter((c) => c.parent?.docId === d.id).forEach((c) => visit(c, depth + 1));
  };
  docs.filter((d) => !d.parent || !ids.has(d.parent.docId)).forEach((d) => visit(d, 0));

  return (
    <div className="mx-auto max-w-5xl p-4" data-testid="doc-list">
      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <div className="grid grid-cols-[1fr_110px_120px_32px] gap-2 border-b border-line bg-subtle px-4 py-2 text-xs font-medium text-muted">
          <span>Document</span>
          <span>Pages</span>
          <span>Updated</span>
          <span />
        </div>
        {rows.map(({ doc, depth }) => {
          const p = previews?.get(doc.id);
          const n = behind[doc.id] ?? 0;
          return (
            <div
              key={doc.id}
              className="group grid grid-cols-[1fr_110px_120px_32px] items-center gap-2 border-b border-l-4 border-line px-4 py-2 last:border-b-0 hover:bg-subtle"
              style={{ borderLeftColor: docColor(doc.id, doc.color) }}
              draggable
              onDragStart={(e) => {
                // Drop onto a folder in the sidebar to move the document there.
                e.dataTransfer.setData(DOC_DRAG_TYPE, JSON.stringify([doc.id]));
                e.dataTransfer.effectAllowed = 'move';
              }}
              data-testid={`doc-row-${doc.name}`}
            >
              <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 22 }}>
                <GripVertical className="-ml-3 size-3.5 shrink-0 cursor-grab text-muted opacity-0 group-hover:opacity-60" aria-hidden />
                {depth > 0 ? <GitBranch className="size-4 shrink-0" style={{ color: docColor(doc.id, doc.color) }} /> : <FileText className="size-4 shrink-0" style={{ color: docColor(doc.id, doc.color) }} />}
                <Link to={`/doc/${doc.id}`} className="truncate text-sm font-medium hover:underline">
                  {doc.name}
                </Link>
                {showFolder && doc.folder && (
                  <span className="flex min-w-0 shrink items-center gap-1 truncate text-[11px] text-muted" title={doc.folder}>
                    <Folder className="size-3 shrink-0" />
                    {doc.folder}
                  </span>
                )}
                {doc.archived && <Badge>archived</Badge>}
                {doc.recipe?.tags.map((t) => (
                  <Badge key={t} tone="accent">
                    #{t}
                  </Badge>
                ))}
                {n > 0 && (
                  <Badge tone="warn">
                    <GitPullRequestArrow className="size-3" /> {n} update{n === 1 ? '' : 's'}
                  </Badge>
                )}
                {(doc.divergedHeads?.length ?? 0) > 0 && (
                  <Badge tone="danger">
                    <AlertTriangle className="size-3" /> edited elsewhere
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted">{p ? `${p.pages} page${p.pages === 1 ? '' : 's'}` : '—'}</span>
              <span className="text-xs text-muted">{timeAgo(doc.updatedAt)}</span>
              <DocActionsMenu doc={doc} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
