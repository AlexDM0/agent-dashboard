#!/usr/bin/env bash
# Regenerates every README graphic from a synthetic machine that this checkout's own dashboard server runs over, and copies the
# ones README.md shows into docs/images/. Run it after any change to how the dashboard looks.
#
# Usage: .readme-graphics/regenerate.sh [--no-copy] [--keep-machine]
#   --no-copy       build into .readme-graphics/build/ only; docs/images/ is left alone
#   --keep-machine  keep the synthetic home folder and print where it is
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY="$(cd "$HERE/.." && pwd)"
BUILD="$HERE/build"
COPY_INTO_DOCS=1
DIRECTOR_OPTIONS=()
for argument in "$@"; do
  case "$argument" in
    --no-copy) COPY_INTO_DOCS=0 ;;
    --keep-machine) DIRECTOR_OPTIONS+=(--keep-machine) ;;
    *) printf "Unknown option: %s\nUsage: %s [--no-copy] [--keep-machine]\n" "$argument" "$0" >&2; exit 1 ;;
  esac
done

step() { printf "\n\033[1m%s\033[0m\n" "$1"; }

command -v bun >/dev/null || { echo "bun is required" >&2; exit 1; }
command -v agent-progress >/dev/null || { echo "agent-progress is required on PATH" >&2; exit 1; }
python3 -c 'import PIL' 2>/dev/null || { echo "python3 with Pillow is required (pip install Pillow)" >&2; exit 1; }
[[ -d "$REPOSITORY/node_modules/react" ]] || { echo "run bun install in $REPOSITORY first" >&2; exit 1; }

rm -rf "$BUILD"
mkdir -p "$BUILD"

step "1/4 Which views to photograph"
python3 "$HERE/compose.py" base-jobs "$BUILD"

step "2/4 The synthetic morning through this checkout's dashboard: animation frames, then the stills"
bun "$HERE/director.js" "$BUILD" "${DIRECTOR_OPTIONS[@]+"${DIRECTOR_OPTIONS[@]}"}"

step "3/4 Panels, window frames, terminals, the diagram and the animated hero"
python3 "$HERE/compose.py" pages "$BUILD"
bun "$HERE/shoot.js" "$BUILD/jobs/pages.json"
python3 "$HERE/compose.py" hero-gif "$BUILD"
python3 "$HERE/compose.py" optimise "$BUILD"
python3 "$HERE/compose.py" sheet "$BUILD"

step "4/4 docs/images/"
if [[ "$COPY_INTO_DOCS" == "1" ]]; then
  copied=0
  for image_name in $(grep -o 'docs/images/[A-Za-z0-9._-]*' "$REPOSITORY/README.md" | sed 's|docs/images/||' | sort -u); do
    if [[ -f "$BUILD/images/$image_name" ]]; then
      cp "$BUILD/images/$image_name" "$REPOSITORY/docs/images/"
      copied=$((copied + 1))
    fi
  done
  echo "copied the $copied images README.md shows into docs/images/; review with: git -C \"$REPOSITORY\" status docs/images"
else
  echo "left docs/images/ alone; the new images are in $BUILD/images"
fi
