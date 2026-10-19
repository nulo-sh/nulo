---
plan: send-estimate-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ 1531e5f9
standard: implementations-plan/README.md § Post-implementation standard, read at 175d8268
---

## Outcome

- **Date:** 2026-10-19.
- **Status:** completed. #861 closes #856; its merge into `dev` closes the plan.
- **Shipped:** a non-deep watch on the amount's validity asks for the fee when a balance update makes the typed amount sendable, on either side; the deep watch's callback moved unchanged into `requestEstimate()`. Four tests (public and real-fee-card private reproducers, a covered-refresh control, the balance-drop pin with its recovery).
- **Owner asks:** OA-1 (the fee row on a balance drop) ships as today (A); the product call is #863.
- **Dropped:** the issue's proposed source inside the deep watch (F2, P2); design A until OA-1 (D3); Codex's B″ (D3).
- **Known limits:** #862 (D4).
- **Open items:** #863 (OA-1).
- **Lessons:** none promoted. `lessons.md` is at 8191 of its 8192 B and no entry is superseded; the deep-watch rule sits at the code it guards (`send.vue`'s comment) and in F2.
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# send-estimate-1: a balance that makes the typed amount sendable asks for its fee

One issue (#856), one arc, one PR against `dev` (D-orch-1). Recon and the probe table: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1, ships as today). Gate log: `STATUS.md`.

## Outcome & Quality Bar

- **For whom**: a person on Send whose balance changes while the page is open, with an amount already typed; and the next maintainer of the estimate watchers.
- **Excellent**:
  1. Once the balance covers the typed amount, the fee is asked for and Send enables with no field touched, on the private and the public side (P1, P6).
  2. A balance refresh that leaves the amount sendable keeps the landed fee: no second estimate, no skeleton (P2, P7).
  3. Nothing else on screen moves: a balance that no longer covers a landed amount leaves the fee as today (P5, OA-1 = A).
  4. The new watch says why it sits outside the deep one, so nobody folds it back in.
- **Good enough**: the re-asks the base already makes on a same-token re-read (P3) and on a blur that regroups the text (P8) stay (D4).

## Assumptions

**Facts** (verified at `1531e5f9`; recon has the evidence):
- F1 #856 holds as written: P1 reproduces it (0 estimates, Send disabled). The public side has the same gap (P6).
- F2 The issue's getter, as a source of the existing `{ deep: true }` watch, fixes P1 and P6 but blanks the landed fee and re-asks on a balance change that leaves the amount sendable (P2). An inline getter subscribes to the computed it reads; `amountValidation` recomputes to a new object, which dirties the watch, and a deep watch then runs its callback without comparing values (`@vue/reactivity` 3.5.42, the watch `job`).
- F3 Outside `deep`, the same getter's callback runs only when the boolean flips (`hasChanged`). `balanceRaw` stops an equal balance update before `amountValidation` (P7).
- F4 A decimals change on the same token already re-asks, through `activeToken`'s new identity under the deep watch (P4); a rest alone never changes the read (recon § Mechanics). Neither is a gap.
- F5 On the base, a balance drop below a landed amount keeps the fee on screen with Send disabled until a listed field changes (P5). A sendability source added to the existing deep watch would cancel there and show "Fee estimated after simulation": a change beyond the lane's record (OA-1).
- F6 Design C, spliced in as a scratch probe: P1 and P6 ask once with the typed amount (6 000 000, 4 000 000 base units) and enable Send; P2 keeps the fee; P5 keeps it with no cancel; an edit while unsendable cancels and the later rise asks again; P4 and typing are unchanged; the file's 86 tests pass.

**Inferences**:
- I1 The second watch adds no cancel path and no state: it calls the existing handler, which re-checks every gate, and Vue disposes it with the component's scope.
- I2 A typed flip into validity schedules twice in one flush; the engine replaces a token that has not started without a remote cancel (`cancelOwnedRemoteFor`), so one RPC follows.

**Asks**: A-1 → OA-1 (P5). Ships as today; the swap on a B answer is D3.

## Architecture & Implementation

- **Change** (`apps/extension/src/popup/pages/send.vue`): move the deep watch's callback body, unchanged, into `function requestEstimate()` just above it; the deep watch passes `requestEstimate`. Below it add `watch(() => amountValidation.value.valid, (valid) => { if (valid) requestEstimate() })`, not deep, with one comment: the balance and decimals reach validity with no listed field changing; it stays outside the deep watch, where reading `amountValidation` would re-ask on every balance refresh.
- **Flow**: balance event → `balanceRaw` → `amountValidation` → the getter's boolean; unchanged or turned false: nothing; turned true: `requestEstimate()` asks with the typed amount, or cancels on a gate that still fails.
- **Not taken**: the issue's getter in the deep watch (F2, P2); `balanceRaw` as a source (re-asks on every sendable balance change); a `sendableAmount` computed in a second watch (Codex's B″: also fires on each valid keystroke, two schedules per key); one value-stable source in the deep watch (design A: changes P5, OA-1); a computed that remembers the last sendable value (an edit while unsendable cancels, and the rise back to the same value fires nothing: #856 again); dropping `deep: true` or replacing `amountTerm` (change when other inputs re-ask; outside #856).

## Phase 1: becoming sendable asks (#856) ✓

1. In `send.test.ts`, move `lastClient` and `balanceUpdated` from the "token card while the tokens load" describe to file scope.
2. Add a describe `send page — the estimate follows the amount the balance covers` to `send.test.ts`:
   - T1 public side (`send-from-type` click): 4 typed over a public 3 asks nothing; public → 6 asks once with `4_000_000n` and enables Send.
   - T2 control: 1.5 landed; private 5 → 8: the amount card's `data-balance` reads `"8"`, `feeEstimate` is kept right after the event, one estimate after `estimateLands()`, Send enabled.
   - T3 P5 as today: 1.5 landed; private 5 → 1: `data-balance` `"1"`, `cancelEstimate` not called, `feeEstimate` kept, Send disabled. Then type "1.50": the fee clears. Then private → 5: a second estimate with `1_500_000n`, Send enabled.
3. Add to `send.integration.test.ts`'s "Confirm waits for the current input's estimate" describe, with the real fee card under `FUNDING["no gas, a sponsor"]`: T4 private side, 6 typed over 5 asks nothing and leaves Send off; private → 10 asks once with `6_000_000n` and enables Send.
4. Run T1, T3 and T4 against the base `send.vue` (`git show 1531e5f9:apps/extension/src/popup/pages/send.vue`): all red. Then apply the change.

**Validation gate**
- `cd apps/extension && bun --bun vitest run src/popup/pages/send.test.ts src/popup/pages/send.integration.test.ts`: T1, T3 and T4 red on the base `send.vue`, every test green on the head.
- Scratch runs logged in `lessons/phase-1.md`: T2 red with the issue's getter added to the deep watch; T3 red with design A.
- From the root: `bun run audit:vue && bun run test:all`: exit 0.
- Smoke, load1 < 150 first. Per browser: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>` after `audit:vue` (its build disarms `dist`), then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- tests/e2e/send-fee-privacy.test.ts tests/e2e/send-keyboard.test.ts tests/e2e/send-outcome-rows.test.ts --retry=0`: green on Chrome and Firefox, wall-clock recorded.
- Layers: lint, typecheck, unit, component, build, smoke e2e. No network e2e: no node behaviour changes, and only the unit layer can time a balance event against a typed amount.

## Security & Adversarial Considerations

- **Surface**: none new. Balance events come from the wallet's own service worker; no dApp input reaches either watch.
- **Nothing goes out on an unseen fee**: `isAllowedToSend` and `canSubmitNow` still require `amountValidation.valid`; an ordinary send needs a landed estimate, a queued self-paid send the cap the card shows, a queue under Nulo's sponsor charges nothing. The change only adds a trigger.
- **Load**: each observed false → true flip of the amount's validity can schedule an estimate; the existing debounce and cancellation coalesce bursts, but repeated crossings (an incoming credit, then a projection that drops it after a pruned block, then a replacement credit) may cause repeated simulations. T2 pins that a refresh leaving the amount sendable asks nothing. No limiter is added: no path to sustained crossings is shown.
- Crypto, privilege and supply chain: not touched; no dependency added.

## UI impact

- **Send, fee row and Send button**: the lane's record, quoted: "None by design: a valid form gets its estimate, as it already does when any listed field changes." After: the balance covering the typed amount brings the fee and enables Send (P1, P6).
- **Send, fee row on a balance drop below a landed amount**: unchanged (OA-1, ships A).
- No copy, layout, tooltip or focus change.

## Decision ledger

- D1 The issue's getter is right but must sit outside the deep watch (F2, F3). Codex and Opus agree.
- D2 `amountTerm` stays a source: typing re-asks exactly as today.
- D3 What ships now for P5 is A, as today, through the one-way watch (both legs; the panel's record of a visible change beyond the budget). Codex proposed B″ on `sendableAmount`; Opus's boolean form was taken: no new computed, no second schedule per valid keystroke, and decimals already re-ask (F4). On OA-1 = B, one commit swaps to design A: delete the second watch, add `computed(() => amountValidation.value.valid)` as a deep-watch source, flip T3; the PR then quotes the owner's sign-off and attaches a screenshot.
- D4 P3 and P8 (re-asks on an unchanged question) are a known limit: a redundant estimate and a brief skeleton, nothing sent, nothing stuck. Filed as #862 (closed, `known-limit`); reopens on a report of the fee row flickering after a blur or a token event.
- D5 T4 sits in the integration file so the real card's sponsor re-check, armed by `feeTxShape`'s change on the flip, runs under it (Opus 5); T1's public twin stays in `send.test.ts`.
- D6 Deviation at close-out: the deep-watch rule is not promoted to `lessons.md`, which is at its budget with no superseded entry (Outcome).

## Audit verdicts

- Codex (gpt-6.1-sol, high), round 1: conditional approve. Accepted: ship P5 as today (D3); state the Vue rule precisely (F2); queue mode in the fee invariant and a qualified load claim (Security); pin the shipped P5 with an edit-then-recover tail (T3); the smoke gate builds armed first. No finding rejected.
- Opus 5.5 (Plan), round 1: conditional approve. Accepted: the boolean watch outside `deep` (D3); criterion 4 reworded; balance witnesses and `estimateLands()` in T2/T3; T3 unconditional; T4 on the real card (D5); asserted amounts; `audit:vue` in the gate; the dangling lessons reference dropped. No finding rejected.
- Codex, final pass (same session, resumed): conditional approve, conditions: qualify the load claim (applied: Security § Load, with Codex's pruned-credit path); F5 narrowed to a source in the deep watch (applied). It found no path the boolean watch misses against B″ and traced the account switch: both watches may schedule in one flush, before any RPC starts, which is harmless. Re-read after the fixes: **approve**.
- Fix loop, round 1 (Codex gpt-6.1-sol, high, fresh session `01a154be`, over `origin/dev...HEAD`): clean, no material findings. Opus 5.5 diff review beside it: clean; its one optional nit (the new comment's last clause nearly restates `if (valid)`) not taken: Codex judged the comment worth its space, and T3 pins the unsendable side. The loop converged in one round.

## Delivery

- #861 from `send-estimate-1-a1` (off `origin/dev`, this plan cherry-picked) against `dev`: `fix(send): a balance that covers the typed amount asks for its fee` (66 characters). Body: what changed and why, the probe table, the gate runs, both browsers' smoke wall-clock (no e2e scenario added), OA-1 shipped as today, `Closes #856`. Opened without labels, ready, after the Codex loop converges.
- The close-out lands as the PR's final commits.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `175d8268`. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2 runs once over the arc's diff from its merge base: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three rounds. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1.
- Step 3: the PR (Delivery), then `gh pr checks <n> --watch`.
- Step 4, the close-out, as the PR's final commits: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome block; promote the deep-watch rule (F2) to `lessons.md`, deduped; file D4's known limit; `STATUS.md` deleted; `git mv` into `archive/` in its own commit, the index line moved; `bun run check:plans` green after staging.
- Step 5, after the merge: `agent-worktree done send-estimate-1 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/send-estimate-1/plan.md` succeeds.

| Where open work lives | Home |
|---|---|
| Work inside the arc | this plan and its PR |
| A bug, gap or deferred refactor that outlives the plan | a GitHub issue with a `Record` link |
| A product call, or a wait outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft advisory, recorded here as "tracked privately" |
| A path needing unsupported conditions, or a consequence that does not matter | a closed `known-limit` issue |

## Seeds

`/goal` (recommended): `implementations-plan/send-estimate-1/plan.md is done: Phase 1 marked ✓, its gate reported passing in the transcript (T1, T3, T4 red on the base send.vue and green on the head; T2 red under the issue's getter in the deep watch; audit:vue and test:all exit 0; smoke green on Chrome and Firefox); LESSONS_FILE=implementations-plan/send-estimate-1/lessons/phase-1.md printed; the Codex fix loop converged, quoted; the PR exists against dev, opened after the loop, with gh pr view output; the close-out's archive move shown with git show --stat.`

`/loop 15m Drive implementations-plan/send-estimate-1 forward per its plan.md (read it and lessons/ first; plan.md is the state). Run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. Phase 1 is green only when its gate passes as written. Then the Post-implementation loop, the PR against dev, the close-out, watch checks, report and stop. Never merge.`
