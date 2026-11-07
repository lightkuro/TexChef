import { toast } from 'sonner';
import { FileArchive, FileText, FolderDown, HardDriveDownload, Images, RefreshCw } from 'lucide-react';
import type { DocMeta } from '@/core/model';
import type { MenuAction } from '@/components/ActionMenu';
import { backupFiles, backupName, canWriteFolders, downloadZip, pdfFiles, saveToFolder, sourceFiles } from './backup';
import { confirmAction } from '@/components/confirm';
import { docsNeedingPreview, makePreviews, usePreviewJob } from './previews';

export type ExportKind = 'pdf' | 'sources' | 'backup-zip' | 'backup-folder';

/** Export some documents (a folder's, or everything) in one of the formats. */
export async function runExport(kind: ExportKind, docs: DocMeta[], scope: string | null) {
  if (!docs.length) {
    toast.info('There are no documents here to export.');
    return;
  }
  const label = scope ? scope.split('/').pop()! : 'texChef';
  const id = toast.loading(kind === 'pdf' ? 'Making the PDFs…' : 'Preparing the export…');
  try {
    if (kind === 'pdf') {
      const { files, missing } = await pdfFiles(docs);
      if (Object.keys(files).length) downloadZip(files, `${label} PDFs`);
      if (missing.length) toast.warning(`No PDF for ${missing.map((d) => `“${d.name}”`).join(', ')}`, { id, description: 'They didn’t compile. Open them to see the problems.' });
      else toast.success(`Exported ${Object.keys(files).length} PDF${Object.keys(files).length === 1 ? '' : 's'}`, { id });
    } else if (kind === 'sources') {
      const { files } = await sourceFiles(docs);
      downloadZip(files, `${label} LaTeX`);
      toast.success(`Exported ${docs.length} project${docs.length === 1 ? '' : 's'}`, { id });
    } else {
      const files = await backupFiles(docs, scope);
      const name = backupName(scope);
      if (kind === 'backup-zip') {
        downloadZip(files, name);
        toast.success(`Backed up ${docs.length} document${docs.length === 1 ? '' : 's'}`, { id, description: 'Upload the .zip on any texChef to restore it.' });
      } else if (await saveToFolder(files, name)) {
        toast.success(`Backed up ${docs.length} document${docs.length === 1 ? '' : 's'} to the folder “${name}”`, { id, description: 'Use Upload → A folder to restore it.' });
      } else toast.dismiss(id);
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e), { id });
  }
}

/** Brave hides the folder-writing feature behind a setting. */
const isBrave = () => typeof navigator !== 'undefined' && 'brave' in navigator;

/** Why a backup can't be written into a folder here, and what to do instead. */
function explainNoFolders() {
  toast.info(isBrave() ? 'Brave has writing to folders turned off' : 'This browser can’t write into folders', {
    duration: 15000,
    description: isBrave()
      ? 'To turn it on: open brave://flags, search for “File System Access API”, set it to Enabled and restart Brave. Or use “Backup with history (.zip)” and unzip it: you get the same folder.'
      : 'Only Chrome, Edge and similar browsers let a web page write into a folder you choose. Use “Backup with history (.zip)” and unzip it: you get the same folder.',
  });
}

/** The export formats, as menu entries. */
export function exportActions(docs: DocMeta[], scope: string | null): MenuAction[] {
  const folders = canWriteFolders();
  return [
    { key: 'pdf', label: 'PDFs (.zip)', icon: <FileText className="size-4" />, run: () => void runExport('pdf', docs, scope) },
    { key: 'sources', label: 'LaTeX projects (.zip)', icon: <FileArchive className="size-4" />, run: () => void runExport('sources', docs, scope) },
    {
      key: 'backup-zip',
      label: 'Backup with history (.zip)',
      icon: <HardDriveDownload className="size-4" />,
      separatorBefore: true,
      run: () => void runExport('backup-zip', docs, scope),
    },
    {
      key: 'backup-folder',
      label: 'Backup with history to a folder…',
      icon: <FolderDown className="size-4" />,
      hint: folders ? undefined : isBrave() ? 'off in Brave' : 'not in this browser',
      run: () => (folders ? void runExport('backup-folder', docs, scope) : explainNoFolders()),
    },
  ];
}

/** Ask first, then compile the previews (it can take a while for many documents). */
export async function askMakePreviews(docs: DocMeta[], all = false) {
  if (usePreviewJob.getState().running) {
    toast.info('Already making previews.');
    return;
  }
  const todo = all ? docs : await docsNeedingPreview(docs);
  if (!todo.length) {
    toast.success(docs.length ? 'Every preview here is up to date.' : 'There are no documents here.');
    return;
  }
  const n = todo.length;
  const ok = await confirmAction({
    title: all ? `Recompile ${n} preview${n === 1 ? '' : 's'}?` : `Make ${n} preview${n === 1 ? '' : 's'}?`,
    body: (
      <>
        <p>
          texChef compiles {n === 1 ? `“${todo[0].name}”` : `these ${n} documents one after another`} so the map shows {n === 1 ? 'its' : 'their'} first page.
          {n > 1 && ' That takes a few seconds per document.'}
        </p>
        <p className="text-muted">You can keep working meanwhile, and stop it from the progress button next to the folder path. Nothing in the documents changes.</p>
      </>
    ),
    ok: all ? 'Recompile' : 'Make previews',
  });
  if (ok) await makePreviews(todo, { all: true });
}

/** "Make previews" entries for menus. */
export function previewActions(docs: DocMeta[]): MenuAction[] {
  return [
    { key: 'previews', label: 'Make missing previews…', icon: <Images className="size-4" />, run: () => void askMakePreviews(docs) },
    { key: 'previews-all', label: 'Recompile all previews…', icon: <RefreshCw className="size-4" />, run: () => void askMakePreviews(docs, true) },
  ];
}
