# agent-dashboard design

A governing dashboard over every repository the agent-progress CLI tracks on this machine. `agent-dashboard` starts
(or reuses) a local Bun server and opens it in the browser: an overview of every project's agentic work in flight,
and each project's own `progress.html` opened inside the dashboard in an iframe. It reads the files on disk live and
never writes to a tracked repository itself: the changes it makes there are running `agent-progress concurrency <n>`
or `agent-progress dispatcher stopped` in the project's root when the user clicks for it, so the CLI takes its lock
and writes its own tracker. The second
effect a click can have writes nothing at all: a message to the board's live orchestrator Claude Code session, asking
it to start building or telling it which low-priority tickets the user cleared to run. The server finds that session
by reading `~/.claude/sessions/` (one record per live session) and `~/.claude/projects/` (each session's workflow
transcripts), and the orchestrator decides what to do with the message. On the user's click the dashboard also starts
a headless orchestrator session in a project's root and holds it through a detached supervisor (see "Orchestrator
sessions"); that session, not the dashboard, writes the tracker.

## Sources of truth

- **The registry**: `~/.agent-progress-monitor/projects.json`, written by agent-progress (its `docs/cli.md`,
  section `~/.agent-progress-monitor/projects.json`). Shape: `{ version: 1, projects: { [trackerId]: { project,
  root, progressHtml, progressJson, gitOrigin, registeredAt, lastChangedAt, lastCommand } } }`. Only `version` 1 is
  read; a newer one is reported, never guessed at. Unknown keys are ignored. The dashboard never writes it.
- **Each project's board**: `agent-progress status --json --full`, run with the project's `root` as working
  directory. It takes no lock, renders nothing, skips the install-version check, and prints the whole progress file
  plus every ticket's frontmatter and the Board facts (`concurrency`, `readyTickets`, `reviewWaitingTickets`,
  `pausedBuilds`, `epics`, `tokensByOwner`). The dashboard maps that document to a summary and keeps no copy of the
  Board's rules: a count the CLI already computes is taken from it, never recomputed. A failing run (exit not 0,
  unparsable output, CLI not on `PATH`, no answer within 10 s) is that project's `unreadable` verdict with the CLI's
  stderr as its reason. The run leads a process group of its own, killed whole at the timeout, so a wrapper's child
  cannot hold the read open. An agent-progress that is a Bun script (`#!/usr/bin/env bun`) is run by the dashboard's
  own Bun with `--no-env-file --config=<null device>`, so the root's `.env` and `bunfig.toml` (its `preload`) never
  load; any other executable (a shell wrapper) runs as it is, with the root's files its own business. A relative
  `AGENT_DASHBOARD_AGENT_PROGRESS` is resolved against the directory the command was typed in.
- **Each project's page**: the folder holding `progressHtml` (its `.agent-progress/`). `progress.html` loads
  `progress.stamp.js` beside it every 60 s and reloads itself when the stamp changes, so served over HTTP from the
  same folder it keeps itself current inside the iframe.
- The dashboard's own files (server record, log) live in `~/.agent-progress-monitor/agent-dashboard/`: the registry
  folder exists so a monitor can keep its files beside it.

## Architecture

```
agent-dashboard.ts   bin shim: runs the command line and exits with its code
cli/                 the command surface: argument parsing, help, open / serve / stop / status, the server record
src/lib/             caller-agnostic building blocks: atomic file writing, debounced coalescing runner, concurrency
                     limit, contained path resolution
src/shared/          DashboardContract.ts (types the server and the web share), constants (the CLI-server protocol
                     among them), Environment.ts, UnknownValueUtil.ts
src/adapters/        RegistryReader (projects.json → verdict), BoardStatusReader (spawn status → verdict),
                     BoardSummaryMapper (status JSON → BoardSummary), ConcurrencyLimitWriter (spawn concurrency
                     → verdict), DispatcherStopWriter (spawn dispatcher stopped → verdict), AgentProgressWrite
                     (a writing run's exit → verdict, for both writers), AgentProgressRun (one agent-progress run →
                     how it ended, for every spawn)
src/services/        ProjectMonitor (watch, refresh, hold snapshots, notify), DashboardServer (Bun.serve routes)
web/                 the React frontend, its own DOM-only TypeScript project; imports only src/shared types
```

Imports run `src/lib → src/shared → src/adapters → src/services → cli`; `web/` imports nothing from `src/` but
`import type` from `src/shared/DashboardContract.ts`. Nothing does work at module load except the entry points
(`agent-dashboard.ts`, `web/Main.tsx`).

### The monitor

- On start it reads the registry, then for each project runs the status reader once.
- It watches the registry folder (`fs.watch` on `~/.agent-progress-monitor/`, filtering `projects.json`) and each
  project's `.agent-progress/` folder (non-recursive: every agent-progress write renders `progress.html` and
  `progress.stamp.js` there, atomically by rename, so a folder watch sees each one). A registry change re-reads the
  registry, starts watching new projects, stops watching removed ones and refreshes new ones; a project whose `root`
  or `progressHtml` changed is watched afresh and refreshed, while a change to its metadata alone (`lastChangedAt`,
  `lastCommand`, ...) is shown without a status read, since the command's own folder write already scheduled one.
- A change event schedules that project's refresh through a debounced, coalescing runner: 250 ms quiet, but at most
  2 s from the first pending change while changes keep coming, never two runs of one project at once, and a change
  during a run schedules exactly one more.
- A safety sweep refreshes every project every 60 s, because `fs.watch` can miss events; it decides nothing.
- A missing `root` or `.agent-progress/` folder is that project's `missing` verdict; a watch that cannot be set up
  falls back to the sweep. The monitor never throws out of a refresh: every failure is a verdict.
- At most 4 status reads run at once across all projects. A read still queued behind that cap when the monitor stops
  or its project leaves the registry is never started.
- Subscribers get the whole `DashboardSnapshot` after every change (a few kB; no diffing in v1).

### The server

`Bun.serve`, bound to `127.0.0.1` only, with `reusePort: false` (Bun otherwise sets `SO_REUSEPORT` outside development
mode, and a second dashboard would share the port instead of meeting `EADDRINUSE`). Every request to a data route
(`/api/*`, `/projects/*`) whose `Host` header is not `127.0.0.1:<port>`, `localhost:<port>` or `[::1]:<port>` (on port
80 also the bare names, as browsers send them there) is refused 403 (DNS-rebinding guard). The app shell at `/` and the
chunks Bun bundles for it are exempt: Bun answers its HTML-import route before `fetch`, and they are the public build,
holding no data. Routes:

| Route | Answer |
| --- | --- |
| `GET /` | the React app (a Bun HTML import of `web/index.html`, bundled by Bun) |
| `GET /api/identity` | `ServerIdentity`, how the CLI knows a running server is the dashboard |
| `GET /api/snapshot` | the current `DashboardSnapshot` |
| `GET /api/events` | Server-Sent Events: `event: snapshot` with the whole snapshot on connect and on every change; a `: heartbeat` comment every 25 s |
| `GET /projects/<trackerId>/page/<path>` | a file from that project's page folder: 404 for an unknown tracker, a missing file, or any path that resolves (after `realpath`) outside the folder; `Cache-Control: no-store`. `progress.html` and `progress.stamp.js` carry a CSP limiting them to this origin (inline script and style allowed, `frame-ancestors 'self'`); every other file carries `Content-Security-Policy: sandbox`, so a script in a ticket's linked SVG or HTML runs in an opaque origin |
| `POST /api/projects/<trackerId>/concurrency` | body `{ "limit": <n> }`, an absolute whole number from 1 to 10: runs `agent-progress concurrency <n>` in that project's root (one of the two CLI runs a click may make in a tracked repository, beside `agent-progress dispatcher stopped`), re-reads the board at once so the next snapshot carries the new limit, and answers 204. Same Host guard; 403 for an `Origin` that is present and not this server's own, 404 for an unknown tracker, 400 for any other body (no CLI run), 409 with the CLI's message on its exit 1, 502 for any other failure |
| `POST /api/projects/<trackerId>/dispatcher` | body exactly `{ "state": "stopped" }`: runs `agent-progress dispatcher stopped` in that project's root (the other CLI run a click may make in a tracked repository, beside `agent-progress concurrency <n>`), re-reads the board at once and answers 204. The running dispatcher reads the stored state as each agent returns and starts no new agent while those in flight finish; the store clears `concurrency.dispatcherRunId`, so the orchestrator is found afterwards by its working directory. Same Host guard; 403 for a foreign `Origin`, 404 for an unknown tracker, 400 for any other body (no CLI run), 409 with the CLI's message on its exit 1, 502 for any other failure |
| `POST /api/projects/<trackerId>/orchestrator-requests` | body `{ "kind": "start-building" }` or `{ "kind": "clear-low-tickets", "ticketIds": [...] }` (1 to 50 non-empty ids, each among the board's `lowPriorityWaitingTickets`): writes one NDJSON line `{"type":"user","message":{"role":"user","content":<text>}}` to the board's orchestrator session's `messagingSocketPath` and answers 204. The text relays the user's click, names the project and says what to do: run the board through the agent-progress dispatcher, leaving a run in flight running; or triage the named tickets and launch with `includeLowPriority: true` once no run is in flight, never stopping a running dispatcher. The orchestrator is the one live session (pid alive, socket accepting) whose `~/.claude/projects/<slug of its cwd>/<sessionId>/subagents/workflows/` holds the board's `dispatcherRunId`, else the one live session whose `cwd` is the project root. Nothing is written to the board or the repository. Same Host guard; 403 for a foreign `Origin`, 404 for an unknown tracker, 400 for any other body, 409 for an id that is not low-priority waiting or for zero or several candidate sessions, 502 when the chosen socket fails; none of these writes to a socket |
| `POST /api/shutdown` | stops the server (used by `agent-dashboard stop`; same Host guard) |

### The command line

| Command | Does |
| --- | --- |
| `agent-dashboard [open] [--port <n>] [--no-open]` | Reuse the running server (server record + `GET /api/identity` answering), or start one detached (`node:child_process` `spawn` with `detached: true`, output to `~/.agent-progress-monitor/agent-dashboard/server.log`, `unref()`), wait until its identity answers (at most 5 s), then open the URL with the platform opener (`open`, `xdg-open`, `cmd /c start`). Prints the URL. The detached server runs in `~/.agent-progress-monitor/agent-dashboard/`, never where `open` was typed. A `--port` other than the running server's is a refusal naming its URL and `stop`; without `--port` the running one is reused wherever it listens. |
| `agent-dashboard serve [--port <n>]` | Run the server in the foreground until interrupted; writes the server record, removes it on exit (only while it still names this process). Refused while the record names another dashboard that answers, so no server is ever left beyond `status` and `stop`. |
| `agent-dashboard stop` | Ask the running server to stop; nothing running is exit 0 with a line saying so. A record that cannot be read, or whose pid is gone, is stale and removed; one whose pid lives but does not answer is a refusal that leaves the record. |
| `agent-dashboard status` | Print the running server's URL and pid, or that none runs. |
| `agent-dashboard help` | One screen of help to stdout; an unknown command prints it to stderr, exit 1. |

Default port 4710. A port held by something that is not the dashboard is a refusal naming `--port`, exit 1. The server
record `~/.agent-progress-monitor/agent-dashboard/server.json` is `{ pid, port, url, startedAt, version }`, written
atomically. Exit codes: 0 done, 1 refusal or unknown command, 2 anything else.

### The contract (`src/shared/DashboardContract.ts`)

```ts
export type DispatcherState = 'running' | 'finished' | 'stopped';
export type TicketStatus = 'pending' | 'in-progress' | 'in-review' | 'reviewed' | 'delivered' | 'abandoned';
export type ActiveRowKind = 'build' | 'review' | 'task';

export interface ActiveRow {
  rowId: number;
  kind: ActiveRowKind;            // review: the row has reviewOf; build: the row has ticket; else task
  ticketId: string | null;        // ticket or reviewOf
  reviewRound: number | null;     // reviewBarRound on a review row
  title: string;                  // the ticket's title when known, else the row name
  owner: string;
  startedAt: string | null;       // the row's start stamp, shown only
  note: string;
}

export interface LogLine { at: string; text: string }

export interface BoardSummary {
  dispatcherState: DispatcherState;
  concurrencyLimit: number;
  agentsInFlight: number;
  freeSlots: number;
  ticketCountByStatus: Record<TicketStatus, number>;   // over every ticket (--full)
  ticketTotal: number;
  activeRows: ActiveRow[];                              // rows in-progress, oldest start first
  readyTicketIds: string[];                             // startable: held ones left out
  heldTicketIds: string[];                              // every held ticket, as the CLI lists them
  reviewWaitingTicketIds: string[];                     // held ones left out
  pausedBuildCount: number;
  recentLog: LogLine[];                                 // newest stamp first (append order on a tie), at most 5
  tokensTotal: number;                                  // sum of tokensByOwner
  dispatcherRunId: string | null;                       // concurrency.dispatcherRunId, null before any run
  lowPriorityWaitingTickets: WaitingTicket[];           // priority low, pending, not held; lowest id first
}

export interface WaitingTicket { ticketId: string; title: string }

export type ProjectHealth =
  | { kind: 'ready'; board: BoardSummary }
  | { kind: 'unreadable'; reason: string }
  | { kind: 'missing'; reason: string };

export interface ProjectSnapshot {
  trackerId: string;
  project: string;
  root: string;
  gitOrigin: string | null;
  registeredAt: string;
  lastChangedAt: string;
  lastCommand: string;
  pageAvailable: boolean;          // progress.html exists
  pageUrl: string;                 // /projects/<trackerId>/page/progress.html
  readAt: string;                  // when the dashboard last read it, shown only
  health: ProjectHealth;
}

export type RegistryHealth =
  | { kind: 'ready' }
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: string };

export interface DashboardSnapshot {
  registry: RegistryHealth;
  registryPath: string;
  projects: ProjectSnapshot[];     // registry order; the web sorts
  generatedAt: string;
}

export interface ServerIdentity { application: 'agent-dashboard'; version: string; pid: number }
```

## Orchestrator sessions

The dashboard starts at most one orchestrator per project on the user's click and keeps it running past
`agent-dashboard stop` and a server restart; it also watches orchestrators it did not start (desktop-app sessions).
Settled: the dashboard owns the process (headless, never a terminal); the session runs in `auto` permission mode, so
permission prompts never reach the dashboard and only `AskUserQuestion` questions do; a watched session shows its
context usage and takes chat, but its questions are answered in its own app.

### The interface

Raw `claude -p --input-format stream-json --output-format stream-json --verbose --permission-mode auto
--permission-prompt-tool stdio`, no SDK dependency, against the installed Claude Code (2.1.308 when specified; its
`init` line reports `claude_code_version` and is recorded). Proven by the ticket #016 probe in a scratch repository:

- `init` lists `Workflow` and `AskUserQuestion` among `tools` with `permissionMode: "auto"`; a `Workflow` call is
  approved by the classifier (`permission_decision`, `reason_type: "classifier"`), returns `status: "async_launched"`,
  and its `task-notification` opens the next turn by itself, so the dispatcher runs headless.
- A pending `AskUserQuestion` arrives on stdout as `{"type":"control_request","request_id":…,"request":{"subtype":
  "can_use_tool","tool_name":"AskUserQuestion","input":{"questions":[{question,header,options:[{label,description}],
  multiSelect}]},"requires_user_interaction":true}}` and is answered on stdin with `{"type":"control_response",
  "response":{"subtype":"success","request_id":…,"response":{"behavior":"allow","updatedInput":{…input,"answers":
  {"<question>":"<label>"}}}}}`; the session then continues with the answer as the tool result.
- Each `assistant` line carries `message.usage` (`input_tokens`, `cache_read_input_tokens`,
  `cache_creation_input_tokens`, `output_tokens`); each `result` carries `modelUsage.<model>.contextWindow`.
- A user message is the stdin line `{"type":"user","message":{"role":"user","content":<text>}}`.

### The supervisor

`agent-dashboard supervise <trackerId>`, a command the server alone runs (not in `help`), spawned detached
(`detached: true`, its own process group, stdio to its log, `unref()`), as `open` starts the server. It spawns the
session with the project root as working directory, then listens on a Unix socket. It outlives its starter (the probe's
supervisor was reparented to pid 1 and served two later clients); it ends when the session exits, by itself or on Stop,
and removes its record and socket then.

- **Socket protocol** (NDJSON both ways). Client to supervisor: `{"kind":"chat","text":…}`, `{"kind":"answer",
  "requestId":…,"answers":{…}}`, `{"kind":"stop"}`. Supervisor to client: on connect one `{"kind":"state",…}` line
  (the record, pending questions, latest context usage), then each session stdout line as `{"kind":"session","line":…}`.
  Writes to a client are buffered per client and drained (`drain`), since one `write` of a 20 kB `init` line was cut
  short in the probe.
- **Questions**: an `AskUserQuestion` `control_request` is held as pending until answered, whether or not a server is
  connected. Any other `can_use_tool` request is denied at once with `behavior: "deny"`: permission prompts are not
  surfaced.
- **Stop**: the supervisor closes the session's stdin and sends `SIGTERM` to the session's process group after 10 s
  if it still runs; it records the exit code (143 for the signal, as in the probe) in its log before it removes its record and socket.
- **Reconnecting**: the server reads every record at start and connects to each socket that accepts; a record whose
  supervisor pid is gone is stale and removed. A connection that drops is retried every 5 s while the record lives.
- **The finder**: the session writes its own `~/.claude/sessions/<pid>.json` (`kind: "interactive"`, `entrypoint`
  inherited from the environment, a `messagingSocketPath`), so `src/adapters/OrchestratorSessionFinder.ts` sees it.
  A project with a live dashboard-owned orchestrator takes it as its orchestrator, matched by the record's
  `sessionPid`, and `orchestrator-requests` reaches it through the supervisor's `chat`.

Files under `~/.agent-progress-monitor/agent-dashboard/orchestrators/`, each named for the tracker id's first 16
hex digits of SHA-256 (a Unix socket path is limited to 104 bytes on macOS; a longer path is a refusal):

| File | Holds |
| --- | --- |
| `<key>.json` | the record, written atomically: `{ trackerId, root, supervisorPid, sessionPid, sessionId, socketPath, claudeCodeVersion, startedAt }` |
| `<key>.sock` | the supervisor's Unix socket |
| `<key>.ndjson` | every session stdout line and every client line, stamped, so chat history survives a server restart |
| `<key>.log` | the supervisor's own stdout and stderr |

### Peer messages and the user's go

A line written to a watched session's `messagingSocketPath` arrives there as "Message from another session" with a
peer notice: the session takes it as a teammate's request, never as its user's words or approval (observed by the
user on a live desktop session, ticket #016). So nothing sent to a watched session, chat or an
`orchestrator-requests` line alike, carries the user's go: a watched orchestrator asks its own user before it
launches the dispatcher. Only a dashboard-owned session's stdin `user` line is its user's turn, so `startBuilding`
and chat to a dashboard-owned session carry the user's go that `Workflow` needs.

### Context usage

Used tokens are the last assistant turn's `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`;
the share divides them by the context window. A dashboard-owned session takes the window from its latest `result`'s
`modelUsage`. A watched session's usage comes from the last `assistant` line of `~/.claude/projects/<slug of its
cwd>/<sessionId>.jsonl` (the same `message.usage` fields and `message.model`); that transcript carries no context
window, so a watched session's share is shown only when a dashboard-owned session has reported the window for the same
model, else the token count alone.

### Routes

Every route below takes the server's Host guard, 403 for a present foreign `Origin`, and 404 for an unknown tracker.

| Route | Answer |
| --- | --- |
| `POST /api/projects/<trackerId>/orchestrator` | body `{ "startBuilding": <boolean> }`: starts the supervisor in the project's root and answers 201 with the `OrchestratorSession` once its socket accepts (at most 10 s). With `startBuilding` true its first message is the `start-building` text of `orchestrator-requests`, carrying the user's go that `Workflow` needs. 400 for any other body, 409 while a dashboard-owned orchestrator of the project lives, 409 for a socket path over the limit, 502 when the supervisor exits or does not accept in time |
| `DELETE /api/projects/<trackerId>/orchestrator` | sends `stop` to the project's supervisor and answers 204. 404 when no dashboard-owned orchestrator lives, 409 for a watched session (the dashboard never stops what it did not start), 502 when the socket fails |
| `POST /api/projects/<trackerId>/orchestrator/messages` | body `{ "text": <string> }`, 1 to 20000 characters after trimming: a dashboard-owned session gets it as `chat`, a watched one through `src/adapters/SessionMessageWriter.ts` to its `messagingSocketPath`, where it is a peer's request that never carries the user's go; 204. 400 for any other body, 409 when the finder refuses (no or several sessions), 502 when the socket fails |
| `POST /api/projects/<trackerId>/orchestrator/answers` | body `{ "requestId": <string>, "answers": { "<question>": "<label>" } }`, one answer for every question of that pending request, each a label it offered (or free text for an "Other" choice): sent as `answer`, 204. 400 for any other body, 404 when no dashboard-owned orchestrator lives, 409 for a watched session, a `requestId` that is not pending, or an answer naming a question not asked or leaving one out, 502 when the socket fails |
| `GET /api/projects/<trackerId>/orchestrator/events` | Server-Sent Events: `event: history` with the last 200 `ChatMessage`s on connect, then `event: message` per new one and `event: session` with the `OrchestratorSession` on every change; a `: heartbeat` comment every 25 s. A watched session's messages are tailed from its transcript |

The snapshot carries each project's `orchestrator` so the overview needs no second stream.

### Contract additions (`src/shared/DashboardContract.ts`)

```ts
export type OrchestratorOwnership = 'dashboard' | 'watched';
export type OrchestratorState = 'starting' | 'busy' | 'idle' | 'waiting-for-answer' | 'ended';

export interface ContextUsage {
  usedTokens: number;
  contextWindowTokens: number | null;   // null when not known for a watched session's model
  model: string;
  measuredAt: string;
}

export interface QuestionOption { label: string; description: string }
export interface Question { question: string; header: string; multiSelect: boolean; options: QuestionOption[] }
export interface PendingQuestion { requestId: string; askedAt: string; questions: Question[] }

export interface OrchestratorSession {
  ownership: OrchestratorOwnership;
  sessionId: string;
  pid: number;
  state: OrchestratorState;
  startedAt: string | null;
  context: ContextUsage | null;
  pendingQuestions: PendingQuestion[];  // always empty for a watched session
}

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';
export interface ChatMessage { at: string; role: ChatRole; text: string }

// ProjectSnapshot gains: orchestrator: OrchestratorSession | null;
```

## Visual design

The dashboard speaks agent-progress's design language: its `resources/template.html` is the style guide, and its
tokens are copied verbatim into `web/styles/Tokens.css` (spacing `--sp-*`, radii `--r-*`, type sizes `--fs-*`, the
system UI and mono stacks, every colour in light and `:root[data-theme="dark"]`, the `[data-state]` status palette
`--s-fill/--s-tint/--s-ink/--s-edge`, motion tokens). Dense, quiet, tool-like: 13 px body, hairline `--line`
borders, `--surface` cards on a `--bg` ground, status colour only where it carries meaning, mono for ids, paths and
stamps. No gradients, no emoji, no left-border cards, no shadows beyond the template's `--shadow-*`.

- **Theme**: one preference shared with every embedded page, the same storage key agent-progress uses,
  `agent-progress:theme` (`auto` | `light` | `dark`), resolved before first paint into `data-theme` on `<html>`.
  The dashboard's toggle writes it; every new choice, the toggle's or one a `storage` event brings from another tab or
  the embedded page's own toggle, is applied to the open iframe's document (same origin). The toggle is a radio group
  as the template's is: one tab stop, the arrow keys move the choice.
- **Live status**: the template's `.ap-status-dot` idiom: a `--status-live` dot that pulses while the event stream
  is connected, grey with "reconnecting" when it is not, and "updated 45s ago" from the last snapshot ("updated just now" under 30 seconds, as is the
  reconnecting banner's "last update just now"). Only the
  connection word is a live region; the age is not announced.

### Overview (`#/`)

- **Header** (one line, wraps on a phone): the name `agent-dashboard`, the live status, then header stats in the
  template's `.ap-head-stats` manner: Projects, Agents (in flight across every board / the machine's parallel
  maximum, `availableParallelism()` as the CLI reads it and the snapshot carries it as `machineParallelAgentLimit`;
  the projects' concurrency limits are not summed here), Ready, Awaiting review, Held; the
  theme toggle at the end.
- **Filter bar**: a search field (project name or path) and a segmented toggle `All | Active`.
- **Two groups**: "Active" (agents in flight, or the dispatcher `running`) and "Idle", each a responsive grid of
  project cards (`repeat(auto-fill, minmax(360px, 1fr))`); within a group, A–Z by project name,
  ignoring case (ties by tracker id), whenever it last changed.
- **Project card** (`--surface`, `--line` border, `--r-3`), top to bottom:
  1. Status dot (pulsing `--status-live` with agents in flight; amber when the dispatcher runs with none; grey
     otherwise), project name (`--fs-title`, 600), dispatcher pill (`running` / `finished` / `stopped`).
  2. Root path in mono `--fs-small` `--ink-muted`, and the origin shortened to `owner/repo`.
  3. Slot meter: one cell per concurrency slot, filled `in-progress` amber for each agent in flight, with
     "2 of 2 slots busy".
  4. Ticket bar: one stacked 8 px bar over every ticket, a segment per status in the `[data-state]` fills (delivered,
     reviewed, in-review, in-progress, pending, abandoned), with the caption "16 of 56 delivered · 2 in review · 37
     pending".
  5. In flight: up to four active rows, each a status badge (`Building` in-progress amber, `Review 1` reviewing cyan,
     `Task` pending grey), `#042` in mono, the title truncated with an ellipsis, owner, elapsed ("12m"); "+2 more".
  6. Queue line: `Ready #003 #005` chips, `Awaiting review #011`, `Held #007` (only those present).
  7. Latest log line: time (mono, `--ink-muted`) and text, one line.
  8. Footer: "Changed 3m ago · ticket claim" ("Changed just now" under 30 seconds) and an "Open board" button (primary, `--link`).
  The whole card opens the board; the button is the keyboard target.
- **Unreadable / missing card**: `--err-tint` ground, `--err-edge` border, the reason in mono, the path; still opens
  the board when the page exists.
- **Empty registry**: a centred panel: "No projects yet", with the line "agent-progress registers a project the first
  time a command renders its page", the registry path in mono, and the hint to run `agent-progress render` in a
  tracked repository (`status` is read-only and registers nothing).
- **Lost connection**: a `--warn-tint` banner under the header, "Reconnecting to the dashboard server…", and each
  card's slot row ends "as of 14:30", the last snapshot's time, until the stream is back.

### Board (`#/projects/<trackerId>`)

- A **project rail** on the left (240 px, collapses to a top strip under 768 px): every project as a compact row,
  status dot, name, `2/2` agents, the selected one `--surface-selected`; the rows under an "Active" and an "Idle"
  heading, split and ordered as the overview's groups, an empty group without its heading (the top strip drops the
  headings).
- A **toolbar** over the frame: back to overview (`←` and Esc, also pressed inside the frame unless the board used it
  to close its detail panel or a popover), project name, root path in mono, dispatcher pill,
  slot meter compact, and on the right "Reload" and "Open in new tab".
- The **frame**: `progress.html` in an iframe filling the rest of the viewport, no border, `--bg` behind it. A
  project whose page does not exist yet shows a panel saying so instead.

## Conventions

The owner's conventions as agent-progress's `CLAUDE.md` holds them, applied here: one purpose per file, a file
`PascalCase.ts(x)` named after its main export, folders lower case, no barrels; full descriptive names, no
abbreviations (only `i`, `a`, `b`); design constants `SCREAMING_CASE` with their unit; a util is a frozen object of
pure functions; factories of closures over classes; verdicts not throws from readers; `process.env` only in
`src/shared/Environment.ts`, `process.exit` only in `agent-dashboard.ts`, `process.cwd`/`homedir()`/the clock only
in `cli/CommandContext.ts`; browser storage only in `web/preferences/PreferenceStore.ts`; specs beside their module
as `<Module>.spec.ts`, under a scratch root, never the live registry. Verify with
`bun run typecheck && bun test && bun run lint`.
