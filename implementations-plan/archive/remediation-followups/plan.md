# Remediation follow-ups

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A charter for the residue of a dual-audit remediation, executed as one plan per arc; the shared primitives it closed out live in `packages/wallet-core/src/utils/alarm-dispatcher.ts` and `packages/wallet-core/src/utils/keyed-lock.ts`. Each arc has its own record.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Run every documented deferral of the previous remediation as its own planned arc, each with its own tier, worktree, plan and pull request, under one set of working rules. The arcs: [fix-account-generation-fence](../fix-account-generation-fence/plan.md), [fix-profile-deletion-status](../fix-profile-deletion-status/plan.md), [fix-storage-row-repair](../fix-storage-row-repair/plan.md), [fix-discovery-restart-durability](../fix-discovery-restart-durability/plan.md), [primitive-adoption-closure](../primitive-adoption-closure/plan.md), [row-service-method-families](../row-service-method-families/plan.md), [restore-stage-extraction](../restore-stage-extraction/plan.md) and [composition-root-pilot](../composition-root-pilot/plan.md).

The fence extraction out of the PXE service and the remaining god-service splits were not started. They are architecture decisions, and the written recommendation was to pin the read-coupling first with characterization tests, extract the fence as a module before splitting any service, and map the null-initialised field dependencies before decomposing further.

## Why

Every deferral had been agreed as a documented residue, and the earlier remediation had shown how stale such notes get. Line numbers had drifted in every arc, two findings misdescribed their own target (one named a coordinator that does not exist), one had the wrong file path, and one counted its duplicate sites twice. So each arc began with a read-only recon against the current tree, which could redirect or cancel it, and a cancelled arc counted as a valid outcome.

## What shipped

- Rules for every arc: bug arcs write a failing test first and keep it as the regression pin; quality arcs pin current behavior first and change none; no new abstraction unless at least three sites benefit; prefer adopting a primitive that already shipped over extracting a new one.
- Two proposals stayed rejected. Moving the session queues onto a split-release keyed lock would have touched the pairing that keeps concurrent sends from losing a transaction, for near-zero value. A shared blocking-barrier frame would have merged two barriers whose staleness guards differ on purpose.
- Lessons carried into later work: a shared primitive whose adopters behaved differently before cannot be a zero-change extraction by default, so audit each adopter's prior semantics first; never let a behavior fix ride inside a zero-delta refactor, pin the bug and file it separately; when an arc holds several findings in one flow, re-run the others' pins after each fix; count duplicated sites one by one, since byte-identical is the only definition of a site.
