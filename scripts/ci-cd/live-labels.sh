#!/usr/bin/env bash
# Writes an e2e lane's `label-hit=true|false` from the pull request's live labels. An event carries
# a snapshot of the labels, which a late run of an older event would decide from; a run whose head
# the pull request has moved past fails here instead, before any suite starts, so its red result
# lands on that old head only.
#
# Usage: live-labels.sh <label>...   (true when the pull request carries any of them)
# Env: EVENT, REPO, PR, HEAD_SHA, GH_TOKEN, GITHUB_OUTPUT; RETRY_PAUSE in seconds (default 5).
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

case "$EVENT" in
workflow_dispatch)
	# A dispatch force-runs every suite whatever the labels say.
	hit=false
	;;
pull_request)
	if ! pr=$(api "repos/$REPO/pulls/$PR"); then
		echo "::error::could not read pull request #$PR"
		exit 1
	fi
	live=$(jq -r '.head.sha' <<<"$pr")
	if [ "$live" != "$HEAD_SHA" ]; then
		echo "::error::superseded by $live: this run's head $HEAD_SHA is no longer the pull request's"
		exit 1
	fi
	hit=$(jq -r --args '.labels | if type == "array" then any(.[].name; IN($ARGS.positional[])) else error("no label list") end' "$@" <<<"$pr")
	;;
*)
	echo "::error::unexpected event '$EVENT'"
	exit 1
	;;
esac
echo "label-hit=$hit" >>"$GITHUB_OUTPUT"
echo "label-hit=$hit (any of: $*)"
