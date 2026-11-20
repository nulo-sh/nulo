---
plan: fee-sheet-flake-1
tier: light
status: implementing
issues: "#1899"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon in-session (no Explore agent, the surface is two files); Codex gpt-6.1-sol high design consult + Opus Plan lens; one Codex pass over the plan and the diff
base: origin/dev at 93877b8b1
trunk: dev
post_implementation_hardening: not scheduled
---

# fee-sheet-flake-1: a press that missed its moving control is aimed again, never waited out

`openSendFeeSheet` (`apps/extension/tests/e2e/fixtures/send-page.ts`) pressed Send's Change once through `pointerClick` and waited 10 s for the Fee sheet. It timed out four times on 2026-11-19: Firefox and Chrome network lanes, `send-chaos` warm-up and `same-token-concurrent-sends` (#1899). Test-only work; no wallet code and nothing a person sees changes. Paths are under `apps/extension/` unless they name the repo root.

## Outcome & Quality Bar

- **For whom:** a contributor whose PR reds a required network lane on a Send flow it never touched.
- **Excellent:** (1) a press that lands beside its moving control is aimed again and reaches it, on both browsers; a press that something else took, or one a still control refused, fails at once and names what took it. (2) When the Fee sheet still does not open, the message says which half failed: no click, a sheet that did not open, or a sheet with no payers.
- **Good enough:** the product's moving fee line stays as the owner signed it (#1838 measured the sponsor's slip at 47 px against 30 px); this lane does not reserve its row.

## The issue, checked (#1899)

- **The issue's guess did not hold.** It guessed Change "does not yet take presses". `SendFeeLine.vue:73-84` gives Change no disabled state. In a local run every press that reached Change opened the sheet 3-74 ms later.
- **The payers never come late.** `FeeSettingsCard.vue:506-507` always renders `send-fee-payers` on Send, and `send.vue:1197` teleports the card into the sheet one render after it mounts. Measured 12-494 ms.
- **The mechanism, demonstrated:** Change is 48.6 × 14.0 px at top 491.0 or 506.0. The footer (`send.vue:1325-1333`, `position: sticky; bottom: 0`) grows upward by one 15 px row when a note comes or goes. The notes are the line's own (`fee-line-words.ts:39-47`, the sponsor's cost once the estimate lands) or a card notice (`FeeSettingsCard.vue:431-443`). The estimate runs 800 ms after the amount (`send.vue:630`). `startSend` presses Change 0.1-0.4 s after it types the amount, more on a loaded runner. `pointerClick` checks that Change holds still, aims, then presses one round trip later (3-85 ms locally, median 9). A move inside that round trip puts the press 15 px off a 14 px button: on the fee line (Change moved up) or on the footer's 12 px top padding (moved down). No click reaches Change, `aria-expanded` stays false and the wait runs out. This is the CI signature.
- **Evidence, honestly labelled:** the geometry and the window are demonstrated. Local run, Firefox 158, proverless, 4 pinned cores, the two CI specs: 44 presses, both positions seen, one move 39 ms after a pointerdown. No press missed. That this race reddened CI is **plausible but unverified**: the jobs upload no artifacts (`_extension-network-e2e.yml:420-433` keeps logs only), and the logs show only the timeout.
- **Other mechanism considered:** the sheet opening and then closing. `send.vue:1012-1018` closes both sheets when the watched array is rebuilt. Its getter returns a new array, so any reassignment of `appStore.account`, `profile` or `network` with unchanged ids runs `closeSheets()`. That happens on bootstrap and network switch (`app.store.ts:452-457`, `network-switch.ts:80`), and neither runs on `startSend`'s path. No page saw a premature close (44 of 44 recorded `aria-expanded` true until the payers arrived). Plausible but unverified; no change. The split wait below now tells it apart from a missed press.

## Architecture & Implementation

- **Where the cause is:** `pointerClick` (`tests/e2e/helpers/legal-drivers.ts`). It has always assumed that an element still at the aim is still there at the press. Its own doc already named the mid-move case (ledger row 34), but a move that starts after the still check was not covered. Every call shares the gap, so the fix lives there, not in a Send-only wrapper.
- **The press, now:** `aimAt` (the old centre read and hit test, unchanged) → `armPress` → `page.mouse.click` → `readPress`. `armPress` stores the aimed element and the point in `window.__nuloPress`. It installs window-capture listeners for `pointerdown`, `pointerup` and `click` once per document. Every event of the press is recorded: whether it landed inside the element or on one of its ancestors, and whether the element still covers the point. A label's forwarded click counts too, because everything up to a `setTimeout(0)` after the pointerup is the press's own task. `readPress` waits at most 5 s for that and then decides:
  - **reached** (a click landed inside the element): return;
  - **displaced** (no such click, the element no longer covers the point at the pointerup, it is still connected, and every event landed on the element or an ancestor): aim once more (`MAX_PRESSES = 2`). The second aim must find the same element;
  - **anything else** (another control or a sibling took the press, as a Popup's `close_area` would; the element stayed put but refused, like `pointer-events: none`; the element was replaced): throw `took no click`, naming each event;
  - **the document was replaced** before the read: throw. The record is gone, so nothing proves where the press went.
  - Only trusted events count: a scripted `click()` on the element after a miss is no press.
- **`openSendFeeSheet`:** one 10 s budget for two waits, each with its own message carrying `readSendView`. The first wait is "the sheet is open" (`aria-expanded="true"`). The second is "the payers show in the sheet" (and still open). Both halves are one render after a click that reached Change, so they share the budget of the old single wait.
- **Sibling helpers** (`pickSendFeePayer`, `doneSendFeeSheet`, `openReview`, `submitSend`) and the direct presses in `fee-methods`, `same-token-concurrent-sends`, `send-keyboard` and `send-amount-exact`: one press, then a wait, each through `pointerClick`, so each is fixed by it. No other press in `send-page.ts` or `send-burst.ts` aims at a point: `closeSendFeeSheet`, `chooseRecipient` and `clickByTestId` click in-page.
- **Regression spec:** `tests/e2e/pointer-click.test.ts` (smoke, both browsers). It builds a stage on `about:blank`: a 14 px control 30 px into its ground. The page's first `elementFromPoint`, which is the aim's own hit test, changes the control in that same task. Five cases: it drops 15 px (one re-aim, exactly one click on it); a checkbox drops inside its label (the label's forwarded click counts, one press, the box ends checked); a 15 px button takes its place (throws, the other button got the only click); it turns `pointer-events: none` where it stands (throws, no second press); the same, plus the ground's handler calling `target.click()` (throws). Four fail on the base helper, which resolved with only the ground clicked; the label case passes on base, as the success control for the new rule. Failure mode: a press that misses a moving control passes or waits out. Only a real browser's input path shows it, so no cheaper layer can. Measured: the file runs in 3.7 s on Chrome and 8.1 s on Firefox, launch included.
- **Alternatives not taken:** (C) wait for the estimate before pressing. A card notice can still land later, so there is no single "the line is settled" signal; held and queued estimates would change what those tests prove; `send-chaos` abandons sends mid-estimate. (D) Press Change by keyboard. That loses the hit test the suite keeps on purpose. (B) A Send-only wrapper. That leaves the other ~60 presses with the gap and copies the press contract. Removing the race itself takes the product: a note row that does not move Change is a layout change, the owner's call.

## Security & Adversarial Considerations

Test code only, run against local sandboxes. No credential, permission, network or dependency changes. The adversarial question is a test that passes on the wrong state: a re-press that runs twice or lands on another control. The decision rule above refuses both. Read as the panel did in the ledger below.

## Assumptions

- **Facts:** (1) Change has no disabled state (`SendFeeLine.vue:73-84`). (2) The payer group always renders on Send (`FeeSettingsCard.vue:189`, `:506-507`). (3) The estimate is debounced 800 ms, and scheduling clears the result at once (`send.vue:630`; `fee-estimation-engine.ts:119-125`). (4) The footer is sticky to the bottom (`send.vue:1325-1328`). (5) Puppeteer 25.14 resolves `mouse.click` after one move-down-up dispatch on both protocols (`puppeteer-core/lib/puppeteer/cdp/Input.js:337-350`, `bidi/Input.js:449-483`). (6) No CI artifact exists for the four failures (`gh api …/artifacts`: 0 for runs 44626995026, 44617555458, 44617747666).
- **Inferences:** (I1) The CI misses were this race. Plausible but unverified (above). (I2) A press dispatched by geckodriver and Chromium reaches the page in one task: pointerdown, pointerup, then every click. The spec passes on both, which supports it.
- **Asks:** none for the owner. The moving fee line is a product fact the owner signed (#1838). Reserving its row would be a new UI decision, and this lane does not raise it.

## Decision ledger

| # | Question | Codex | Opus | Call |
|---|---|---|---|---|
| D1 | Home of the fix | A (`pointerClick`), if the rule is conservative; B splits Send callers across two contracts | A; B is a wrapper for one page | A |
| D2 | When to re-press | only on recorded geometry: the element moved off the point; no transport timeout; the same element | only on a proper ancestor taking the press | both: moved off the point AND only the element or its ancestors took it |
| D3 | Which clicks count | every click, matched to the aimed element, not the testid | every click: a label forwards one, and a re-pressed checkbox would untick | every click until the task after pointerup |
| D4 | Presses | 3 is no time budget; do not restart budgets | one re-press: two misses mean the layout is oscillating | `MAX_PRESSES = 2`; the second press restarts the selector and stillness waits, bounded at two of each |
| D5 | Sheet wait | one 10 s deadline, two messages; payers also need it open | keep the split, it tells close-after-open apart | one 10 s budget, two named waits |
| D6 | Evidence label | displacement and window shown, no missed press seen | same; close-after-open not ruled out | both recorded above |
| D7 | Proof | a deterministic two-engine regression for delivery and refusal | — | `pointer-click.test.ts`, five cases |
| D8 | Review R1: a record gone with its document | counted as reached: a miss elsewhere that navigates would pass | — | throws, naming it |
| D9 | Review R2: a scripted `click()` after a miss | counted as reached | — | untrusted events are dropped; a label's forwarded click is trusted and still counts |

## Review

- Design consult (Codex, fresh, `gpt-6.1-sol` high, read-only; Opus Plan lens in parallel): D1-D7 above.
- Plan and diff pass (Codex, fresh, same settings; diff `93877b8b1..ed9b049ca`): `approve with fixes: R1, R2`, plus comment nits C1-C3 (a listener comment overclaimed, two comments restated code, the spec's header repeated its `stage` comment). All accepted (D8, D9; commit `b201589f4`).
- Targeted verification (the same session, resumed): `approve`, no new finding.

## Phases

### Phase 1: the press, the sheet wait, the spec, the docs

1. Edit `pointerClick` as above. Edit `openSendFeeSheet`. Add `pointer-click.test.ts`.
2. Update the e2e README row, and the e2e-testing skill's `pointerClick` passage with ledger row 71.

**Validation gate:** `bun run lint`, `bun run typecheck:all`, `bun run test`. Then `bun run test:e2e -- tests/e2e/pointer-click.test.ts --retry=0` from `apps/extension` on Chrome and Firefox: green. The same spec against the base `legal-drivers.ts` (from `93877b8b1`): four reds, the label case green. Layers: lint, typecheck, unit, e2e.

### Phase 2: the specs the change reaches

1. Smoke, once per browser, retry 0. These are the specs that press through `pointerClick`, directly or through a Send or Terms helper: `contacts`, `default-network-arrival-update`, `legal-acceptance`, `network-arrival`, `pointer-click`, `popup-stack`, `presto-host-permission`, `rows`, `send-keyboard`, `settings-crud`, `snackbar`, `type-roles`, `viewers-csp`.
2. Network, one `e2e:agent` run per browser, `NULO_E2E_PROVERLESS=1 NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=1960252198`. These are the same set on the network side: `account-switch-isolation`, `auto-lock-defers-while-proving`, `cap-window`, `failed-send-check`, `fee-methods`, `fee-shortfall-recheck`, `fee-sponsor-funding`, `fiat-send`, `imported-account-execution`, `in-flight-send-guard`, `legal-acceptance-wall`, `popup-escape-layered`, `profile-switch-sweeps-transfer`, `same-token-concurrent-sends`, `send-amount-exact`, `send-chaos`, `snack-placement`, `stale-network-a10-capture`, `stale-network-reset`, `store-captures`, `transfers`, `type-roles-windows`, `window-placement`.
   - Skipped by their own guards: `presto-host-permission` runs on Firefox only, and `default-network-arrival-update`'s two tests need `NULO_E2E_UPDATE_FROM`.
   - Left out: the opt-in `update-in-place` and `update-replay`. They need a released build and an update candidate, which the `release` skill makes before each promote. They press only the Terms sheet's two static controls through `answerUpdatedTerms`, and the smoke Terms specs above press the same controls.
3. Firefox, `same-token-concurrent-sends` and `send-chaos` (seed 1960252198), two more runs pinned to 4 cores, making three with step 2.

**Validation gate:** every run green at retry 0. A red gets its cause read: one rerun for a known unrelated flake, a fix for real breakage. Layers: e2e, e2e-live-network (local sandbox).

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `93877b8b1`, bounded work: one Codex pass (`gpt-6.1-sol`, high, read-only) over this plan and the completed diff, then targeted verification of material fixes. Single arc, one PR against `dev`, opened ready for review, `Closes #1899`; the orchestrator merges. Close-out as the PR's final commits; teardown after the merge per step 5 (slug `fee-sheet-flake-1`, trunk `dev`).

## Seeds

- `/goal`: land fee-sheet-flake-1: `pointerClick` re-aims only a displaced miss and throws on any other; Phase 2 green on both browsers; PR closes #1899.
- `/loop`: watch the fee-sheet-flake-1 PR's checks; a red gets its cause read, never a blind rerun.
