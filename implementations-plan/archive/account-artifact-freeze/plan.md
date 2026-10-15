# Account artifact freeze

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the vendored account artifact and its pins in `packages/aztec-runtime/src/account/artifacts/` and `packages/aztec-runtime/src/account/frozen-artifact.ts`, the frozen descriptor in `packages/aztec-runtime/src/account/instantiation-descriptor.ts`, the regime record in `packages/aztec-runtime/src/account/address-freeze.ts`, the integrity coordinator in `apps/extension/src/wallet/services/account-integrity/`, and the execution canary `apps/extension/tests/e2e/network/frozen-account-canary.test.ts`.
- **Open items**: none. Accounts deployed under an older artifact than the wallet's aztec.js are the designed state, not open work: every Aztec bump must pass both execution canaries (`CLAUDE.md` § Account-address freeze).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Account addresses are a frozen, versioned artifact of the extension major, not a side effect of whatever the Aztec accounts package ships. The wallet vendors the raw `SchnorrAccount.json` and pins its digest and loaded class id. A small frozen descriptor (constructor name and arguments, salt, immutables hash, deployer) feeds both the address derivation and the first-transaction constructor call. Each extension major binds at compile time to exactly one regime in an append-only record. A protocol break ships as a new extension major, not as an in-place re-pin.

## Why

Before this, the address embedded the class id of an artifact imported from npm, and any toolchain change upstream could shift it. A shifted address leaves a stored profile that no longer matches, and the only remedy was deleting the profile. That is tolerable with no users and not once there are some.

Freezing creates its own hazard: frozen bytecode driven by a newer simulator, prover or entrypoint encoding is a combination upstream never tests, and a green address known-answer test says nothing about whether the account can still execute. That is why a dedicated execution canary is part of the decision, and why a red canary holds the Aztec line instead of being worked around.

Rejected alternatives: pinning without vendoring (misses the goal), freezing only one of the two constructor-argument sites (the address and the execution could then disagree), vendoring with no descriptor (tripwires only, too weak for a production guarantee), an active-regime pointer (makes stored accounts ambiguous on rotation), and a persisted per-account regime id (unneeded when a major has one regime).

## What shipped

- The raw artifact is vendored byte-exact with a note on where it came from. Pin tests check the file digest and the class id after loading; the existing derivation vectors pass unchanged.
- The descriptor is consumed by both call sites and a consistency test ties the emitted constructor call to the initialization hash the address used.
- `REGIMES` is append-only and a paired test hardcodes every entry independently and binds each acknowledgement to its digests. Rotation means appending an entry and shipping a new major bound to it.
- The canary walks a fresh profile through the frozen constructor, a real proof, node acceptance, an authwit-consuming transaction and a background restart, asserting each stage. Every Aztec bump runs it, and the policy is written in `CLAUDE.md` and the `aztec-update` skill.
- The integrity coordinator re-derives every stored account before a session is exposed, with no node calls. On a mismatch it withholds the session, persists a blocking state that survives a background restart and shows a dedicated screen that never asks for the seed and offers no delete action. The typed `AccountAddressInconsistencyError` replaces the bare throw, dApp-facing errors are sanitized, and backup import runs the same check before restore finalizes.
- A smoke-gate run also surfaced an unrelated transport bug: an `undefined` in the middle of an argument list dropped every later argument. The unwrap step now tolerates the gap within its existing arity bound, with regression tests.
