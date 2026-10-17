---
plan: ui-leftovers-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev 1b93cbfa
issues: "#635, #639, #628, #618, #634, #583 (all closed by the one arc)"
---

# ui-leftovers-1: five small fixes from decision page 35

Decision page 35 (2026-10-17) settled five leftovers and, as an amendment the orchestrator relayed at implementation, #583's two-chip row past its room (P35-08 B, Phase 6); each pick is a Decision block on its issue. One arc, one PR against `dev`. Over the light target by the amendment's phase. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

## Outcome & Quality Bar

- **For whom**: a person on the popup who copies an address, reads a balance, or watches a dApp call run, on Chrome or Firefox.
- **Excellent looks like**:
  1. Each of the five screens does exactly what its pick says, and nothing else on screen changes. The PR body shows each surface, light and dark, before and after.
  2. Each rule lives in one place: one predicate for "prices unavailable", one "dApp" fallback, one toast-life rule. No surface carries a copy.
- **Good enough**: the gaps found while planning (OA-1, OA-2) ship unchanged and wait for the owner.

## UI impact

- **Token page hero (#635)**: no tap, no copy, no toast, no pointer cursor; a long balance stays cut at 20 characters. Signed: *"Remove it there too: both heroes are display only; a long balance shows cut, as it already does."* (`p35-tokenhero-b`).
- **Header address (#639)**: a drag selects the shortened address in the browser's highlight; a click still copies the full one; Enter and Space still copy. Signed: *"Make it selectable like the others: a drag selects the shortened address, a click still copies the full one."* (`p35-hdraddr-a`).
- **In-flight activity row (#628)**: a nameless dApp's in-flight row (the journal's awaiting card) shows the "dApp" chip. Signed: *"Both rows show the dApp chip: the in-flight row gets the same fallback as the settled one."* (`p35-nameless-a`). The terminal journal row and the journal details' App row are OA-1 and ship unchanged.
- **Holdings total (#618)**: once the first price answer is in and no priceable holding has a price, the total reads "—" in its role and the meta line reads "Prices unavailable". Signed: *"Holdings takes the hero's unavailable state: a dash in the total's role, with Prices unavailable under it."* Drawn as `p35-holdings-a`: *"the total takes the hero's unavailable state, "—", with the meta line "Prices unavailable""*, so the count leaves the line. Before that answer the page reads as today (OA-2).
- **Toasts (#634)**: a success with an action lives 6 s; a success without one, 2 s. Signed: *"A success with an action stays 6 s as before; plain successes (Address is copied) close after 2 s."*
- **Two-chip activity row past its room (#583, P35-08 B)**: where #650's app chip reaches its 19 px floor (about $1,000 at 360 px), the app chip drops under the whole direction chip at its 96 px cap ("SHIELDED PAY…"), the row 68 px. Only a direction chip wider than the whole chip room (an extreme amount) still breaks, above the dropped chip, and the row grows further. Below that point the row is #650's one line, unchanged. Signed: *"From $1,000 the app chip drops under the direction chip, as today, keeping SHIELDED PAY…; that row is 68 px."* (`p35-bigrow-b`).

## Architecture & Implementation

- **#635.** Delete the tap from `BalanceView.vue`: the `:onClick` binding, `.tappable`, `handleTokenBalanceClick`, `handleCopy`, `showFullBalance`, `totalTokenBalance` (no other reader), and the imports only they use (`copyWithToast`, `selectedWithin`, `useToast`). `heroCandidates` passes `20`.
- **#639.** `Header.vue`: `.address_text` gets `user-select: text`; the click handler skips the copy when `e.detail > 0 && selectedWithin(e.currentTarget)`, with a one-line comment saying why keys pass. A native button turns Enter and Space into a `click` with `detail === 0` (probed, Chrome 152 and Firefox 153), so keys still copy, as the scope rows' separate key handlers do. The element stays a `<button>`.
- **#628.** `utils/tx-enrichment.ts` exports `DAPP_LABEL = "dApp"`; `getOriginLabel` uses it. `journalCardOriginLabel` (`journal-state.ts:441`, the awaiting card's only source) returns `sanitizeJournalSubtitle(op.subtitle) ?? DAPP_LABEL`. The orphan card is never a dApp's (`isExecutingTask` admits UI transfers only, `RecentActivityView.vue:648-658`), so `executingOriginLabel` stays. `dappCardFields` (terminal card) and `journal/[id].vue` keep `sanitizeJournalSubtitle` until OA-1; the "same leaves" comment above `journalCardTitle` is narrowed so it stays true. If OA-1 is A, `dappCardFields` calls `journalCardOriginLabel`.
- **#618.** Move `isPriceableHolding` and `pricesUnavailable` from `BalanceView.vue` into `utils/token-aggregate.ts`, over `(rows, fiatOf, prices)` where `prices` is the `usePrices` result typed structurally as `{ mapped: Readonly<Ref<boolean>>; isPriced(chainId, contract): boolean }`. Both pages pass `prices` itself, so no caller can freeze `mapped`. Home's behaviour is unchanged. `holdings.vue` computes `unavailable = showFiatValues && prices.settled && pricesUnavailable(...)`. Then the total shows an `aria-hidden` "—" in `.summary_fit` and the meta line "Prices unavailable". `totalDisplay` and `summaryMeta` feed both the line and the fit's ruler, and the fit's watch keys on them.
- **#634.** `packages/design/src/composables/toast.ts`: `ACTION_TOAST_MS = 6_000`; `openToast` arms `options.action ? ACTION_TOAST_MS : SUCCESS_TOAST_MS` for a success. Hold and release keep working on the remainder. No call site changes. Three texts that say "2 s" follow the rule: the `useToast` TSDoc, the story label (`ToastManagerBase.stories.ts:43`) and `waitForToast`'s docstring (`tests/e2e/fixtures/widgets.ts:59`).
- **#583 B.** `TransactionCard.vue` `.chips` gains `flex-wrap: wrap` and a 4 px row gap (`gap: 4px 6px`, the #633 row's). A flex line breaks on each item's hypothetical size, and the slot's is its 19 px floor (`flex: 1 1 0; min-width: 19px`), so the slot wraps exactly where #650 would start breaking the direction chip: below that point every item fits one line and the layout resolves as the single-line container did. On its own line the slot grows to the line and the chip hugs its name up to the shared 96 px cap. The `::before` stays: between 19 px and the first letter's room the one-line chip still shows "…" alone. The comments on `.chips` and `.app_slot` say the wrap rule. No script, no measuring.
- **Alternatives not taken**: a per-call `durationMs` on `ToastOptions` (new config surface; the spec is a rule of the toast's shape). Holdings without the `settled` gate (it would claim "Prices unavailable" before any answer). Splitting keydown handlers on the header button, or making it a `span role=button` (re-implements native activation; the probe shows the native button already selects). Applying the fallback at persistence (`discoveryDappMetadata`) instead of render (it would write "dApp" into stored rows and change the connect window's name).

## Security & Adversarial Considerations

- **Threat model**: a hostile dApp controls its name. #628 changes only the empty case: a name that sanitizes to `""` now renders the fixed word "dApp". A schemeful name is still bracketed (`sanitizeJournalSubtitle` runs first). The chip is display text, not identity: a dApp can name itself "dApp", as it can today on the settled row. Nothing new reaches storage or a log.
- **Clipboard**: #639 keeps the full sanitized address in the clipboard (`copyAddressToClipboard`, unchanged). A drag copies only what the browser selected (the shortened text). #635 removes a clipboard write.
- **Prices**: #618 reads the same signed-list mapping and quotes as Home; it can hide a figure, never invent one.
- **Least privilege, crypto, supply chain**: N/A. No permission, dependency, key or workflow changes.

## Assumptions

**Facts**
- F1: `totalTokenBalance` is read only by the click; `showFullBalance` is set only by it and also widens the hero's candidate list after a tap (`BalanceView.vue:63,74-79,144,165-178`); `amount.callers.test.ts:16` pins BalanceView at `[3, 0]`.
- F2: a `user-select: text` child of a native `<button>` is drag-selectable in Chrome 152 and Firefox 153, and the drag ends in a `click` with the selection set; Enter and Space clicks carry `detail 0`, a mouse click `detail 1` (probe, recon.md).
- F3: `sanitizeJournalSubtitle("")` returns `null` (`journal-state.ts:128`); `getOriginLabel` falls back to "dApp" (`tx-enrichment.ts:131`); the awaiting card is a nameless dApp's only in-flight row (`RecentActivityView.vue:493,648-658`).
- F4: `usePrices` sets `settled` on the first refresh answer or failure (`usePrices.ts:72-88`); the price fetch aborts at 10 s (`price/service.ts:357`).
- F5: only two success toasts carry an action (`useArrivals.ts:362`, `send-submit.ts:87`); `ToastManagerBase.test.ts:443-496` holds three action toasts and expects the close 1 400 ms after release.
- F6: no e2e clicks `balance-amount`, reads the Holdings total, or times an action toast to its close (recon.md).
- F7: smoke builds nothing: it needs an armed build, and `audit:vue`'s plain build disarms `dist` (`.claude/skills/e2e-testing/SKILL.md` § Build-armed tests).

**Inferences**
- I1: the hero's first render is unchanged: its candidate list is the same 20-character cut. Only the after-tap expansion goes, which could draw more digits where the room allows (`hero-fit.ts:54-59`); #635 authorizes that.
- I2: Home's hero keeps identical behaviour after the predicate moves: `BalanceView.test.ts` "no priced holding has a price" stays green unchanged.

**Asks** (to the owner through the orchestrator; the arc ships without them)
- OA-1: the terminal journal row and the journal details' App row for a nameless dApp. OA-2: Holdings' total before the first price answer. Both ship unchanged.

## Phases (one arc)

### Phase 0: base and "before" shots
- Merge `origin/dev`; if testers-fixes-3 or type-scale-1 landed, read their diffs to `RecentActivityView.vue`, `journal-state.ts`, `Header.vue`, `BalanceView.vue`.
- Capture light and dark "before" shots of the four drawn surfaces from the real build, under `~/.cache/nulo-backlog/ui-leftovers-1/shots/`.
- **Smoke recipe** (every smoke run below): first an armed build, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<chrome|firefox>`. Then, from `apps/extension`, `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- <file> --retry=0`. Load1 < 150 first.
- Time `navigation` on the base, per browser, with the recipe (the "before" figure).
- **Gate**: `bun install --frozen-lockfile && bun run lint && bun run typecheck:all` exit 0.

### Phase 1: the token hero is display only (#635) ✓
- Files: `BalanceView.vue`, `BalanceView.test.ts`, `utils/amount.callers.test.ts` (`[2, 0]`).
- Tests: replace the "hero's tap" block with one test over Home and the token page. Each case reads the figure first (success control), then clicks: no `writeText`, no toast, and a long balance's figure is unchanged after the click (the expansion is gone).
- **Gate** ("fast layers" below means its first two commands): `bun run lint && bun run typecheck:all && bun run --cwd apps/extension test BalanceView amount.callers` exit 0.

### Phase 2: the header address is selectable (#639) ✓
- Files: `Header.vue`, `Header.test.ts`, `tests/e2e/navigation.test.ts`.
- Tests (mount into `document`: `selectedWithin` refuses a detached node): the existing copy test dispatches `detail: 1`, so a real pointer click stays proven. A pointer click ending a selection inside the address copies nothing and opens no toast. Enter's click (`detail: 0`) with the same selection still copies the full address.
- E2E, in the existing drag test: the hero-to-header drag now also contains the shortened address. A drag inside the address selects exactly its shortened text and records no clipboard write; a plain mouse click after it writes the full address once (a page-side write counter, read right after the click: the write is the handler's first call). Failure modes jsdom cannot show: a browser ignoring `user-select` in a native button, and the real drag-then-click order. Estimate +0.5 s per browser; measure it.
- **Gate**: fast layers plus `bun run --cwd apps/extension test Header`, then `navigation` by the smoke recipe on Chrome, then on Firefox (selection is a browser difference).

### Phase 3: the in-flight row's dApp chip (#628) ✓
- Files: `utils/tx-enrichment.ts`, `utils/journal-state.ts`, `journal-state.test.ts`, `RecentActivityView.test.ts`.
- Tests: `journalCardOriginLabel` over `""` ("dApp"), a name, and a schemeful name (bracketed). The awaiting-card table row `{ kind: "dapp_execute" }` (`RecentActivityView.test.ts:988`) gives `originLabel: "dApp"`. The terminal case at `journal-state.test.ts:285` stays `null` (OA-1).
- **Gate**: fast layers plus `bun run --cwd apps/extension test journal-state tx-enrichment RecentActivityView` exit 0.

### Phase 4: Holdings' unavailable state (#618) ✓
- Files: `utils/token-aggregate.ts`, `utils/token-aggregate.test.ts`, `BalanceView.vue`, `holdings.vue`, `holdings.test.ts`.
- Tests: one table test for the predicates: priced and unquoted, one quote, empty, unpriced only, before the mapping, zero balance. Holdings: after the answer with no quote, the summary reads "—" and "Prices unavailable", with no "$" and no count. Before the answer (`refreshIfStale` pending), it reads as today (never-happens).
- **Gate**: fast layers plus `bun run --cwd apps/extension test token-aggregate holdings BalanceView` exit 0.

### Phase 5: an action keeps a toast 6 s (#634), then the arc gate (phase ✓; arc gate after Phase 6)
- Files: `packages/design/src/composables/toast.ts`, `toast.test.ts`, `packages/design/src/ui/ToastManagerBase.test.ts`, `ToastManagerBase.stories.ts`, `apps/extension/tests/e2e/fixtures/widgets.ts` (docstring only).
- Tests: a success with an action is open at 5.9 s and gone at 6 s, beside the existing 2 s case. The three hold tests expect the close 5 400 ms after release.
- Gate the phase: `bun run --cwd packages/design test toast ToastManagerBase` exit 0. Then take light and dark "after" shots of the four surfaces.
- **Arc gate**: `bun run audit:vue`, `bun run test:all`, `bun run check:plans` exit 0. Then, after a fresh armed build (`audit:vue` disarmed `dist`), `navigation`, `rows` and `snackbar` by the smoke recipe on Chrome and on Firefox. Record `navigation`'s time per browser against Phase 0's.

### Phase 6: the two-chip row wraps past its floor (#583 B, amendment) ✓
- Files: `TransactionCard.vue` (style only), `tests/e2e/rows.test.ts`.
- Tests: the priced rows scenario's large dApp transfer (12,345.67, seeded today) asserts the wrap, never a dollar threshold: the direction chip on one line, the app chip 4 px under it (±0.5) with matching left edges, the chip at its 96 px cap and cut, its text the dApp's name. The floor-width and "…"-width reads go (no row sits at the floor now); the `::before` read stays. The dApp scenario's 2.5 USDC transfer keeps its one-line assertions (chip beside the direction, above the floor, under the cap): the never-happens control. Row heights stay logged per browser, not asserted (type-scale-1 moves them). jsdom has no layout, so no unit test.
- Byte-identity below the point: Chrome shots of History at 2.5, 25 and 250 USDC before and after compare pixel-equal.
- Shots: light and dark at 2.5 and 1,250 USDC (a scratch spec, never committed), which also logs the ladder 2.5 to 123,456,789.12 (chip width, direction lines, row height) for the PR body; the 68 px is read there.
- **Gate**: fast layers, then `rows` by the smoke recipe on Chrome and on Firefox (a wrap is a layout the engines could disagree on). No added scenario; measure `rows` against #650's 52.5 s / 76.5 s.

## Decision ledger

- D1 #639: guard pointer clicks only (`detail > 0`). Keys keep copying, matching the scope rows.
- D2 #628: fallback at render, inside `journalCardOriginLabel`; the settled and in-flight sites share `DAPP_LABEL`. No new helper: it would have one caller.
- D3 #618: shared pure predicate plus a `settled` gate on Holdings; Home is unchanged.
- D4 #634: the rule reads the toast's own `action`; no per-call duration.
- D7 #628 (implementation): `journalCardOriginLabel` returns null for every kind but `dapp_execute` (was: null for `transfer` only), so the fallback can never put "dApp" on a future kind's card; `token_import` never reaches the awaiting card today (`ACTIVITY_FEED_KINDS`).
- D6 #639 (implementation, 2026-10-17): the e2e's plain-click control clears the selection first. Chrome holds a selection through a click inside it (probe, lessons/phase-0.md), so the first click on a selected address only clears it, as on every `selectedWithin` site.
- D5 #583 (amendment, 2026-10-17, orchestrator spawn; P35-08 B signed on page 35): wrap by `flex-wrap` on the existing slot floor, so the switch point is #650's floor by construction; no new threshold, no measurement code.

## Audit verdicts

**Codex (gpt-6.1-sol, high): approve with changes.** Both accepted; its note that unanswered asks become `owner-decision` issues at close-out is applied.
- C1 (medium, demonstrated): the copy test clicks with `detail 0`, so a guard refusing every pointer click would pass. Accepted: that test dispatches `detail: 1`; the e2e adds a drag inside the address and a plain-click control. Opus O3 and O4 found the same.
- C2 (low): F1 and I1 overstated; "a dApp cannot choose 'dApp'" was false. Accepted: rewritten; the long-balance test proves the expansion is gone.

**Opus 5.5 (Plan): approve with changes.**
- O1 (high, demonstrated): smoke needs an armed build, and `audit:vue` disarms it. Accepted: the smoke recipe, a rebuild in the arc gate.
- O2 (medium, demonstrated): the orphan card never shows a dApp task, so its planned change and test could only pass by bypassing the account containment. Accepted: dropped; recon corrected.
- O5 (ask): "under it" versus the meta line's place and the dropped count. Rejected: the signed drawing `p35-holdings-a` shows exactly that form; its caption is quoted under UI impact.
- O6 (low): a `{ mapped: boolean }` view invites a frozen value. Accepted: pass `prices` itself; the fit watch keys on the shown strings.
- O7 (low): three "2 s" texts left stale. Accepted. Making `tokenHeroCandidates`' `length` required: rejected, no user-facing gain and a tested utility changes for it.
- O8 (low, security): `sanitizeWireString` keeps a plain space, so a dApp named " " still shows a blank chip, in flight and settled. Consequence: none beyond today's, since any dApp picks its own name. Known limit: the implementer files it closed (`known-limit`) at close-out.

**Codex verify (resumed): approve, no new material finding.** One recon wording remnant fixed.

**Codex on the Phase 6 amendment (gpt-6.1-sol, high, session 01a14a5d): approve with changes.**
- A1 (medium): a direction chip wider than the whole chip room still breaks and the dropped chip may get less than its cap, so "stays on one line" was unconditional. Accepted: UI impact and Phase 6 qualified.
- A2 (medium): give the nine-digit fixture a dApp so the extreme case runs through `.chips`. Rejected as a committed test: that row proves a nine-digit send, and a dApp moving $100M+ is the range known limit #645 already records; the scratch ladder measures it once and the PR body reports it.
- A3 (low): `top >= bottom` passes a wrong gap or a sideways chip. Accepted: 4 px gap and matching left edges asserted; the title's centring is the layout's unchanged rule, not asserted.

**Codex fix loop, round 1 (gpt-6.1-sol, high, session 01a14a8e; the net diff from the merged dev 623fc97f, plan files excluded): approve with changes, no production bug.**
- R1-1 (low): the predicate table's "one quote" case quoted every holding, so `.some` in place of `.every` passed. Accepted: two contracts, one quoted; the `.some` mutant now fails.
- R1-2 (low, comments): accepted for `Header.vue` (one tighter sentence), `TransactionCard.vue` ("up to its cap"), `toast.ts` ("a success without an action") and the `readTwoChipRow` doc line (dropped). Rejected for `DAPP_LABEL`'s line: the name does not say it is a nameless dApp's fallback.

**Opus 5.5 diff review (general-purpose), alongside round 1: approve with changes, no correctness, reactivity or security defect.** Folded: the mixed-quote case (same as R1-1); the new `journal-state` describe moved above the sanitizer's header comment and its title's false "as its settled row does" dropped (the settled row does not bracket a schemeful name; pre-existing, out of scope); `mountView`'s dead `attachTo`; the header selection test's cleanup into `finally`; rewrapped TSDoc in `toast.ts` and `widgets.ts`; `DAPP_LABEL` called a label (`tx/[id].vue` shows it as the App value); a clearer wrap comment. Not taken: the network lanes meeting 6 s action toasts (CI's required lanes run them); `execution/service.ts`'s own `"dApp"` log literal (out of scope).

**Codex fix loop, round 2 (resumed session 01a14a8e, the fix diff 77462aa4): approve, no new material finding.** The loop converged.

## Delivery

- One PR against `dev` from `worktree-ui-leftovers-1`, no stack (D-orch-1). Title: `fix(ui): display-only token hero, selectable header address, dapp chip, holdings, toasts` (88 characters).
- Body: each pick quoted with its id and the owner's words, the light and dark shots, the validation runs, `navigation`'s local time and the smoke suite's CI wall-clock per browser before (latest green `dev` run) and after, `Closes #635 #639 #628 #618 #634 #583`. CI's network lane runs too (its filter covers `packages/design/**`); `fee-methods` now meets a 6 s "Transaction submitted" between sends, as before #642. Open it without labels, and only after the gates pass and the Codex loop converges.
- Merge `origin/dev` before opening it. If the merge touched the activity rows or the header, take the #628 and #639 shots again.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `1b93cbfa`. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over the net diff from the merged `dev` (`623fc97f`, which carries #650; the plan's base was `1b93cbfa`), after Phase 6. Prompts start "You are a subagent. Don't run memo." and carry the standard's two rules verbatim. Hard stop at three rounds; log each in `lessons/phase-6.md`.
- If the orchestrator relays OA-1 or OA-2 before the PR opens, fold the answer in as its own phase. Otherwise file each unanswered ask at close-out as an `owner-decision` issue (dedupe first; #628 and #618 close with the PR) and list it on the Outcome's `Open items:` line.
- Teardown after the merge: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ui-leftovers-1/plan.md`, then `agent-worktree done ui-leftovers-1 --merged`.

## Seeds (draft; the orchestrator runs none)

```
/goal implementations-plan/ui-leftovers-1/plan.md done: Phases 0-6 marked ✓ with each gate's commands passing in the transcript, the Codex loop converged on the net diff (a resumed pass quoted with no new material finding), the PR open with Closes #635 #639 #628 #618 #634 #583 and green checks.
```

```
/loop 15m Drive implementations-plan/ui-leftovers-1 per its plan.md: reality check (plan, lessons, git status, PR checks), next pending phase and its gate, then the Codex loop, then delivery; never fold OA-1 or OA-2 in before the orchestrator relays an answer.
```
