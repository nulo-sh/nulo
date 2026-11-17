---
plan: fee-copy-build-1
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
- **Status:** completed. Ships in the PR titled `fix(fees): the app-set fee sentence, the unknown press, History's method row and the readout`, which carries this close-out; it lands on the owner's decision page with its captures.
- **Shipped:** W2, the approval window's app-set Private Fee Juice line as two sentences (P164-01); U1, an unverified contract's press without its generic line when the code names it (P164-02); M2, History's Fee method row as the method over a "Set by {app}" caption with the App row's spacing, the helper returning the two parts (P164-03); A4, "Enter an amount to see the fee." in Send's Fee sheet while the amount is empty (P164-04), and A1's drafted over-balance sentence.
- **Gates (retry 0, Chrome):** at `c316291e8`, lint, typecheck:all, test (1045 files), test:components (104 files) and check:plans green; smoke `rows.test.ts` and `type-roles.test.ts` (their History cases) 2/2, 78 s; `e2e:agent fee-sponsor-funding.test.ts` 4/4, 501 s. The review fixes (`cc19a4939`) reran lint, typecheck:all and the four touched unit files. After merging `origin/dev` (`f8f06e1de`), the readout's and the two authorization popups' unit files reran green. No Firefox run (no fixture or helper change); no e2e scenario added.
- **Deviations:** the over-balance frame came from the local network through `agent.sh`, since the Testnet stub reads no balance; Codex's first round said approve with fixes, so a second round ran (approve).
- **Owner decisions, for the decision page:** A1, the over-balance sentence, ships as drafted (`fcb1-sim-after-over`); A2, the states that keep today's caption, ships unchanged.
- **Lessons:** none promoted (`lessons.md` is at 8,148 of its 8,192 bytes); the rest stay in `lessons/`.
- **Known limits:** #1836.
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` seeds under Seeds.

# fee-copy-build-1: four fee sentences as page 164 picked them

The owner's 2026-11-17 list named four fee sentences. Lane fee-copy-1 drew two or three wordings each (nothing shipped); decision page 164 was signed on 2026-11-17 at 15:09 UTC at dev `0dc22a9c5`, no notes. One arc, one PR against `dev`; it changes what users see, so it lands only on the owner's approve of its captures. It closes no issue and carries no `Part of` (searched "simulation fee estimated", "fee method set by history"; the closed `known-limit` "fee" issues hold nothing on these four). Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md).

Proportion (lane brief): no plan audit round, no Opus; one Codex pass over the plan and the net diff after the build.

## Sign-off (decision page 164; the whole visible budget)

- **P164-01 = W2** (2026-11-17 14:58 UTC), for "The app-set Private Fee Juice sentence on the approval window's fee row: the forced break before "method" and no full stop (today), one sentence (W1), two sentences (W2), or the sentence over a caption (W3)": "Two sentences that wrap where they fall: "You pay about ~0.00184 FJ from Private Fee Juice. Method set by Human Tech." 58 px, 2 lines, still 2 with dollars; the app name in the name role, every testid kept."
- **P164-02 = U1** (2026-11-17 14:55 UTC), for "The unknown contract's press: "Nulo hasn't checked" said twice (today), your cut (U1), one paragraph (U2), or two one-line sentences (U3)": "Your cut: the first sentence goes, the name's paragraph stays as it is, "The name Checkpoint comes from the contract's code. Nulo hasn't checked it." Panel 101 px, the shortest; "hasn't checked it" then refers to the name only, while the UNVERIFIED label above still says the contract is unchecked."
- **P164-03 = M2** (2026-11-17 14:56 UTC), for "History's Fee method row, where the 1.3 px gap is: today, a middle dot (M1), or the method over a "Set by" caption plus the App row's spacing (M2)": "The method on its own line, "Private Fee Juice", over a grey caption "Set by Human Tech", built with the App row's spacing (16 px gap, a key that does not shrink): 119 px clear of the key, which stays on one line. Row 28 px."
- **P164-04 = A4** (2026-11-17 15:05 UTC), for ""Fee estimated after simulation" in Send's Fee sheet before an amount exists: today, two rewordings (A1, A2), the figure's own row with its placeholder bar (A3), a caption naming what is missing (A4, not drawn), or the empty value (A5, not drawn)": "Not drawn: a caption naming what is missing, "Enter an amount to see the fee." (the form is open only once a payee is chosen, so the amount is the one input left; an amount over the balance needs its own sentence)." A4 was never drawn, so this PR's captures are what the owner approves it on.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | W2 from prototype `4eeff67ab`: the `privateFeeJuice` branch reads "You pay about {fee} from Private Fee Juice. Method set by {app}" in one run of text, the `.line` span and its rule deleted; every branch now ends in the stop (the `v-if="priority \|\| !privateFeeJuice"` guard goes). The priority clause appends as today ("… Method set by Human Tech. Includes a ~X priority fee the app asked for."). No non-breaking space. | The pick. The other two branches already always ended in the stop, so their text is unchanged. The not-picked nbsp layout choice stays out. |
| D2 | U1 from prototype `f8265d50f`: `uncheckedLines` returns the name's line alone when the code names the contract, else "Nulo hasn't checked this contract." The site press (`appChipOf`) is untouched. | The pick, with the lane's rule: an unnamed contract keeps a sentence. A contact-named contract with a code name follows the same rule (one function serves both titles). |
| D3 | M2: `describeFeePaymentMethod` returns `FeeMethodLabel = { method: string; setBy?: string } \| null`, `setBy` the caption's text ("Set by Human Tech"), set only where an app set a method the wallet can name (Private Fee Juice, Sponsored, Public Fee Juice (with claim)). An app's method the wallet cannot prove stays one line, `{ method: "Set by Foo" }`, as today; "Unknown (n)", "External FPC" and the person's own picks carry no `setBy`. | The brief: two parts from the helper, not a split of a joined label in the page (the prototype split at ", set by "). The helper keeps owning the copy, so the page interpolates nothing. Rejected: raw `{ method?, app? }` (the page would spell "Set by" in two branches). |
| D4 | The page's row takes the App row's spacing from `af51819d4`: `align="start" gap="16"`, key `app_key` (non-shrinking, 2 px top). The value is a `Flex direction="column" align="end" gap="2"`: the method span (`detail_value`, testid `tx-detail-fee-method`) over `<Text variant="caption" color="tertiary">` (testid `tx-detail-fee-setter`), the column `min-width: 0` and the caption `overflow-wrap: anywhere; text-align: right`. | The pick names the spacing; the 64-character name must wrap inside the box (lessons, flex min-content). The prototype's 2 px margin is the `gap="2"` token. Both cells from type roles. |
| D5 | A4: `FeeCostReadout` gains `waitsFor` (`"amount"`, `"amountInBalance"` or null). Its last branch reads "Enter an amount to see the fee." for `amount`, "Enter an amount within your balance to see the fee." for `amountInBalance` (OWNER-ASKS A1), else today's caption. Send computes it (`amountValidation.reason === "empty"` → `amount`; `exceedsBalance` → `amountInBalance`) and passes it through `FeeSettingsCard`'s new `waitsFor` prop; the other three hosts pass nothing. | The readout cannot tell Send from the approval window or the authorization popups (all four mount it through `FeeSettingsCard`), and only Send has an amount; the readout keeps owning its copy. Rejected: deriving it from `amountTyped` (false by default off Send, so the approval window would ask for an amount); folding `amountTyped` into one enum (changes the pending bar's behaviour for an over-balance amount, outside the picks). |
| D6 | No e2e scenario added; `fee-sponsor-funding.test.ts` reads the two testids (`Sponsored` and `Set by ${app}`) instead of the joined string. | The unit and page tests pin every string; that spec is the one e2e read of the row. |
| D7 | No accessibility call. | No focusable element, Tab stop, ARIA or press state changes; the caption is plain text after the method in DOM order. |
| D8 | `feeWaitsFor` reads the token amount the estimate is asked with, not the visible USD text (Codex R1-F1, argued in round 2). | Unreadable dollars leave no amount, and the field says so; keying off the visible text would show the generic caption there and need a new model on `AmountCard` for one caller. The 250 ms conversion window is closed known limit #1836. |

## States that reach the readout's last branch

The branch shows when no estimate runs, landed or failed, and the card is not reading with an amount typed (`FeeCostReadout.vue:105`). `isEstimating` turns true when an estimate is scheduled, before the 800 ms debounce (`fee-estimation-engine.ts` `schedule`), so a valid amount never reaches it. On Send (`requestEstimate`, `send.vue:832`):

| State | What the page already says | Ships |
|---|---|---|
| Amount empty (also: cleared after a failed estimate; the card still reading with no amount; in USD mode a dollar text the card cannot read, which writes no token amount) | Send's button "Enter an amount"; for unreadable dollars, "Not an amount" under the field | A4 |
| Amount over a read balance (typed, or the balance falls below a landed amount) | "More than your balance" under the field, button "Fix the amount" | A1's sentence (owner ask, captured) |
| Zero; an unreadable amount typed in tokens; the balance not read yet; unknown decimals; the Terms not current | the field's hint, the balance's state or the Terms banner | today's caption (OWNER-ASKS A2) |

Off Send (approval window, the two authorization popups) the branch shows only before the card's first estimate is scheduled; it keeps today's caption (A2). In USD mode the card writes the token amount 250 ms after a dollar keystroke, so Change pressed inside that window shows the old amount's sentence until the estimate's bar replaces it: known limit #1836 (D8).

## UI impact

- **Approval window → the app-paid fee row, Private Fee Juice** (`AppFeeLine.vue`): before "You pay about ~0.00184 FJ from Private Fee Juice" / (break) "method set by **Human Tech**", no stop; after "You pay about ~0.00184 FJ from Private Fee Juice. Method set by **Human Tech**." wrapping where it falls; running keeps the bar, failed unchanged. Sign-off: P164-01 = W2, quoted above.
- **Approval and raised-fee windows → an unverified contract's press** (`contract-chip.ts`): with a code name, one line "The name Checkpoint comes from the contract's code. Nulo hasn't checked it."; without, unchanged. Sign-off: P164-02 = U1.
- **History → a transaction → Fee method** (`pages/tx/[id].vue`): before "Private Fee Juice, set by Human Tech" 1.3 px from the key; after "Private Fee Juice" over a grey caption "Set by Human Tech", the key on one line 16 px clear; the same for "Sponsored" and "Public Fee Juice (with claim)". A row with no setter, or an unproven app method ("Set by Foo"), reads one line as today, now with the row's spacing. Sign-off: P164-03 = M2.
- **Send → Fee sheet → the readout before an estimate**: empty amount "Enter an amount to see the fee."; over the balance "Enter an amount within your balance to see the fee." (A1, the owner's call on the page). Sign-off: P164-04 = A4.
- Nothing else: no testid removed, no glossary term, tooltip or stored key.

## Security & Adversarial Considerations

- **Inputs.** The app name in W2 and M2 is the dApp's declared name through `appLabelOf` (sanitised, capped at 64) as today; the code name in U1 goes through `sanitizeWireString(…, 64)` as today. The caption's `overflow-wrap: anywhere` keeps a 64-letter name inside the box, so a hostile name cannot push the History row off the page.
- **Deception.** U1 drops "Nulo hasn't checked this contract." only where the name's line, which says Nulo has not checked it, follows; the UNVERIFIED label stays. A4's sentence shows only when the amount is empty, never beside a typed amount (D5, the state table).
- No log line, storage key, permission, message or dependency changes.

## Assumptions

**Facts** (checked at `0dc22a9c5`): every anchor of fee-copy-1's notes holds; `describeFeePaymentMethod` has one consumer, the History page; no e2e spec reads the private sentence or the chip lines; `rows.test.ts` and `type-roles.test.ts` open the History page of a dApp-origin row ("Set by …", one line).

**Asks.**
- A1 ([`OWNER-ASKS.md`](OWNER-ASKS.md) A1): the over-balance sentence.
- A2 ([`OWNER-ASKS.md`](OWNER-ASKS.md) A2): the states that keep today's caption.

## Phase 1: the four changes, their tests, the captures ✓

1. `apps/extension/src/popup/components/modules/send/AppFeeLine.vue` (D1).
2. `apps/extension/src/components/composite/contract-chip.ts` (D2).
3. `apps/extension/src/popup/components/modules/tx/tx-detail-helpers.ts` (D3), `apps/extension/src/popup/pages/tx/[id].vue` (D4).
4. `apps/extension/src/popup/components/modules/send/FeeCostReadout.vue`, `FeeSettingsCard.vue`, `apps/extension/src/popup/pages/send.vue` (D5).
5. Tests, rewriting each pin to its new string, none loosened:
   - `AppFeeLine.test.ts` (landed, estimating, priority), `OperationCard.fee.test.ts:668-691`;
   - `ContractChip.test.ts:117-146` (named: one line; unnamed: today's line, the success control), `SendTxSummary.test.ts:247-260`;
   - `tx-detail-helpers.test.ts`: every case returns its `{ method, setBy }`; `pages/tx/[id].test.ts`: an app-chosen PrivateFPC row puts "Private Fee Juice" alone in `tx-detail-fee-method` and "Set by example.dapp.io" in `tx-detail-fee-setter`; a person's pick and an unproven app method render no setter (never-happens beside the control);
   - `FeeCostReadout.test.ts`: each `waitsFor` value's sentence, and null keeps today's caption; `send.integration.test.ts:1306` (empty → A4), `:1373` and `:1382` (over the balance → A1's sentence);
   - `tests/e2e/network/fee-sponsor-funding.test.ts:353-366` (D6).
6. Captures (the kit of fee-copy-1, copied under the lane's scratch dir, never committed): the base and the head, each with the kit's fixture patch applied uncommitted for the capture build and restored after; the armed smoke build and the smoke harness (ports claimed by it); 400 px, light and dark, into `~/.cache/nulo-backlog/fee-copy-build-1/shots/` with `captions.json`: `fcb1-appfee-before`, `-after` (landed, with dollars), `-after-long`; `fcb1-unknown-before`, `-after`, `-noname`; `fcb1-method-before`, `-after`, `-after-long`, `-after-sponsored`; `fcb1-sim-before`, `-after` (empty), `-after-over`. Send's sheet from the Testnet-stub wallet (no request reaches Testnet); the over-balance frame needs a read balance under the stub, which the capture spec arranges or the frame's caption says how it was reached.

**Validation gate** (retry 0, in order, one at a time, from the worktree root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` after staging. Then Chrome only, the armed smoke build, `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/rows.test.ts tests/e2e/type-roles.test.ts --retry=0` filtered with `-t` to the cases that open the History page; then `NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-sponsor-funding.test.ts` (ports from `~/.agents/ports.md`; the 10-minute stall watchdog stays). No Firefox (no fixture or helper change). Pass: every command exits 0; each rewritten pin fails on the base and passes on the head; `git status` clean after the captures and `git grep -n fcb1 -- apps` empty.

## Delivery

One PR from `fee-copy-build-1-a1` (off `origin/dev`, carrying the plan commit) to `dev`, opened ready, no label. Title (92 characters, the cap): `fix(fees): the app-set fee sentence, the unknown press, History's method row and the readout`. The body: `## Sign-off (decision page 164)` with the four picks verbatim; the four `-after` frames embedded from `pr-captures/fee-copy-build-1/` at the commit that adds them (removed in the next); A1 and A2 named; the gates with outcomes; no e2e scenario added; no `Closes`, no `Part of`. The orchestrator lands it on the owner's approve.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `0dc22a9c5`. Plan-specific values:
- Step 1: `code_review: off`, so absent.
- Step 2, bounded work: after Phase 1 is green, ONE `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over this plan and `origin/dev...HEAD`, asking: is A4's sentence ever shown while an amount exists; does the helper's two-part return hold for every fee method it names; was any pinned string loosened rather than rewritten. A second round only if the first says anything but approve (hard stop at three). Rerun only the gates a fix touches.
- Step 3: `gh pr create`; `gh pr checks <n> --watch` once.
- Step 4, close-out in the same PR's final commits, after merging `origin/dev` in: Outcome, lessons, `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line to `archive/index.md`.
- Step 5: teardown is the orchestrator's.

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build fee-copy-build-1 per `implementations-plan/fee-copy-build-1/plan.md`: Phase 1 green, captures, one Codex pass, PR open with captures; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished step of `plan.md`, record its gate, stop at the open PR.

## Audit verdicts

No plan audit round (lane brief, Proportion).

**Codex pass over the plan and the net diff** (gpt-6.1-sol, high, read-only, `0dc22a9c5...247073398`), 2026-11-17: approve with fixes, high confidence. Its answers to the three questions: A4's sentence and the over-balance one never reach the three other hosts (they pass no `waitsFor`); the helper's split keeps every case's meaning (its table covers each method for both choosers); no pin was loosened except two whole-page exclusions.
- R1-F1 [medium], rejected as a code change: in USD mode `feeWaitsFor` follows the token amount, which the card writes 250 ms after a dollar keystroke and leaves empty for unreadable dollars. Verified (`AmountCard.vue` `scheduleConvert`; `AmountCard.test.ts` "1e5", "1,234"). Unreadable dollars are no amount, so A4 is true there (D8); the 250 ms window is closed known limit #1836. Codex withdrew it in round 2.
- R1-F2 [low], accepted: the History page test's two whole-page exclusions restored beside the testid checks (`cc19a4939`).
- R1-F3 [low], accepted: narrating comments deleted (`contract-chip.ts`, `[id].test.ts`); `FeeMethodLabel`'s compressed; `feeWaitsFor`'s states the USD/token distinction (`cc19a4939`).

**Round 2** (resumed, `cc19a4939`): approve, no findings. Comment and test changes only, so no gate beyond lint and the four touched unit files reran.
