#!/usr/bin/env bash
# Refuses an unarmed network run whose selection holds a `@requires-proverless` file, before a
# single port or build cycle is spent: those files' e2e gate is compiled OUT of a prover-ON build,
# so they fail as an inscrutable multi-minute timeout instead of an error.
#
# Usage: proverless-guard.sh <vitest config> [vitest args...]
#
# vitest itself answers which files the arguments select (`list` and `run` share the selection),
# so a flag, a flag's value or a name filter can never be misread as a path. The selection is
# judged before `--shard` and `--experimental.preParse` narrow it, which refuses on the safe side.
# Any tool error refuses; nothing here passes on a failure.
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ "${NULO_E2E_PROVERLESS:-}" = "1" ]; then
  exit 0
fi

config=$1
shift

REMEDY="Re-run the same command with NULO_E2E_PROVERLESS=1 set."
refuse() {
  for line in "$@"; do echo "[e2e:agent] $line" >&2; done
  exit 2
}

# `list` forces non-watch mode, so vitest's own parser judges the run's: a watch run later runs
# whatever file changes.
mode=$(bun run scripts/e2e/watch-mode.ts "$@") || mode=""
case "$mode" in
  run) ;;
  watch) refuse "FATAL: an unarmed run cannot watch (a watch run later runs whatever file changes)" "$REMEDY" ;;
  *) refuse "FATAL: vitest could not read this run's arguments" ;;
esac

listing=$(mktemp)
trap 'rm -f "$listing"' EXIT
# The JSON names absolute paths, which neither `--root` nor a project name can change.
if ! bun run vitest list --filesOnly --json="$listing" --config "$config" "$@" >/dev/null; then
  refuse "FATAL: vitest could not list this run's files"
fi
if ! selected=$(jq -r '.[].file' "$listing"); then
  refuse "FATAL: vitest could not list this run's files"
fi
if [ -z "$selected" ]; then
  exit 0
fi
mapfile -t files <<< "$selected"

rc=0
marked=$(grep -l -- "@requires-proverless" "${files[@]}") || rc=$?
case "$rc" in
  0)
    lines=("FATAL: this run includes proverless-gated test file(s) but NULO_E2E_PROVERLESS is not set:")
    while IFS= read -r file; do lines+=("  ${file#"$PWD"/}"); done <<< "$marked"
    refuse "${lines[@]}" "$REMEDY"
    ;;
  1) exit 0 ;;
  *) refuse "FATAL: could not scan the selected files" ;;
esac
