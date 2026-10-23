/**
 * What the orchestrator menu shows: Refresh orchestrator then Stop, each with a one-sentence explanation and a
 * question to confirm, and at the critical context share alone the toggle's warning dot and the Refresh highlight.
 */
import { expect, test }         from 'bun:test';
import type { ContextUsage }    from '../../src/shared/DashboardContract.ts';
import { OrchestratorMenuUtil } from './OrchestratorMenuUtil.ts';

function contextWith(usedTokens: number, contextWindowTokens: number | null): ContextUsage {
  return {
    usedTokens, contextWindowTokens, model: 'claude-example', measuredAt: '2026-10-21T10:00:00+02:00'
  };
}

const BELOW_CRITICAL = contextWith(159_999, 200_000);
const AT_CRITICAL = contextWith(160_000, 200_000);

test('the menu holds Refresh orchestrator then Stop, each explained in one sentence and confirmed by a question', () => {
  const entries = OrchestratorMenuUtil.entriesOf(BELOW_CRITICAL);
  expect(entries.map((entry) => entry.label)).toEqual(['Refresh orchestrator', 'Stop']);
  for (const entry of entries) {
    expect(entry.description).toMatch(/^[A-Z][^.]*\.$/);
    expect(entry.question).toContain('?');
  }
  expect(entries[1]?.question).toBe('Stop this orchestrator?');
});

test('at the critical share the toggle carries the warning dot and Refresh is highlighted', () => {
  expect(OrchestratorMenuUtil.hasWarningOf(AT_CRITICAL)).toBe(true);
  expect(OrchestratorMenuUtil.entriesOf(AT_CRITICAL).map((entry) => entry.isHighlighted)).toEqual([true, false]);
});

test('below the critical share, or for an unknown context, neither the dot nor the highlight shows', () => {
  for (const context of [BELOW_CRITICAL, contextWith(900_000, null), null]) {
    expect(OrchestratorMenuUtil.hasWarningOf(context)).toBe(false);
    expect(OrchestratorMenuUtil.entriesOf(context).some((entry) => entry.isHighlighted)).toBe(false);
  }
});

test('no wording of the menu says hand off', () => {
  const words = OrchestratorMenuUtil.entriesOf(AT_CRITICAL).flatMap((entry) => [entry.label, entry.description, entry.question, entry.confirmLabel]);
  expect(words.filter((word) => /hand.?off|handing off/i.test(word))).toEqual([]);
});
