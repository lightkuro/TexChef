import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import type { Diagnostic } from '@/compile/logParser';
import type { CompileOutput } from '@/compile/compiler';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';

export function ProblemsPanel({
  output,
  onJump,
}: {
  output?: CompileOutput;
  onJump: (d: Diagnostic) => void;
}) {
  const [open, setOpen] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const diags = output?.diagnostics ?? [];
  const errors = diags.filter((d) => d.severity === 'error');
  const warnings = diags.filter((d) => d.severity === 'warning');
  const visible = diags.filter((d) => showInfo || d.severity !== 'info');
  if (!output) return null;

  return (
    <div className="flex max-h-[45%] shrink-0 flex-col border-t border-line bg-panel" data-testid="problems">
      <div className="flex h-8 shrink-0 items-center gap-2 px-2 text-xs">
        <button className="flex items-center gap-1 font-medium" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          Problems
        </button>
        {errors.length > 0 && <Badge tone="danger">{errors.length} error{errors.length > 1 ? 's' : ''}</Badge>}
        {warnings.length > 0 && <Badge tone="warn">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</Badge>}
        {errors.length === 0 && warnings.length === 0 && <Badge tone="ok">No problems</Badge>}
        <span className="text-muted">{output.durationMs ? `${(output.durationMs / 1000).toFixed(1)}s` : ''}</span>
        <div className="flex-1" />
        <label className="flex items-center gap-1 text-muted">
          <input type="checkbox" checked={showInfo} onChange={(e) => setShowInfo(e.target.checked)} /> Bad boxes
        </label>
        <button className={cn('flex items-center gap-1 text-muted hover:text-fg', showLog && 'text-fg')} onClick={() => setShowLog(!showLog)}>
          <ScrollText className="size-3.5" /> Raw log
        </button>
      </div>
      {open && (
        <div className="min-h-0 overflow-auto border-t border-line">
          {showLog ? (
            <pre className="p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap text-muted">{output.log || '(empty log)'}</pre>
          ) : visible.length === 0 ? (
            <div className="p-3 text-xs text-muted">Compiled cleanly.</div>
          ) : (
            <ul>
              {visible.map((d, i) => (
                <li key={i}>
                  <button
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-subtle"
                    onClick={() => onJump(d)}
                  >
                    {d.severity === 'error' ? (
                      <AlertCircle className="mt-px size-3.5 shrink-0 text-danger" />
                    ) : d.severity === 'warning' ? (
                      <AlertTriangle className="mt-px size-3.5 shrink-0 text-warn" />
                    ) : (
                      <Info className="mt-px size-3.5 shrink-0 text-info" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="break-words">{d.message}</span>
                      {d.hint && <span className="mt-0.5 block text-muted">{d.hint}</span>}
                    </span>
                    {d.line && (
                      <span className="shrink-0 font-mono text-muted">
                        {d.file ?? ''}:{d.line}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
