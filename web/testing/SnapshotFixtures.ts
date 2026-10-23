import type {
  BoardSummary,
  DashboardSnapshot,
  OrchestratorSession,
  PendingQuestion,
  ProjectHealth,
  ProjectSnapshot
} from '../../src/shared/DashboardContract.ts';

export function orchestratorSessionWith(overrides: Partial<OrchestratorSession> = {}): OrchestratorSession {
  return {
    ownership:         'dashboard',
    sessionId:         'session-example',
    pid:               4242,
    name:              null,
    state:             'idle',
    startedAt:         '2026-10-21T09:30:00+02:00',
    context:           null,
    pendingQuestions:  [],
    lastAction:        null,
    previousSessionId: null,
    ...overrides,
  };
}

export function pendingQuestionWith(requestId: string, askedAt: string): PendingQuestion {
  return {
    requestId,
    askedAt,
    questions: [{
      question: `Example question ${requestId}?`, header: '', multiSelect: false, options: [{ label: 'Yes', description: '' }]
    }],
    context: { dispatcherRunId: null, mentionedTicketIds: [], lastAssistantLine: null },
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
    productOwner:  null,
    ...overrides,
  };
}

function activeProjectWith(project: string, board: Partial<BoardSummary>, orchestrator: OrchestratorSession | null): ProjectSnapshot {
  return projectSnapshotWith(project, { health: { kind: 'ready', board: boardSummaryWith({ dispatcherState: 'running', ...board }) }, orchestrator });
}

/** A board-view fleet: four active projects, each with a session in another state, one watched, and two idle ones. */
export function fleetSnapshotWith(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  const context = {
    usedTokens: 124_000, contextWindowTokens: 200_000, model: 'example-model', measuredAt: '2026-10-21T10:00:00+02:00'
  };
  const lastAction = { at: '2026-10-21T09:58:00+02:00', text: 'Started a builder on #042' };
  const lowPriorityWaitingTickets = [{ ticketId: '012', title: 'Example low-priority tidy-up' }, { ticketId: '014', title: 'Example copy fix' }];
  const projects = [
    activeProjectWith('example-storefront', { agentsInFlight: 2, freeSlots: 0, lowPriorityWaitingTickets }, orchestratorSessionWith({ state: 'busy', context, lastAction })),
    activeProjectWith('example-invoice-service-with-a-long-name', { agentsInFlight: 1, freeSlots: 1 }, orchestratorSessionWith({
      state: 'waiting-for-answer', context, lastAction, pendingQuestions: [pendingQuestionWith('request-one', '2026-10-21T09:59:00+02:00')]
    })),
    activeProjectWith('example-agency-site', { agentsInFlight: 0, freeSlots: 2 }, orchestratorSessionWith({ state: 'idle', lastAction })),
    activeProjectWith('example-mobile-app', { agentsInFlight: 1, freeSlots: 1 }, null),
    projectSnapshotWith('example-archive'),
    projectSnapshotWith('example-notes', { health: { kind: 'ready', board: boardSummaryWith({ dispatcherState: 'stopped' }) } }),
  ];
  const watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]> = Object.fromEntries(projects.map((project) => [project.trackerId, []]));
  watchedOrchestratorsByTracker['tracker-example-mobile-app'] = [orchestratorSessionWith({
    ownership: 'watched', sessionId: 'watched-example', name: 'Alex Example desktop', state: 'busy'
  })];
  return {
    registry:                  { kind: 'ready' },
    registryPath:              '/Users/alex.example/.agent-progress-monitor/projects.json',
    projects,
    generatedAt:               '2026-10-21T10:00:00+02:00',
    machineParallelAgentLimit: 8,
    boardOrigin:               'http://127.0.0.1:4851',
    boardBridgeUrl:            'http://127.0.0.1:4851/bridge',
    watchedOrchestratorsByTracker,
    ...overrides,
  };
}
