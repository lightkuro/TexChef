import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A menu that opens below its button on hover (and on tap or keyboard focus), closing when the pointer
 * leaves, on Escape, or on a tap elsewhere.
 */
export function HoverMenu({
  trigger,
  children,
  align = 'end',
  className,
  menuClassName,
  testId,
  label,
}: {
  /** The button; `open` tells it whether the menu shows, `setOpen` lets a click open it (for touch). */
  trigger: (open: boolean, setOpen: (o: boolean) => void) => React.ReactNode;
  /** The menu's content; `close` closes it after a choice. */
  children: (close: () => void) => React.ReactNode;
  align?: 'start' | 'end';
  className?: string;
  menuClassName?: string;
  testId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = (delay = 180) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), delay);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div
      ref={box}
      className={cn('relative', className)}
      onMouseEnter={show}
      onMouseLeave={() => hide()}
      onFocus={show}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && hide(0)}
    >
      {trigger(open, setOpen)}
      {open && (
        // pt-1 bridges the gap so moving the pointer down into the menu keeps it open.
        <div className={cn('absolute top-full z-40 pt-1', align === 'end' ? 'right-0' : 'left-0')} data-testid={testId}>
          <div role="menu" aria-label={label} className={cn('min-w-56 rounded-lg border border-line bg-panel p-1 text-sm shadow-xl max-sm:max-w-[calc(100vw-1.5rem)]', menuClassName)}>
            {children(() => setOpen(false))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One entry of a HoverMenu: an icon (or a check when chosen), a label and an optional muted line. */
export function HoverMenuItem({
  icon,
  label,
  hint,
  checked,
  onSelect,
  testId,
  disabled,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  hint?: React.ReactNode;
  checked?: boolean;
  onSelect: () => void;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-subtle focus:bg-subtle focus:outline-none disabled:opacity-40 max-sm:py-2"
      data-testid={testId}
    >
      <span className="flex size-4 shrink-0 items-center justify-center pt-0.5 text-muted">{checked ? <Check className="size-4 text-accent" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-fg">{label}</span>
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </span>
    </button>
  );
}

export function HoverMenuSeparator() {
  return <div className="my-1 h-px bg-line" />;
}
