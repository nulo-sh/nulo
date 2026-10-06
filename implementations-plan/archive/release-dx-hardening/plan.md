# Release developer experience hardening

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the release pipeline in `.github/workflows/release.yml` tags and publishes a merged Release PR by itself behind a switch, opens the post-release sync PR, and runs with a read-only default token; its logic lives in tested scripts under `scripts/release/`, and the runbook is the release section of `CLAUDE.md`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Turn the dev-to-main release from a babysat operation of about ten manual commands, several admin bypasses and a hand-built sync into a near one-click one: merge the promote PR, merge the Release PR, and merge the sync PR. The release logic moves out of workflow YAML into `bun:test`-able scripts, and the work is staged so each new automation ships inert first and is switched on after one observed release.

- The upstream abort of the release-please action stays unfixed. Only the manual tag-and-release workaround is automated, as a job inside the same workflow run so it stays in one concurrency group and cannot race a second writer.
- A job acts only when the commit is a merged Release PR still labelled pending, checked by the PR attached to the commit rather than by a title. It creates the tag and release if absent, refuses a tag already pointing at another commit, and is idempotent. A repository variable switches it on, and the manual procedure stays as the permanent fallback.
- After a stable publish, a push-only job branches from `main`, re-baselines the prerelease manifest and opens one sync PR, letting GitHub decide mergeability. A conflicted PR is labelled for manual resolution, never silently dropped. A manual republish of an old tag never re-triggers it.

## Why

A wrong release change breaks every release, and the automation holds the write token, so it was built to fail closed and prove itself in stages. A rehearsal in a throwaway repository with dummy secrets later found a real defect the unit tests missed: adding a label that did not yet exist crashed the job after the tag had been pushed, leaving a tag with no release. Both jobs now create the label idempotently first. The rehearsal could not exercise the real app token, branch rulesets or environment protection, so the first release with the switch on remained the true acceptance.

## What shipped

- Tested scripts for the tag parser, the auto-unstick and the sync PR in `scripts/release/`, with the workflows calling them and shell checks covering them.
- `bump-minor-pre-major` on both release-please configs, so a breaking change in the 0.x series bumps the minor and a 1.0.0 needs an explicit `Release-As`.
- A commit-message gate that skips promote and Release PRs to `main`, whose subjects are non-conventional by design and whose range only re-lints already-merged history. Linting the merge subject there was tried and reverted, since it would have blocked every promote.
- A default `contents: read` token for the whole workflow, with write granted only to the release-please, auto-unstick, attach-assets and sync jobs.
- A single-sourced chain identity for the faucet and a post-deploy check of its build id, emitted into both the page and a JSON file so a stale cache could not pass. Both belonged to the faucet, which now lives in the unleashed repository.
- A teachable runbook: a happy path first, what each automated piece does, manual fallbacks, the staged-rollout switches and a troubleshooting table, in `CLAUDE.md`.
