import * as React from 'react';
import { ContextMenu as CM, DropdownMenu as DM } from 'radix-ui';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** One entry of a menu: an action, a checkable option, or a submenu. */
export interface MenuAction {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  run?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  /** A small heading above this entry (after the separator), naming the group it starts. */
  groupLabel?: React.ReactNode;
  /** Shows a check mark (for options that are on). */
  checked?: boolean;
  /** Muted text on the right. */
  hint?: string;
  sub?: MenuAction[];
  testId?: string;
}

const itemClass =
  'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-subtle data-[state=open]:bg-subtle max-sm:py-2.5';
const contentClass = 'z-50 min-w-52 rounded-lg border border-line bg-panel p-1 text-sm shadow-xl';
const labelClass = 'truncate px-2 pt-1.5 pb-0.5 text-[11px] font-medium tracking-wide text-muted uppercase';

/** Menus are portaled, but React bubbles their events to whatever owns them; stop clicks here. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function Body({ a }: { a: MenuAction }) {
  return (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center">{a.checked ? <Check className="size-4 text-accent" /> : a.icon}</span>
      <span className="min-w-0 flex-1 truncate">{a.label}</span>
      {a.hint && <span className="text-[11px] text-muted">{a.hint}</span>}
    </>
  );
}

function contextItems(actions: MenuAction[]): React.ReactNode {
  return actions.map((a) => (
    <React.Fragment key={a.key}>
      {a.separatorBefore && <CM.Separator className="my-1 h-px bg-line" />}
      {a.groupLabel && <CM.Label className={labelClass}>{a.groupLabel}</CM.Label>}
      {a.sub ? (
        <CM.Sub>
          <CM.SubTrigger className={itemClass} disabled={a.disabled} data-testid={a.testId}>
            <Body a={a} />
            <ChevronRight className="size-3.5 text-muted" />
          </CM.SubTrigger>
          <CM.Portal>
            <CM.SubContent className={contentClass} sideOffset={4} onClick={stop}>
              {contextItems(a.sub)}
            </CM.SubContent>
          </CM.Portal>
        </CM.Sub>
      ) : (
        <CM.Item className={cn(itemClass, a.danger && 'text-danger')} disabled={a.disabled} onSelect={a.run} data-testid={a.testId}>
          <Body a={a} />
        </CM.Item>
      )}
    </React.Fragment>
  ));
}

function dropdownItems(actions: MenuAction[]): React.ReactNode {
  return actions.map((a) => (
    <React.Fragment key={a.key}>
      {a.separatorBefore && <DM.Separator className="my-1 h-px bg-line" />}
      {a.groupLabel && <DM.Label className={labelClass}>{a.groupLabel}</DM.Label>}
      {a.sub ? (
        <DM.Sub>
          <DM.SubTrigger className={itemClass} disabled={a.disabled} data-testid={a.testId}>
            <Body a={a} />
            <ChevronRight className="size-3.5 text-muted" />
          </DM.SubTrigger>
          <DM.Portal>
            <DM.SubContent className={contentClass} sideOffset={4} onClick={stop}>
              {dropdownItems(a.sub)}
            </DM.SubContent>
          </DM.Portal>
        </DM.Sub>
      ) : (
        <DM.Item className={cn(itemClass, a.danger && 'text-danger')} disabled={a.disabled} onSelect={a.run} data-testid={a.testId}>
          <Body a={a} />
        </DM.Item>
      )}
    </React.Fragment>
  ));
}

/** Right-click menu around `children` (the element that is right-clicked). */
export function ActionContextMenu({ actions, children, label }: { actions: MenuAction[] | (() => MenuAction[]); children: React.ReactElement; label?: React.ReactNode }) {
  const [list, setList] = React.useState<MenuAction[]>([]);
  return (
    <CM.Root onOpenChange={(o) => o && setList(typeof actions === 'function' ? actions() : actions)}>
      {/* A nested trigger handles its own right-click; don't let the one around it open too. */}
      <CM.Trigger asChild onContextMenu={stop}>
        {children}
      </CM.Trigger>
      <CM.Portal>
        <CM.Content className={contentClass} onClick={stop} onDoubleClick={stop}>
          {label && <CM.Label className="truncate px-2 py-1 text-[11px] font-medium tracking-wide text-muted uppercase">{label}</CM.Label>}
          {contextItems(list)}
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  );
}

/** Dropdown menu opened from `trigger`. */
export function ActionDropdown({ actions, trigger, align = 'end', label }: { actions: MenuAction[]; trigger: React.ReactElement; align?: 'start' | 'end'; label?: React.ReactNode }) {
  return (
    <DM.Root>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content className={contentClass} align={align} sideOffset={4} onClick={stop}>
          {label && <DM.Label className="truncate px-2 py-1 text-[11px] font-medium tracking-wide text-muted uppercase">{label}</DM.Label>}
          {dropdownItems(actions)}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
