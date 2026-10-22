# agent-dashboard

A Bun + TypeScript CLI that starts (or reuses) a local server over every repository the agent-progress CLI tracks on
this machine, and a React page showing the agentic work in flight and each project's own `progress.html` in a frame.
`docs/design.md` is its specification.

## Verify

`bun run typecheck && bun test && bun run lint`: all three after any TypeScript change, before calling it done.
Never ad-hoc `tsc` flags; never edit `package.json` to make a check pass.
`.githooks/pre-commit` (wired by `setup.sh`) refuses a commit failing lint or typecheck; never bypass it with
`--no-verify`.

## Rules

### Files and naming

- One purpose per file, explainable from its path and exports. A file is `PascalCase.ts(x)`, named after its main
  export; folders are lower case. No barrel files. A React hook's file is PascalCase too (`UseNow.ts`), its export
  keeping the `useX` name the rules of hooks key on.
- A util is one pure, frozen object grouping a domain, tested against its own contract, with at least two members.
- Code starts beside its only consumer and moves, generalised, on a second one; never in anticipation.
- Full, descriptive names, no abbreviations. Name a thing for what it is or does, never its layer or history, never
  shadowing a global: a question as the question, a producer for its product, a boolean as a predicate phrase.
- Design constants are `SCREAMING_CASE`, named for what they bound, with the unit.
- `eslint.config.js` holds one-letter names (`id-length`: only `i`, `a`, `b`) and inline magic numbers
  (`@typescript-eslint/no-magic-numbers`, its ignore list the arithmetic identities, off in specs, `testing/` and
  `constants/` folders).
- Everything is English. Example data is obviously synthetic: `Alex Example`, `Example Agency`.

### Imports

```
src/lib/  →  src/shared/  →  src/adapters/  →  src/services/  →  cli/
```

- `web/` imports nothing from `src/` but `import type` from `src/shared/DashboardContract.ts`.
- A `src/lib/` package knows nothing about its callers: no agent-dashboard names, file names, wording or exit codes.
  App values arrive as parameters; a refusal leaves as a verdict.

### Values and wording

- Internal values are string-literal unions, never display text. A display map exists only where the word differs
  from the value.
- All command-line text (confirmations, usage, argument errors, help) lives in `cli/`, beside the command that prints
  it; command verbs are literals, so they grep.
- `src/adapters/` holds only translations: a stored or printed format to a verdict, a document to a summary.
- The dashboard never writes a tracked repository or the registry (`~/.agent-progress-monitor/projects.json`); it
  changes a tracked repository only by running `agent-progress concurrency <n>` or `agent-progress dispatcher stopped`
  there on the user's click, so the CLI writes its own tracker. Its own files live in `~/.agent-progress-monitor/agent-dashboard/`.
- A count the agent-progress CLI already computes is taken from its `status --json --full`, never recomputed.

### Errors and exit codes

- A reader returns a verdict and fails closed: a malformed registry or a failing status run is a verdict, never a
  throw that takes down the monitor or the server.
- Library code never writes to the terminal and never exits.
- Exit codes: 0 done or nothing to do; 1 a refusal or unknown command; 2 anything else. `cli/` maps them,
  `agent-dashboard.ts` exits.

### Runtime

- `eslint.config.js` (`CONFINED_REACHES`, the clock selectors) holds `process.env` to `src/shared/Environment.ts`,
  `process.exit` to `agent-dashboard.ts`, `process.cwd`, `homedir()` and the clock in `src/` and `cli/` to
  `cli/CommandContext.ts`, `process.chdir` to nowhere, and browser storage to `web/preferences/PreferenceStore.ts`.
- No work at module load, except the entry points `agent-dashboard.ts` and `web/Main.tsx`.
- Factories of closures over classes, except for state carried across calls. A constructor does no work.
- A record keyed by outside text is indexed through `Object.hasOwn`.
- A command takes everything (directory, now, streams, platform, home) from its `CommandContext`.
- A clock decides nothing but the debounce and the sweep: timestamps are recorded and shown.

### Comments

- The code explains itself. A file header (one to three sentences) only when path and export do not; a docblock only
  for a non-obvious contract edge; an inline comment only for a why, never past two lines.
- Never restate code, narrate history or carry a measurement: those go in the commit message. Name files
  repo-rooted in backticks. `no-warning-comments` in `eslint.config.js` holds that no TODO exists.

### TypeScript and lint

- Bun runs the TypeScript; `tsc` only type-checks, under `tsconfig.json`'s strict options. Write for them:
  `process.env['NAME']`, a written fallback, conditional objects instead of spreading `undefined`.
- `eslint.config.js` holds no `!` non-null assertion and type-only imports as `type`.
- `web/` is its own DOM-only project (`web/tsconfig.json`, no Bun or Node types); its `include` names the one shared
  file it reaches.
- ESLint 9 through `@reliquary/eslint-config`, with `@reliquary/eslint-config-react` for `web/**/*.tsx`, extended
  in `eslint.config.js`; `bun run lint` is its statement.

### Tests

- A spec sits beside its module as `<Module>.spec.ts`, opening with a docblock of which cases matter and why; test
  names are claims.
- Tests never touch live data: every spec works under a scratch root, never the live registry
  `~/.agent-progress-monitor` or a real tracked repository.

### Commits

- A commit is one plain, human-written subject line, with no AI attribution.

## Repository map

```
agent-dashboard.ts   the bin shim: runs the command line and exits with its code
cli/                 the command surface: argument parsing, help, open / serve / stop / status, the server record
src/lib/             caller-agnostic building blocks: atomic file writing, debounced coalescing runner, concurrency
                     limit, contained path resolution
src/shared/          DashboardContract.ts (types the server and the web share), constants (the CLI-server protocol
                     among them), Environment.ts, UnknownValueUtil.ts
src/adapters/        the registry reader, the board status reader and the board summary mapper
src/services/        the project monitor and the dashboard server
web/                 the React frontend, its own DOM-only TypeScript project
docs/                the design
```

<!-- agent-progress:managed:start -->
## Progress tracking with agent-progress

This repository tracks its work with the `agent-progress` CLI. The tracker lives in the git-ignored
`.agent-progress/` folder at the repository root and is shared by every worktree of it, so subagents
in separate checkouts all write to the same chart.

- Run `agent-progress status --json` at the start of a session to find out what was already in
  flight. When the user asks to file, report or track a ticket, bug or research question, load the
  `agent-po` skill. Only when the user asks this session to run the board — orchestrate, work through
  the tickets, take tickets from them — load `agent-progress-orchestrate`; it loads `agent-po` itself.
  Filing or editing a ticket does not make a session the orchestrator and is never a reason to load
  that skill. `.agent-progress/reference.md` holds the ticket format, the moves and the exit codes.
- Only the orchestrator runs agents for tickets, and it runs them through the dispatcher workflow,
  `.agent-progress/agent-progress-dispatch.js`, started only on the user's go. Any other session or
  agent files a ticket when it is asked to and stops there: it never dispatches an agent to handle
  one, its own or anybody else's.
- Every agent's prompt names its row, its ticket or its review on a line of its own, and the
  `SubagentStop` hook adds every token the agent processed to that row when it stops, so where the
  hook is installed pass no `--tokens`: it would replace the sum.
- A ticket is picked up on a worktree of its own, never in the main checkout, by a builder or by a
  reviewer. The ticket's `## Brief` section, when it has one, is its builder's brief. A builder fixes
  the defects it finds beside its work when it can prove the fix, and ends by committing on its
  branch, rebasing it onto the main line and filling in its ticket's `## Handoff`: every agent leaves
  its branch ready to fast-forward into main. Nobody continues a finished agent with a follow-up
  message — a fresh agent for the remainder costs less than the one holding the whole transcript.
- A review is a clean agent following the review brief in `.agent-progress/review-brief.md`. It starts
  from the Handoff rather than redoing the work, fixes what it finds in the branch's change and the
  ticket's Acceptance, settles its own doubts, rebases onto the main line again, and releases the
  branch itself with `agent-progress release`, which lets one branch into main at a time. Anything
  outside that, however small, is filed unfixed as a low-priority ticket. A second review is only for
  a pass that reworked over 750 lines of code (comments and documentation not counted) in its fixes
  and rebase, and is asked for, never scheduled by the reviewer.
- File every bug, change, feature or research question the user reports as a ticket (`agent-progress ticket add
  "<title>" --type ticket|bug|research`) and move it with `agent-progress ticket start|finish|approve|deliver <id>`.
- Record milestones with `agent-progress log "<what happened>"`; `--at -5m` backfills a stamp nobody
  registered at the time.
- Never edit `.agent-progress/progress.json` by hand, and edit a ticket only below its frontmatter —
  `agent-progress ticket show <id>` prints the file path to edit.
- Run `agent-progress open` once per session so the user has the dashboard; it reloads itself within
  a minute of new data when idle as the work moves.
<!-- agent-progress:managed:end -->
