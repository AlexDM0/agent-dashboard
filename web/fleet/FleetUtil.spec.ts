/**
 * The Fleet view's decisions: rows in the overview's order; Running keeps a dispatcher that runs and Needs you a
 * pending question or a critical context, never a watched session's; the cards follow the inbox's order, then add a
 * hand-off per critical dashboard-owned session; the queue shows ready always and the quiet counts only when non-zero.
 */
import { describe, expect, test }                                  from 'bun:test';
import type { ContextUsage, OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { InboxUtil }                                               from '../inbox/InboxUtil.ts';
import {
  boardSummaryWith,
  fleetSnapshotWith,
  orchestratorSessionWith,
  pendingQuestionWith,
  projectSnapshotWith
} from '../testing/SnapshotFixtures.ts';
import { FleetUtil } from './FleetUtil.ts';

const criticalContext: ContextUsage = {
  usedTokens: 170_000, contextWindowTokens: 200_000, model: 'example-model', measuredAt: '2026-10-21T10:00:00+02:00'
};

/** A project whose dashboard-owned session waits on one question, `request-<project>`, asked at `askedAt`. */
function askingProjectWith(project: string, askedAt: string, sessionOverrides: Partial<OrchestratorSession> = {}): ProjectSnapshot {
  const pendingQuestions = [pendingQuestionWith(`request-${project}`, askedAt)];
  return projectSnapshotWith(project, { orchestrator: orchestratorSessionWith({ state: 'waiting-for-answer', pendingQuestions, ...sessionOverrides }) });
}

function namesOf(projects: { project: string }[]): string[] {
  return projects.map((project) => project.project);
}

describe('rowsOf', () => {
  const { projects } = fleetSnapshotWith();

  test('All keeps every project in the overview order, active ones first', () => {
    expect(namesOf(FleetUtil.rowsOf(projects, 'all'))).toEqual([
      'example-agency-site', 'example-invoice-service-with-a-long-name', 'example-mobile-app', 'example-storefront', 'example-archive', 'example-notes'
    ]);
  });

  test('Running keeps only the projects whose dispatcher runs', () => {
    expect(namesOf(FleetUtil.rowsOf(projects, 'running'))).toEqual([
      'example-agency-site', 'example-invoice-service-with-a-long-name', 'example-mobile-app', 'example-storefront'
    ]);
  });

  test('Needs you keeps a pending question and a critical context, and nothing else', () => {
    expect(namesOf(FleetUtil.rowsOf(projects, 'needs-you'))).toEqual(['example-agency-site', 'example-invoice-service-with-a-long-name']);
  });

  test('a watched session past the critical share and an ended session with a question need nobody', () => {
    const watchedOnly = projectSnapshotWith('example-watched');
    const ended = askingProjectWith('example-ended', '2026-10-21T09:00:00+02:00', { state: 'ended', context: criticalContext });
    expect(FleetUtil.rowsOf([watchedOnly, ended], 'needs-you')).toEqual([]);
  });
});

describe('attentionCardsOf', () => {
  test('question cards follow the inbox order, then a hand-off card per critical session', () => {
    const later = askingProjectWith('example-later', '2026-10-21T09:50:00+02:00');
    const earlier = askingProjectWith('example-earlier', '2026-10-21T09:10:00+02:00', { context: criticalContext });
    const projects = [later, earlier];
    const cards = FleetUtil.attentionCardsOf(InboxUtil.entriesOf(projects), projects);
    expect(cards).toEqual([
      {
        kind:      'question',
        trackerId: 'tracker-example-earlier',
        project:   'example-earlier',
        role:      'orchestrator',
        requestId: 'request-example-earlier',
        firstLine: 'Example question request-example-earlier?',
        askedAt:   '2026-10-21T09:10:00+02:00',
      },
      {
        kind:      'question',
        trackerId: 'tracker-example-later',
        project:   'example-later',
        role:      'orchestrator',
        requestId: 'request-example-later',
        firstLine: 'Example question request-example-later?',
        askedAt:   '2026-10-21T09:50:00+02:00',
      },
      {
        kind: 'handoff', trackerId: 'tracker-example-earlier', project: 'example-earlier', contextCaption: '85% of 200k', measuredAt: '2026-10-21T10:00:00+02:00'
      },
    ]);
  });

  test('a question card carries only the first line of a question', () => {
    const pendingQuestion = { ...pendingQuestionWith('request-long', '2026-10-21T09:10:00+02:00') };
    pendingQuestion.questions = [{
      question: 'Which build first?\nThe rest explains.', header: '', multiSelect: false, options: []
    }];
    const project = projectSnapshotWith('example-long', { orchestrator: orchestratorSessionWith({ state: 'waiting-for-answer', pendingQuestions: [pendingQuestion] }) });
    const [card] = FleetUtil.attentionCardsOf(InboxUtil.entriesOf([project]), [project]);
    expect(card?.kind === 'question' ? card.firstLine : null).toBe('Which build first?');
  });

  test('a context below the critical share or of an unknown window adds no card', () => {
    const roomy = projectSnapshotWith('example-roomy', { orchestrator: orchestratorSessionWith({ context: { ...criticalContext, usedTokens: 100_000 } }) });
    const unknownWindow = projectSnapshotWith('example-unknown', { orchestrator: orchestratorSessionWith({ context: { ...criticalContext, contextWindowTokens: null } }) });
    expect(FleetUtil.attentionCardsOf([], [roomy, unknownWindow])).toEqual([]);
  });
});

describe('queueSummaryOf', () => {
  test('ready always, then low, review and held only when non-zero', () => {
    const board = boardSummaryWith({
      readyTicketIds: [], reviewWaitingTicketIds: ['040', '041'], heldTicketIds: [], lowPriorityWaitingTickets: [{ ticketId: '012', title: 'Example tidy-up' }]
    });
    expect(FleetUtil.queueSummaryOf(board)).toEqual({ readyCount: 0, quietParts: ['1 low', '2 review'] });
  });
});
