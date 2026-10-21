import { WEB_LIMITS } from '../constants/WebLimits.ts';

export type ConcurrencyStep = 'raise' | 'lower';

/** The limit one step from the shown one, or null when that step would leave the CLI's bounds. */
export function steppedConcurrencyLimitOf(shownLimit: number, step: ConcurrencyStep): number | null {
  const steppedLimit = step === 'raise' ? shownLimit + 1 : shownLimit - 1;
  return steppedLimit >= WEB_LIMITS.MINIMUM_CONCURRENCY_LIMIT && steppedLimit <= WEB_LIMITS.MAXIMUM_CONCURRENCY_LIMIT
    ? steppedLimit
    : null;
}
