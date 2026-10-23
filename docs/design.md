# agent-dashboard design

A governing dashboard over every repository the agent-progress CLI tracks on this machine. `agent-dashboard` starts
(or reuses) a local Bun server and opens it in the browser: an overview of every project's agentic work in flight,
and each project's own `progress.html` opened inside the dashboard in an iframe. It reads the files on disk live and
never writes to a tracked repository itself: the changes it makes there are effects of the user's click, running
`agent-progress concurrency <n>` or `agent-progress dispatcher stopped` in the project's root, so the CLI takes its lock
and writes its own tracker, or starting an orchestrator session there through its supervisor, so that session writes
the tracker. The second
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
- The dashboard's own files (server record, log, and `executables.json`, where `setup.sh` found `claude` and
  `agent-progress`) live in `~/.agent-progress-monitor/agent-dashboard/`: the registry folder exists so a monitor can
  keep its files beside it.

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
                     how it ended, for every spawn), OrchestratorRecordReader (a supervisor record → verdict),
                     SessionStreamEventMapper (a stream-json line → event), SupervisorLineReader (a supervisor
                     socket line → request or state)
src/services/        ProjectMonitor (watch, refresh, hold snapshots, notify), DashboardServer (Bun.serve routes),
                     OrchestratorSupervisor (the detached process holding one session), OrchestratorSessions (the
                     server's connections to every supervisor)
web/                 the React frontend, its own DOM-only TypeScript project; imports only src/shared types
```

Imports run `src/lib → src/shared → src/adapters → src/services → cli`; `web/` imports nothing from `src/` but
`import type` from `src/shared/DashboardContract.ts`. Nothing does work at module load except the entry points
(`agent-dashboard.ts`, `web/Main.tsx`, and the bridge's `web/bridge/BoardBridgeMain.ts`, bundled on its own).

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

Two `Bun.serve` listeners, both bound to `127.0.0.1` only, with `reusePort: false` (Bun otherwise sets `SO_REUSEPORT`
outside development mode, and a second dashboard would share the port instead of meeting `EADDRINUSE`): the
**dashboard origin** on `<port>` and the **board origin** on `<port> + 1`, which serves every project's page folder and
the bridge page and nothing else. A board page is an agent-progress file holding text agents wrote, so it never runs in
the dashboard's origin: it cannot read the dashboard's document (`window.parent.document` throws inside the frame) nor
read its API (`/api/*` sends no CORS grant, and the board page's `connect-src 'self'` refuses the request outright). The
snapshot carries the board origin (`boardOrigin`), the bridge's address (`boardBridgeUrl`) and each `pageUrl` on it;
the server record carries it too. Every request to a data route (on the dashboard origin `/api/*`, on the board origin
every route) whose `Host` header is not `127.0.0.1:<its port>`, `localhost:<its port>` or `[::1]:<its port>` (on port
80 also the bare names, as browsers send them there) is refused 403 (DNS-rebinding guard). The app shell at `/` and the
chunks Bun bundles for it are exempt: Bun answers its HTML-import route before `fetch`, and they are the public build,
holding no data. So is the install manifest `web/AppManifest.webmanifest`, which `web/index.html` links and Bun
serves under a hashed name, and its two icons, `/AppIcon192.png` and `/AppIcon512.png`, which Bun does not bundle
from the manifest, so the server routes them by fixed path before `fetch` as well. Dashboard-origin routes:

| Route | Answer |
| --- | --- |
| `GET /` | the React app (a Bun HTML import of `web/index.html`, bundled by Bun) |
| `GET /api/identity` | `ServerIdentity`, how the CLI knows a running server is the dashboard |
| `GET /api/snapshot` | the current `DashboardSnapshot` |
| `GET /api/events` | Server-Sent Events: `event: snapshot` with the whole snapshot on connect and on every change; a `: heartbeat` comment every 25 s |
| `POST /api/projects/<trackerId>/concurrency` | body `{ "limit": <n> }`, an absolute whole number from 1 to 10: runs `agent-progress concurrency <n>` in that project's root (one of the two CLI runs a click may make in a tracked repository, beside `agent-progress dispatcher stopped`), re-reads the board at once so the next snapshot carries the new limit, and answers 204. Same Host guard; 403 for an `Origin` that is present and not this server's own, 404 for an unknown tracker, 400 for any other body (no CLI run), 409 with the CLI's message on its exit 1, 502 for any other failure |
| `POST /api/projects/<trackerId>/dispatcher` | body exactly `{ "state": "stopped" }`: runs `agent-progress dispatcher stopped` in that project's root (the other CLI run a click may make in a tracked repository, beside `agent-progress concurrency <n>`), re-reads the board at once and answers 204. The running dispatcher reads the stored state as each agent returns and starts no new agent while those in flight finish; the store clears `concurrency.dispatcherRunId`, so the orchestrator is found afterwards by its working directory. Same Host guard; 403 for a foreign `Origin`, 404 for an unknown tracker, 400 for any other body (no CLI run), 409 with the CLI's message on its exit 1, 502 for any other failure |
| `POST /api/projects/<trackerId>/orchestrator-requests` | body `{ "kind": "start-building" }` or `{ "kind": "clear-low-tickets", "ticketIds": [...] }` (1 to 50 non-empty ids, each among the board's `lowPriorityWaitingTickets`): sends the text to a live dashboard-owned orchestrator as its `chat` and answers 200 `{ "recipient": "dashboard-session" }`, else writes one NDJSON line `{"type":"user","message":{"role":"user","content":<text>}}` to the board's orchestrator session's `messagingSocketPath` and answers 200 `{ "recipient": "desktop-session" }` (`OrchestratorRequestReceipt`). The text relays the user's click, names the project and says what to do: run the board through the agent-progress dispatcher, leaving a run in flight running; or triage the named tickets and launch with `includeLowPriority: true` once no run is in flight, never stopping a running dispatcher. The desktop text adds that it came as another session's message, which never carries the user's go, and asks the orchestrator to confirm with its user first (Peer messages and the user's go). The orchestrator is the one live session (pid alive, socket accepting) whose `~/.claude/projects/<slug of its cwd>/<sessionId>/subagents/workflows/` holds the board's `dispatcherRunId`, else the one live session whose `cwd` is the project root. Nothing is written to the board or the repository. Same Host guard; 403 for a foreign `Origin`, 404 for an unknown tracker, 400 for any other body, 409 for an id that is not low-priority waiting or for zero or several candidate sessions, 502 when the chosen socket fails; none of these writes to a socket |
| `POST /api/shutdown` | stops the server (used by `agent-dashboard stop`; same Host guard) |
| `POST /api/restart` | no body, header `X-Agent-Dashboard-Restart: 1` (used by the header menu's Restart server): answers 202, then stops as on shutdown, and `serve`, once both listeners are closed and its record removed, starts a detached successor `serve --port <same port>` exactly as `open` does, which writes a fresh record (new `pid` and `startedAt`) on the same dashboard and board ports. Same Host guard; 403 without the header or for a present `Origin` that is not this server's own, 405 for any other method |

`/projects/*` and the bridge are 404 on the dashboard origin. Board-origin routes, `GET` and `HEAD` only (any other
method 405), every other path 404, `/api/*` included:

| Route | Answer |
| --- | --- |
| `GET /projects/<trackerId>/page/<path>` | a file from that project's page folder: 404 for an unknown tracker, a missing file, or any path that resolves (after `realpath`) outside the folder; `Cache-Control: no-store`. `progress.html` and `progress.stamp.js` carry a CSP limiting them to the board origin (inline script and style allowed) with `frame-ancestors` naming the dashboard's origins (`http://127.0.0.1:<port> http://localhost:<port>`; CSP takes no bracketed IPv6 literal); every other file carries `Content-Security-Policy: sandbox`, so a script in a ticket's linked SVG or HTML runs in an opaque origin |
| `GET /bridge` | the bridge page: no content of its own, `<html data-dashboard-origins="…">` naming the dashboard's origins and one script; CSP `default-src 'none'; script-src 'self'`, `frame-ancestors` the dashboard's origins |
| `GET /bridge.js` | the bridge script, `web/bridge/BoardBridgeMain.ts` bundled by `Bun.build` on its first request (its own small bundle, not the React app) |

#### The bridge

The board frame holds `progress.html` on the board origin; beside it the dashboard frames the bridge, hidden, on the
same board origin. The bridge is a sibling rather than the board's parent, so the board's `window.parent` is the
dashboard and `window.parent.document` throws. Same-origin with the board, the bridge finds it among its parent's
frames by the frame name `agent-dashboard-board`, and reaches what the dashboard no longer can: the board's document
and the board origin's storage. The board frame carries `sandbox="allow-scripts allow-same-origin"`: scripts for the
board's rendering and stamp polling, its own origin for its storage and for the bridge to reach it, and no
`allow-top-navigation*`, `allow-popups*` or `allow-forms`, so a script on a board page can neither navigate the
dashboard's window nor open one. The two sides talk by `postMessage` (`web/bridge/BoardBridgeMessageUtil.ts`), each
acting only on a message from the expected window and origin and of the exact shape, and ignoring any other:

| From → to | Message | Effect |
| --- | --- | --- |
| dashboard → bridge | `{ kind: 'theme', themeChoice }`, from the dashboard's window on one of the origins `/bridge` names | writes `agent-progress:theme` in the board origin's storage (a board still loading reads it), clicks the board's own theme radio, and follows the board's current document (Esc and `pagehide`) if not followed yet. Sent on every theme choice and on every load of either frame |
| bridge → dashboard | `{ kind: 'theme-chosen', themeChoice }`, from the bridge frame's window on the board origin | the board's own toggle wrote the key (a `storage` event in the bridge): the dashboard takes the choice as its toggle's |
| bridge → dashboard | `{ kind: 'leave-board' }` | Esc inside the board that the board did not use: back to the overview |
| bridge → dashboard | `{ kind: 'board-unloading' }` | the board's `pagehide` (its stamp reload, Reload): the frame hides until its next `load` |

### The command line

| Command | Does |
| --- | --- |
| `agent-dashboard [open] [--port <n>] [--no-open]` | Reuse the running server (server record + `GET /api/identity` answering), or start one detached (`node:child_process` `spawn` with `detached: true`, output to `~/.agent-progress-monitor/agent-dashboard/server.log`, `unref()`), wait until its identity answers (at most 5 s), then open the URL with the platform opener (`open`, `xdg-open`, `cmd /c start`). Prints the URL. The detached server runs in `~/.agent-progress-monitor/agent-dashboard/`, never where `open` was typed. A `--port` other than the running server's is a refusal naming its URL and `stop`; without `--port` the running one is reused wherever it listens. |
| `agent-dashboard serve [--port <n>]` | Run the server in the foreground until interrupted; writes the server record, removes it on exit (only while it still names this process). After a `POST /api/restart` it hands over: with its listeners closed and its record removed it starts a detached successor on the same port as `open` starts one, then exits; dashboard-owned orchestrator supervisors keep running and the successor reconnects to them, and the page's event stream reconnects by itself (a new launch token is fetched as on any restart). Refused while the record names another dashboard that answers, so no server is ever left beyond `status` and `stop`. |
| `agent-dashboard stop` | Ask the running server to stop; nothing running is exit 0 with a line saying so. A record that cannot be read, or whose pid is gone, is stale and removed; one whose pid lives but does not answer is a refusal that leaves the record. |
| `agent-dashboard status` | Print the running server's URL and pid, or that none runs. |
| `agent-dashboard help` | One screen of help to stdout; an unknown command prints it to stderr, exit 1. |

Default port 4710, the board origin on the port above it (4711), so `--port` takes 1 to 65534. A dashboard port held by
something that is not the dashboard, or a board port held at all, is a refusal naming that port and `--port`, exit
1. `serve` and `status` print the board origin beside the URL. The server record
`~/.agent-progress-monitor/agent-dashboard/server.json` is `{ pid, port, url, boardOrigin, startedAt, version }`,
written atomically; a record without `boardOrigin` (an older dashboard's) still reads, with it null. Exit codes: 0 done, 1 refusal or unknown command, 2 anything else.

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
  pageUrl: string;                 // <boardOrigin>/projects/<trackerId>/page/progress.html
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
  machineParallelAgentLimit: number;
  boardOrigin: string;             // http://127.0.0.1:<port + 1>
  boardBridgeUrl: string;          // <boardOrigin>/bridge
  watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]>;  // see "Watched sessions"
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

`agent-dashboard supervise <trackerId> <root>`, a command the server alone runs (not in `help`), spawned detached
(`detached: true`, its own process group, stdio to its log, `unref()`), as `open` starts the server. It spawns the
session (`AGENT_DASHBOARD_CLAUDE`, else `claude` on `PATH`, else the path `setup.sh` recorded in
`~/.agent-progress-monitor/agent-dashboard/executables.json` while it still names an executable file; agent-progress
is found the same way, through `AGENT_DASHBOARD_AGENT_PROGRESS`) with the project root as working directory, its own process
group, and `--session-id <uuid>` it generates, so the record names the session before its `init` line arrives; then it
listens on a Unix socket and writes its record. It outlives its starter (the probe's
supervisor was reparented to pid 1 and served two later clients); it ends when the session exits, by itself or on Stop,
and removes its record and socket then.

- **Socket protocol** (NDJSON both ways). Client to supervisor: `{"kind":"chat","text":…}`, `{"kind":"answer",
  "requestId":…,"answers":{…}}`, `{"kind":"stop"}`. Supervisor to client: a `{"kind":"state",…}` line (the record, the
  `OrchestratorState`, pending questions, latest context usage) on connect and on every change, the last one `ended`;
  and the conversation: on connect, before the state line, `{"kind":"history","entries":[…]}` with the last 200
  entries it holds, then `{"kind":"message","entry":…}` per new one, each entry `{ sequence, message: ChatMessage }`
  numbered from 1, so a reconnecting server takes only the entries past the last sequence it holds. A chat is a `user`
  message; an `assistant` line's text blocks are `assistant` messages and its `tool_use` blocks `tool` messages (the tool
  name and its input as JSON, cut at 2000 characters), in block order
  (`src/adapters/SessionChatMessageMapper.ts`); tool results and other lines show nothing. A server takes the session's
  state from state lines alone. The state is `busy` from a `chat` until the next `result`, `waiting-for-answer` while a question is held, else
  `idle`; `starting` is the server's own, from reading a record until its first state line.
  Writes to a client are buffered per client and drained (`drain`), since one `write` of a 20 kB `init` line was cut
  short in the probe.
- **Questions**: an `AskUserQuestion` `control_request` is held as pending until answered, whether or not a server is
  connected. Any other `can_use_tool` request is denied at once with `behavior: "deny"`: permission prompts are not
  surfaced.
- **Stop**: the supervisor closes the session's stdin and sends `SIGTERM` to the session's process group after 10 s
  if it still runs; it records the exit code (143 for the signal, as in the probe) in its log before it removes its record and socket.
- **Reconnecting**: the server reads every record at start and connects to each socket that accepts; a record whose
  supervisor pid is gone is stale and removed. A connection that drops is retried every 5 s while the record lives;
  once the record or its supervisor is gone the session shows `ended` until the server restarts.
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

The two deliveries are worded apart. A dashboard-owned session gets the request text alone and acts on the one click.
A desktop session reached through its socket gets the same text followed by a sentence saying it came as another
session's message, which never carries its user's go, and asking it to confirm with its user before it runs the
dispatcher or triages anything. The route's 200 answer names the recipient, so the button's note after a desktop
delivery reads "Sent: the orchestrator will ask you to confirm" instead of "Sent to the orchestrator".

### Context usage

Used tokens are the last assistant turn's `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`;
the share divides them by the context window. A dashboard-owned session takes the window from its latest `result`'s
`modelUsage`. A watched session's usage comes from the last `assistant` line of `~/.claude/projects/<slug of its
cwd>/<sessionId>.jsonl` (the same `message.usage` fields and `message.model`); that transcript carries no context
window, so a watched session's share is shown only when a dashboard-owned session has reported the window for the same
model, else the token count alone. Only the transcript's last `TRANSCRIPT_TAIL_BYTES` (256 KiB,
`src/shared/constants/DashboardLimits.ts`) are read (`src/adapters/TranscriptUsageReader.ts`), so a transcript of any
size costs one bounded read; a missing or unreadable transcript, or a tail with no real `assistant` usage (Claude Code's
`<synthetic>` turns are skipped), is usage unknown (`context: null`), never a throw.

### Watched sessions

A watched session is a live Claude Code session in a project's root the dashboard did not start: every record in
`~/.claude/sessions/` whose `cwd` resolves to the root and whose pid is alive
(`findWatchedSessions` in `src/adapters/OrchestratorSessionFinder.ts`), less every dashboard-owned session, matched by
its session pid or its session id, so a dashboard-owned session is never also watched. No socket is probed for the list.
Each is an `OrchestratorSession` with `ownership: "watched"`, its record's `sessionId`, `pid`, `name` and `startedAt`
(null when absent), `state` `busy` when the record's `status` is `busy`, else `idle`, its context usage from its
transcript, and no pending questions: its questions are answered in its own app. Its conversation is not streamed;
chat to it is send-only. The snapshot carries them per project in `watchedOrchestratorsByTracker`, every project a key,
read afresh for every snapshot served, so a watched session's status and usage are as fresh as the latest snapshot
event (at most the safety sweep's 60 s old while its board is quiet).

### Routes

Every route below takes the server's Host guard, 403 for a present foreign `Origin`, and 404 for an unknown tracker.
Start, stop, messages, answers and handoff are stricter: the server issues a random launch token when it starts, held in memory
only (never in the app shell at `/`, which Bun answers before the Host guard, nor the log, the server record or a
tracked repository), and a start, stop, message, answer or handoff whose `X-Agent-Dashboard-Launch-Token` header is not that token, or whose `Origin` is missing or not
this server's own, is refused 403 before anything is read, spawned or written to a session. The event stream takes no
token (an `EventSource` sends no header), refuses a present foreign `Origin` and sends no CORS headers. The token is the answer of a Host-guarded
`GET /api/launch-token` (`LaunchToken`, 403 for a foreign `Origin`), which a page elsewhere cannot read (no CORS grant)
and a DNS-rebinding page cannot reach (its `Host` is not the server's).

| Route | Answer |
| --- | --- |
| `POST /api/projects/<trackerId>/orchestrator` | body `{ "startBuilding": <boolean> }`: starts the supervisor in the project's root and answers 201 with the `OrchestratorSession` once its socket accepts (at most 10 s). With `startBuilding` true its first message is the `start-building` text of `orchestrator-requests`, carrying the user's go that `Workflow` needs. 400 for any other body, 409 while a dashboard-owned orchestrator of the project lives, 409 for a socket path over the limit, 502 when the supervisor exits or does not accept in time |
| `DELETE /api/projects/<trackerId>/orchestrator` | sends `stop` to the project's supervisor and answers 204. 404 when no dashboard-owned orchestrator lives, 409 for a watched session (the dashboard never stops what it did not start), 502 when the socket fails |
| `POST /api/projects/<trackerId>/orchestrator/messages` | body `{ "text": <string> }` or `{ "text": <string>, "sessionId": <string> }`, the text 1 to 20000 characters after trimming: a dashboard-owned session gets it as `chat`, a watched one through `src/adapters/SessionMessageWriter.ts` to its `messagingSocketPath`, where it is a peer's request that never carries the user's go; 204. The text is sent trimmed. With `sessionId` it goes to that session alone: the project's dashboard-owned one, or one of its watched sessions; without it, to the live dashboard-owned session, else the one the finder names. 400 for any other body, 409 for a `sessionId` that names neither a live dashboard-owned session nor a live watched one of the project (a session that is gone), or, without one, when no dashboard-owned session lives and the finder refuses (no or several sessions), 502 when the socket fails |
| `POST /api/projects/<trackerId>/orchestrator/answers` | body `{ "requestId": <string>, "answers": { "<question>": "<answer>" } }`, one non-empty answer for every question of that pending request (a label it offered, labels joined for a multi-select, or free text for an "Other" choice): sent as `answer`, 204; the request is no longer pending from then on, so a second answer is 409 and the supervisor ignores an answer to a request it no longer holds. 400 for any other body, 404 when no dashboard-owned orchestrator ran since this server started, 409 for one that has ended, a `requestId` that is not pending, or an answer naming a question not asked or leaving one out, 502 when the socket fails |
| `POST /api/projects/<trackerId>/orchestrator/handoff` | no body; the launch token and this server's own `Origin` as for a start. Hands the board to a fresh session (see "Handing off") and answers 201 with `OrchestratorHandoffResult` `{ session, notePath }`. 404 when no dashboard-owned orchestrator ran since this server started; 409, changing nothing and saying which, for an ended session, a pending question, a session not `idle`, a dispatcher `running` or a board that cannot be read, or a handoff of the project already under way; 502 when the session ends, asks a question or gives no reply in time (the old session left running, nothing started), or when the stop or the fresh start fails after the note was kept (the text names the note's path) |
| `GET /api/projects/<trackerId>/orchestrator/events` | Server-Sent Events: `event: history` with the project's dashboard-owned conversation (the last 200 `ChatMessage`s, from the session's start) on connect, then `event: session` with the `OrchestratorSession` (null for none), then `event: message` per new message and `event: session` on every change of it; a `: heartbeat` comment every 25 s. A project with no dashboard-owned session streams an empty history and waits for one. A watched session's messages are to be tailed from its transcript (not built yet) |

### Handing off

A handoff (`src/services/OrchestratorHandoff.ts`) replaces a dashboard-owned orchestrator whose context fills up with a
fresh one, instead of letting it compact and forget what it was weighing. In order: the running session gets one fixed
chat (`HANDOFF_NOTE_REQUEST`), and the assistant text of the turn it opens, once the session is idle again, is the note;
the note is written atomically to `~/.agent-progress-monitor/agent-dashboard/handoffs/<trackerId>-<stamp>.md` (the
tracker id with every character but letters, digits, `_` and `-` made a dash; the stamp the ISO instant with `:` as
`-`), never into the tracked repository; the session is stopped and awaited until it shows `ended` (at most
`HANDOFF_END_TIMEOUT_MILLISECONDS`, 15 s); and a fresh supervisor starts in the same root whose first message says it
continues the previous orchestrator's work, names the previous session and the note's path, and carries the note. The
fresh session's `previousSessionId` names the old one, held by the server, so a server restart forgets it.
Until the note is kept nothing is stopped: a session that ends, asks a question, or gives no complete reply within
`HANDOFF_REPLY_TIMEOUT_MILLISECONDS` (180 s, `src/shared/constants/DashboardLimits.ts`) is left as it is, and nothing
starts. The wait bounds one request; no clock schedules a handoff.
A handoff is refused while the board's dispatcher is `running` (read afresh for the request; an unreadable board is
refused too), since a fresh session is not proven to resume a Workflow run another session launched.

The snapshot carries each project's dashboard-owned `orchestrator` (live, or `ended` since this server started; null
for none) so the overview needs no second stream, and the event stream sends a snapshot on every change of its state.
When one lives, `orchestrator-requests` sends its text to it as `chat`, before any `~/.claude/sessions/` lookup, and
answers `{ "recipient": "dashboard-session" }`.

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
  name: string | null;                  // a watched session's record name; null for a dashboard-owned one
  state: OrchestratorState;
  startedAt: string | null;
  context: ContextUsage | null;
  pendingQuestions: PendingQuestion[];  // always empty for a watched session
  previousSessionId: string | null;     // the session a handoff took the board from, while this server runs
}

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';
export interface ChatMessage { at: string; role: ChatRole; text: string }

export interface OrchestratorStartRequest { startBuilding: boolean }
export interface OrchestratorChatRequest { text: string; sessionId?: string }
export interface OrchestratorAnswerRequest { requestId: string; answers: Record<string, string> }
export interface LaunchToken { token: string }
export interface OrchestratorHandoffResult { session: OrchestratorSession; notePath: string }

// ProjectSnapshot gains: orchestrator: OrchestratorSession | null;
// DashboardSnapshot gains: watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]>;
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
  The dashboard's toggle writes it; every new choice, the toggle's or one a `storage` event brings from another
  dashboard tab, is sent to the bridge, which writes it in the board origin's storage and clicks the open board's own
  radio; the board's own toggle reaches the dashboard as the bridge's `theme-chosen` message (see "The bridge"). The toggle is a radio group
  as the template's is: one tab stop, the arrow keys move the choice.
- **Live status**: the template's `.ap-status-dot` idiom: a `--status-live` dot that pulses while the event stream
  is connected, grey with "reconnecting" when it is not, and "updated 45s ago" from the last snapshot ("updated just now" under 30 seconds, as is the
  reconnecting banner's "last update just now"). Only the
  connection word is a live region; the age is not announced.

### Overview (`#/`)

- **Header** (one line, wraps on a phone): the name `agent-dashboard` with the dashboard menu beside it, the live status, then header stats in the
  template's `.ap-head-stats` manner: Projects, Agents (in flight across every board / the machine's parallel
  maximum, `availableParallelism()` as the CLI reads it and the snapshot carries it as `machineParallelAgentLimit`;
  the projects' concurrency limits are not summed here), Ready, Awaiting review, Held; the
  notification control, the Inbox control and the theme toggle at the end.
- **Dashboard menu** (beside the title on every view): a hamburger toggle named "Dashboard menu" opening a panel with
  one item, "Restart server". Choosing it asks "Restart the dashboard server?" with Restart and Cancel in the panel;
  Cancel returns to the item without a request, Restart sends `POST /api/restart` and closes the menu, after which the
  reconnecting banner shows until the successor answers. A refusal is shown in the panel. The menu closes as the
  Inbox does: Escape (focus back on the toggle), an outside pointerdown, the window's blur.
- **Inbox** (in the header on every view): a button with the count of questions every live dashboard-owned
  orchestrator owes, across all projects (watched desktop sessions' questions stay in the desktop app). It opens a
  panel listing them oldest first, each with its project (a link to its board), how long it has waited and the same
  question card the board's orchestrator panel shows (`web/questions/PendingQuestionForm.tsx`), answered in place
  through the answers route; a card leaves when a snapshot no longer holds the request, wherever it was answered.
  Esc closes the panel before it can leave a board. The panel also closes on a press anywhere outside it and its
  button, and when the dashboard window loses focus (a click into the board frame or another app), so it is never
  left open over a board whose own Esc leaves the board. While a question waits, the tab title starts with `(<n>) `.
- **Notifications** (`web/notifications/`): a header control, "Notify me", asks for the browser's permission on the
  user's click and never on load; once granted it toggles between "Notifying" and "Muted" (`aria-pressed`), both
  choices kept through `web/preferences/PreferenceStore.ts`. A notification is raised only from a transition between
  two consecutive snapshots of one connection (`NotificationTransitionUtil.notificationsDueOf`): a question asked, a
  dispatcher run gone from `running` to `finished` or `stopped`, a dashboard-owned orchestrator that ended, a session's
  context crossing `CONTEXT_CRITICAL_SHARE`. The first snapshot after the stream (re)opens is a baseline that raises
  nothing; no timer raises one, and none is raised while the tab has focus. Each is titled with its project, and
  clicking it focuses the tab on that project's board. Where `navigator.setAppBadge` exists (the dashboard installed
  as a web app in Chrome or Edge) the icon carries the inbox count, cleared at zero.
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
- The **frame**: `progress.html` from the board origin in an iframe sandboxed to `allow-scripts allow-same-origin`
  (see "The bridge") filling the rest of the viewport, no border,
  `--bg` behind it, hidden until it loads and again from the bridge's `board-unloading` to the next load; beside it the
  hidden bridge frame. Esc inside it arrives as the bridge's `leave-board`; Reload sends the frame to its page again,
  since a page on another origin cannot be told to reload. A project whose page does not exist yet shows a panel saying
  so instead. Esc in a text field (chat, an "Other" answer) stays in the field.
- The **orchestrator panel** (`web/orchestrator/OrchestratorPanel.tsx`): a 340 px column right of the frame, a bottom
  sheet (at most 70% of the height) under 768 px, collapsed to its header by its toggle, the open state remembered
  through `web/preferences/PreferenceStore.ts`. The header names the session count and a "question waiting" chip.
  "Start orchestrator" (`startBuilding` false) shows while no dashboard-owned session lives; then every session, the
  dashboard-owned one first: its name ("Dashboard orchestrator", a watched one its record name or "Session <id>"), a
  state pill (`busy` in-progress, `idle` pending, `waiting` in-review, `starting` paused, `ended` abandoned, plus a
  `watched` pill), the context meter, and a chat box (Enter sends, Shift+Enter a newline, disabled for an ended session).
  A dashboard-owned session adds its pending questions as forms (a radio group, or checkboxes for a multi-select, each
  with a free-text "Other"; typing into "Other" chooses it; one Answer for the whole request), its conversation (user
  and assistant turns as plain text, a tool call as one collapsed `<details>` line, scrolled to the newest), Stop and a
  quiet "Hand off…" (`web/orchestrator/HandoffControl.tsx`). From 80% of a known window (`CONTEXT_CRITICAL_SHARE`,
  `web/constants/WebLimits.ts`) the panel warns in `--err-ink` and the button turns loud; it never acts by itself. A
  click asks to confirm inline: "Hand off asks for a note, stops this session, starts a fresh one with the note." A
  watched session offers neither Stop, Hand off nor answers. Every request carries the launch token; a refusal shows the server's
  text inline as `--err-ink`.
- The **context meter**: an 8 px bar (6 px compact) and "62% of 200k", green (`reviewed`) under 50%, amber
  (`in-progress`) from 50%, the bar `--err-ink` from 80%; a window not known reads "48k tokens" over an empty bar.
- Every overview card (a "Session" row over the slots) and rail row of a project with a session shows its leading
  session's name, state pill, compact meter, "question waiting" chip and "+n" for more sessions; a project without one
  shows none. A waiting question also rings the project's status dot in `--link`, on the card and the rail.

## Conventions

The owner's conventions as agent-progress's `CLAUDE.md` holds them, applied here: one purpose per file, a file
`PascalCase.ts(x)` named after its main export, folders lower case, no barrels; full descriptive names, no
abbreviations (only `i`, `a`, `b`); design constants `SCREAMING_CASE` with their unit; a util is a frozen object of
pure functions; factories of closures over classes; verdicts not throws from readers; `process.env` only in
`src/shared/Environment.ts`, `process.exit` only in `agent-dashboard.ts`, `process.cwd`/`homedir()`/the clock only
in `cli/CommandContext.ts`; browser storage only in `web/preferences/PreferenceStore.ts`; specs beside their module
as `<Module>.spec.ts`, under a scratch root, never the live registry. Verify with
`bun run typecheck && bun test && bun run lint`.
