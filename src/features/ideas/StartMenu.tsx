import type { ReactElement } from 'react';
import { FilePlus2, Upload } from 'lucide-react';
import { ActionDropdown, type MenuAction } from '@/components/ActionMenu';

/**
 * What a Start writing or New document button on the landing page opens: start from a template, or bring a
 * document you already have. `upload` is either one action or the ways to upload (shown as a submenu).
 */
export function StartMenu({ onNew, upload, align = 'start', children }: { onNew: () => void; upload: MenuAction[] | (() => void); align?: 'start' | 'end'; children: ReactElement }) {
  const many = Array.isArray(upload) && upload.length > 1;
  const actions: MenuAction[] = [
    { key: 'new', label: 'Create a new document', hint: 'from a template', icon: <FilePlus2 className="size-4" />, run: onNew, testId: 'start-new' },
    {
      key: 'upload',
      label: 'Upload a document',
      hint: many ? undefined : '.tex or .zip',
      icon: <Upload className="size-4" />,
      testId: 'start-upload',
      ...(many ? { sub: upload } : { run: Array.isArray(upload) ? upload[0]?.run : upload }),
    },
  ];
  return <ActionDropdown align={align} actions={actions} trigger={children} />;
}
