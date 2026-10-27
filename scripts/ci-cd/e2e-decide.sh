#!/usr/bin/env bash
# Decides whether an e2e lane runs its suites, from the gate inputs `live-labels.sh` wrote and the
# lane's paths filter: `run=true` on a dispatch, on a live label, or on a diff that touches the
# lane's surface, a pull request into `main` included; `run=false` otherwise. A malformed input fails the step
# instead of reading as a skip, since the lane's aggregator passes a skipped suite.
#
# Usage: e2e-decide.sh
# Env: EVENT, BASE, LABEL_HIT (true|false), SURFACE (the paths filter's verdict), GITHUB_OUTPUT.
set -euo pipefail

case "$LABEL_HIT" in
true | false) ;;
*)
	echo "::error::live.outputs.label-hit is not true/false: '$LABEL_HIT'"
	exit 1
	;;
esac
case "$SURFACE" in
true | false) ;;
*)
	echo "::error::the paths filter's verdict is not true/false: '$SURFACE'"
	exit 1
	;;
esac
if [ "$EVENT" = pull_request ] && [ -z "$BASE" ]; then
	echo "::error::live.outputs.base is empty"
	exit 1
fi
# The paths filter already answers "does this diff touch the surface?" — gating it on the base
# branch as well only creates a hole, because a stacked PR's `github.base_ref` is the branch below
# it. Only the bottom arc of a stack targets `dev`; every arc above it could reach this suite by
# LABEL alone, and a gate miss reports success-on-skip. `workflow_dispatch` still force-runs. A
# pull request into `main` is a promote or a Release PR, whose diff is everything since the last
# one, so the filter judges it like any other: a promote that leaves a lane's surface untouched
# skips that lane, and the release chain smokes the built artifact regardless.
if [ "$EVENT" = "workflow_dispatch" ] ||
	[ "$LABEL_HIT" = "true" ] ||
	[ "$SURFACE" = "true" ]; then
	echo "run=true" >>"$GITHUB_OUTPUT"
else
	echo "run=false" >>"$GITHUB_OUTPUT"
fi
