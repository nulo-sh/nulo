# Phase 1 — #16: parse every dApp call against the schema (arc 1)

## Setup

- The branch was cut from layer 1's head (`792c3e9`), which did not yet carry PR #48. `origin/dev` was merged in (`1ed536d`); the only conflict was `implementations-plan/index.md`, resolved by keeping both lines.
- `agent-worktree register` refused from this worktree: it expects the branch `worktree-hardening-2-dispatch`, and the plan names the branch `hardening-2-dapp-parse`. Not worked around; the manifest has no row for this worktree, so `agent-worktree status` has nothing to update.

## I-2: every argument read sits inside the method's tuple

Every `args[N]` read in the dispatcher, the scope checkers and the handlers was listed and checked against the tuple length of the method's schema entry. One reader goes past it: `enforceScopeWithSession` (`scope-enforcement.ts`) reads `args[0].scopes`, `args[1].scopes` and `args[1].additionalScopes` for every method, past the tuple of a one-argument method and on keys the parse strips. Those reads can only refuse, so cutting extra trailing arguments before the parse still loses nothing a later layer acts on. (Corrected after the Opus review; the first version of this note said no read went past the tuple.)

| Method | Tuple length | Reads |
|---|---|---|
| getChainInfo, getAddressBook, getAccounts, getWalletFeatures | 0 | none |
| getContractMetadata, getContractClassMetadata, registerContractClass, isTokenRegistered, requestCapabilities, batch | 1 | `args[0]` |
| getPrivateEvents | 2 | `args[0]`, `args[1]` |
| registerSender | 2 (alias optional) | `args[0]`, `args[1]` |
| registerContract | 3 (artifact and secret key optional) | `args[0..2]` |
| simulateTx, executeUtility, profileTx, sendTx, createAuthWit | 2, both required | `args[0]`, `args[1]` |
| registerToken, grantPublicAuthwit | 2 | `args[0]`, `args[1]` |

## Upstream schema facts the fixtures ran into

- `sendTx`, `simulateTx`, `profileTx` and `executeUtility` require their options object; `SendOptions` requires `from` (an address or `"NO_FROM"`); `ProfileOptions` requires `profileMode`.
- The `contractClasses` capability schema requires `canGetMetadata`.
- `registerContract`'s first argument is the instance preimage plus the address, parsed in strip mode, so extra fields pass and a missing `salt` does not.
- An address or field at or above the BN254 modulus fails in a transform that throws a plain `Error` quoting the value. Sentinels must therefore start below `0x30…` to be valid, or above it to prove the no-leak rows; the refusal never carries a `cause`.
- `AztecAddress.fromString` is gone from the stdlib build in use; the static constructors are `fromStringUnsafe` and `fromBigIntUnsafe`.
- The playground already sends a full capability header (`apps/playground/src/lib/bundles.ts`), so the OA-1 C header parse refuses nothing it sends.

## Existing tests the parse now refuses

About 260 wallet-bridge tests failed on the first run with the parse in place. Every one used a value the stock SDK never sends; none was a regression. Conversions, all in place, no `vi.mock` of the parse:

- Capability requests without `version` and `metadata`: wrapped in `withHeader` (60 call sites in `dispatcher.test.ts`, more in the characterization file).
- Short placeholder addresses (`0xacc`, `0xtok`, `0xunauthorized`, …): mapped to 64-hex addresses; the one row that tests a short address held in a grant keeps it.
- Payloads built as plain objects: rebuilt from real `FunctionCall` and `ExecutionPayload` values through `jsonStringify` (`packages/wallet-bridge/src/testing/wire.ts`, exported as `@nulo/wallet-bridge/testing` for the extension's tests).
- Sends with no options or no `from`: the parse refuses them. The characterization file's sender table now pins those rows as refused (`INVALID`), including an empty string, zero, `false`, an object, an `Fr` instance and an object `String()` cannot convert; `NO_FROM`, a session account, an upper-case account and a stranger keep their old outcomes.
- `contractClasses` grants without `canGetMetadata`, and `profileTx` options without `profileMode`: completed.
- A raw-hash `createAuthWit`, the account-order test's omitted `from`, and the old shape guard's "Malformed …" texts: now the parse's refusal.

## Behaviour that changed beyond the plan's text

- The arity guards and the parse throw one class, so an arity refusal is now `INVALID_PARAMS` on the wire, not the unclassified constant.
- `toWalletResponseError` went over the cognitive budget with a fourth constant-message arm; the four constant envelopes (stale anchor, unregistered scope, contract not registered, invalid params) became one table instead of a suppression.
- `isGrantAuthwitShape` in the schema patch now requires every key of the grant content schema; the new drift row was checked red on the old `apply.ts`.

## Design consults (Codex and Opus, before the code)

- OA-1 C shape: header through `AppCapabilitiesSchema.omit({ capabilities })`, each entry must be an object with a string `type`, known types through `CapabilitySchema`, then the wallet's own `projectRequestedCapabilities`, so a known type's bad field (a malformed contract address, a duplicate type) is refused as `INVALID_PARAMS` before any window. Both agreed.
- `requestCapabilities(null)`: Codex said refuse it; Opus said keep it. Kept: there is no header to parse, it opens nothing and grants nothing, and an existing pin documented it as deliberate.
- `argsRequestCapabilities` (the old arity guard for the manifest) deleted: the parse covers it, and an arity refusal ahead of the capability step is wrong for a method with no capability (Opus).
- The class lives in `@nulo/extension-messaging/errors`, not `wallet-bridge`: the envelope classifies it and `REBUILT_AS` must rebuild it across the transport.

## Red on base (`f5ca160`), through `dispatch`

Method (scratch, never committed): a detached worktree at `f5ca160` under the lane's cache dir, installed with `--frozen-lockfile --ignore-scripts`; one spec with the wire helpers inlined, asserting by message and routing (the class does not exist on base), copied into the base's `packages/wallet-bridge/src/`, run, then deleted. The same spec passes 27/27 on HEAD.

| Row | Base outcome |
|---|---|
| sendTx: calls not a list | different error: "Malformed sendTx request: exec.calls must be an array" |
| sendTx: call without selector; call to a non-address; over-modulus call argument | routed: the window opened (`0xsent`) |
| sendTx: sender not an address | different error: `ScopeViolationError` "requested account not authorized" |
| getContractMetadata, getContractClassMetadata (over-modulus) | routed to the runner |
| getPrivateEvents (event without selector), registerSender (alias 5), registerContract (no salt) | routed to the runner |
| simulateTx (no selector), executeUtility (scopes not a list), profileTx (no profileMode) | routed to the runner |
| registerContractClass (artifact without functions) | different error: the handler's "intentionally disabled" text |
| createAuthWit (call without name) | different error: "Scope violation: … a raw message hash cannot be authorized" |
| requestCapabilities (no metadata) | resolved with no grants (the header went unchecked) |
| registerToken (over-modulus token) | routed: the window opened |
| registerToken (null token) | different error: "Malformed registerToken request: …" |
| isTokenRegistered (a number) | different error: "not available in this wallet build" |
| grantPublicAuthwit (content without args) | routed: the window opened |
| Preservation: the raw-args row, ungranted `simulateTx`, `requestCapabilities(null)`, the batched `requestCapabilities`, the popup-leg batch, the partial batch, a wire-valid `createAuthWit` | all 7 pass on base |

## Network gate (Chrome, retry 0)

- The 25 named files: 23 passed, 1 skipped by design (`tx-sendTx-delegated-authwit`: it needs the testnet standard contracts, gated on `NULO_E2E_STANDARD_CONTRACTS=1`), 1 failed: `data-privateEvents`, both tests. The wallet answered `INVALID_PARAMS` where the test expects the scope refusal.
- Cause: the playground's `getPrivateEvents` button sent a stub the stock schema refuses (no `abiType`, an `Fr` as the event selector, `fromBlock: 0` where block numbers start at 1), and the parse now runs before the scope check the test exercises. Not a wallet regression: the call was malformed on the wire. Fixed in the playground (a schema-valid query, as the stock SDK types it); `data-privateEvents` then passed 2/2 at retry 0. This is the gate doing its job: no unit fixture could have shown it.
- The full network suite (116 files) is not part of the phase gate; it was run once on the reviewed head (`45b8ad0`, code-identical to the PR head but for one comment), Chrome, retry 0, in its two pools: prover-on 101 of 106 files passed (148 tests) with 5 env-gated skips, the extra file being the scratch screenshot spec; proverless (`NULO_E2E_PROVERLESS=1`, 11 files that refuse to run without it) 11 of 11 (36 tests).
- Screenshots: a scratch spec (never committed) granted `transaction`, wrapped the playground page's `JSON.stringify` once so the sealed `sendTx` carried a bad selector, asserted the `INVALID_PARAMS` envelope, the record's outcome and context, and the card, then shot the History card, Home's recent activity and the record page in both themes.

## Review rounds

- Commit bodies: commitlint's `body-max-line-length` is 100, and a failed commit leaves its files staged, so the next `git commit` swept them in. Redone locally before any push.
- The authwit intent union (`MessageHashOrIntentSchema`) is the one object-or-object union in an argument position. It accepts the inner-hash branch first and strips the rest, while every reader takes the call branch when `caller` is present: a valid inner hash beside a malformed call passed the parse (Codex C1). The other unions in `WalletSchema` mix a scalar with a literal or `"*"`, where no branch can hide another.
