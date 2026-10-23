import type {
  BoardSummary,
  ContextUsage,
  DashboardSnapshot,
  OrchestratorSession,
  PendingQuestion,
  ProjectHealth,
  ProjectSnapshot,
  QuestionContext
} from '../../src/shared/DashboardContract.ts';

const FIXTURE_BOARD_ORIGIN = 'http://127.0.0.1:4851';

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

export const EMPTY_QUESTION_CONTEXT: QuestionContext = { dispatcherRunId: null, mentionedTicketIds: [], lastAssistantLine: null };

export function pendingQuestionWith(requestId: string, askedAt: string, context: QuestionContext = EMPTY_QUESTION_CONTEXT): PendingQuestion {
  return {
    requestId,
    askedAt,
    questions: [{
      question: `Example question ${requestId}?`, header: '', multiSelect: false, options: [{ label: 'Yes', description: '' }]
    }],
    context,
  };
}

/** A context of `usedTokens` in a 100k window by default, so 84_000 is 84%. */
export function contextUsageWith(usedTokens: number, contextWindowTokens: number | null = 100_000): ContextUsage {
  return {
    usedTokens, contextWindowTokens, model: 'example-model', measuredAt: '2026-10-21T10:00:00+02:00'
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
    pageUrl:       `${FIXTURE_BOARD_ORIGIN}/projects/tracker-${project}/page/progress.html`,
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

/**
 * A board-view and Fleet fleet: four active projects, each with a session in another state (one watched, one past the
 * critical context share), a queue on two of them, and two idle ones.
 */
export function fleetSnapshotWith(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  const context = {
    usedTokens: 124_000, contextWindowTokens: 200_000, model: 'example-model', measuredAt: '2026-10-21T10:00:00+02:00'
  };
  const criticalContext = { ...context, usedTokens: 172_000 };
  const lastAction = { at: '2026-10-21T09:58:00+02:00', text: 'Started a builder on #042' };
  const lowPriorityWaitingTickets = [{ ticketId: '012', title: 'Example low-priority tidy-up' }, { ticketId: '014', title: 'Example copy fix' }];
  const projects = [
    activeProjectWith('example-storefront', {
      agentsInFlight: 2, freeSlots: 0, lowPriorityWaitingTickets, readyTicketIds: ['043'], heldTicketIds: ['047']
    }, orchestratorSessionWith({ state: 'busy', context, lastAction })),
    activeProjectWith('example-invoice-service-with-a-long-name', { agentsInFlight: 1, freeSlots: 1, reviewWaitingTicketIds: ['040'] }, orchestratorSessionWith({
      state: 'waiting-for-answer', context, lastAction, pendingQuestions: [pendingQuestionWith('request-one', '2026-10-21T09:59:00+02:00')]
    })),
    activeProjectWith('example-agency-site', { agentsInFlight: 0, freeSlots: 2 }, orchestratorSessionWith({ state: 'idle', context: criticalContext, lastAction })),
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
    boardOrigin:               FIXTURE_BOARD_ORIGIN,
    boardBridgeUrl:            `${FIXTURE_BOARD_ORIGIN}/bridge`,
    watchedOrchestratorsByTracker,
    ...overrides,
  };
}

/**
 * The fleet with a product owner on two projects: on the storefront a live one asking one question (older than the
 * invoice orchestrator's), on the agency site an idle one; the others have none, so they offer to start one.
 */
export function productOwnerSnapshotWith(): DashboardSnapshot {
  const fleet = fleetSnapshotWith();
  const productOwnersByProject: Record<string, OrchestratorSession> = {
    'example-storefront': orchestratorSessionWith({
      sessionId:        'product-owner-asking',
      pid:              4343,
      state:            'waiting-for-answer',
      lastAction:       { at: '2026-10-21T09:57:00+02:00', text: 'Drafted a ticket for the checkout copy' },
      pendingQuestions: [pendingQuestionWith('request-product-owner', '2026-10-21T09:58:00+02:00')],
    }),
    'example-agency-site': orchestratorSessionWith({ sessionId: 'product-owner-idle', pid: 4344, lastAction: { at: '2026-10-21T09:40:00+02:00', text: 'Filed #061' } }),
  };
  const projects = fleet.projects.map((project) => (Object.hasOwn(productOwnersByProject, project.project)
    ? { ...project, productOwner: productOwnersByProject[project.project] ?? null }
    : project));
  return { ...fleet, projects };
}

export const MARKUP_INJECTION_LINE = 'Checking the build <img src=x onerror=alert(1)> before asking';

/**
 * An inbox fleet: a question with every context row, its last line holding markup that must stay text, a question with
 * an empty context, an idle orchestrator at 84% (a refresh it would take) and one waiting at 85% (a refused one).
 */
export function inboxSnapshotWith(): DashboardSnapshot {
  const stoppedBoard = (): ProjectHealth => ({ kind: 'ready', board: boardSummaryWith({ dispatcherState: 'stopped' }) });
  const fullContext = { dispatcherRunId: 'run-0123456789abcdef', mentionedTicketIds: ['041', '133'], lastAssistantLine: MARKUP_INJECTION_LINE };
  const contextQuestion = pendingQuestionWith('request-context', '2026-10-21T09:50:00+02:00', fullContext);
  const projects = [
    projectSnapshotWith('example-storefront', {
      health:       stoppedBoard(),
      orchestrator: orchestratorSessionWith({ state: 'waiting-for-answer', context: contextUsageWith(85_000), pendingQuestions: [contextQuestion] }),
    }),
    projectSnapshotWith('example-notes', {
      health:       stoppedBoard(),
      orchestrator: orchestratorSessionWith({ state: 'waiting-for-answer', pendingQuestions: [pendingQuestionWith('request-bare', '2026-10-21T09:55:00+02:00')] }),
    }),
    projectSnapshotWith('example-agency-site', { health: stoppedBoard(), orchestrator: orchestratorSessionWith({ state: 'idle', context: contextUsageWith(84_000) }) }),
  ];
  return fleetSnapshotWith({
    projects,
    watchedOrchestratorsByTracker: Object.fromEntries(projects.map((project) => [project.trackerId, []])),
  });
}
