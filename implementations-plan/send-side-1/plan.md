---
plan: send-side-1
tier: light (the orchestrator's spawn: one Codex audit round-trip and the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at af025cfb5
trunk: dev
status: approved; implementing arc 1
issues: "#1341"
post_implementation_hardening: not scheduled
---

## Goal

#1341, decided by the owner: after a paste-to-add on Send, From and To keep the side the person had when the new token supports it; a row pick keeps today's reset. `E` is `apps/extension`; recon in [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom:** a person on Send who set From (or To) to Public, typed an amount, and imported a token from the picker by its address.
- **Excellent:** (1) Send comes back exactly as they left it, token aside: recipient, amount and both sides, so the corner and the fee estimate are for the side they chose; (2) a row pick still starts a fresh form, as today.
- **Good enough:** every other path that changes the token (row pick, deleted token, identity change, `?tokenId=`) behaves as today.

## Assumptions

**Facts** (verified at the base):
- F1. The owner, on #1341's Decision comment (2026-10-28): "B, keep the side. After a paste-to-add, From and To stay where the person had them when the new token supports that side; a row pick keeps today's reset, since it still clears the amount."
- F2. The `activeTokenIdx` watcher (`E/src/popup/pages/send.vue:581-590`) closes the review, runs `initSendType()` and `initReceiverType()`, and clears the amount unless the new id is `keepAmountFor`, which `pickAddedToken` sets just before it writes the id (`:567-579`); the mark is cleared on every run.
- F3. `initSendType` sets From to `cacheStore.preselectedBalanceType` when the token has both transfer kinds; `initReceiverType` sets To to it when the token has both balance kinds; both then force the side by the transfer flags (`send.vue:187-215`). That Balances/Transfers split is pre-existing and stays. The preselected type is always `"private"` (recon: one writer, the unmount).
- F4. A token New token creates has all four flags: it adds only a complete interface (`NewTokenPopup.vue:210`, `isTokenComplete`), and flags derive from the stored interface at read time (`token/utils.ts:12-18`). A contract already stored comes back as stored (`token/service.ts:440-446`), and a dApp's `registerToken` stores partial interfaces (`execution/service.ts:1157-1163`). So the clamps stay on the import path.
- F5. No unit or component test pins the sides after a token change; `send.test.ts:1040` pins that a row pick clears the amount. Send's tests mount the real `SendTypesCard`, whose spans carry `data-selected`; `estimateTransferFee`'s fifth argument is the transfer type (`send.vue:370-376, 425`).
- F6. The only test that imports a token is `E/tests/e2e/network/send-picker.test.ts:70-114`; lines 103-109 wait for "0 PICK" right after the import, then flip From back to Public for "7 PICK" and the fee estimate.
- F7. `readSendView(page).origin` reads `fee-settings-card[data-origin]`, bound to `selectedSendType` (`send.vue:886`); `strip.to` reads `"public"` or `"hidden"` from To (`publish-facts.ts:107`).

**Inferences:**
- I1. Nothing else writes the sides between the pick and the next render. The writers are the two inits, the capability watcher (`send.vue:594-598`, which forces nothing on a token with both kinds) and the toggle. A row pick or `onTokenDeleted` is a separate event, and the guard at `:576` drops an import a row pick beat. One order leaves the mark stale: the import's write and a write back to the old id in one tick, so the watcher never runs and a later pick of the imported id keeps the form. No writer produces that order (both reviewers checked); it is filed as a closed known limit at close-out.
- I2. A side the old token forced is kept too: on a dApp-registered token without private transfers, From and To sit on Public, and a paste-add of a complete token keeps Public where the base resets to Private. Both reviewers doubted that F1 settled it, so it went to the owner as [OWNER-ASKS.md](OWNER-ASKS.md) ask 1, answered A (D6): the code below needs no extra check.
- I3. Firefox needs no product difference; the twin run proves it.

**Asks:** none open. Ask 1 (I2) is answered (D6); no copy and no control changes.

## Architecture & Implementation

- **Cause.** The watcher treats every token change as a fresh form. An import continues the form; `keepAmountFor` already says so for the amount. The fix widens that one mark to the sides.
- **`send.vue`, the only product file.** Rename `keepAmountFor` to `keepFormFor` (its comment: the next token watch keeps the amount and the sides for this id). `initSendType(keepSide = false)` and `initReceiverType(keepSide = false)` skip the preselected default when `keepSide` is true; their clamps run unchanged. The watcher computes `const keep = id === keepFormFor`, clears the mark, calls both inits with `keep`, and clears the amount only when `!keep`. `refetchIdentityScopedState` keeps calling them with no argument. The diff stays off the review and fee lines lane fee-race-1 edits.
- **Flow.** `pickAddedToken` sets `keepFormFor` and writes `activeTokenIdx` → the watcher keeps both sides where the token has them, and the amount → the corner, `balanceRaw`, the estimate and the strip read the kept sides.
- **Not taken.** (a) Skip both inits for an import and leave the clamp to the capability watcher, which fires when the flags differ. It works today, but the clamp on a switch would then depend on that watcher's change detection, and To's toggle (on Balances) can hold a side the transfer clamp refuses. (b) Snapshot the sides and restore them after the inits: a second copy of the support rule. (c) Write the current side into `preselectedBalanceType` before the pick: a global cache field used as a message, which the unmount must undo. (d) Split each init into a default step and a clamp step: two new functions for one caller.

## Decision ledger

- D1. Widen the existing mark rather than add a second one: one fact ("this change continues the form") gets one name.
- D2. A `keepSide` parameter on the two inits. Opus argued for (a), as no option for one caller. Codex kept the parameter: the switch handler then owns its whole invariant, and (a)'s equivalence needs old sides that satisfy the transfer flags, which To's Balances toggle does not guarantee. The parameter wins: it adapts the existing functions and adds no layer.
- D3. No test imports a token that lacks the person's side: New token does not create one (F4), the clamp is unchanged code, and the capability watcher would force the same side, so such a test would pass with the clamp deleted.
- D4. E2E: the existing import step changes, no new scenario. Before the import it puts both sides on Public; after it, it reads both with no flip, then flips From to Private for the "0 PICK" read and its capture.
- D5. Tests before code: phase 1 writes them and records their red runs on the base, so no base copy of `send.vue` is swapped in later.
- D6. The owner, on #1341's second Decision comment (2026-10-29): "A, keep Public. When Send's token was forced to Public (a dApp-registered token with public functions only) and the person paste-adds a full token, From keeps Public: the same rule as every import, From and To stay where they were when the new token supports that side." So the forced-side case keeps its side like any other import, and Codex's one open condition is met.

## Phases and gates

Commands run from the worktree root unless they `cd`. Every gate also runs `bun run lint` and `bun run typecheck:all`, exit 0. "Red first" marks a test that fails on the base and passes after the change. Commit each phase before the next.

**1. The tests, red on the base** ✓ (F1, F5-F7, D3-D5). Do not change `send.vue` in this phase.
- In `E/src/popup/pages/send.test.ts`, describe "send page — a token the picker imported", add U1, red first, a `test.each` over From/To `["public", "private"]` and `["private", "public"]`. Mount on `[TOKEN]` with `realAmountCard: true`. Set the recipient and the fee card (`SPONSOR`), click `send-from-type` and/or `send-to-type` to reach the row, and type an amount. Add a `NEW` balance row that covers the amount on both sides (`balanceAdded()`), set `getTokens` to `[TOKEN, NEW]`, then call the card's `onTokenAdded` with `NEW`. Expect `NEW` active, the amount kept, and each card's `[data-selected]` span reading the row's side. After `estimateLands()`, expect an estimate asked for `NEW.id` and `NEW.contract` with the row's transfer type (`PublicToPrivate`, `PrivateToPublic`).
- Add U2, a control: with `[TOKEN, NEW]` listed, type an amount and expect it shown. Flip both sides to Public, then set `cacheStore.activeTokenIdx = NEW.id`, as the picker's row press does. Expect both sides Private and the amount empty.
- In `send-picker.test.ts`, after line 84 add `setActiveSendType(page, "send-to-type", "public")`. Replace lines 103-109: read `readSendView(page)` and expect `origin` `"public"` and `strip.to` `"public"`. Wait for "7 PICK" and `fee-estimate`, with no flip. Then `setActiveSendType(page, "send-from-type", "private")`, wait for "0 PICK", and take the `send-amount-zero` capture. Rename the case to say the sides are kept too.
Gate: `cd apps/extension && bun run test src/popup/pages/send.test.ts`: U1's two rows fail at the side check, everything else green. Then `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/send-picker.test.ts` on Chrome: the import case reaches PICK and fails at the side check; the red counts only then. Record both reds in `STATUS.md`.

**2. Keep the sides on an import** ✓ (F2-F4, D1, D2). Change `send.vue` as above.
Failure mode the e2e step proves: the import comes back on a side the person did not choose, or the kept side does not reach the corner and the estimate. The unit test stubs the balance read and the estimate; only a real import shows the side through them. Estimate: 19 s / 21 s (one more flip than #1342's measured 18.0 s / 19.8 s).
Gate, in order (`e2e:agent` overwrites `dist`, so the smoke build comes after it):
1. `cd apps/extension && bun run test src/popup`: green, U1 included.
2. The phase 1 e2e command, then again with `NULO_E2E_BROWSER=firefox`: both green; each file's vitest time goes in `STATUS.md`.
3. For each browser: `env -u EXTENSION_PATH VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`, then `cd apps/extension && env -u EXTENSION_PATH NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- send-picker-add.test.ts send-keyboard.test.ts send-fee-privacy.test.ts token-list.test.ts --retry=0`: green.
4. `bun run test:all`: green.

## Security & Adversarial Considerations

- **Threat model:** no new input and no new boundary. The kept sides are the person's own state; the token passed New token's checks. A side the token lacks is still forced by the unchanged clamp. An interface that is complete says which functions exist, not what they do; the existing caveat for an unvalidated class (`send.vue:350`) stays the answer to that.
- **What the person could be misled by:** a kept Public From sends publicly. The toggle and the strip show it, as after a manual flip. The review sheet is not a guard here: it is required only for an exposed fee payer on a private From (`publish-facts.ts:101-111`).
- **Logging, storage, supply chain:** no new log line, no stored shape, no dependency.

## UI impact

Send's From and To after an import keep the side the person had, when the token supports it; no new copy, no new control. A row pick is unchanged. A side the old token forced is kept too. Sign-off: F1 ("B, keep the side. After a paste-to-add, From and To stay where the person had them when the new token supports that side; a row pick keeps today's reset, since it still clears the amount.") and D6 ("A, keep Public. ... From and To stay where they were when the new token supports that side."), both quoted in full in the PR body.

## Delivery

One arc, one PR, the close-out as its final commits. Branch `worktree-send-side-1`, base `dev`; merge `origin/dev` before the PR (lane fee-race-1 edits `send.vue`). Title (74 chars): `fix(send): a token imported from the picker keeps the sides the person had`. Body: what and why, F1 and D6 quoted, U1's red run and every gate's outcome, N1's time per browser before and after, each suite's CI wall-clock before and after, `Closes #1341`. Opened without labels after the Codex loop; a label only if a path filter skips a suite the change needs. Serial; no lanes.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `af025cfb5`, with:
- Loop once over the whole diff: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus review (`Agent`, `opus`, `general-purpose`) beside round 1; three rounds at most.
- `/code-review`: off.
- Close-out: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; lessons (dedupe; none expected); one closed `known-limit` issue for I1's stale-mark order (reopen on a writer of `activeTokenIdx` that can run in `pickAddedToken`'s tick); `STATUS.md` deleted; `git mv` into `archive/` in its own commit with the index line moved; `bun run check:plans`.
- Teardown once merged: `agent-worktree done send-side-1 --merged --trunk dev`; a `/loop` checks each firing, a `/goal` arms one wait after its report.

## Review verdicts

Each finding was checked against the tree; the consults are in [lessons/phase-0.md](lessons/phase-0.md).

- **Codex, round 1** (fresh, `gpt-6.1-sol`, high): conditional approve; 5 findings. Accepted: F4 overstated (a stored row comes back as stored); F3's Balances/Transfers split worded exactly; I1 bounded by the stale-mark order, filed as a known limit rather than fixed (no writer produces it); U2's amount check was vacuous without a typed amount; the Security line wrongly said the review sheet names a kept Public From. Confirmed sound: D2's parameter, U1's two mixed rows, D4's reads, the base red run if the import itself succeeds.
- **Opus, round 1** (`Plan`): conditional approve; findings accepted: the e2e `strip.to` read could not fail on the base, so the step puts To on Public first (D4); tests come first and run red on the base, so no base copy is swapped in (D5); the forced-side case is written down (I2); (a)'s stated reason was wrong and is corrected; U1 runs the import's own re-read, uses the real amount card and checks the estimate's transfer type; `token-list.test.ts` joins the smoke set (it enters Send by `?tokenId=`). Rejected: a U2 that runs after an import to pin the mark's clear, since that clear is unchanged and its one failing order is I1's. Disputed: (a) over the parameter (D2).
- **Codex, resumed** (the folded plan and D2): conditional approve. D2: keep the parameter (D2's reason). I2: not the panel's to settle, so owner ask 1. New, accepted: U1's estimate check could not pass, since `NEW` had no balance row; U1 now funds both sides and matches the estimate by `NEW`'s id and contract.
- **Codex, verify:** conditional approve, with conditions: the owner answers ask 1 before the PR merges; the ask's options balanced and A marked as proposed (applied). U1 confirmed sound; D2 settled; no other material finding.
- **Owner, 2026-10-29:** ask 1 answered A (D6), which meets Codex's open condition; the plan counts as approved.

## Seeds

```
/goal Phases 1 and 2 of implementations-plan/send-side-1/plan.md are marked ✓, each backed by its gate reported passing in the transcript (U1 red on the base first); LESSONS_FILE=implementations-plan/send-side-1/lessons/phase-N.md printed per phase; the Codex loop over the whole diff converged (a resumed pass with no new material finding quoted); one PR into dev exists, opened after the loop, carrying the close-out that archived the plan (`git show --stat` of the move); `bun run test:all` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/send-side-1 forward per its plan.md: reality check (plan.md, lessons/, git status, the PR's checks); next pending step; fast gates after each edit; the Codex loop after phase 2; then Delivery and the close-out; merging is the owner's call; once implementations-plan/archive/send-side-1/plan.md is on origin/dev, run `agent-worktree done send-side-1 --merged --trunk dev` and stop.
```
