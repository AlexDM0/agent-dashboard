export type DispatcherState = 'running' | 'finished' | 'stopped';
export type TicketStatus = 'pending' | 'in-progress' | 'in-review' | 'reviewed' | 'delivered' | 'abandoned';
export type ActiveRowKind = 'build' | 'review' | 'task';

export interface ActiveRow {
  rowId:       number;
  kind:        ActiveRowKind;  // review: the row has reviewOf; build: the row has ticket; else task
  ticketId:    string | null;  // ticket or reviewOf
  reviewRound: number | null;  // reviewBarRound on a review row
  title:       string;         // the ticket's title when known, else the row name
  owner:       string;
  startedAt:   string | null;  // the row's start stamp, shown only
  note:        string;
}

export interface LogLine { at: string; text: string }

export interface WaitingTicket { ticketId: string; title: string }

/** The body of `POST /api/projects/<trackerId>/orchestrator-requests`. */
export type OrchestratorRequest =
  | { kind: 'start-building' }
  | { kind: 'clear-low-tickets'; ticketIds: string[] };

export interface BoardSummary {
  dispatcherState:           DispatcherState;
  concurrencyLimit:          number;
  agentsInFlight:            number;
  freeSlots:                 number;
  ticketCountByStatus:       Record<TicketStatus, number>;  // over every ticket (--full)
  ticketTotal:               number;
  activeRows:                ActiveRow[];                   // rows in-progress, oldest start first
  readyTicketIds:            string[];                      // startable: held ones left out
  heldTicketIds:             string[];                      // every held ticket, as the CLI lists them
  reviewWaitingTicketIds:    string[];                      // held ones left out
  pausedBuildCount:          number;
  recentLog:                 LogLine[];                     // newest stamp first (append order on a tie), at most 5
  tokensTotal:               number;                        // sum of tokensByOwner
  dispatcherRunId:           string | null;                 // the latest dispatcher run's workflow id, null before any
  lowPriorityWaitingTickets: WaitingTicket[];               // priority low, pending, not held; lowest id first
}

export type ProjectHealth =
  | { kind: 'ready'; board: BoardSummary }
  | { kind: 'unreadable'; reason: string }
  | { kind: 'missing'; reason: string };

export type OrchestratorOwnership = 'dashboard' | 'watched';
export type OrchestratorState = 'starting' | 'busy' | 'idle' | 'waiting-for-answer' | 'ended';

export interface ContextUsage {
  usedTokens:          number;
  contextWindowTokens: number | null;  // null when not known for a watched session's model
  model:               string;
  measuredAt:          string;
}

export interface QuestionOption { label: string; description: string }
export interface Question { question: string; header: string; multiSelect: boolean; options: QuestionOption[] }
export interface PendingQuestion { requestId: string; askedAt: string; questions: Question[] }

export interface OrchestratorSession {
  ownership:        OrchestratorOwnership;
  sessionId:        string;
  pid:              number;
  state:            OrchestratorState;
  startedAt:        string | null;
  context:          ContextUsage | null;
  pendingQuestions: PendingQuestion[];  // always empty for a watched session
}

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';
export interface ChatMessage { at: string; role: ChatRole; text: string }

/** The body of `POST /api/projects/<trackerId>/orchestrator`. */
export interface OrchestratorStartRequest { startBuilding: boolean }

/** The answer of `GET /api/launch-token`, the header value an orchestrator start or stop must carry. */
export interface LaunchToken { token: string }

export interface ProjectSnapshot {
  trackerId:     string;
  project:       string;
  root:          string;
  gitOrigin:     string | null;
  registeredAt:  string;
  lastChangedAt: string;
  lastCommand:   string;
  pageAvailable: boolean;  // progress.html exists
  pageUrl:       string;   // <boardOrigin>/projects/<trackerId>/page/progress.html, never on the dashboard's own origin
  readAt:        string;   // when the dashboard last read it, shown only
  health:        ProjectHealth;
  /** The dashboard-owned orchestrator session of the project, live or ended since this server started; null for none. */
  orchestrator:  OrchestratorSession | null;
}

export type RegistryHealth =
  | { kind: 'ready' }
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: string };

export interface DashboardSnapshot {
  registry:                  RegistryHealth;
  registryPath:              string;
  projects:                  ProjectSnapshot[];  // registry order; the web sorts
  generatedAt:               string;
  /** The serving machine's available parallelism: the most agents it runs at once, one per logical core. */
  machineParallelAgentLimit: number;
  /** The second loopback origin the board pages are served from, so nothing on them is same-origin with the dashboard. */
  boardOrigin:               string;
  /** The page on the board origin that carries the theme and Esc between the dashboard and the framed board. */
  boardBridgeUrl:            string;
}

export interface ServerIdentity { application: 'agent-dashboard'; version: string; pid: number }
