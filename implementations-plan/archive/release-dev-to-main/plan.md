# Release dev to main

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: one stable cut, run through the existing automation unchanged: `.github/workflows/release.yml`, the release-please configs under `.github/`, and the runbook in `CLAUDE.md` (Release runbook).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Promote `dev` to `main` and publish the next stable release across the three production surfaces (the extension, the landing and the faucet site) using the pipeline as it stands, with no workflow or config change. The plan was a runbook for an irreversible event, not code, so the ceremony went into the sequence, failure modes and rollback.

- The version was pinned with a `Release-As:` footer in a commit inside the promote set, not by editing release-please's config, which would have been a standing policy change. The version reconciliation is a hard stop before the Release PR merges.
- The agent drove every step, with a checkpoint before the two true points of no return, the promote merge and the tag push.
- The faucet's contracts were not redeployed by this release. The site shipped live with drips knowingly failing until they were, and its post-release check was liveness and cross-origin isolation only.
- Network e2e flake policy: block until green by re-dispatching the same tag, which is idempotent. Shipping with the live-testnet gate off was not pre-approved.
- The install link was re-pointed from a dead store default to the landing page.

## Why

The release carried a breaking protocol fork and a large delta, so it was irreversible on four dimensions: it advances `main`, pushes a permanent tag, redeploys two production sites and publishes the release the landing links to. Three independently drafted runbooks converged, and a hostile final pass found gaps that were folded in:

- The landing's Cloudflare wiring, not its hostname, was the blind spot. Verifying the wrong site green is meaningless, so the pre-flight checks the production branch and which project owns the deploy hook.
- The accepted cross-fork window (the faucet goes live on the new protocol before the extension's "latest" exists) and the flake policy had to be wired into phases, not left as questions.
- Gates had to be falsifiable: status on the exact dev head, and the faucet's live deployment commit equal to the promote commit, since correct headers do not prove the new build.
- A mid-unstick failure needed an idempotent resume that keeps the tag unless the whole attempt aborts.
- The checksum file is corruption detection from the same CI run that builds the zips, not independent provenance.

## What shipped

- The eight-phase runbook: pre-flight go/no-go, promote, Release PR with version reconciliation, manual unstick with a tag-equals-merge-commit guard, the dispatched publish chain, landing refresh through the deploy hook (it does not fire on a dispatch), full-surface verification, and the prerelease-manifest re-baseline.
- The procedure it exercised is the one now kept in `CLAUDE.md`; later cuts are recorded in [stable-release](../stable-release/plan.md).
