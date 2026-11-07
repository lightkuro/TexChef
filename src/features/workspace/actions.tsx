import { toast } from 'sonner';
import { FileArchive, FileText, FolderDown, HardDriveDownload, Images, RefreshCw } from 'lucide-react';
import type { DocMeta } from '@/core/model';
import type { MenuAction } from '@/components/ActionMenu';
import { backupFiles, backupName, canWriteFolders, downloadZip, pdfFiles, saveToFolder, sourceFiles } from './backup';
import { makePreviews } from './previews';

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
      disabled: !folders,
      hint: folders ? undefined : 'Chrome or Edge',
      run: () => void runExport('backup-folder', docs, scope),
    },
  ];
}

/** "Make previews" entries for menus. */
export function previewActions(docs: DocMeta[]): MenuAction[] {
  return [
    { key: 'previews', label: 'Make missing previews', icon: <Images className="size-4" />, run: () => void makePreviews(docs) },
    { key: 'previews-all', label: 'Recompile all previews', icon: <RefreshCw className="size-4" />, run: () => void makePreviews(docs, { all: true }) },
  ];
}
