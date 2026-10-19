---
plan: ui-picks-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 60fde7e7
trunk: dev
post_implementation_hardening: not scheduled
status: completed 2026-10-19; delivered in #877
---

## Outcome

- **Date:** 2026-10-19.
- **Status:** completed. #877 closes #870, #863 and #746; its merge into `dev` closes the plan.
- **Shipped:** Send's amount card says "More than your balance" under an amount above a balance the wallet read (P64-02 B), last in the card, `role="alert"`, with `aria-invalid` and `aria-describedby` on the shown input (D5); a missing or unreadable balance is `balanceUnknown`, and a row never synced shows no line (D3). A balance falling below the amount clears the fee row to "Fee estimated after simulation" and cancels an estimate still running (P64-01 B, D6). The restore warning's held sentence ends "Turn on Developer Mode in Settings to add a network." (P61-03 B). Pictures in `screenshots/`.
- **Owner asks:** OA-1 to OA-5 ship in their "what ships now" form ([OWNER-ASKS.md](OWNER-ASKS.md)); #877 stays a draft until the owner has seen the line and the asks, so a different answer amends it before the merge.
- **Dropped:** none.
- **Known limits:** none.
- **Open items:** none.
- **Lessons:** none promoted; the capture method and the two-held restore's smoke fallback are in [lessons/phase-4.md](lessons/phase-4.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# ui-picks-1: an amount over the balance says so, its fee row resets, the restore warning names Developer Mode

One arc, one draft PR against `dev`: #870 (P64-02 B), #863 (P64-01 B), #746 (P61-03 B). Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md) (OA-1 to OA-5; each ships in its "what ships now" form). Consults: [`lessons/phase-0.md`](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom**: a person on Send whose typed amount is more than they hold, typed or because the balance fell while the page was open; a person whose restore held an imported account for a network they cannot add yet.
- **Excellent**: (1) the same amount over the same balance shows the same card, line and fee row however it was reached, and no fee for an amount that cannot be sent stays on screen or lands late; (2) the line appears only when a loaded balance is below the amount, and a screen reader hears it and finds it from the field; (3) the restore warning tells the person the one step they are missing.
- **Good enough**: no other Send copy, no other reason gets a line, no new e2e scenario.

## Assumptions

**Facts** (at `60fde7e7`; `recon.md` has the citations)
1. `validateSendAmount` returns `exceedsBalance` for an amount over the balance and also for a balance that is missing or not digits; only `send.vue` reads it.
2. Tokens are read per profile and chain, balances per account (`send.vue:131,685`), and an identity change clears neither `amountTerm` nor, when the token is in the new list, `activeTokenIdx` (`:658-714`). So an amount typed on one account stays typed on another account whose balance row is missing: today's reason is then `exceedsBalance`.
3. The inline field-error precedent is `body` in `red` with `role="alert"` (six screens); `body` is 12 px; red is 3.56:1 on the light `--app-bg`, under AA's 4.5:1, and 5.13:1 on dark.
4. The one-way validity watch (`send.vue:631-636`) is why a balance drop leaves a landed fee; `send-estimate-1` D3 named the B swap, and its F2 and F3 state the Vue 3.5.42 rule that makes a getter the wrong source and a `computed` boolean the right one.
5. `cancel` aborts the flight, remote-cancels the started and the landed token, and makes a late answer stale (`fee-estimation-engine.ts:93-111`).
6. The held sentence is built once (`restore-warning.ts:27-38`) and appears in both forms of the warning; Settings names the toggle "Developer Mode".

**Claims that did not hold**: none. #870, #863 and #746 hold as written; #863's possible fix is the archived D3 swap.

**Inferences**
- I1. A `computed` boolean in the deep watch's sources dirties the watch only when it flips, so `send.test.ts:680` (a covered balance change asks nothing) stays green. Both legs checked it on the installed 3.5.42 (the job returns on `!effect.dirty`; `refreshComputed` bumps the version only on `hasChanged`); Codex reproduced it in memory. Phase 2's gate proves it.
- I2. The pick names no condition, so the Developer Mode sentence shows whatever the toggle's state; a restore skips the toggle (Fact 6), so it keeps the receiving device's current value, and a person with Developer Mode on still reads the sentence (OA-5).

**Asks**: none open. OA-1 (colour), OA-2 (beside the decimals hint), OA-3 (USD mode), OA-4 (a zero balance) and OA-5 (Developer Mode already on) ship in their "what ships now" form.

## Architecture & Implementation

**File-level change map** (paths under `apps/extension/src/`)
| File | Change | Issue |
|---|---|---|
| `popup/pages/send-amount.ts` (+ test) | new reason `balanceUnknown` for a missing or non-digit balance (D3) | #870 |
| `components/composite/send/AmountCard.vue` (+ test) | prop `exceedsBalance`; the line after the hint chain; `aria-invalid`, `aria-describedby` on the shown input (D4, D5) | #870 |
| `popup/pages/send.vue` (+ `send.test.ts`) | passes `exceedsBalance` (D2); `amountSendable` joins the deep watch, the one-way watch goes (D6) | #870, #863 |
| `components/composite/import/restore-warning.ts` (+ test), `ImportFullBackupForm.test.ts` | the Developer Mode sentence (D7) | #746 |

**Decision ledger**
- D1. One arc, one PR from `ui-picks-1-a1` (cut from `origin/dev`, this plan's commit cherry-picked) to `dev`, opened as a draft: the owner sees #870's pictures first. The close-out ships as its final commits (D-orch-1).
- D2 (#870, who decides). `send.vue` passes `:exceedsBalance="amountValidation.reason === 'exceedsBalance'"`; the card only draws. Rejected: the card comparing `modelRaw` with `balanceRawByType` (a second copy of the gate the page calls its single source of truth); handing the card the whole validation (surface for one caller).
- D3 (#870, the reason's cause). `exceedsBalance` today also means "balance unknown", so Fact 2's path would say "More than your balance" while no balance shows. Path: amount typed on account A, switch to account B with no balance row for the token, the token list lands with no balance (plausible but unverified; Phase 1's test makes it demonstrated). Fix at the cause: the validator returns `balanceUnknown` there, and `exceedsBalance` means a loaded balance below the amount. `.valid` is unchanged for every input. The page also passes the line only for a row synced once (`updatedAt !== 0`): a new account's row holds a zero placeholder until its first sync, which the token card draws as loading (found in the review loop; a restored row, also `updatedAt: 0`, shows no line until it syncs, with Confirm off as before).
- D4 (#870, the form). `<Text variant="body" color="red">` (the precedent, Fact 3) with `More than your balance`, testid `send-amount-over-balance`, `padding-top: 4px` like the hints, placed after the hint chain so nothing that shows today moves. It follows the token amount that sends: in USD mode it changes when the conversion lands (OA-3), and it shows under the disabled field when the balance fell to zero (OA-4). Contrast: OA-1. Beside the decimals hint: OA-2.
- D5 (accessibility, decided under the owner's 2026-10-19 delegation). The line carries `role="alert"`, the field-error convention, so its insertion is announced; the shown input binds `:aria-invalid="exceedsBalance"` (`"true"`/`"false"`, as `Input.vue`) and `aria-describedby` = the line's `useId()` id only while it shows. No tab stop, no focus change.
- D6 (#863). `const amountSendable = computed(() => amountValidation.value.valid)` joins the deep watch's sources; the one-way watch and its comment go; the deep watch's comment says the amount's validity is a source, read through a boolean `computed` because `amountValidation` is a new object per recompute (the archived F2). A drop below the amount then runs `requestEstimate`, whose invalid branch cancels (Fact 5): the row reads "Fee estimated after simulation" and a late answer never lands. A typed flip into validity now schedules once, not twice.
- D7 (#746). `heldAccountsText` ends with " Turn on Developer Mode in Settings to add a network.", verbatim, in both numbers and both forms of the warning (I2). #746 closes: every other ask on it is answered and shipped.
- D8 (tests, no e2e). Unit and component tests prove each path, each never-happens assertion beside a success control; Phase 2 reads the fee row's exact text through the real fee card and readout. No e2e scenario: no path needs a browser to be proven, and the pictures show the result.
- D9 (gate reruns). One rerun only for a red diagnosed as environmental (host load, a sandbox boot); a product race is a failed gate, never rerun into green.

## Security & Adversarial Considerations

- No new input crosses a trust boundary. The line is a fixed string driven by a boolean from the existing gate; Confirm's gate (`isAllowedToSend`, `canSubmitNow`) is unchanged, so nothing goes out on an amount over the balance or on an unseen fee.
- D6 adds a cancel on a validity drop and removes a duplicate schedule: no new RPC, state or lifecycle. A balance oscillating across the amount can re-ask on each rise, as today (send-estimate-1's load note); the debounce coalesces bursts.
- The restore sentence is fixed text; the held names stay cleaned and capped (`restore-warning.ts:13-28`). No log, storage, permission, crypto, dependency or CI change.

## Arc 1

### Phase 1: #870, the line under the amount ✓

1. Write the tests first and run them red on base: `send-amount.test.ts` (flip `:121` and `:128`: a missing and a non-digit balance return `balanceUnknown`; `:114` stays `exceedsBalance`); `AmountCard.test.ts` (TST, 6 decimals, `balanceRawByType: "500000000"`, 600 typed: with `exceedsBalance` the line reads exactly `More than your balance`, has `role="alert"`, and the input has `aria-invalid="true"` and `aria-describedby` naming the line's id; the control, 400 typed without it, has no line, `aria-invalid="false"`, no `aria-describedby`; the USD input carries the same wiring; a clamped amount over the balance shows the hint, then the line); `send.test.ts` with `realAmountCard` (6 typed over private 5 shows the line, and private 10 removes it; Fact 2's account switch to an account with no balance row keeps the amount and shows no line, then that account's private 1 lands and the line shows).
2. Apply D3, D2, D4 and D5.

**Gate**: `cd apps/extension && bun --bun vitest run src/popup/pages/send-amount.test.ts src/components/composite/send src/popup/pages/send.test.ts src/utils/copy-dash-ban.test.ts src/utils/type-role-ban.test.ts`; root `bun run lint`, `bun run typecheck:all`. Pass: exit 0; step 1's new tests red on base; the account switch's no-line step also red with D3 reverted. Layers: lint, typecheck, unit, component.

### Phase 2: #863, the fee row ✓

1. Tests first. In `send.test.ts`: flip `:695` to "a balance falling below a landed amount clears the fee and stops its estimate; …": after the drop `cancelEstimate` is called once with the landed estimate's token, `fee(w)` is null, the fee card's `isEstimating` is false and Send is disabled; "1.50" asks nothing; private 5 asks with `1_500_000n` and enables Send. New: an estimate whose RPC started (`estimateTransferFee` called, its answer held) when the balance drops is remote-cancelled with that call's token (`calls[0][8]`), and its answer, released after, leaves `fee(w)` null; success control: private 5 asks again and that answer lands as `fee(w)`. In `send.integration.test.ts`, a `realFeeRow` option (like `realTokenCard`: `FeeCostReadout: false`) and one test: 6 typed over private 5 reads exactly "Fee estimated after simulation"; 1.5 landed shows the fee (`fee-estimate`), then private 1 reads exactly the same hint with no `fee-estimate`.
2. Apply D6.

**Gate**: `cd apps/extension && bun --bun vitest run src/popup/pages/send.test.ts src/popup/pages/send.integration.test.ts src/composables/useFeeEstimation.test.ts`; root `bun run lint`, `bun run typecheck:all`. Pass: exit 0; the flipped and new tests red on base (the success controls green); `:680` and `send.integration.test.ts:897` green unchanged (I1). Layers: lint, typecheck, unit, component.

### Phase 3: #746, the restore sentence ✓

1. Update the six held rows in `restore-warning.test.ts` and `ImportFullBackupForm.test.ts:178-180` to the exact new strings; run them red on base.
2. Apply D7.

**Gate**: `cd apps/extension && bun --bun vitest run src/components/composite/import src/utils/copy-dash-ban.test.ts`. Pass: exit 0; step 1 red on base. Layers: unit, component.

### Phase 4: pictures and the arc gate (after the review loop, on the final head) ✓

Warning: load1 must be under 150 before every build and e2e run; poll for it inside one tool call. Never commit a scratch spec; never run two e2e runs in this worktree at once; retry 0; reruns per D9.

1. From the root: `bun run audit:vue`, `bun run test:all`, `bun run check:plans`.
2. Smoke, per browser `<b>`: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<b>`, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- tests/e2e/send-keyboard.test.ts tests/e2e/send-fee-privacy.test.ts tests/e2e/send-outcome-rows.test.ts tests/e2e/restore-outcome.test.ts tests/e2e/backup-imported-account.test.ts --retry=0`.
3. Network and pictures, Chrome: two scratch specs copied into `tests/e2e/network/` for the run (the shots-p64 Send spec; the copy-polish-1 restore spec with one held account and with two from two donors), each setting 400×600 and asserting `innerWidth`/`innerHeight` before a frame. `NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/send-amount-clamp.test.ts tests/e2e/network/send-amount-exact.test.ts tests/e2e/network/fiat-send.test.ts tests/e2e/network/transfers.test.ts <the two scratch specs> --retry=0`. Frames, light and dark: a fresh Send with 500 TST and 600 typed; the first page after its landed 600's balance fell to 500; a clamped amount over the balance (OA-2); the same 600 with From switched to the empty private side (OA-4); the restore warning, one held account and two. The restore spec has run only as a smoke spec (copy-polish-1): if the network harness refuses it for a harness reason, run it after step 2's armed build with `test:e2e` and record the deviation.
4. Firefox, the same command with `NULO_E2E_BROWSER=firefox`, `send-amount-clamp` and the Send scratch spec only: one light frame of the line.
5. Commit the frames under `implementations-plan/ui-picks-1/screenshots/`, copy them to `~/.cache/nulo-backlog/ui-picks-1/shots/`, record each frame's rendered text in `lessons/phase-4.md`.

**Gate**: every command exits 0 (D9); each frame shows the state its name says; the line's frames show Confirm disabled and the fee row's hint. Layers: lint, typecheck, unit, component, build, smoke e2e, network e2e.

## UI impact

- **Send, the amount card**: P64-02 B, "A line under the amount: 'More than your balance'." Owner note: "You owe me a screenshot of how this would look." The line, last in the card; pictures light and dark, Chrome, and Firefox light.
- **Send, the fee row**: P64-01 B, "Read as if typed: 'Fee estimated after simulation' at once, and an estimate still running for that amount stops." Pictures of the row after a drop.
- **The restore warning**: P61-03 B, "Add 'Turn on Developer Mode in Settings to add a network.'" Pictures, one held account and two.
- Nothing else changes; OA-1 to OA-5 record the line's colour, its place beside the decimals hint, its timing in USD mode, its showing at a zero balance, and the sentence with Developer Mode already on.

## Issues

| Issue | Arc | Phase | Closed by |
|---|---|---|---|
| #870 | 1 | 1 | `Closes #870` |
| #863 | 1 | 2 | `Closes #863` |
| #746 | 1 | 3 | `Closes #746`: OA-2 shipped in #853, OA-5 in #805, the rest as shipped |

## Delivery

`ui-picks-1-a1` → `dev`, draft. Title (92 chars, lower-case for `subject-case`): `fix(send): say an amount is over the balance and clear its fee; restore names developer mode`. Body: what changed and why; a "Sign-off" section quoting P64-02 B (with the owner's note), P64-01 B and P61-03 B by id and text; the pictures by blob URL at the pinned commit; D5 stated as an accessibility call under the owner's 2026-10-19 delegation; OA-1 and OA-2; the validation runs with outcomes; no e2e scenario added, so no suite's wall-clock moves; the #746 line; `Closes #870`, `Closes #863`, `Closes #746`, one per line; ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Merge `origin/dev` first; no labels at creation; add `e2e:extension-smoke` or `e2e:extension-network` afterwards only if the path filter skips one. Leaves draft only on the orchestrator's word.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `60fde7e7`. Specific to this plan:
- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff origin/dev...HEAD` after Phase 3, before Phase 4: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/ui-picks-1/`; one Opus review (`general-purpose`) alongside round 1; hard stop at three rounds; rounds in `lessons/phase-4.md` and the table below.
- Approval boundary: any other copy, any other reason's line, a layout change beyond the line, or a committed e2e scenario is a plan change and stops for the orchestrator.
- Close-out (the PR's final commits): Outcome block; `lessons.md` promotes nothing unless a retirement pays for it; `STATUS.md` deleted; `git mv` to `archive/` in its own commit, its index line to `archive/index.md`. Teardown after the merge: slug `ui-picks-1`, trunk `dev`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| 1 | Codex, gpt-6.1-sol | conditional approve | OA-3 and OA-4 recorded; the two-paths stub test replaced by the real fee row's exact text (`realFeeRow`); I2 corrected; reruns only for an environmental red (D9) | a component witness for OA-3's overlap (the card trusts the prop; the overlap is page timing, recorded as traced) |
| 1 | Opus 5.5 lens | conditional approve | the stub's missing `isQueued` (same fix as Codex 2); the in-flight test's success control and started-call token; OA-3, OA-4 (with a frame), OA-5; I2; the restore spec's harness fallback; the account switch's control tail; `copy-dash-ban` in Phase 3's gate; the redundant validator row dropped | none |
| 2 | Codex, resumed | approve | round 1's fixes verified; no remaining finding | none |
| impl 1 | Codex, gpt-6.1-sol | approve | one redundant fixture comment removed | none |
| impl 1 | Opus 5.5 review | approve with changes | the line gated on a synced row (`updatedAt !== 0`, D3), with a placeholder step and its success control in the account-switch test; one `balanceUpdated()` helper in the integration file; the stubs declare `exceedsBalance` | none |
| impl 2 | Codex, resumed | approve | the fixes verified; no new finding | none |

## Seeds

```
/goal Arc 1 of implementations-plan/ui-picks-1/plan.md (Phases 1-4) marked ✓, each backed by its gate passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged with a resumed pass quoting no new material finding; one draft PR from ui-picks-1-a1 to dev closing #870, #863 and #746, with the pictures; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/ui-picks-1 forward per its plan.md and the README § Post-implementation standard at 60fde7e7: reality-check plan.md and lessons/, run the next phase's gate, rebuild before every smoke run, retry 0, decide open questions with Codex (gpt-6.1-sol, high), never merge, never widen scope; stop once the draft PR's checks are green and report.
```
