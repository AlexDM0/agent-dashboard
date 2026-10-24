/**
 * The transferring card as static markup in each phase, and the session card handing over to it. The cases that matter:
 * transferring dials five dots and says it is moving; opened says the session lives in the app; failed shows the
 * refusal as an alert with a Dismiss; and a session card whose session ended mid-transfer renders the transfer rather
 * than its ended branch, while a refusal before the stop keeps the live card with the refusal and a Dismiss.
 */
import { expect, test }         from 'bun:test';
import { createElement }        from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { OrchestratorState }  from '../../src/shared/DashboardContract.ts';
import { orchestratorSessionWith } from '../testing/SnapshotFixtures.ts';
import { SessionCard }             from './SessionCard.tsx';
import type { SessionTransfer }    from './SessionTransferUtil.ts';
import { TransferringCard }        from './TransferringCard.tsx';

function transferWith(phase: SessionTransfer['phase'], refusal: string | null = null): SessionTransfer {
  return { session: orchestratorSessionWith({ state: 'idle' }), phase, refusal };
}

function transferMarkupOf(transfer: SessionTransfer): string {
  return renderToStaticMarkup(createElement(TransferringCard, { role: 'orchestrator', transfer, onDismiss: () => undefined }));
}

function cardMarkupOf(state: OrchestratorState, transfer: SessionTransfer): string {
  const session = orchestratorSessionWith({ state });
  return renderToStaticMarkup(createElement(SessionCard, {
    role: 'orchestrator', trackerId: 'example-tracker', session, transfer, onOpenInApp: () => Promise.resolve(true)
  }));
}

test('a transferring card dials five dots and says it is moving to the Claude app', () => {
  const markup = transferMarkupOf(transferWith('transferring'));
  expect(markup).toContain('data-phase="transferring"');
  expect(markup.match(/<span><\/span>/g)?.length).toBe(5);
  expect(markup).toContain('Moving to the Claude app…');
});

test('an opened card says the session lives in the Claude app now', () => {
  const markup = transferMarkupOf(transferWith('opened'));
  expect(markup).toContain('data-phase="opened"');
  expect(markup).toContain('The session lives in the Claude app now.');
});

test('a failed card shows the refusal as an alert with a Dismiss and the broken line', () => {
  const markup = transferMarkupOf(transferWith('failed', 'claude exited 1, "Claude desktop is not installed"'));
  expect(markup).toContain('role="alert">claude exited 1, &quot;Claude desktop is not installed&quot;</span>');
  expect(markup).toContain('>Dismiss</button>');
  expect(markup).toContain('ap-transfer-severed');
});

test('a session card whose session ended mid-transfer renders the transfer, not its ended branch', () => {
  const markup = cardMarkupOf('ended', transferWith('transferring'));
  expect(markup).toContain('ap-transfer');
  expect(markup).toContain('Moving to the Claude app…');
  expect(markup).not.toContain('ap-chat-input');
});

test('a session card refused after the stop keeps the refusal in place until dismissed', () => {
  const markup = cardMarkupOf('ended', transferWith('failed', 'claude exited 1'));
  expect(markup).toContain('role="alert">claude exited 1</span>');
  expect(markup).toContain('>Dismiss</button>');
});

test('a session card refused before the stop stays the live card, the refusal and a Dismiss beside its menu', () => {
  const markup = cardMarkupOf('idle', transferWith('failed', 'No claude is resolved'));
  expect(markup).not.toContain('ap-transfer');
  expect(markup).toContain('Orchestrator menu');
  expect(markup).toContain('role="alert">No claude is resolved</span>');
  expect(markup).toContain('>Dismiss</button>');
});
