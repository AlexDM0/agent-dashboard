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

/** A dashboard-owned session takes the request as its user's turn; a desktop session gets it as a peer's message. */
export type OrchestratorRecipient = 'dashboard-session' | 'desktop-session';

/** The 200 answer of `POST /api/projects/<trackerId>/orchestrator-requests`. */
export interface OrchestratorRequestReceipt { recipient: OrchestratorRecipient }

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
/** What a user needs to answer a question without opening the conversation, fixed when the server first sees it. */
export interface QuestionContext {
  /** The board's `dispatcherRunId` when the question was asked; null for a board with none or unreadable. */
  dispatcherRunId:    string | null;
  /** The ids (`#133` → `133`) named in the question texts, then in the last five assistant messages, oldest first. */
  mentionedTicketIds: string[];
  /** The last line of assistant text said before the question, trimmed to 160 characters; null for none. */
  lastAssistantLine:  string | null;
}
export interface PendingQuestion { requestId: string; askedAt: string; questions: Question[]; context: QuestionContext }

/** A session's newest assistant text (its first line, trimmed to 160 characters) or tool call (as its conversation line reads). */
export interface SessionAction { at: string; text: string }

export interface OrchestratorSession {
  ownership:         OrchestratorOwnership;
  sessionId:         string;
  pid:               number;
  /** The name a watched session's record carries; null for a dashboard-owned session or a record without one. */
  name:              string | null;
  state:             OrchestratorState;
  startedAt:         string | null;
  context:           ContextUsage | null;
  pendingQuestions:  PendingQuestion[];  // always empty for a watched session
  lastAction:        SessionAction | null;  // null before any, and always for a watched session
  /** The dashboard-owned session this one took the board over from by a handoff, while this server runs; else null. */
  previousSessionId: string | null;
}

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';
export interface ChatMessage { at: string; role: ChatRole; text: string }

/** What a dashboard-owned session is briefed as; a project runs at most one live session per role. */
export type SessionRole = 'orchestrator' | 'product-owner';

/** The body of `POST /api/projects/<trackerId>/orchestrator`. */
export interface OrchestratorStartRequest { startBuilding: boolean }

/** `spar` files nothing until the user says "wrap up"; `file` files tickets as they are agreed. */
export type ProductOwnerMode = 'spar' | 'file';

/** The body of `POST /api/projects/<trackerId>/product-owner`. */
export interface ProductOwnerStartRequest { mode: ProductOwnerMode }

/**
 * The body of `POST /api/projects/<trackerId>/orchestrator/messages`: 1 to 20000 characters after trimming, to the
 * session `sessionId` names (the dashboard-owned one or a watched one of the project), else to the project's orchestrator.
 */
export interface OrchestratorChatRequest { text: string; sessionId?: string }

/** The body of `POST /api/projects/<trackerId>/orchestrator/answers`: one answer per question of the pending request. */
export interface OrchestratorAnswerRequest { requestId: string; answers: Record<string, string> }

/** The answer of `POST /api/projects/<trackerId>/orchestrator/handoff`: the fresh session, and where the note was kept. */
export interface OrchestratorHandoffResult { session: OrchestratorSession; notePath: string }

/** The answer of `GET /api/launch-token`, the header value a session start, stop, chat, answer or handoff must carry. */
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
  /** The dashboard-owned product-owner session of the project, live or ended since this server started; null for none. */
  productOwner:  OrchestratorSession | null;
}

export type RegistryHealth =
  | { kind: 'ready' }
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: string };

export interface DashboardSnapshot {
  registry:                      RegistryHealth;
  registryPath:                  string;
  projects:                      ProjectSnapshot[];  // registry order; the web sorts
  generatedAt:                   string;
  /** The serving machine's available parallelism: the most agents it runs at once, one per logical core. */
  machineParallelAgentLimit:     number;
  /** The second loopback origin the board pages are served from, so nothing on them is same-origin with the dashboard. */
  boardOrigin:                   string;
  /** The page on the board origin that carries the theme and Esc between the dashboard and the framed board. */
  boardBridgeUrl:                string;
  /**
   * Per tracked project, every live Claude Code session holding its board's `dispatcherRunId` run that the dashboard did
   * not start, `ownership: 'watched'`; every project of `projects` is a key, its list empty for none or no run.
   */
  watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]>;
}

export interface ServerIdentity { application: 'agent-dashboard'; version: string; pid: number }
