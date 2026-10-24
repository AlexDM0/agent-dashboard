#!/usr/bin/env bash
# Builds a synthetic machine for the README graphics: a home folder (the machine folder itself) holding five demo repositories, each tracked through the real
# agent-progress CLI under the story clock, and the agent-progress registry the dashboard reads. One morning is replayed across
# them; after every step worth seeing, FRAME_URL is called with the story time (the director photographs the dashboard there).
set -euo pipefail

# Usage: seed-demo.sh <machine folder outside this checkout>
#   STORY_CLOCK_FILE  the file every preloaded process reads the story time from (default <machine>/story-clock)
#   FRAME_URL         called after each animation step as FRAME_URL?at=<story time>, answering once the frame is taken (default: none)
#   AGENT_PROGRESS    the agent-progress executable (default: the one on PATH)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKOUT="$(cd "$HERE/.." && pwd -P)"
MACHINE="${1:?usage: seed-demo.sh <machine folder>}"
STORY_DAY="2026-09-24"
STORY_OFFSET="+02:00"
export TZ="Europe/Amsterdam"
unset AGENT_PROGRESS_ROOT

[[ -d "$MACHINE" ]] || { echo "The machine folder does not exist: $MACHINE" >&2; exit 1; }
MACHINE="$(cd "$MACHINE" && pwd -P)"
case "$MACHINE/" in
  "$CHECKOUT/"*) echo "The machine folder must lie outside $CHECKOUT" >&2; exit 1 ;;
esac

export HOME="$MACHINE"
DEVELOPMENT="$HOME/development"
REGISTRY="$HOME/.agent-progress-monitor/projects.json"
export STORY_CLOCK_FILE="${STORY_CLOCK_FILE:-$MACHINE/story-clock}"
export BUN_OPTIONS="--preload $HERE/freeze-clock.js"
AGENT_PROGRESS="${AGENT_PROGRESS:-$(command -v agent-progress)}"
FRAME_URL="${FRAME_URL:-}"
mkdir -p "$DEVELOPMENT" "$(dirname "$REGISTRY")"

STORY_TIME=""
at() {
  STORY_TIME="${STORY_DAY}T$1:00${STORY_OFFSET}"
  printf '%s\n' "$STORY_TIME" > "$STORY_CLOCK_FILE"
}
frame() { if [[ -n "$FRAME_URL" ]]; then curl -sf --get --data-urlencode "at=$STORY_TIME" "$FRAME_URL" > /dev/null; fi; }

# agent-progress leaves trackers in temporary folders out of its registry, so the registry is written here, as it would write it.
register() {
  local slug="$1" project_name="$2" last_command="$3"
  python3 - "$REGISTRY" "$slug" "$project_name" "$DEVELOPMENT/$slug" "$STORY_TIME" "$last_command" <<'PYTHON'
import json, os, sys
registry_path, slug, project_name, root, story_time, last_command = sys.argv[1:]
registry = json.load(open(registry_path)) if os.path.exists(registry_path) else {'version': 1, 'projects': {}}
entry = registry['projects'].get(slug) or {
    'project': project_name, 'root': root,
    'progressHtml': f'{root}/.agent-progress/progress.html', 'progressJson': f'{root}/.agent-progress/progress.json',
    'gitOrigin': f'git@github.com:example-agency/{slug}.git', 'registeredAt': story_time,
}
entry.update({'lastChangedAt': story_time, 'lastCommand': last_command})
registry['projects'][slug] = entry
temporary_path = f'{registry_path}.seed.tmp'
with open(temporary_path, 'w') as file:
    json.dump(registry, file, indent=2)
os.replace(temporary_path, registry_path)
PYTHON
}

SLUG=""
PROJECT_NAME=""
REPOSITORY=""
in_project() {
  SLUG="$1"
  PROJECT_NAME="$2"
  REPOSITORY="$DEVELOPMENT/$SLUG"
  cd "$REPOSITORY" 2>/dev/null || true
}

tracker() {
  (cd "$REPOSITORY" && "$AGENT_PROGRESS" "$@" > /dev/null)
  local verb="$1"
  if [[ "$1" == "ticket" || "$1" == "task" || "$1" == "epic" ]]; then verb="$1 $2"; fi
  register "$SLUG" "$PROJECT_NAME" "$verb"
}

git_at() { GIT_AUTHOR_DATE="$STORY_TIME" GIT_COMMITTER_DATE="$STORY_TIME" git -C "$REPOSITORY" "$@"; }

create_repository() {
  in_project "$1" "$2"
  rm -rf "$REPOSITORY"
  mkdir -p "$REPOSITORY"
  git_at init -q -b main
  git_at config user.name "Alex Example"
  git_at config user.email "alex@example.com"
  git_at config commit.gpgsign false
  printf '# %s\n' "$PROJECT_NAME" > "$REPOSITORY/README.md"
  git_at add README.md
  git_at commit -q -m "Initial commit"
  tracker init --project "$PROJECT_NAME" --no-claude-md --no-hooks
  printf '.claude/worktrees/\n' >> "$REPOSITORY/.gitignore"
  git_at add -A
  git_at commit -q -m "Adopt agent-progress"
}

# A builder's branch: a worktree off main with one commit touching the named file.
build() {
  local ticket_identifier="$1" file_path="$2" message="$3"
  local worktree="$REPOSITORY/.claude/worktrees/ticket-$ticket_identifier"
  git_at worktree add -q "$worktree" -b "ticket-$ticket_identifier" main
  mkdir -p "$worktree/$(dirname "$file_path")"
  printf '// %s\n' "$message" > "$worktree/$file_path"
  GIT_AUTHOR_DATE="$STORY_TIME" GIT_COMMITTER_DATE="$STORY_TIME" git -C "$worktree" add "$file_path"
  GIT_AUTHOR_DATE="$STORY_TIME" GIT_COMMITTER_DATE="$STORY_TIME" git -C "$worktree" commit -q -m "$message"
  append_to_ticket "$ticket_identifier" "$(printf '\n## Handoff\n\n- %s, on its branch.\n' "$message")"
  tracker ticket finish "$((10#$ticket_identifier))" --start-review --owner opus --note "Review 1 by a fresh agent"
}

# What a reviewer writes into the ticket file by hand; `release` and `approve` account every Acceptance item against it.
review_holds() {
  local ticket_identifier="$1" round="$2"
  append_to_ticket "$ticket_identifier" "$(printf '\n## Review\n\nRound %s — holds.\n\n- A1 holds — re-run by the reviewer.\n' "$round")"
}

append_to_ticket() {
  local ticket_identifier="$1" text="$2"
  printf '%s\n' "$text" >> "$(ls "$REPOSITORY"/.agent-progress/tickets/"$ticket_identifier"-*.md)"
}

release() {
  local ticket_identifier="$1" round="${2:-1}"
  local worktree="$REPOSITORY/.claude/worktrees/ticket-$ticket_identifier"
  review_holds "$ticket_identifier" "$round"
  GIT_AUTHOR_DATE="$STORY_TIME" GIT_COMMITTER_DATE="$STORY_TIME" git -C "$worktree" rebase -q main
  tracker release "$ticket_identifier" --branch "ticket-$ticket_identifier" --worktree "$worktree" --main main
}

claim() { tracker ticket claim "$1" --owner opus --note "Built by the dispatcher on ticket-$(printf '%03d' "$1")"; }

file() {
  local title="$1"
  tracker ticket add "$@" --body "$(printf '## Report\n\nSynthetic ticket for the README graphics.\n\n## Wanted\n\n%s.\n\n## Acceptance\n\nA1. %s works as described.\n' "$title" "$title")"
}

rm -f "$REGISTRY"

# Design System: a short run that finished before the morning starts.
at 07:30; create_repository design-system "Design System"
at 07:31
file "Colour tokens for both themes" --type ticket
file "Focus rings meet contrast" --type bug --priority high
file "Button sizes" --type ticket
file "Spacing scale" --type ticket
at 07:32; tracker concurrency 2
at 07:33; tracker dispatcher running --run wf_example-0101
at 07:34; claim 1; claim 2
at 08:02; build 002 src/Focus.css "Focus rings at 3:1 against every surface"
at 08:10; build 001 src/Tokens.css "Colour tokens for light and dark"
at 08:21; release 002; claim 3
at 08:29; release 001; claim 4
at 08:40; build 003 src/Button.css "Three button sizes"
at 08:44; build 004 src/Spacing.css "A four-point spacing scale"
at 08:51; release 003
at 08:55; release 004
at 08:56; tracker dispatcher finished

# Research Wiki: running when the morning starts, finished by noon.
at 08:40; create_repository research-wiki "Research Wiki"
at 08:41
file "Compare vector stores" --type research
file "Summarise the caching paper" --type research
file "Search across notebooks" --type ticket
file "Citation export" --type ticket
file "Broken links in old notes" --type bug
at 08:44; tracker concurrency 2
at 08:45; tracker dispatcher running --run wf_example-0201
at 08:46; claim 1; claim 2

# Invoice Service and Example Storefront file their first tickets.
at 09:00; create_repository example-storefront "Example Storefront"
at 09:01
tracker epic add checkout-redesign "Checkout redesign" --body "One page from basket to payment."
tracker epic add customer-account "Customer account" --body "Account pages customers come back to."
at 09:02; file "Gift card ignored" --type bug --priority high --epic checkout-redesign
at 09:04; file "Orders CSV export" --type ticket
at 09:06; file "Accent-blind search" --type bug
at 09:08; file "Account pages dark mode" --type ticket --epic customer-account
at 09:09; file "Delivery ETA" --type ticket --depends-on 4
at 09:10; file "Replace carousel" --type ticket

at 09:11; create_repository invoice-service "Invoice Service"
at 09:12
file "PDF invoices in the customer's language" --type ticket
file "VAT reverse charge for EU businesses" --type ticket --priority high
file "Credit notes" --type ticket
file "Late payment reminders" --type ticket --depends-on 3
file "Export to the bookkeeping package" --type ticket --priority low
frame

in_project example-storefront "Example Storefront"
at 09:13; tracker concurrency 3; tracker dispatcher running --run wf_example-0001; frame
at 09:15; claim 1; claim 2; claim 3; frame

in_project research-wiki "Research Wiki"
at 09:30; build 001 notes/vector-stores.md "Vector store comparison"; frame

in_project invoice-service "Invoice Service"
at 09:40; tracker concurrency 2; tracker dispatcher running --run wf_example-0301; frame
at 09:41; claim 2; claim 1; frame

in_project research-wiki "Research Wiki"
at 09:55; release 001; claim 3; frame
at 10:10; build 002 notes/caching.md "Caching paper summary"; frame

in_project example-storefront "Example Storefront"
at 10:22; build 001 src/checkout/Total.ts "Subtract the applied gift card before charging"; frame

in_project invoice-service "Invoice Service"
at 10:35; build 002 src/tax/ReverseCharge.ts "Reverse charge for EU businesses with a VAT number"; frame

in_project research-wiki "Research Wiki"
at 10:40; release 002; claim 4; frame

in_project example-storefront "Example Storefront"
at 10:48; build 002 src/admin/export/OrdersCsv.ts "Stream the filtered orders list as CSV"; frame

in_project research-wiki "Research Wiki"
at 10:50; build 003 src/search/Notebooks.ts "Search every notebook at once"; frame

in_project example-storefront "Example Storefront"
at 10:52; file "Gift-card field accepts spaces the API then rejects" --type bug --priority low --epic checkout-redesign
at 10:58; release 001; frame
at 11:00; claim 4; frame

in_project invoice-service "Invoice Service"
at 11:05; release 002; claim 3; frame

in_project research-wiki "Research Wiki"
at 11:15; release 003; claim 5; frame

in_project example-storefront "Example Storefront"
at 11:16; tracker ticket abandon 6 --reason "The redesign removes the carousel"; frame

in_project research-wiki "Research Wiki"
at 11:20; build 004 src/export/Citations.ts "BibTeX and CSL export"; frame

in_project example-storefront "Example Storefront"
at 11:30; file "Rate-limit resets" --type ticket --priority high --epic customer-account; frame
at 11:34; review_holds 002 1; tracker ticket rereview 2 --start-review --owner opus --note "Round 2: the first pass reworked 912 lines"; frame

in_project research-wiki "Research Wiki"
at 11:45; release 004; frame

in_project invoice-service "Invoice Service"
at 11:50; build 001 src/pdf/Locale.ts "Invoice PDFs in the customer's language"; frame

in_project example-storefront "Example Storefront"
at 11:52; file "CSV export writes dates in UTC" --type bug --priority low

in_project research-wiki "Research Wiki"
at 12:05; build 005 notes/links.md "Repair links in old notes"; frame

in_project example-storefront "Example Storefront"
at 12:10; release 002 2; frame
at 12:11; claim 8; frame
at 12:20; build 003 src/search/Normalise.ts "Fold accents before matching"; frame

in_project research-wiki "Research Wiki"
at 12:30; release 005; frame
at 12:31; tracker dispatcher finished; frame

in_project invoice-service "Invoice Service"
at 12:32; release 001; frame
at 12:40; file "Dunning emails respect the customer's time zone" --type ticket
at 12:41; claim 6; frame

in_project example-storefront "Example Storefront"
at 12:48; file "Stale basket badge" --type bug; frame

in_project invoice-service "Invoice Service"
at 12:55; build 003 src/notes/CreditNote.ts "Credit notes against a paid invoice"; frame

in_project example-storefront "Example Storefront"
at 13:05; build 008 src/auth/PasswordReset.ts "Limit reset requests per address and per IP"; frame

# Example Mobile App is adopted late and waits for the user's go.
at 13:10; create_repository example-mobile-app "Example Mobile App"
at 13:11
file "Offline basket" --type ticket
file "Push notification opt-in" --type ticket
file "Crash on rotate in checkout" --type bug --priority high
file "App icon badges" --type ticket --priority low
file "Haptics on add to basket" --type ticket --priority low
tracker concurrency 2
frame

in_project example-storefront "Example Storefront"
at 13:28; review_holds 003 1; tracker ticket approve 3 --branch ticket-003; frame
at 13:29; claim 10; frame
at 13:31
file "Saved payment methods" --type ticket --epic checkout-redesign --depends-on 8
file "One-page checkout" --type ticket --epic checkout-redesign --depends-on 1,4,11
file "Express checkout button" --type ticket --priority low --epic checkout-redesign --depends-on 12
file "Reorder from order history" --type ticket --priority low --epic customer-account --depends-on 12
file "Search suggestions" --type ticket --priority low --depends-on 3
file "Size guide on product pages" --type ticket
frame
at 13:36; tracker log "Release of #003 waits: main moved, the reviewer is rebasing ticket-003"; frame
at 13:40; frame

echo "seeded $(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))['projects']))" "$REGISTRY") projects under $HOME"
