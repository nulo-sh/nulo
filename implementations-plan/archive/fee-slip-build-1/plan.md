---
plan: fee-slip-build-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 0dc22a9c5
status: completed
---

## Outcome

- **Date:** 2026-11-17.
- **Status:** completed. Ships in the PR titled `fix(send): the fee slip and the review's fee row as two rows, figure over method`, which carries this close-out; it lands on the owner's approve of its captures.
- **Shipped:** the Send FEE slip as two rows, the fee bold over who pays in a caption, CHANGE on the fee's line (P165-01 = D1), and the review's fee row as the same two rows right-aligned (P165-03 = R1); one reading for both screens (`feeLine`, now the figure plus `method` on every state); `send-fee-line-method` and `send-review-fee-method` added, every other testid kept. The slip measures 30 px priced, unpriced and estimating.
- **Gates (retry 0):** at `e2088c251`, lint, typecheck:all, test (1045 files, after one known host-load teardown flake on an untouched file), test:components (104 files), check:plans green; smoke `send-keyboard` 6/6; one proverless `e2e:agent` run over `fiat-send`, `fee-sponsor-funding`, `same-token-concurrent-sends`, `fee-methods` and `send-amount-exact`, 31/31, about 20 min. `b544ebbc2` (one test comment) reran its file. No e2e scenario added; no Firefox run was due (no fixture or helper changed).
- **Deviations:** D1, the lane brief's `feeLineRows` name not used (`feeLine` carries the rows); `send.integration.test.ts`'s four word pins rewritten to rows (Phase 1); the before frames are the render lane's of the same base (D7).
- **Lessons:** none promoted (`lessons.md` holds 8148 of 8192 bytes; the teardown flake is already on record); detail in [`lessons/phase-1.md`](lessons/phase-1.md).
- **Known limits:** none.
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` seeds under Seeds.

# fee-slip-build-1: the Send fee slip and the review's fee row as two rows

Decision page 165, signed 2026-11-17 15:47 UTC at dev `0dc22a9c5`. Lane fee-slip-1 rendered the options; the owner picked, with no notes:

> **P165-01 = D1** (2026-11-17 15:09 UTC), "The FEE slip on Send: one string that breaks inside "Fee Juice" (today), your double row with the fee over the method (D1), the fee left and the method right beside CHANGE (D2), or the method as a chip (D3)". As the page put it: "Your double row: the fee in the row's bold value face, "~0.060276 FJ ($0.422)", over the method in a muted caption, "Private Fee Juice"; CHANGE on the fee's line. The method row holds its place in every state where the payer is known, the bar and the failure included, so the slip is 30 px priced or not. A sponsor reads "Nothing" over "Sponsored"; a hand-added one a dash over its name, the FPC sentence under."
>
> **P165-03 = R1** (2026-11-17 15:47 UTC), "The review pop-up's fee row: one right-aligned line (today), the slip's D1 shape right-aligned (R1), a TOTAL row above it in dollars (R2), the method moved into the key (R3), or R1 with R2's TOTAL only when both are priced (R1T)". As the page put it: "D1's shape right-aligned: "~0.060276 FJ ($0.422)" bold over "Private Fee Juice" in a caption, the notes under; the form and the review lay the fee out the same way, at +16 px."

The estimate mark (~) stays (the page said a build drops it only on the owner's word; no note). P165-02 (where the warning appears) is not in this arc: nothing here touches the warning, `PublishLine` or the Fee sheet. One arc, one PR against `dev`; closes no issue. It changes what users see, so it lands only on the owner's approve of its captures. Recon: [`recon.md`](recon.md). Owner asks: none ([`OWNER-ASKS.md`](OWNER-ASKS.md)).

Proportion (lane brief): two rows in two components over one helper. No plan audit round; one Codex pass over the plan and the net diff after the build; no Opus review.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | The two rows live on the one reading: `feeLine` stops appending the method to `value`, which becomes the first row (the figure), and every reading, the bar, slow and failed included, carries `method`, the second row. No `feeLineRows` wrapper. | The lane brief names a `feeLineRows(state)` helper "reading the same `feeLine` so the slip and the review can never word the fee apart". The prototype (`5d93a9400`) built it beside `feeLine`: it re-derived the figure from the state (`feeShown`, `figureOf`) next to a one-string `value` no screen would draw any more, and added a second label map (`FEE_METHOD_LABEL`) beside `FEE_LINE_METHOD`. Two derivations of one fee is the drift the brief guards against, and the old string would be dead code its tests keep alive. The existing function carries the brief's contract (figure, method, notes unchanged) with no copy: the name is the only deviation. |
| D2 | `FEE_LINE_METHOD` holds the Fee sheet's row titles: "Private Fee Juice", "Public Fee Juice", "Sponsored" (`FeeSettingsCard.vue:239-240`); a hand-added sponsor's method is its `payerName` (already `sentenceName`d by `send.vue`); null while no payer is known. | The pick's words ("Private Fee Juice" as a label). The sentence-case forms ("private Fee Juice") existed only to end the one-line string. |
| D3 | The first row per state. Landed: the fee in `feeText`'s grammar, its dollars when priced. A payer known with no estimate (no amount yet): "—". Nulo's sponsor: "Nothing", note "The sponsor covers ~X". Hand-added: "—", note the FPC sentence. No payer: "—", no method. Queued against a cap: the last fee, note the cap sentence. Queued with the sponsor: "Nothing", note "Goes out after your earlier send." Queued, no cap: "Queued behind your previous send". Bar, slow, failed: as today, with the method under them. | The pick and the lane brief's helper contract, state by state. A cap implies a self-paying method (`queueCapOf`, `send-fee-gate.ts:17`), so the cap's method row always names Fee Juice. |
| D4 | Slip (`SendFeeLine.vue`): the value column holds a figure row (the figure in `type--value`, primary, still one `send-fee-figure` span; the bar, slow and failed as today) over the method (`type--caption`, secondary, `overflow-wrap: anywhere`, testid `send-fee-line-method`). CHANGE stays on the figure row's baseline and the line's one Tab stop. The bar sits inside a span, so its row keeps a text line box. | The prototype's layout (`37c6db958`), plus the bar's span: the `Skeleton` is a 10 px block as a flex item, so without a line box the bar's row is shorter than a fee's and the slip moves a few px when the estimate lands, which the pick rules out ("holds its place in every state ... the bar and the failure included"). Measured on the build's captures (Phase 2). Rejected: `min-height: 1lh` (the bar's synthesized baseline then shifts the key and CHANGE). |
| D5 | Review (`SendReviewSheet.vue`): the prototype's R1 (`48b480331`): the figure in `type--value`, the method right-aligned under it in `type--caption`, secondary (testid `send-review-fee-method`), then the notes; no method on a re-ask, whose note already says who pays; the re-ask line and every `send-review-fee-*` testid unchanged, including `send-review-fee-reask > span` as the first child (`same-token-concurrent-sends.test.ts:727`). | The pick. |
| D6 | Tests in the unit and component layers; no e2e edit and no new scenario. The e2e specs that read these testids run unchanged as the regression gate. | `git grep` under `apps/extension/tests/e2e` finds no assertion on the one-line words: the specs read `data-payer`, `aria-expanded`, the notes' text and the figure inside the notes or the review's value testid, all kept; the slip's and the cap's full text are read only into failure messages (`transfers.ts:98`, `fiat-send.test.ts:207`, `same-token-concurrent-sends.test.ts:778`). No fixture changes, so no Firefox run is due. |
| D7 | The "before" captures are the render lane's frames of the base (`fs1-slip-today`, `fs1-review-today`), copied, not retaken. | Same base commit, kit, account, states and 400 px viewport as this plan's base; dev has moved since only by `5d7454672` (authwits), which touches neither surface. A sandbox run to redraw identical frames spends the shared rate window for nothing. Each caption names its source. |
| D8 | Accessibility (the owner's 2026-10-19 delegation): no change. CHANGE stays the only Tab stop with its ring; the method is plain text read after the figure; the notes stay the line's polite live region. | Text and layout only. |

## UI impact

- **Send page, the FEE slip** (`SendFeeLine.vue`): before, one string, "~0.060276 FJ ($0.422), private Fee Juice", which breaks inside "Fee Juice" at 400 px; after, the fee bold over "Private Fee Juice" in a muted caption, CHANGE on the fee's line, the notes under as today, the same height priced, unpriced and estimating. Sponsor "Nothing" over "Sponsored"; hand-added "—" over its name, the FPC sentence under. Sign-off **P165-01 = D1**, quoted above.
- **Review sheet, the fee row** (`SendReviewSheet.vue`): before, the same one string right-aligned; after, the slip's two rows right-aligned, the notes under them, +16 px. Sign-off **P165-03 = R1**, quoted above.
- Nothing else: the Fee sheet, the warning, the publish line, the review's hero, tooltips and the glossary are unchanged.

## Security & Adversarial Considerations

Display only. The one attacker-influenced string is a hand-added sponsor's name: it reaches the method row already passed through `sentenceName` (`send.vue:523`) and renders by text interpolation, never HTML; it moves from the end of the value string to its own row, so it can no longer sit beside the fee figure. No storage, message, permission, secret, dependency or log line changes.

## Phase 1: the reading, the two rows and their tests ✓

1. `apps/extension/src/popup/components/modules/send/fee-line-words.ts`: D1, D2, D3; `feeLineWords` drops its `name` option (the name is the method now).
2. `.../send/SendFeeLine.vue`: D4. `.../send/SendReviewSheet.vue`: D5.
3. Tests:
   - `fee-line-words.test.ts`: the rows per state (D3's list, each with its method or none), every figure still `feeText`'s.
   - `SendFeeLine.test.ts`: figure and method per state; the method row present in the bar, slow and failed states and absent with no payer (the slip's steady height rests on it; jsdom has no layout, Phase 2 measures it); the figure one `send-fee-figure` span with no method words inside it.
   - `SendReviewSheet.test.ts`: the parity tests compare the review's rows `[figure, method, ...notes]` with the slip's; the row's words per state; the queued cap's sentence under the rows; no method on a re-ask.
   - The source scans (`copy-dash-ban`, `type-role-ban`, `red-text-ban`) stay green unedited.
   - Deviation, the tree wins: `apps/extension/src/popup/pages/send.integration.test.ts` also read the one-line words (four pins: the review's priced row, the queued cap's and the sponsor's rows, and the review's row text while the bar runs, now "FeeSponsored"); rewritten to rows, its helper reading figure, method, notes. The re-ask's "no method" rests on the existing re-ask test, whose exact row list holds no method.

**Validation gate** (retry 0, one command at a time, from the worktree root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` after staging; then from `apps/extension`, `bun run test:e2e -- tests/e2e/send-keyboard.test.ts --retry=0`; then one proverless run (`same-token-concurrent-sends` requires it; the other four run on it as most CI shards do): `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fiat-send.test.ts tests/e2e/network/fee-sponsor-funding.test.ts tests/e2e/network/same-token-concurrent-sends.test.ts tests/e2e/network/fee-methods.test.ts tests/e2e/network/send-amount-exact.test.ts`. Chrome only (D6). Pass: every command exits 0; the new pins fail on the base; no existing assertion loosened.

## Phase 2: captures and the PR ✓

1. Copy the render lane's kit into the lane's scratch dir (never edited in place); the capture-only override of `send.vue` is applied around the run and restored after, never committed. One proverless `agent.sh` run at 400 x 600, light and dark: `fsb1-slip-after` (priced), `-noprice`, `-estimating` (override: estimating, no figure), `-sponsor` (Nulo's sponsor picked in the Fee sheet), `-long` (override: a 32-character hand-added name), `fsb1-review-after`, `-queued` (override). `fsb1-slip-before` and `fsb1-review-before` per D7. Each stand-in's caption says it is one. The run records the slip's height in the priced, unpriced and estimating states: pass is all three equal.
2. `captions.json` beside the frames under the lane's scratch `shots/` (keys `<id>-light`, `<id>-dark`, one sentence each, the point first).
3. Post-implementation, then commit `fsb1-slip-after` and `fsb1-review-after` (light and dark) under `pr-captures/fee-slip-build-1/` in one commit and remove them in the next; open the PR.

**Validation gate.** `git status` clean after the run (no spec, no override); every frame in both themes; the three heights equal; `bun run check:plans` exits 0 after staging.

Measured at `b544ebbc2` (400 px, `send-fee-line`): priced 30 px, unpriced 30, estimating 30, sponsor 47 (its cost note), long name 47; the review's row 31, queued 63. All as the render lane measured D1 and R1.

## Delivery

One PR from `fee-slip-build-1-a1` (off `origin/dev`, carrying the plan commit) to `dev`, opened ready, no label. Title (80 characters): `fix(send): the fee slip and the review's fee row as two rows, figure over method`. The body quotes both picks verbatim under `## Sign-off (decision page 165)`, embeds the two landed captures at the commit that adds them, states the D1 deviation (no `feeLineRows` name), the measured heights, the gates with outcomes, and that no e2e scenario was added. No `Closes` and no `Part of` line. Merging is the orchestrator's, on the owner's approve.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `0dc22a9c5`. Plan-specific values:
- Step 1: `code_review: off`, so absent.
- Step 2, bounded work: after Phase 1 is green, ONE `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over this plan and `origin/dev...HEAD`, asking also whether any state words the fee differently on the slip and the review, whether the slip's height can still change when a quote or an estimate lands, and whether a pin was loosened rather than rewritten. Rerun only the gates a fix touches. A second round only if the first says anything but approve (`resume-codex.sh`; hard stop at three). No Opus review.
- Step 3: `gh pr create` as Delivery says; `gh pr checks <n> --watch` once.
- Step 4, the close-out in the same PR's final commits, after merging `origin/dev` in: Outcome, lessons (none expected), `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line to `archive/index.md`.
- Step 5: teardown is the orchestrator's.

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build fee-slip-build-1 per `implementations-plan/fee-slip-build-1/plan.md`: Phase 1 green, captures, one Codex pass, PR open with captures; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished step of `plan.md`, record its gate, stop at the open PR.

## Audit verdicts

No plan audit round (lane brief, Proportion).

**Codex round 1, over the plan and the net diff** (gpt-6.1-sol, high, read-only, `origin/dev...e2088c251`), 2026-11-17: **approve**, high confidence (moderate on pixel geometry it could not measure). It walked 14 states through the real helper and found both screens drawing the same figure, method and notes in the same order, Home's re-ask unchanged (no method row, `send-review-fee-reask > span` still first); the method row never absent while Send knows a payer (`send.vue:523` names an unnamed sponsor "this FPC"); no pin loosened (exact strings became exact row arrays; the slip's slow and failed checks went from `toContain` to `toBe`); D1 sound, the intersection keeps the union's narrowing, nothing left dead; nothing visible beyond the picks; a hostile sponsor name stays sanitised text beside a dash and the FPC caveat. On height: no unconditional 30 px (a figure too wide for its row pushes CHANGE down, notes add lines), so the browser measurement stands as the proof (Phase 2: 30 px in all three states). Finding:
- R1-1, accepted: a comment in `send.integration.test.ts` restated the assertion under it; removed (`b544ebbc2`), its file rerun green (74/74) and Biome clean. No second round (the verdict was approve).
