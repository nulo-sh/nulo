# Security hardening before the first release

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a four-batch remediation of a whole-codebase security audit, landed as one stack: chain-identity and backup-scope fixes, profile and key isolation, the approval display, and a verify-window admission gate. Live surfaces include `apps/extension/src/wallet/services/execution/authwit-discoverer.ts`, `packages/wallet-crypto/src/dual-secret-hkdf.ts`, `apps/extension/src/utils/token-transfer-vocabulary.ts` and `apps/extension/src/wallet/services/passkey/check-rp-id.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Fix the audit's verified findings in four stacked batches, each blueprinted at its own tier and gated by a foreign review loop until it converged, with no storage migrations (the wallet had no users, so shape changes redefined the baseline). An earlier audit's accepted residuals stayed accepted; its controls were re-verified at source and only their coverage gaps were completed.

- **Mechanical batch.** Exact L1 chain-id equality in the live chain-identity assertion, routed through one assert. Name-to-selector binding on the simulate fast path. Keyed account reads that verify the address. A TTL on pending passkey-restore secrets. Errors, not flattened messages, are logged, and `trim()` scrubs URLs in strings. Hygiene: zeroized password buffers, `autocomplete` on secret inputs, spreadsheet-formula neutralizing in the log CSV, and the full address on the account-import preview.
- **Backup and passkey batch.** The network and fee-payer slices left the backup registry: protocol payers and seeded networks re-derive, so import reseeds networks and remaps by chain id. "Add network" for custom networks sits behind Developer Mode. The passkey relying-party id moved to a dedicated static host.
- **Isolation batch.** The profile's data-encryption key is mixed into both the dApp-session MAC key and the PXE store key. Authwit rows carry profile and chain scope, journal reads answer for the active profile only, and the popup-reachable journal writes were removed. Offscreen and background messaging check the sender.
- **Approval batch.** The approval card derives its recognized-transfer vocabulary from the token function descriptors, with a raw-argument fallback and an authwit card showing caller, arguments and inner hash. The service worker materializes executable operations from the stored request. Verify windows pass an admission gate.

## Why

Each fix closes a place where one trusted-looking value could stand in for another: a chain id compared by hash, a profile id taken from a caller, a backup slice that could carry endpoints, a display vocabulary that drifted from the token model, an unauthenticated message sender. Making the key material depend on the profile's secret turns a missing secret into a visible recovery state instead of a silently weaker key.

## What shipped

- Recovery mode is a synchronous gate in the service worker: a session with no data-encryption key cannot open the PXE store, cleanup calls stay allowed, and exports carry a fresh key so a corrupt key slot has a repair path.
- The admission gate reserves a window per verify request with unstarted, in-flight and opened states, a per-origin token bucket for remembered-session handshakes that slows a reload loop without blocking it, and no capacity release until the window is actually gone. A flood e2e asserts at most two windows at any moment with none dropped.
- Firefox sender shapes for the messaging checks are pinned by unit tests; Chrome is proven by the smoke suite.

## Lessons

### jsdom-bbjs

`poseidon2Hash` threw `std::bad_cast` under vitest, which looked like a WASM limitation. The real cause is the environment: Aztec's hashing takes the synchronous branch when `self` is defined, as it is in jsdom, and the async branch otherwise. A per-file `// @vitest-environment node` docblock runs the real decode and hash in CI. The other "bb.js WASM limitation" exclusions in the vitest config are the same trap.

### root-test

The root `test` script, and so `audit:vue`, runs only `apps/extension`. CI also runs `test:all`, `test:release` and `test:ci-gating`, so changes elsewhere need them locally. `test:ci-gating` in particular belongs in the local gate whenever an accepted complexity function is touched: a one-line ternary raised the logger's accepted walker by one and the ratchet refused it until the primitive tail moved into `scrubPrimitive()`.

### typed-errors

A typed error survives only the hops that name it. `viaPxe` flattens every throw to a generic error, so the account-state backup could not catch the recovery-mode error until it was rethrown by type. `walletErrorFromPayload` and `classifyOperationCatch` likewise pass only listed codes, so register a new code at each.
