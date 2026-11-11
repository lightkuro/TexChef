import { useState, type ReactNode, type RefObject } from 'react';
import { Panel, usePanelRef, type PanelImperativeHandle } from 'react-resizable-panels';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Width of a folded panel: a slim rail with its icon and name. */
export const RAIL = 30;

/**
 * A resizable panel that folds into a slim rail when its edge is dragged past its minimum size
 * (or from a button, through `panelRef`). Clicking the rail opens it again at its last size.
 * The content stays mounted while folded, so an editor keeps its cursor and a PDF its scroll.
 */
export function CollapsiblePanel({
  id,
  label,
  icon: Icon,
  defaultSize,
  minSize,
  className,
  testId,
  panelRef,
  onCollapsedChange,
  children,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  defaultSize: string;
  minSize: string;
  className?: string;
  testId?: string;
  panelRef?: RefObject<PanelImperativeHandle | null>;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: ReactNode;
}) {
  const own = usePanelRef();
  const ref = panelRef ?? own;
  const [collapsed, setCollapsed] = useState(false);
  return (
    <Panel
      id={id}
      panelRef={ref}
      collapsible
      collapsedSize={`${RAIL}px`}
      defaultSize={defaultSize}
      minSize={minSize}
      className={cn('flex flex-col', className)}
      data-testid={testId}
      data-collapsed={collapsed || undefined}
      onResize={() => {
        const c = ref.current?.isCollapsed() ?? false;
        if (c !== collapsed) {
          setCollapsed(c);
          onCollapsedChange?.(c);
        }
      }}
    >
      {collapsed && (
        <button
          className="flex h-full w-full flex-col items-center gap-2 bg-panel pt-3 text-muted hover:bg-subtle hover:text-fg"
          onClick={() => {
            const p = ref.current;
            if (!p) return;
            p.expand();
            // Folded by dragging, a panel would reopen at its narrowest: give it its usual size back.
            if (p.getSize().asPercentage < parseFloat(defaultSize) * 0.75) p.resize(defaultSize);
          }}
          aria-label={`Show ${label}`}
          title={`Show ${label}`}
          data-testid={testId && `${testId}-rail`}
        >
          <Icon className="size-4 shrink-0" />
          <span className="text-xs font-medium [writing-mode:vertical-rl]">{label}</span>
        </button>
      )}
      <div className={cn('flex min-h-0 flex-1 flex-col', collapsed && 'hidden')}>{children}</div>
    </Panel>
  );
}

/** Saved panel sizes, per layout, in this browser (folded panels stay folded). */
export const layoutStorage = {
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};
