import { Bot } from 'lucide-react';
import { usePrefs } from '@/app/prefs';
import { Button, Tip } from '@/components/ui';
import { useAgentReplyCount, useAgentsDialog } from './agents';

/**
 * Opens "AI updates" (replies from AI agents). Shown only while Settings → Experimental → AI agents is on,
 * with the number of replies waiting for review.
 */
export function AgentsButton({ label, beforeOpen }: { label?: boolean; beforeOpen?: () => Promise<unknown> | void }) {
  const enabled = usePrefs((s) => s.agentsEnabled);
  const open = useAgentsDialog((s) => s.set);
  const waiting = useAgentReplyCount();
  if (!enabled) return null;
  return (
    <Tip content={waiting ? `${waiting} ${waiting === 1 ? 'reply' : 'replies'} from AI agents to review` : 'Updates from AI agents (experimental)'}>
      <Button
        variant="outline"
        size={label ? undefined : 'icon'}
        className="relative"
        onClick={async () => {
          await beforeOpen?.();
          open(true);
        }}
        aria-label="AI updates"
        data-testid="agents-button"
      >
        <Bot className="size-4" />
        {label ? ' AI updates' : null}
        {waiting > 0 && (
          <span className={label ? 'ml-1 rounded-full bg-accent px-1.5 text-[11px] leading-4 font-semibold text-accent-fg' : 'absolute -top-1 -right-1 rounded-full bg-accent px-1 text-[10px] leading-4 font-semibold text-accent-fg'} data-testid="agents-count">
            {waiting}
          </span>
        )}
      </Button>
    </Tip>
  );
}
