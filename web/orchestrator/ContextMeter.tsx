import type { ContextUsage } from '../../src/shared/DashboardContract.ts';
import { ContextUsageUtil }  from './ContextUsageUtil.ts';

interface ContextMeterProperties {
  context:  ContextUsage | null;
  compact?: boolean;
}

const FULLNESS_PALETTE = {
  roomy: 'reviewed', filling: 'in-progress', critical: 'in-progress', unknown: 'pending'
} as const;
const PERCENT = 100;

/** Tokens used over the model's window as a bar and a share; a window not known shows the count alone, the bar empty. */
export function ContextMeter({ context, compact = false }: ContextMeterProperties) {
  const caption = ContextUsageUtil.captionOf(context);
  const fullness = ContextUsageUtil.fullnessOf(context);
  const share = context === null ? null : ContextUsageUtil.shareOf(context);
  return (
    <span className="ap-context-meter" data-compact={compact} role="img" aria-label={`Context ${caption}`} title={context?.model ?? caption}>
      <span className="ap-context-bar" data-state={FULLNESS_PALETTE[fullness]} data-fullness={fullness}>
        <span style={{ width: `${String((share ?? 0) * PERCENT)}%` }} />
      </span>
      <span className="mono muted ap-context-caption">{caption}</span>
    </span>
  );
}
