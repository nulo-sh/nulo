# Fix the prerelease (rc) flow

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a counted rc series in `.github/release-please-prerelease-config.json`, a merge-commit main-to-dev sync opened by `scripts/release/open-sync-pr-run.ts`, and the runbook in `CLAUDE.md` that tells the owner to merge that sync PR with a merge commit.
- **Open items**: none. The prerelease steps in `CLAUDE.md` have since been corrected to the `-rc.0` first rc.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Cutting a prerelease from `dev` produced the previous stable version with no `-rc` suffix and a changelog regenerated from the first commit. The cause was branch ancestry, not a config knob, so the fix has four parts.

- **Counter**: `prerelease-type` is `rc.0`, giving `X.Y.0-rc.0`, `-rc.1` and so on. `versioning: "prerelease"` was already correct.
- **Ancestry**: `dev` must contain `main`'s release commit. A one-time signed merge commit that keeps `dev`'s tree (`-s ours`) established it, opened as a PR and landed with the merge button.
- **Merge method**: `dev`'s ruleset allows `squash` and `merge`. Feature PRs still squash by convention and by the merge button's default; the main-to-dev sync is merged, never squashed.
- **Signed sync**: the sync job writes its manifest re-baseline through the Contents API under the release App's token, so the commit is GitHub-verified and the signed-commit rule is satisfied without an admin bypass.

## Why

### Why a squash breaks it

A squash or cherry-pick creates a new commit with no parent link to the release commit, so its SHA never becomes reachable from `dev`. Release-please then finds the stable tag but cannot place it in `dev`'s history, scans every commit, and an old `Release-As` footer in that range pins the version. The sync PR after each stable release had been squash-merged, which dropped `main`'s release commit from `dev` every time, so it would have recurred on every release until the merge method changed.

### What the rehearsal showed

- The fix was proven in a throwaway repository first, with real tags: the first rc, a second cut that increments to `-rc.1`, and a stable promotion that ignores rc tags.
- A squash-only ruleset hard-blocks a PR merge commit for everyone. A plain merge, an admin merge and a bypass actor were all refused, so the originally preferred bypass-actor design was off the table. Allowing `merge` in the ruleset was the working mechanism; a bypass actor pushing directly would also have worked, at the cost of the PR's conflict surface.
- A merge makes the signed-commit rule check every commit it introduces, which is why the sync commit had to be verified.
- The real repository caught what the rehearsal could not: the sync PR's range carries `main`'s immutable subjects, including release-promote subjects over the 100-character limit, so commitlint failed. The existing commitlint skip for PRs into `main` was extended to the sync branch.
- Release-please aborts a second cut if the previous rc's PR is tagged but not relabelled from pending to tagged, so every rc needs the tag and the relabel.

## What shipped

- The config change, with `apps/extension/package.json` as the stamped version file.
- The sync job and its tests, runbook and PR text flipped from squash to merge commit, and the one-time ancestry merge.
- The first real rc was cut and published through the manual unstick and the publish workflow. The landing links stable releases only.
- While auto-unstick is off, the post-stable sync is manual, because the sync job fires only after the push to `main` that the manual unstick's dispatch path does not hit.
