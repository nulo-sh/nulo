---
plan: authwit-onbehalf-1
tier: light
status: Phase 1 green, review loop converged; PR next
issues: "#1491"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg; final fresh Codex pass
base: origin/dev at c4173bb8e
trunk: dev
post_implementation_hardening: not scheduled
---

# authwit-onbehalf-1: discovery signs and lists only requests on behalf of the sending account

The owner's pick B on #1491, in one arc. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/` unless noted.

## The issue, checked

#1491 held as written, by trace. B sends `transfer_private_to_private(A, X, 1, nonce)` with A's witness attached and A in `additionalScopes`. Classic discovery decodes the token's request (on behalf of A, caller B) and keeps it, because `decodeAuthwitEffects` never reads `onBehalfOf`. The build then signs it as B (`tx-request-builder.ts:174-188`, after the attached witness of A), and the window lists "Lets B …" (`SendTxSummary.vue:121-126`). The message hash binds the consumer and `innerHash = H(msgSender, selector, argsHash)`, never the signer, so B's witness shares A's hash. The PXE takes A's, the first. One precision: the `default_entrypoint` path signs as the operation's account (`dapp-send-executor.ts:1456-1458`), which has no `msg_sender`; "the sending account" means that account there.

## Outcome & Quality Bar

- **For whom:** a person approving a dApp send from B that carries an authorization A already gave.
- **Excellent:** the window lists only what the wallet will sign, and signs only as the account it sends from. The movement from A stays readable on the call line for a listed token. A send whose request names its own account lists and signs exactly as today.
- **Good enough:** no other screen change; the attached witness of A still renders nowhere (the owner chose B knowing it).

## Assumptions

**Facts** (verified at `c4173bb8e`; citations in recon)
1. Upstream `CallAuthorizationRequest.onBehalfOf` is "the account that must sign the authorization"; `fromFields` reads it as the third field.
2. Every fresh discovery runs `decodeAuthwitEffects`, and each path signs as one account: classic, the build's `account` (taken from the discovery build, signed in the later build; both resolve `op.accountAddress` under one fence, `tx-request-builder.ts:280`); folded, `built.account` at the three probe calls; `default_entrypoint`, `d.account`. A reused estimate skips discovery (`dapp-send-executor.ts:1213`).
3. Preview and confirm run the same decoder; `assertWithinPreview` is a subset check over hashes.
4. `tx-sendTx-fields.test.ts`'s additional-scope step drives #1491's exact flow through the playground's generic `sendTx`. It sends `NO_WAIT` and asserts an ok result with a hash. Its token is not in the wallet's list, so its call shows the function only.
5. `tx-sendTx-delegated-authwit.test.ts` runs folded discovery on the donor's own pull request (on behalf of the sender) and counts one row.
6. Three decoder fakes (`decode-authwit-effects.test.ts`, `discovery-probe.test.ts` twice, `dapp-send-executor.test.ts`) and one real-preimage test (`onBehalfOf` `0xabcd`, account `0xacc0`) exist; `authwit-discoverer.test.ts` mocks nothing.
7. The folded fee-juice and sponsored fast paths rebuild and simulate validated only when the probe returns actions or the build is init-wrapped (`fee/fee-juice-strategy.ts:41-50`, `fee/fpc-strategy.ts:175-181`); the stub answers every check of the sender's witness (`fee/fee-strategy.ts:192-203`).

**Inferences.** I1: `fromFields` validates the request's hashes, not that `onBehalfOf` names the account the contract then checks; a contract can name A and check B. I2: the filter is a signing policy, not contract attestation: real execution still validates whatever authorization the contract checks.

**Asks.** None. The owner's pick decides the one visible change.

## Decisions

- **D1.** `decodeAuthwitEffects(effects, chainInfo, signer: AztecAddress, crypto?)` returns `{ signable, requested }`. `signable` holds, in effect order, each decoded request whose `onBehalfOf.toString()` equals `signer.toString()`, hashed; any other is skipped before hashing. `requested` is true when any effect decoded as a request, whoever it names. The registry refusal stays first and still reads every effect. `DecodedAuthRequest` gains `onBehalfOf`. The module comment states the invariant (§ Security).
- **D2.** Each caller passes the account it signs as: `account.address` (classic), `d.account.address` (`default_entrypoint`), and `built.account.address` through a new `signer` field of the probe's `extractEffects` context (the three strategy calls). The classic and `default_entrypoint` paths read `signable` only.
- **D3.** The probe's `extractEffects` returns `{ actions, requested }`. The fee-juice and sponsored fast paths rebuild and simulate validated when `requested` or the build is init-wrapped, as they do today for any decoded request; the FPC two-pass reads `actions` (its Pass 2 is always validated). So a dropped-only extraction still meets the validated pass before the estimate is approvable.
- **D4.** No component change, no new log line, no new state. The window loses the line because the record no longer exists.
- **D5 (tests; the first four red on base).** `decode-authwit-effects.test.ts`: a request on behalf of another account is dropped and never hashed, with `requested` true; the sender's request beside it stays (control). `authwit-discoverer.real.test.ts`: the existing case (another account) gives no record; one with `onBehalfOf` the account gives the recorded KAT record (the real field position). `discovery-probe.test.ts`: the signer's effect and another account's give one action and one record. `dapp-send-executor.test.ts`: on `default_entrypoint`, the preview lists and the confirm signs only the account's request (one `createAuthWit`). `strategies-lifecycle.test.ts`: `chain.signer` is the build's account, and a new `FOLD_MATRIX` cell, a dropped-only extraction on a deployed account, runs the validated rebuild on the fee-juice and fast paths (the cell with no effects keeps one simulation). The other fakes name the test's sending account; the probe fakes in `fee/strategies-structural.test.ts:442,474,550` take the new return shape. `OperationCard.summary.test.ts`: a third case in the sender test (`:388-400`), wire-shaped, B's `transfer_private_to_private` of a listed token from A, reads "1 USDC from A to X"; it pins the signed window's explicit-sender line, green on base, not proof of the fix.
- **D6 (e2e; no new scenario).** The additional-scope step of `tx-sendTx-fields.test.ts` gains, after `waitForExecuteApprovable`: one summary call, no `execute-discovered-authwit-line`, no `execute-op-summary-authwits-section`. It keeps `NO_WAIT` and its ok-with-hash assertion: the hash returns only after the private execution inside `proveTx` ran A's `verify_private_authwit` with A's witness alone (proverless runs keep that execution), and inclusion does not read witnesses, so a receipt adds no failure mode. Failure mode: a real Noir-emitted request whose `onBehalfOf` the SW must read, and a real PXE that must accept the send on A's witness alone; no unit layer runs either. Red on base: the window lists one line. Estimated ±1 s per browser; measured (the test's own time, one run each on a loaded host): Chrome 39.8 s before, 45.3 s after; Firefox 48.2 s before and after.

## Architecture & Implementation

| File | Change |
|---|---|
| `src/wallet/services/execution/decode-authwit-effects.ts`, `discovered-authwit.ts` | D1 |
| `authwit-discoverer.ts`, `dapp-send-executor.ts` | D2 |
| `discovery-probe.ts`, `discovery-aware-estimator.ts` (the `DiscoveryProbe` type), `fee/fpc-strategy.ts`, `fee/fee-juice-strategy.ts` | D2, D3 |
| the tests of D5 | D5 |
| `tests/e2e/network/tx-sendTx-fields.test.ts` | D6 |

Alternatives not taken: see the decision ledger (L1-L7).

## UI impact

Sign-off: decision page 95, P95-07, signed 2026-11-02 at 17:02 UTC: "Drop requests made on behalf of another account: no line and no redundant signature. The call line still shows the transfer from A for a token in the list; for any other call it shows the function only." Confirmed in chat: "P95-07 let's do B then."
- **Execute window, a dApp send carrying another approved account's authorization** (standard and `default_entrypoint`): the dropped request leaves every place that renders it. At rest, its summary line ("Lets B move 1 from A to X", or "Lets B call … on …") and the Authorizations section when it was the only one. Under "Show all details", its row in "Authorizations the wallet will sign (found during estimation)" (`OperationCard.vue:341-351`). In the over-budget fee re-ask window, the same card's rows (`fee/index.vue:149,251`). Each is one rendering of the record the pick drops; listing a request the wallet will not sign would be false. After: only the call line. A send whose request names its own account reads as today.
- Captures (light, Chrome) before and after, at rest and with the details open, go in `screenshots/` and the PR body.

## Security & Adversarial Considerations

- **Invariant:** the wallet signs an authorization only as the sending account, and an authorization another account already granted is carried, never re-signed. The filter is a signing policy, not attestation: it does not prove a request describes the check its contract runs (I1), so hash validation, the execution-derived consumer, the preview's hash check and real execution stay the boundary.
- **Threat model:** a hostile dApp or contract controls every field of an emitted request. Today it can make the wallet sign, as the sender, a request that names another signer. After D1 the wallet signs strictly less. A contract that names A but checks B's witness gets none. D3 keeps today's validated pass on the folded fee-juice and fast paths, so the estimate fails there; classic fails at its validated estimate, the FPC two-pass at Pass 2. `default_entrypoint` has no validated pre-approval simulation by design, so there it fails at confirm's real simulation (fail closed, no authority granted).
- **Trust boundaries:** `onBehalfOf` is read from the same validated `fromFields` decode as the hashed fields; the comparison is two canonical `AztecAddress` strings. No message, stored shape, permission, dependency, crypto or CSP change.
- **Logging:** no new line; never a request's contents (CLAUDE.md § Logging policy).
- **Keyboard:** the window's Enter handling is untouched (no document-level Enter on a signing popup).

## Phase 1: the filter, its tests and the e2e ✓

1. Time the unchanged `tx-sendTx-fields.test.ts` once per browser. Write D6's e2e assertions first. Run the file on Chrome on base sources and require red with one discovered line (the reproduction). Capture the window before, at rest and with the details open.
2. Write D5's tests; require the first four red on base. Commit. Make D1-D3. Require all green, the new `FOLD_MATRIX` cell included. Commit.
3. Run the e2e set on both browsers; record each file's time. Capture the window after with a temporary, uncommitted screenshot step under `~/.cache/nulo-backlog/authwit-onbehalf-1/`; require nothing untracked under `tests/`.

**Gate**, from the worktree root: `bun run lint`; `bun run typecheck:all`; `(cd apps/extension && bun --bun vitest run src/wallet/services/execution src/popup/windows --retry=0)` (the inner loop); `bun run test:all` (wallet-bridge included); then `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/tx-sendTx-fields.test.ts tests/e2e/network/tx-sendTx-delegated-authwit.test.ts tests/e2e/network/tx-sendTx-noFrom.test.ts tests/e2e/network/authwit-consume-smoke.test.ts tests/e2e/network/authwit-lifecycle.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`; `bun run check:plans` after staging. Pass: every command exits 0 at retry 0; step 1 red on base; D5's first four red on base. Layers: lint, typecheck, unit, component, network e2e on two browsers. The two public-authwit files reach no decoder; they run because the lane brief names the files that grant and use an authwit. `authwit-variants` is left out: it signs through `createAuthWit` and uses nothing.

## Delivery

- One arc, branch `worktree-authwit-onbehalf-1`, PR to `dev`: `fix(execution): sign and list only authorizations on behalf of the sending account` (82 characters), `Closes #1491`. Ready, no label at creation; add `e2e:extension-network` only if the path filter skips the network lanes.
- Body: what changed and why; the sign-off quotes; the before/after captures (`?raw=true` at the head SHA); the touched e2e file's local time per browser before and after, and each browser's network suite wall-clock from CI before (the latest green run of the same workflow on another PR) and after; runs and outcomes; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The close-out lands as the PR's final commits. No lanes: one phase.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `c4173bb8e`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff c4173bb8e...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, with one Opus 5.5 diff review (`general-purpose`) beside round 1. Prompts under `~/.cache/nulo-backlog/authwit-onbehalf-1/`. Hard stop at three rounds; log each in `lessons/phase-1.md` and § Audit verdicts.
- Approval boundary (a plan change; stop): any screen change beyond § UI impact, a new log line, a signature as any account but the sender, a change to the preview's subset rule.
- Close-out: the Outcome; lessons promoted within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done authwit-onbehalf-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/authwit-onbehalf-1/plan.md`.

## Decision ledger

- **L1. The filter in the shared decoder** (Codex and Opus agree): one rule for all three paths; filtering at each caller makes three copies, and a fourth path could forget it.
- **L2. The probe's signer from `built.account.address` through its context** (both agree): node, network and signer then describe the simulated build the stub covers. The constructor would hold the operation's address string, built before any build exists.
- **L3. `toString()` equality** (both agree), with `signer` typed `AztecAddress` (Opus) so no caller passes a raw string; `sameFieldAddress` exists but adds nothing for two canonical SDK addresses.
- **L4. A dropped-only folded extraction keeps the validated pass (D3).** Codex: blocking, fix it. Opus: a known limit; the change adds a contract on `DiscoveryProbe` for a hostile case, and a contract that checks B's witness without emitting a request already reaches proof today. Taken: fix. Without D3 the change weakens a boundary the fold has today (every decoded request forces the validated pass) and makes a stub-only estimate approvable. The fix is an internal return shape, with no state, lifecycle or public contract. Codex's trigger, any raw effect, rejected: it would also add a second simulation to sends whose only effects are other offchain messages, a change outside the lane; `requested` keeps today's trigger for every request that decodes and hashes; one that decodes but then fails to hash, which today forces no rebuild, now forces one (final pass: harmless, one extra validated simulation). The pre-existing non-emitting case is the fold's accepted design and stays out of scope.
- **L5. No receipt wait in the e2e** (Opus; Codex preferred the playground's receipt wait over `waitForTxMined`, not over none). The proof already ran A's check before the hash returns; inclusion reads no witness. It also keeps the playground unchanged.
- **L6. The component test as a pin, folded into the existing sender test** (Opus; Codex: keep one pin). Its empty-section check is dropped: with no record fed in, it is empty by construction.
- **L7. Not taken:** skipping hashes the dApp already witnesses (exec-dapp-1's D10; it keys on the symptom); option C (the owner chose B).

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a19daa) | reject | the dropped-only fold boundary (D3, narrowed trigger L4); I1 false, I2 narrowed; F2/F3 qualified; the fake inventory; `sameFieldAddress` named; the invariant's scope sentence | raw-effects trigger (L4); the receipt wait (L5); the two public-authwit files as optional (the lane brief names them) |
| plan 1 | Opus 5.5 (Plan) | conditional approve | two more renderings in § UI impact; no receipt wait, no playground change; the probe test; the component pin folded; `signer: AztecAddress`; F6 corrected; the gate's redundant wallet-bridge line | the known limit instead of D3 (L4); dropping the public-authwit files (the lane brief names them) |
| final 1 | Codex, gpt-6.1-sol, fresh (session 01a19db7) | **approve** | L4 qualified (a request that decodes but fails to hash now forces the rebuild); L5 worded as the private execution inside `proveTx`; the structural test's probe fakes added to D5 | none |
| arc 1 r1 | Codex, gpt-6.1-sol (session 01a19dcf) | findings: 3, comments only | the decoder's comment no longer claims the dropped request's witness is what the check reads; the summary pin's comment says what it checks; six redundant comments cut | none |
| arc 1 r1 | Opus 5.5 (general-purpose) | findings: 3, comments only | the fold headers and two TSDocs name the new trigger (any decoded request); the same two comments | none |
| arc 1 r2 | Codex, resumed | **clean** | the fixes verified; no regression | none |

## Seeds (not run; orchestrator-owned)

```
/goal Phase 1 of implementations-plan/authwit-onbehalf-1/plan.md marked ✓ with its gate passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1491 with the close-out as its final commits; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/authwit-onbehalf-1 per its plan.md and the README § Post-implementation standard at c4173bb8e: run the gate, decide open questions with Codex (gpt-6.1-sol, high), open the PR, never merge, never change the window beyond § UI impact; stop once checks are green and report.
```
