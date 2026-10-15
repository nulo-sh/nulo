---
plan: ux-followups-p17
tier: light
status: draft, awaiting the orchestrator's approval
issues: "#450, #449, #448, #413, #363, #192, #230 (all arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) with resume rounds; one Opus Plan critique
base: origin/dev at 479ba56d
trunk: dev
post_implementation_hardening: not scheduled
---

# ux-followups-p17: the six UI follow-ups of decision page 17

One arc, one PR against `dev`. A Details link underlines on hover (#450). The contacts import's progress line comes back after another snack closes (#449) and is read once (#448). A keyboard pick on Send lands on Change recipient with the accent ring (#413). Outline-coloured meta text on Home, Holdings and History moves to `--nulo-secondary` (#363). Two banners say "it" with one network or one account (#192, #230). Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In:** the signed option of each issue, as the lane brief quotes it. #192 and #230 are closed already (#454 closed both); the PR still names them, and the close-out comments on each.
**Out:** #451, #432, #251, #383 (other lanes or closed). The outline text rules #363 names beyond the lane brief's list, and the rest (OA-1). The rest of the two banners' wording with one item (OA-2).

## Outcome & Quality Bar

- **For whom:** a keyboard or screen-reader user on Send and during a contacts import; anyone reading meta text on a dim screen; a dark-theme user hovering a Details link.
- **Excellent:** every changed behaviour matches its signed sentence word for word, and nothing else on screen moves; a screen reader hears the import line once per open and the result once, and the line never shows on the lock screen or after the person closed it.
- **Good enough:** no new token, component or option; real AT behaviour of the live region is argued from the spec and pinned by attributes, not measured.

## Assumptions

**Facts** (recon.md has the citations):
1. Every Details link composes `.detail_link` (`detail-page.module.css:94-102`); jsdom applies no CSS modules and no `:focus-visible`, so their rules are pinned as source text (`detail-page.styles.test.ts`, `utils/a11y-css.test.ts`).
2. `showProgress` (`useContactImportExport.ts:252`) is the only `updateToast` caller; `updateToast` does nothing once its snack is replaced (`toast.ts:69-72`).
3. A lock runs one synchronous seal (`popup/locked-state.ts:20-30`): it closes any snack, sets `appStore.isLogined` false, and resets the import guard; switching profiles runs through lock and unlock (`:24`). A network or account switch only bumps `scopeEpoch` and closes a snack that has an action (`scope-epoch.ts:20`); the import's run fence names profile and session (`ProfileService.assertRunFence`), so the import keeps writing on the network it started on.
4. The info region is `role="alert" aria-atomic="true"`, the success region `role="status" aria-live="polite" aria-atomic="true"` (`ToastManagerBase.vue:129,160`); each open is a new card keyed by id, a relabel keeps the card.
5. After a keyboard pick the next Tab stop after the card is the token card (`send-token-trigger`), then the amount (`send.vue:733-760`). The decision's "Tab then goes on to the amount" holds only in that order; nothing here changes it.
6. `--nulo-secondary` clears 4.5:1 on `--app-bg`, `--nulo-surface`, `--nulo-surface-low` and `--nulo-surface-high` in both themes (lowest 4.58, a pressed row in light); the first two pairs are pinned already.

**Inferences:**
- I1. Screen readers honour a nested `aria-live="off"`: a text change under it is not announced. The spec gives a node the nearest ancestor's politeness; a CDP probe could not show it, and no screen reader runs on this host (recon). Moderate confidence. If an AT ignores it, the line is read as often as today; no other snack can change (D4).
- I2. After the `blur()` no element holds focus, so the input's focus-visible state cannot carry over; `focus({ focusVisible: true })` asks both browsers to draw the ring, and a browser that ignores the option keeps its keyboard heuristic. Chrome: the shots lead's capture. Firefox: proven or refuted by the twin e2e in phase 4.

**Asks** (owner, through OWNER-ASKS.md; the arc ships without them): OA-1, OA-2, OA-3.

## Architecture & Implementation

- **#450.** Add `text-decoration: underline` to `.detail_link:hover`. Every Details link gets it, the block links included ("every Details link", the issue's option B).
- **#449.** `showProgress` returns `{ set, stop }`. It opens the line, then watches `() => toast.value?.id` (default flush) until `stop`. Our id: nothing. Another id: mark the line replaced. No snack while not replaced: the person closed the line, so stop for good. No snack while replaced: re-open at the current count and keep the new id while `appStore.isLogined` holds; otherwise a lock's seal closed the covering snack, so stop for good (a profile switch is a lock). A network or account switch stops nothing, since the import keeps running (Fact 3). `applyHoldingLock` calls `stop()` in a `finally` around `applyImportRows`, so neither the result snack nor the failure snack can bring it back. `ContactIoServices` gains `toast`. The shared toast module does not change.
- **#448.** `ToastManagerBase.vue` marks a card relabelled once `show()` receives the id it already shows (one local ref, compared before `shown` is assigned, reset by any other id), and that card's title `<span>` gets `aria-live="off"`, in either region. The open renders exactly as today, so it is announced as today; from the first relabel on, the count changes under an `off` root, so it is not announced. A snack that is never relabelled never carries the attribute.
- **#413.** `RecipientCard` exposes `focusChange()`, which calls `focus({ focusVisible: true })` on the Change button (template ref). `RecipientField` keeps a ref to the card, and `pickHighlighted` calls `nextTick(() => cardRef.value?.focusChange())` after its `blur()`. A mouse pick is unchanged (the decision says "after a keyboard pick"). `.icon_btn:focus-visible` draws the canonical ring (`outline: 2px solid var(--nulo-accent); outline-offset: 2px`) on both card buttons, as P17-05 signs ("the card's buttons get the ring too").
- **#363.** Move eight rules from `--nulo-outline` to `--nulo-secondary`: `SectionLabel.vue` `.count`; `activity-card.module.css` `.title_sep`; `TransactionCard.vue` `.hash`; `TransactionIncomingCard.vue` `.hash`; `BalanceView.vue` `.fiat_partial`, `.breakdown_divider`; `TokenList.vue` `.fold_action`; `TransactionCardLayout.vue` `.amount_symbol`. The received row's hash is "an activity row's ... hash" in decision record P17-06 (option A's list, which option B's "that text" moves); the shot branch missed it, and leaving it would mix two greys in one list.
- **#192, #230.** `restore-warning.ts` gains `restoreReminderText(names)`, which shares one pronoun helper with `restoreWarningText`; `RestoreOutcomeBanner.vue` renders it. `full.vue` picks `it`/`they` with the count it already uses.
- **Not taken:** a "resumable" option in the shared toast module (a public API for one caller); the shot's `querySelector` by test id (test ids are for tests); an sr-only announcer for every snack (changes what each snack reads, against "no other snack changes"); `aria-relevant="additions"` (weak AT support); a static `aria-live="off"` on every title (an AT that left an `off` subtree out of an insertion would silence every snack's title). Decision ledger D1-D8 below.

## Security & Adversarial Considerations

No trust boundary moves: no new input, storage, message or permission. The one risk is information on the lock screen: a re-opened progress line there would break the lock rule ("a lock closes any snack"); the lock guard and its test close that path. The re-open label holds two counts and no name or address. Supply chain: no dependency change. Frontend: no new HTML sink; all copy is static text or a count.

## Phases (one arc)

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`, plus `bun run --cwd packages/design test` when a phase touches `packages/design`. Pass: every command exits 0. A phase is ✓ only when its gate passes.

Smoke run `S(file)`, per browser `B` (`chrome`, then `firefox`): build the armed bundle first, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:B`, then `cd apps/extension && NULO_E2E_BROWSER=B NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/<file> --retry=0` (`global-setup-smoke.ts` refuses any other bundle). Rebuild after every source change.

### Phase 1 — #450 hover underline
- Change: `apps/extension/src/popup/pages/detail-page.module.css`.
- Test: `detail-page.styles.test.ts` pins the shared `.detail_link`: `text-decoration: none` at rest, `color` and `text-decoration: underline` on `&:hover`.
- UI impact: P17-02, "Underline on hover, both themes ... nothing changes at rest", on the tx, received and journal Details links.
- Gate: `F`.

### Phase 2 — #363 meta text to secondary
- Change: the eight rules above.
- Tests: `theme-contrast.test.ts` adds `--nulo-secondary` on `--nulo-surface-low` and `--nulo-surface-high` to the existing both-themes table ("home links, focus rings and the step bar"), for the activity row's hover and press. One `test.each` of [file, selector] in `utils/a11y-css.test.ts` pins the seven extension rules to `--nulo-secondary`; `SectionLabel.test.ts` pins `.count`.
- UI impact: P17-06, "Move that text to --nulo-secondary ... Borders and decoration keep --nulo-outline", on Home (balance sub-line, activity rows), Holdings (count, fold), History, the single-token page's split divider, and every counted section label (nine Settings lists, the tx page's Calls, the import-contacts popup).
- Gate: `F` with the design suite.

### Phase 3 — #192, #230 singular banners
- Change: `components/composite/import/restore-warning.ts`, `popup/components/modules/general/RestoreOutcomeBanner.vue`, `popup/pages/settings/security/export/full.vue`.
- Tests: `RestoreOutcomeBanner.test.ts` (one network reads "bring it back", two "bring them back"); `full-passkey.pins.test.ts` (one account "so it will not be restored", three "so they will not be restored"). The e2e literals follow: `tests/e2e/restore-outcome.test.ts` (its sentence helper takes the count), `tests/e2e/backup-imported-account.test.ts`, `tests/e2e/network/restore-again.test.ts`.
- UI impact: P17-10, "'Testnet didn't finish restoring. Restore the backup again to bring it back.' and the export banner '1 imported account could not be opened, so it will not be restored.'"
- Gate: `F`.

### Phase 4 — #413 focus after a keyboard pick
- Change: `components/composite/send/RecipientCard.vue`, `popup/components/modules/send/RecipientField.vue`.
- Tests: `RecipientField.test.ts`, mounted with the real card: Enter picks and `document.activeElement` is `recipient-card-change`; a click pick leaves it elsewhere (the control). `a11y-css.test.ts` pins `.icon_btn:focus-visible`. `tests/e2e/send-keyboard.test.ts`, the destination-suggestions scenario, after its Enter pick: `expectAccentRing(page, "recipient-card-change")` (the file's helper), then Tab reaches `send-token-trigger`. Failure mode: the browser's `:focus-visible` heuristic after a script focus, and the real Tab order; jsdom has neither. Estimate under 1 s on each browser; measure before and after.
- UI impact: P17-05, "Focus the card's 'Change recipient' button after a keyboard pick, with the 2 px accent ring", on Send.
- Keep `pickHighlighted`'s `blur()`: it runs `handleSearchBlur`, the field's grace timer the Enter guard tests rely on (D7).
- Gate: `F`; then `S(send-keyboard.test.ts)` on both browsers. Pass: both green. A Firefox ring miss is a panel question (I2), never a loosened assertion.

### Phase 5 — #448 read once
- Change: `packages/design/src/ui/ToastManagerBase.vue`.
- Test: `ToastManagerBase.test.ts`, assertions added to existing tests, no new test: `:108` (both regions, each kind in its region) also checks a fresh card's title carries no `aria-live`; `:336` (a relabel keeps the card) also checks the title is `aria-live="off"` after the update; `:162` (a second open is a new card) also checks the new card's title carries none; `:211` (a second open during the wait) also relabels the waiting snack and checks the card that enters carries none.
- UI impact: P17-04, "Read once ... the count updates on screen only"; nothing visible changes.
- Gate: `F` with the design suite.

### Phase 6 — #449 the line comes back
- Change: `popup/components/modules/settings/contacts/useContactImportExport.ts`.
- Test setup, in `useContactImportExport.test.ts`: today its toast mock returns two bare spies (`:42-44`). Change it to pass through: `importOriginal` gives the real `useToast()`, the existing spies wrap its `openToast` and `updateToast`, so the current call pins still hold. `appStoreState` gains `isLogined: true`; `afterEach` closes the snack. Each new test holds a row open so the import is mid-run, asserts the line opened, and settles the import before it ends (a live watcher would leak into the next test).
- Controls: another snack replaces the line and closes, and the line re-opens at the current count, later counts moving the new snack (`test.each`: nothing else, and a network switch while it is covered).
- Never: the person closes the line, another snack opens and closes, and nothing re-opens; the same for a re-opened line (this catches a `replaced` flag not reset on re-open); a lock seal (`isLogined` false, then the covering snack closed) and nothing re-opens, also after a later snack opens and closes; the import ends by its result or by a throw (`test.each`; the throw is a `getContacts` rejection while `assertRunFence` holds, since a failed write is only counted), its promise settles, its snack closes, and nothing re-opens.
- The three other files that mock `@/composables/toast` gain a `toast` ref.
- UI impact: P17-03, "When the other snack closes, the progress line re-opens at the current count ... A line the person closed stays closed".
- Gate: `F`.

### Phase 7 — arc gate
- Commands: `bun run test:all`, `bun run test:ci-gating`, `bun run lint:actions`, `bun run check:plans`. `S(file)` on both browsers for `send-keyboard`, `contacts-import`, `snackbar`, `restore-outcome`, `backup-imported-account`. Network, Chrome, through `agent.sh`, retry 0: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/contacts-import-stop.test.ts`, then the same for `restore-again.test.ts`, one at a time.
- Screenshots, both themes: a hovered Details link, the import line back after "Address is copied", the Send card with the ring, Home, Holdings, History, a Settings list count, the single-token page, the one-network reminder, the one-account export banner.
- Pass: all green; the screenshots attached to the PR.

## Delivery

Single arc: branch `worktree-ux-followups-p17`, one PR against `dev` with `gh pr create`, opened only after phase 7 and the Codex loop. Title (86 characters): `fix(ui): page 17 follow-ups: link hover, import snack, send focus, contrast, singulars`. Body: what changed and why, each surface's UI impact line with its screenshots, the validation runs, the `send-keyboard` wall-clock before and after per browser, `Closes #450 #449 #448 #413 #192 #230`, and `Closes #363` only once OA-1 has an answer the arc carries (else `Part of #363`, and #363 stays open with a comment), and the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Open it without labels; add `e2e:extension-network` only if the path filter skips the network lane. No parallel lanes: seven small phases on one critical path.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at revision 479ba56d. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2: one loop over the net diff from 479ba56d after phase 7. Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` for each later round. Each round is logged in `lessons/phase-7.md`. Hard stop at three rounds.
- Step 3: the Delivery above, then `gh pr checks <n> --watch`.
- Step 4: the close-out as the PR's final commits; it comments on #192 and #230 with the PR, files OA-1 and OA-2 as `owner-decision` issues if still open, files OA-3's option A (if it stands) as a closed `known-limit` issue (I1 unverified on real AT; reopen on a report of the line being re-read) named on the Outcome's `Known limits:` line, and archives the plan.
- Step 5: after the merge, `agent-worktree done ux-followups-p17 --merged`.

## Decision ledger

| # | Question | Chosen | Rejected, and why |
|---|---|---|---|
| D1 | Where the re-open lives | the import's `showProgress` | a toast-module option: a shared API for one caller |
| D2 | What the import watches | the snack id, default flush | the whole object, sync flush: the re-open's own write re-enters the watcher before the new id is stored, so a later close by the person would re-open |
| D3 | What stops a re-open | the person's close, or `isLogined` false when the cover closes (latched; a profile switch is a lock) | `scopeEpoch`: a network or account switch bumps it while the import keeps writing, so the line would never return (Codex r1 #1, Opus r1 #1); a profile-id check as well: redundant with the lock |
| D4 | Silent relabel | `aria-live="off"` on a card's title from its first relabel | static on every title: an AT that drops an `off` subtree from an insertion would silence every snack (Codex r1 #2); announcer, `aria-relevant` (Architecture) |
| D5 | Focus target hook | `defineExpose` + template ref | `querySelector` by test id |
| D6 | #363 rule set | the lane's seven plus the received row's hash | the shot's seven: a received and a sent row would differ in one list; every rule #363 names: beyond the lane brief's list, so OA-1 |
| D8 | #363 regression guard | the contrast pairs plus one `test.each` source table | no source pin (Codex r1 #6: mirrors the edits); a pin per rule (Opus r1 #9: volume) |
| D7 | `pickHighlighted`'s `blur()` | keep | remove (Codex r1 #3): it changes the field's blur state machine for no gain, since a removed input leaves no focus either way |
| D9 | A held Enter after the pick (implementation, Opus r1 #1) | Change refuses a repeat Enter (`refuseRepeatEnter`, as `AmountCard`'s unit switch) | none: the focus move puts the auto-repeat on Change, whose activation would clear the pick |
| D10 | #448's leave-wait pin (implementation, Opus r1 #2) | a relabelled waiting snack enters with no `aria-live`, then its relabel is `off` (new test) | `:211`'s relabel-then-newer-open: a newer id was already pinned by `:162`, and a relabel recorded in the toast watcher passed it |

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a13ffd): conditional approve. Accepted: #1 the epoch guard suppresses a re-open after a network switch (D3); #2 a static `off` risks every snack's title, so the attribute comes with the first relabel (D4), and the real-AT check goes to the owner (OA-3), since the lane brief pins attributes and no screen reader runs here; #5 armed smoke builds and `lint:actions` (`S(file)`, phase 7); #6 terminal cleanup on both endings, settled imports, the network-switch control. Rejected: #3 remove `blur()` (D7); #4 the Reveal ring exceeds P17-05: the record signs "the card's buttons get the ring too"; #4's Tab-order ask: nothing changes the order, so it is an information note in OWNER-ASKS.
**Round 1, Opus Plan:** conditional approve. Accepted: #1 lock-only guard (D3); #2 the mock is bare today, pass-through setup, the re-opened-line case; #3 Fact 3; #4 `focus({ focusVisible: true })` (I2); #6 OA-1 reframed as the lane brief against the signed text, with `Closes #363` held on it; #7 the Tab-order note; #8 assertions in existing tests; #9 one `test.each` and the existing contrast table; #10 `NULO_E2E_RETRY=0`, `expectAccentRing`. #5 is met by D4 and OA-3.
**Round 2, Codex** (resume): conditional approve. Verified D3 (no lock or profile path defeats the seal's order), D4 across the leave-wait path, and `focus({ focusVisible: true })` (typechecks under the repo's TypeScript 6.0.3). Accepted: #1 a rejected write is caught and counted, so the throw case rejects `getContacts` instead; #2 OA-3's known limit joins the close-out; the leave-wait relabel assertion on `:211`. Conditions met in place; no open finding.
**Implementation round 1, Codex** (gpt-6.1-sol, high, session 01a140aa): approve, two low comment findings; one accepted (the relabel flag's comment now states the markup contract, not AT speech), the e2e restating comment removed, `restoreReminderText`'s doc line kept (every copy helper in that file names its surface). **Opus review:** no blocker; two low findings accepted (D9, D10). Detail: [lessons/phase-7.md](lessons/phase-7.md).

## Seeds

`/goal Phases 1-7 of implementations-plan/ux-followups-p17/plan.md are ✓, each backed by its gate's output in the transcript; LESSONS_FILE=implementations-plan/ux-followups-p17/lessons/phase-N.md printed per phase; the Codex loop converged (a resumed round with no new material finding, quoted); one PR against dev exists, opened after the loop, with the close-out's archive-move commit shown by git show --stat; bun run test and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/ux-followups-p17 forward per its plan.md: reality-check plan.md and lessons/, take the next phase, run its gate, decide open questions with Codex (gpt-6.1-sol, high), never cross the owner boundary in OWNER-ASKS.md; after phase 7 run the Post-implementation section; once the archived plan is on dev, run agent-worktree done ux-followups-p17 --merged and stop.` Recommended: `/goal` (completion shows in the transcript).
