import type {
  ActiveRow,
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
    productOwnerMode:  null,
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

/**
 * The chat overlay's fleet: the product owners' fleet plus an ended product owner on the notes project, whose board
 * has #043 building, #040 in review and #047 held, the tickets the fixture table references.
 */
export function chatSnapshotWith(): DashboardSnapshot {
  const fleet = productOwnerSnapshotWith();
  const endedProductOwner = orchestratorSessionWith({
    sessionId: 'product-owner-ended', pid: 4345, state: 'ended', lastAction: { at: '2026-10-21T09:59:30+02:00', text: 'Filed #131 and #134' }
  });
  const activeRowOf = (rowId: number, kind: 'build' | 'review', ticketId: string): ActiveRow => ({
    rowId, kind, ticketId, reviewRound: null, title: `Example ticket ${ticketId}`, owner: 'opus', startedAt: null, note: ''
  });
  const notesBoard = boardSummaryWith({
    dispatcherState: 'running', agentsInFlight: 2, freeSlots: 0, activeRows: [activeRowOf(1, 'build', '043'), activeRowOf(2, 'review', '040')], heldTicketIds: ['047']
  });
  const projects = fleet.projects.map((project) => (project.project === 'example-notes'
    ? { ...project, health: { kind: 'ready', board: notesBoard } as const, productOwner: endedProductOwner }
    : project));
  return { ...fleet, projects };
}

function activeRowWith(rowId: number, ticketId: string, title: string, startedAt: string): ActiveRow {
  return {
    rowId, kind: 'build', ticketId, reviewRound: null, title, owner: 'opus', startedAt, note: ''
  };
}

function ticketCountsWith(delivered: number, inReview: number, inProgress: number, pending: number): BoardSummary['ticketCountByStatus'] {
  return {
    pending, 'in-progress': inProgress, 'in-review': inReview, 'reviewed': 0, delivered, 'abandoned': 0
  };
}

/**
 * The overview's two-active, four-idle fixture: a running storefront with every slot busy, five rows in flight and
 * ready and low-priority tickets waiting, a running invoice service led by a watched desktop session; idle, a
 * finished agency site with ready and low-priority tickets, a stopped notes board and two fully delivered ones.
 */
export function overviewSnapshotWith(): DashboardSnapshot {
  const fleet = fleetSnapshotWith();
  const log = (at: string, text: string) => [{ at, text }];
  const storefrontRows = [
    activeRowWith(1, '041', 'Example checkout copy with a title long enough to need an ellipsis on a card', '2026-10-21T09:12:00+02:00'),
    activeRowWith(2, '042', 'Example basket badge', '2026-10-21T09:40:00+02:00'),
    { ...activeRowWith(3, '038', 'Example price rounding', '2026-10-21T09:45:00+02:00'), kind: 'review' as const, reviewRound: 1 },
    activeRowWith(4, '044', 'Example search filters', '2026-10-21T09:50:00+02:00'),
    activeRowWith(5, '045', 'Example footer links', '2026-10-21T09:55:00+02:00'),
  ];
  const lowPriorityWaitingTickets = [{ ticketId: '012', title: 'Example low-priority tidy-up' }, { ticketId: '014', title: 'Example copy fix' }];
  const projects = [
    activeProjectWith('example-storefront', {
      concurrencyLimit:    4,
      agentsInFlight:      4,
      freeSlots:           0,
      ticketCountByStatus: ticketCountsWith(16, 2, 4, 12),
      ticketTotal:         34,
      activeRows:          storefrontRows,
      readyTicketIds:      ['043', '046'],
      heldTicketIds:       ['047'],
      lowPriorityWaitingTickets,
      recentLog:           log('2026-10-21T09:58:00+02:00', 'Started a builder on #045 after the review of #038 came back'),
    }, orchestratorSessionWith({ state: 'busy', context: contextUsageWith(124_000, 200_000), lastAction: { at: '2026-10-21T09:58:00+02:00', text: 'Started a builder on #045' } })),
    {
      ...activeProjectWith('example-invoice-service', {
        concurrencyLimit:    3,
        agentsInFlight:      1,
        freeSlots:           2,
        ticketCountByStatus: ticketCountsWith(8, 0, 1, 3),
        ticketTotal:         12,
        activeRows:          [activeRowWith(6, '019', 'Example invoice numbering', '2026-10-21T09:30:00+02:00')],
        recentLog:           log('2026-10-21T09:31:00+02:00', 'ticket claim 019'),
      }, null),
      productOwner: orchestratorSessionWith({ sessionId: 'product-owner-example', state: 'idle', lastAction: { at: '2026-10-21T09:20:00+02:00', text: 'Filed #020' } }),
    },
    projectSnapshotWith('example-agency-site', {
      health: {
        kind:  'ready',
        board: boardSummaryWith({
          ticketCountByStatus: ticketCountsWith(9, 0, 0, 3),
          ticketTotal:         12,
          readyTicketIds:      ['010', '011'],
          lowPriorityWaitingTickets,
          recentLog:           log('2026-10-21T08:10:00+02:00', 'dispatcher finished'),
        }),
      },
    }),
    projectSnapshotWith('example-archive', {
      health: {
        kind:  'ready',
        board: boardSummaryWith({ ticketCountByStatus: ticketCountsWith(21, 0, 0, 0), ticketTotal: 21, recentLog: log('2026-10-20T17:00:00+02:00', 'ticket deliver 021') }),
      },
    }),
    projectSnapshotWith('example-mobile-app', { health: { kind: 'ready', board: boardSummaryWith({ ticketCountByStatus: ticketCountsWith(5, 0, 0, 0), ticketTotal: 5 }) }, }),
    projectSnapshotWith('example-notes', {
      health: {
        kind:  'ready',
        board: boardSummaryWith({
          dispatcherState: 'stopped', ticketCountByStatus: ticketCountsWith(2, 1, 0, 4), ticketTotal: 7, recentLog: log('2026-10-21T07:45:00+02:00', 'dispatcher stopped')
        }),
      },
    }),
  ];
  const watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]> = Object.fromEntries(projects.map((project) => [project.trackerId, []]));
  watchedOrchestratorsByTracker['tracker-example-invoice-service'] = [orchestratorSessionWith({
    ownership: 'watched', sessionId: 'watched-example', name: 'Alex Example desktop', state: 'busy', context: contextUsageWith(61_000, null)
  })];
  return { ...fleet, projects, watchedOrchestratorsByTracker };
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
