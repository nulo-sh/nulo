# Release-please as the release driver

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `.github/release-please-config.json`, `.release-please-manifest.json` and `.github/workflows/release.yml`, with the release runbook in `CLAUDE.md` and the pipeline description in `CI.md`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

The prerelease flow that followed is [prerelease-rollout](../prerelease-rollout/plan.md). Later cuts are in [stable-release](../stable-release/plan.md).

## Decision

Replace the earlier release tool with release-please, in one workflow that is authenticated as a GitHub App. A merge to `main` opens a Release PR. Merging it creates the tag and the GitHub Release, and the same workflow builds, gates and attaches the Chrome and Firefox zips with a checksum file and generated notes. Manual dispatch of the workflow with a tag stays as the escape hatch to republish assets for an existing release.

## Why

Two assumptions in the first drafts were fatal, and review caught both:

- A Release PR opened with the default workflow token does not trigger the PR checks, so the required quality check never runs and the PR cannot merge. A GitHub App token fixes this, and the bot's commits are verified, which also satisfies the signed-commits rule. A bypass of the checks was dropped because it did not solve the check problem.
- Chaining separate workflows through the default token does not fire either, so release and publish had to live in one workflow.

The republish path had to fail loudly. It fetches tags explicitly, verifies that the tag exists, and refuses an empty tag input, so it cannot publish the wrong commit's assets. The protected environment stays on the jobs that upload assets.

## What shipped

- A merged Release PR title needs its own pattern: with grouped pull requests, release-please builds the title from the group pattern, and the default falls back to the branch name. Setting `group-pull-request-title-pattern` is required, and the action's next major version still needs it.
- The action aborts after a Release PR merge with "untagged, merged release PRs outstanding", because it expects a release to exist that it is meant to create. This is an upstream defect present in every released action version, so the runbook carries a manual unstick, later automated by an `auto-unstick` job in `release.yml`.
- The attach step waits for the network end-to-end gate through explicit result checks. Listing the gate as a plain dependency broke the path where the gate is skipped, because a skipped dependency skips its dependents.
- All thirteen Conventional Commit types stay visible in the changelog.
- A dry-run input builds and gates but skips the upload.
- Store publishing was left to a later change, and is now wired into the same workflow.
