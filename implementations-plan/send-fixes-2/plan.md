---
plan: send-fixes-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 0dc22a9c5
status: active
---

# send-fixes-2: four Send defects the owner named on 2026-11-17

The owner tested Send on `dev` on 2026-11-17 and named four defects. Each sentence, verbatim, is the whole visible budget of its fix:

1. "when selecting the recipient in the send flow, the last account/row should not have a border-bottom" (#1825)
2. "the warning icon is not aligned with the paragraph" (#1828)
3. "a transfer shows the plain token amount while proving, then adds the USD once sent, and it flickers" (#1826)
4. "selecting radios/options on the Send pop-up leaves an awful white ring on the last focused radio (for example 'Private' on from balance, 'They receive it'), also on 'WHO PAYS THE FEE'" (#1827)

One arc, one PR against `dev`. It changes what users see, so it does not land on its own: the orchestrator lands it on the owner's approve of its captures. Recon and the before measurements: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md) (two, neither blocks the arc).

Proportion (lane brief): four local fixes. No plan audit round, no Opus; one Codex pass over the plan and the net diff after the build.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | `SendPersonStep.vue`: `.person:last-child { border-bottom: none; }`, for both lists (Recent, Your accounts). | The list's rule for its end, as `SendReviewSheet.vue`'s `.row:last-child` already is; every other row keeps its divider. Rejected: `.person + .person` top borders (same pixels, a second spelling of the house rule). |
| D2 | A glyph leading a paragraph centres its 14 px box on the paragraph's first line box: `align-items: flex-start` in `publish-mark.module.css`'s `.warning_box`, one place for the form's `send-fee-warning` and the review's `send-review-warning`. The fee card's rows are left as they are. | Measured before (recon F2): the form's glyph box starts 2 px above its 15 px first line, its centre 2.5 px above the line's, its triangle's centroid 2.0 px above the x-height centre; on the line's top the box centres within 0.5 px. The fee card's warning rows already centre the glyph on their first line (their text is `line-height: 1`, 12 px, nudged 1 px down beside the 14 px glyph): measured centre 0.5 px off, so the brief's anchor there did not hold. The Fee Juice nudge centres its glyph on a title and its caption, a two-line item rather than a paragraph; moving it is owner ask A2. |
| D3 | One price reading per activity surface, owned by the surface and feeding both phases of a row. `TransactionAwaitingCard` takes `amountFiat` and forwards it; `journalCardFiat(op, tokenById, fiatLabel)` beside `journalCardAmount` in `utils/journal-state.ts`; `RecentActivityView` passes it from `incomingPrices` (journal cards and the orphan-task card); `TransactionCard` takes `fiatLabel`, `iconFor` and `isFlagged` from `ActivityRowCard` (which already holds them) and drops its own `PriceServiceClient`; `activity.vue` owns one `usePrices` (in place of `useTokenFlags`) for its in-flight cards and hands its lookups to `TransactionsList`, which drops its own. | Two causes (recon F3): the in-flight card has no fiat input at all, and every settled row builds a reading whose quotes start empty, so a row that mounts at settlement paints without its line. Adding fiat to the in-flight card alone would make that first settled frame drop the line: a worse flicker. Rejected: reserving the line's height while proving (hides the jump, keeps the cause; the fiat is known then, from the same token, amount and quote). With one reading, a row the surface cannot price lacks the line in both phases, so the line count never changes. No new request: `activity.vue` already refreshed stale quotes through `TransactionsList`; a popup page is not the window document Privacy Policy § 5.2 keeps from fetching. |
| D4 | `SideChoice.vue` `.choice` and `FeeMethodRadios.vue` `.option` draw their 2 px accent ring on `&:has(> .radio:focus-visible)` instead of `&:focus-within`, offsets unchanged. | Accessibility call under the owner's 2026-10-19 delegation (CLAUDE.md § Keyboard & focus order; the accent ring on `:focus-visible`). A mouse pick focuses the invisible radio, and `:focus-within` matches any focus; `:focus-visible` matches keyboard focus, which keeps the ring for a keyboard user. The radio is `opacity: 0`, so it paints no outline of its own (recon F4). The chosen row keeps its accent border, inset bar and tint. The `:has(> … :focus-visible)` form is the one the row targets use. No other surface reuses them: on the Fee window and the execute window `FeeSettingsCard` renders `FeeMethodSelector`, not the radios (`onSend` only); `FeePriorityRow` and `OnboardingPhraseCheck` already ring on `:focus-visible`. |
| D5 | Tests: item 3 in the component and unit layers; item 4 inside two existing smoke scenarios; items 1 and 2 none. | Item 3: the row's lines are props through the real layout, so jsdom can pin them. Item 4: only a real browser evaluates `:focus-visible`, and Chrome and Firefox decide it apart. Items 1 and 2 are a static CSS rule each; a source pin would restate it, and the captures with the measured geometry prove them. No e2e scenario is added, so no suite wall-clock before/after is due; the added assertions' runtime is measured. |
| D6 | Captures from a scratch kit under the lane's cache dir, never committed: a smoke spec (items 1, 3, 4, Chrome and Firefox) and a network spec through `agent.sh` (item 2: the form's warning, and the Fee sheet's unconfirmed row as the unchanged reference). | The warning needs a funded sandbox account; the rest is seedable in smoke. |

## UI impact

- **Send, person step, the last row of "Recent" and of "Your accounts"** (`SendPersonStep.vue`): before, a 1 px rule under the last row; after, none. Every other row keeps its rule. Sign-off, the owner (2026-11-17): "when selecting the recipient in the send flow, the last account/row should not have a border-bottom".
- **Send form's fee warning and the review sheet's warning** (`publish-mark.module.css`): before, the glyph rides 2 px above the paragraph's first line; after, it is centred on that line. Copy, colours and the box unchanged. Sign-off, the owner (2026-11-17): "the warning icon is not aligned with the paragraph".
- **Home's Recent activity and History, a priced send in flight** (`TransactionAwaitingCard`, `TransactionCard`): before, the amount alone while it proves, then `≈ $x` added once sent; after, `≈ $x` under the amount from the first paint in both phases (an unpriced token shows it in neither). The settled row's token mark also paints with its first frame. Sign-off, the owner (2026-11-17): "a transfer shows the plain token amount while proving, then adds the USD once sent, and it flickers".
- **Send's "From your balance", "They receive it" and the Fee sheet's "Who pays the fee"** (`SideChoice.vue`, `FeeMethodRadios.vue`): before, the ring stays on the last picked row after a mouse pick; after, it shows on keyboard focus only. Sign-off, the owner (2026-11-17): "selecting radios/options on the Send pop-up leaves an awful white ring on the last focused radio (for example 'Private' on from balance, 'They receive it'), also on 'WHO PAYS THE FEE'"; the keyboard ring kept is an accessibility call under the owner's 2026-10-19 delegation.
- Nothing else: no testid, copy, tooltip, glossary term or stored key.

## Security & Adversarial Considerations

- **Threat model.** No new input, storage, permission, request or log line. The fiat line renders a string `usePrices` builds from the signed list's mapping and a fresh quote; Vue escapes it.
- **Hostile journal rows.** `journalCardFiat` takes the stored `amountRaw` through `parseSide`, as `journalCardAmount` does, so a malformed or empty amount, a dApp operation or a token of unknown decimals yields no line (one unit case per refused class).
- **Privacy.** No price request is added (D3). The execute window keeps `useTokenFlags`; nothing in a window document changes.

## Assumptions

**Facts** (checked at `0dc22a9c5`; detail and measurements in [`recon.md`](recon.md)): F1 every `.person` row draws `border-bottom`; F2 `.warning_box` is `align-items: baseline`, and the fee card's warning rows already centre their glyph; F3 `TransactionAwaitingCard` has no fiat prop and `TransactionCard` and `TransactionsList` each own a `usePrices`; F4 both radio rows ring on `:focus-within` and their radios are `opacity: 0`.

**Asks.** A1, A2 in `OWNER-ASKS.md`; the arc ships without them.

## Phase 1: the four fixes, their tests, the captures and the PR ✅

1. `apps/extension/src/popup/components/modules/send/SendPersonStep.vue`: D1.
2. `apps/extension/src/components/composite/send/publish-mark.module.css`: D2's `align-items`.
3. D3: `apps/extension/src/utils/journal-state.ts` (`journalCardFiat`), `components/composite/activity/TransactionAwaitingCard.vue`, `popup/components/modules/activity/{TransactionCard,ActivityRowCard,TransactionsList}.vue`, `popup/components/modules/general/RecentActivityView.vue`, `popup/pages/activity.vue`.
4. D4: `apps/extension/src/components/composite/send/SideChoice.vue`, `apps/extension/src/popup/components/modules/send/FeeMethodRadios.vue`.
5. Tests (wire-shaped amounts, as the journal stores them):
   - T1 `apps/extension/src/popup/components/modules/activity/send-row-lifecycle.test.ts`: a priced token's send drawn proving and settled, each built the way the views build it, shows the same amount column (`["12.5", "≈ $12.50"]`) and line count; the settled card carries its line on its first render, before any promise settles. The existing unpriced case stays the control (no line in any phase).
   - T2 `apps/extension/src/utils/journal-state.test.ts`: `journalCardFiat` gives the label for a priced transfer and null for each refused class (a dApp operation, unknown decimals, an empty or malformed `amountRaw`, an unpriced token).
   - T3 `apps/extension/tests/e2e/send-keyboard.test.ts`: after the existing keyboard ring checks (the success control), a pointer pick on a side choice and on a fee payer leaves the row with no outline.
   - Existing tests that mount `TransactionCard` or `TransactionsList` pass the lookups as props instead of mocking a per-row client; no assertion is loosened.
6. Captures (D6), before already taken at `0dc22a9c5`, after on the final head, at 400 × 800 (2× on Chrome), light and dark: `sf2-recipient`, `sf2-warning` (+ `-fee`), `sf2-proving` (`-proving`, `-sent`), `sf2-ring` (`-mouse-*`, `-tab-*`, Chrome and Firefox), into the lane's `shots/` with `captions.json`; the four after-pairs committed under `pr-captures/send-fixes-2/` in one commit and removed in the next.

**Validation gate** (retry 0, one command at a time, from the worktree root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` after staging; from `apps/extension`, the armed smoke build, then `bun run test:e2e -- tests/e2e/send-keyboard.test.ts tests/e2e/rows.test.ts tests/e2e/send-outcome-rows.test.ts --retry=0` on Chrome, and `NULO_E2E_BROWSER=firefox bun run test:e2e -- tests/e2e/send-keyboard.test.ts --retry=0` on the Firefox armed build (focus is a browser difference); the after network capture run with `tests/e2e/network/fee-shortfall-recheck.test.ts` in the same `agent.sh` invocation. Pass: every command exits 0; T1 to T3 pass and fail on the base; every other assertion passes unedited; the after captures show the four fixes and nothing else moved.

## Delivery

One PR from `send-fixes-2-a1` (off `origin/dev`, carrying the plan commit) to `dev`, opened ready, no label. Title (85 characters): `fix(send): recipient divider, warning glyph, in-flight fiat line and radio focus ring`. The body quotes the four sentences as the sign-off, states D4 as an accessibility call under the owner's 2026-10-19 delegation, embeds the after captures from `pr-captures/send-fixes-2/`, lists the gates with outcomes, says no e2e scenario was added, and carries `Closes #1825`, `Closes #1826`, `Closes #1827`, `Closes #1828`. Merging is the orchestrator's, on the owner's approve.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `0dc22a9c5`. Plan-specific values:
- Step 1: `code_review: off`, so absent.
- Step 2, bounded work: ONE `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over the plan and `origin/dev...HEAD`, asking whether anything but the four items changed, whether D3 removes the cause rather than hiding the jump, and whether D4 keeps keyboard focus visible on every radio group. A second round only if the first says anything but approve (resume; hard stop at three). Rerun only the gates a fix touches.
- Step 3: `gh pr create`; `gh pr checks <n> --watch` once.
- Step 4, in the same PR's final commits after merging `origin/dev`: Outcome, lessons, `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line to `archive/index.md`.
- Step 5: teardown is the orchestrator's.

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build send-fixes-2 per `implementations-plan/send-fixes-2/plan.md`: Phase 1 green, captures, one Codex pass, PR open with captures; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished step of `plan.md`, record its gate, stop at the open PR.

## Audit verdicts

No plan audit round (lane brief, Proportion).

- **Codex pass, round 1** (gpt-6.1-sol, high, read-only; plan and `origin/dev...db9d5344e`): `changes` on one comment-only finding, three test comments that restate their lines (`send-row-lifecycle.test.ts`, `TransactionCard.test.ts`, `TransactionsList.test.ts`). Accepted: deleted (`728f7e5c0`). No functional finding; it answered no visible change beyond the four items, D3 removes both causes rather than hiding the jump, D4 keeps the keyboard ring on both radio groups by construction.
- **Round 2** (resumed over `db9d5344e..26c87198d`): `approve`.
