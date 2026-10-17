---
plan: fees-display-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 093fa10d (origin/dev)
issues: [515]
---

# fees-display-1: one fee grammar on every screen (#515)

**Pick (owner, 2026-10-17, P36-04 A, the Decision block on #515):** "One helper, one grammar: ~X FJ ($Y) everywhere, fees at 6 decimals, balances as today (4 on Send, 2 on Home), named once." The decision page's recommendation added: "Against: a few detail rows change by a digit or a marker."

## Outcome & Quality Bar

- **For whom:** a person who approves a fee on Send or in a dApp window, then reads it again on the transaction or receipt page.
- **Excellent:** with the same usable quote, one fee reads the same figure, marker and USD on the card that asks and on the row that remembers; a test per site proves it. One module names the fee precision and both balance precisions, and only it formats a fee.
- **Good enough:** words and screen-reader sentences stay; balances keep today's figures; a past fee is priced at today's quote, as now.

## Assumptions

**Facts** (verified at `093fa10d`; the site table is in [recon.md](recon.md)):
1. Fee figures use `formatFeeJuice` (6 dp, half-up) and `feeToUsd`, except two deliberate bounds: the shortfall cost rounds up (`fee-helpers.ts:84-85`) and the queued cap rounds down in the worker (`queued-fee-cap.ts:95`). Both stay.
2. Every popup site holds the raw base-unit value; the app-paid line renders the preformatted `maxFeeFormatted` with the raw `maxFee` beside it (`OperationCard.vue:373`).
3. `maxFeeFormatted` and `priorityFeeFormatted` (`packages/wallet-bridge/src/fee.ts:83,87`, a private package) travel worker to popup; only `OperationCard.vue` and `fee-helpers.ts` `feeDisplay` read them; no dApp handler returns them.
4. The fee window and the app-paid line have no price client. `usePrices` calls `refreshIfStale()` at setup (`usePrices.ts:81-90`), and the service checks the fiat setting, not the lock (`price/service.ts:147-160`). The windows mount before their session check redirects (`useDappApprovalWindow.ts:118-129`); their cards mount after `init`.
5. Two constants already encode the 6-dp readout unit: `READOUT_UNIT` (`queued-fee-cap.ts:16-18`) and `FEE_RISE_ASKS.atLeast` (`fee-reask.ts:19-21`).
6. No Activity or Home row prints a fee amount (recon search trail).

**Claims in #515 that did not hold as written:** its line numbers drifted (`FeeCostReadout.vue:58,67` → `:69,78`; `TxFeeRow.vue:49,72` → `:47,70`); "the activity fee row" is the transaction page's `TxFeeRow`, and the lane brief's "Activity rows where a fee shows" do not exist. It misses the app-paid line, the fee window (`FeeRaisedCard` and its Confirm), the review's re-ask line and submit label, `reask-review.ts`, the breakdown's L2/DA cells and `FEE_RISE_ASKS`.

**Inferences:** (a) the network suite runs without the smoke egress guard (`egress-guard.ts:122`), so a run may fetch a live coingecko quote that replaces a seeded one (`price-fixture.test.ts:9-11`); (b) `type--fiat` has no fixed size (`packages/design/src/token-contract.ts:149`), so the USD span's 11 px stays legal.

**Asks:** OA-1 (D10), answered A by the orchestrator (D-orch, 2026-10-17): a button's label keeps the button's face. Not an ask (D5): read literally, the pick puts `~` after "About", "up to" and "at most" too, and P38-03's "About" then reads "About ~X FJ ($Y)"; the report tells the orchestrator.

## Architecture & Implementation

- **The helper** (`apps/extension/src/utils/fee-estimation.ts`, already the formatter's home): `FEE_DECIMALS = 6`, `BALANCE_DECIMALS = { send: 4, home: 2 }`; `feeDisplay(raw, usdPerFeeJuice): FeeDisplay` (`{ amount, usd }`, raw-in only); `feeFigure(d)` → `~X FJ`; `feeText(d)` → the figure, then ` ($Y)` with a usable quote. No options. `formatFeeJuice`, `feeToUsd` and `feeJuicePricingFromUsd` become module-private, which also drops them from the template auto-imports. `formatGasBalance(raw, decimals = BALANCE_DECIMALS.send)`; Home passes `.home`; the shortfall balance stays at `FEE_DECIMALS`, truncated. `READOUT_UNIT` and `FEE_RISE_ASKS.atLeast` derive from `FEE_DECIMALS` (values unchanged).
- **Figures in markup** render through a new L3 `components/composite/FeeAmount.vue` (`display`, `usdClass`, `usdTestid`), one root `<span>`: the figure, then the USD span with `title="At today's AZTEC price"`. It owns no typography: the parent's class on the root sets the figure's role and color, `usdClass` the USD's, so every site keeps today's sizes (the readout and the transaction header pass their 11 px `type--fiat` class; the receipt and the breakdown inherit 13 px `type--meta`). Its script imports its helpers (vitest does not auto-import `utils/`).
- **Mono:** every fee figure in template markup sits in a mono role: the app-paid figure and its priority clause, the queued cap line and the shortfall cost (its words move into the template; `shortfallSentence` becomes the two figures). The review's fee lines are strings inside the already-mono `.fee`. **Button labels (OA-1):** the review's submit and the fee window's Confirm (`DappApprovalFooter`'s string `confirmLabel`, `DappApprovalFooter.vue:62`) keep the button's role, with the figure inside the label (OA-1 A). The sponsor row's screen-reader sentence keeps its words from `display.amount` and `display.usd`.
- **Prices behind the session:** each fee card owns its quote, as `FeeSettingsCard` does, and mounts only on its branch, after the window's session gate, while `init` loads the payload: the app-paid branch's fee line ("Fee up to …", its priority clause, its skeleton) moves out of `OperationCard` into a new L4 `send/AppFeeLine.vue`, mounted only while an estimate is running or has landed, so the legend-only paths (a default-entrypoint operation, a failed estimate; `OperationCard.fee.test.ts:352-362`) read no price; the legend and the funding live region stay; `FeeRaisedCard` gets its own client and emits the Confirm text (`v-model:confirmText`, as `FeeSettingsCard` emits `queuedCapText`). `OperationCard` gains no client, so an operation without a fee reads no price. Teardown: `disconnect()`, then `dispose()`.
- **Wire:** `TransferFeeEstimate` drops both preformatted fields; the worker still sets `priorityFee` only when `feeDisplay(priorityFee, undefined).amount !== "0"`.
- **Not taken:** a new `utils/fee-display.ts` (a second fee module); string pieces per template (eight copies of the USD span); a static ban test (private exports are stronger with auto-imports); a price client at window level (it would read before the session check); one in `OperationCard` (every operation would read a price).

| Surface | Today → after the arc |
|---|---|
| Send / approval fee card, review "Fee ·" line | `~X FJ ($Y)` unchanged; queued "About X FJ ($Y)" → "About ~X FJ ($Y)", "for at most ~X FJ ($Y)"; review "Fee up to ~X FJ ($Y), based on your last send…" |
| Shortfall | "can cost up to X FJ." → "can cost up to ~X FJ ($Y)." (cost still rounded up; balance as today) |
| Review re-ask; submit | "Fee is now X FJ ($Y), above the X FJ you accepted." → "…now ~X FJ ($Y), above the ~X FJ ($Y) you accepted."; "Send for X FJ" → "Send for ~X FJ ($Y)" |
| Fee window | "Was X FJ · Now X FJ" → "Was ~X FJ ($Y) · Now ~X FJ ($Y)"; Confirm as the review's submit |
| Approval app-paid line | "Fee up to X FJ" (body face) → "Fee up to ~X FJ ($Y)" (mono); priority clause "a ~X FJ ($Y) priority fee" (mono) |
| Transaction page | header paid `X FJ  $Y` / estimated `~X FJ  $Y` → `~X FJ ($Y)`; breakdown L2, DA, Estimated → `~X FJ ($Y)` |
| Receipt page | `X FJ  $Y` → `~X FJ ($Y)` |

**UI impact:** every row above, light and dark, before (`093fa10d` build) and after, in the PR. Typography: four figures move from the body face to mono under the lane's rule (the app-paid figure, its priority figure, the queued cap line's, the shortfall cost); every size stays. Button labels keep the button's face with the fee figure inside them (OA-1 A, orchestrator D-orch: the lane's mono rule covers fee values shown as values, rows, lines and cells, not the text of a control). Words, rows and balances do not change.

## Security & Adversarial Considerations

- **Threat model:** display only; fee figures come from the worker's estimate, never dApp text. The app-paid figure in mono sets it apart from the dApp name beside it (`OperationCard.vue:369`). Vue interpolation, no `v-html`, no log line added.
- **Invariants kept:** the queued cap on screen is the cap enforced (both derive from `FEE_DECIMALS`; a test pins the round trip); the dApp tolerance (`fee-reask.ts:21-27`) is P38-03's, not this arc's; the shortfall cost rounds up, so cost and balance never read equal; no USD without a usable quote.
- **Price reads:** none before the session gate (a fee-window test through the real card proves it); only a window that shows a fee reads one; an unlocked window with an incomplete cache may fetch, as the Send fee card already does. No new host, dependency, credential or permission.

## Phases (one arc)

**Phase 1 — the helper, its component, the named precisions.** ✓ Change map: `utils/fee-estimation.ts` (constants, `FeeDisplay`, `feeDisplay`, `feeFigure`, `feeText`, `formatGasBalance` default); `components/composite/FeeAmount.vue`; `general/GasBalanceCard.vue` (`BALANCE_DECIMALS.home`); `queued-fee-cap.ts`, `fee-reask.ts` (derived units); regenerated `src/types/*.d.ts`. Tests: `fee-estimation.test.ts` moves its formatter cases onto the public helper (invalid quotes, zero, USD rounding, no quote → no USD beside a quoted control) and adds a raw value that forces rounding (`"3577823500000000001"` → `3.577824`, string and bigint) and both balance precisions; `FeeAmount.test.ts` (one table of distinct cases, ten as CLAUDE.md asks of L3: USD present/absent, `<$0.001`, zero, testid, title, no testid, root class, `usdClass`, literal output, and `text() === feeText(display)` on every row); the queued cap's display amount equals the enforced cap.
- **Gate:** `bun run lint && bun run typecheck:all && bun run test` exit 0, the new tests green, `git status` shows no stale `src/types/` file.

**Phase 2 — Send, review, the approval and fee windows; the old paths go.** ✓ Change map: `FeeSettingsCard.vue`, `FeeCostReadout.vue`, `pages/send.vue` (rename its local `feeText`), `SendReviewSheet.vue`, `general/reask-review.ts` (the cap keeps its USD), `RecentActivityView.vue`, `windows/execute/OperationCard.vue` → new `send/AppFeeLine.vue` (price client, figures through `FeeAmount`), `windows/fee/index.vue` + `FeeRaisedCard.vue` (raw fees, price client, `confirmText`); delete `FeeDisplay`/`feeDisplay`/`feeInWords`/`feeLine`/`feeAmountDisplay` from `fee-helpers.ts`, `shortfallSentence(shortfall, usd)` through the helper; drop the wire fields (`packages/wallet-bridge/src/fee.ts`, `transfer-executor.ts`, `dapp-send-executor.ts`, fixtures). Tests: `fee-helpers.test.ts` drops the estimate-shaped cases with their helpers (their behaviour lives in Phase 1's tests); update the pins in `FeeCostReadout`, `SendReviewSheet`, `FeeRaisedCard`, `windows/fee/index` (Confirm text; no `refreshIfStale` while the session is checked or locked, through the real `FeeRaisedCard`, beside an authenticated control), `FeeSettingsCard` (shortfall; a balance figure at 4 dp), `send.integration`, `RecentActivityView`, `dapp-send-executor`, `fee-reask`; `AppFeeLine.test.ts` (disposed on unmount); `OperationCard.fee.test.ts` keeps its testids, adds no `refreshIfStale` on the two legend-only paths beside an estimated control, and gains the **wire-shaped fixture**: `feeEstimate` as the worker now sends it (`maxFee: "3577823500000000001"`, `priorityFee` a decimal string, no preformatted field), asserting the app-paid line and the readout from one quote.
- **Gate:** as Phase 1, plus `bun run test:all`.

**Phase 3 — the transaction and receipt pages.** ✓ Change map: `tx/tx-detail-helpers.ts` (raw costs), `tx/TxFeeRow.vue` (raw fees + `usdPerFeeJuice`; four `FeeAmount`s, the header's with its 11 px `usdClass`; `tx-fee-usd`, `tx-estimate-usd` kept), `pages/tx/[id].vue`, `pages/received/[id].vue` (`received-fee-value` kept). Tests: `TxFeeRow.test.ts` (paid, estimated, breakdown, no quote), `tx-detail-helpers.test.ts`, `pages/tx/[id].test.ts` (real page and row, paid and estimated, one raw value and quote), `pages/received/[id].test.ts`.
- **Gate:** as Phase 1.

**Phase 4 — private formatters, e2e, screenshots.** Change map: the three formatters go private; regenerated `src/types/*.d.ts`; `fee-reask.test.ts` and the e2e use `feeDisplay`; e2e `tx-sendTx-default.test.ts:192-195` and `fee-sponsor-funding.test.ts:261` seed the FJ quote and refuse `https://api.coingecko.com` (`interceptRpc`, as `hero-prices-unavailable.test.ts`) for the assertion's life, then assert the exact helper-built strings; `same-token-concurrent-sends.test.ts:722-723` pins the quote the same way and requires `~X FJ ($Y)` at all three positions (the new fee, the accepted cap, the button). No new e2e scenario; the PR states each touched file's wall-clock before and after.
- **Gate:** `bun run lint && bun run typecheck:all && bun run test:all` exit 0; `cd apps/extension && bun run test:e2e -- --retry=0` green; `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts` green for the three files, then under `NULO_E2E_BROWSER=firefox`; load1 < 150 before each run; screenshots from the `093fa10d` and arc builds (scratch under `~/.cache/nulo-backlog/fees-display-1/`).

## Decision ledger

| # | Question | Chosen | Codex r1 | Opus |
|---|---|---|---|---|
| D1 | Helper home | `utils/fee-estimation.ts` | agree | agree |
| D2 | Wire's preformatted fields | drop, in Phase 2 with their readers | agree | agree |
| D3 | Value slots | L3 `FeeAmount.vue`, one root | agree | agree |
| D4 | "Named once" | private formatters | agree, narrower claim | agree |
| D5 | `~` after a qualifying word | literal, no ask | agree | file a non-blocking ask |
| D6 | Sponsor screen-reader sentence | keep its words | agree | agree |
| D7 | e2e with a live quote | seed and refuse the provider | seeding alone fails | seeding alone fails |
| D8 | Window price reads | each fee card owns its quote (`AppFeeLine`, `FeeRaisedCard`), mounted only when a fee shows | new (S1); final: not in `OperationCard`, not on legend-only paths | — |
| D9 | USD typography | preserved per site (`usdClass`) | preserve, or ask (r1 and final) | name it explicitly |
| D10 | Mono coverage | every figure in markup; button labels keep their face (OA-1 A, D-orch) | final: needs the owner's or orchestrator's call; settled | — |
| D11 | A figure inside a 12 px sentence | `fee_figure`: `type--fiat` at 12 px (`type--meta` is 13 px); the app-paid figure's weight 600 → 400 (OA-2, ships A) | impl r1: settle the weight | impl: needs the owner's answer |
| D12 | The fee window's Confirm | `Send for ~X FJ` from the question: no dollars, which overflowed the half-width button (OA-3, ships A); names the fee before the card mounts | impl r1: restore the pre-mount figure | impl: commit the fix; OA-3 needs sign-off |
| D13 | e2e quote pin | refuse at the scenario's start, seed once `PRICE_FETCH_TIMEOUT_MS` has passed; read the priced figure once it settles | impl r1: close the cache-write race | impl: poll, do not read once |

D5: Codex's reading wins (both passes): the signed words already answer it, and an ask would reopen a signed pick. D9: two Codex passes held that one grammar does not authorize one size; preserving costs one class prop and asks nothing.

## Audit verdicts

**Codex r1 (session `01a14b0b`), conditional approve.** Accepted: S1 → D8 and its test; F1 → Fact 1; F2 → `FEE_RISE_ASKS` derived; F3 → Inference (a) (CoinGecko is a smoke-guard refusal; the network suite has no guard); F5 → the wire drop and old-helper deletion move into Phase 2 with their readers, and the fee window's `formatGasBalance` call is covered by the kept default; F6 → `pages/tx/[id].test.ts` through the real row; F7 → D7. Partly rejected: F4 (typography) → D9.
**Opus (Plan), conditional approve.** Accepted: D7 pinning; the derived `FEE_RISE_ASKS`; keep `formatGasBalance`'s default instead of an argument two unchecked SFCs could drop; regenerate `src/types/*.d.ts`; the rounding-forcing wire fixture; `FeeAmount`'s text-equality assertion; four `FeeAmount`s in `TxFeeRow`; the priority check named; the corrected quote attribution, Fact 3 and cap claim. Rejected: the D5 ask. Recorded, no change: the re-ask sheet keeps the quote it opened with (`RecentActivityView.vue:411`), as today.
**Codex final pass (fresh session `01a14b1d`), conditional approve.** Accepted: D9 preserved; D10 mono coverage, with the button exception stated; the removed helpers' and formatters' tests move in the phase that removes them; the concurrent-send assertions cover all three positions; D8 reworded (after the session gate, during `init`), proven through the real card, and kept out of `OperationCard`. Agreed: D5. **Resumed:** D9 and the test migrations resolved; new D8 path (a default-entrypoint operation is app-paid but never estimated, so a card-owned client would read a price for a legend) → `AppFeeLine` mounts only with an estimate; D10 → OA-1. Verdict: `conditional approve (with conditions: prevent price refresh for the legend-only default-entrypoint path; obtain and record the owner/orchestrator disposition of D10's button-role exception)`; the first is folded, the second is OA-1, answered A by the orchestrator (D-orch), which settles the verdict's last condition. **Approved** by the orchestrator, 2026-10-17, at `73b52d8e`.
**Implementation, Codex r1 (session `01a14b74`) on `2c0df3b9..747b722b`, conditional approve.** F1 (the pin's seed can lose a cache-write race with a fetch in flight) → D13, the seed waits out `PRICE_FETCH_TIMEOUT_MS`, now named in `price/spec.ts`. F2 (the app-paid figure's weight 600 → 400) → OA-2. F3 (Confirm lost its figure until the card mounted) → D12, read from the question. Sound per Codex: rounding, the shortfall, balance precisions, the queued cap, re-ask strings, the priority gate, no reader of the dropped wire fields, the price clients behind their gates, the zero-read tests with their controls, `pinnedFeeTexts`' interval reasoning.
**Implementation, Opus (general-purpose) on the same range, conditional approve.** F1 = Codex F3; F5 = Codex F1. F2 (the e2e read a priced figure once, before its quote may have answered) → `settledText` in the fee window spec, and the re-ask loop waits for Home's gas card dollars before it opens the sheet, which keeps the quote it opens with. F3 = OA-2. F4 (a test name claimed "a failed estimate" reads no price; the line reads one while the estimate runs) → renamed. The first screenshot showed the plan's Confirm with dollars clipped in its half-width button → OA-3 and D12.
**Implementation, Codex r2 (resumed) on `2c0df3b9..3ae6b7c6`, conditional approve.** Resolved: r1 F3 (the pre-mount Confirm); `settledText`; the Confirm label and the card's nowrap figures. New: the re-ask wait watched the gas card's price client, not the feed's → the feed states its quote (`data-fee-quote` on `activity-feed-root`, beside `data-active-account`) and the loop waits on it; the app-paid line was still read once → polled until both figures carry dollars. Not changed: the pin's grace period leaves a write delayed more than a second past its fetch's abort uncovered; closing it needs a refusal armed at launch, before any fetch, a change to every network fixture, which the plan's "seed and refuse for the assertion's life" does not cover; the limit is stated at the fixture, and a lost seed fails the assertion rather than passing it. OA-2 and OA-3 await the orchestrator's answer; the arc ships A for both.

## Delivery

Single arc, one PR against `dev` from `worktree-fees-display-1`, no stack. Title: ``feat(fees): one helper prints every fee as `~X FJ ($Y)` ``. Body: the pick quoted with its id, the screenshots, the validation runs with outcomes, the e2e wall-clocks, `Closes #515`. Merge `origin/dev` before opening; take any landed P38-03 label or Presto line as the base. Open without labels; add `e2e:extension-network` afterwards only if the path filter skips it.

## Post-implementation

Follows `implementations-plan/README.md` § Post-implementation standard at `093fa10d`, `code_review: off`. Specific here:
- **Loop:** one pass over the net diff from `093fa10d` after Phase 4: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside the first round. Hard stop at three rounds.
- **Then:** the Phase 4 gate on the final head, `bun run check:plans` after staging, push, `gh pr create --base dev`, `gh pr checks <n> --watch`. Never merge.
- **Close-out** as the PR's final commits; teardown after the merge: `agent-worktree done fees-display-1 --merged`, run by the session that notices it.

## Seeds (draft)

- `/goal` Phases 1–4 marked ✓ in implementations-plan/fees-display-1/plan.md, each gate's output in the transcript; the Codex loop converged (a resumed round with no new material finding, quoted); the PR against dev exists with `Closes #515`; `bun run test:all` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/fees-display-1 forward per plan.md; never idle; decide with Codex; never merge.
