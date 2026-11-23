#!/usr/bin/env bash
# Decides whether an e2e lane runs its suites, from the gate inputs `live-labels.sh` wrote and the
# lane's two paths filters: `run=true` on a dispatch, on a live label, or on a diff that touches the
# extension's build inputs or the lane's own surface, a pull request into `main` included;
# `run=false` otherwise. A malformed input fails the step instead of reading as a skip, since the
# lane's aggregator passes a skipped suite.
#
# Usage: e2e-decide.sh
# Env: EVENT, BASE, LABEL_HIT (true|false), BUILD (the shared build-input filter's verdict),
# SURFACE (the lane's own filter's verdict), GITHUB_OUTPUT.
set -euo pipefail

case "$LABEL_HIT" in
true | false) ;;
*)
	echo "::error::live.outputs.label-hit is not true/false: '$LABEL_HIT'"
	exit 1
	;;
esac
for verdict in BUILD SURFACE; do
	case "${!verdict}" in
	true | false) ;;
	*)
		echo "::error::the $verdict paths filter's verdict is not true/false: '${!verdict}'"
		exit 1
		;;
	esac
done
if [ "$EVENT" = pull_request ] && [ -z "$BASE" ]; then
	echo "::error::live.outputs.base is empty"
	exit 1
fi
# The paths filters already answer "does this diff touch the surface?" — gating them on the base
# branch as well only creates a hole, because a stacked PR's `github.base_ref` is the branch below
# it. Only the bottom arc of a stack targets `dev`; every arc above it could reach this suite by
# LABEL alone, and a gate miss reports success-on-skip. `workflow_dispatch` still force-runs. A
# pull request into `main` is a promote or a Release PR, whose diff is everything since the last
# one, so the filter judges it like any other: a promote that leaves a lane's surface untouched
# skips that lane, and the release chain smokes the built artifact regardless.
if [ "$EVENT" = "workflow_dispatch" ] ||
	[ "$LABEL_HIT" = "true" ] ||
	[ "$BUILD" = "true" ] ||
	[ "$SURFACE" = "true" ]; then
	echo "run=true" >>"$GITHUB_OUTPUT"
else
	echo "run=false" >>"$GITHUB_OUTPUT"
fi
