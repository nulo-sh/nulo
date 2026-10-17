---
plan: dapp-boundary-2
tier: mid
status: completed (2026-10-17): #679 carries the arc and this close-out; #680 and #683 are open
issues: "#670 (Closes), #673 (Closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex review (gpt-6.1-sol high) with resumes; one Opus Plan leg; one fresh final Codex pass
base: origin/dev at 13d5f8d0
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-17
- **Status:** completed. One PR against `dev` (#679) carries the arc and this close-out; merging it is the orchestrator's call.
- **Shipped:**
  - `registerContract` with a secret key registers an account only when the key derives the instance's own address; any other key answers `INVALID_PARAMS` before any PXE write (D1).
  - #670: the dispatcher resolves the session's network once per call, after the capability, schema and scope checks, so every route answers `CHAIN_NOT_SUPPORTED` on a chain the wallet does not serve, a quarantined one included (D2).
  - #673: a connect whose approval does not land deletes its row unless a duplicate waits on the window, and a failed grant write deletes its row and still refuses the discovery (D3, D5). A row of the window's own profile found while its connect window is open waits on that window; a pending notice keeps the immediate reconnect (D4).
  - The type-roles inventory's digest of `dispatcher.ts`, re-attested and re-pinned.
- **Dropped:** passing the parsed key to `registerAccount`, because the PXE client takes wire text and its seam parses it with the same schema.
- **Known limits:** #682 (a row kept for a waiting duplicate whose page is gone stays until it expires), #681 (a duplicate waiting across a profile switch reconnects without a reconnect token).
- **Open items:**
  - #680: an Allow's row can land on the profile a switch reaches before the write;
  - #683: OA-1, closing a connect window when its tab closes.
- **Lessons:** none promoted, because `lessons.md` is at 8163 of 8192 bytes and no entry is stale. The one trap that crosses tasks, the inventory's digest pins on `dispatcher.ts`, names its own remedy when it fails ([lessons/phase-4.md](lessons/phase-4.md)).
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# dapp-boundary-2: three dApp ingress rules

Local changes at chokepoints the code already has, one arc, one PR against `dev`. (1) A dApp's `registerContract` registers an account only when its secret key derives the instance's own address; any other key is refused with `INVALID_PARAMS` and nothing is registered. (2) The dispatcher resolves the session's network once per call before it routes, so every call that passes the capability, parse and scope checks answers `CHAIN_NOT_SUPPORTED` on a chain the wallet does not serve, a quarantined one included (#670). (3) A session row written for a connect that reaches no dApp is deleted (#673). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1, optional, not in this arc).

**Issue claims that did not hold** (at 13d5f8d0): #670 names two methods; four more routes answer on a quarantined chain: `getWalletFeatures`, `getAccounts` when an accounts grant holds no account, `requestCapabilities` with an empty manifest, and an empty `batch`. Its `requestCapabilities` paths hold only when no requested or new type is `accounts`. #673 holds, with one case it misses: a second discovery of the same app waiting on the window (a reload of the tab is the common one) inherits the row today and connects; the fix keeps that (D3).

## Outcome & Quality Bar

- **For whom:** a person using a connected dApp, and the dApp developer reading its error codes.
- **Excellent:** (1) on a chain the wallet does not serve, every granted dApp call gets the same typed `4901` answer and no capability window opens; (2) `registerContract` with the instance's own secret key still registers its account, and a key for any other address changes nothing in the PXE; (3) Settings → Connected apps lists no app whose connect reached no page, and a reloaded tab still connects on the person's Allow.
- **Good enough:** the chain check costs one extra network read per call; a call already past the check when a chain becomes quarantined runs as today; the known limit under Delivery stays.

## Assumptions

Facts (verified at 13d5f8d0):
- F1 `executeAztecRegisterContract` registers the contract, then `registerAccount(secretKey, computePartialAddress(instance))` with no check that the derived account is the instance (`apps/extension/src/wallet/services/execution/service.ts:1163-1201`); the scope check binds only `instance.address` (`packages/wallet-bridge/src/method-scope-checkers.ts:74-77`); no window (`dispatcher.ts:244-250`). Addresses 0-6 return before any check and register nothing. `register_contract` carries no key (`service.ts:1024-1057`).
- F2 `PxeService.registerContract` refuses an instance whose address does not derive from its preimage, before any write (`packages/aztec-runtime/src/pxe/service.ts:433-462`).
- F3 `CompleteAddress.fromSecretKeyAndPartialAddress` = `computeAddress(deriveKeys(sk).publicKeys, partial)` (`@aztec-labs/stdlib` 6.0.0-rc.3, `dest/contract/complete_address.js:41-48`); the key store reaches the same address (`completeAccountKeys` → `fromPublicKeysAndPartialAddress`, `@aztec-labs/key-store` `dest/key_store.js:19-37,258-260`). The wallet's own account uses it (`packages/aztec-runtime/src/account/nulo-account.ts:103`).
- F4 The secret key reaches the executor as wire text: the dispatch-time schema parse discards its value (`packages/wallet-bridge/src/wallet-schema-args.ts`).
- F5 `InvalidWalletArgumentsError` keeps its code to the dApp (`execution/rpc-cancel.ts:95-104` → `dispatcher.ts:171-187` → `wallet-sdk/error-envelope.ts:41,59`: `-32602`, a constant message), pinned at `rpc-cancel.test.ts:100-165`.
- F6 `resolveNetwork` throws `ChainNotSupportedError` on an empty read (`dispatcher.ts:1109-1122`); the adapter returns none for a quarantined chain (`wallet-sdk/background.ts:226-234`). Order: capability → schema parse → scope → network in the handler (`dispatcher.ts:224-252`; pins `dispatcher.test.ts:3382, 3494, 3501, ~2996`).
- F7 The test file's shared `stubNetwork` returns no network (`dispatcher.test.ts:77`) and backs every route that reads none today: `makeDispatcher`'s `requestCapabilities` flows, `getWalletFeatures` (`:1867`), `isTokenRegistered` (`:1902-1953`), the stickiness pin (`:3021`).
- F8 The not-landed branch undoes only the verification marker (`wallet-sdk/discovery-approval.ts:65-74`); the row is written before the approval (`background.ts:1338-1350`), 7-day expiry (`dapp-session/service.ts:220`). A grant-write failure after the row write leaves the row too (`background.ts:1348`, the `finally` at `:1370`).
- F9 A discovery of the pair that waits on the window rides the row once it resolves (`awaitPendingPopupDedupe`, `approveAfterPopup`, `background.ts:1113-1157`). One that arrives after the row write finds the row and is auto-approved as a returning app (`:944-969`), ahead of the dedupe guard (`:989-995`). The network-unavailable notice registers in the same pending map (`:1269`), and a remembered row can outlive a notice and reconnect when its network returns (`background.unserved-chain.test.ts:204`).
- F10 A deleted row ends every live channel of its `(origin, chainId, profileId)` (`wallet-sdk/session-revocation.ts`, `wireSessionTeardown`).
- F11 bb.js poseidon2 crashes under the extension's jsdom runs (`apps/extension/vitest.config.ts:53-75`); real-derivation tests there carry `// @vitest-environment node` and a `.real.test.ts` name (`execution/authwit-discoverer.real.test.ts`).

Inferences (the implementer verifies in phase and logs in `lessons/phase-N.md`):
- I1 With D4, no channel is live on an in-flight row when D3 decides: every other discovery of the pair is a waiter until the window resolves. The connect-window harness proves it (phase 3).
- I2 `deriveKeys` runs in the service worker: the account service already derives accounts there (`nulo-account.ts:90`).

Asks: none open. A1 (tier): `mid`, as the lane brief names; the spawn prompt's `light` defers to it.

## Architecture & Implementation

- **D1 Key binding in the executor.** In `executeAztecRegisterContract`, inside `if (op.secretKey)`, after the artifact checks and before the first PXE write: parse the key (`Fr.schema.parseAsync`), compute the partial address once, derive `CompleteAddress.fromSecretKeyAndPartialAddress` (imported from `@aztec-labs/stdlib/contract`), and throw `InvalidWalletArgumentsError.forMethod("registerContract")` unless `derived.address.equals(instance.address)`. Existing refusals keep their order and class; `registerAccount` reuses the parsed key and partial address. Every dApp path to `registerAccount` is this executor (F1); the wallet's own accounts register through `NuloAccount.ensureRegistered`, untouched.
- **D2 Chain check at dispatch.** In `dispatch()`, after `enforceScopeFor`, before `routeHandlerMethod`: `await this.resolveNetwork(ctx)`, result discarded. Capability, parse and scope refusals keep precedence. A `batch` (capability-exempt) is checked before its legs; each leg re-enters `dispatch` and is checked again. `ARCHITECTURE.md:187` names the mechanism.
- **D3 Rollback when the approval does not land.** In `approveOrRollbackDiscoverySession`, after the marker undo: delete the row best-effort, with the rollback's warning and no reject (the request is gone), unless a discovery of the pair is waiting on this window. A waiter keeps the row and connects on it, as today. The caller passes that predicate from `dedupeWaiters`. One local helper serves the three delete sites.
- **D4 An in-flight row is not a remembered app.** Each entry of the pending map carries its kind, `connect` or `notice`, set where it is registered today; no other lifetime changes. In the discovery router, read the pair's entry right after the session lookup (no yield between, as the lookup's comment requires). A row found while a `connect` entry is pending is the one that window is writing: the discovery passes the Terms check and waits on the window like any duplicate. A pending `notice` leaves a remembered row's reconnect as today. One shared `dedupeKey` helper replaces the inline string.
- **D5 A failed grant write rolls back its row.** In `persistAndApprove`, if `setCapabilityGrants` throws after `addDappSession`, delete the row best-effort (a failed delete is logged and swallowed), then rethrow the grant error; the attempt fails as today.
- **Competing outline (rejected).** B1 thread one resolved network through every handler and `buildOperation`: about twelve signature changes in a file lane dapp-boundary-1 also edits, for no behaviour gain. B2 refuse a dApp secret key outright: it breaks registering a keyed contract instance, the argument's documented use. B3 write the row only after the approval lands: establishment reads the row first. B4 refuse a waiting duplicate after a not-landed approval (the expired exit's rule): a reloaded tab would no longer connect on the person's Allow.
- **Not taken:** a check in `checkRegisterContract` (synchronous, crypto-free); the chain check above capability (reorders pinned refusals); closing a connect window when its tab closes (OA-1); the queued Activity row a refused `sendTx` gets on a quarantined chain (`wallet-sdk/queued-journal.ts:145` reads the raw network; Activity shows only the active network, and a quarantined active network shows the takeover).

## Phase 1: a contract's key registers only its own account ✓

- Change: `apps/extension/src/wallet/services/execution/service.ts` (D1).
- Tests: new `execution/register-contract-account.real.test.ts` (`// @vitest-environment node`, real stdlib, a recording stub PXE, instances from `NuloAccount.new` as `packages/aztec-runtime/src/pxe/register-contract.test.ts` builds them): (a) success control: an account instance and its own key register the contract, then the account with its partial address; (b) the same instance with another account's key rejects `InvalidWalletArgumentsError` and records no write. `service.class-id.test.ts`: its `@aztec-labs/stdlib/contract` mock gains a `CompleteAddress` whose derived address equals the C2 fake instance's; its assertions stay as they are.
- **Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/execution/`. Pass: exit 0; (b) fails with D1 removed (logged red/green). Layers: lint, typecheck, unit.

## Phase 2: one chain check per dispatch ✓

- Change: `packages/wallet-bridge/src/dispatcher.ts` (D2); `ARCHITECTURE.md:187`.
- Tests, `packages/wallet-bridge/src/dispatcher.test.ts`. Harness: a serving reader for the sites in F7, whose assertions do not change; the empty reader stays where 4901 is the expected answer (`:2980`, `:3612`). New `describe` on the empty reader: a table of the routes that read no network (`isTokenRegistered`, `requestCapabilities` all held, with a new `data` type and with an empty manifest, `getWalletFeatures`, `getAccounts` on an empty accounts grant, an empty `batch`), each rejecting `ChainNotSupportedError` with `tokenRegistryReader`, the window and `applyCapabilityDecision` never called; a success control running the table on the serving reader; one batch whose second leg meets a chain that stopped being served after the first; one precedence row (an ungranted `isTokenRegistered` still rejects `CapabilityNotGrantedError`).
- **Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/wallet-bridge test`. Pass: exit 0; the precedence pins and `dispatcher.route.pins.test.ts` unchanged; the table fails with D2 removed (logged). Layers: lint, typecheck, unit.

## Phase 3: no row for a connect that reaches no page ✓

- Change: `apps/extension/src/wallet/services/wallet-sdk/discovery-approval.ts` (D3), `background.ts` (D3's predicate, D4, D5).
- Tests: `discovery-approval.test.ts`, the not-landed test asserts the delete, and one more asserts a waited-on row is kept. `background.connect-window.test.ts`: (a) not landed, no waiter: `h.rows.size` is 0; (b) not landed with a duplicate waiting: the row stays and the duplicate is approved (today's behaviour); (c) a duplicate that arrives during a deferred `setCapabilityGrants` waits on the window, then is approved through it, not auto-approved before; (d) `setCapabilityGrants` rejects: the row is deleted, the grant error still propagates and the discovery is rejected. `background.unserved-chain.test.ts`: (e) a remembered row whose network returns while a notice is pending reconnects at once through the returning-app path, as today. The landed-approval tests stay the success control.
- **Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/wallet-sdk/`. Pass: exit 0; (a), (c) and (d) fail on the base code (logged). Layers: lint, typecheck, unit.

## Final gate (after phase 3)

`bun run lint && bun run typecheck:all && bun run test && bun run test:all`, then `bun run check:plans` after staging plan files. Then, with load1 < 150, on Chrome at retry 0 through the agent runner: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/contracts-register.test.ts tests/e2e/network/cap-request-repeat-noPopup.test.ts tests/e2e/network/connect-dapp.test.ts tests/e2e/network/connect-one-window.test.ts`. No e2e file is added or changed and no fixture, focus, window or WebAuthn path moves: no Firefox twin, no runtime budget entry. Pass: every command exits 0.

## Security & Adversarial Considerations

- **Threat model:** a connected dApp is untrusted; it controls every argument, its timing and its tabs. Boundaries: the PXE's account set, the quarantine of a chain the wallet stopped serving, and the connected-app list.
- **D1:** the binding uses the derivation the key store uses (F3) on the address `PxeService` ties to its preimage (F2). A key that matches is the instance's own key, which the dApp already holds; nothing of the person's is derived or exposed. The refusal message names only the method.
- **D2:** the `4901` answer is the same for a deleted and a quarantined chain, so it reveals nothing new. A chain quarantined after the check: the PXE chain guard (`apps/extension/src/wallet/runtime.ts:516`) and the handler reads refuse later steps; a window already open stays open.
- **D3-D5:** a delete ends only channels of the attempt's tuple, and with D4 none is live on an in-flight row (I1). A kept row serves a waiter through the same verify window and emoji check as any connect; one kept for a waiter whose own page is already gone stays until expiry (the known limit). Such a row needs the person's Allow for that app, holds no grant, and every later connect still shows the emoji check.
- **Crypto, supply chain, least privilege:** no new dependency, permission or state; `@aztec-labs/stdlib` 6.0.0-rc.3 (exact pin).

## UI impact

The lane brief's record (no new screen, copy or format) covers both surfaces below.
- Settings → Connected apps: before, a connect whose page was gone when the person pressed Allow left a row for 7 days; after, no row. Rows that connected are unchanged.
- The capability window: before, it could open for a granted app on a quarantined chain; after, the call answers `4901` and no window opens, as `ARCHITECTURE.md:187` states.

## Decision ledger and review verdicts

| Round | Verdict | Accepted | Rejected or narrowed |
|---|---|---|---|
| Codex 1 | conditional approve | D4 (sibling auto-approved on an in-flight row); D5 (grant-write failure); D2 wording, empty manifest and batch rows, the batch recheck test; F1's 0-6 note | Point 2 narrowed: the Connected apps row is the lane brief's recorded change; the waiter refusal is not taken (B4), so no behaviour change needs the owner |
| Opus 1 | conditional approve | F7 harness edit; node env and `.real.test.ts`; `CompleteAddress` import and `equals`; D3 keeps a waited-on row (the reload case); named collaborators in the table; UI impact lines; the queued-journal disposition | The marker-order assertion dropped as unobservable. Two residuals it named are reported to the orchestrator, outside committed text |
| Codex final (fresh) | conditional approve | D4 limited to a pending `connect` entry (a remembered row outlives a notice); the dropped-waiter case qualified into the known limit; D5 keeps the grant error | Waiter liveness tracking rejected (a lifecycle; the known limit is preferable) |
| Codex final, resumed | approve | the three fixes verified; no regression | none |
| Codex fix 1 (arc diff) | approve | nothing material | none |
| Opus fix 1 (arc diff) | approve | the in-flight check binds the window's profile; a dispatcher test name matched to what it pins | the parsed key for `registerAccount` (the PXE client takes wire text) |
| Codex fix 2, resumed twice | request changes, then approve | the digest attestations; one wording fix | a profile switch between the Allow's profile check and the row write (predates the arc; filed as an issue), a waiting duplicate across a switch (closed known limit) |

## Delivery

- One arc, one PR against `dev`, from branch `worktree-dapp-boundary-2`; no stack (orchestrator standing decision D-orch-1). Phases 1-3 in order; disjoint files, so lanes would save nothing measurable.
- Title (88 characters): `fix(dapp): check the chain on every call, bind a contract's key, roll back unlanded rows`. Body: what changed and why per rule, the validation runs with outcomes, `Closes #670`, `Closes #673`. Opened without labels, after the final gate and the Codex loop converge; merge `origin/dev` first (lane dapp-boundary-1 edits `dispatcher.ts`).
- Known limit, filed at close-out as a closed `known-limit` issue: a row kept for a waiter whose own discovery is already gone, or whose approval also fails to land, stays until it expires. The waiter count is not a proof that a page is still there, and tracking each waiter's liveness would add a lifecycle. Reopen on a user report of a Connected apps row that never connected.
- Close-out as the PR's final commits, after `gh pr create`: the Outcome block, lessons promotion, open items filed, the `git mv` into `archive/` in its own commit, the index line moved.

## Post-implementation

Executes [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 13d5f8d0, with these values:
- Step 1 is absent (`code_review: off`).
- Step 2, single arc: once, over `git diff $(git merge-base origin/dev HEAD)..HEAD`, after the final gate. Codex: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumes with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside the first round. Rounds logged in `lessons/phase-4.md` and the ledger. Hard stop after three material rounds.
- Step 3: `gh pr create` as Delivery says, then `gh pr checks <n> --watch`; a known flake gets one rerun.
- Step 4: close-out as Delivery says; `STATUS.md` deleted; `bun run check:plans` green after staging. Merging is the orchestrator's call.
- Step 5: after the merge, `agent-worktree done dapp-boundary-2 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/dapp-boundary-2/plan.md` succeeds. A `/goal` session arms one background wait for it after its report.

## Seeds

```
/goal Phases 1-3 of implementations-plan/dapp-boundary-2/plan.md marked ✓, each backed by its validation gate reported passing in the transcript; LESSONS_FILE printed per phase; the final gate green; /code-review NOT run; the Codex fix loop converged over the arc diff (a resumed pass reporting nothing new and material, quoted); the PR against dev opened only after that (gh pr view output), with the close-out's archive move (git show --stat); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/dapp-boundary-2 forward per its plan.md: reality check (plan, lessons, git status, PR checks); next pending phase; fast gates after each edit; on a phase gate pass mark ✓ and log; after phase 3 the final gate, the Codex loop, the PR, the close-out; decisions with Codex at high on gpt-6.1-sol; never merge; after the merge run the teardown in Post-implementation step 5 and stop.
```
