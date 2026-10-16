#!/usr/bin/env bash
# An e2e lane's aggregator: an exact state machine over the job's `needs`, not a denylist of bad
# results. `changes` must have succeeded with a `run` output of true or false, and every other need
# is a suite that must have ended `success` when the gate said run, `skipped` when it said not to.
# Anything else — a malformed or empty `run` from a wiring typo, a lane with no suite, a future
# zero-entry matrix — is a fault. Checking only the failure results, or only the `run=true` branch,
# is how a suite that never executed reports a green PR. A suite missing from `needs` is invisible
# here; aggregators.test.ts holds `needs` to every job.
#
# Usage: e2e-aggregate.sh
# Env: NEEDS (the job's `toJSON(needs)`), GITHUB_RUN_ATTEMPT, GITHUB_WORKFLOW.
set -euo pipefail

attempt=${GITHUB_RUN_ATTEMPT:?}
if ! jq -e 'type == "object" and all(.[]; type == "object")' >/dev/null 2>&1 <<<"$NEEDS"; then
	echo "::error::NEEDS is not the job's needs as a JSON object of jobs"
	exit 1
fi
result=$(jq -r '(.changes.result // "") | tostring' <<<"$NEEDS")
if [ "$result" != "success" ]; then
	echo "::error::A gate-control job did not succeed: $result"
	exit 1
fi
run=$(jq -r '(.changes.outputs.run // "") | tostring' <<<"$NEEDS")
case "$run" in
true) want="success" ;;
false) want="skipped" ;;
*)
	echo "::error::changes.outputs.run is not true/false: '$run'"
	exit 1
	;;
esac
# A partial re-run carries an earlier attempt's gate over, so a skip stands only on labels read in
# this attempt.
read_attempt=$(jq -r '(.changes.outputs["read-attempt"] // "") | tostring' <<<"$NEEDS")
if [ "$run" = false ] && [ "$read_attempt" != "$attempt" ]; then
	echo "::error::the suites were skipped on labels read at attempt '$read_attempt', not this one: re-run all jobs"
	exit 1
fi
suites=$(jq -r 'to_entries[] | select(.key != "changes") | [.key, ((.value.result // "") | tostring)] | @tsv' <<<"$NEEDS")
if [ -z "$suites" ]; then
	echo "::error::the aggregator waits on no suite"
	exit 1
fi
while IFS=$'\t' read -r job result; do
	if [ "$result" != "$want" ]; then
		echo "::error::gate said run=$run, so every suite job must be '$want' — got '$result' from $job"
		exit 1
	fi
done <<<"$suites"
echo "$GITHUB_WORKFLOW gate passed (or was skipped — no relevant changes / not labeled)."
