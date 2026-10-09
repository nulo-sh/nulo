# Release pipeline hardening

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the `always() && !cancelled()` guard pattern for jobs downstream of optional release jobs, which the publish jobs in `.github/workflows/release.yml` still use, and the auto-unstick job in the same file turned on by repository variable with an in-code default of off.
- **Open items**: none. Flipping the auto-unstick switch's in-code default was closed by supply-chain-release (#63): it is on unless `AUTO_UNSTICK_ENABLED` turns it off.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Fix the release workflow so the post-publish deploy jobs run on a manual re-run of the publish chain, and add a break-glass way to refresh the landing page.

- **Guard**: give the landing-refresh and faucet-deploy jobs the same prefix the asset-attach job already had, `always() && !cancelled()`, plus explicit success checks on `resolve` and `attach-assets`. The existing stable-only, event and dry-run conditions stay.
- **`verify-live` stays unchanged.** It already runs after skipped deploys and fails against a stale site, which is the safety net that exposed this bug. Gating it on the deploy jobs would make it skip instead and hide the same class of regression.
- **Break-glass**: a dispatch-only workflow with a landing, faucet or both target and read-only repository permissions, that calls the existing deploy hooks.
- **Auto-unstick**: turn it on by repository variable only. The in-code default stays off, so deleting the variable is an instant kill-switch. The default flips only after a release shows it acting cleanly.
- **Left out**: an asset-less fallback in the latest-release lookup, since auto-unstick shrinks the empty-release window to seconds.

## Why

After a manual unstick and a dispatch republish, the landing stayed on the previous release. On a dispatch run several ancestors skip (the push-only release-please and auto-unstick jobs, and the opt-in network e2e), and GitHub propagates a skipped ancestor through the needs graph to any job whose condition has no status function, even when its direct dependency succeeded. The fix does not depend on which ancestor skipped.

## What shipped

- The two deploy jobs gained the guard. It fails closed: a failed or cancelled asset attach, a prerelease and a dry run all still skip the deploys.
- The break-glass workflow and the two deploy jobs were later replaced when the landing moved to Workers Builds, so only the guard pattern and the auto-unstick switch are live.
- The runbook in `CLAUDE.md` describes auto-unstick as a variable-controlled stage of a staged rollout.

### `always()`

A job needing a skipped job is skipped unless its `if` calls a status function. `always()` overrides that, but it also runs after a cancel, so a cancelled release could still fire production deploy hooks. Guard side effects with `always() && !cancelled()` and name the success results that must hold, so a broken or asset-less release can never trigger them. The same shape guards the store-publish jobs in `.github/workflows/release.yml`.
