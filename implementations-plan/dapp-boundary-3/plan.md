---
plan: dapp-boundary-3
tier: mid
status: approved 2026-10-17 (orchestrator); arc 1 in progress
issues: none (P38-06 carries no public issue; P38-08 waits on the owner)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); Codex review (gpt-6.1-sol high) with resumes; one Opus Plan leg; one fresh final Codex pass
base: origin/dev at 2c0df3b9
trunk: dev
post_implementation_hardening: not scheduled
---

# dapp-boundary-3: the authorization registry's grant functions answer only the wallet's own action

The owner's pick, quoted: **P38-06 = A**, "Deny: dApp transactions may not call the registry's grant functions; the scope check refuses them with a reason." Arc 1 refuses every dApp request that names the registry's grant functions, at the three places such a request can reach them: a call in `sendTx`, a `createAuthWit` intent that names the registry, and a call inside a transaction whose authorization request the wallet would otherwise sign. Arc 2 (**P38-08**, the connect window's see-your-address toggle) is costed in both forms and built only once the owner picks. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

**Claims that did not hold** (at `2c0df3b9`): the pick names "the scope check" as the place; it sees two of the three routes. A call inside a transaction is invisible to it and is refused at the wallet's one authorization-decoding loop (D2). That refusal lands during the execute window's fee estimate, so the window shows its existing estimate failure, not "Not allowed" (D8, OA-4). The brief's dev head was `bdb61a1f`; the worktree is at `2c0df3b9` (two later merges touch none of these files).

## Outcome & Quality Bar

- **For whom:** a person who connects dApps and later reviews and revokes public authorizations in Settings; the developer of a dApp that meets the refusal.
- **Excellent:**
  1. No dApp request that names the registry creates an approval or changes the rejection switch for the person's account: a `sendTx` call to a grant function, a `createAuthWit` intent naming the registry, and an inner call asking the account to authorize one are each refused, under the widest grant and any consent.
  2. The first two are refused before any window: the dApp receives the typed scope refusal, and a refused send's History row reads the existing "Not allowed". The third is refused before any discovered authorization witness is signed. In a standard send, Confirm stays off with the existing estimate-failure toast and the person's Reject ends the request. In a NO_FROM send, the preview shows a toast, Confirm stays on, and Confirm ends in the typed refusal and "Not allowed".
  3. The wallet's own grant, revoke and registry switch behave as today (`authwit-lifecycle` green); registry views stay readable by simulation.
  4. No refusal message carries a request value.
- **Good enough:** the dApp reads the existing scope-refusal text until OA-1 is answered; a dApp that pays its fee through aztec.js's public fee payment method (OA-2), or that relays someone else's approval through `set_authorized_private` as its own call or through a discovered request, is refused (D9).

## Assumptions

**Facts** (verified at `2c0df3b9`; F6, F7, F10 corrected in review):
- F1 `checkTransactionCalls` and `checkSimulationTransactions` match each call's `to` and `name` against the grant and return early when no grant of their type exists or the call list is empty (`packages/wallet-bridge/src/method-scope-checkers.ts:101-117, 136-160`). No registry rule exists.
- F2 `checkCreateAuthWit` checks a `CallIntent`'s call against the transaction or simulation scope and an `IntentInnerHash`'s consumer at any function (`:259-313`). A covered `CallIntent` signs with no window while the app's authorizations consent holds (`dispatcher.ts:551-575`); every other intent opens a confirmation.
- F3 Dispatch order: capability, schema parse, scope check, network, routing (`dispatcher.ts:231-240`). The schema parse refuses an address not in its canonical spelling (`wallet-schema-args.ts:62-72`) but admits any hex spelling of a selector (`hexSchemaFor`, `@aztec-labs/foundation` `dest/schemas/utils.js:44-47`).
- F4 A `ScopeViolationError` reaches the dApp as the frozen `SCOPE_VIOLATION_ENVELOPE` (`apps/extension/src/wallet/services/wallet-sdk/error-envelope.ts:124-127, 222-231`); a dApp send refused by it is journaled `scope_refused` (`execution/mark-failed-unless-cancelled.ts:34`, `wallet-sdk/queued-journal.ts:287`) and reads "Not allowed" (`apps/extension/src/utils/journal-state.ts:251-252`).
- F5 The registry is a standard contract at `STANDARD_AUTH_REGISTRY_ADDRESS` from the address-only leaf `@aztec-labs/standard-contracts/auth-registry/constants`, which the extension already imports (`apps/extension/src/wallet/utils/auth-registry.ts:2`). `packages/wallet-bridge` does not depend on the package; no lint rule bans it (`biome.json:358-380`); 6.0.0-rc.3 was published 2026-10-08, past the 7-day gate.
- F6 Registry functions (rc.3 source in the artifact): the grant functions `set_authorized(Field,bool)` and `set_reject_all(bool)` (caller's own entries) and `set_authorized_private(approver, …)` (writes `approver`'s entry after verifying `approver`'s private witness, the registry's one witness-verifying function); `consume`; the views `is_reject_all`, `is_consumable`; the utility `utility_is_consumable`; the only-self `_set_authorized`; framework functions (`public_dispatch`, `sync_state`, `offchain_receive`). No `utility_is_reject_all` exists, and the wallet refuses a public function in `executeUtility`, so simulation is the only read of the switch.
- F7 `assert_current_call_valid_authwit` emits a `CallAuthorizationRequest` offchain effect before it verifies. The wallet decodes such effects in one loop and signs a witness per request, with the emitting contract as consumer (`execution/decode-authwit-effects.ts:26-44`). Callers: the standalone discoverer (`authwit-discoverer.ts:139`), the folded probe (`discovery-probe.ts:66`, inside the fee strategies), the NO_FROM send and its preview (`dapp-send-executor.ts:604, 1328`). Standard sends whose fee the dApp pays skip discovery and sign no discovered witness (`dapp-send-executor.ts:583, 1144-1155`).
- F8 The wallet's own registry writes are public calls built after the scope check (grant `execution/tx-request-builder.ts:552-570`, revoke `auth-registry/service.ts:330`, the switch); none emits a private authorization request. A simulation signs its own entrypoint payload (`view-executor.ts:321` → `tx-request-builder.ts:313` → `nulo-account.ts:186`) but no delegated authorization witness: dApp witnesses arrive signed (`operation-planner.ts:193-201`), the builder signs only an absent witness (`tx-request-builder.ts:170-175`), simulation runs no discovery, and the app-facing result clears the witness map (`app-facing-results.ts:45`).
- F9 aztec.js grants a public authorization by sending a `set_authorized` call through `wallet.sendTx` (`SetPublicAuthwitContractInteraction`); its public fee payment method puts the same call in the fee payload, a shape `FEE_METHODS` already names (`apps/extension/src/utils/primary-method.ts:20`).
- F10 No playground button, e2e or unit fixture sends a dApp call to the registry; every e2e grant goes through `grantPublicAuthwit` (recon.md). The connect window can still list a requested registry scope (`dapp-interaction/known-contracts.ts:22` labels it "Auth registry").
- F11 `ScopeViolationMessage` is a closed union of wallet words; a table test refuses request values in it (`scope-violation.ts:11-31`, `method-scope-checkers.test.ts:107-215`).
- F12 When an estimate fails, the execute window logs, toasts "Couldn't estimate fee. Try again." and keeps Confirm off (`popup/windows/execute/index.vue:163-168, 177`); a NO_FROM preview failure is a toast and does not gate Confirm (`:212-215, 413-414`); a NO_FROM Confirm rediscovers and decodes before it signs (`dapp-send-executor.ts:1339-1346`). A preview returns records and signs nothing (`dapp-send-executor.ts:604-613`).

**Inferences:**
- I1 A dApp that relays another account's approval through `set_authorized_private` is refused when the call is its own top-level call or its request reaches discovery, as the pick's text requires. A nested relay with a witness the dApp already holds, in a send whose fee the dApp pays, skips discovery and is not refused; it obtains no signature from this wallet and writes another account's entry. No dApp the wallet is tested against relays. Reopening condition: a dApp report (D9).
- I2 The decode refusal reaches each caller as a `ScopeViolationError`: every fee-strategy catch rethrows, `buildAndEstimateTxRequest` has no fallback, and the probe marks itself used before decoding, so a later retry would skip discovery and fail closed (the Opus leg's trace; Phase 2 pins it at the two seams).
- I3 Only `set_authorized_private` can use a private witness whose consumer is the registry (F6).
- I4 `batch` legs re-enter `dispatch` and meet the same checkers (`dispatcher.ts:468-475`).

**Asks** (working assumption in brackets; none blocks arc 1):
- A1 = OA-1: a registry-specific reason for the dApp. [The existing scope refusal.]
- A2 = OA-2: dApps paying through aztec.js's public fee payment method. [Refused, per the pick's text.]
- A3 = P38-08's form. [Arc 2 held.]
- A4 = OA-4: the execute window closing itself with the typed refusal when its estimate meets one. [Existing estimate-failure behaviour.]
- A5 = OA-5: the connect window still offering a requested registry scope. [Unchanged.]

## Architecture & Implementation (arc 1)

**Shape.** Two predicates owned by `@nulo/wallet-bridge` in one new leaf, applied at the chokepoints that already exist: the bridge's scope checkers (dApp-named calls and intents) and the extension's single authorization-decoding loop (requests raised inside a transaction). No new error class, state, lifecycle or option.

**Interfaces.**
```ts
// packages/wallet-bridge/src/auth-registry.ts (leaf; exported from src/index.ts)
export function isAuthRegistry(address: unknown): boolean        // sameFieldAddress against STANDARD_AUTH_REGISTRY_ADDRESS
export function isAuthRegistryGrantCall(call: { to: unknown; selector: unknown }): boolean
// isAuthRegistry(call.to) && the selector, read with FunctionSelector.fromString (any hex spelling),
// is one of the pinned selectors of set_authorized, set_reject_all, set_authorized_private.
// scope-violation.ts gains the GrantRefusal "call targets an authorization registry grant function",
// "intent targets the authorization registry", and one standalone message for the decode refusal.
```

**Flow.**
1. `sendTx`: after the `calls` array check and before the grant filter, a call for which `isAuthRegistryGrantCall` holds throws `scopeViolation("Scope violation: sendTx call targets an authorization registry grant function")`. It precedes the early returns of F1, so no grant shape, a wildcard included, admits it. `simulateTx` and `profileTx` keep today's checks (D7).
2. `createAuthWit`: as its first statement, a `CallIntent` whose `call.to`, or an `IntentInnerHash` whose `consumer`, is the registry throws `scopeViolation("Scope violation: createAuthWit intent targets the authorization registry")`. By address: such a witness is usable only by a grant function (I3). It precedes the silent-sign branch of F2, because the scope check precedes routing (F3).
3. `decodeAuthwitEffects`: an effect whose `contractAddress` is the registry throws the decode refusal before decoding and outside the per-effect `catch`, so no partial set is returned and no discovered witness is signed. Every origin: the wallet's own flows raise no such request (F8).

**File-level change map.**
| File | Change |
|---|---|
| `packages/wallet-bridge/package.json`, `bun.lock` | add `@aztec-labs/standard-contracts` `6.0.0-rc.3` (already locked; workspace entry only) |
| `packages/wallet-bridge/src/auth-registry.ts` (new, + `.test.ts`), `src/index.ts` | the two predicates, the three pinned selectors, their pin test (derived from the installed artifact, as `fee-payer.test.ts` derives its claim selector) |
| `packages/wallet-bridge/src/scope-violation.ts` | the new message literals; exported for the extension |
| `packages/wallet-bridge/src/method-scope-checkers.ts` | the call rule in `checkTransactionCalls`; the intent rule in `checkCreateAuthWit`; the module header names the new leaf |
| `packages/wallet-bridge/src/method-scope-checkers.test.ts`, `dispatcher.test.ts` | Phase 1 tests |
| `apps/extension/src/wallet/services/execution/decode-authwit-effects.ts` (+ new `.test.ts`), `dapp-send-executor` tests | Phase 2 rule and tests |
| `packages/wallet-bridge/README.md`, `SECURITY.md` | one paragraph each, stating the rule (in `SECURITY.md`, a new paragraph after the `createAuthWit` one, which the docs lane rewrites) |

**Trade-offs and alternatives** (the panel's record is the decision ledger):
- **Outline B (competing, as first drafted): refuse by pinned grant selectors in `sendTx`/`simulateTx` only.** The literal reading of the pick. Both legs rejected it: it leaves the intent and inner routes open, so the stated invariant fails.
- **Address versus function in `sendTx`.** The first draft refused every registry function by address. Codex showed that this blocks reading the rejection switch (F6) beyond the owner's words; refusing the three grant functions by selector matches the pick. The selector is what the entrypoint runs; a mismatched name is refused later by the selector binding (`contract-resolver.ts:114-127`). Cost: three pins that move only if a signature changes, caught by the pin test.
- **Address in `createAuthWit` and the decode loop.** Precise there: only `set_authorized_private` verifies a witness (I3, F6), so no selector is needed.
- **Typed reason.** A subclass of `ScopeViolationError` keeps the code, the log level and the expected-refusal handling; the envelope and the History row read the subclass for their own text (OA-1 = b, D10).
- **Address source.** Import the upstream leaf rather than pin a hex like `FEE_JUICE_CONTRACT`: one source; the leaf pulls no artifact JSON.
- **Decode rule: refuse, not skip.** Skipping leaves the build to fail at proving with an opaque error after the window; refusing is typed and comes before any discovered witness is signed.
- **Where the inner refusal settles.** The decode loop is the one place that knows each request's consumer; the signing sites see only the hash. Settling the open window with the typed refusal needs a new path from estimate to request owner, which the existing call-binding refusal also lacks: OA-4, not this arc.

## Security & Adversarial Considerations

- **Threat model.** A connected dApp controls its page, its contracts, every call and intent it sends, and their order. It may hold a transaction or simulation scope naming the registry or any contract, and an authorizations consent. The boundary: the dApp RPC, and the wallet's index of public authorizations as the person's revocation list.
- **What the arc establishes.** Three refusals at existing chokepoints: a dApp-named grant call, a dApp-named registry intent, and an inner registry request the wallet would sign. Only top-level calls run with the person's account as sender; a dApp contract writing the registry writes its own entries (F6), so the call rule and the decode rule cover the account's writes made through a registry-naming request.
- **Other dApp inputs** (traced by both legs): dApp-supplied witnesses arrive signed and are not re-signed; capsules and extra hashed args trigger no signing; a registry `feePayer` takes the fee-contract route and fails; `batch` legs re-enter dispatch; `registerContract` cannot alias the registry (canonical addresses, F3); the fast path is simulation only.
- **Outside this arc.** One further restriction on authorization intents, raised in the planning review, does not name the registry and changes the contract the owner set for inner-hash intents: tracked privately.
- **Matching.** Addresses arrive canonical (F3) and compare through `fieldAddressKey`; selectors arrive in any hex spelling and are read through `FunctionSelector.fromString` before comparing, so a spelling cannot slip past the rule.
- **Refusal text.** Wallet words only, inside the closed union (F11); a refusal logs at `debug` as an expected refusal, as today.
- **Supply chain.** One workspace dependency on a package already in `bun.lock` at the same exact version, past the age gate; CI's frozen install proves the lockfile.
- **Cryptography.** None added.

## UI impact

- **Signed (orchestrator's record):** "the reason a refused dApp call shows, on the existing refusal surface; no new screen."
- **After arc 1:** a refused dApp send leaves a History row "Not allowed" with its own context line (OA-1, D10); a refused intent shows nothing in the wallet, as any scope refusal today; an inner request keeps a standard send's Confirm off with the existing toast "Couldn't estimate fee. Try again.", the path the call-binding refusal takes today; in a NO_FROM send the preview shows its existing failure toast, and Confirm ends in the typed refusal and "Not allowed". No copy, row or layout changes.
- **Answered (orchestrator, D-orch, 2026-10-17; reason: "the planner's recommendation, no UI change beyond the lane brief's budget"):** OA-1 = b: a registry refusal keeps the scope-refusal code and gets its own dApp text and History context line (D10), both quoted in the PR body as a "what ships now" the owner can flip. OA-2 = a. OA-4: the existing estimate-failure toast ships; a self-settling window is its own later plan. OA-5 = a: the connect window keeps listing registry scope rows.

## Phases (arc 1)

### Phase 1: the bridge refuses dApp requests that name the registry's grant functions ✓

1. Add `"@aztec-labs/standard-contracts": "6.0.0-rc.3"` to `packages/wallet-bridge/package.json` dependencies. Run `bun install`. Check that `bun.lock` changes only the wallet-bridge workspace block.
2. Add `src/auth-registry.ts`, its export, and `auth-registry.test.ts`: the three selectors equal the ones derived from the installed artifact; `isAuthRegistryGrantCall` holds for an upper-case selector spelling; it does not hold for `is_reject_all` on the registry, or for a grant selector on another contract.
3. Add the message literals to `scope-violation.ts`.
4. Add the call rule to `checkTransactionCalls`, before the grant filter. Add the intent rule as the first statement of `checkCreateAuthWit`.
5. Add the tests:
   - `method-scope-checkers.test.ts`: refused rows in the no-request-value table, each under a wildcard transaction and simulation grant: a `sendTx` call for each of the three grant selectors, one in upper-case hex, one under a view's name, and one grant call after an allowed call; a `CallIntent`; an `IntentInnerHash`. Controls under the same grants: a `sendTx` call to `is_reject_all` on the registry, a non-registry call, a non-registry intent, and a `simulateTx` of `set_authorized` all pass.
   - `dispatcher.test.ts`: a `CallIntent` naming the registry, under a wildcard scope and a broad authorizations consent, is refused typed and the execution service is never called; an `IntentInnerHash` whose consumer is the registry is refused and `dappInteractionService.execute` is never called; control: a non-registry `CallIntent` in the same session signs.
6. Write the README and `SECURITY.md` paragraphs.

**Validation gate.**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/wallet-bridge test`; `bun run test`.
- Pass: all exit 0. Each new refusal test fails with its rule removed and passes with it, and each success control stays green; record both runs in `lessons/phase-1.md`.
- Layers: lint, typecheck, unit.

### Phase 2: discovery refuses an authorization request from the registry

1. In `decodeAuthwitEffects`, throw the decode refusal for an effect whose `contractAddress` is the registry, before decoding and outside the `catch`.
2. Confirm I2 by reading each caller. A caller that converts or retries the error lets a `ScopeViolationError` pass unchanged. Add no retry and no fallback.
3. Add the tests:
   - `decode-authwit-effects.test.ts` (fake crypto): a registry effect throws `ScopeViolationError` and the hash seam is never called; a valid effect before a registry effect still throws, so no partial set returns; control: effects from other contracts decode.
   - At `estimateOperationFee` (`dapp-send-executor.ts:486`), on the standalone discoverer and on the folded probe: a real registry effect through the real decoder rejects with `ScopeViolationError` and no delegated witness is signed; control: a non-registry effect signs once.
   - At `previewOperationAuthwits` (`:596`): a registry effect rejects; control: a non-registry preview returns its records and signs nothing.
   - NO_FROM Confirm: a registry effect is refused with no delegated witness signed and nothing submitted; control: an allowed NO_FROM Confirm signs and submits.
   - Each refusal test turns red with the guard removed and each success control stays green; record the runs in `lessons/phase-2.md`.
4. Read the window's estimate and preview failure paths (F12) and record in `lessons/phase-2.md` that the refusal takes them unchanged.

**Validation gate.**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`.
- Pass: all exit 0; the decode and seam tests fail with the rule removed; F12's paths are unchanged, or the arc stops with an owner ask.
- Layers: lint, typecheck, unit.

### Phase 3: arc gate

1. Run `bun run test:all`.
2. Merge `origin/dev`. Rerun `bun run lint`, `bun run typecheck:all` and `bun run test`.
3. Run the network e2e on Chrome, one at a time, retry 0, only while `load1 < 150`: `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/authwit-lifecycle.test.ts`, then the same with `tests/e2e/network/scope-refusal.test.ts`.
4. Stage the plan files and run `bun run check:plans`.

**Validation gate.**
- Pass: every command exits 0; both e2e files green.
- Layers: all unit layers; network e2e (Chrome). No e2e scenario is added: the refusals are proven at the checker, dispatcher, decode and executor seams; the two files prove the wallet's own grant and the refusal surface unchanged. No fixture, focus, window or activation change, so no Firefox twin.

## Arc 2 (held until the owner picks P38-08)

Build nothing now. Both forms, costed (recon.md § The address-visibility toggle):
- **Form B, listing-only (recommended on the page).** Show the address row for any accounts grant and reword it to say it controls listing: `popup/windows/capabilities/build-items.ts:125,196`, `permission-rows.ts:87-91`, `components/composite/capabilities/CapabilityDetailPanel.vue:27-30` (also aligns its `!== false` with `=== true`), `dapp-session/capability-meta.ts:39`, `packages/wallet-bridge/README.md:163,187-196`. About 30-60 lines and 8 test edits (`build-items.test.ts`, `permission-rows.test.ts`, `CapabilityDetailPanel.test.ts`, `index.test.ts:841`, `cap-window.test.ts:226` row order). New copy needs the owner's sign-off on the exact words before the arc starts. Gate: lint, typecheck, `bun run test`, smoke `cap-window` on Chrome and Firefox.
- **Form A, binding.** Without `canGet`: refuse a NO_FROM `simulateTx` (or project its result); refuse an explicit `from` with one answer for member and non-member across `simulateTx`, `sendTx`, `createAuthWit`, `registerToken`, `grantPublicAuthwit`; move `profileTx`'s refusal ahead of account resolution. About 150-300 lines in `dispatcher.ts`, `account-resolution.ts`, `method-scope-checkers.ts`, `scope-enforcement.ts`, 20-30 test edits, and playground bundles without `canGet`. Against: refusing a NO_FROM simulation removes most of what a simulation grant is for; projecting the result fights the shape aztec.js parses.
- Either form is its own PR against `dev`, with its own Codex loop, and carries this plan's close-out.

## Decision ledger

Ids D1-D19 belong to arc 1, D20 and up to arc 2.

| # | Decision | Alternatives rejected | Why |
|---|---|---|---|
| D1 | `sendTx`: refuse a registry call by the selector of a grant function | every registry function by address (first draft); by name | matches the pick's words and keeps the switch readable (Codex); the selector is what runs |
| D2 | Cover `createAuthWit` intents and inner requests too | the scope check on calls only (Outline B) | the pick's purpose fails otherwise; both are one-predicate checks at existing chokepoints (both legs) |
| D3 | Keep the scope-refusal code and class family | a new code | superseded in part by OA-1 = b (D10): own text, same code |
| D4 | Import the upstream address leaf | a pinned hex constant | one source; the extension already imports it |
| D5 | The decode rule refuses, for every origin, by address | skip the effect; dApp origin only; by selector | typed and before signing; the wallet's own flows raise none (F8); only one registry function verifies a witness (I3) |
| D6 | No new e2e scenario | an e2e per route | unit, dispatcher and executor seams prove each refusal; two existing e2e files prove no regression |
| D7 | Leave `simulateTx` and `profileTx` unchanged | refuse there too (first draft) | a simulation writes nothing and signs no delegated authorization witness (F8); refusing it blocks reading the switch (Opus, Codex) |
| D8 | The inner refusal keeps the window's existing estimate-failure path | settle the request from the estimate (Codex) | a new settlement path, which the call-binding refusal lacks too: a plan change for the owner (OA-4) |
| D9 | Relaying another account's approval through `set_authorized_private` is refused as a top-level call or a discovered request; a nested relay with a witness the dApp already holds is not | refuse only when the approver is the person's account; refuse nested relays too | the pick names the grant functions; trusting a call argument adds a second rule (Opus); a nested relay obtains nothing from this wallet (final Codex pass); reopening condition: a dApp report |
| D10 | OA-1 = b: a refusal subclass of `ScopeViolationError` (same code, same `walletErrorCode`) with its own dApp text and its own journal kind and History context line | a new code; a field on the envelope | every `instanceof ScopeViolationError` site (log level, expected-refusal list, journal) keeps working; only the envelope and the History label read the subclass |

## Review verdicts

- **Round 1, Codex (gpt-6.1-sol high): `reject`.** (1) An intent route that does not name the registry: out of this arc, tracked privately (see Security). (2) The inner refusal cannot settle as "Not allowed" from an estimate: accepted; Outcome and UI impact restated, OA-4 (D8). (3) The address-wide `sendTx` and `simulateTx` rule goes beyond "grant functions": accepted, D1 and D7. Also: OA-1 should confirm the generic text answers "with a reason": accepted into OA-1. Fine per Codex: F1-F3, I2, I3, I4, the decode loop as chokepoint, the upstream leaf.
- **Round 1, Opus Plan leg: `conditional approve`.** (1) Same estimate-path point as Codex: accepted, with tests at the estimate and preview seams. (2) Drop the simulation leg: accepted (D7). (3) I1 unsafe (relay use): accepted as D9. (4) The decode text outside the closed union: accepted. (5) Test gaps (selector spelling, no partial set, an inner-hash dispatcher row): accepted. (6) The connect window still offers a registry scope: OA-5. Facts F6, F7, F10, I4 corrected. Rejected: none.
- **Final fresh Codex pass (new session): `conditional approve`.** Conditions, all accepted as text and test corrections: (1) a simulation signs its entrypoint payload, so the guarantees say "no discovered authorization witness" (F8, Outcome); (2) NO_FROM previews differ from standard estimates: Confirm stays on and ends in the typed refusal; the preview control signs nothing (F12, UI impact, Phase 2 tests); (3) refusal tests cover all three selectors, a spelling, a misleading name, a later leg, and a real effect through the real decoder on both discovery paths; (4) D9 narrowed to direct and discovered relays.
- **Resumed final pass, round 2: `conditional approve`.** Remaining wording: four places still said "signs nothing" or "any signature", and a gate asked success controls to turn red. All corrected.
- **Resumed final pass, round 3: `approve`.** "Signing claims, relay scope, and refusal-test/control expectations are consistent … No regressions or remaining issues within this verification scope."

## Delivery

- **Arc 1** = Phases 1-3, branch `worktree-dapp-boundary-3`, one PR against `dev` (the orchestrator's standing rule: no stack). Title: `fix(dapp): keep the authorization registry's grant functions to the wallet` (77 characters). Body: what changed and why, the validation runs, "P38-06 = A: Deny: dApp transactions may not call the registry's grant functions; the scope check refuses them with a reason.", and no `Closes` line (no public issue). Open it without labels; add `e2e:extension-network` only if the path filter skips the network lane.
- **Arc 2** = the form the owner picks, a later PR against `dev`, released by the orchestrator, carrying the close-out. If the answer needs no code, arc 1's PR carries the close-out instead.
- **Parallelism:** none; arc 1 is three short phases on one critical path.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `2c0df3b9`. Plan-specific values:
- **Diff review:** `code_review: off`; the step is absent.
- **Review loop, per arc, before that arc's PR:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. The prompt carries the arc diff from its base, this plan and its ledger, the arc map ("arc 1 of 2; arc 2 changes the connect window's address row or the account resolution, depending on the owner's pick"), the adversarial ask, and the README's two rules verbatim. Hard stop at three rounds. Log each round in `lessons/phase-N.md` and under Review verdicts. A fix that adds state, a lifecycle, a protocol, a recovery policy or a public contract stops for approval.
- **Cross-arc pass:** with the last arc, one fresh Codex session over the net diff from `2c0df3b9`.
- **Delivery:** `gh pr create --base dev`, then `gh pr checks <n> --watch`; one rerun for a known flake.
- **Close-out** (with the last arc): merge `origin/dev` and read `index.md` and `lessons.md`; write the `## Outcome` block, with D9 as a disposition line; promote lessons only within the 8 KiB budget; file OA-1, OA-2, OA-4 and OA-5 as `owner-decision` issues if still open; delete `STATUS.md`; `git mv implementations-plan/dapp-boundary-3 implementations-plan/archive/dapp-boundary-3` in its own commit, with the index line moved to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/dapp-boundary-3/plan.md` succeeds, leave the worktree if this session entered it, then run `agent-worktree done dapp-boundary-3 --merged`; relay a refusal, never force. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.

## Seeds (draft until approval)

Recommended: `/goal`.

```
/goal Arc 1 of implementations-plan/dapp-boundary-3/plan.md done: Phases 1-3 marked ✓ in plan.md, each backed by its validation gate reported passing in the transcript, LESSONS_FILE=implementations-plan/dapp-boundary-3/lessons/phase-N.md printed per phase; the Codex loop (gpt-6.1-sol high) converged on the arc diff, quoted; the arc PR open against dev after the loop (gh pr view output); bun run test and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive arc 1 of implementations-plan/dapp-boundary-3 forward per its plan.md (read it and lessons/ first; plan.md is the state). Pick the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. A phase is green only when its gate passes as written. After Phase 3, run the Post-implementation loop, open the PR against dev, watch checks, report and stop. Never merge; never touch arc 2.
```
