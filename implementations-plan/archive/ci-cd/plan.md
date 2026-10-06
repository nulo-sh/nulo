# CI/CD bring-up

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The per-package change-detected PR gates, reusable workflows and composite actions, the release workflows with `cliff.toml` notes, and the stale-branch pruner. Live in `.github/workflows/`, `.github/actions/`, `scripts/ci-cd/prune-stale-branches.sh` and `CI.md`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Take a repository with no CI to two long-lived branches, `main` (stable) and `dev` (integration), with change-detected gates:

- A `changes` job using a path filter feeds every real job; a doc-only or unrelated change skips the pipeline, and a single status aggregator per workflow is what branch protection requires.
- The fast lane (lint, typecheck, units, build) runs on every PR. Smoke e2e and network e2e run on promotes to `main`, on PRs touching their path filters, and on an opt-in label.
- Reusable workflows are prefixed `_` and take typed inputs; shared setup (Bun, Aztec toolchain, Puppeteer) lives in composite actions.
- Releases build Chrome and Firefox zips with a checksum file, and attach them to a GitHub Release with notes rendered by git-cliff from Conventional Commits. Store publishing started as a disabled stub.
- The first plan picked a manual release orchestrator for version bump and tag. Release-please replaced it later; the git-cliff notes stayed.

### Smoke gating

Smoke e2e was taken out of the always-on lane and gated like the network suite: automatic on PRs to `main`, automatic on `dev` PRs whose diff touches its path filter, otherwise by label. It was then flaky on first try because of a cross-file Chrome teardown problem: a browser process from one test file could survive into the next. Hardening the fixture was a separate investigation, so the check stayed non-required until it proved reliable; it is a required check today and a red smoke run is treated like any gate.

The same change added the `unlabeled` trigger to both e2e workflows, so removing a label clears a stale failing check, and a pruner for remote branches. The pruner deletes a branch only when its tip is reachable from `main` or `dev`, or a merged PR's recorded head equals the current tip (the squash-merge case), skips branches with open PRs, and never auto-deletes anything else.

## Why

A solo repository with local hooks only would ship regressions the day a second contributor or a store listing arrived. Path filtering keeps a typo fix from paying for a 25 minute network suite, while the aggregator job keeps required checks stable when jobs are skipped. A skipped job still reports success under the aggregator, which a bare conditional job does not.

Release notes from commits keep the changelog deterministic and reviewable. Chrome rejects a manifest version with a trailing dot, so prerelease versions have to be normalised into a legal four-integer form at build time, a product-build concern kept out of the release tooling.

## What shipped

- **PR gates.** `pr-quick.yml` runs the fast lane and a `quality-status` aggregator; separate smoke and network workflows (Chrome and Firefox) report their own aggregators. `actionlint.yml` lints the workflows themselves.
- **Reusable pieces.** `_`-prefixed workflows for build, units, lint and the two e2e lanes, and the `setup-*` composite actions.
- **Releases.** `release.yml` and `release-prerelease.yml`, `cliff.toml`, and the nightly prerelease; `CI.md` is the contributor guide.
- **Branch hygiene.** `scripts/ci-cd/prune-stale-branches.sh`, dry-run by default.
