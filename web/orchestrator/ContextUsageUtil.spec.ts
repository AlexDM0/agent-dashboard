/**
 * The context meter's numbers: the share against a known window (clamped, so an over-full turn never draws past the
 * bar), the token count alone for a watched session whose window is unknown, the compact token words, and the
 * thresholds at which the meter changes colour.
 */
import { expect, test }      from 'bun:test';
import type { ContextUsage } from '../../src/shared/DashboardContract.ts';
import { ContextUsageUtil }  from './ContextUsageUtil.ts';

function contextWith(usedTokens: number, contextWindowTokens: number | null): ContextUsage {
  return {
    usedTokens, contextWindowTokens, model: 'claude-example', measuredAt: '2026-10-21T10:00:00+02:00'
  };
}

test('a known window reads as a rounded share of the window in thousands', () => {
  expect(ContextUsageUtil.captionOf(contextWith(124_000, 200_000))).toBe('62% of 200k');
});

test('an unknown window reads as the token count alone', () => {
  expect(ContextUsageUtil.captionOf(contextWith(48_400, null))).toBe('48k tokens');
  expect(ContextUsageUtil.shareOf(contextWith(48_400, null))).toBeNull();
});

test('no usage reads as context unknown', () => {
  expect(ContextUsageUtil.captionOf(null)).toBe('context unknown');
  expect(ContextUsageUtil.fullnessOf(null)).toBe('unknown');
});

test('the share is clamped to the whole bar', () => {
  expect(ContextUsageUtil.shareOf(contextWith(250_000, 200_000))).toBe(1);
  expect(ContextUsageUtil.shareOf(contextWith(0, 200_000))).toBe(0);
});

test('a handoff is suggested at and past 80% of a known window, never below it or for an unknown one', () => {
  expect(ContextUsageUtil.suggestsHandoff(contextWith(159_999, 200_000))).toBe(false);
  expect(ContextUsageUtil.suggestsHandoff(contextWith(160_000, 200_000))).toBe(true);
  expect(ContextUsageUtil.suggestsHandoff(contextWith(900_000, null))).toBe(false);
  expect(ContextUsageUtil.suggestsHandoff(null)).toBe(false);
});

test('a zero window is unknown rather than a division by zero', () => {
  expect(ContextUsageUtil.shareOf(contextWith(10, 0))).toBeNull();
});

test('token counts read in units, thousands and millions', () => {
  expect(ContextUsageUtil.tokenCountText(950)).toBe('950');
  expect(ContextUsageUtil.tokenCountText(200_000)).toBe('200k');
  expect(ContextUsageUtil.tokenCountText(1_000_000)).toBe('1M');
  expect(ContextUsageUtil.tokenCountText(1_250_000)).toBe('1.3M');
});

test('the meter is roomy under half, filling from half and critical from four fifths', () => {
  expect(ContextUsageUtil.fullnessOf(contextWith(99_999, 200_000))).toBe('roomy');
  expect(ContextUsageUtil.fullnessOf(contextWith(100_000, 200_000))).toBe('filling');
  expect(ContextUsageUtil.fullnessOf(contextWith(160_000, 200_000))).toBe('critical');
  expect(ContextUsageUtil.fullnessOf(contextWith(160_000, null))).toBe('unknown');
});
