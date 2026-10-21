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

export interface BoardSummary {
  dispatcherState:        DispatcherState;
  concurrencyLimit:       number;
  agentsInFlight:         number;
  freeSlots:              number;
  ticketCountByStatus:    Record<TicketStatus, number>;  // over every ticket (--full)
  ticketTotal:            number;
  activeRows:             ActiveRow[];                   // rows in-progress, oldest start first
  readyTicketIds:         string[];                      // startable: held ones left out
  heldTicketIds:          string[];                      // every held ticket, as the CLI lists them
  reviewWaitingTicketIds: string[];                      // held ones left out
  pausedBuildCount:       number;
  recentLog:              LogLine[];                     // newest stamp first (append order on a tie), at most 5
  tokensTotal:            number;                        // sum of tokensByOwner
}

export type ProjectHealth =
  | { kind: 'ready'; board: BoardSummary }
  | { kind: 'unreadable'; reason: string }
  | { kind: 'missing'; reason: string };

export interface ProjectSnapshot {
  trackerId:     string;
  project:       string;
  root:          string;
  gitOrigin:     string | null;
  registeredAt:  string;
  lastChangedAt: string;
  lastCommand:   string;
  pageAvailable: boolean;  // progress.html exists
  pageUrl:       string;   // /projects/<trackerId>/page/progress.html
  readAt:        string;   // when the dashboard last read it, shown only
  health:        ProjectHealth;
}

export type RegistryHealth =
  | { kind: 'ready' }
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: string };

export interface DashboardSnapshot {
  registry:     RegistryHealth;
  registryPath: string;
  projects:     ProjectSnapshot[];  // registry order; the web sorts
  generatedAt:  string;
}

export interface ServerIdentity { application: 'agent-dashboard'; version: string; pid: number }
