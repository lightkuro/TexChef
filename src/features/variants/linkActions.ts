import { toast } from 'sonner';
import { repo } from '@/app/repo';
import type { DocMeta } from '@/core/model';
import { linkAsVariant, makeOriginal, restoreLinks, unlinkVariant, type LinkSnapshot } from '@/variants/ops';

/**
 * Link changes from the document menu, the map and the editor: each says what happened in a toast
 * with an Undo button (nothing asks first, because nothing here changes a document's text).
 */
function done(message: string, description: string, snapshot: LinkSnapshot) {
  toast.success(message, {
    description,
    duration: 9000,
    action: {
      label: 'Undo',
      onClick: () =>
        void restoreLinks(repo, snapshot)
          .then(() => toast.success('Undone: the documents are linked as they were before'))
          .catch((e) => toast.error(e instanceof Error ? e.message : String(e))),
    },
  });
}

const failed = (e: unknown) => {
  toast.error(e instanceof Error ? e.message : String(e));
  return false;
};

/** Make `doc` a variant of `original`. */
export async function linkDocs(doc: DocMeta, original: DocMeta): Promise<boolean> {
  try {
    const snapshot = await linkAsVariant(repo, doc.id, original.id);
    done(`“${doc.name}” is now a variant of “${original.name}”`, `No text changed. Changes made to “${original.name}” from now on show up as updates for “${doc.name}”.`, snapshot);
    return true;
  } catch (e) {
    return failed(e);
  }
}

export async function unlinkDoc(doc: DocMeta, originalName?: string): Promise<boolean> {
  try {
    const snapshot = await unlinkVariant(repo, doc.id);
    done(`“${doc.name}” is no longer a variant${originalName ? ` of “${originalName}”` : ''}`, 'It keeps its text and all of its versions.', snapshot);
    return true;
  } catch (e) {
    return failed(e);
  }
}

export async function promoteDoc(doc: DocMeta, originalName?: string): Promise<boolean> {
  try {
    const snapshot = await makeOriginal(repo, doc.id);
    done(`“${doc.name}” is now the original`, `${originalName ? `“${originalName}”` : 'Its former original'} is now its variant. No text changed.`, snapshot);
    return true;
  } catch (e) {
    return failed(e);
  }
}
