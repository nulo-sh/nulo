# Aztec 4.2.0 bump

## Outcome

- **Date**: —
- **Status**: superseded by aztec-5.0-upgrade.
- **Shipped**: nothing is recorded as delivered under this plan; Aztec bumps are now walked by the runbook in `.claude/skills/aztec-update/SKILL.md`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Move the `@aztec/*` packages from the last 4.2.0 nightly to the 4.2.0 stable release, and treat the bump as a dependency change that must be verified rather than a code change. `@aztec/viem` stays on its own version axis, the accelerator pin stays unless it breaks against the new bb.js, and the user-curated token and FPC lists are not wiped by the storage-version bump.

## Why

The first draft of the plan undercounted what a version bump touches. The review found surfaces that a plain install does not carry along:

- The bun patch on `@aztec/accounts` is keyed by exact version, so it silently stops applying unless its key and file are renamed or the patch is dropped because upstream fixed it.
- The vendored `barretenberg*.wasm.gz` files are copied by hand, so an npm bump updates only the JavaScript half of bb.js.
- `new GasSettings(...)` had eleven call sites, not one, and the `GAS_ESTIMATION_*` constants might be replaced by `GasSettings.forEstimation()`.
- The no-from send path ran its discovery simulation without the caller's account in scope, which stricter capsule-scope enforcement could break.
- The storage wipe set was incomplete: the sync cursors must go with the PXE state, while the token and FPC registries are user-curated and survive.

## What shipped

No delivery is recorded for this plan. The wallet has since moved through the 5.0 protocol fork and onto the current line, and the bump procedure now lives in the `aztec-update` skill, which carries forward the same traps: patches keyed by exact version, call sites a typecheck cannot see, and a client-side reset when PXE layouts shift.
