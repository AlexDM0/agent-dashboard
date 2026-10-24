/**
 * A dashboard-owned session card read as static markup while its snapshot says stopping: the badge says stopping, the
 * composer is disabled and says "Stopping…", the menu is not offered and no question form shows, so nothing can be sent
 * to a session being cut short; a waiting one still offers the menu, its question and an open composer.
 */
import { expect, test }         from 'bun:test';
import { createElement }        from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { OrchestratorState }                       from '../../src/shared/DashboardContract.ts';
import { orchestratorSessionWith, pendingQuestionWith } from '../testing/SnapshotFixtures.ts';
import { SessionCard }                                  from './SessionCard.tsx';

function cardMarkupOf(state: OrchestratorState): string {
  const session = orchestratorSessionWith({ state, pendingQuestions: [pendingQuestionWith('request-example', '2026-10-21T09:00:00+02:00')] });
  return renderToStaticMarkup(createElement(SessionCard, {
    role: 'orchestrator', trackerId: 'example-tracker', session, onOpenInApp: () => Promise.resolve(true)
  }));
}

test('a stopping card says stopping, disables the composer with "Stopping…" and offers neither the menu nor the question', () => {
  const markup = cardMarkupOf('stopping');
  expect(markup).toContain('data-state="paused">stopping</span>');
  expect(markup).toMatch(/<textarea[^>]*placeholder="Stopping…"[^>]*disabled=""/);
  expect(markup).not.toContain('Orchestrator menu');
  expect(markup).not.toContain('Example question request-example');
});

test('a waiting card offers the menu, its question and an open composer', () => {
  const markup = cardMarkupOf('waiting-for-answer');
  expect(markup).toContain('Orchestrator menu');
  expect(markup).toContain('Example question request-example');
  expect(markup).not.toMatch(/<textarea[^>]*disabled=""/);
});
