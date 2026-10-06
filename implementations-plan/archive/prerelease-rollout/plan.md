# Release candidates cut from the integration branch

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `.github/release-please-prerelease-config.json`, `.release-please-prerelease-manifest.json` and `.github/workflows/release-prerelease.yml`, with the prerelease procedure in the release runbook in `CLAUDE.md`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

It builds on [release-please-rollout](../release-please-rollout/plan.md).

## Decision

Add a second release-please flow beside the stable one, driven from `dev` and producing release-candidate tags, without touching the stable flow or its config.

- It has its own config and its own manifest, so the two version lines are tracked independently.
- It is opened by explicit manual dispatch, not on every push, so cutting a candidate is a deliberate decision.
- Its assets are published by the stable workflow's republish path, using the ref of the branch the candidate was cut from.
- Running the network end-to-end gate on a candidate is opt-in.
- After a stable cut, the prerelease manifest is re-baselined: merge `main` back into `dev` first, then reset the manifest.

## Why

Candidates let the integration branch be installed and tested before a promote, and a separate manifest keeps them from disturbing stable versioning. The re-baseline order matters because release-please can reopen old Release PRs if `dev`'s version files lag the manifest.

Review of the first draft found that the stable manifest had drifted far behind the real version, because every stable release had been recovered by hand and a manual recovery never touches it. That was fixed in the same change so both manifests started coherent. Review also corrected how the first candidate is named (no counter suffix, the counter starts on the second), that the GitHub release should be created with the existing tag instead of a target, and that a disposable `feat:` commit is needed to smoke-test, since `docs:` and `chore:` do not open a Release PR.

A community fork of the release action was investigated as a possible escape from the upstream abort defect. It bundles the same release-please version with no relevant patches, so no version of the action avoids the defect, and the manual unstick remains the operating pattern.

## What shipped

- The prerelease config mirrors the stable one except for the prerelease type and versioning strategy. Release-please's parser is strict JSON, so the config has no comments.
- `release-prerelease.yml` is only the release-please call, authenticated as the release App. It has no publish chain.
- The runbook documents the unstick, the publish dispatch (candidates are never submitted to the stores), verification, and the post-stable reset. The landing links stable releases only.
- The `dev` ruleset squashes the Prerelease PR; an early draft said merge commit and review corrected it.
