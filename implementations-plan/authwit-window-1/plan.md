---
plan: authwit-window-1
tier: mid
status: approved by the final Codex pass; arc 1 in progress
issues: "#1639"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit + Opus Plan leg; final fresh Codex pass
base: origin/dev at ea282b7bc
trunk: dev
post_implementation_hardening: not scheduled
---

# authwit-window-1: the execute window names every authorization a send consumes on behalf of another approved account

One arc, one PR to `dev`, closing #1639 (the spec). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/src/` unless noted.

## The lane, checked

- **Case 1 held** (demonstrated by trace and by `tests/e2e/network/tx-sendTx-fields.test.ts:68-73`): B sends `transfer_private_to_private(A, X, 1, nonce)` with A's witness attached and A in `additionalScopes`. Classic discovery stubs B only; A's real check reads the attached witness; the token's request names A and the decoder drops it (`wallet/services/execution/decode-authwit-effects.ts:53-54`). The window lists nothing about it.
- **Case 1 on an app-paid send** (Codex round 1, demonstrated by trace): a send whose app pays through its own payload skips discovery at estimate and confirm (`dapp-send-executor.ts:548-564`, `:1189-1201`), and the card hides its authorizations (`popup/windows/execute/OperationCard.vue:239`). The same carried authorization is consumed with no line.
- **Case 2, today** (traced; recon § What happens today): without A's witness the first discovery run throws `Unknown auth witness for message hash 0x…` at A's real check, before any effect is read. The window shows "Couldn't estimate fee. Try again." and holds Confirm while the fee figure is missing; a confirm reached anyway fails. The send never goes out; nothing names the reason.
- **Did not hold**: the decoder's path (it lives under `wallet/services/execution/`); the authwit index as a record of silently signed authorizations (it holds public grants only, with no app and no time); a composition test of discovery (COMPOSITION-TESTS.md D2, D3, D6 rule simulation and Barretenberg out). Recon § Claims that did not hold.
- **P95-07 reopened** (#1491): the pick dropped the line because the wallet does not sign for another account. This plan keeps that half (no signature as any account but the sender) and restores the naming for a request on behalf of another account of the send's scopes.

## Outcome & Quality Bar

- **For whom**: a person approving a dApp send from one account that uses another of their accounts' authorizations, which the dApp may have obtained with no window.
- **Excellent**: (1) before Confirm, on every route a dApp send takes, the window names each such authorization, its account and the call it permits, with the same words as the person's own rows; (2) a send that needs such an authorization the dApp did not attach shows the wallet's refusal and its reason, never a fee failure, on every route but the app-paid one (I4), and the dApp gets a scope refusal; (3) the wallet still signs only as the sending account, and confirm signs nothing outside what the window listed, account by account; (4) a send that consumes no other account's authorization reads and behaves exactly as today, but for an app-paid send whose code asks the authorization registry (OA-6).
- **Good enough**: no record of when or for which app A signed (OA-3); the sender's own carried authorization on an app-paid send stays unnamed (OA-4); no change to which calls the switch covers.

## Assumptions

**Facts** (verified at `ea282b7bc`; citations in recon)
1. `decodeAuthwitEffects` is the one decode loop of the classic, folded and NO_FROM paths; it reads `onBehalfOf` and returns `{ signable, requested }`.
2. Each discovery run stubs only the signing account: classic `authwit-discoverer.ts:131`, folded `fee/fee-strategy.ts:202`, NO_FROM `dapp-send-executor.ts:1358`. A stub's `verify_private_authwit` returns valid without reading a witness. The classic run is always followed by the validated pipeline; the folded first run sizes the fee itself unless a request decoded or the build is init-wrapped (`fee/fee-juice-strategy.ts:50-63`, `fee/fpc-strategy.ts:182`); NO_FROM has no validated run before approval, by design, and runs one at confirm.
3. An op carrying any `add_private_authwit` takes classic; folded requests carry no dApp witness (`discovery-aware-estimator.ts:121-125`).
4. An app-paid (embedded) send runs one validated simulation and no discovery, at estimate and at confirm (`fee/embedded-strategy.ts:46`; `dapp-send-executor.ts:548-564`, `:1189-1201`).
5. The bridge refuses an `opts.additionalScopes` entry outside the session's approved accounts (`packages/wallet-bridge/src/scope-enforcement.ts:80`, pinned at `scope-enforcement.test.ts:149-158`), so the send's scopes are approved accounts of the session's profile.
6. `discoveredHashes` is bookkeeping for `assertWithinPreview` and the reuse stash; no path signs from it. The build signs from `add_private_authwit` actions (`tx-request-builder.ts:174-188`), NO_FROM from its decoded `signable` list (`dapp-send-executor.ts:1384-1386`).
7. Every dApp `aztec_sendTx` opens the window: sessions are created at `AccessLevel.Transactions` (`wallet-sdk/discovery-flow.ts:506`; `dapp-interaction/service.ts:867-875`).
8. Only a call intent can be signed without a window (`packages/wallet-bridge/src/method-scope-checkers.ts:255-259`). aztec-nr's `assert_current_call_valid_authwit` emits the request before it checks; `assert_inner_hash_valid_authwit` emits nothing (the frozen artifact's `authwit/auth.nr:253-288`).
9. A scope refusal subclass crosses the RPC by its constant message (`packages/extension-messaging/src/errors.ts:702-703`); the window holds any `refusalKind` (`popup/windows/execute/index.vue:248-252`) and Reject answers the dApp with it; the dApp sees `SCOPE_VIOLATION_ENVELOPE` unless a subclass has its own (`wallet-sdk/error-envelope.ts:258-262`).
10. `AddressDisplay` shows a contact's name, else the active profile's account name, else the short address (`components/AddressDisplay.vue:64-78`).
11. The scope registrar registers a scope account's keys only (`wallet/services/pxe/scope-registrar.ts:19-22`); an account's contract instance is registered by its own build or, for its op account, by `buildNoFrom` (`tx-request-builder.ts:431-434`); `stubAccountAddresses` throws for an address with no registered instance (`packages/aztec-runtime/src/pxe/service.ts:535-537`).
12. A Reject after a held refusal ends the request as that refusal, and History reads a `scope_refused` row as "Not allowed. The app asked for more than you allowed. Nothing was sent." (`utils/journal-state.ts:310-311`).

**Inferences**
- I1. Stubbing another scope account adds no trust where a validated run always follows (classic) or nothing is approvable before the real run (NO_FROM). In the fold it would (Codex round 1): a contract that checks A through the inner-hash helper emits nothing, so the fold would skip its validated run. D2 therefore keeps such sends off the fold.
- I2. A consumed record proves an emitted request naming A and a carried witness with its hash. On the classic and app-paid routes a validated run passed, so if the contract ran A's check, A's real account accepted that witness; a contract that names A and never checks it makes the line over-state, never under-state (OA-1 note).
- I3. A granted contract that checks a call authorization through `assert_inner_hash_valid_authwit` emits no request and is not named. Filed as a closed `known-limit` issue at close-out (reopen on a contract seen doing it).
- I4. On an app-paid send the one run is validated, so a missing witness of another account fails A's real check before any effect is read: the send cannot go out, and the window shows the app-paid fee row's failure, not the refusal. Saying so would need a stubbed run of the app's own fee payload, which no route runs. Filed as a closed `known-limit` issue at close-out (reopen on a user report).
- I5. A request can name A while the carried witness for its hash is another account's. Where a validated run follows and the contract checks A, A's real account refuses it and the estimate fails; on `default_entrypoint` the preview can show the line and the confirm's real run then fails. The line relies on the dApp's witness coming first in the request (`discovery-aware-estimator.ts:146`, `dapp-send-executor.ts:1384-1386`).

**Asks** (each with the working assumption; OWNER-ASKS carries them)
- OA-1, the line's rendering and wording. Working assumption: rendering A, "Already authorized by <A>."
- OA-2, the refusal's reason text. Working assumption: the recommended sentence.
- OA-3, the "when and for which app" line. Working assumption: not built.
- OA-4, the sender's own carried authorization on an app-paid send. Working assumption: not named, as today.
- OA-5, the History row and the dApp's text for the new refusal. Working assumption: both stay the generic scope refusal's.

## Decisions

- **D1 (decoder).** `decodeAuthwitEffects(effects, chainInfo, send, crypto?)` with `send: { signer: AztecAddress; scopes: readonly AztecAddress[]; carried: ReadonlySet<string> }` returns `{ signable, consumed, requested }`. Per decoded request: `onBehalfOf` = signer → `signable`, as today; another account of `scopes` → hashed, then `consumed` (the record with `onBehalfOf`, once per account and hash) when `carried` holds the hash, else `UnattachedAuthorizationRefusalError`, thrown after the loop so the loop's per-effect `catch` cannot swallow it; any other `onBehalfOf` → skipped, as today. The registry refusal stays first. `carriedHashes(txRequest)` (same module) reads `txRequest.authWitnesses[].requestHash`.
- **D2 (stubs).** Classic discovery stubs every account of its `scopes`; NO_FROM stubs `scopesWithAccount`. Before any run stubs an account, its build registers that account's contract instance (`ensureContractRegistered`, idempotent and PXE-local): `buildStandard` for each account of `sendScopes`, `buildNoFrom` for each of `scopesWithAccount`, as `buildNoFrom` already does for its own account (F11). The fold keeps its sender-only stub, and a `fj`/`fpc` send whose scopes hold another account takes classic (`discovery-aware-estimator.ts`, next to the pre-attached-witness rule, for the same reason: a stub accepts every check its validated run would refuse).
- **D3 (record).** `DiscoveredAuthwit` gains `onBehalfOf?: string`, set only on a consumed record: the account whose witness the transaction carries, which the wallet does not sign. Every carrier (estimate, preview, snapshot, fee question) and the popup's decode chain take it unchanged.
- **D4 (confirm).** Each path lists `signable` then `consumed`. `discoveredHashes` holds one key per listed record, `listedKey(record)`: the hash for a record the wallet signs, `${onBehalfOf}:${hash}` for a consumed one. `assertWithinPreview` then holds a confirm to what the window listed, account by account, through reuse and the missing-snapshot case. Only `signable` becomes actions or signatures. The probe's `discovered` gains the consumed records; `collected` stays signable only.
- **D5 (probe context).** `extractEffects` takes `{ node, network, signer, scopes, carried }`, built once by `probeContext(built)` in `fee/fee-strategy.ts` for every strategy call.
- **D6 (app-paid route).** The executor's two embedded branches pass a fresh `CollectingDiscoveryProbe` to the validated build: `DappSendExecutorDeps.buildAndEstimateValidated` gains an optional `observer`, and its adapter in `service.ts` forwards it to `buildAndEstimateTxRequest`, which sets the strategy context's `observer`, never its `probe` (`service.ts:515-516`). Only `EmbeddedStrategy` reads `observer`: it gives it its one validated simulation, unstubbed, after it runs; the fold's `probe` stays reachable only through `DiscoveryAwareEstimator`, so no fee kind can turn the read into a stubbed run (L10). The branch lists only the observer's consumed records, since an embedded send signs nothing, and keys them by D4. The decoder's registry rule comes with the read (OA-6, L11).
- **D7 (refusal).** `UnattachedAuthorizationRefusalError extends ScopeViolationError`, constant message, rebuilt in `walletErrorFromPayload`. `refusalKind` → `"unattached"` with its `REFUSAL_REASON` (OA-2). The dApp gets `SCOPE_VIOLATION_ENVELOPE` and the journal `scope_refused`, as for any scope refusal, pending OA-5: no new public text. `refusalKind` tests the new class before the generic `ScopeViolationError`.
- **D8 (window, rendering A, pending OA-1).** In `SendTxSummary.vue` a consumed row keeps the own row's words and adds the line "Already authorized by <A>." with `AddressDisplay` of `onBehalfOf` (testid `execute-op-summary-authwit-on-behalf`, row attribute `data-on-behalf`). Under "Show all details", consumed records leave "Authorizations the wallet will sign (found during estimation)" for their own group, "Authorizations your other accounts already gave", with the same fields plus "Authorized by". `OperationCard`'s embedded rule lists consumed records instead of hiding the section. The fee re-ask window renders the same card.
- **D9 (no record line).** Item 3 is not built: no store records a private authorization's app or time, and adding one is persistent state the owner decides (OA-3).

## Architecture & Implementation

| File | Change |
|---|---|
| `wallet/services/execution/decode-authwit-effects.ts`, `discovered-authwit.ts` | D1, `carriedHashes`, `listedKey`; the record's `onBehalfOf` |
| `packages/wallet-bridge/src/fee.ts` | D3 |
| `packages/extension-messaging/src/errors.ts` | D7 class and rebuild line |
| `authwit-discoverer.ts` | D1, D2: scopes and carried from its `DiscoverContext` |
| `tx-request-builder.ts` | D2: register each scope account's contract in `buildStandard` and `buildNoFrom` |
| `discovery-aware-estimator.ts` | D2 routing; the `DiscoveryProbe` context type (D5) |
| `discovery-probe.ts`, `fee/fee-strategy.ts`, `fee/fee-juice-strategy.ts`, `fee/fpc-strategy.ts`, `fee/embedded-strategy.ts` | D4, D5, D6 |
| `service.ts` | D6: the executor's validated-build adapter forwards the probe |
| `dapp-send-executor.ts` | D4 keys at each path; D6 embedded branches and the dep's `probe`; NO_FROM: D2 stubs, preview lists both, confirm signs `signable`, `enforcePreview` over both |
| `popup/windows/execute/refusal.ts` | D7 |
| `popup/windows/execute/SendTxSummary.vue`, `OperationCard.vue` | D8 |
| `apps/playground/src/sections/transactions.ts` | the on-behalf send without its witness, a sibling of `sendOnBehalf` sharing its payload code |

Data flow, case 1 (classic): the build carries A's witness → discovery stubs B and A → decoder: B's requests signable, A's consumed → `discovered` lists both, only B's become actions → validated pipeline (A's real check reads A's witness) → estimate and snapshot list both, keyed by D4 → confirm re-discovers or reuses, subset check by key, signs B's only. App-paid: the validated run → probe → consumed only → the same keys at confirm. Case 2: a `fj`/`fpc` send with A in scope takes classic (D2) → discovery stubs B and A → decoder throws the refusal → estimate rejects → `walletErrorFromPayload` rebuilds it → `holdRefusal` → refusal block; Reject answers the dApp.

## UI impact

The owner's words are the scope's sign-off (#1639 § Decision); the rendering and the refusal text go to a decision page (OWNER-ASKS), and the PR waits for the pick.
- **Execute window, a send from B consuming A's carried authorization** (standard, app-paid and `default_entrypoint`, and the fee re-ask window, which renders the same card). Before: no line. After (rendering A): the Authorizations section lists the row with the line "Already authorized by <A>."; the details list it under its own group.
- **Execute window, a send needing A's authorization the dApp did not attach.** Before: the toast "Couldn't estimate fee. Try again." After: the refusal block, "Nulo won't send this" and the OA-2 reason; Reject is the way on.
- **History, that refused request** (pending OA-5): before, "You rejected"; after, "Not allowed. The app asked for more than you allowed. Nothing was sent."
- **A `default_entrypoint` confirm after a failed preview** that would use another account's authorization: before, it sent; after, it stops with "Fee estimate did not complete — retry the estimate", since the window never named it.
- **Execute window, an app-paid send whose code asks the authorization registry to change public authorizations** (pending OA-6). Before: the send went out when the app attached the witness. After: the registry refusal block every other route already shows; Reject tells the app.
- **Every other send**: unchanged.
- Captures (light, Chrome, the two-account fixture) before and after, at rest and with the details open, in `screenshots/` and the PR body; one capture per OA-1 rendering in OWNER-ASKS.

## Security & Adversarial Considerations

- **Invariant**: every authorization a transaction consumes on behalf of another approved account of this profile is either signed with a window or named in the window before Confirm; the wallet signs only as the sending account; confirm signs nothing outside what the window listed, keyed by account and hash.
- **Threat model**: a hostile dApp controls every field of the request, the attached witnesses and the scopes within its approved accounts; a hostile contract controls every emitted request and which helper checks it. The wallet signs exactly what it signed before (D1 leaves `signable` alone). The new outputs are a listing, keyed so a hash listed for A cannot later be signed as B, and a refusal. Over-statement (I2, I5) errs toward the person rejecting; under-statement is the inner-hash helper (I3, a known limit); the app-paid route names but cannot explain a missing witness (I4, a known limit).
- **Stubbing**: only accounts the bridge admitted as the session's approved accounts are stubbed, only in runs read for effects, and never in a run whose result can size an approvable estimate (D2).
- **Trust boundaries**: `onBehalfOf` and the hash come from the same validated `fromFields` decode; `carried` is read from the request the run simulated; comparisons are canonical `toString()` strings. `onBehalfOf` reaches the popup as a string and renders through `AddressDisplay` (no HTML). No message, stored shape, permission, dependency, crypto or CSP change.
- **Logging**: no new log line; the refusal's message is constant and names no account (CLAUDE.md § Logging policy).
- **Keyboard**: no new control; the refusal block is the existing one (no document-level Enter on a signing popup).

## Phase 1: decoder, routes, refusal and window

1. Run the unchanged `tx-sendTx-fields.test.ts` once per browser and record its time. Add the playground send. Write D11's e2e assertions. Run the file on Chrome on base sources; require red (no on-behalf line; case 2 shows the fee failure, not the refusal). Capture the window before.
2. Write D10's tests. Require each red on base where marked. Commit.
3. Make D1-D8. Require all of D10 green. Commit.
4. Run the e2e set on both browsers; record times. Capture after, and one capture per OA-1 rendering (renderings B and C applied uncommitted), with a temporary uncommitted shot step under `~/.cache/nulo-backlog/authwit-window-1/`. Require nothing untracked under `tests/` or `src/`.

**D10 (unit and component; red on base unless marked green).**
- `decode-authwit-effects.test.ts`: another scope account's request with its hash carried → one consumed record with `onBehalfOf`, nothing signable; the same uncarried → `UnattachedAuthorizationRefusalError`, and a registry effect beside it still refuses as the registry; an address outside the scopes → neither list, no throw (green: the class stays dropped); the signer's request beside them → signable (green control).
- Routing and stubs: `discovery-aware-estimator.test.ts`, a `fj` send with another scope account takes classic, one with the sender alone folds (green control); `authwit-discoverer.test.ts`, classic stubs its scopes; `dapp-send-executor.test.ts`, NO_FROM stubs `scopesWithAccount`.
- `dapp-send-executor.test.ts`: NO_FROM preview lists a consumed record and confirm calls `createAuthWit` once (the signer's); a hash listed for A and decoded at confirm for the signer fails with `AUTHWITS_CHANGED_MESSAGE`; a consumed record at confirm with no snapshot fails with `ESTIMATE_INCOMPLETE_MESSAGE`; an embedded estimate lists the probe's consumed records and never its signable ones, and its confirm holds them to the snapshot.
- `discovery-probe.test.ts`: consumed records join `discovered`, never `collected`. `fee/strategies-structural.test.ts`: with a probe, `EmbeddedStrategy` hands it its validated, unstubbed simulation once.
- `packages/extension-messaging` errors test: the class round-trips through `walletErrorFromPayload`. `index.test.ts`: the window holds it and shows its reason.
- `tx-request-builder` test: a standard build and a NO_FROM build with another scope account whose instance the PXE lacks each register that account's contract before returning; a standard build with the sender alone registers no other (green control).
- A service-level test beside `service.pxe-seam.test.ts`: the executor's validated build hands its probe to the strategy context, so the production adapter cannot drop it.
- `OperationCard.summary.test.ts`, wire-shaped (`0x` + 64 hex, checked with `isValidAztecAddress`): a consumed record of a listed token's transfer from A renders one row whose line names A's account name, with `data-on-behalf`; an own record beside it has no such line (control); the details list the consumed record under its group, not under "the wallet will sign"; an embedded send lists it.

**D11 (e2e, `tx-sendTx-fields.test.ts`; no new file).** After the mint lands, before the existing step: the new playground send goes from B with A in `additionalScopes` and no witness; the window shows `execute-op-refusal-reason` with the OA-2 text; Reject answers the playground with code 4100. The existing step then asserts one summary row with `data-on-behalf` = the owner's address and its line naming the owner's account, and the send still lands with a hash. Failure modes: a real PXE taking two stubbed accounts, a real Noir request decoding to a consumed record, and a refusal crossing the SW, the popup and the dApp; no cheaper layer runs a real PXE. Estimated +20 s per browser (one estimate, no proof); measured in the PR. The app-paid route stays at unit level: the playground's app-paid send carries no other account's witness, and the route differs only in which run the same probe reads.

**Gate**, from the worktree root: `bun run lint`; `bun run audit:vue` (typecheck, tests and lint, then the build); `(cd apps/extension && bun --bun vitest run src/wallet/services/execution src/popup/windows --retry=0)`; `bun run test:all`; `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/tx-sendTx-fields.test.ts tests/e2e/network/tx-sendTx-delegated-authwit.test.ts tests/e2e/network/tx-sendTx-noFrom.test.ts tests/e2e/network/scope-refusal.test.ts tests/e2e/network/type-roles-windows.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`; `bun run check:plans` after staging. No smoke e2e file reaches the execute window; CI's smoke lanes run on the PR. Pass: every command exits 0 at retry 0; steps 1 and 2 red on base as stated. Layers: lint, typecheck, build, unit, component, network e2e on two browsers.

## Delivery

- One arc, branch `worktree-authwit-window-1`, PR to `dev`: `fix(execution): name authorizations a send consumes for another approved account` (80 characters), `Closes #1639`. Ready, no label at creation; add `e2e:extension-network` only if the path filter skips the network lanes. The PR waits for the owner's OA-1, OA-2 and OA-6 picks before it merges.
- Body: what changed and why; the sign-off quote; the before/after captures (`?raw=true` at the head SHA); `tx-sendTx-fields` time per browser before and after, and each browser's network suite wall-clock from CI before (latest green run on another PR) and after; runs and outcomes; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. It describes what the window names and when, never a weakness.
- Commits conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The close-out lands as the PR's final commits. No lanes: one phase.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `ea282b7bc`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff ea282b7bc...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, with one Opus 5.5 diff review (`general-purpose`) beside round 1. Prompts under `~/.cache/nulo-backlog/authwit-window-1/`. Hard stop at three rounds; log each in `lessons/phase-1.md` and § Audit verdicts.
- Approval boundary (a plan change; stop): a signature as any account but the sender; a screen change beyond § UI impact; a new log line; a stored shape; a change to the bridge's scope check.
- Close-out: the Outcome; I3 and I4 filed as closed `known-limit` issues; lessons promoted within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done authwit-window-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/authwit-window-1/plan.md`. A session without a `/loop` arms one background wait after its report.

## Decision ledger

- **L1. One list, marked by `onBehalfOf` (D3)**, over a second list beside `discoveredAuthwits` (the competing outline): every carrier and the popup's decode chain already take the list; a second list touches five carriers for the same records. Codex round 1 agreed.
- **L2. Listed keys by account and hash (D4)**, over one hash set: Codex round 1 showed a hash listed for A could be signed as B at confirm; the key closes it in the bookkeeping the subset check already does.
- **L3. The refusal in the decoder (D1)**, over each caller: one rule for every route, as the registry refusal.
- **L4. Stub the scopes in classic and NO_FROM, route such sends off the fold (D2)**, over stubbing in the fold (Codex round 1: approvable on a stubbed check), over forcing the fold's validated run whenever its scopes hold another account (Opus round 1: a condition in two strategies, and the FPC's first pass would still size its envelope on a stub), over matching the PXE's "Unknown auth witness" text (a string match on another package's message), and over keeping the fee failure (the competing outline; the lane requires the reason).
- **L5. The app-paid route reads its validated run through the probe (D6)**, over a known limit (Codex round 1: blocking; a supported route) and over discovery's dummy fee method (it conflicts with the app's own fee calls).
- **L6. A constant refusal text (D7)**, over naming A in it: naming needs the account on the wire through unvalidated `details`; the window names A in case 1, where the person decides.
- **L7. Names in the popup through `AddressDisplay`**, over names resolved in the SW (the competing outline): a stored name would go stale after a rename and travel in every record.
- **L8. No composition test**: COMPOSITION-TESTS.md rules discovery out; the executor's unit tests and the e2e cover it.
- **L9. Register before stubbing (D2)** (Opus round 1), over stubbing only accounts already registered: registering makes the stub valid for every approved account and lets a scope account that never sent run its real check in the validated run; skipping would leave case 2 unexplained for such an account.
- **L10. An `observer` apart from the fold's `probe` (D6)** (implementation review, Opus; Codex agreed), over the validated pipeline's `probe` slot (the strategy is picked by the settings' fee kind, so an app-paid op estimated with `fj`/`fpc` settings would get a stubbed first run) and over a fee-kind guard at the executor's two branches (a condition repeated at two call sites, the fence still by convention).
- **L11. One registry rule on every route (OA-6)** (implementation review), over a decoder option exempting the app-paid route (the owner's alternative B) and over catching the refusal in the executor (a patch over the decoder's rule).

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a1a2b6) | reject | the app-paid route (D6, L5); no stubbing in the fold (D2, L4); listed keys by account (D4, L2); I2 and I3 rewritten (I3's "every check" was false: the inner-hash helper emits nothing); the wording and contact-name notes to OA-1; the build gate; tests for the new boundaries | none |
| plan 1 | Opus 5.5 (Plan) | conditional approve | register before stubbing (D2, L9, F11); F2 restated (the folded run sizes the fee); the History row and dApp text as OA-5, with § UI impact; the missing-snapshot test; I5 (misattribution, witness order); `refusalKind` order; case 2 on the app-paid route as a known limit (I4) | the rebuild trigger in the fold (L4: routing off the fold instead); app-paid as a known limit for case 1 (Codex's blocking finding wins: the validated run already holds the effects, L5) |
| final 1 | Codex, gpt-6.1-sol, fresh (session 01a1a2c4) | conditional approve | D6 names the `service.ts` adapter and the dep's `probe`, with a wiring test; the NO_FROM registration test; recon's fingerprint line corrected (a standard send's key binds its actions, not its scopes; the preview binds the interaction and index) | none |
| final 1, resumed | Codex, same session | **approve** | the three fixes verified; no regression; nothing added state, a lifecycle, a protocol, a recovery policy or a public contract | none |
| impl 1 | Codex, gpt-6.1-sol (session 01a1a2e3) | approve | two nits: the fence doc moved back onto `resolveAccount`; the embedded test asserts the exact validated options | none |
| impl 1 | Opus 5.5 (general-purpose) | conditional approve | the registry refusal now reaching the app-paid route, surfaced as OA-6 with a pinning test (L11); the `observer` split (L10); the same comment nit; a classic confirm test for a hash listed for another account | none (its hostile-contract divergence note adds nothing beyond I3) |
| impl 1, resumed | Codex, same session | agree with changes | OA-6 is a merge requirement, not a UI-impact line alone; its premise corrected (an owned account's witness for a registry change can already exist); the observer test spans `embedded`, `fj` and `fpc` settings | none |

## Seeds (not run; orchestrator-owned)

```
/goal Phase 1 of implementations-plan/authwit-window-1/plan.md marked ✓ with its gate passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1639 with the close-out as its final commits, waiting for the owner's OA-1, OA-2 and OA-6 picks; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/authwit-window-1 per its plan.md and the README § Post-implementation standard at ea282b7bc: run the gate, decide open questions with Codex (gpt-6.1-sol, high), open the PR, never merge, never change the window beyond § UI impact; stop once checks are green and report.
```
