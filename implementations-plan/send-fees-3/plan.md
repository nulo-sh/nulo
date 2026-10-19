---
plan: send-fees-3
tier: light
status: planned, final Codex approve; arc 1 in progress
issues: "#799 (arc 1 closes: OA-5, OA-6, OA-7)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resume; one Opus Plan leg; one fresh final Codex pass
base: origin/dev at 993b3efc
trunk: dev
post_implementation_hardening: not scheduled
---

# send-fees-3: the owner's three picks for Send's fee card (#799)

One arc, one PR against `dev`. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

The signed picks (owner, 2026-10-19, decision page 54, quoted on #799), the whole visible budget:

- **P54-02 = B** (OA-5): "P18-11's words on this path too: card 'Refused before sending'; detail 'Refused before sending' and 'Too many sends were already waiting. Nothing was sent.'"
- **P54-03 = B** (OA-6): "'You pay' as it will read: with no amount typed the row already reads 'Fee estimated after simulation' (it needs no balance, like Priority), a bar only once an amount is typed; then only the Available row leaves."
- **P54-04 = B** (OA-7): "Hide it: the bars alone; the line comes back only if the new read fails."

## Outcome & Quality Bar

For a person on Send: the fee card says what will be true, and a refusal reads the same wherever the send came from.

- A Send-made send that the waiting-sends cap refused reads exactly as an app's: card "Refused before sending"; detail "Refused before sending" / "Too many sends were already waiting. Nothing was sent." Nothing else on either surface changes.
- While the read runs, "You pay" reads as the signed words say: the line with no amount typed, a bar once one is. A failed read's line never sits over another account's bars, and returns when that read fails.
- Good enough: the method the read picks stays unknown until it lands, so the Available row may still leave (the owner's text says so).

**UI impact** (each within its signed pick; before/after pictures in the PR, Chrome 400x600, light and dark):
- Home and History card, and the transaction's detail page, for a Send-made send the cap refused: "Transaction failed" / "Stopped before broadcast" + "Your wallet caught this before reaching the network. Often balance, fees, or invalid call." → "Refused before sending" / "Refused before sending" + "Too many sends were already waiting. Nothing was sent." (P54-02).
- Send's fee card while the read runs: You pay is a bar → with no amount typed, "Fee estimated after simulation"; a bar once an amount is typed (P54-03).
- Send's fee card after a switch away from an account whose read failed: the old line above the new bars → the bars alone; the line returns if the new read fails (P54-04).

## Architecture & Implementation

**OA-5 (`failureKind`).** Add `if (error instanceof TooManyPendingError) return "too_many_pending"` to `failureKind` (`mark-failed-unless-cancelled.ts:51`), whose doc already says classified failures keep their own kind on both paths. Send's catch (`transfer-executor.ts:298`) then files the cap's refusal as `too_many_pending`, which `journal-state.ts` already renders in the signed words. No dApp record changes (recon F2).

**OA-6 (`amountTyped`).**
- `send.vue`: pass `:amountTyped="Boolean(amountTerm)"` to the card, the test `isAllowedToSend` already makes (`:317`). The estimate watcher does not change.
- `FeeSettingsCard.vue`: new Boolean prop `amountTyped` (default false; the app windows never read as pending), forwarded to the readout.
- `FeeCostReadout.vue`: while `pending`, a bar only if `amountTyped`, otherwise the line, whatever stale estimate or queue the other props hold: the bar branch becomes `estimating || (pending && amountTyped)`, and the `estimate` branch requires `!pending`.

**OA-7 (`statusNotice`).** In `FeeSettingsCard.vue`, `statusNotice` returns a failure's line only when `!readPending`. `readPending` holds only while a read for the live identity runs with nothing committed for it (`useFeeSnapshot.ts:283`); `beginRun` sets its key before the first await, and the owning run's `finally` clears it. So the line hides on a switch to another account and returns when that read fails ("init", or a degraded commit). A committed identity's background retry keeps its line. An identity whose init threw re-runs as pending on a props refresh, so its line hides until that read ends, which the pick allows.

**File map.** Product: `mark-failed-unless-cancelled.ts`, `send.vue` (one binding), `FeeSettingsCard.vue`, `FeeCostReadout.vue`. Tests: `mark-failed-unless-cancelled.test.ts`, `transfer-executor.test.ts`, `FeeCostReadout.test.ts`, `FeeSettingsCard.test.ts`, `send.test.ts`. No storage, message, schema or e2e change.

## Phases

**Phase 1 — before pictures.** On the base, before any code change, build Chrome armed (command below) and copy `dist/chrome` to `~/.cache/nulo-backlog/send-fees-3/dist-before/`. Write a throwaway capture spec and a scratch vitest config extending the smoke config, both in `~/.cache/nulo-backlog/send-fees-3/`, never in the repo. The spec sets the viewport to 400x600 and shoots each state in light and dark with `shotSend`. To hold a read, it claims a silent loopback listener with `listenClaimed` (`tests/e2e/fixtures/egress-guard.ts:162`) and arms `interceptRpc(..., { kind: "redirect", to })` for the Testnet node's origin; it stops the interception, closes its sockets and releases the claim in `finally`, before the guarded close. Each shot waits for its asserted DOM state (bars, line, interception hits), never a fixed time; the held read's timeout gives the failed line. Create account B first (`createSecondAccount` selects it), switch back to A, then open Send. States: History card and detail page of a seeded Send record refused at `queued` (kind `transfer`); Send with no amount, read held; A's failed line, then B's read held. Gate: each PNG opened and checked to show its state; `git status` clean.

**Phase 2 — OA-5.** Add the arm. Tests: `failureKind(new TooManyPendingError(), "transfer")` is `too_many_pending`, beside the existing scope-refusal control; a transfer-executor case where `acquireTransferSlot` throws `TooManyPendingError`: the journal gets `{ stage: "failed" }` with `kind: "too_many_pending"`, and `buildAndEstimate` and `proveAndSend` are never called, beside the existing `transfer`-kind control. `journal-state.test.ts:770-790` already pins the render.

**Phase 3 — OA-6.** The binding, the prop, the readout branch. Tests: `FeeCostReadout.test.ts`: pending without `amountTyped` shows the line, and no `Skeleton`, even with a stale estimate and a queued cap on the props; the existing pending test gains `amountTyped: true`. `FeeSettingsCard.test.ts`: the stub exposes `amountTyped`; the card forwards it. `send.test.ts` (add the prop to the stub's list, `:179-193`): `amountTyped` is false on an empty form, true once an amount is typed (no recipient needed), false again when the amount is cleared.

**Phase 4 — OA-7.** The condition. Tests: extend `FeeSettingsCard.test.ts:2317` so the old line is gone while B pends and stays gone after B commits; a twin where B's read throws and the "init" line returns, and one where B commits degraded and the "Retrying" line returns. Control: a committed identity whose entry is degraded keeps its line through a same-identity re-run.

**Phase 5 — after pictures and gates.** Build armed, rerun the capture spec: OA-5 with kind `too_many_pending`; OA-6 with no amount and with an amount typed; OA-7 with B pending, then B failed. Then the full gate.

**Validation gate** (phases 2-4 each, cumulative; phase 5 all of it). Load1 under 150 before any build or e2e run; one e2e run at a time in this worktree.

- `bun run lint`, `bun run typecheck:all`: exit 0. The touched test files green, then `bun run test:all`: exit 0.
- Mutation checks, never committed, each red on the new test: the arm removed (phase 2); `pending && amountTyped` back to `pending` (phase 3); `!readPending` dropped (phase 4).
- Phase 5: `bun run audit:vue` exit 0. Then, since that build disarms the dist, the armed build per browser, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>` in `apps/extension`, and `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 env -u EXTENSION_PATH bun run test:e2e --retry=0 tests/e2e/send-fee-privacy.test.ts tests/e2e/send-keyboard.test.ts tests/e2e/send-outcome-rows.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`. Pass: every file green on both browsers; wall-clock recorded. Smoke claims its guard ports in `~/.agents/ports.md` itself; `agent.sh` is the network runner and builds no smoke dist.

## Security & Adversarial Considerations

- **No new surface.** `failureKind` classifies a wallet-thrown error, the prop is a page binding, and the notice hides wallet-owned copy only. No dApp-controlled field reaches any of it; no dependency, key material or log line changes.
- **A dApp fills the lane** so Send's slot is refused: the record then says "Nothing was sent", which is true. On Send's path only the execution lane's cap throws `TooManyPendingError` (`execution-lane.ts:508`; the SDK's session cap throws the same class but never into Send's executor), during the turn, before any build (`transfer-executor.ts:345`), and "nothing sent" comes from the record's stage.
- **Hiding the line cannot enable a send.** While the read pends, the selection has no method, the card emits no settings, and `isAllowedToSend` is false.

## Assumptions

**Facts** (verified): F1-F7 in [recon.md](recon.md#facts-the-plan-rests-on). F8: `send.test.ts` stubs the card and reads its props (`:629`). F9: the arc that built the skeleton measured the 56 px shrink and wrote these asks (`archive/send-fees-ux/lessons/phase-7.md`).

**Inferences.** I1: an amount typed with no estimate to follow (no or invalid recipient, an amount over the balance, Terms not current) draws a bar that turns into the line when the read lands; how often is unmeasured. I2: the archive's pictures were 360 px wide; the brief asks 400x600, which the spec sets.

**Asks.** None open. The plan ships the plain sentence: an amount typed means a bar (D2). The eligibility reading is not shipped, so nothing waits on the owner.

## Decision ledger

- **D1, OA-5 at `failureKind`** over a local map in Send's catch: the shared classifier is where kinds already split; a map would copy it. Codex and Opus: agree.
- **D2, the letter: `Boolean(amountTerm)`.** Rejected: the estimate's own eligibility (Terms, recipient, transfer type, valid amount) as one computed the watcher also reads. Opus r1 and Codex r2 held it a reading of the signed words ("only once" as a necessary condition; the heading and the last clause); Codex r1 and the fresh final pass held it a distinction the words do not establish, the last clause describing the sponsor/no-amount open only, and pictures being no sign-off. Settled on the letter, which every leg accepts as signed and which needs no watcher change. Its cost: an amount typed with no estimate to follow draws a bar that turns into the line when the read lands (I1). The pre-existing gap Codex r1 found (an amount turning valid when the token balance lands schedules no estimate, since `balanceRaw` is no watcher source) is out of scope: an issue at close-out.
- **D3, OA-7 in the view** over clearing `failure` in `useFeeSnapshot.beginRun`: the snapshot keeps last values for every ref and the card gates what it shows on pending or committed; clearing in the composable would also change the app windows. Codex and Opus: agree.
- **D4, no e2e scenario**: each state is a function of props a component or page test drives; the pictures cover the browser. Codex and Opus: agree.
- **D5, `readPending ||` stays in FeeMethodRow's `v-if`** (Opus r1 #8 offered dropping it as redundant): it states that the Available bar shows while a read pends without leaning on what the selection holds then.

## Delivery

One arc, branch `send-fees-3-a1` off `origin/dev`, one PR, no stack (D-orch-1). Title: `feat(send): the cap's refusal reads as an app's; the fee card reads as it will` (77 chars). Body: the three picks quoted by id and text (never the page's name), the UI impact lines, what changed and why, the validation runs with outcomes, the smoke wall-clock per browser (no scenario added or changed), the pictures of each state before and after in light and dark, and `Closes #799`. Opened ready, without labels, after the gates pass and the Codex loop converges. No accessibility call is made: no live region, focus or Tab stop changes.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `175d8268`, once over the arc's diff. `code_review: off`: no `/code-review`. The Codex loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; stop at three rounds; log each in `lessons/phase-5.md`. One Opus diff review beside round 1. A fix that grows the design stops for the orchestrator. Close-out: the PR's final commits, after merging `origin/dev` and reading `index.md` and `lessons.md`: the delayed-balance issue filed (dedupe first), the Outcome, the archive move in its own commit, the index line to `archive/index.md`, STATUS.md deleted. Teardown after merge: `agent-worktree done send-fees-3 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a153bf): conditional approve, 3 findings. #1 D2 beyond the signed words, ship the letter: reopened by Opus, settled in r2 (D2). #2 the watcher omits `balanceRaw`, so the prop could promise an unscheduled estimate: withdrawn in r2 (its consequence lands after `pending` ends); the gap is filed. #3 the executor test must prove nothing was built or sent: accepted.

**Round 1, Opus Plan:** conditional approve, 8 findings. #1 F2's mechanism (no re-mark runs at all): accepted, recon rewritten. #2 D2 as a reading, with a picture: accepted. #3 the read cannot be held since the node stand-in: accepted (silent loopback redirect). #4 no `UI impact` lines: accepted. #5 keep the watcher's sources: accepted. #6 a never-committed identity re-runs as pending: accepted (OA-7 text). #7 the stub's prop list and F8's line: accepted. #8 drop `readPending ||`: not taken (D5).

**Round 2, Codex** (resume): conditional approve: D2's reading with the picture, the narrowed eligibility claim, F2's corrected explanation; all applied.

**Final pass, Codex** (fresh, gpt-6.1-sol, high, session 01a153cb): conditional approve, 2 conditions. #1 D2's eligibility reading needs the owner: resolved by shipping the letter (D2). #2 claim the capture listener with `listenClaimed`, and capture on asserted states, not a 20 s deadline: accepted (Phase 1). Watcher equivalence, OA-7's gate and OA-5 confirmed. Resume: **approve**, no new regression.

## Seeds

`/goal` (recommended): `/goal Phases 1-5 of implementations-plan/send-fees-3/plan.md are ✓, each backed by its validation gate passing in the transcript (lint, typecheck:all, test:all, the three mutation checks red, audit:vue, the three send-* smoke files green on Chrome and Firefox at retry 0 on armed builds), LESSONS_FILE=implementations-plan/send-fees-3/lessons/phase-N.md printed per phase; code_review is off and /code-review was not run; the Codex fix loop converged (a resumed pass with no new material finding, quoted); the PR exists with the pictures, opened after the loop (gh pr view output), and the close-out commit archived the plan (git show --stat).`

`/loop` (fallback): `/loop 15m Drive implementations-plan/send-fees-3 forward; never idle. Read plan.md and lessons/. If the plan directory is gone, git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/send-fees-3/plan.md: success means merged, so run agent-worktree done send-fees-3 --merged and stop; failure means delivered, so watch the PR's checks. Otherwise run the next phase and its gate, then the Post-implementation section. Never merge. The same step failing 5 times: reassess with Codex.`
