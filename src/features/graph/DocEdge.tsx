import { memo } from 'react';
import { useNavigate } from 'react-router';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, getStraightPath, type Edge, type EdgeProps } from '@xyflow/react';
import { GitPullRequestArrow } from 'lucide-react';

export type DocEdgeData = {
  /** Updates the variant (the target) can get from its original (the source). */
  updates: number;
  angled: boolean;
};

export type DocEdgeType = Edge<DocEdgeData, 'doc'>;

/** Distance (px) from the arrow tip back to the centre of the updates label, which sits on the line. */
const LABEL_BACK = 46;

/** A link from an original to its variant: straight or right-angled, with pending updates labelled by the arrow. */
export const DocEdge = memo(function DocEdge({ target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style }: EdgeProps<DocEdgeType>) {
  const navigate = useNavigate();
  const angled = !!data?.angled;
  // Right-angled lines bend nearer the original, leaving a long last stretch for the updates label.
  const [path] = angled
    ? getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8, centerX: sourceX + (targetX - sourceX) * 0.35 })
    : getStraightPath({ sourceX, sourceY, targetX, targetY });

  // Centre of the updates label: on the line, just before the arrow (right-angled lines arrive horizontally).
  let nearX = targetX - LABEL_BACK;
  let nearY = targetY;
  if (!angled) {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.hypot(dx, dy) || 1;
    const back = Math.min(LABEL_BACK, len / 2);
    nearX = targetX - (dx / len) * back;
    nearY = targetY - (dy / len) * back;
  }
  const updates = data?.updates ?? 0;

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        {updates > 0 && (
          <button
            className="nodrag nopan absolute flex items-center gap-1 rounded-full border border-warn/40 bg-warn-soft px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap text-warn shadow-sm hover:border-warn"
            style={{ transform: `translate(-50%, -50%) translate(${nearX}px, ${nearY}px)`, pointerEvents: 'all' }}
            onClick={() => navigate(`/doc/${target}/pull`)}
            title="Get these updates"
            data-testid={`edge-updates-${target}`}
          >
            <GitPullRequestArrow className="size-3" />
            {updates} update{updates === 1 ? '' : 's'}
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  );
});
