#!/usr/bin/env bash
# Writes an e2e lane's gate inputs from the pull request as it is now: `label-hit=true|false` from
# its live labels and `base` from its live base, which an event's snapshot of either would carry
# stale into a late run. A run whose head the pull request has moved past fails here instead, before
# any suite starts, so its red result lands on that old head only. `read-attempt` lets the
# aggregator refuse a skip decided in an earlier attempt that a partial re-run carried over.
#
# Usage: live-labels.sh <label>...   (label-hit is true when the pull request carries any of them)
# Env: EVENT, REPO, PR, HEAD_SHA, GH_TOKEN, GITHUB_OUTPUT, GITHUB_RUN_ATTEMPT; RETRY_PAUSE in seconds
# (default 5).
set -euo pipefail

# One retry after a pause for a rate limit, a server error or a dropped connection; any other
# refusal fails at once. Prints the body only on success, so a failed attempt never leaks into it.
api() {
	local out err attempt
	out=$(mktemp)
	err=$(mktemp)
	for attempt in 1 2; do
		if gh api "$@" >"$out" 2>"$err"; then
			cat "$out"
			rm -f "$out" "$err"
			return 0
		fi
		cat "$err" >&2
		if [ "$attempt" = 2 ] || { grep -Eq 'HTTP 4[0-9]{2}' "$err" && ! grep -Eq 'HTTP (403|429)' "$err"; }; then
			break
		fi
		sleep "${RETRY_PAUSE:-5}"
	done
	rm -f "$out" "$err"
	return 1
}

attempt=${GITHUB_RUN_ATTEMPT:?}
case "$EVENT" in
workflow_dispatch)
	# A dispatch force-runs every suite whatever the labels say.
	hit=false
	base=""
	;;
pull_request)
	# The pull request endpoint can trail a push for a moment, so a head that differs is read once
	# more before this run calls itself superseded.
	for read in 1 2; do
		if ! pr=$(api "repos/$REPO/pulls/$PR"); then
			echo "::error::could not read pull request #$PR"
			exit 1
		fi
		live=$(jq -r '.head.sha' <<<"$pr")
		[ "$live" = "$HEAD_SHA" ] && break
		if [ "$read" = 2 ]; then
			echo "::error::superseded by $live: this run's head $HEAD_SHA is no longer the pull request's"
			exit 1
		fi
		sleep "${RETRY_PAUSE:-5}"
	done
	base=$(jq -er '.base.ref | select(type == "string" and length > 0)' <<<"$pr")
	hit=$(jq -r --args '.labels | if type == "array" then any(.[].name; IN($ARGS.positional[])) else error("no label list") end' "$@" <<<"$pr")
	;;
*)
	echo "::error::unexpected event '$EVENT'"
	exit 1
	;;
esac
{
	echo "label-hit=$hit"
	echo "base=$base"
	echo "read-attempt=$attempt"
} >>"$GITHUB_OUTPUT"
echo "label-hit=$hit (any of: $*), base=$base, read at attempt $attempt"
