import type {
  BoardSummary,
  OrchestratorSession,
  ProjectHealth,
  ProjectSnapshot
} from '../../src/shared/DashboardContract.ts';

export function orchestratorSessionWith(overrides: Partial<OrchestratorSession> = {}): OrchestratorSession {
  return {
    ownership:        'dashboard',
    sessionId:        'session-example',
    pid:              4242,
    name:             null,
    state:            'idle',
    startedAt:        '2026-10-21T09:30:00+02:00',
    context:          null,
    pendingQuestions: [],
    ...overrides,
  };
}

export function boardSummaryWith(overrides: Partial<BoardSummary> = {}): BoardSummary {
  return {
    dispatcherState:     'finished',
    concurrencyLimit:    2,
    agentsInFlight:      0,
    freeSlots:           2,
    ticketCountByStatus: {
      'pending': 0, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 0, 'abandoned': 0
    },
    ticketTotal:               0,
    activeRows:                [],
    readyTicketIds:            [],
    heldTicketIds:             [],
    reviewWaitingTicketIds:    [],
    pausedBuildCount:          0,
    recentLog:                 [],
    tokensTotal:               0,
    dispatcherRunId:           null,
    lowPriorityWaitingTickets: [],
    ...overrides,
  };
}

export function projectSnapshotWith(project: string, overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  const health: ProjectHealth = { kind: 'ready', board: boardSummaryWith() };
  return {
    trackerId:     `tracker-${project}`,
    project,
    root:          `/Users/alex.example/development/${project}`,
    gitOrigin:     `git@example.invalid:example/${project}.git`,
    registeredAt:  '2026-10-20T09:00:00+02:00',
    lastChangedAt: '2026-10-21T10:00:00+02:00',
    lastCommand:   'ticket start',
    pageAvailable: true,
    pageUrl:       `/projects/tracker-${project}/page/progress.html`,
    readAt:        '2026-10-21T10:00:01+02:00',
    health,
    orchestrator:  null,
    ...overrides,
  };
}
