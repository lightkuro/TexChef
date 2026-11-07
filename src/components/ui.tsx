import * as React from 'react';
import { Dialog as D, DropdownMenu as DM, Tooltip as T, Checkbox as C, Tabs as TB, ContextMenu as CM } from 'radix-ui';
import { Check, Minus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------- Button ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'icon' | 'icon-sm';

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>(function Button({ className, variant = 'secondary', size = 'md', type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'h-7 px-2.5 text-xs',
        size === 'md' && 'h-8 px-3 text-sm',
        size === 'icon' && 'size-8',
        size === 'icon-sm' && 'size-7',
        variant === 'primary' && 'bg-accent text-accent-fg hover:bg-accent-hover',
        variant === 'secondary' && 'bg-subtle text-fg hover:bg-line',
        variant === 'outline' && 'border border-line bg-panel text-fg hover:bg-subtle',
        variant === 'ghost' && 'text-fg hover:bg-subtle',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90',
        className,
      )}
      {...props}
    />
  );
});

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded-md border border-line bg-panel px-2.5 text-sm text-fg placeholder:text-muted',
        'focus:border-accent focus:outline-none',
        className,
      )}
      {...props}
    />
  );
});

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('h-8 rounded-md border border-line bg-panel px-2 text-sm text-fg focus:border-accent focus:outline-none', className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-subtle text-muted',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'ok' && 'bg-ok-soft text-ok',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'info' && 'bg-info-soft text-info',
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-subtle px-1 font-mono text-[10px] text-muted">{children}</kbd>;
}

// ---------- Tooltip ----------

export function Tip({ content, children, side = 'bottom' }: { content: React.ReactNode; children: React.ReactElement; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <T.Root delayDuration={350}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={5}
          className="z-50 max-w-xs rounded-md bg-fg px-2 py-1 text-xs text-bg shadow-lg"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export const TooltipProvider = T.Provider;

// ---------- Dialog ----------

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" />
        <D.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-xl border border-line bg-panel shadow-2xl focus:outline-none',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <D.Title className="text-base font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{String(title)}</D.Description>}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="size-4" />
              </Button>
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// ---------- Dropdown menu ----------

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({ children, align = 'end', className }: { children: React.ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={4}
        className={cn('z-50 min-w-48 rounded-lg border border-line bg-panel p-1 text-sm shadow-xl', className)}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

const itemClass =
  'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-subtle';

export function MenuItem({
  children,
  onSelect,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <DM.Item disabled={disabled} onSelect={onSelect} className={cn(itemClass, danger && 'text-danger')}>
      {children}
    </DM.Item>
  );
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <DM.Label className="px-2 py-1 text-[11px] font-medium tracking-wide text-muted uppercase">{children}</DM.Label>;
}

// ---------- Context menu (right click) ----------

export const ContextMenu = CM.Root;
export const ContextMenuTrigger = CM.Trigger;

export function ContextMenuContent({ children }: { children: React.ReactNode }) {
  return (
    <CM.Portal>
      <CM.Content className="z-50 min-w-48 rounded-lg border border-line bg-panel p-1 text-sm shadow-xl">{children}</CM.Content>
    </CM.Portal>
  );
}

export function ContextMenuItem({ children, onSelect, danger, disabled }: { children: React.ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <CM.Item disabled={disabled} onSelect={onSelect} className={cn(itemClass, danger && 'text-danger')}>
      {children}
    </CM.Item>
  );
}

export function ContextMenuSeparator() {
  return <CM.Separator className="my-1 h-px bg-line" />;
}

// ---------- Checkbox ----------

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...rest
}: {
  checked: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}) {
  return (
    <C.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={(c) => onCheckedChange?.(c === true)}
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded border border-line bg-panel',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg',
        'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent-soft data-[state=indeterminate]:text-accent',
        'disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      <C.Indicator>{checked === 'indeterminate' ? <Minus className="size-3" /> : <Check className="size-3" strokeWidth={3} />}</C.Indicator>
    </C.Root>
  );
}

// ---------- Tabs ----------

export const Tabs = TB.Root;
export const TabsContent = TB.Content;

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <TB.List className={cn('inline-flex items-center gap-0.5 rounded-lg bg-subtle p-0.5', className)}>{children}</TB.List>;
}

export function TabsTrigger({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  return (
    <TB.Trigger
      value={value}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted',
        'data-[state=active]:bg-panel data-[state=active]:text-fg data-[state=active]:shadow-sm',
        className,
      )}
    >
      {children}
    </TB.Trigger>
  );
}

export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      {icon ? <div className="text-muted">{icon}</div> : null}
      <div className="font-medium">{title}</div>
      {children ? <div className="max-w-sm text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />;
}
