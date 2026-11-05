# bun-cache-1 phase 0: consults

Panel: Codex `gpt-6.1-sol` at `high`, read-only, routed by headroom; Opus 5.5 `Plan` agent.

## Codex round 1 (plan audit, gpt-6.1-sol high): conditional approve

1. The draft rule (`jobs()` own steps) missed a reusable workflow's job that takes its caller's permissions (`_unit-tests.yml` declares none) and a setup step nested in another local composite. Demonstrated by an in-memory mutation. Accepted: the rule walks callers with the permissions each job runs with and expands composites, treating the setup-bun composite as a boundary (its caller's `cache` input). Prototype over the real tree: the six F3 jobs before the fix, a two-level caller grant caught.
2. setup-bun uses a matching `~/.bun/bin/bun` already on the runner, so "fetched for that run" also rests on a fresh runner. Partly accepted: stated as an explicit precondition with its proof (the download line per run); the suggested absence check before each setup step rejected (D7).
3. The draft gate expected a download log from `pr-quick`'s `changes` job, which sets up Bun only on a `pull_request` with dependency changes, and `preview-comment` skips dispatch. Accepted: the gate reads the dispatch's build jobs, source-rebuild's `reference-build`, and the PR run's `preview-comment`.
4. Overlap with behavior-gating's audit: accepted as an explicit disposition (that audit stays; D2).
5. `test:release` wording could read as accepting a red: accepted; local reds that reproduce at the base are diagnosis only, CI's `quality-status` stays the authority.

## Opus round 1 (Plan agent, opus): conditional approve

Same gate finding (`changes` skips its setup on a dispatch) and nested-composite finding as Codex. Added: the inline form's only observable run is the PR's own `preview-comment`; Excellent (1) promised a log from jobs that cannot run from a branch, reworded to one observed run per form plus the static rule; case (b) should remove the `cache` line (the likely regression), and the source-rebuild control repeats the real-tree check; SECURITY.md:739 should cover the inline credentialed jobs; F5 `privileged` spans `:97-103`, F7's filter is `.github/workflows/**` + `.github/actions/**`, F6 restated from P94-18's own words. Rejected: dropping the source-rebuild dispatch (the lane brief requires it), and leaving caller inheritance to a sentence (Codex demonstrated it; the fix is test-only and local).

## Final fresh Codex pass (gpt-6.1-sol high, new session): approve

One low finding: F7 cited `pr-quick.yml:116-118`; the `workflows` filter is at `:119-121`. Fixed. Its own prototype confirmed the rule (six jobs before, `[]` after, cases a-e, no false finding on the network lanes, nightly, publish-token-list, release-prerelease) and kept `runs`, D3, D4, D7 and D8.
