---
plan: security-fixes-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet); dual audit (Codex gpt-6.1-sol high + Opus Plan); one final fresh Codex pass
base: origin/dev at 90f4fb3
trunk: dev
issues: "#28 #29 #13 #30 #31 #27 #33 #32 #25 #35"
---

# security-fixes-1 — ten audit fixes in bridge, profile, backup and service code

Ten findings from the security audit, each closable in service-worker or bridge code. No fix changes
a screen. Four fixes touch something a person could notice in a rare case; each ships in the form
closest to today, built only from wording the wallet already has, and the choice is filed for the
owner in [OWNER-ASKS.md](OWNER-ASKS.md). Three arcs ship as three stacked PRs, then a docs-only
close-out PR.

Recon: [recon.md](recon.md). Live progress: [STATUS.md](STATUS.md).

## Tier and budget

`mid`, set by the orchestrator. Rubric: security sensitivity is high; blast radius, irreversibility,
migration cost, novelty and external coupling are low (every change is local, reversible, and needs no
storage migration because the wallet is pre-production). One high dimension gives `mid`.

## Outcome & Quality Bar

**For whom.** A person who holds funds in Nulo and never sees these changes; the dApp developer whose
batch, grant and error contracts must stay stable; the maintainer who inherits the code and its tests.

**What excellent looks like.**

1. Every input class a fix refuses has one test that fails on the base commit, and each refusal test
   sits next to a success control that proves the allowed path still works.
2. Nothing a person sees changes on any row, file or request the wallet itself produces. Where a
   hostile or hand-made input now meets a different refusal, that refusal uses wording the wallet
   already shows, and the owner ask names it.
3. No request value (a function name, a contract address, URL credentials) appears in an error text
   that reaches a record, a log line or a dApp.
4. Each fix is the smallest local change. Shared logic moves to one helper instead of being copied
   between the two estimate ladders or the two URL gates.

**Good enough.** No new abstraction beyond the helpers named below. No refactor of code a fix does
not touch. No new e2e spec: the existing network and smoke files that cover the touched paths are the
end-to-end proof, because each fix changes a refusal or an internal order, not a flow. Those files
prove the flows still work; the refusals themselves are proven by the unit and integration tests.

## Scope

In: #28, #29, #13 (arc 1); #30, #31, #27 (arc 2); #33, #32, #25, #35 (arc 3).

Out (recorded as follow-ups, see the last section): `requestCapabilities` as a batch leg; the session
service's own writers dereferencing raw grant records; `repository.setTrust`'s own await; artifact
metadata a class id does not commit to; the transfer ladder's base-fee reason echoing the node's
message.

**UI impact: none on any input the wallet produces.** Rare-input visible effects, each shipped in its
today-closest form with existing wording and filed for the owner:

- OA-1 (#31): the owner picked A on 2026-10-08 (OWNER-ASKS.md § Answers): a rename in recovery mode
  now keeps the recovery banner, because the rename returns the same projection as every other
  profile call. Before the sign-off the plan shipped today's behaviour (the banner hides).
- OA-2 (#13): the debug/developer journal detail loses the function names and address; the ask is
  that acknowledgement plus whether to classify the refusal as "Not allowed".
- OA-3 (#27): a backup whose contract artifact does not match its own instance now shows the existing
  "completed with some errors" warning for that contract.
- OA-4 (#29): a stored grant no wallet writer can produce is now refused with the existing
  "Malformed … capability" error instead of a TypeError; the ask is whether to self-heal it instead.

## Architecture & Implementation

### Arc 1 — bridge and dispatch

**#28 batch refusal.** Set `refusedInBatch: true` on `grantPublicAuthwit` in
`packages/wallet-bridge/src/method-descriptors.ts`. `BATCH_REFUSED_METHODS` derives from the registry,
so the dispatcher pre-scan (`dispatcher.ts:522-526`) refuses it before any leg runs, with the same
`Error` text the two other refused methods use. Update `packages/wallet-bridge/README.md` § "Not in
`batch`" to name both custom methods and the server-side refusal.

**#29 stored grants.** Add one pure exported helper to `packages/wallet-bridge/src/capability-negotiation.ts`:

```ts
/** The stored grants re-projected through `projectKnownCapability`, so coverage and enforcement
 *  read only the canonical shape. A record that is not an object, holds no capability, or holds a
 *  known type that fails projection refuses the whole read with a fixed `ValidationError`: a
 *  malformed grant must never narrow into a smaller one, because consent reads the full set. A
 *  capability of no known type passes untouched, as the window's unknown row stores one as asked. */
export function projectStoredGrants(records: readonly unknown[] | undefined): GrantedCapabilityRecord[]
```

The three reads that interpret grants call it instead of reading `capabilityGrants` raw:
`enforceCapability` (`dispatcher.ts:1014`), whose result every scoped handler receives (the
`createAuthWit` consent check at `:610-617` included); `computeCapabilityDelta`
(`capability-negotiation.ts:325`), the coverage read of `requestCapabilities`; and the post-decision
read (`dispatcher.ts:804`), which answers `requestCapabilities` from the latest row
`applyCapabilityDecision` returns, a row the decision writer merged with whatever else was stored by
then. `getAccounts`'s desync read (`:457`) runs only after `enforceCapability` passed. Batch legs re-enter `dispatch()`, so
each leg goes through the same reads. Unscoped methods read no grant and are unaffected.

The refusal is the projector's existing error: `ValidationError("Malformed <type> capability")` for a
known type, and `ValidationError("Malformed capability")` for a record that is not an object or
holds no capability (D13). Neither names a request value. A `ValidationError` is off the dApp code channel, so a dApp
receives the same constant `UNCLASSIFIED_ERROR_MESSAGE` it receives today for the `TypeError`, and no
window opens, as today. The stored row and its MAC are untouched.

Why refuse, not drop (decision D3): dropping a malformed broad grant can make a narrow
"authorize without asking" consent effective and sign silently (`method-scope-checkers.ts:392-419`
treats a malformed scope as broad on purpose); it also reopens a consent window whose decision writer
(`dapp-session/service.ts:350`, `:367`) dereferences the raw record and throws. Refusing fails closed
and keeps today's visible behaviour. Self-healing through the window is OA-4.

Every grant the dispatcher stores already went through `projectKnownCapability`
(`collectNewGrants`, `capability-negotiation.ts:471-499`), and projection is idempotent, so this read
never refuses a row the wallet wrote. (The session service's two setters accept unvalidated records
from any extension page; their one non-test caller passes `[]`.) A test pins that idempotence per known type.

**#13 selector-binding text.** In `apps/extension/src/wallet/services/execution/contract-resolver.ts`,
`assertSelectorBinding` throws an error built by a function whose only input is the wallet-owned
policy:

```ts
/** The refusal names the policy only: the claimed name, the resolved function and the target are
 *  request values, and the message reaches records and log lines that no redactor can scrub. */
function selectorBindingRefusal(policy: SelectorBindingPolicy): Error {
	return new Error(`Scope violation: ${policy.label} does not match selector's function`)
}
```

The words are today's message with the three interpolated values removed. The error stays a plain
`Error`, so it stays off the code channel, the dApp keeps receiving the constant
`UNCLASSIFIED_ERROR_MESSAGE`, and the journal kind stays `dapp_execute`. Classifying it as a scope
refusal would change what a dApp and the activity record show, so that is OA-2; it would need more than
the class, since `failureKind` (`mark-failed-unless-cancelled.ts:35`) and the code-channel allowlist
(`rpc-cancel.ts:94-100`) both ignore `ScopeViolationError` today. The
`"Method not found"` throw is already fixed text and stays.

Sinks the fixed text reaches (recon § Sinks): task records, journal `error.message` and
`normalizedRaw`, the operation result, the `logError` at `execution/service.ts:742`, the popup's
estimate and authorization-preview `console.error`s (`windows/execute/index.vue:154`, `:177`), and the
mixed fast-path fallback `logError` (`fast-path.ts:255`). Every sink forwards this one error object or
its message, so the throw-site test proves all of them; `fast-path.ts:255` gets its own assertion
because it logs at error level for every user.

### Arc 2 — profile and backup

**#30 restore stash.** In `ProfileService.finalizeRestore`
(`apps/extension/src/wallet/services/profile/service.ts:2572`), wipe the passkey stash entry for `id`
on every path that does not consume it: read `const seen = this.pendingRestoreSecrets.get(id)` at
entry, and wrap the exclusive body in `try { … } finally { if (this.pendingRestoreSecrets.get(id) ===
seen) this.pendingRestoreSecrets.drop(id) }`. A successful passkey finalize has already removed the
entry with `take`, so the `drop` is a no-op there. The identity guard keeps a finalize released by the
facade lock's hold watchdog from wiping an entry a later `restore()` stashed. The `finally` covers the
issue's type refusal and the paths the issue missed: a row whose `type` became `"password"` (the
password branch never reads the passkey stash), the already-active no-op return, and the missing-row
and tombstone refusals. Finalize is the single consumer of the entry, and a finalize that throws
already falls back to the documented unlock-later recovery (`:2589-2594`), which never reads the
stash.

**#31 profile projection.**

- Return `this.getProfileInfo(profile)` from `createProfile`, `createPasskeyProfile`,
  `changeProfilePassword`, `importPasswordProfile`, `importPasskeyProfile` and `deleteProfile` (both
  returns; the issue missed this one).
- `changeProfileName` returns the bare identity `{ id, name, type }`, never `recoveryMode`. That keeps
  today's visible behaviour exactly: `EditProfilePopup` assigns the result to `appStore.profile`, and
  today's row carries no `recoveryMode`, so the recovery banner hides after a rename in recovery mode.
  Restoring the banner is OA-1. Add a private `profileIdentity(profile)` helper for `{ id, name, type }`
  and reuse it in `backup()` (`:2190`), which builds the same object by hand.
  *Superseded by the owner's OA-1 pick (D18):* `changeProfileName` returns `getProfileInfo(profile)`,
  `recoveryMode` included, so the banner stays after a rename.
- In `apps/extension/src/wallet/services/profile/expiring-stash.ts`, override `set` so that replacing
  an entry with a different object wipes the old one, expired or not, and still returns `this`. Rewrite
  the class comment: a replacing `set` wipes the old entry, so a new entry must never share a buffer
  with the one it replaces. Today no path sets over an existing key (password restore allocates a new
  id at `:2349-2351`, passkey restore refuses an existing id at `:2490-2492`, `deleteProfile` drops both
  stashes), so this is defence in depth that covers all three `set` sites (`:2369`, `:2531`, `:2545`)
  and any future one.

**#27 class id on restore.** Add a parse-and-assert helper next to the existing assert, in
`packages/aztec-runtime/src/pxe/artifact-class-id.ts`:

```ts
/** Refuses unless the wire-form artifact hashes to the wire-form instance's current class id. Every
 *  local failure (a schema parse, a hash, a mismatch) throws the one fixed mismatch text, because the
 *  upstream messages carry artifact-chosen names that would reach logs and the restore's connectivity
 *  classifier. For registration inputs that crossed a trust boundary as JSON. */
export async function assertWireArtifactClassId(instance: unknown, artifact: unknown): Promise<void>
```

As implemented (D16): the helper checks the artifact against the instance's **original** class id,
the one the address commits to, and refuses an instance whose current class id differs from it.

It parses with `ContractInstanceWithAddressSchema` and `ContractArtifactSchema` (as
`execution/service.ts:839-853` does), calls `assertArtifactClassId`, and rethrows any failure as
`new Error("Contract artifact doesn't match instance's current class id")`, the existing text. Export
it from `@nulo/aztec-runtime/pxe`. In `apps/extension/src/wallet/services/account-state/service.ts`
`prepareContractRegistration`, `launch` awaits it before `pxeService.registerContract`. A throw goes to
`recordFailure`, so the refusal is per contract: the item records a `restoreError` with the fixed text,
its siblings still register, and `classifyRestoreFailure` does not mark the network unreachable,
because the fixed text matches none of `isConnectivityErrorMessage`'s words.

Upstream `pxe.registerContract` performs no class-id validation ("registration performs no
validation", `@aztec-labs/pxe` 6.0.0-rc.1 `dest/pxe.js:538-543`), so this check is the only one on the
restore path. Running the hash first also means a hostile artifact whose upstream hash error names a
function `…timeout…` can no longer reach the connectivity classifier through `registerContract`.

Visible effect: a backup whose contract does not match itself now ends the import with the existing
"Profile import completed with some errors. You can review the details or continue." warning, and the
details viewer shows the fixed text for that contract. That is OA-3.

### Arc 3 — services

**#33 transfer estimate reuse.**

- Move `FpcIdentitySnapshot` and a builder `fpcIdentityOf(info: FpcInfo)` to
  `apps/extension/src/wallet/services/fpc/spec.ts`, next to `FpcInfo`, so a fee strategy never imports
  the reuse-cache module.
- In `execution/estimate-reuse-shared.ts`, add the two comparisons both ladders use, each returning a
  fixed category or `undefined` so each ladder step is one `if` (complexity budget):
  - `chainIdentityDrift(snapshot, readLive): Promise<string | undefined>` returns
    `"chain identity drift"` on a mismatch or a throw.
  - `fpcIdentityDrift(paymentMethod, snapshot, getFpcInfo): Promise<string | undefined>` returns
    `undefined` for a non-FPC payment, `"fpc identity missing"` for an FPC payment without a snapshot
    (fail closed), `"fpc row unavailable"` on a throw, `"fpc identity drift"` on a field mismatch.
- The operation ladder switches to both helpers. Its order is unchanged; two debug reasons lose the
  error message they carried (`chain identity drift: <msg>`, `fpc row unavailable: <msg>`), and its
  FPC check now fails closed where it skipped a missing snapshot (`operation-estimate-reuse.ts:146`).
- `FpcStrategy.buildAndEstimate` adds `fpcIdentity: fpcIdentityOf(fpc.infoData)` to its `FeeEstimate`
  at both return points (`fee/fpc-strategy.ts:195`, `:289`). `FeeEstimate` gains the optional field.
  The snapshot is then the exact row the build used (decision D6).
- `TransferEstimateReuseEntry` gains `chainIdentity` (from `built.chainIdentity`, the pair the build
  signed under) and `fpcIdentity?` (from `built.fpcIdentity`). The stash site is
  `transfer-executor.ts:548`.
- `TransferEstimateReuseDeps` gains `getLiveChainIdentity(network)` and `getFpcInfo(fpcId)`.
  `execution/service.ts` wires both from the private method it already uses for the operation ladder
  (`:303-308`).
- New transfer ladder steps, after the primary-endpoint step and before the base-fee step: chain
  identity, then FPC identity. Each logs its fixed category only.
- The dApp stash site (`dapp-send-executor.ts:469-479`) switches to `built.fpcIdentity` and drops its
  post-build `getFpcInfo` read (decision D6).

The ladder adds one node read (`getNodeInfo` inside `getLiveChainIdentity`, which the operation
ladder already makes) and one storage read. A failure in either is a miss and a rebuild, never a send.

**#32 account fences.** In `apps/extension/src/wallet/services/account/service.ts`:

- `createAccount`: before the existing `deletion.assertCurrent`, refuse with `"network deleted"` (the
  token writers' existing text) when `await networkService.isChainLive(profileId, chainId)` is false.
  The check awaits, so it sits before the assert, keeping "no await between the epoch assert and the
  write". After `storage.set`, await `isChainLive` again, then synchronously check
  `deletion.isCurrent(profileId, epoch)`. If either fails, delete the row under
  `tupleLocks.withLock(accountRowIdOf(account))` and throw (`"network deleted"`, or the deletion
  state's own refusal). Emit `onAccountAdded` right after the passing check, with no await between.
- `importAccount`: the same pre-check before its `deletion.assertCurrent`, and the same post-write
  pair (liveness, then epoch) inside the existing `try`, so the existing `catch` also removes the key
  row.
- `reconcileImportedAccounts`: run the key-absence re-check and the delete inside
  `tupleLocks.withLock(accountRowIdOf(account), …)`.

**#25 note arm epochs.** In `apps/extension/src/wallet/services/incoming-transfer/service.ts`:

- `commitScannedNote` passes `() => this.serviceEpoch !== ctx.epochAtStart` to `resolveReceiptTrust`
  and returns on `undefined`, then re-checks the epoch before `commitDiscoveredNote`.
- `commitDiscoveredNote` re-checks after `markBalanceDirty` (before the record write) and before the
  `Added` emit, as `commitPublicRecord` does.
- `resolveReceiptTrust` loses its overload: both arms now supply `standDown`. Rewrite the two comments
  that state the gap.
- `repository.setTrust`'s own await stays unfenced; the issue says so, and the public arm has the same
  limit (`(DRIFT PIN) P6`).

**#35 userinfo.** Move the userinfo rule into the shared verdict in
`packages/wallet-core/src/utils/rpc-url.ts`: a new refusal `{ allowed: false; refusal: "userinfo" }`
when `url.username !== "" || url.password !== ""`, judged first. Rename nothing.

- `RpcUrlSchema` (`network/spec.ts:155`) drops its inline check; its refusal and its message stay the
  same, because the verdict now refuses.
- `isAllowedRpcUrl` in the adapter maps `"userinfo"` to the fixed reason
  `"userinfo is not permitted in an RPC URL"`, and replaces `not a valid URL: ${rpcUrl}` with the
  fixed `"not a valid URL"`: an unparseable URL (a bad port, say) can still carry credentials.
- Update the doc comments that state the old difference (`rpc-url.ts`, the adapter header,
  `RpcUrlSchema`'s comment) and the pinning tables.

No stored row can carry a userinfo URL: the schema refuses it at every add, update and restore
boundary (`network/spec.ts:59-62`), and the wallet has no pre-rule rows to load. So the adapter refusal
changes nothing a person sees; it is the last gate if a future write path forgets the schema.

### File-level change map

| Arc | File | Change |
|---|---|---|
| 1 | `packages/wallet-bridge/src/method-descriptors.ts` | flag on `grantPublicAuthwit` |
| 1 | `packages/wallet-bridge/src/capability-negotiation.ts` | `projectStoredGrants`; used in `computeCapabilityDelta` |
| 1 | `packages/wallet-bridge/src/dispatcher.ts` | `enforceCapability` and the post-decision read go through `projectStoredGrants` |
| 1 | `packages/wallet-bridge/README.md` | § Not in `batch` |
| 1 | `apps/extension/src/wallet/services/execution/contract-resolver.ts` | `selectorBindingRefusal` |
| 1 | tests: `dapp-grant.characterization.test.ts`, `stored-grants.test.ts` (new), `dispatcher.test.ts` (wallet-bridge); `contract-resolver.test.ts`, `fast-path.test.ts`, `view-executor.test.ts`, `tx-request-builder.pins.test.ts`, `service.authwit-binding.test.ts`, `authwit-discoverer.real.test.ts` (execution) | see phases |
| 2 | `apps/extension/src/wallet/services/profile/service.ts` | finalize `finally`, projections, `profileIdentity` |
| 2 | `apps/extension/src/wallet/services/profile/expiring-stash.ts` | wiping `set` |
| 2 | `packages/aztec-runtime/src/pxe/artifact-class-id.ts`, `pxe/index.ts` | `assertWireArtifactClassId` |
| 2 | `apps/extension/src/wallet/services/account-state/service.ts` | assert in `launch` |
| 2 | tests: `expiring-stash.test.ts` (new), `profile/service.integration.test.ts`, `pxe/artifact-class-id.test.ts` (new), `account-state/service.test.ts`, `account-state/restore-surface.pins.test.ts` | see phases |
| 3 | `fpc/spec.ts`, `execution/estimate-reuse-shared.ts`, `operation-estimate-reuse.ts`, `transfer-estimate-reuse.ts`, `transfer-executor.ts`, `dapp-send-executor.ts`, `fee/fee-strategy.ts`, `fee/fpc-strategy.ts`, `execution/service.ts` | #33 |
| 3 | `account/service.ts` | #32 |
| 3 | `incoming-transfer/service.ts` | #25 |
| 3 | `packages/wallet-core/src/utils/rpc-url.ts`, `packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts`, `apps/extension/src/wallet/services/network/spec.ts` | #35 |
| 3 | tests: the two reuse test files and their pins, `estimate-reuse-shared.test.ts`, `dapp-send-executor.test.ts`, an FpcStrategy test in `execution/fee/`, `account/service.test.ts`, `incoming-transfer/service.scenarios.test.ts`, `rpc-url.test.ts`, `aztec-node-factory-adapter.test.ts`, `network/spec.test.ts` | see phases |

### Trade-offs and alternatives not taken

See the decision ledger below. The short form: refuse a malformed stored grant at the two grant reads
over dropping it or validating on write (#29); plain `Error` with today's words minus the values over a
typed refusal (#13, owner-gated); restore-site class-id check over a check at the PXE seam for every
registration (#27); a wiping `set` over a `drop` before each `set` (#31); the strategy's own row over a
post-build read (#33); the shared verdict over a second userinfo helper (#35).

## Phases

Each phase lists its steps, then its validation gate. Run the fast layers after each step. A phase
gets its ✓ only when its gate passes. `<WT>` is the worktree root.

**e2e rules for every gate.** Never run two e2e invocations at once. Network runs set
`NULO_E2E_RETRY=0`, and a file marked `@requires-proverless` runs in its own invocation with
`NULO_E2E_PROVERLESS=1`. Smoke runs need an armed build made right before them (an `e2e:agent` run
rebuilds `dist/chrome` for the sandbox):
`cd <WT>/apps/extension && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 bun run build:chrome`,
then `NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e <files> --retry=0`. A red file gets one rerun of
that file alone; a second red is breakage, not a flake.

### Arc 1 — bridge and dispatch

#### Phase 1 — #28 grantPublicAuthwit refused in a batch ✓

1. Set `refusedInBatch: true` on `grantPublicAuthwit` in `method-descriptors.ts`.
2. In `dapp-grant.characterization.test.ts`, define `GRANT_LEG` next to `SEND_LEG` and `TOKEN_LEG`, with the arguments the drift pin at `:333-336` uses (`[ACC1, content]`), and add the row `["grantPublicAuthwit alone", [GRANT_LEG], "grantPublicAuthwit"]` to the `test.each` of refused legs.
3. Delete the `(DRIFT PIN) grantPublicAuthwit runs inside a batch` test; the new row replaces it.
4. Change the exact-set test to expect `["grantPublicAuthwit", "registerToken", "sendTx"]`.
5. Keep the existing success controls (`runnable legs run in order…`, and the `createAuthWit` batch-leg window test in `dispatcher.test.ts`).
6. Update `packages/wallet-bridge/README.md` § Not in `batch`.

**Validation gate.**
- Commands: `cd <WT>/packages/wallet-bridge && bun --bun vitest run src/dapp-grant.characterization.test.ts src/dispatcher.test.ts src/method-descriptors.test.ts`, then `cd <WT> && bun run lint && bun run typecheck:all`.
- Pass: exit 0. The new row fails on the base commit (prove it once: revert the flag, rerun, see the row fail).
- Layers: lint, typecheck, unit.

#### Phase 2 — #29 stored grants re-projected on read ✓

1. Add `projectStoredGrants` to `capability-negotiation.ts`; call it in `computeCapabilityDelta`.
2. In `dispatcher.ts`, `enforceCapability` and the post-decision read in `handleRequestCapabilities` read their grants through it.
3. Add `packages/wallet-bridge/src/stored-grants.test.ts`:
   - one `test.each` row per refused class, each asserting the `ValidationError` class and its fixed text: a non-object record, a record without a capability object, `contracts: {}`, a `null` scope pattern, an element `String()` cannot convert, a malformed address;
   - an idempotence control: for one valid request of each known type, a stored record holding `projectKnownCapability(request)` reads back deep-equal, `grantedAt` kept;
   - an unknown capability type passes untouched.
4. In `dapp-grant.characterization.test.ts`, rewrite the four tests that pin a malformed stored grant: `:165` (malformed address; today a scope refusal and a window), `:208` (`contracts: {}`; today a `TypeError` on both paths), `:233` (`null` pattern) and `:240` (`{ toString: 1 }`). Each now expects the `ValidationError` on every path it exercises. Keep `:226` (a valid address-book-only grant) unchanged as the control.
5. In `dispatcher.test.ts`, with its consent harness: a session holding a malformed broad transaction grant beside a valid narrow simulation grant, with "authorize without asking" on, refuses `createAuthWit` with the `ValidationError`; nothing is signed and no window opens. Control: the same session without the malformed grant behaves exactly as today.
6. In `dispatcher.test.ts`: a valid session whose `applyCapabilityDecision` returns a row holding a malformed grant beside the decided one refuses `requestCapabilities` with the `ValidationError`. Control: a valid returned row answers as today.

**Validation gate.**
- Commands: `cd <WT>/packages/wallet-bridge && bun --bun vitest run`, then `cd <WT> && bun run lint && bun run typecheck:all`.
- Pass: exit 0. The rewritten tests, the consent test and the post-decision test fail on the base commit.
- Layers: lint, typecheck, unit.

#### Phase 3 — #13 fixed selector-binding text, then the arc gate ✓

1. Add `selectorBindingRefusal(policy)` next to `SelectorBindingPolicy`; `assertSelectorBinding` throws it.
2. In `contract-resolver.test.ts`, for each policy (`CALL_BINDING`, `AUTHWIT_CALL_BINDING`, `NAMED_CALL_BINDING`, the last with an absent name too), assert the thrown message equals the fixed text and contains neither the claimed name, the resolved function's name, nor the target. Control: a matching name returns the function.
3. Update the eight assertions that spell out the old text: `fast-path.test.ts:300`, `:397`, `:414`, `:635`; `view-executor.test.ts:478`; `tx-request-builder.pins.test.ts:402`; `service.authwit-binding.test.ts:138`; `authwit-discoverer.real.test.ts:299`. The three `/Scope violation/` assertions (`tx-request-builder.pins.test.ts:318`, `view-executor.test.ts:345`, `:374`) still match and stay.
4. In `fast-path.test.ts`, for a mixed batch whose named call mismatches, assert the fallback's `logError` argument carries neither name nor address.

**Validation gate (also the arc 1 gate).**
- Commands:
  - `cd <WT>/apps/extension && bun --bun vitest run src/wallet/services/execution/`
  - `cd <WT> && bun run lint && bun run typecheck:all && bun run test && bun run test:all`
  - `cd <WT> && NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/batch-mixed.test.ts tests/e2e/network/batch-partial-failure.test.ts tests/e2e/network/meta-batch.test.ts tests/e2e/network/scope-refusal.test.ts tests/e2e/network/err-scope-and-cap.test.ts tests/e2e/network/cap-widening.test.ts tests/e2e/network/cap-request-repeat-noPopup.test.ts tests/e2e/network/sim-methods.test.ts tests/e2e/network/authwit-variants.test.ts tests/e2e/network/authwit-lifecycle.test.ts tests/e2e/network/tx-sendTx-default.test.ts`
- Pass: every command exits 0, under the e2e rules above.
- Layers: lint, typecheck, unit, integration, network e2e.

### Arc 2 — profile and backup

#### Phase 4 — #30 the restore stash dies with finalize ✓

1. In `finalizeRestore`, record the stash entry seen at entry; in a `finally`, drop the entry for `id` only if it is still that one.
2. Replace the `(BUG PIN) finalize's type refusal keeps the stashed secret` test with one `test.each` over the paths that do not consume the stash: type `"bogus"`, type `"password"`, an already-active session, a missing row, a tombstoned id. Each row asserts the outcome (refusal or no-op), that the stash has no entry for `id`, and that the captured `secret` and `dek` buffers are all zero.
3. Add one test for the guard: a finalize that finds a different entry at its end (a later stash for the same id) leaves that entry intact.
4. Keep the existing passkey finalize tests as the success control (a genuine finalize still opens a session).

**Validation gate.**
- Commands: `cd <WT>/apps/extension && bun --bun vitest run src/wallet/services/profile/`, then `cd <WT> && bun run lint && bun run typecheck:all`.
- Pass: exit 0; every row of the new table fails on the base commit.
- Layers: lint, typecheck, unit, integration.

#### Phase 5 — #31 profile RPCs return the projection ✓

1. Add `profileIdentity(profile)` and reuse it in `backup()`.
2. Return `getProfileInfo(profile)` from the six methods named in the architecture section; return `profileIdentity(profile)` from `changeProfileName`.
3. Override `ExpiringStash.set` to wipe a replaced entry that is a different object, expired or not, returning `this`; rewrite the class comment.
4. Add `profile/expiring-stash.test.ts`: a `set` over a live entry wipes the old buffers; a `set` over an expired, unswept entry wipes it; a `set` of the same object wipes nothing; a `set` on a new key wipes nothing.
5. In `service.integration.test.ts`, add one table test over the eight RPC returns: each result's keys are a subset of `id`, `name`, `type`, `recoveryMode`.
6. Add a `(BUG PIN)` test: a rename in recovery mode returns no `recoveryMode`. Name OA-1 in its comment.
   *Superseded (D18):* the test pins the opposite, a rename in recovery mode returns `recoveryMode: true`.
7. Run `EditProfilePopup.test.ts` unchanged as the popup's success control.

**Validation gate.**
- Commands: `cd <WT>/apps/extension && bun --bun vitest run src/wallet/services/profile/ src/popup/components/popups/EditProfilePopup.test.ts`, then `cd <WT> && bun run lint && bun run typecheck:all`.
- Pass: exit 0; the key-set table and the stash tests fail on the base commit.
- Layers: lint, typecheck, unit, integration, component.

#### Phase 6 — #27 class id checked before a restored contract registers, then the arc gate ✓

1. Add `assertWireArtifactClassId` to `artifact-class-id.ts` and export it from `pxe/index.ts`.
2. Add `packages/aztec-runtime/src/pxe/artifact-class-id.test.ts` with `// @vitest-environment node`. Use the genuine instance and `FrozenSchnorrAccountArtifact` in wire form, as `register-contract.test.ts` does.
3. In it: the genuine pair passes (control); then one test per refused class, each asserting the fixed text exactly: an artifact of another class id; an artifact whose private function lacks its verification key and is named `transfer_timeout_refused` (the upstream message would name it); an artifact that fails the schema parse.
4. In `account-state/service.ts`, await the helper inside `launch` before `registerContract`.
5. In `account-state/service.test.ts` and `restore-surface.pins.test.ts`, mock the helper to resolve, so the stub fixtures keep working.
6. Add one restore test: the helper rejects with the fixed text for the first of two contracts. Assert that contract's `restoreError` is the fixed text, `registerContract` never ran for it, the second contract still registers, and it carries no "skipped, unreachable" error.

**Validation gate (also the arc 2 gate).**
- Commands:
  - `cd <WT>/packages/aztec-runtime && bun --bun vitest run src/pxe/`
  - `cd <WT>/apps/extension && bun --bun vitest run src/wallet/services/account-state/ src/wallet/services/profile/`
  - `cd <WT> && bun run lint && bun run typecheck:all && bun run test && bun run test:all`
  - Smoke, after the armed build: `cd <WT>/apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e tests/e2e/profile-rename.test.ts tests/e2e/security.test.ts tests/e2e/registration.test.ts tests/e2e/onboarding-import.test.ts tests/e2e/passkey-backup.test.ts tests/e2e/passkey-paths.test.ts tests/e2e/passkey-retry.test.ts tests/e2e/backup-roundtrip.test.ts tests/e2e/import-dead-rpc.test.ts --retry=0`
  - `cd <WT> && NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/backup-restore-integrity.test.ts tests/e2e/network/backup-migration-roundtrip.test.ts tests/e2e/network/profile-reimport-matrix.test.ts`
- Pass: every command exits 0, under the e2e rules above.
- Layers: lint, typecheck, unit, integration, smoke e2e, network e2e.

### Arc 3 — services

#### Phase 7 — #33 the transfer ladder binds sponsor and chain ✓

1. Move `FpcIdentitySnapshot` and `fpcIdentityOf` to `fpc/spec.ts`; add `chainIdentityDrift` and `fpcIdentityDrift` to `estimate-reuse-shared.ts`; point the operation ladder at them.
2. Add `fpcIdentity?` to `FeeEstimate`; set it at both `FpcStrategy` return points.
3. Add `chainIdentity` and `fpcIdentity?` to the transfer entry; fill them at the stash site.
4. Switch the dApp stash site to `built.fpcIdentity`; delete its `getFpcInfo` read.
5. Add the two deps and the two ladder steps to `TransferEstimateReuse`; wire them in `execution/service.ts`.
6. Tests in `transfer-estimate-reuse.test.ts`, one per refused class: the sponsor address edited in place misses (`fpc identity drift`); the sponsor row deleted misses (`fpc row unavailable`); an FPC entry without a snapshot misses (`fpc identity missing`); the chain pair drifted misses; the live-chain read throwing misses with the fixed category only. Controls: an unchanged sponsor and chain hit; an `fj` entry skips the FPC read.
7. Update the call-order pins in `transfer-estimate-reuse.pins.test.ts`. In `operation-estimate-reuse.pins.test.ts`, change the two reasons that carried the error message (`:239`, `:270`) to the fixed categories, and add the missing-snapshot miss.
8. In the FpcStrategy tests under `execution/fee/`, assert both return points set `fpcIdentity` to the row the build read.
9. In `dapp-send-executor.test.ts`, the D6 test: the row changes after the build read it; the stashed snapshot is the build's row, and consuming it misses.

**Validation gate.**
- Commands: `cd <WT>/apps/extension && bun --bun vitest run src/wallet/services/execution/ src/wallet/services/fpc/`, then `cd <WT> && bun run lint && bun run typecheck:all`.
- Pass: exit 0; the sponsor-edit, missing-snapshot, chain-drift and D6 tests fail on the base commit.
- Layers: lint, typecheck, unit.

#### Phase 8 — #32 account writes fenced on chain liveness ✓

1. Add the pre-write liveness check and the post-write liveness-then-epoch check with compensation to `createAccount` and `importAccount`.
2. Take the row lock around the reconcile re-check and delete.
3. Add `isChainLive` to the network stub of every test file that builds an `AccountService` (the seven under `account/` and `cross-profile-isolation.test.ts`).
4. Tests in `account/service.test.ts`: a chain reserved for deletion before the write refuses the create with no row; a chain reserved during the row write removes the row and throws; a profile deletion that lands during the post-write liveness read removes the row, throws, and emits nothing; the same three for import, with the key row gone too; a reconcile delete waits for a rename parked on the same row (use `parkRowRead`).
5. Keep a create and an import on a live chain, each emitting once, as success controls.

**Validation gate.**
- Commands: `cd <WT>/apps/extension && bun --bun vitest run src/wallet/services/account/ src/wallet/services/cross-profile-isolation.test.ts`, then `cd <WT> && bun run lint && bun run typecheck:all`.
- Pass: exit 0; the new fence and lock tests fail on the base commit.
- Layers: lint, typecheck, unit, integration.

#### Phase 9 — #25 the note arm gets the public arm's epoch checks ✓

1. Pass `standDown` from the note arm; return on `undefined`; re-check after the trust read.
2. Re-check after `markBalanceDirty` and before the `Added` emit in `commitDiscoveredNote`.
3. Remove the `resolveReceiptTrust` overload; rewrite the two comments that describe the gap.
4. In the note matrix of `service.scenarios.test.ts`, flip rows N1-N5 to stand down at the trust read: expected flags `"000000"`, and the expected call log and `stop` argument end at `getTrust`.
5. Flip N9 to stop after the outbox write (`"111100"`), N9-trusted to `"000100"`, and the trusted N10 and N11 to `"000110"` (log ends at the `Added` visibility read), each with its expected log and `stop` updated.
6. Keep N6 and N7 at `"111000"`, with the log now ending at `pending`. Keep N10 (unknown trust) at `"111110"`: a bump during the record write itself cannot be fenced, as the public P9 row shows.
7. Drop `(DRIFT PIN)` from every row the fix closes and from N10 (unknown); keep it on N6 and N7. The note rows then mirror the public P rows.

**Validation gate.**
- Commands: `cd <WT>/apps/extension && bun --bun vitest run src/wallet/services/incoming-transfer/`, then `cd <WT> && bun run lint && bun run typecheck:all`.
- Pass: exit 0; `bun run lint` (which runs the complexity baseline check) reports no manifest drift.
- Layers: lint, typecheck, unit, integration.

#### Phase 10 — #35 userinfo refused at the last gate, then the arc gate ✓

1. Add the `"userinfo"` refusal to `rpcTransportVerdict`, judged first.
2. Map it to the fixed reason in `isAllowedRpcUrl`; make the unparseable-URL reason fixed.
3. Drop the inline userinfo check from `RpcUrlSchema`; keep its message.
4. Update the doc comments that describe the old difference.
5. In `rpc-url.test.ts`, flip the row that pins `https://user@rpc.example.com` as allowed (`:6`) to refused, and add `https://user:pass@host.example` and `https://:pass@host.example` as refused; keep `https://@b.example` allowed (empty userinfo).
6. In `aztec-node-factory-adapter.test.ts`, flip the four userinfo rows to the fixed reason and the pinned invalid-URL rows to `"not a valid URL"`; assert no reason contains the input URL or its userinfo; keep `https://@b.example` as OK.
7. In `network/spec.test.ts`, keep the rows; rewrite the header comment so it no longer names userinfo as a difference.

**Validation gate (also the arc 3 gate).**
- Commands:
  - `cd <WT>/packages/wallet-core && bun --bun vitest run src/utils/rpc-url.test.ts`
  - `cd <WT>/packages/aztec-runtime && bun --bun vitest run src/adapters/`
  - `cd <WT>/apps/extension && bun --bun vitest run src/wallet/services/network/ src/wallet/services/execution/ src/wallet/services/fpc/ src/wallet/services/account/ src/wallet/services/cross-profile-isolation.test.ts src/wallet/services/incoming-transfer/`
  - `cd <WT> && bun run lint && bun run typecheck:all && bun run test && bun run test:all`
  - Smoke, after the armed build: `cd <WT>/apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e tests/e2e/accounts.test.ts tests/e2e/account-import-export.test.ts tests/e2e/backup-imported-account.test.ts tests/e2e/endpoints.test.ts tests/e2e/settings-crud.test.ts --retry=0`
  - `cd <WT> && NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-methods.test.ts tests/e2e/network/send-amount-exact.test.ts tests/e2e/network/transfers.test.ts tests/e2e/network/tx-sendTx-sponsoredFpc.test.ts tests/e2e/network/account-balance-orphans.test.ts tests/e2e/network/incoming-transfers.test.ts tests/e2e/network/incoming-public-transfers.test.ts tests/e2e/network/networks.test.ts`
  - Then, alone: `cd <WT> && NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-arrival.test.ts`
- Pass: every command exits 0, under the e2e rules above.
- Layers: lint, typecheck, unit, integration, smoke e2e, network e2e.

## Security & Adversarial Considerations

**Threat model.**

- A hostile dApp, or a raw protocol client that bypasses the SDK's Zod: sends batch legs the SDK
  would refuse (#28), call names that disagree with their selectors (#13).
- A hostile backup file: carries a contract whose artifact does not match its instance, or whose
  artifact names a function so that an upstream error text reads like a connectivity failure (#27).
  The file is attacker-controlled input, and the restore runs before the profile opens.
- An extension page with a bug, or an old dev row: writes grants that never passed projection (#29).
  Storage tampering is not this path: the session MAC drops a tampered row.
- A local attacker who reads memory or an exported log: secrets in an unwiped stash (#30, #31),
  sealed key material in popup state (#31), dApp function names and addresses in the log viewer's
  CSV export (#13), URL credentials in a refusal reason (#35).
- A phishing RPC URL with userinfo, the part a person reads (#35).
- Concurrency inside the service worker: a lock watchdog hand-off, a chain purge or a profile deletion
  that interleaves a writer's await (#30, #32, #25), and a sponsor row edited between estimate and
  confirm (#33).

**What could go wrong with the fixes.**

- #29 refuses a dApp whose stored row holds a malformed grant until the person disconnects it. Only a
  row no wallet writer produces can trigger it, and today's behaviour for most such rows is the same
  failure as a `TypeError`. A projection bug would refuse valid rows: the per-type idempotence test is
  the guard. A future tightening of the projectors would refuse rows stored under the older rule, so
  it needs its own migration decision once the wallet has users.
- #13 removes diagnostic detail from logs. Accepted: the logging policy forbids request values in a
  finished string; the stack still names the throwing function, and a developer reproduces with the
  dApp's own call.
- #30 drops the stash on a finalize that throws. The documented recovery for a finalize that throws
  is the normal unlock, which never reads the stash.
- #27 refuses a real backup whose artifact the wallet cannot hash. That contract could not have been
  used anyway (the PXE keys artifacts by class id); the refusal is per contract and the rest of the
  restore continues. The hash now also runs in the service worker during a restore: a hostile
  artifact up to the 40 MiB slice cap (`account-state/normalize.ts:34`) can stall the worker during an
  import the person started. The execution path already hashes in the worker
  (`execution/service.ts:854`), and the offscreen PXE hashed the same artifact before this change.
- #33 adds one node read and one storage read to the confirm path; a failure in either is a miss and
  a rebuild, never a send.
- #32 refuses a create or import that raced a network or profile deletion, with the token writers'
  existing `"network deleted"` text.
- #35 changes nothing for stored rows (none can carry userinfo); a future write path that skips the
  schema now fails at node construction instead of sending credentials.

**Residual risks, not closed here.**

- A class id commits to bytecode and selectors, not to parameter names, storage layout or other ABI
  metadata, and upstream keeps the first artifact stored per class. A hostile backup can still plant a
  same-class artifact whose names mislead the approval card. Follow-up.
- `repository.setTrust`'s own await is unfenced on both incoming arms.
- `#30`'s guard protects cleanup, not consumption: a finalize released by the 5-minute watchdog could
  take a later same-id restore's entry. Reaching it needs the finalize parked over five minutes on a
  local read and a delete-and-restore of the same id inside that window; rejected as unrealistic.

**Least privilege.** No CI, token, permission or workflow change.

**Cryptography.** No new primitive. The class id comes from upstream
`getContractClassFromArtifact` (`@aztec-labs/stdlib`, exact pin `6.0.0-rc.1`); wiping uses the existing
`zeroize` (`@nulo/wallet-crypto`).

**Input validation at trust boundaries.** Stored grants re-projected on read (#29); wire instance and
artifact parsed by the upstream schemas, then the class id checked (#27); RPC URLs refused with
userinfo at the adapter (#35); batch legs pre-scanned (#28).

**Supply chain.** No dependency added or bumped; `bun.lock` does not change.

**Log redaction.** Every new refusal text and every new ladder reason is a fixed category with no
request value. The adapter's reasons never echo the URL.

## Assumptions

### Facts

- F1. `BATCH_REFUSED_METHODS` derives from `refusedInBatch` (`method-descriptors.ts:395`); the pre-scan runs before any leg (`dispatcher.ts:522-526`).
- F2. `dispatch()` reads the session row once per invocation (`dispatcher.ts:279`); a batch leg is its own invocation and reads again. On the dApp path, grants are interpreted only by `enforceCapability` (`:1014`), whose result the handlers receive, by `computeCapabilityDelta` (`capability-negotiation.ts:325`), and by the post-decision read (`:804`) of the row `applyCapabilityDecision` returns; `getAccounts`'s read (`:457`) runs after `enforceCapability`. The Settings → Connected apps page passes raw stored capabilities to `authorizationsEffective` (`popup/pages/settings/connected-apps/[id].vue:76`, `:88`), off the signing path. The session service's writers (`dapp-session/service.ts:35`, `:292`, `:350`, `:367`) and `queued-journal.ts:106` (best-effort) read raw records outside this path.
- F3. The session codec is tolerant on grants and the row MAC drops a tampered row (`dapp-session/spec.ts:70`, `:93-94`, `mac` field comment).
- F4. A plain `Error`, a `TypeError` and a `ValidationError` all reach a dApp as `UNCLASSIFIED_ERROR_MESSAGE` (`wallet-sdk/error-envelope.ts:219`, fall-through); a queued send's row is filed `scope_refused` only for a `ScopeViolationError` (`queued-journal.ts:244`).
- F5. The journal detail page renders `error.message` and `error.normalizedRaw` only in debug or developer mode (`popup/pages/journal/[id].vue:204`, `:292-304`).
- F6. `finalizeRestore` sends any `password` row to the password branch, which never reads `pendingRestoreSecrets` (`profile/service.ts:2608-2613`, `:2623-2650`).
- F7. `EditProfilePopup` assigns the rename result to `appStore.profile` (`EditProfilePopup.vue:84`); `RecoveryModeBanner` shows on `appStore.profile?.recoveryMode` (`RecoveryModeBanner.vue:8`).
- F8. `getProfileInfo` adds `recoveryMode` from the live session (`profile/service.ts:2184-2188`).
- F9. Neither the PXE seam (`packages/aztec-runtime/src/pxe/service.ts:451-476`, address derivation only) nor upstream `pxe.registerContract` checks the class id.
- F10. `FeeEstimate` extends `BuiltStandardTx`, which carries the builder's `chainIdentity` (`fee/fee-strategy.ts:73`, `tx-request-builder.ts:89`).
- F11. `FpcStrategy` reads the sponsor row once per build (`fee/fpc-strategy.ts:116`).
- F12. `isChainLive` is async and lock-free, and false while a network is reserved for deletion (`network/service.ts:556`, `:589-593`); `resolveVerifiedL1ChainId` already requires a network row (`:438-439`).
- F13. The note matrix pins N1-N7 and N9-N11 as `(DRIFT PIN)` (`service.scenarios.test.ts:5660-5745`).
- F14. `https://@b.example` is accepted by both the schema and the adapter (empty userinfo).
- F15. A restore error reaches the person: any `restoreError` raises the import's warning (`ImportFullBackupForm.vue:38`, `restore-warning.ts:2`) and "review the details" opens the data viewer on the error log (`popup/pages/import.vue:136-141`).
- F16. Every grant the dispatcher stores was projected by `projectKnownCapability` first (`capability-negotiation.ts:471-499`; requests at `dispatcher.ts:762`); the session service's setters themselves accept unvalidated records (`dapp-session/service.ts:303`, `:342`).

### Inferences

- I1. No current wallet writer produces a malformed grant; the RPC setters accept unvalidated records, but their one non-test caller passes `[]`. #29 is fail-closed hardening of the read, plus a dev-row repair.
- I2. The debug/developer journal detail is rendered text, so its raw error text changing is a visible change; the lane brief mandates it and it ships with today's words minus the values. OA-2 asks for the acknowledgement.
- I3. A per-contract class-id refusal shows the existing warning only for a backup whose contract does not match itself, which no wallet export produces. OA-3 asks for the acknowledgement.
- I4. A `set` over an existing stash key cannot happen today; the wiping `set` is defence in depth.
- I5. One `bun run e2e:agent` invocation accepts several test files (it forwards `"$@"` to vitest), except that a proverless-marked file needs its own `NULO_E2E_PROVERLESS=1` run.
- I6. The class-id hash of a real artifact costs tens of milliseconds; a hostile artifact can cost more, bounded by the 40 MiB slice cap, in an import the person started.

### Asks

No Ask blocks this plan. Each owner ask holds back only a choice between the shipped today-closest
form and an alternative; the working assumption is the shipped form.

- OA-1 (#31): after a rename in recovery mode, should the recovery banner stay? Answered A (keep it)
  on 2026-10-08; built in arc 2 (D18).
- OA-2 (#13): acknowledge that the debug/developer journal detail loses the function names and
  address; and should the refusal become a typed scope refusal ("Not allowed", dApp code 4100)?
  Shipped: unclassified, today's words minus the values. Answered A (classify) on 2026-10-08; the
  classification is a follow-up, not built in this lane.
- OA-3 (#27): acknowledge that a self-mismatched contract in a backup now shows the existing "completed
  with some errors" warning. Shipped: the warning shows. Answered A (as shipped) on 2026-10-08.
- OA-4 (#29): a stored malformed grant is refused, as most such rows fail today; should it instead be
  dropped so the app's next request reopens the connect window? Shipped: refused. Answered A (as
  shipped) on 2026-10-08.

## Decision ledger

Outline A is this plan. Outline B (local draft) was the "structural, last-gate" alternative: class-id
check at the PXE seam, project-and-refuse grants on write as well as read, typed refusal for #13,
post-build sponsor snapshot for parity, a separate userinfo helper.

| # | Decision | Chosen | Rejected and why |
|---|---|---|---|
| D1 | #28 refusal mechanism | the registry flag | a new error class or code: changes a dApp-visible contract for no gain |
| D2 | #29 where to project | the three reads that interpret grants (`enforceCapability`, `computeCapabilityDelta`, the post-decision read) | at the session read in `dispatch()`: unscoped methods would fail too; write-side refusal in the setters (B): its callers already project or pass `[]`, and it cannot repair existing rows; inside the session service's getter: its other readers (`background.ts`, `session-established.ts`, `queued-journal.ts`) would change behaviour |
| D3 | #29 malformed grant outcome | refuse the read with the projector's existing `ValidationError` | drop the record (first draft): a dropped broad grant can make a narrow consent effective and sign silently, the reopened window's decision writer throws on the raw record, and the window is a visible change (OA-4); a tolerant read that treats each bad piece as matching nothing: a second definition of the grant shape |
| D4 | #13 refusal class | plain `Error`, today's words minus the values, built from the policy only | a scope refusal (B: `ScopeViolationError` plus journal classification and code-channel propagation): changes the dApp's error and the journal category, so owner-gated (OA-2); a declared template type alone: does not constrain `new Error(string)` |
| D5 | #27 placement | restore site, through a parse-and-assert helper in aztec-runtime that maps every local failure to the existing fixed text | the PXE seam for every registration (B): wider blast radius (FPC, resolver, account paths) and a recompute on every first registration, for paths that already verify or use bundled artifacts; its one advantage, keeping the hash in the offscreen document, does not outweigh that |
| D6 | #33 sponsor snapshot source | the row the strategy built with (`FeeEstimate.fpcIdentity`), for both stash sites, and a missing snapshot on an FPC entry is a miss | a post-build read (B, today's dApp path): an edit during the build binds the snapshot to the new address while the request carries the old; a pre-build read: also safe, but a second source for the same fact |
| D7 | #31 stash replacement | wiping `set` override | a `drop` before each of three `set` sites: a future fourth site would leak again |
| D8 | #31 rename return | bare identity until OA-1 | `getProfileInfo`: changes the banner, owner-gated |
| D9 | #35 rule location | the shared verdict in wallet-core | a separate `hasUserinfo` helper (B): two rules for one boundary again |
| D10 | #30 mechanism | identity-guarded `finally { drop }` around finalize | a `drop` before each throw: misses the password branch and the early return; an unguarded `finally` drop: can wipe a later restore's entry after a watchdog hand-off; binding consumption to the captured entry too: guards a path that needs a five-minute park plus a same-id delete-and-restore |
| D11 | #33 reason format | the shared helpers return fixed categories, so two operation-ladder debug reasons lose the error message | keep the operation ladder's message-bearing reasons: one helper cannot serve both, and the message is a node or storage text the logging policy keeps out of finished strings |
| D12 | #35 extent | also make the invalid-URL reason fixed | reorder `setActiveNetwork` to build the node before writing the active pointer: no stored row can carry userinfo, so the half-applied switch cannot occur |
| D13 | #29 a stored capability that is not an object (implementation) | passes untouched, like an unknown type; only a null/undefined capability or a non-object record refuses | refuse every non-object capability (the plan's first wording): the capability window's unknown row stores a request entry as sent (`"x"` passes `argsRequestCapabilities` by design), so the session would be refused on every later call after a choice the person made; refuse such entries at `projectRequestedCapabilities`: changes what a person sees (no window) and contradicts the pinned request tolerance. A capability with no type cannot satisfy, widen or narrow any grant consent reads |
| D14 | #29 tests beyond the plan's list (implementation) | rewrite `dispatcher.test.ts`'s held-non-address test to expect the `ValidationError`; recast its echo test onto a valid held grant with a malformed echo; give `background.refusal-log.test.ts` a data grant a writer can store | keep them: each stored a grant the read now refuses (`contracts: ["0xtok"]`, `{ type: "data" }`, `{ type: "data", addressBook: false }`), the same class as the characterization rows the plan names |
| D15 | #31 the `(BUG PIN)` rename comment (implementation) | states the pending product decision in words, no ask id | name OA-1 in the comment, as Phase 5 step 6 said: the comment rules ban plan and workflow tags in code |
| D16 | #27 which class id the restore check binds (implementation, arc 2 loop) | the original class id, with current required to equal it | the current class id (the plan's wording): the address commits to the original (`computePartialAddress`) and the PXE stores only the preimage (`hydratePreimage` rebuilds current := original), so a forged current id let any artifact through; every genuine export has current = original (PXE-hydrated, or node-read through `assertNotUpgraded`) |
| D17 | #30 the DEK rewrap context on finalize (implementation, arc 2 loop) | its drop moves into the same identity-guarded `finally` | keep the mid-body drop: the missing-row and tombstone refusals threw before it, leaving the source and destination DEKs to the TTL |
| D18 | #31 rename return, after the owner's OA-1 pick | `getProfileInfo(profile)`, `recoveryMode` included; the `(BUG PIN)` test becomes a pin of the banner staying | keep the bare identity (D8, D15): superseded by the owner's pick A on 2026-10-08 |
| D19 | #33 the chain helper's reasons (implementation) | a mismatch keeps the operation ladder's pinned `chain identity drift (exact pair mismatch)`; a read that throws returns `chain identity drift` | one text for both, as the architecture section said: Phase 7 step 7 changes only the two message-bearing reasons, and the two cases stay distinguishable in a debug log |
| D20 | #33 what the FPC helper reads and compares (implementation) | the row named by the payment method's `fpcId`, compared on `id` as well as type, address, chain and protocol flag | read by the snapshot's `id`: a snapshot could then satisfy a sponsor the request does not name, and a stored row's `id` field is not its storage key |
| D21 | #33 where the two snapshot fields live (implementation) | `chainIdentity` and `fpcIdentity?` on `ReuseEntryBase`, with a `ChainIdentity` type beside it | a second copy on the transfer entry: both ladders read the same two fields |
| D22 | #32 import's complexity (implementation) | two early refusals through a row-locked `unwrite` helper, and the key sealing moved to a module-level `sealSigningKey` | a combined `!live \|\| !current` check: put the serialized callback at 19, then 16, over the budget of 15 |
| D23 | #32 `cross-profile-isolation.test.ts` (implementation) | unchanged | add `isChainLive` to its stub, as Phase 8 step 3 said: its `AccountService` runs only the chain-purge cascade, which never reads liveness |

Unresolved disagreements:

- Codex voted "neither" on D3 (drop must keep consent safety and support re-consent); Opus voted for
  drop with a writer fix. The plan takes a third option, refuse, which neither audit proposed; the
  final Codex pass accepted it as "the strongest scoped choice".
- Codex holds that the owner must sign off before any rare-input visible change ships (#13 dev text,
  #27 warning). The lane brief mandates both fixes and says a fix needing new wording ships with the
  wallet's existing wording; the plan ships both with existing wording and files OA-2 and OA-3. The
  final Codex pass agreed the routing is appropriate and that it is not a sign-off. The orchestrator
  decides whether arc 1 and arc 2 merge before the owner answers.
- Codex's #30 consumption-binding finding is rejected as unrealistic (D10); the final Codex pass accepted the deferral.

## Audit verdicts

### Codex (gpt-6.1-sol, high, read-only) — `reject (with blocking findings: silent-authorization regression, unapproved visible changes, attacker-controlled restore errors)`

| # | Finding | Call | Reason / change |
|---|---|---|---|
| 1 | #29 drop can make a narrow consent effective and sign silently | accepted | D3 now refuses instead of dropping; the Phase 2 consent test pins it |
| 2 | #29 read-side drop does not self-heal: the decision writer reads raw records | accepted | moot under refuse: no window opens on a malformed row; the writers' raw reads go to follow-ups |
| 3 | "UI impact: none" is wrong for #13 dev text, #29 window, #27 warning; restore errors are rendered | accepted | UI impact rewritten; OA-2 extended, OA-3 and OA-4 added; F15 added; #29 no longer opens a window |
| 3b | #35's earlier stored-endpoint failure needs its visible outcome traced | accepted, no change | traced: no stored row can carry userinfo (schema at every write boundary) |
| 4 | #27 upstream hash errors carry artifact-chosen names into logs and the connectivity classifier | accepted | every local failure maps to the existing fixed text; Phase 6 tests a `…timeout…` name and a sibling |
| 5a | #30 guard protects cleanup, not consumption | rejected | needs a five-minute park on a local read plus a same-id delete-and-restore; recorded as a residual |
| 5b | #30 tests miss the missing-row, tombstone and active-session paths | accepted | Phase 4 is one table over all five paths, plus a guard test |
| 6 | #32 extra await opens a deletion-epoch window before the emit | accepted | post-write liveness then a synchronous epoch check, compensation under the row lock, emit with no await; tested |
| 7a | Phase 2 named `:226` as malformed and `:165` as a TypeError | accepted | test list corrected |
| 7b | the authwit harness has no logging or operation result | accepted in part | the text is fixed at its one throw site, so a throw-site test proves every forwarding sink; `fast-path.ts:255` gets its own test; extending the authwit harness through `executeOperations` would re-test forwarding |
| 7c | a declared type does not constrain `new Error(string)` | accepted | `selectorBindingRefusal(policy)` builds the text from the policy alone |
| 7d | Phase 9 must update call logs, not only flags | accepted | steps 4-5 name the logs and `stop` arguments |
| 8 | arc 3 network gate fails (proverless guard) and network retries default to 2 | accepted | `incoming-arrival` runs alone with `NULO_E2E_PROVERLESS=1`; every network run sets `NULO_E2E_RETRY=0` |
| 9a | #33 must fail closed without a snapshot; test an edit during the build | accepted | `fpc identity missing`; the D6 test in `dapp-send-executor.test.ts` |
| 9b | two #13 sinks were missing from recon | accepted | recon § Sinks lists `windows/execute/index.vue:177` and `fast-path.ts:255` |
| — | I6 unsupported for hostile artifacts | accepted | I6 rewritten; the stall is stated in Security as a self-inflicted, bounded cost with an existing precedent; a deadline recheck after hashing rejected (the deadline gates starting a registration, as today) |

### Opus (Plan agent) — `conditional approve (with conditions: fix the two broken e2e gates (#1, #2); close the #29 writer TypeError so the self-heal claim holds (#3); make #33 fail closed when fpcIdentity is missing and add a test for D6 (#4); settle the #33 reason format and its complexity (#5); correct I3/I4/D2 and route the restore warning (#8))`

| # | Finding | Call | Reason / change |
|---|---|---|---|
| 1 | Phase 10 network gate exits 2 on the proverless guard | accepted | split run with `NULO_E2E_PROVERLESS=1` |
| 2 | smoke gates run against whatever `dist/chrome` holds | accepted | armed build before each smoke run; `NULO_E2E_MIGRATION_FIXTURE=1`; no `--`, as CI calls it |
| 3 | #29 writer throws on a capability-less record, so no self-heal | accepted, resolved differently | refuse instead of drop: no window, no writer call |
| 4 | #33 fails open without `fpcIdentity`; no D6 test | accepted | fail closed in the shared helper; D6 test added |
| 5 | #33 reason format contradicts itself; complexity | accepted | fixed categories (D11), helpers return `Promise<string \| undefined>` |
| 6 | `fast-path.ts:255` sink missing | accepted | Phase 3 step 4 |
| 7a | `not a valid URL: ${rpcUrl}` echoes credentials | accepted | fixed reason (D12) |
| 7b | `setActiveNetwork` half-applies on a stored userinfo row | rejected | no stored row can carry userinfo (D12) |
| 8 | I3 wrong: a restore error shows on screen | accepted | F15, I3 rewritten, OA-3 |
| 9 | class id does not commit to ABI metadata; hash moves into the worker | accepted | stated as residual and follow-up; Security notes the worker cost |
| 10 | unguarded `finally` drop can wipe a later entry | accepted | identity guard (D10) |
| 11 | I4 false; the override must wipe expired entries and warn about shared buffers | accepted | I4 rewritten; Phase 5 steps 3-4 |
| 12 | seven test files build `AccountService`; import pre-check position | accepted | Phase 8 step 3 and gate widened; position stated |
| 13 | test-text slips (`:165`, three regex sites, `stop` args, `rpc-url.test.ts:6`, `GRANT_LEG`) | accepted | each corrected in Phases 1, 2, 3, 9, 10 |
| 14 | add `tx-sendTx-sponsoredFpc` and `authwit-lifecycle` to the e2e gates | accepted | Phases 10 and 3 |
| 15 | #29 changes consent semantics | accepted | moot under refuse; the consent test pins that nothing signs |
| 16 | snapshot type belongs next to `FpcInfo` | accepted | `fpc/spec.ts` |
| — | F2, F12, D2 reason and "both reads local" wrong | accepted | F2, F12, D2 rewritten; #33 states the node read |

### Final Codex pass (fresh session, gpt-6.1-sol, high, read-only) — `conditional approve (with conditions: project the post-decision grant read; correct OA-2's journal labels and classification requirements)`

| # | Finding | Call | Reason / change |
|---|---|---|---|
| 1 | the post-decision read (`dispatcher.ts:804`) interprets raw grants from the latest row; a malformed record written meanwhile reaches the dApp answer | accepted | third read projected; Phase 2 step 6 tests it; F2, F16, D2 updated |
| 2 | OA-2 names the wrong journal label ("Stopped before broadcast", not "Reported by app"), and a class change alone would not reach the journal or the dApp code channel | accepted | OA-2 corrected; #13 architecture and D4 state what option A needs |
| — | #29 compatibility: no wallet writer or popup decision stores a grant the projector would refuse | noted | matches the idempotence test's purpose |
| — | D1-D12 and the unresolved disagreements | all accepted (D2, D4 amended as above) | — |

Both conditions are applied in this revision. The plan is approved for implementation subject to the
orchestrator's routing of OA-1 to OA-4.

### Arc 1 post-implementation loop — `clean` after round 2

| Round | Reviewer | Verdict | Findings and calls |
|---|---|---|---|
| 1 | Codex (gpt-6.1-sol, high, read-only) | `findings` (one nit) | three "Kept inline … a malformed stored element must throw the same text" comments in `capability-negotiation.ts` state a reason projection removed: accepted, deleted |
| 1 | Opus (general-purpose, read-only) | close to mergeable, one should-fix | should-fix, accepted (D13): the unknown row can store `{ capability: "x" }`, which the first read refused on every later call; nit, accepted: README "before any leg of the batch runs" was wrong for a nested batch, now "of that batch"; the comment nit duplicated Codex's; process note: Phase 3 tick waits for the final-head gate |
| 2 | Codex (resumed) | `clean` | a non-null primitive capability has no type, cannot satisfy a known-type check or replace a transaction or simulation grant, so D3 holds; every reader reads `.type` safely or checks the shape first |

### Arc 2 post-implementation loop — `clean` after round 3

| Round | Reviewer | Verdict | Findings and calls |
|---|---|---|---|
| 1 | Codex (gpt-6.1-sol, high, read-only) | `clean` | none |
| 1 | Opus (general-purpose, read-only) | one should-fix, two nits | should-fix, accepted (D16): the class-id check bound the artifact to `currentContractClassId`, which the address does not commit to and the PXE discards, so a crafted backup could name its own artifact's class as current and pass; nit, accepted (D17): finalize's missing-row and tombstone refusals left the DEK rewrap context to the TTL; nit, rejected: `session-manager.ts` `toInfo` is a third copy of the profile projection, a refactor of code no fix touches |
| 2 | Codex (resumed) | `findings` (one nit) | the guard test replaced only the secret stash, so removing the new rewrap guard stayed green: accepted, the hook now replaces both stashes and the test fails without the guard |
| 3 | Codex (resumed) | `clean` | none |

### Arc 3 post-implementation loop — no material finding after round 3

| Round | Reviewer | Verdict | Findings and calls |
|---|---|---|---|
| 1 | Codex (gpt-6.1-sol, high, read-only) | `findings` (one should-fix, three nits) | should-fix, accepted: a post-write `isChainLive` read that rejects bypassed the row removal, so create left an unannounced row and import's compensation dropped the key under an account row that stayed; `assertStillLive` routes the rejection through `unwrite` (rows for both writers, red before the fix); nits, accepted: the note-arm comment overstated what is fenced, the snapshot comment implied a cryptographic commitment, two comments narrated their line |
| 1 | Opus (general-purpose, read-only) | mergeable, two nits | nit, accepted: the confirm read the sponsor row through `getFpc`, whose protocol-address cache another profile's purge of the same chain id empties, while the build snapshots through `getFpcImpl`; both ladders now read through `getFpcImpl` (a spurious miss, never a wrong send); nit, accepted: a pin's title claimed a `getNode` rejection propagates from `tryConsume`, which the wired chain step now absorbs; retitled to the fee step |
| 2 | Codex (resumed) | `findings` (one test nit) | accepted: the composition fakes returned the same row from both sponsor reads, so reverting the wiring stayed green; a dedicated test gives `getFpc` the cold-cache shape and asserts the transfer reuse still hits and the operation ladder resolves through `getFpcImpl` (red on the old wiring) |
| 3 | Codex (resumed) | `findings` (one test nit, not material) | accepted: the new test's `await p` passed on a caught send failure (`transfer()` returns the error); it now asserts the returned hash. The loop stops at its three-round cap with no material finding open |

## Post-implementation

The implementing session runs these steps from this file. `code_review` is `off`, so no `/code-review`
step exists.

1. **Per-arc Codex audit, at each arc boundary**, before `gh stack add` opens the next arc. Write a
   prompt file under `~/.cache/nulo-backlog/security-fixes-1/`, then run
   `CODEX_ACCOUNT=alejo-gmail ~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <WT> high read-only gpt-6.1-sol`
   (on a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`; `codex-usage list` names the
   accounts). The prompt carries the arc's diff (`git diff <arc-base>..HEAD`), this plan and its
   decision ledger, the arc map ("this is arc N of 3; later arcs add X"), an explicit adversarial ask
   (what could an attacker still do; what are we trusting that we should not), and the two rules
   below, verbatim.
2. **Fix loop.** Verify each finding against the code first. Apply the accepted fixes and commit them.
   Log the round (consult, verdict, accepted, rejected with reasons) in `lessons/phase-N.md`. Resume
   the same session with `resume-codex.sh <session-id> <followup-file> <codex-dir> high` and the fix
   diff. Stop when a round has no new material finding. After three rounds that still find material
   issues, stop and report it to the orchestrator.
3. **Final cross-arc pass**, after all three arcs are green and looped: a fresh Codex session over
   `git diff 90f4fb3..HEAD`, asking for cross-arc issues (seams, duplication across arcs, drift from
   this plan), with the same rules. Same loop.
4. **Delivery**, per the Delivery section: the first time any PR opens.
5. **Close-out**, as the stack's docs-only top layer:
   1. Write `## Outcome` directly after the front matter: Date, Status, Shipped (PR numbers), Open items,
      and the line "Seeds retired: the /goal and /loop seeds below are no longer live".
   2. Promote generalizable gotchas to `implementations-plan/lessons.md` (8 KiB budget, dedupe, retire
      what an entry supersedes, date tool versions).
   3. Move open items to `implementations-plan/follow-ups.md`; delete every entry this lane resolves.
   4. Merge `origin/dev` first; read what changed in `index.md`, `lessons.md`, `follow-ups.md`.
   5. Delete `STATUS.md`.
   6. In its own commit: `git mv implementations-plan/security-fixes-1 implementations-plan/archive/security-fixes-1`;
      repair the relative links the extra level breaks; move the index line to `archive/index.md`.
   7. Comment on each issue left open or not held, with the reason.
   8. Report and stop. Merging is the orchestrator's call.
6. **Teardown after the merge.** When
   `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/security-fixes-1/plan.md`
   succeeds, run `agent-worktree done security-fixes-1 --merged`. This step needs no approval. If it
   refuses, relay its output and stop; never force. A `/loop` session checks this on every firing; a
   `/goal` session arms one background wait after its wrap-up report:
   `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/security-fixes-1/plan.md; do sleep 300; done`.

**No-over-engineering rule** (verbatim in every post-implementation Codex prompt): *"Report bugs and
small, targeted improvements only. Do not propose speculative abstractions, extra configuration
surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and
is clear, leave it alone."*

**Comment-quality rule** (verbatim in every post-implementation Codex prompt): *"Audit the comments for
value per character. Flag any comment that narrates what the code visibly does, restates its line,
references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and
flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are
permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and
exact."*

## Delivery

One `gh stack`, one PR per arc, PRs opened only after each arc's loop and the cross-arc pass converge.

| Layer | Branch | Phases | Stacks on | `/code-review` | PR title (≤ 93 chars) |
|---|---|---|---|---|---|
| 1 | `worktree-security-fixes-1` | 1-3 | `dev` | off | `fix(dapp): refuse grantPublicAuthwit in batch, project stored grants, redact binding error` |
| 2 | `security-fixes-1-arc2` | 4-6 | layer 1 | off | `fix(profile): wipe restore stash, project profile rpcs, check class id on backup restore` |
| 3 | `security-fixes-1-arc3` | 7-10 | layer 2 | off | `fix(wallet): bind transfer reuse to sponsor, fence account writes, note epochs, rpc userinfo` |
| 4 | `security-fixes-1-close-out` | close-out | layer 3 | off | `docs(plans): close security-fixes-1` |

Mechanics: `gh stack init --adopt worktree-security-fixes-1 --base dev`; at each arc boundary, after its
loop converges, `gh stack add <next-branch>`; in Delivery, `gh stack sync`, then `gh stack submit --auto`,
then `gh pr edit` each body (what changed and why, the validation run and its outcomes, the owner asks
the arc carries, `Closes #<n>`). Open each PR without labels; add `e2e:extension-network` or
`e2e:extension-smoke` afterwards only where the path filter would skip a suite the arc needs. Then the
close-out layer and `gh stack submit --auto` again. Watch with `gh pr checks <n> --watch`. Never merge;
never `--admin`.

## Seeds

Recommended: `/goal` (completion is visible in the transcript). Use exactly one per session.

```
/goal All phases in implementations-plan/security-fixes-1/plan.md are marked ✓, each backed by its validation gate reported passing in the transcript; for each phase LESSONS_FILE=implementations-plan/security-fixes-1/lessons/phase-N.md is printed; /code-review was NOT run (code_review is off); the Codex fix loop converged for each of the three arcs at its boundary and for the final cross-arc pass, each shown by a resumed gpt-6.1-sol pass reporting no new material finding, quoted in the transcript; the four-layer gh stack exists on GitHub (gh stack view output in the transcript), opened only after the loops converged, with the close-out layer's archive-move commit shown by git show --stat; bun run test, bun run test:all and bun run lint all exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/security-fixes-1 forward. Never idle. Each firing: (1) read plan.md and lessons/ from the stack's top layer; if the plan path is gone and `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/security-fixes-1/plan.md` succeeds, run `agent-worktree done security-fixes-1 --merged`, report its output, clear this loop and stop; if it fails, babysit the PRs only. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step; run lint and the touched tests after each edit; commit; push. (4) Stuck: consult Codex (gpt-6.1-sol, high) and log the verdict in lessons/phase-N.md; never cross a hard limit. (5) Same step failed 5 times: reassess with Codex. (6) Phase gate green: paste it, mark ✓, print LESSONS_FILE; at an arc boundary run the Codex loop, then gh stack add. (7) All ✓: final cross-arc pass, Delivery, close-out, gh pr checks --watch, wrap-up report, stop.
```

## Follow-ups found during planning

To move into `implementations-plan/follow-ups.md` at close-out unless resolved:

- `requestCapabilities` is allowed as a batch leg and opens a connect window (`method-descriptors.ts`, upstream `BatchedMethodSchema` includes it). Decide whether it belongs in the refused set.
- The dApp-session service's writers and `queued-journal.ts:106` dereference `g.capability.type` on raw stored records (`dapp-session/service.ts:35`, `:292`, `:350`, `:367`), and the two grant setters accept unvalidated records from any extension page.
- `repository.setTrust`'s own await is unfenced on both incoming arms (`(DRIFT PIN) P6`, `N6`).
- A contract class id does not commit to ABI metadata; a backup can plant a same-class artifact with misleading names (upstream keeps the first artifact stored per class).
- The dApp registration path (`execution/service.ts`, `executeRegisterContract` and its sibling) checks a supplied artifact against the supplied instance's `currentContractClassId`, which the address does not commit to; bind it to the original class id as the restore check does.
- OA-2 picked A (2026-10-08): classify the selector-binding refusal as a scope refusal. The dApp then receives code 4100 and the queued send reads "Not allowed"; it needs `failureKind` (`mark-failed-unless-cancelled.ts`) and the execution code-channel allowlist (`rpc-cancel.ts`) to carry `ScopeViolationError`, not only a class change.
- `session-manager.ts` `toInfo` repeats the profile projection that `ProfileService.getProfileInfo` builds; one shared helper would keep the RPC and event shapes from drifting.
- `account-state/service.ts` `classifyRestoreFailure` logs the error message as a finished string (`:338`), and its comment says per-item errors are never rendered, which the data viewer contradicts.
- The transfer ladder's `base fee fetch failed: <message>` reason carries the node's message; the operation ladder already uses a fixed category.
- A refused dApp call's activity record is titled by the dApp's claimed function name (History card, detail title and Method row read "Balance Of Public" for a call whose selector is `transfer_public_to_public`). Only a refused call can carry a mismatched name, since one that runs passed the selector binding; labelling by the resolved function is a UI change for the owner. Seen in the OA-2 screenshots.
