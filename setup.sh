#!/usr/bin/env bash
# setup.sh — install the agent-dashboard tooling on this machine: `bun install`, this repository's
# `core.hooksPath` pointed at its tracked `.githooks/`, and `bun link` so `agent-dashboard` is on PATH.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ok()   { printf "  \033[32m✔\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m•\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✘\033[0m %s\n" "$1"; }
step() { printf "\n\033[1m%s\033[0m\n" "$1"; }

step "1/3 Dependencies (bun install)"
export PATH="$HOME/.bun/bin:$PATH"
command -v bun >/dev/null 2>&1 || { fail "Bun is required. Install it from https://bun.sh and re-run ./setup.sh"; exit 1; }
if ( cd "$HERE" && bun install >/dev/null 2>&1 ); then
  ok "dependencies installed (bun install in $HERE)"
else
  fail "bun install failed — run it yourself in $HERE"
  exit 1
fi

step "2/3 The pre-commit hook (git config core.hooksPath)"
git -C "$HERE" config core.hooksPath .githooks
ok "core.hooksPath set to .githooks"

step "3/3 The global agent-dashboard command (bun link)"
if ( cd "$HERE" && bun link >/dev/null 2>&1 ); then
  if command -v agent-dashboard >/dev/null 2>&1; then
    ok "agent-dashboard is on your PATH ($(command -v agent-dashboard))"
  else
    warn "agent-dashboard linked, but ~/.bun/bin is not on your PATH in this shell"
  fi
else
  warn "bun link failed — you can still run: bun \"$HERE/agent-dashboard.ts\" <command>"
fi

printf "\n\033[1mTooling ready.\033[0m\n"
