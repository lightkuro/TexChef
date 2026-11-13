import type { ReactElement } from 'react';
import { FilePlus2, Upload } from 'lucide-react';
import { ActionDropdown, type MenuAction } from '@/components/ActionMenu';
import { usePhone } from '@/lib/useMediaQuery';

/**
 * What a Start writing or New document button on the landing page opens: start from a template, or bring a
 * document you already have. `upload` is either one action or the ways to upload (shown as a submenu).
 */
export function StartMenu({ onNew, upload, align = 'start', children }: { onNew: () => void; upload: MenuAction[] | (() => void); align?: 'start' | 'end'; children: ReactElement }) {
  const many = Array.isArray(upload) && upload.length > 1;
  // Phones: a submenu would open off the side of the screen, so the ways to upload are listed right below.
  const phone = usePhone();
  const create: MenuAction = { key: 'new', label: 'Create a new document', hint: phone ? undefined : 'from a template', icon: <FilePlus2 className="size-4" />, run: onNew, testId: 'start-new' };
  const actions: MenuAction[] = phone && many
    ? [create, ...(upload as MenuAction[]).map((a, i) => ({ ...a, hint: undefined, separatorBefore: i === 0, groupLabel: i === 0 ? 'Upload a document' : undefined, testId: i === 0 ? 'start-upload' : a.testId }))]
    : [
    create,
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
