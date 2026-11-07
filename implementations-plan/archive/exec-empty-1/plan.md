---
plan: exec-empty-1
tier: light
status: completed
issues: "#1728"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex gpt-6.1-sol high audit, resumed; no Opus plan leg (light)
base: origin/dev at 24d59880f
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-07.
- **Status:** completed. Ships in the PR titled `fix(execute): refuse a no-account request with no call up front`, whose merge closes #1728 and this plan.
- **Shipped:** P120-04 A. A `from: "NO_FROM"` request with no call is refused at the default entrypoint's first shape check with `DefaultEntrypointNoCallError`; it is recorded as the request's refusal, filed `wallet_refused`, answered with the wallet's constant, and the window shows the owner's two sentences with only Reject.
- **Deviation:** a third pins fixture fed `calls: []` to reach the account lookup and got one call too (`lessons/phase-1.md`).
- **Rejected:** the Opus diff review's one Low (keep a second count guard in `resolveNoFromCall`): it needs a second caller that does not exist.
- **Lessons:** none promoted; nothing here generalizes beyond this change.
- **Known limits:** none.
- **Open items:** none.
- **Seeds retired:** the `/goal` seed in Post-implementation; there was no `/loop` seed.

# exec-empty-1: refuse a no-account request with no call, up front

A dApp can send `aztec_sendTx` with `from: "NO_FROM"` and `calls: []`. No gate refuses it, so the execute window shows a failed preview whose Try again can never succeed. This plan refuses it up front, as #1727 refuses the utility-call and several-calls shapes. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/src/` unless they name a package.

## Scope: the owner's pick, verbatim

- **P120-04 A** (decision page 120, signed 2026-11-06 23:33 UTC, no note): "Refuse it up front like the other two shapes, with the lines: 'This app asked Nulo to run nothing, with no account.' and 'There is nothing to approve.'"
- In: one typed refusal class, the early check, the window's kind and copy, one row in each pinned table, two captures. Out: every other request shape; e2e scenarios; any other copy.

## Outcome & Quality Bar

- **For whom:** a person whose app sent a request that can never run; the app, which must learn that the wallet refused.
- **Excellent:** (1) the window shows "Nulo won't send this" with the owner's two sentences and only Reject; the builder refuses at its first shape check, before any network or PXE work, once the preview is admitted as every preview is (`wallet/services/execution/service.ts:774-815`); (2) Activity files the request `wallet_refused` and the dApp gets the wallet's constant, exactly as the two sibling shapes do.
- **Good enough:** the title, the card and Reject are the siblings' own; nothing else in the window changes.

## Assumptions

**Facts** (at 24d59880f; `recon.md` has the trace):
1. No gate before `buildNoFrom` refuses an empty call list: aztec.js's schema has no minimum, the bridge parse adds none, and the scope checkers pass it on purpose (`packages/wallet-bridge/src/method-scope-checkers.ts:109`).
2. `refuseSeveralNoFromCalls` (`wallet/services/execution/tx-request-builder.ts:134-138`) refuses only `> 1`, after `assertFence` and before any network read (`:445-446`). The empty list fails later, in `resolveNoFromCall` (`:398-400`), as a plain `Error`.
3. `refusalKind` (`popup/windows/execute/refusal.ts:17-26`) classifies by `instanceof`; a plain `Error` opens the preview toast (`popup/windows/execute/index.vue:311-313`).
4. Recording, journaling and the spec read the refusal through `isDefaultEntrypointRefusal` or the `DefaultEntrypointRefusal` union (`service.ts:830`, `mark-failed-unless-cancelled.ts:49`, `wallet-sdk/queued-journal.ts:322`, `dapp-interaction/spec.ts:110`), so a class joined to both reaches all four with no edit there.
5. A class crosses the worker → popup hop only when `REBUILT_AS` lists it (`packages/extension-messaging/src/errors.ts:766`); `errors.test.ts` requires every exported `WalletError` subclass in its wire table.
6. The dispatcher hands the window `opts.from: "NO_FROM"` and `executionMode: "default_entrypoint"` (`packages/wallet-bridge/src/dispatcher.ts:504-511`); the window's preview table today feeds `opts.from: OWNER` (`popup/windows/execute/index.test.ts:1637`).

**Inferences:**
- The two quoted lines go, verbatim, into the card's one reason element under the shared title. That placement is the siblings' card, inherited by "like the other two shapes", not a placement the owner approved separately (`refusal.ts:37-38`). The captures show it.
- Undefined `exec.calls` reads as empty, as today's `?? []` reads it. A missing, null, non-array or sparse `calls` fails the upstream schema before the build (Codex probe, round 1), so this branch only matters to an internal caller.

**Asks:** none open. The one visible change is P120-04 A ([OWNER-ASKS.md](OWNER-ASKS.md)).

## Architecture & Implementation

- **Shape:** one class, `DefaultEntrypointNoCallError` (code `DEFAULT_ENTRYPOINT_NO_CALL`, constant message `"DefaultEntrypoint requires exactly 1 call, got 0"`, today's text, so the worker log reads the same). It joins the union, the predicate and `REBUILT_AS`, and `refusalKind` maps it to the new kind `"none"`.
- **Flow:** `refuseSeveralNoFromCalls` becomes `refuseNoFromCallCount`: 0 calls throws the new class, more than 1 throws `DefaultEntrypointMultiCallError`, same place. `resolveNoFromCall`'s own count check can no longer be reached, so it goes; the method takes the one call.
- **Change map:**
  - `packages/extension-messaging/src/errors.ts`: the class beside `DefaultEntrypointMultiCallError`; the union; the predicate; `REBUILT_AS`.
  - `wallet/services/execution/tx-request-builder.ts`: the header's error contract; `refuseNoFromCallCount`; the dead check in `resolveNoFromCall` removed.
  - `popup/windows/execute/refusal.ts`: `"none"` in `RefusalKind`, its `instanceof` line, `REFUSAL_REASON.none` = "This app asked Nulo to run nothing, with no account. There is nothing to approve."
  - Tests, one row each: `packages/extension-messaging/src/errors.test.ts` (wire table, two-hop table); `tx-request-builder.pins.test.ts` (the "no call keeps its plain error" half becomes typed, before any network, PXE or resolver call; the two `buildNoFrom pins` tests at `:400-426` that feed `calls: []` to reach later checks get one call, and the expired fence still wins over the empty list); `service.refusal.test.ts`; `mark-failed-unless-cancelled.test.ts`; `wallet-sdk/queued-journal.test.ts`; `wallet-sdk/error-envelope.test.ts` (direct and rethrown); `popup/windows/execute/index.test.ts` (`REASON.none` and a preview row).
- **Alternatives not taken:** (a) widen `DefaultEntrypointMultiCallError` to "not exactly one": the copy differs, and the owner's "several" is false for zero; (b) a count in the error's details: the count is the dApp's input, and the window classifies by class; (c) refuse at the bridge: the bridge serves every wallet-sdk method and has no copy, and the siblings refuse in the builder by the check the send runs.

## Security & Adversarial Considerations

- **Threat model:** a hostile or buggy dApp controls `exec` entirely. The change only moves an existing refusal earlier and types it; it adds no trust. The empty list now stops before any network or PXE work, where today it reaches node info and PXE registrations.
- **Input validation:** the class carries no dApp data (constant message, no details), so nothing the dApp sends reaches a log line or the popup through it. The dApp's answer stays `UNCLASSIFIED_ERROR_MESSAGE`.
- **Least privilege, cryptography, supply chain:** N/A: no dependency, permission, key or workflow changes.

## Decision ledger

| # | Decision | Rejected |
|---|---|---|
| D1 | A fourth sibling class with a constant message, joined to the union and predicate | alternatives (a)–(c) above |
| D2 | Kind `"none"`, parallel to `"several"`; `data-kind="none"` on the notice | `"empty"`: names the list, not the request |
| D3 | The window's preview table feeds the wire's `opts.from: "NO_FROM"` for every row | a separate test only for the new row: the table already is the copy case |
| D4 | No e2e: the class reaches the window through `errors.test.ts`'s two hops and the component table; the public-call network scenario drives the shared path | a new network scenario: no failure mode a cheaper layer misses |

## Phase 1: the refusal, its tests, the captures

Assumptions: Facts 1–6. Steps:

1. Add the class, the union member, the predicate term and the `REBUILT_AS` entry in `errors.ts`; add its rows in `errors.test.ts`.
2. Replace the early check and remove the dead count check in `tx-request-builder.ts`; update the header. In the pins test, turn the empty half typed: constructor, message, and no `getNetwork`, PXE, resolver or fee call after clearing the mocks. Give the drift test and the live half of the fence test one call; keep the fence test's ended-session half on `calls: []`.
3. Add the kind and copy in `refusal.ts`. In `index.test.ts`, add `REASON.none`, a `NO_CALL` error built with `walletErrorFromPayload`, and the preview row; feed the preview rows `{ ...send, opts: { from: "NO_FROM" }, executionMode: "default_entrypoint" }`.
4. Add the rows in `service.refusal.test.ts`, `mark-failed-unless-cancelled.test.ts`, `queued-journal.test.ts`, `error-envelope.test.ts`.
5. Prove each new row red on the base source (revert the source file, run the test, restore). Log it in `lessons/phase-1.md`.
6. Captures, Chrome, local network, proverless. Add a temporary playground button that sends `{ calls: [], authWitnesses: [], capsules: [], extraHashedArgs: [] }` with `sendOpts("NO_FROM")` (the schema requires all four), and a temporary step in `tests/e2e/network/tx-sendTx-noFrom.test.ts` that waits for `data-kind="none"` and calls `shotSend(execute, "execute-no-call-refused", "execute-op-refusal")`. Run `NULO_E2E_SHOT_DIR=~/.cache/nulo-backlog/exec-empty-1/shots NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-noFrom.test.ts`. Then `git checkout` both temporary files and copy the two frames into `screenshots/` as `execute-no-call-refused-{light,dark}.png`.

**Validation gate** (retry 0): `bun run lint`; `bun run typecheck:all`; `bun run test:all` (holds `copy-dash-ban.test.ts` and `red-text-ban.test.ts`); `bun run check:plans` after staging. Pass: every command exits 0; each new row was red on the base source; both frames show the notice with the owner's two sentences and no Confirm. Layers: lint, typecheck, unit, component; the network run is for the captures only.

## UI impact

- **Execute window, a no-account request with no call** (P120-04 A, quoted in Scope, is the sign-off). Before: "Couldn't preview authorizations. Try again." toast, Try again, Confirm open. After: "Nulo won't send this" / "This app asked Nulo to run nothing, with no account. There is nothing to approve.", only Reject.
- **Activity row and the dApp's answer** for that request. Before: Reject files the person's rejection and the dApp gets `USER_REJECTED`; Confirm builds again and files "Transaction failed". After: Reject ends the request as its recorded refusal (`dapp-interaction/service.ts:294-295`, `:680-682`): the existing "Refused before sending" row (`wallet_refused`) and the wallet's constant, as for the siblings.
- No other surface changes.

## Delivery

Single arc, one branch (`worktree-exec-empty-1`), one PR, plain `gh pr create --base dev`, ready, no label. Title: `fix(execute): refuse a no-account request with no call up front` (64 characters). Body: what changed and why, P120-04 A quoted as the sign-off, the two frames, the validation runs, "no e2e scenario added; suite wall-clock unchanged", `Closes #1728`. The close-out lands as the PR's final commits. No lanes: one phase.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at 94ac9cf3e. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2: Codex via `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, over `git diff 24d59880f...HEAD`, with the plan, the ledger, the adversarial ask and the two rules verbatim; resume with `resume-codex.sh`. Hard stop at three rounds. One Opus diff review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1.
- Then the gates once more on the final head, in order, at retry 0: `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run check:plans` after staging.
- Step 3: the Delivery above, then `gh pr checks <n> --watch` once.
- Step 4: merge `origin/dev` in first and read `index.md` and `lessons.md`; Outcome block; lessons promotion (dedupe; none expected); open items filed; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; the index line to `archive/index.md`; `bun run check:plans`.
- Step 5 is the orchestrator's: this session does not tear down the worktree or delete branches.

**Seeds** (retired at close-out): `/goal Build implementations-plan/exec-empty-1/plan.md Phase 1 until its gate is green, then run its Post-implementation section.` `/loop` none: one phase.

## Audit verdicts

**Codex plan audit, round 1** (gpt-6.1-sol, high): `conditional approve`, three findings, all verified against the tree and accepted.
1. Medium, demonstrated: the drift and fence tests in `tx-request-builder.pins.test.ts:400-426` feed `calls: []` to reach later checks, so the early refusal would red them. Folded into the change map and Phase 1 step 2.
2. Medium, demonstrated (schema probe): a literal `{ calls: [] }` fails `ExecutionPayloadSchema` on its three other arrays, so the capture would never reach the window. Folded into step 6.
3. Low, demonstrated: the preview runs behind the estimate admission (`service.ts:774-815`), so "at once" overstated it. The quality bar now says where the check runs.
- Asks: none new; the reason's placement is recorded as the siblings' inherited card. Checked and holding: a missing, null, non-array or sparse `calls` fails the upstream schema; the private resolver has one caller; no sibling registration is missed.

**Codex plan audit, round 2** (the same session, resumed): `approve`. All three folds present; no new material finding; the folds add no state, lifecycle, protocol, recovery policy or public contract; no owner ask.

**Diff review, round 1** (Codex gpt-6.1-sol, high, fresh session, over 24d59880f..0f1f5ad6d): `approve`, one Low, demonstrated: `resolveNoFromCall`'s doc comment kept a sentence about behaviour the code no longer has. Folded in ed8ae66b7 (the why stays, the history goes).
**Opus diff review** (beside round 1): `approve`, one Low, needs unsupported conditions: with the inner count check gone, a second caller that skipped `refuseNoFromCallCount` would take the first call silently. Rejected: one caller, which runs the check first, and the doc comment states the precondition. Checked and holding: only a NO_FROM empty request reaches the refusal; no site lists three siblings and misses the fourth; no test weakened; the copy is verbatim.
**Diff review, round 2** (Codex, resumed): `approve`, no findings. The loop converged in two rounds.
