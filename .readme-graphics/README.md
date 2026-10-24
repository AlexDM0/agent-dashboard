# README graphics

Everything that produced the panels, animation, terminals and diagram in `docs/images/`, kept in the repository, with
only its `build/` ignored by git. The dashboard images are **photographed from this checkout's own server**: a
synthetic machine (a home folder with five demo repositories) is built through the real `agent-progress` CLI with a
pinned clock, this checkout's `agent-dashboard serve` runs over it, and headless Chrome photographs the page. So after
a change to how the dashboard looks, one command redraws them all.

## After a UI change

```sh
.readme-graphics/regenerate.sh              # about 2½ minutes; overwrites the images README.md shows in docs/images/
git status docs/images                      # the images whose pixels changed
```

`--no-copy` builds into `build/images/` without touching `docs/images/`; `--keep-machine` keeps the synthetic home
folder and prints where it is, so you can run `HOME=<it> agent-dashboard serve --port 4800` over it yourself. Look at
`build/contact-sheet.png` for every generated image on one page, and `build/server.log` for the server's output.

The clock is pinned: every process (the CLI, the server, its supervisors, the stand-in sessions) reads the story time
through `freeze-clock.js`, and Chrome's clock is frozen to the same instant, so ages and stamps read as the story says.
The stills are taken a few real seconds after 13:40, so a "23s" in the chat window may move by a second between runs.

## Requirements

Bun, `agent-progress` on `PATH`, Python 3 with Pillow, Google Chrome or Chromium (`CHROME_BINARY` overrides the path),
and `bun install` run in the checkout.

## Files

| file | what it does |
|---|---|
| `regenerate.sh` | The one command: the job lists → the director (frames and stills) → panels, frames, terminals, diagram and icon → the animated hero → copy the images the root README.md references into `docs/images/`. |
| `seed-demo.sh` | The synthetic machine and its morning, 07:30–13:40, as real CLI commands under the story clock: Design System (finished early), Research Wiki (a run that finishes at 12:31), Example Storefront and Invoice Service (running at the end), Example Mobile App (adopted at 13:10, waiting for the user's go). Real git branches and `release`s in each repository. It writes the registry itself, since agent-progress leaves trackers in temporary folders out of it. Calls `FRAME_URL` after every step the animation shows. Edit the story here. |
| `director.js` | Starts this checkout's server over the machine (`HOME` pointed at it, `AGENT_DASHBOARD_CLAUDE` at the stand-in), runs `seed-demo.sh` and photographs the overview at each `FRAME_URL` call once the server has caught up, then starts an orchestrator and a product owner on Example Storefront through the dashboard's own routes, sends each one chat message, and takes the stills from `build/jobs/base.json`. It stops the sessions and the server, and removes the machine, when done. |
| `demo-claude.js` | The stand-in for `claude -p` in stream-json: a scripted orchestrator (reads the board; asked about the checkout, ends on a pending `AskUserQuestion`) and product owner (files #017). Edit the conversation here. |
| `freeze-clock.js` | Preloaded through `BUN_OPTIONS`: every `Date` reads the instant in `STORY_CLOCK_FILE` plus the real time since it was written. |
| `chrome.js` | Headless Chrome over the DevTools protocol, shared by the director and `shoot.js`: viewport, colour scheme, frozen clock in every frame, pre-seeded `localStorage`, an in-page action, measurements, the screenshot. |
| `shoot.js` | Screenshots of the local pages `compose.py` writes (panels, frames, terminals, diagram, icon). |
| `compose.py` | The layout: which views to photograph (`base-jobs`), the panels with their headlines and subheads, window frames, terminal windows, the diagram and icon (`pages`), the animated hero (`hero-gif`), lossless recompression (`optimise`) and the contact sheet (`sheet`). |

## What is written by hand

- **The terminal windows** (`terminal-setup`, `terminal-open`) are text in `compose.py`'s `TERMINALS`, copied from what
  `setup.sh` and the CLI print, home paths shortened. When either output changes, change the text there.
- **The architecture diagram** is `docs/images/architecture.svg`; edit it when the mechanism changes. `regenerate.sh`
  only rasterises it.
- **The icon** is `web/AppIcon512.png`; `regenerate.sh` only scales it.
- **The words on the README**, including what it says the panels show, are written by hand. Changing the story in
  `seed-demo.sh` or `demo-claude.js` means checking the alt texts there.

## Safety

The synthetic machine is always a fresh folder under `/tmp` (short, so a supervisor's socket path stays under macOS's
103 bytes), and every process the director starts gets `HOME` pointed at it, so neither the registry
`~/.agent-progress-monitor` nor any real repository or Claude session is touched. `seed-demo.sh` refuses a machine
folder inside this checkout and unsets `AGENT_PROGRESS_ROOT`. The server runs on a random free port, so a dashboard
you have open keeps running.

## The images and what each shows

| file | shows | used by |
|---|---|---|
| `panel-watch.gif` | "Every project, live." — the Projects view replayed from 09:12 to 13:40 inside the panel's window. | README.md (hero) |
| `panel-watch.png` | The same panel, still: the base the GIF is laid into. | — |
| `panel-chat.png` | "Answer your agents in one place." — the chat window, dark, on the orchestrator's waiting question. | README.md |
| `panel-board.png` | "Each board, one click away." — Example Storefront's board inside the dashboard. | README.md |
| `panel-fleet.png` | "The whole fleet in one table." — the Fleet view with Needs you. | README.md |
| `panel-product-owner.png` | "File tickets by talking." — the crew drawer on the Product owner tab. | README.md |
| `panel-themes.png` | "Light or dark. Your call." — the Projects view split diagonally, light and dark. | README.md |
| `frame-*.png` | The overview and board in a macOS window, light or dark. | — |
| `terminal-setup.png`, `terminal-open.png` | `./setup.sh` and the CLI in a terminal window. | README.md |
| `architecture.png` | The diagram (SVG source in `docs/images/`). | README.md |
| `icon.png` | The app icon at README size. | README.md |
