---
plan: naming-copy-1
tier: light (the orchestrator's spawn: one Codex audit round-trip and the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 0a659726c
trunk: dev
status: completed (delivered in #1332, awaiting merge)
issues: "#1328"
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-28. **Status:** completed; delivered in #1332, which closes #1328 when it merges.
- **Shipped:** `uncheckedCallsLine` in `call-surface.ts`; the summary's one caption line under the numbered calls, in the owner's four forms, testid `execute-op-summary-unchecked`; the per-row ". Named by the app." suffix removed; its unit table and component cases, each positive one red on the base and each absence check red on a mutant; the multicall spec's shot now waits for the decodes and asserts the line; light and dark captures in `screenshots/`.
- **Dispositions:** the base capture pair is not committed (D8: it pictures pending rows, not the old suffix). Opus's "rerun the capture until decoded" rejected (D6). One unrelated red on the final head, `profile-chaos-model.test.ts` timing out near its 5 s default under host load, is #1327's, which this plan neither owns nor touches.
- **Lessons:** the capture race is the existing `lessons.md` line "match screenshot state exactly"; its technique went to the `e2e-testing` skill's `NULO_E2E_SHOT_DIR` row.
- **Known limits:** none. **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` seeds below are a record, not instructions.

## Goal

#1328: the approval window's summary drops the per-call ". Named by the app." suffix and states once, under the numbered calls, which calls Nulo cannot read and why. One arc, size S. `X` is `apps/extension/src/popup/windows/execute`; recon in [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom:** a person approving a dApp transaction in the 360 px approval window, reading "What this does" before Confirm.
- **Excellent:** (1) one sentence, at most once per transaction, names exactly the calls Nulo decoded but did not read as a transfer or mint on a listed token, by the numbers the list shows, in the owner's exact words; (2) it never appears when every call is read, never on an authorization, and follows the window as decodes and the token list land.
- **Good enough:** the "Reading arguments…", unreadable and "Labels from the contract" lines, the glossary and the decoder stay as they are.

## Assumptions

**Facts** (verified at `0a659726c`):
- F1. The mark renders in one place, `X/SendTxSummary.vue:73`, on a row whose `surface.kind === "decoded"`; its `row.amount` guard is redundant, since `transfer` and `mint` rows always carry an amount (`:35`).
- F2. `callSurface` (`X/call-surface.ts:137-152`) returns `transfer`/`mint` only on a listed token whose call corroborates the vocabulary; every other decode is `decoded` (with `labels: "unchecked"` on a listed token's uncorroborated claim); no decode yet is `pending`; a failed one is `raw`.
- F3. The decoder keeps no provenance (`call-decoder.ts:1-5`). A Fee Juice claim (`claim_and_end_setup` on `FEE_JUICE_CONTRACT`, `0x…03`, `packages/wallet-bridge/src/fee-payer.ts:14-16`) decodes through the bundled artifact (`aztec-runtime/src/pxe/artifact-catalog.ts:37`) to `decoded`, titled "Claim Fee Juice" (`utils/tx-enrichment.ts:18-24`), so it counts. The mockup's `0x…0005` is not that address.
- F4. Authorizations render from a separate prop (`authwits`) in their own `<ul>` (`SendTxSummary.vue:103-130`); the sentence reads `calls` only.
- F5. No e2e file names `execute-op-call-named` or "Named by the app"; the only readers are `X/OperationCard.summary.test.ts:3,99,311` (grep outside `archive/`). `tx-transfer-row.test.ts:88` reads the row head with `/^Transfer \(public\) on /`, which the change leaves true. The type-role inventories key `SendTxSummary.vue` on its `AddressDisplay` sites (`apps/extension/scripts/type-roles/identifier-sites.expected.json:1345-1408`), whose branches the change leaves as they are.
- F6. `decodedCalls` arrives as one batch (`OperationCard.vue:130-131`): calls are all `pending` or none are.
- F7. The fee-raised window mounts the same `OperationCard` (`popup/windows/fee/index.vue:258`), whose header says "The request reads as it did at approval"; the change reaches it by construction.
- F8. The advice line ("Check what the app says…") follows the `<ol>` when a call is `raw` (`SendTxSummary.vue:100`, `OperationCard.vue:242-253`); `afterTheCalls` in the summary test asserts it is the list's next sibling.

**Inferences:**
- I1. A wrapped 11 px caption needs the summary's other wrapped lines' `height="130"` (`Text` defaults to `lh--100`); Phase 2's captures check it.
- I2. `tx-sendTx-multicall.test.ts` sends three, then seven, playground transfers on a token its fixture never lists, so once decoded each row is `decoded` and the line reads "…what these calls do." Its shot does not wait for the decode: a capture run at `0a659726c` (Chrome, both cases, `lessons/phase-0.md`) pictured every row as "Reading arguments…". Demonstrated.

**Asks:** none open. The copy, the placement and the role are the owner's (UI impact); the rest is the panel's (Decision ledger).

## Architecture & Implementation

- **Helper** in `X/call-surface.ts`, beside the window's other copy (`RAW_TITLE`, `RAW_ADVICE`, `LABELS_TITLE`): `uncheckedCallsLine(surfaces: readonly CallSurface[]): string | undefined`. It takes the 1-based place of every `decoded` surface; none gives `undefined`. All of them gives "this call does" (one call) or "these calls do"; one of several gives "call N does"; more gives "calls a, b and c do", joined by hand (`Intl.ListFormat`'s `en` puts a comma before "and"). Each form is `"Nulo can only check transfers and mints of tokens in your list, so it can't say what " + form + "."`.
- **`X/SendTxSummary.vue`**: delete the `v-else-if="row.surface.kind === 'decoded'"` branch of the row head; add `const uncheckedLine = computed(() => uncheckedCallsLine(callRows.value.map(({ surface }) => surface)))`, from the rows the `v-for` numbers, and, right after `</ol>` and before the advice, `<Text v-if="uncheckedLine" data-testid="execute-op-summary-unchecked" variant="caption" color="secondary" height="130">{{ uncheckedLine }}</Text>`.
- **Flow:** `OperationCard` builds `sendTxRows` → `SendTxSummary` derives the line from the same surfaces as the rows, so a decode or a token-list change recomputes both.
- **Helper doc:** one TSDoc line says why `pending` and `raw` calls are not counted (each carries its own line).
- **e2e:** `tests/e2e/network/tx-sendTx-multicall.test.ts` waits, before its existing `shotSend`, until no row reads "Reading arguments…", then asserts the line's text (D6).
- **Not touched:** the decoder, the registry, the glossary, `OperationCard.vue`, every other window and e2e file.
- **Alternative not taken:** the count inline in the component (testable only through a mount; the house rule puts a pure function in a colocated `.ts`).

## Decision ledger

- D1. The rule and the copy live in one pure helper in `call-surface.ts`, fed from `callRows` so the numbers are the rendered ones (Opus 4). Panel: both agree.
- D2. Counted: `kind === "decoded"`, today's mark condition (F1), so `labels: "unchecked"` and the Fee Juice claim count; `pending`, `raw`, `transfer`, `mint` and every authorization do not. Panel: both agree.
- D3. Testid `execute-op-summary-unchecked`, renamed: the old name was per call (`execute-op-call-*`), and no e2e reads it (F5); the testid rule covers extractions, not a new element. Panel: both agree.
- D4. Placement: the line's own element right after the `<ol>`; the advice keeps the closing place its prop documents (F8). `afterTheCalls` then asserts the exact sibling order: list, line, advice when the line shows; list, advice otherwise (a list-or-line check would pass a line drawn below the advice). Panel: both agree.
- D5. Role: `caption`, `secondary`, the old mark's (signed off in `archive/execute-popup-readability/OWNER-ASKS.md` row C), `height="130"` (I1); the lane brief names a `Text` caption and says the mockup (body, tertiary) is not a spec. Panel: both agree; no open owner question.
- D6. No new e2e scenario (F5). The multicall spec's shot waits for the decode and asserts the sentence (I2): the shot pictures the window a person approves, and the assertion is the one proof that a real decode through the PXE's artifact on an unlisted token reaches the summary as `decoded` (the component tests feed a decode by hand). Not taken: rerunning until a capture lands decoded (Opus 5), which hides a race the base run shows in both cases. Panel: Codex proposed the wait; Opus's rerun rejected on the base evidence.
- D8. Deviation (Phase 2 step 4): only the after pair is committed (`screenshots/`); the base pair pictures pending rows, the race D6 fixes, so it is no "before" of the change.
- D7. Fee-raised window (F7): it changes with the card, since its header promises the request reads as it did at approval; the PR names both windows. Panel: both agree; not an owner question.

## Phases and gates

### Phase 1 — the sentence ✓

1. Add `uncheckedCallsLine` and its unit test to `X/call-surface.test.ts`, as one table: no surfaces, every call read, `pending` and `raw` only, one `decoded` alone, two `decoded`, `decoded` third of three, places 1, 3 and 4 of four, places 1 and 3, a `labels: "unchecked"` decode counted.
2. Change `X/SendTxSummary.vue` as Architecture says.
3. Change `X/OperationCard.summary.test.ts` over the wire-shaped fixture (`execute.fixture.ts`): (a) at rest, the Hub head reads with no suffix and one line reads "…what call 1 does." outside every row and the authorizations section; (b) new, `test.each`: a Fee Juice claim (built in the test from `FEE_JUICE_CONTRACT` and `CLAIM_AND_END_SETUP_SELECTOR`, 32-byte hex arguments, a `decoded` record as `HUB_DECODE` is), the USDC transfer (read) and one Hub call give "Claim Fee Juice" and "…what calls 1 and 3 do."; with a second Hub call, "…what calls 1, 3 and 4 do."; (c) with `tokens: []`, in this order, each operation with its own decode array: the single USDC transfer gives "…what this call does."; a second operation of two such transfers gives "…what these calls do."; back on the single transfer, `setProps({ tokens: [USDC_TOKEN] })` reads it as a transfer and the line goes; (d) every call read, with the Vault authorization decoded as an app call beside it: no line; (e) pending: no line, then "…what call 1 does." once decoded; `afterTheCalls` per D4. Every expected sentence is written out whole, never built from the helper. Update the file's header comment.
4. Run the new tests against `0a659726c`'s `SendTxSummary.vue` and `call-surface.ts`, then against the change; log both runs in `lessons/phase-1.md`. Red on the base: every positive assertion (the line's text, a head with no suffix). The unit file fails there at its import of the missing export, logged as such. The absence checks pass on both; show each red at its own assertion against a mutant of the helper, then restore it: also counting `transfer` for (d) and the end of (c), also counting `pending` for the pending half of (e).

**Validation gate:** `cd apps/extension && bun --bun vitest run src/popup/windows/execute`, then from the root `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`. Pass: exit 0 each; step 4's logs show every positive assertion red on the base copy and every absence check red at that assertion on its mutant. Layers: lint, typecheck, unit, component.

### Phase 2 — the spec waits, captures ✓

1. Run the spec on Firefox before editing it: `NULO_E2E_BROWSER=firefox NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-multicall.test.ts`; record its case times. This is the spec change's before; Chrome's before, recorded at the base (`lessons/phase-0.md`), spans the whole change.
2. In the spec, after `waitForExecuteContent`, wait (60 s bound) until no `execute-op-summary-args-pending` shows, then expect `execute-op-summary-unchecked` to read "Nulo can only check transfers and mints of tokens in your list, so it can't say what these calls do."
3. Run the spec on Chrome with `NULO_E2E_SHOT_DIR=~/.cache/nulo-backlog/naming-copy-1/shots/after`, then on Firefox without it; record the case times.
4. Copy `multicall-3-summary.png`, its `-dark.png` and the base run's pair (`before-`) to `implementations-plan/naming-copy-1/screenshots/`; read all four; commit them.

**Validation gate:** each run `2 passed`; the after pictures show the line under the calls and no suffix on a row; each browser's case times recorded beside its before times, one run each, reported as measured with what each before spans (no claim of equivalence). Layers: e2e-live-network on Chrome and Firefox.

## Security & Adversarial Considerations

- **Threat model:** a dApp controls every call's target, name, selector and arguments. The sentence holds only wallet-owned words and the list's own numbers; nothing from the wire reaches it, and Vue escapes interpolated text.
- **What the sentence trusts:** the existing reading (F2), unchanged. A call leaves the sentence two ways. (a) The wallet reads it as a transfer or mint on a listed token: the vocabulary checks the call's selector and argument shape, not what the contract does (the existing trust boundary; provenance is #508 R2's later design). (b) It does not decode: it then carries the orange "Can't read the arguments" line instead, as the owner's decision keeps. The sentence never claims more than "can't say".
- **Accepted by the decision:** with the suffix gone, a title a dApp spells (`nulo_verified_transfer` reads "Nulo Verified Transfer") sits unmarked on its row; only the numbered sentence ties the warning to it. The PR's UI impact says so.
- **Least privilege, crypto, supply chain:** unchanged; no dependency, permission or storage change.

## UI impact

- **Surface:** the approval window's summary ("What this does"), and the fee-raised window, which shows the same card by design (F7, D7). Before: ". Named by the app." after each decoded call the wallet did not read. After: no suffix; one caption line under the numbered list, before the advice when that shows, in the copy of #1328, absent when every call is read.
- **Sign-off (owner, quoted from the lane brief):** decision page 90, P90-03 = A, "one sentence under the list", with the note that it must say why; page 91, P91-02 note: "I like more the direction of A4. But in all we put the fault on us very heavily. I'd actually try to say something like: "Nulo is only able to check transfers and mints of tokens in your list, so it's not able to say what calls 1, 3 and 4 do." Maybe even under a disclaimer of sorts? or a small toggle? what do you think?"; in chat on 2026-10-28, on the tightened wording with no toggle and no disclaimer box: "O1 sounds good".

## Delivery

One arc, one PR, no stack: branch `worktree-naming-copy-1` → `dev`. Title: `feat(execute): one line under the calls says which ones nulo cannot check` (73 characters). Body: what and why, the UI impact line with the sign-off quote, the red and green runs, the gates, the spec's case times per browser before and after, one run each, with what each before spans (D6), the captures before and after linked by permalink at the arc's commit, `Closes #1328`. Opened without labels after the Codex loop converges. The close-out is the PR's final commits. No parallel lanes.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `0a659726c`, with:
- Loop once over the net diff from `0a659726c` after Phase 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the diff, this plan, the adversarial ask and the standard's two rules verbatim. Three rounds at most.
- `/code-review`: off.
- Close-out: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; lessons; known limits filed closed; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; `bun run check:plans`.
- Teardown once the close-out merges: `agent-worktree done naming-copy-1 --merged --trunk dev`; a `/loop` checks each firing, a `/goal` arms one wait after its report.

## Review verdicts

Each finding was checked against the tree; detail in lessons/phase-0.md.

- **Arc 1, Codex fix loop round 1** (fresh session, net diff from `0a659726c`): approve, no findings. **Opus diff review beside it:** conditional approve, 2 findings, both accepted: the Fee Juice decode fixture's fourth parameter is `message_leaf_index`, a Field, as the bundled artifact declares it; one test name states its added assertion. **Round 2 (resumed):** approve; the fix verified, no regression.
- **Codex, round 3 (resumed):** approve; the three fixes verified, no new material defect.
- **Codex, round 2 (resumed):** conditional approve; 3 conditions, all accepted: a second mutant (counting `pending`) for (e)'s absence check; no timing estimate, since `waitForExecuteApprovable` does not wait for the fee estimate (`tests/e2e/fixtures/popups.ts:381-388`), and each before labelled with what it spans; (c)'s order written out.
- **Codex, round 1:** conditional approve; 5 findings, all accepted. The capture can picture pending rows (I2, D6; then demonstrated by the base run). "Every new case red on base" cannot hold for absence checks (Phase 1 step 4). Two more component cases: two of three, and the token list landing (step 3 b, c). The security text claimed too much (Security, "What the sentence trusts"). `afterTheCalls` checks exact order (D4).
- **Opus, round 1:** conditional approve; 8 findings. Accepted: the red gate with a mutant for the absence checks and (d) beside a decoded authorization (step 3 d, 4); exact order (D4); sentences written out in the tests (step 3); numbers from `callRows` (D1); I1 restated; the PR names both windows (D7); the unmarked dApp title stated (Security); the helper's TSDoc line (Architecture). Rejected: rerun the capture until it lands decoded (D6: a rerun hides the race the base run shows); dropping (c)'s "these calls" half (kept: the component layer's only proof of that form, one mount).

## Seeds

```
/goal Phases 1 and 2 in implementations-plan/naming-copy-1/plan.md marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE printed per phase; the Codex loop converged on the net diff (a resumed pass reporting no new material finding, quoted); the PR and its close-out on GitHub, opened after the loop; `bun run test:all` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/naming-copy-1 forward per its plan.md and the README's Post-implementation standard: reality check from plan.md and lessons/ (the archived path present on dev means merged: tear down and stop); next pending step; fast gates after each edit; Codex consult instead of waiting; five failures on one step: reassess with Codex; never merge.
```
