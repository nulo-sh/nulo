# Required-check name mismatch

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Branch protection on both long-running branches now requires the bare names the aggregator jobs actually produce, pinned to GitHub Actions; the re-point tooling lives in `scripts/ci-cd/required-checks.sh` and `scripts/ci-cd/required-checks.ts`, and the rule is stated in the branching section of `CLAUDE.md`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Rename the three required aggregator jobs to distinct bare names and re-point branch protection at them, one branch at a time, with a union step before the finalizing step. Both branches require all three status gates, and Smoke is required, not advisory.

## Why

- Protection required three contexts of the form `<Workflow> / Status`, but GitHub matches a required check by exact string against the produced check-run name. A normal job produces its bare job `name:`; only a job that calls a reusable workflow gets `caller / inner`. The workflow-level name appears in no check-run, so those contexts were phantoms that no run could ever satisfy.
- Every PR therefore sat at "waiting for status" and every merge was forced through `--admin`. That bypasses the signed-commit gate as well, which hid the real cause and led to two wrong explanations.
- All three aggregators were literally named `Status`, so there was no way to select one of them: renaming was necessary, not just re-pointing.
- A squash-merge of a self-authored PR passes the signed-commit rule, because GitHub signs the squash for the author. With the names fixed, a green self-authored PR merges with a plain `gh pr merge`.

## What shipped

- Aggregators renamed to `quality-status` and per-suite network and smoke names; the later `extension-*` renames follow the same runbook.
- Writes go through `required_status_checks.checks`, read-modify-write: the live state is read, `strict` and unrelated checks are preserved, and the Actions app id is observed from a live run before it is pinned.
- Order per branch: observe the produced names on a sacrificial PR, add the new names beside the old ones (the gate stays at least as strong as before), then drop the phantoms. The long-running stable branch is re-pointed only after the rename has reached it, or its pre-rename PRs would hang again.
- Acceptance was positive and negative: a clean self-authored PR merges without `--admin`, and a deliberately broken Biome run reddens the aggregator and blocks the merge.
- No merge queue exists on either branch, so no `merge_group` triggers were added; enabling one later needs them.
