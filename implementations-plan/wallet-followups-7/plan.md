---
plan: wallet-followups-7
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: e900f710
status: approved by the orchestrator at cbb663ad; implementing
---

# wallet-followups-7: one token contract spelling; a bound on a session's pending calls

Two decision-free issues in one arc and one PR against `dev`: #329 (a token added in upper-case hex never matches its own calls) and #354 (a connected app can grow the worker's memory with many in-budget secure messages). Recon and measurements: [`recon.md`](recon.md); planning log: [`lessons/phase-0.md`](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom**: a person who pastes a token address in any case and later mints that token from a dApp; every person with a connected app, whose wallet must keep serving other apps while one page misbehaves.
- **Excellent**: one stored spelling per contract, so the existing `===` readers (Activity, the transaction page, received rows, balances, the PXE registration check) agree without a per-site helper; a session past its bound gets the -32005 envelope the wallet already sends, and the deepest pipeline in the repository's tests (5 calls) never meets it.
- **Good enough**: no migration of rows already stored in another spelling (pre-production); the bound is a count, not a heap bound (KL-1).

## Assumptions

**Facts** (verified at e900f710)
1. `parseTokenInterface` returns `contract` as typed (`apps/extension/src/wallet/services/token/service.ts:707`); `findToken` compares with `===` (`:813`); `buildToken` stores it (`:951`); `ensureRegistered` (`execution/contract-resolver.ts:141`) and the fee-juice name fallback (`service.ts:805-806`) also compare it with `===`; `isValidHex` accepts either case (`apps/extension/src/utils/string.ts:29-31`).
2. Every add path runs one parse: popup `NewTokenPopup.vue:191` → `addToken`; dApp `execution/service.ts:962` → `addTokenAuthorized`; seeder `previewTokenMetadata` (`service.ts:755`) → `addSeededToken`.
3. `txAmount` matches `t.contract === primary.contract` (`apps/extension/src/utils/tx-amount.ts:49`); the planner writes `call.to.toString()`, lower case.
4. `Hold.admit()` returns true once the hold settles (`wallet-sdk/verification-hold.ts:59-62`); `serializeDecryption` queues every secure message on a per-session `KeyedLock` with no cap (`background.ts:716-722`); `KeyedLock.delete` drops only the map entry, so a retired lock's waiters still run.
5. #354, dispatch stage, **demonstrated in-process**: 64 calls of 4 MiB behind a held head → 63 waiting, 0 refused, +256 MiB; 32 parsed ~10 MiB object-dense payloads → +772 MiB. Decrypt stage: the same shape with an artificially held decrypt (+252 MiB); in a browser it depends on arrival rate.
6. The deepest pipeline observed in the repository is 5 calls in flight (`tests/e2e/network/concurrency-rapid-fire.test.ts:26-34`).
7. Cleanup can run on settlement: `chainSendTxWithVouching` returns a chain that settles whenever its call settles, `run` called or not (`queued-wait-vouching.ts:23-36`).
8. A page can re-key one session id at will: upstream `terminateSession` restores the discovery to `approved` and key exchange needs only that (`background_connection_handler.ts:389-413, 306-310` in `@aztec-labs/wallet-sdk`).

**Inferences**
- I1. Browsers deliver secure messages more slowly than the wallet decrypts them, so honest apps rarely meet the decrypt drop. Unmeasured; a dropped call stays pending on the app side (no per-request timeout, PONGs keep the channel alive).
- I2. Pre-production, a row in another spelling exists only from a pre-fix add or a restored backup.
- I3. An honest app may keep polling while the person reads an approval (the session's queue waits on it) and so meet the bound. Unverified; OA-3.

**Asks**: none open. Owner asks OA-1 to OA-3 are in `OWNER-ASKS.md`, settled by the orchestrator (D-orch-2 to D-orch-4).

## Architecture & Implementation

**#329.** `parseTokenInterface` already builds `AztecAddress.fromStringUnsafe(contract)`. Keep that object and use `address.toString()` for the PXE lookup, the pin check, `ensureRegistered` and `TokenInterface.contract`. Every add then stores the canonical spelling. `findToken` compares both sides lower-cased (the codebase's idiom, `background.ts:239`, `default-tokens.ts:93`), so a row in another spelling is the same token: the add returns it and writes no second row. Restore stays verbatim (D5).

**#354.** One constant, `MAX_PENDING_PER_SESSION = 32` (renamed from `MAX_HELD_PER_SESSION`, same value), at two points:
- *Dispatch.* `Hold.admit()` counts every arriving call, settled hold or not, and refuses at the cap. It hands back a one-shot release, which `onWalletMessage` calls when the call's chain settles (`.then(release, release)`). The count lives on the hold because the hold is per key exchange and captured on arrival; a release never looks the session up by id.
- *Refusal.* `refuseOverPendingCap` (renamed) sends its -32005 reply through the session's decrypt lane: `void decryptLocks.withLock(sessionId, () => live.respond(response)).catch(...)`. It enqueues and returns; awaiting it inside the lane would deadlock. A reply passes no admission check: its request already owes it. The captured `live` makes a reply no-op once its session ends.
- *Decrypt.* In `serializeDecryption`, a message that finds `decryptLocks.waiting(sessionId) >= MAX_PENDING_PER_SESSION` is dropped before the decrypt, unanswered (its id is inside the ciphertext), logged at `debug`. `KeyedLock.waiting(key)` reads a new `Lock.waiting` getter (`queue.length`); a deleted key reads 0, so a re-keyed session starts fresh.
- Bound per session generation: 32 pending calls, plus at most 33 queued lane operations and one holder (a refusal appended while a decrypt runs overshoots by one). A count, not a heap bound. No new error code, persistent state, timer or lifecycle.

**File-level change map**
| File | Change |
|---|---|
| `apps/extension/src/wallet/services/token/service.ts` | parse uses `address.toString()`; `findToken` lower-cases both sides |
| `apps/extension/src/popup/components/popups/NewTokenPopup.vue` (+ test) | the duplicate check compares lower-cased spellings (D-orch-2) |
| `.../token/service.composition.test.ts`, `.../token/service.test.ts` | T1, T2 |
| `apps/extension/src/wallet/services/wallet-sdk/verification-hold.ts` (+ test) | `admit` always counts, one-shot release, rename, module doc |
| `apps/extension/src/wallet/services/wallet-sdk/background.ts` | release on settle; refusal through the lane; decrypt drop |
| `.../wallet-sdk/background.connect-window.test.ts` | T4–T7; the 32-held test flushes before asserting |
| `packages/wallet-core/src/utils/{lock,keyed-lock}.ts` (+ `keyed-lock.test.ts`) | `waiting` getters, T8 |
| `ARCHITECTURE.md` § Calls wait for They match | the bound now covers every session |

**Decision ledger** (Codex round 1 agreed D1–D7; the Opus lens agreed D1–D6 and D7 in part)
- D1. Canonicalize at the parse, not `sameFieldAddress` at each lookup: one spelling in storage, fifteen readers fixed at once. At the parse rather than at persist: the parse is where the address is read, and its interface also feeds the PXE registration check, the fee-juice fallback and the execute window's preview, which a persist-time fix would miss.
- D2. `findToken` lower-cases rather than `sameFieldAddress`: its argument is always a parse output, and case is the only difference to absorb.
- D3. Decrypt depth from `KeyedLock.waiting`, not a parallel counter: the queue is the truth, and a per-id counter would drop an honest reconnect behind its predecessor's backlog.
- D4. One count on the hold, not a second counter beside it; the held case behaves as before.
- D5. Restore stays verbatim: token and balance rows share a spelling (`balance-identity.ts:17`); canonicalizing one table splits them. KL-2.
- D6. Count, not bytes, as the brief scopes it. Measured residual in KL-1; a byte or worker-wide budget is a plan change (OA-3 option 3).
- D7. 32: six times the deepest observed pipeline, above the execution lane's per-origin 8, and the held case's existing value. In-tree evidence only (I3).
- D8. Refusal replies ride the decrypt lane (Codex round 2, Q1): the lane's depth then bounds decrypts and owed replies together, with no new counter. Rejected: a known limit (replies were unbounded), and a separate in-flight-reply counter (more state for the same bound).
- D-orch-1. One arc, one PR, no stack: the lane brief's default grouping; nothing in the tree forces #329 and #354 apart.
- D-orch-2. OA-1 → option 2 (orchestrator `no_ask`, 2026-10-13): the New token popup's duplicate check compares by address, so a different-case duplicate shows the existing "Already exist" and the button stays off.
- D-orch-3. OA-2 → option 1 (same record): one spelling per address; a token typed in upper case shows and copies in lower case.
- D-orch-4. OA-3 → option 1: 32 on every session. A byte budget, a per-id or worker-wide budget, or failing a dead generation's calls at session end is a plan change that stops for the orchestrator.

## Security & Adversarial Considerations

- **Threat**: a script on an origin the person connected floods well-formed secure messages. Capability: post at will on its live session, and re-key it. Boundary: the worker's availability (every app's session), not funds or keys. The arc changes no dependency, crypto, CI or published package.
- **Refusal surface**: past the dispatch bound the app gets -32005 `TOO_MANY_PENDING`, as the held cap and the execution lane already send; before the decrypt nothing is answerable, so the message is dropped. Both log at `debug` (a page repeats them at will), naming only the method placeholder and `describeExternalId`, never a payload.
- **Residuals**: KL-1 (per-generation bound, re-key and new sessions multiply it; a refusal encryption that never settled would wedge that generation's lane: WebCrypto settles, no timeout added). KL-2 (old spellings). Both filed as closed `known-limit` issues at close-out.
- **#329**: the parse refuses any input whose decoded buffer is not exactly 32 bytes or is at or above the field modulus. `Buffer.from` drops a trailing odd digit or an invalid pair: the popup's `isValidHex` and the dApp ingress (#353) admit only 64 digits, and seed addresses are trusted constants; `parseTokenInterface` and `previewTokenMetadata` are popup RPCs that forward unchecked, and no validation is added here. A token row is the person's own list; no trust boundary moves.

## Phase 1: one token contract spelling (#329) — arc-1 ✓

Steps: bind `const address = AztecAddress.fromStringUnsafe(contract)` in `parseTokenInterface` and use `address.toString()` everywhere after it. Make `findToken` compare lower-cased spellings. Add the tests on an address with letter digits.

Tests: **T1** (composition) the parse of an upper-case address returns the canonical spelling, and `txAmount` reads a lower-case mint call against a token built from that interface (red on base). **T2** (`service.test.ts`) a row stored in one spelling and an add in the other are one token: same id, no second row (red on base; the success control is the same-spelling test at `service.test.ts:114-118`). **T2b** (`NewTokenPopup.test.ts`, D-orch-2) a listed contract typed in upper case shows "Already exist" and the button stays off (red on base; the same-spelling test is the control).

**Validation gate**: `cd apps/extension && bun --bun vitest run src/wallet/services/token src/utils/tx-amount.test.ts src/popup/components/popups/NewTokenPopup.test.ts src/wallet/services/execution/register-token.test.ts`, then `bun run lint` and `bun run typecheck:all`. Pass: exit 0; T1 and T2 fail against `git show e900f710:<path>` copies of the changed source (never `git stash`). Layers: lint, typecheck, unit, composition.

## Phase 2: a bound on a session's pending calls (#354) — arc-1 ✓

Steps: add the `waiting` getters. Make `admit()` count always with a one-shot release. Release on settle in `onWalletMessage`. Route the refusal through the lane. Drop past the bound in `serializeDecryption`. Rename; update the module doc and `ARCHITECTURE.md`.

Tests: **T3** (`verification-hold.test.ts`, rewriting `:59-66` as an intended change) a hold admits 32, settled or not, and refuses the 33rd; a second release call frees nothing; two holds count apart. **T4** a confirmed session whose head waits in dispatch: 31 more are admitted; after a flush, a 33rd `sendTx` is answered -32005 with no row, the head unsettled (red on base); an admitted send has its row and a second session dispatches meanwhile (controls); the head rejects and the next call is admitted. **T5** a `sendTx` whose FIFO baton was released but which is unanswered keeps its slot. **T6** with the head decrypt held, 32 wait, the 33rd is dropped (never decrypted, unanswered); the 32 then decrypt in order and a new one decrypts. In a second case, the session ends and its id re-keys while the old head is still held and its queue full: the successor's message is admitted and decrypts before the old head is released. **T7** a held refusal reply plus a full lane drops further ciphertext, a reply appended while a decrypt runs is the one overshoot, and a reply that rejects still lets the lane advance; a refusal queued behind a held decrypt, then a termination and a re-key, then the old lane drained: the old refusal sends nothing and a refusal of the successor is sent. **T8** `KeyedLock.waiting` counts queued operations and reads 0 for an unknown or deleted key. The existing 32-held test flushes before its assertion and still asserts the refusal without confirming the check.

**Validation gate**: `cd apps/extension && bun --bun vitest run src/wallet/services/wallet-sdk`, `cd packages/wallet-core && bun run test`, then `bun run lint` and `bun run typecheck:all`. Pass: exit 0; T4, T6 and T7 fail against base copies. Layers: lint, typecheck, unit.

## Phase 3: arc gate — arc-1

Warning: run one `e2e:agent` at a time in this worktree, at retry 0; never raise the stall watchdog.
1. From the root: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run test:ci-gating`.
2. Token files, Chrome, then Firefox (`NULO_E2E_BROWSER=firefox`): `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/{register-token,token-add-auto-trust,tokens,token-management,holdings}.test.ts --retry=0`; smoke `cd apps/extension && bun run test:e2e -- tests/e2e/{holdings-add-token,shipped-token-list}.test.ts --retry=0`.
3. Ingress files, both browsers, same runner: `cap-request-*`, `execute-scope-*`, `connect-*`, `verify-hold`, `concurrency-rapid-fire`, `concurrent-sendtx`, `session-reconnect-flood`; then `NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=1960252198 ... tests/e2e/network/send-chaos.test.ts --retry=0`.

Pass: every command exits 0; one rerun only for a known flake. No e2e scenario is added. Layers: all.

## UI impact

- Activity mint figure and the holdings list: "no_ask (orchestrator, 2026-10-13): #329 restores the mint figure and the single row a canonical address already gets; no new copy, no layout change."
- New token popup and token display: "no_ask (orchestrator, 2026-10-13): #329 compares the duplicate check by address; the existing 'Already exist' message, no new copy"; and "a typed upper-case token address displays and copies in the wallet's one lower-case spelling" (D-orch-2, D-orch-3).
- #354: no wallet screen changes; a refusal is an envelope to the app (OA-3 covers apps that poll).

## Issues

| Issue | Arc | Note |
|---|---|---|
| #329 | arc-1 | claims hold; no e2e asserts an Activity mint figure, so none is listed |
| #354 | arc-1 | claims hold, now demonstrated in-process; closes with the per-session bound, residual KL-1 |
| #322, #349, #338, #339, #340, #341, #103, #108, #112, #172, #118, #188, #218, #219 | no arc | outside the lane brief (owner calls, holds, other lanes) |

## Delivery

One arc, one PR, no stack (D-orch-1). Branch `worktree-wallet-followups-7` → `dev`. Title (78 chars): `fix(wallet): one token contract spelling; bound a dApp session's pending calls`. Body: what changed and why, the validation runs, `Closes #329`, `Closes #354`, ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Open it without labels after Phase 3 and the Codex loop; add `e2e:extension-network` only if the path filter skips the network suite. The close-out lands as its final commits.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at e900f710. Specific to this plan:
- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff e900f710...HEAD` after Phase 3: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/wallet-followups-7/`; hard stop at three rounds; rounds logged in `lessons/phase-3.md`.
- Approval boundary: a byte budget, a worker-wide or per-id bound, failing a dead generation's calls at session end, a new error code or persistent state is a plan change and stops for the orchestrator.
- Close-out: file KL-1 and KL-2 as closed `known-limit` issues (dedupe first); promote nothing to `lessons.md` unless a retirement pays for it (8 KiB budget); delete `STATUS.md`. Teardown: slug `wallet-followups-7`, trunk `dev`, `implementations-plan/archive/wallet-followups-7/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| 1 | Codex, gpt-6.1-sol | conditional approve | retired queues on re-key (KL-1, T6); refusal replies unbounded (D8); slot-lifetime tests (T4, T5, T7); claim corrections; count-vs-heap wording | skipping queued decrypts whose session changed: a wrong-key decrypt fails closed, only wasted work |
| 1 | Opus 5.5 lens | conditional approve | memory at the cap, measured (KL-1); same-id re-key (Fact 8, KL-1); honest pollers (I3, OA-3); silent drop (I1); test edits (T1/T2 merged, rejecting head, second-session control, `concurrent-sendtx`, `session-reconnect-flood`); display spelling (OA-2); cite fixes | "the parse pads short input": the constructor throws on any length but 32 bytes |
| 2 | Codex, resumed | conditional approve, conditions applied | lane for replies with its overshoot, rejection and re-key controls (D8, T7); I1 as a hypothesis; the parse's truncation of a trailing odd digit or invalid pair, as wording | none |
| 3–4 | Codex, resumed | conditional approve, then **approve** on the applied revision | re-key controls made explicit in T6 and T7; the caller-validation claim narrowed to the popup and the dApp ingress | none |

Known limits to file at close-out: **KL-1** (#354 residual: the bound is per session generation, a count and not a heap bound; 32 object-dense calls held +772 MiB; re-keys and new sessions multiply it; a never-settling refusal encryption would wedge that generation's lane; reopen on a worker crash within the bound, a report, or a decision for a byte or worker-wide budget). **KL-2** (#329 residual: rows written before the fix or restored in another spelling keep it, so their mint figure stays hidden; reopen at launch if such rows exist, or on a report).

## Seeds

```
/goal Phases 1-3 of implementations-plan/wallet-followups-7/plan.md marked ✓, each backed by its validation gate passing in the transcript; LESSONS_FILE=implementations-plan/wallet-followups-7/lessons/phase-N.md printed per phase; the Codex loop (gpt-6.1-sol, high) converged with a resumed pass quoting no new material finding; one PR from worktree-wallet-followups-7 to dev opened after that, closing #329 and #354, its close-out commits archiving the plan (git show --stat in the transcript); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/wallet-followups-7 forward per its plan.md and the README § Post-implementation standard at e900f710: reality-check plan.md and lessons/, run the next phase's gate, one e2e:agent at a time at retry 0, decide open questions with Codex (gpt-6.1-sol, high), never merge, never widen scope; stop after the PR's checks are green and report.
```
