---
plan: fee-balances-build-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 612d2809d
status: completed
---

## Outcome

- **Date:** 2026-11-15.
- **Status:** completed. Ships in the PR titled `feat(send): payer balances stack the FJ figure over its dollars in the row's own face`, which carries this close-out; it lands on the owner's decision page with its captures.
- **Shipped:** the Fee sheet's Private and Public Fee Juice rows draw the balance in `value` over its dollars in `caption`, right-aligned (P150-01 = B3); no dollars without a usable quote, on a row that cannot pay, on a loading row or on a balance that is not a decimal string. The type-role table records the `caption` departure.
- **Gates (retry 0, Chrome):** at `69b4cfdca`, lint, typecheck:all, test (1041 files), test:components (104 files) and check:plans green; smoke `send-fee-privacy` + `send-keyboard` 7/7 and the `type-roles` Fee-sheet case 1/1 on the armed build; `e2e:agent fee-methods.test.ts` 8/8 (269 s). The review fixes (`f1d6cb36d`, `c0926dbab`) reran biome, the two unit files (82/82) and the extension typecheck. No Firefox run (no fixture, focus, window or WebAuthn change); no e2e scenario added.
- **Deviations:** Codex's first round said approve with fixes, so a second round ran (approve with a comment fix). The `type-roles` Fee-sheet case joined the smoke gates (it sweeps the changed spans). The long capture wrapped the descriptions, not the title.
- **Lessons:** none promoted (`lessons.md` is at 8,148 of its 8,192 bytes).
- **Known limits:** none.
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` seeds under Seeds.

# fee-balances-build-1: the Fee sheet's payer balances as B3

Decision page 150, signed 2026-11-15 20:08 UTC. Its one item, P150-01, asked how the Fee sheet's two Fee Juice rows draw their balance; #1811 ships (a), the FJ figure alone at the row's right in mono `meta`, no dollars. The owner picked **B3**, no note:

- **P150-01 = B3** (2026-11-15 20:08 UTC): "B1's stack in the row's own face (the figure semibold, the dollars like the description); the private description is still two lines at 360 px and three at 240 px, where this is the shortest option." B1 is the FJ figure on one line and its dollar value under it, right-aligned in a column as wide as the wider of the two.

One arc, one PR against `dev`. It changes what users see, so it does not land on its own: the orchestrator lands it on the owner's approve of its captures. No issue matches (searched "fee sheet balance", "payer balance", "fee juice balance dollars"; closed `known-limit` "fee balance" holds nothing on this row), so the PR carries no `Closes` and no `Part of`. Recon: [`recon.md`](recon.md). Owner asks: none ([`OWNER-ASKS.md`](OWNER-ASKS.md)).

Proportion (lane brief): a 36-line prototype made a build. No plan audit round; one Codex pass over the plan and the net diff after the build; no Opus review.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | Start from the B3 prototype (36 lines over `FeeMethodRadios.vue`, `fee-helpers.ts`, `FeeSettingsCard.vue`): `FeeMethodOption.balance` carries the raw base-units read on the two Fee Juice rows; the radios take a `usd` prop and print `formatUsdMicro(tokenAmountToUsdMicro(raw, FEE_JUICE_DECIMALS, usd))`, the converter Home's Fee Juice card uses. | It is what the owner picked. Cents and "<$0.01" under a cent, never the fee's three decimals. |
| D2 | `dollarsOf` parses the balance with `parseSide` (`@/utils/token-amount`, `/^\d{1,80}$/`) and returns nothing on a malformed one, an off row (disabled or checking), or a quote that is missing, non-finite or not positive. | The one parser the wallet already has for a balance string; `BigInt` alone accepts `"0x10"` and `" 5 "` and throws on `"abc"`, which would take the render down. A quote that passed the Fee Juice band (floor 0.0001 USD) never makes `rateToMicroUsd` throw. Rejected: a new regex (a second spelling of the parser), a `try/catch` (hides the cause). |
| D3 | `.figure` and `.usd` each `white-space: nowrap`. | A long figure squeezes `.main`, whose title and definition wrap; neither number breaks inside itself (lessons § flex min-content). |
| D4 | Every string the spend column prints takes the figure's face (`value`): a balance, "free", "—", and a disabled reason ("no balance", "not available", "couldn't check balance", "can't pay now"). | The prototype the owner picked draws the column so; the B3 frames show "free" in it. Rejected: keeping reasons in mono `meta` (a third face the pick does not name). Assumption A1. |
| D5 | The dollars print bare, "$7,000.00", no "≈". | As drawn on page 150; Home's card prefixes "≈", the pick does not. |
| D6 | `packages/design/README.md` § Type roles gains one sentence: the Fee sheet's payer-balance dollars take `caption`, the owner's decision of 2026-11-15 (decision page 150, P150-01 = B3). No type-role exception, no `type-role-ban` baseline entry, no `font-variant-numeric`. | Both roles are allowed picks and nothing is sized or weighted outside a role; the ban's `tie` rule refuses `font-variant-numeric`. The table reserves `fiat` for every dollar value, so the departure is written where a reader of the table meets it. |
| D7 | Tests in the unit layer only; no new e2e scenario. The gates run the e2e specs that read or sweep the payers. | The change maps two strings in a helper and draws them in one component; no committed e2e spec reads the spend text (`git grep` "1,000 FJ", `send-fee-payers`). `fee-sponsor-funding.test.ts` reads the title through `span span`, which the kept DOM order still finds first; `send-chaos.test.ts` reads the labels only for a failure message. Neither runs. `type-roles.test.ts` sweeps the Fee sheet (its "Send's person step…" case), so that case runs. |
| D8 | Captures from a scratch copy of fee-balances-1's capture spec through `agent.sh`; the long figure comes from a capture-only patch on `FeeSettingsCard.vue`'s `methods` input, armed by a `localStorage` flag the spec sets. Neither is committed; the network gate runs on the committed tree in its own invocation first. | The sandbox mints 1,000 FJ per call, so 1,234,567.8901 FJ cannot be seeded honestly in a capture run; the patch sits upstream of everything this change renders. The gate of record runs the code that ships. |
| D9 | No accessibility call. | DOM order, one radio group, Tab order, the `:focus-within` ring and the chosen row's inset bar are unchanged; the dollars join the label's text after the figure. |

## UI impact

- **Send → Fee sheet, "Who pays the fee", the Private and Public Fee Juice rows** (`FeeMethodRadios.vue`): before, the FJ figure alone at the right in JetBrains Mono 13; after, the figure in Inter 12/600 over its dollars in Inter 11 ("1,000 FJ" over "$7,000.00"), right-aligned, both `--nulo-secondary`. No dollars without a usable quote (the row lays out as today, one line at the right), on a disabled row, or on a loading row (the skeleton stays). The sponsor rows keep "free" and a hand-added one "—", in the figure's face (D4). Sign-off, **P150-01 = B3** (2026-11-15 20:08 UTC): "B1's stack in the row's own face (the figure semibold, the dollars like the description); the private description is still two lines at 360 px and three at 240 px, where this is the shortest option."
- Nothing else: no testid, `data-*` attribute, tooltip, glossary term, stored key or copy changes. The fees in You pay stay mono.

## Security & Adversarial Considerations

- **Inputs.** The balance is the worker's own read of the node and the PXE, never dApp data; the quote is one the price service validated and banded. A malformed balance or quote prints no dollars (D2) and cannot throw out of the render.
- **Disclosure.** The dollars are Home's Fee Juice card's figure on another screen; nothing new leaves the device, and no log line, storage key, permission or dependency changes.
- **Deception.** A disabled row never prints dollars, so a row that cannot pay never reads as funded.

## Assumptions

**Facts** (checked at `612d2809d`):
- F1. `FeeMethodRadios.vue` draws the rows; `FeeSettingsCard.vue:468` mounts it with `menuMethods`; `prices.feeJuiceQuote` is the fresh Fee Juice quote (`usePrices.ts:158`).
- F2. `loadingRow` (`fee-helpers.ts`) rebuilds a loading row from five fields, so it never carries `balance`.
- F3. The prototype's `b3/FeeMethodRadios.vue` equals the tree's file plus `b3.patch`.

**Asks.**
- A1. A disabled reason drawn in `value` (D4) appears in no page-150 frame. Working assumption: it is the pick's column face, as the prototype draws it; the PR body names it so the decision page can show it.

## Phase 1: the rows, their helper and their tests ✓

1. `apps/extension/src/popup/components/modules/send/fee-helpers.ts`: `FeeMethodOption.balance` (TSDoc: base units as read; absent while unread or after a failed read); `feeJuiceOption` and `privateFeeJuiceOption` set it from a string leg.
2. `apps/extension/src/popup/components/modules/send/FeeMethodRadios.vue`: the `usd` prop; `dollarsOf` (D2) and `spendOf`; the spend span becomes a flex column of `.figure` (`composes: type--value from global`) over `.usd` (`composes: type--caption from global`), both `--nulo-secondary` and `nowrap` (D3). DOM order title → definition → spend; every testid and `data-*` attribute unchanged.
3. `apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue`: `:usd="prices.feeJuiceQuote.value?.usd"`.
4. `packages/design/README.md`: the sentence of D6, below the role table.
5. Tests:
   - T1 (`FeeMethodRadios.test.ts`, a priced describe, the wire-shaped `HELD` style: raw 18-decimal strings): 1,000 FJ at $7 prints "1,000 FJ $7,000.00" in each Fee Juice label and nothing on the sponsor rows; 0.001 FJ prints "<$0.01"; no `usd` prints no "$" (the existing row-order case, unpriced, stays the control); an open row whose balance is unread prints "— FJ" and no "$" (added in review, R1-1); a disabled row ("no balance", "couldn't check balance") and a loading row print no "$" with a quote set; a malformed balance (`"0x10"`, `"abc"`) prints the row with no "$" and does not throw.
   - T2 (`fee-helpers.test.ts`, "what each row can spend"): each Fee Juice row's `balance` equals its leg as read, and is absent for a `null` leg and while unread.

**Validation gate** (retry 0, one command at a time, from the worktree root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` after staging. Then Chrome only: the armed smoke build (`global-setup-smoke.ts`' `ARMED_BUILD`), then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/send-fee-privacy.test.ts tests/e2e/send-keyboard.test.ts --retry=0`, then the same with `tests/e2e/type-roles.test.ts -t "Send's person step"`; then `NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-methods.test.ts` (`agent.sh` claims ports from `~/.agents/ports.md`; the 10-minute stall watchdog stays). No Firefox run (no fixture, focus, window or WebAuthn change); CI's five lanes are the gate of record. Pass: every command exits 0; T1 and T2 fail on the base and pass on the head; every other assertion passes unedited, or an edit is recorded here with its reason.

## Phase 2: captures and the PR ✓

1. Copy the scratch capture spec into `tests/e2e/network/` and the capture patch onto `FeeSettingsCard.vue` (D8); one `agent.sh` run with `NULO_E2E_SHOT_DIR` set writes, each `-light` and `-dark`, at 360 × 600 unless named: `fbb1-sheet`, `fbb1-sheet-240` (240 × 600), `fbb1-sheet-unpriced` (`refusePrices`), `fbb1-sheet-long` (1,234,567.8901 FJ at $7: the title wraps, nothing clips; fix only a clip), into the lane's scratch `shots/` with `captions.json` (one sentence per id, the point first). Then restore the tree.
2. Commit the 360 light and dark pair under `pr-captures/fee-balances-build-1/` in one commit; delete it in the next.
3. Post-implementation, then the PR.

**Outcome.** One capture run, green at `c0926dbab` plus the uncommitted kit (a first run reddened on the scratch spec's own assertion, which expected a space `textContent` does not carry between the figure and dollar spans; the frames were already right). Heights match page 150's B3 exactly (360: 59 / 45 / 45; 240: 73 / 59 / 59); unpriced keeps them. The long figure did not wrap the title as the brief foresaw: the column widened and the descriptions took two lines (59 / 59 / 45), both numbers whole, no part clipped.

**Validation gate.** `git status` clean after the restore; `git grep -n fbb1 -- apps` empty; all eight frames exist; the long frame's measured parts report no `overflowX` and no `outside`; `bun run check:plans` exits 0 after staging.

## Delivery

One PR from `fee-balances-build-1-a1` (off `origin/dev`, carrying the plan commit) to `dev`, opened ready, no label. Title (85 characters): `feat(send): payer balances stack the FJ figure over its dollars in the row's own face`. The body quotes the sign-off verbatim, embeds the 360 pair from `pr-captures/fee-balances-build-1/` at the commit that adds it, names A1, lists the gates with outcomes and says no e2e scenario was added. Merging is the orchestrator's, on the owner's approve.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `612d2809d`. Plan-specific values:
- Step 1: `code_review: off`, so absent.
- Step 2, thinned by the lane brief: after Phase 1 is green, ONE `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over the plan and `origin/dev...HEAD`, the prompt in the lane's scratch dir. Take its findings and rerun only the gates a fix touches. A second round only if the first says anything but approve (resume with `resume-codex.sh`; hard stop at three). No Opus review.
- Step 3: `gh pr create` as Delivery says; `gh pr checks <n> --watch` once.
- Step 4, close-out in the same PR's final commits: Outcome, lessons (none expected), `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line to `archive/index.md`, after merging `origin/dev` in.
- Step 5: teardown is the orchestrator's.

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build fee-balances-build-1 per `implementations-plan/fee-balances-build-1/plan.md`: Phase 1 green, captures, one Codex pass, PR open with captures; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished step of `plan.md`, record its gate, stop at the open PR.

## Audit verdicts

No plan audit round (lane brief, Proportion).

**Codex pass over the plan and the net diff** (gpt-6.1-sol, high, read-only, `612d2809d...69b4cfdca`), 2026-11-15: approve with fixes, high confidence, no functional bug.
- R1-1, accepted: no case pinned an open row with an unread balance and a quote set. Added "a balance not read yet prints no dollars on its open row" (T1). Its premise, that removing the `typeof m.balance === "string"` guard left every new case green, was inexact: four cases go red without it (the sponsors' "$0.00"); Codex withdrew it in round 2.
- R1-2, accepted: comments. The band-checked-quote invariant moved onto the `usd` prop; `dollarsOf`'s and `spendOf`'s docblocks and a test fixture's narration deleted; the CSS comment sits above `.usd` and names `caption` against `fiat`.
- Its "looks fine": no other consumer reads `balance`; checking and verifying rows bypass the dollars; Skeleton and row heights hold; testids, `data-*`, DOM order and Tab order intact; missing-quote and loading cases pass on the base by nature (never-happens assertions paired with the priced controls).

**Round 2** (resumed, `f1d6cb36d`): approve with one comment correction: a rate under a micro-dollar does not always throw, since the conversion rounds first. The `usd` prop now says the conversion rejects a rate that rounds to zero micro-USD (`c0926dbab`). Comment-only, so no third round.
