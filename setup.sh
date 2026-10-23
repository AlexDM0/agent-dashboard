#!/usr/bin/env bash
# setup.sh — install the agent-dashboard tooling on this machine: `bun install`, this repository's
# `core.hooksPath` pointed at its tracked `.githooks/`, `bun link` so `agent-dashboard` is on PATH, and where `claude`
# and `agent-progress` live recorded in `~/.agent-progress-monitor/agent-dashboard/executables.json`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ok()   { printf "  \033[32m✔\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m•\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✘\033[0m %s\n" "$1"; }
step() { printf "\n\033[1m%s\033[0m\n" "$1"; }

step "1/4 Dependencies (bun install)"
export PATH="$HOME/.bun/bin:$PATH"
command -v bun >/dev/null 2>&1 || { fail "Bun is required. Install it from https://bun.sh and re-run ./setup.sh"; exit 1; }
if ( cd "$HERE" && bun install >/dev/null 2>&1 ); then
  ok "dependencies installed (bun install in $HERE)"
else
  fail "bun install failed — run it yourself in $HERE"
  exit 1
fi

step "2/4 The pre-commit hook (git config core.hooksPath)"
git -C "$HERE" config core.hooksPath .githooks
ok "core.hooksPath set to .githooks"

step "3/4 The global agent-dashboard command (bun link)"
if ( cd "$HERE" && bun link >/dev/null 2>&1 ); then
  if command -v agent-dashboard >/dev/null 2>&1; then
    ok "agent-dashboard is on your PATH ($(command -v agent-dashboard))"
  else
    warn "agent-dashboard linked, but ~/.bun/bin is not on your PATH in this shell"
  fi
else
  warn "bun link failed — you can still run: bun \"$HERE/agent-dashboard.ts\" <command>"
fi

step "4/4 Where claude and agent-progress live (executables.json)"
DASHBOARD_DIRECTORY="$HOME/.agent-progress-monitor/agent-dashboard"
EXECUTABLES_RECORD="$DASHBOARD_DIRECTORY/executables.json"
recorded_path_of() {
  local found
  found="$(command -v "$1" 2>/dev/null || true)"
  if [[ "$found" == /* ]]; then
    ok "$1 found at $found" >&2
    found="${found//\\/\\\\}"
    printf '"%s"' "${found//\"/\\\"}"
  else
    warn "$1 is not on PATH in this shell — recorded as null; set it on PATH and re-run ./setup.sh" >&2
    printf 'null'
  fi
}
CLAUDE_RECORDED="$(recorded_path_of claude)"
AGENT_PROGRESS_RECORDED="$(recorded_path_of agent-progress)"
mkdir -p "$DASHBOARD_DIRECTORY"
EXECUTABLES_TEMPORARY="$(mktemp "$DASHBOARD_DIRECTORY/.executables.json.XXXXXX")"
printf '{"claude": %s, "agentProgress": %s}\n' "$CLAUDE_RECORDED" "$AGENT_PROGRESS_RECORDED" > "$EXECUTABLES_TEMPORARY"
mv -f "$EXECUTABLES_TEMPORARY" "$EXECUTABLES_RECORD"
ok "recorded in $EXECUTABLES_RECORD, for a dashboard server started without them on PATH"

printf "\n\033[1mTooling ready.\033[0m\n"
