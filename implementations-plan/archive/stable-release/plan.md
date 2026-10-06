# Stable release cuts

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Three stable cuts run as runbook execution on the existing pipeline (`.github/workflows/release.yml`, `scripts/release/`); the procedure lives in the release runbook in `CLAUDE.md`. No product source changed; the first cut fixed only a release-verification guard that has since been removed.
- **Open items**: the fee-cap change's post-audit follow-ups, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Each stable cut is a short blueprint, not a code change: freeze the promote commit, promote `dev` to `main` with a merge commit pinned to that commit, merge the release-please pull request, let the publish chain build and attach the zips, then merge-commit the sync back to `dev`. A cut needs three human merges; everything between them is automated. The first cut ran with automatic unsticking switched off to prove the manual path once. Later cuts ran with it on. Store publishing stays out of a cut by default.

## Why

The pipeline had been proven on prereleases, but a stable cut exercises things a prerelease cannot: the repository restructure reaching `main`, the first merge-based sync, a production landing deploy, and the version anchor for the next prerelease series. Reusing one blueprint (the second and third cuts were mostly reuse of the first) keeps each cut cheap while its pre-flight stays strict.

## What shipped

- **First cut.** Pre-flight fixes were adopted from review: the release-verification chain guard was single-sourced from the deployed app's chain constants instead of a stale hard-coded testnet, and a stale release-please branch from an abandoned attempt was deleted. The publish dispatch must opt in to network e2e. A human smoke of the live sites is a hard completion gate, because the automated check can be green while skipped.
- **Later cuts.** Pre-flight became fail-closed assertions run immediately before acting: automatic unstick on, main tip equal to the peeled last tag, no pre-existing tag or release, branch protection (up-to-date, signed commits, required contexts pinned to GitHub Actions) as expected. The promote merge is pinned server-side to the frozen commit. The annotated tag is resolved through its peeled commit, never the tag object.
- **Freshness is checked by build stamp.** A green deploy trigger proves nothing, since the host rebuilds from Git itself; the live build identifier must carry the release commit.
- **Failure shapes met and handled.** A network e2e flake is re-run, never neutralized. A cancelled superseded CI batch on the same head reports as failure and is not breakage; the live batch is authoritative. Between the manual unstick and asset upload the landing build fails repo-wide because it requires the Chrome zip, and finishing the publish fixes it. A dispatch-path publish does not refresh the landing, so it needs a manual landing rebuild after the assets attach.

## Lessons

### Agent shell

`set -e` is silently ineffective in the agent's Bash tool. A gate script printed "ASSERTIONS PASSED" and attempted the merge although two checks had failed; only the server-side required checks refused it. Gates must be an explicit `&&` chain, or check each exit code individually.
