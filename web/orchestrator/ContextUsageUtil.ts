import type { ContextUsage } from '../../src/shared/DashboardContract.ts';
import { WEB_LIMITS }        from '../constants/WebLimits.ts';

/** How full a context is, in the meter's words: the `[data-state]` it is drawn in, or `critical` for the error colour. */
export type ContextFullness = 'roomy' | 'filling' | 'critical' | 'unknown';

const TOKENS_PER_THOUSAND = 1000;
const TOKENS_PER_MILLION = 1_000_000;
const TOKENS_PER_TENTH_MILLION = 100_000;
const TENTHS_PER_UNIT = 10;
const PERCENT = 100;

function tokenCountText(tokens: number): string {
  if (tokens >= TOKENS_PER_MILLION) return `${String(Math.round(tokens / TOKENS_PER_TENTH_MILLION) / TENTHS_PER_UNIT)}M`;
  if (tokens >= TOKENS_PER_THOUSAND) return `${String(Math.round(tokens / TOKENS_PER_THOUSAND))}k`;
  return String(tokens);
}

/** The share of the window used, clamped to 0..1; null when the window is not known. */
function shareOf(context: ContextUsage): number | null {
  if (context.contextWindowTokens === null || context.contextWindowTokens <= 0) return null;
  return Math.min(1, Math.max(0, context.usedTokens / context.contextWindowTokens));
}

function captionOf(context: ContextUsage | null): string {
  if (context === null) return 'context unknown';
  const share = shareOf(context);
  if (share === null || context.contextWindowTokens === null) return `${tokenCountText(context.usedTokens)} tokens`;
  return `${String(Math.round(share * PERCENT))}% of ${tokenCountText(context.contextWindowTokens)}`;
}

function fullnessOf(context: ContextUsage | null): ContextFullness {
  const share = context === null ? null : shareOf(context);
  if (share === null) return 'unknown';
  if (share >= WEB_LIMITS.CONTEXT_CRITICAL_SHARE) return 'critical';
  return share >= WEB_LIMITS.CONTEXT_WARNING_SHARE ? 'filling' : 'roomy';
}

export const ContextUsageUtil = Object.freeze({
  tokenCountText, shareOf, captionOf, fullnessOf
});
