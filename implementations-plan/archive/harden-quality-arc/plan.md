# Harden quality arc

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The twenty-two findings of a whole-extension quality audit, less the sub-parts listed under Not done: twenty-one in a first pass, then a follow-on pass that finished most deferrals the first had parked, including the last finding. Live across `packages/wallet-core/src/utils/`, `packages/wallet-crypto/src/secret-types.ts`, `packages/wallet-bridge/src/` (`method-descriptors.ts`, `dispatcher.ts`), `packages/wallet-sdk-schema-patch/`, `packages/aztec-runtime/src/pxe/descriptors.ts` and `apps/extension/src/`.
- **Open items**: first-party service methods that trust a caller's profile id, such as `TokenService.updateToken` (it checks the row against its `profileId` argument) and the account service's public methods. None is dApp-reachable; deriving the profile in the background on the extension's own RPC is an open call, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Land every finding on one integration branch, one gated change each, tiered by risk, with a failing-first test whenever behavior changed. Defaults: behavior-preserving; a pre-existing quirk is pinned and kept, never fixed inside a refactor; a decoder must never be laxer than the cast it replaces; the frozen authorization and key-derivation oracles stay byte-identical. The one exception was an authorized, add-only edit to the method-descriptor oracle, and a backup privacy fix kept export-only. Changes to a persisted backup shape or its tolerance were out of bounds.

## Why

The audit found structural duplication and type erasure at trust boundaries, which is where a silent behavior change costs most. Gating each change on units, smoke and the full network suite meant a regression named its own change. Deferring what could not be proved safe, and recording it, beat shipping a guess: the typed-tuple layer was left out because precise tuples would claim what the tolerance-exact runtime does not enforce.

## What shipped

- **Cheap wins.** Hex and base64 encoders in `@nulo/wallet-core/utils`; the profile service's lock blocks through `runExclusive`; one aztec-runtime artifact catalog; a discriminated union for production PXE options; the config store on a zod schema; documentation drift fixed.
- **Structural dedup and typing.** A shared error taxonomy; honest `Client | null` app services with require and get accessors; one `SeverityTone` and typed props across the `@nulo/design` primitives; the three schema-patch copies folded into `@nulo/wallet-sdk-schema-patch`; a `TokenFnDescriptor` registry replacing nine near-identical modules, proven byte-identical by a characterization snapshot.
- **Trust boundaries.** Branded secret types and a `RestoreSecret` union (password or passkey) in place of one polymorphic slot; a typed operation policy and capability-coverage strategy that removed the casts; `definePassthroughs` for sixteen service clients, with a drift guard in both directions; `runInSlot` for the executor's slot lifecycle; a typed dispatch-entry check (`assertKnownMethod`) with identical behavior; storage codecs where validation failure keeps the row and reads undefined, never deletes it.
- **Follow-on pass.** A cross-profile isolation gate and by-id ownership guards that fail closed; a plaintext cross-profile leak in token-balance export fixed, export only; a PXE descriptor table with explicit flags; row codecs on eleven durable stores; `argSchema` guards on the dApp dispatch path; the approval-window shell extraction graded against [window-characterization.md](window-characterization.md); post-audit fixes for the capability-request argument guard, which had been both too tight and too loose, and for an ownership test that proved nothing.
- **Not done.** Method-decode and a discriminated dApp decoder, codecs for the profile, session and config stores, and typed argument tuples.

## Lessons

### Lock redirect race

Locking right after a password change could leave the popup off the auth page, which looked like a flaky smoke test. The redirect is event-driven, and a stale bootstrap from the password change could set `isLogined` true after the lock, so the route guard bounced the redirect while the session was in fact cleared. The e2e helper now waits for the session record to leave `chrome.storage.session`, the authoritative signal. The product race itself was fixed afterward: the bootstrap re-reads the active profile under the profile service's lock before flipping `isLogined`. Read the stack trace before attributing a flake.
