---
plan: sheet-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev 1b93cbfa
issues: "#590 (the sheet part: this arc; Closes #590 only once icons-d2-1's last PR is on dev, else Refs #590); #656 (closed by the page-39 guard)"
status: closed (delivered by the PR from `worktree-sheet-1`, with this close-out)
---

## Outcome

- **Date:** 2026-10-17. Planned and implemented the same day; one arc, with decision page 39's four picks folded into its PR before the merge (Phase 4).
- **Status:** closed with its delivery: the PR from `worktree-sheet-1` (closes #590; its icon part landed in #641 and #655), whose final commits are this close-out; merging is the owner's call.
- **Shipped:**
  - Every `PopupCard` sheet sits at its content height, scrolls inside its card when taller than the frame, and draws no bar: the 2 px accent edge, 16 px of top padding and a 6 px offset ledge (P33-07 E). The light theme's scrim is the page background at 70 %, now the light value of `--scrim-popup` (P33-09 A, D13), and its card carries the ledge alone: P39-01 B retired the 1 px line. The dApp windows' cancelled overlay reads the same token, so it takes the light scrim too; the Terms sheet keeps its near-black one in both themes (P39-02 C). The sheet fades in where it rests (`.sheet-*`, today's curve and timing).
  - The double-click guard (P39-03 B, D14): inside a sheet that opened after a multi-click's first press, that multi-click's later clicks do nothing; a single press, a key, a multi-click begun inside the sheet and a second press slower than the platform's double-click interval pass. `Popup.test.ts` pins the rule; `contacts.test.ts` proves it on both engines with a real double-click whose second press lands on the delete Confirm's answer (D15). Closes #656.
  - The Full-height popups setting is gone: its config key, composable, Display row and search row (P33-08 A). A stored value is dropped by the next config write (`store.test.ts`); an old backup's row is skipped at restore.
  - The 500-row import review proves on both engines that a content-height sheet keeps its answers on screen while its list scrolls. Before and after captures in [screenshots/](screenshots/); page 39's in [screenshots/p39/](screenshots/p39/).
- **Review loop:** the plan took a dual audit and a final Codex pass; the implementation converged at Codex round 2 beside an Opus review; the page-39 fold-in took a Codex design consult, then converged at Codex round 2 beside an Opus review (§ [Audit verdicts](#audit-verdicts)).
- **Gates at the final head:** after Phase 4, at the merged head (dev 356004ce with this arc): `audit:vue` (typecheck, test, lint, build), `test:all`, `test:ci-gating` and `check:plans` exit 0 (`test:all` on its second run: the first timed out once in `import.test.ts`, untouched here, which passed 3 of 3 alone). Phase 4's e2e at eb228334, before dev's #712 and #713, which touch none of these files: the arc's nine smoke files at retry 0 on Chrome and Firefox (9 files, 44 tests each), the reproducer red on both with the guard removed, and `network/session-tabClose` on Chrome at retry 0. Phase 3's runs, at dev 093fa10d: the whole smoke suite at retry 0 on Chrome (57 files, 259 tests) and on Firefox (60 files, 259 tests); network `snack-placement`, `send-picker`, `popup-escape-layered`, `send-amount-exact` and `stale-network-reset` on Chrome, and `popup-escape-layered` and `snack-placement` on Firefox, at retry 0. Each phase's gate is in [lessons/](lessons/).
- **Lessons:** none promoted. The arc's gotchas are local (a search test that found the retired row by a word, not its id; stale 40 px wording in two e2e docs) and sit in `lessons/`; `lessons.md` is at its budget.
- **Known limits:** #686; #715 (a double-click that dismisses a top sheet can act on a taller sheet beneath, outside the signed rule).
- **Open items:** none. OA-1 to OA-4 were answered on decision page 39 ([OWNER-ASKS.md](OWNER-ASKS.md)) and ship in this PR; #656 closes with the guard.
- **Dropped, rejected, superseded:** the 1 px line above the light card (P39-01 B supersedes that part of P33-09 A); D2's component rule for the light scrim (superseded by a light `--scrim-popup`, D13); D11's "designed and left out" (superseded by D14); a sheet primitive in `@nulo/design` and new sheet tokens (outline B, D1: rejected); an 800 ms arming and a Confirm-only guard (D11: rejected); `slideopacity` for the sheet (D4: rejected for its curve).
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# sheet-1: the popup sheet's new look, the Full-height setting retired

Decision page 33 (2026-10-17) signed three #590 picks that supersede page 30's: **P33-07 = E** (the flat bottom sheet), **P33-08 = A** (remove Full-height popups), **P33-09 = A** (the light scrim). This plan restyles the one sheet every popup uses and deletes the setting with its config key. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

## Outcome & Quality Bar

- **For whom**: a person on Chrome or Firefox who opens any sheet (Receive, Select token, a Confirm, a form, the Send review) in the toolbar popup, the side panel, an own window or the onboarding tab, in either theme; the maintainer who next touches `Popup`.
- **Excellent looks like**:
  1. Every sheet sits at its content height on its frame's bottom edge, with no bar, the 2 px accent edge and the 6 px ledge above it. A sheet taller than the frame scrolls inside its card, and its controls stay reachable; nothing is clipped.
  2. The light theme's scrim is the page background at 70 %, under the ledge alone (P39-01 B retired the 1 px line); the dark theme's is today's near-black. The PR's screenshots match the page 33 drawings (`p33-sheet-e-*`, `p33-scrim-a-*`).
  3. The sheet appears in place: today's fade, on today's curve, without the 40 px rise. Escape, the outside tap, the trap and focus return behave exactly as today.
  4. No trace of the setting is left: no row, no search hit, no config key, no composable, no test of it. An install or a backup that still holds the key loads and imports as before.
- **Good enough**: the four asks ship in their "now" forms. Overlays that are not `Popup` keep today's look.

## UI impact

Quoted from #590's Decision block (decision page 33, 2026-10-17):
- **P33-07 = E**: *"T4, flat bottom sheet: content height, no rise, the 2 px accent top edge, a hard offset ledge, no bar."*
- **P33-08 = A**: *"Remove it: every sheet sits at its content height."*
- **P33-09 = A**: *"The light theme gets its own scrim: the page background at 70% plus a 1 px line above the card."*

Decision page 39 (signed 2026-10-17 19:03Z) answered OA-1 to OA-4 ([OWNER-ASKS.md](OWNER-ASKS.md)):
- **P39-01 = B**: *"The ledge alone; it already draws the edge between the white card and the light wash."* The 1 px line goes; this supersedes the line part of P33-09 A, whose 70 % scrim stays.
- **P39-02 = C**: *"The dApp window's card takes the light scrim; the Terms sheet keeps its near-black one, since it is a blocking wall and the light wash nearly erases its edge."*
- **P39-03 = B**: *"The guard: inside a sheet that opened after the first press, a double-click's later presses do nothing; a slower second press still passes."* Chosen by the orchestrator under the owner's delegation: *"To be honest, I don't know what's the common pattern, so choose yourself. 0.8s sounds like a lot to be honest."*
- **P39-04 = A**: *"Accept all four as content height makes them."*

Surfaces:
- **Every `PopupCard` sheet** (13 popups, `FormPopup` and its 11 forms, `SendReviewSheet`, `ImportContactsPopup`; recon § Popup inventory): content height in every frame, including the tall ones where the setting was forced on (the side panel, the 380×660 own windows, the onboarding tab, where a sheet spans the tab's width); no bar; the card's top padding 16 px (today 27 px of handle zone), as drawn; the ledge, and in light no line above it (P39-01).
- **Consequences of content height the drawings do not show** (OA-4, accepted as P39-04 A): a sheet whose content changes height moves its top edge (Select token while a search filters); a snack can cover a sheet's last row where the sheet has no bottom action row (Accounts, Select token); a taller sheet under a shorter one shows above it through the top scrim; a tall frame shows more scrim above a short sheet.
- **The `Popup` scrim** in light: the page background at 70 %. `StaleNetworkConfirm`, a `Popup` with its own centred card, gets it too, and the in-place fade, but not the ledge.
- **The dApp windows' cancelled overlay** (`DappCancelledOverlay`, in the capabilities, connect, execute and fee windows) in light: the same scrim, without a line (P39-02). The Terms sheet keeps its near-black scrim in both themes; it covers the whole 600 px popup and the 660 px own window, so its scrim shows only in a taller frame such as the side panel.
- **How a click reaches a sheet** (P39-03): the second and later clicks of a double-click whose first press came before the sheet opened do nothing inside it, its close area included. Nothing is drawn.
- **The enter and leave motion**: today's opacity fade and timing; the 40 px rise goes.
- **Settings → Display**: the "Full-height popups" row goes; Settings search no longer finds it.
- **Not changed**: any popup's content, copy or rows; how a key, a single press or a multi-click begun inside a sheet reaches it; the Terms sheet, the passkey dialog, the barriers, dropdowns, popovers and tooltips; the keyboard rules (CLAUDE.md § Keyboard and focus order); type roles.
- The PR body quotes the three picks and carries light and dark screenshots, before and after, of the captures listed under Arc 1.

## Architecture & Implementation

**Shape.** The sheet stays in `apps/extension/src/components/Popup/`; two SFCs change in place, one transition class set is renamed in `@nulo/design`'s `base.css`, and the setting is deleted end to end. No new component, token, prop or config.

- **`PopupCard.vue`** loses `useFullscreenPopupSetting`, `expanded`, `fills`, `toggle`, the `large` and `fit` props, the `flex` binding, the handle zone and the bar with their CSS. It keeps `displaceIdx` and `.displace`; its slot Flex gains `data-testid="popup-card-body"`. The card is then `flex: 0 1 auto` with `overflow: auto`: it takes its content height and, when the content is taller, shrinks to the frame minus `Popup`'s 40 px `.close_area` floor and scrolls (the cap and scroll exist today; recon). `.wrapper` gains `padding-top: 16px` and `box-shadow: -6px -6px 0 0 color-mix(in srgb, var(--nulo-accent) 30%, transparent)`, the drawn dark ledge (`rgba(248,241,231,.3)`); a `:global([theme="light"]) .wrapper` rule sets `box-shadow: 0 -1px 0 0 var(--nulo-outline), -6px -6px 0 0 var(--nulo-outline)` (the drawn light ledge `#c9c5bd` under the 1 px line, OA-1's "now" form). Phase 4 cut it to `box-shadow: -6px -6px 0 0 var(--nulo-outline)`, the ledge alone (P39-01 B).
- **Ledge geometry.** The shadow box is the card moved 6 px left and up. Outside the card it shows only as a 6 px band above the accent edge, from the frame's left edge to 6 px short of its right edge; its left overhang is clipped by the popup shell's `overflow: clip` (`popup/app.vue:584-594`) or falls off the onboarding viewport, as in the drawing. A box shadow paints outside the border box, so the card's `overflow: auto` does not clip it.
- **`Popup.vue`**: the wrapper's `<Transition name="slide" appear>` becomes `name="sheet"`; the scrim keeps `slideopacity`. A `:global([theme="light"]) .dark_bg` rule sets `background: color-mix(in srgb, var(--app-bg) 70%, transparent)` (`rgba(245,245,247,.7)`); the dark rule keeps `var(--scrim-popup)`. Phase 4 moved that value into `--scrim-popup`'s light value and dropped the rule (D13), and gave the wrapper the double-click guard (D14). Trap, Escape, `vSnackSheet` and z-order are untouched.
- **`packages/design/src/base.css`**: `.slide-*` (lines 266-278) becomes `.sheet-*` without the `transform` line, keeping `var(--bezier)` and 0.3 s / 0.15 s, so the fade reads as today's (D4); restamp the hash in `base.css.test.ts`. The comment at `base.css:78` stays true.
- **The setting retires** (recon § retirement map): `showPopupFullscreen` leaves `ConfigSchema` and `RESTORABLE_CONFIG_KEYS`; `fullscreenPopupSetting.ts` and its test go; `display.vue` loses its ref and row; `settings-search.ts` loses `display-full-height`; the auto-import files are regenerated by the extension build. A stored value is ignored and dropped by the loader's next write; an old backup's row is skipped at restore with the existing warning (recon, both traced). No migration: pre-production.

**File-level change map**

| File | Change |
|---|---|
| `apps/extension/src/components/Popup/PopupCard.vue`, `PopupCard.test.ts` | as above; test rewritten (Phase 1) |
| `apps/extension/src/components/Popup/Popup.vue` | transition name; the light scrim rule |
| `packages/design/src/base.css`, `base.css.test.ts` | `.slide-*` → `.sheet-*`, no transform; hash restamped |
| `apps/extension/src/popup/components/modules/send/SendReviewSheet.vue`, `.test.ts` | drop `fit`; the stub's `fit` prop and the `data-fit` assertion (line 101) |
| `apps/extension/src/components/composite/FormPopup.test.ts` | drop the composable mock (27-29) and the stub's `large` (47) |
| `apps/extension/tests/e2e/snackbar.test.ts` | `lengthenCard` finds `popup-card-body`, not `children[1]`; `sheetAtRest`'s comment (166-168) loses the 40 px offset |
| `apps/extension/tests/e2e/contacts-import.test.ts` | the 500-row review asserts its list scrolls and its buttons are in view (Phase 1) |
| `apps/extension/tests/e2e/README.md:247`, `FIREFOX.md:33`, `fixtures/address-book.ts:32` | name `sheet-enter-*` where they name `slide-enter-*` |
| `apps/extension/src/wallet/config/config.ts`, `src/wallet/services/config/spec.ts` | delete the key |
| `apps/extension/src/wallet/config/store.test.ts` | a stored key outside the schema (Phase 2) |
| `apps/extension/src/composables/fullscreenPopupSetting.ts`, `.test.ts` | deleted |
| `apps/extension/src/types/auto-imports.d.ts`, `src/types/.eslintrc-auto-import.json` | regenerated |
| `apps/extension/src/popup/pages/settings/display.vue` | delete lines 35 and 50 |
| `apps/extension/src/utils/settings-search.ts`, `settings-search.test.ts`, `popup/components/modules/settings/SettingsSearch.test.ts` | delete the row; re-point its cases to surviving rows |
| `apps/extension/tests/e2e/settings-routes.test.ts` | re-targeted (D6) |
| the specs under Arc 1's captures | `shotSend` calls, no-ops without `NULO_E2E_SHOT_DIR` |

**Trade-offs and alternatives not taken** are the decision ledger's right column: a sheet primitive in `@nulo/design` (D1), new tokens or a light `--scrim-popup` (D2), `slideopacity`'s `ease` curve (D4), a double-click guard in this arc (D11).

## Security & Adversarial Considerations

- **Threat model.** No new input, storage, message or permission. The sheet hosts decisions a person must make deliberately: "Send now", a Confirm's destructive answer, Create, Revoke, Allow. The risks: a sheet that clips its control; a scrim that no longer reads as "the page is inactive"; a control that lands under a pointer by accident.
- **Tap outside and Escape never approve.** A content-height sheet leaves more scrim, and a tap there closes it. Trap, `closeOnEscape` and focus return are untouched; the three `Popup*.test.ts` files stay green unedited.
- **Clipping.** `snackbar.test.ts`'s lengthened Receive proves a scroll and a click land on Close; the 500-row import proves a nested inner list scrolls while its buttons stay in view. Both run on both engines.
- **S1, a double-click's second press answers the sheet its first press opened.** The hazard exists today; this arc moves where it lands, and neither creates nor removes it. The planner measured it on Chrome (F11), comparing the setting on (today's default) with the setting off and animations off, which puts every bottom-anchored control where this arc puts it.
  - *Today, demonstrated (synthetic input)*: with ten contacts, a contact's delete icon at y 240 sits under the Confirm's "Yes, delete contact" (220-260). Two presses 120 ms apart deleted the contact. Back-to-back presses did not: the second lands before the Confirm renders. With one account, a back-to-back double-click on "New account" created an account, because the 40 px rise carried Create under the second press. At 60, 120 and 200 ms no account was created.
  - *After this arc, demonstrated*: the Confirm's answer sits at 536-576; the delete icon scrolled to y 556, and a 120 ms double-click deleted the contact. The exposed rows move from the list's upper middle to its bottom edge. Rows with an icon that opens a Confirm (tokens, FPCs, senders, connected apps) share the mechanism; they were not measured. "New account" and Create now share 1 px, and no gap created an account. A double-click on Home's Receive lands on its QR code both ways.
  - *After this arc, newly exposed, plausible but unverified*: a passkey profile's Export full backup. Download Backup is the last CTA of the pinned bottom row (`export/full.vue:786-793`); it opens the plain-download Confirm (`:448-462`, passkey only, `:164`), whose "Download anyway" fills the right half of the same band. Today that answer sits in the upper half, away from the button. Consequence: a plain backup that "will show your accounts, contacts and activity to anyone who opens it" is written to the person's own disk without a deliberate answer. The passkey e2e case is skipped on CI, so no reproducer exists.
  - *Invariant broken*: a Confirm is answered by a deliberate press. No attacker controls the input.
  - *Disposition*: fixed. Arc 1 shipped without the guard (OA-3) and Phase 0 filed #656; decision page 39 picked it (P39-03 B), and Phase 4 ships it (D14) with the Contacts reproducer (D15), closing #656. The guard covers every `Popup` sheet, the passkey Export Confirm included. It does not cover, by the rule's own terms: a second press slower than the platform's double-click interval; a touch or pen activation the browser reports as a fresh `detail` 1; a sequence begun on a toast or a covering sheet after this sheet has seen a press of its own, such as a double-click that dismisses a top sheet and lands on a taller sheet beneath (#715, a closed known limit); a dropdown menu, which teleports outside the sheet's DOM.
- **Logging.** The restore path's existing `logWarn` names a skipped key from a backup (`service.ts:70`): file-supplied text at `warn` in the user's own log, from a file the user chose. This plan adds no log line.
- **CSP, supply chain, crypto**: `color-mix` and `box-shadow` are plain CSS; no dependency, no CSP string, no key material.

## Assumptions

**Facts**
- F1. The three picks are #590's Decision block as read 2026-10-17 14:10Z. The drawings and harness CSS are under `~/.cache/nulo-backlog/program-2/shots-p33/` (`build/scenes.css`: `.tr-e .card{border-top:2px solid var(--accent);padding-top:16px;box-shadow:-6px -6px 0 0 var(--hardx)}`, `--hardx` dark `rgba(248,241,231,.3)`, light `#c9c5bd`; `.scrim-light .scr{background:rgba(245,245,247,.7)}`, `.scrim-light .card{box-shadow:0 -1px 0 0 var(--outline)}`).
- F2. Those two `.card` rules share one specificity, so the harness never drew the ledge and the line together (OA-1).
- F3. `--nulo-accent` dark is `#f8f1e7` (`base.css:54`), `--nulo-outline` light `#c9c5bd` (`:134`), `--app-bg` light `#f5f5f7` (`:120`).
- F4. The setting is forced on when `window.innerHeight > 600` (`fullscreenPopupSetting.ts:28-29`); `flex: 10` is `flex-basis: 0%`, so today's card is about 10/11 of the frame (measured: top 54 of 600) whatever its content.
- F5. `--scrim-popup` is also read by `DappCancelledOverlay.vue:34`, in four dApp windows.
- F6. `ConfigStore.apply` reads schema keys only and the load writes the whole config back (`store.ts:81-112`); `ConfigService.restore` skips a key outside `RESTORABLE_CONFIG_KEYS` with a warning (`service.ts:69-70`).
- F7. `snackbar.test.ts:219` takes the card's content as `children[1]`, the only e2e that assumes the card's child order.
- F8. `.slide-*` runs on `var(--bezier)`, `.slideopacity-*` on `ease` (`base.css:266-291`).
- F9. Smoke loads `dist/<browser>` and refuses a build without the armed stamps; the network config retries twice unless `NULO_E2E_RETRY` is set.
- F10. icons-d2-1's arc 1 merged as #641; its arc 2 is open work in another lane.
- F11. The S1 measurements come from two throwaway smoke probes at `1b93cbfa` (Chrome, 360×600, retry 0, recorded in `lessons/phase-0.md`). Puppeteer's `count: 2` and explicit `clickCount` presses gave the second `mousedown` and `click` `detail` 2 on an element that appeared after the first press; that is the driver's count, not physical input.

**Inferences**
- I1. `ImportContactsPopup`'s inner list keeps scrolling at content height; the 500-row assertion checks it on both engines.
- I2. Receive's address-to-Close distance does not change, so `snackbar.test.ts:380-420` keeps its premise; if not, its pointer point is re-derived from where the snack lands, never loosened.
- I3. type-scale-1 does not edit `base.css`; if it lands first, the hash is restamped after the merge.

**Asks** (each in OWNER-ASKS.md; the arc ships its "now" form)
- A1. OA-1: the ledge and the 1 px line together in light. Shipped: both. Answered P39-01 B: the ledge alone.
- A2. OA-2: overlays that are not `Popup` keep today's scrim in light. Shipped: unchanged. Answered P39-02 C: the dApp overlay takes the light scrim, the Terms sheet keeps its own.
- A3. OA-3: the double-click guard (D11). Shipped: not at first; S1's issue tracked it. Answered P39-03 B: the guard (D14).
- A4. OA-4: the consequences of content height not drawn on page 33. Shipped and answered P39-04 A: as content height makes them.

## Decision ledger

| # | Decision | Rejected alternative and why |
|---|---|---|
| D1 | `Popup` and `PopupCard` stay extension-local | A sheet primitive in `@nulo/design` (outline B): `Popup` reads `managers`, `vSnackSheet`, `focus-trap` and the `#popup`/`#toast` roots; no other app has a sheet; a `*Base`, a resolver entry and a split visual unit for one caller. Both auditors: A |
| D2 | Per-theme look by `:global([theme="light"])` module rules over existing tokens with `color-mix` | Two new contract tokens and a light `--scrim-popup`: contract, generator, `base.css`, drift and contrast tests for three values one component reads, and the light scrim would restyle `DappCancelledOverlay` (F5). Both auditors: A. For the scrim, superseded by D13 once P39-02 signed the overlay |
| D3 | Content height by deleting the `flex: 10` branch, `large`, `fit` and the handle; `padding-top: 16px` as drawn | Keeping `fit` or the handle as an expander: the bar is gone (P33-07) and the setting with it (P33-08) |
| D4 | `.slide-*` renamed `.sheet-*` without its transform, keeping its curve and timing | `slideopacity` (the first draft): its `ease` curve leaves the card about 57 % opaque at 100 ms against today's 91 % (F8), a motion change nobody signed; `slide` kept without its transform: a name that no longer says what it does |
| D5 | The key is deleted; no migration; one store test pins that a stored key outside the schema is ignored and dropped | A migration (pre-production rule); the retired name in the test (the gate's grep could never pass) |
| D6 | `settings-routes.test.ts` keeps its four proofs with two queries: one only the side panel row answers (Chrome: that row; Firefox: `settings-search-empty`), then one a Display row answers on both, clicked and checked for its outline | One query: no query finds the side panel row beside another (recon) |
| D7 | `PopupCard.test.ts`: no grow and no handle beside a rendered slot; displace kept | CSS values in jsdom, which applies no module CSS |
| D8 | No e2e for the look: screenshots prove it, unit tests the content height, two existing e2e cases the scroll. One e2e addition: the 500-row list assertion (nested flex in a real engine, which jsdom lacks; under 0.1 s on an existing case; measured in Phase 3) | A computed-style pin of the ledge and scrim: it repeats the screenshot review and pins values the tokens own; an S1 reproducer: S1 predates this arc and stays open (OA-3); its reproducer, the Contacts double-click, belongs with the guard, and ships with it (D15) |
| D9 | `Closes #590` only if icons-d2-1's last PR is on `dev` when this PR opens; otherwise `Refs #590`, and the body says why | Closing with the icon part open |
| D10 | Screenshots by `shotSend` in specs that already open each sheet; "before" at the base SHA | A capture spec copied in and deleted; a 360×900 capture: no spec opens a sheet in a frame over 600 px, so it would be that copied spec |
| D11 | Superseded by D14 (P39-03 B). The guard is designed and left out (OA-3). The design: `Popup.vue`'s wrapper gets `@mousedown.capture`, which records a press with `detail === 1` inside the open sheet. `@click.capture` stops and prevents a click with `detail > 1` when no such press came since the sheet opened. A keyboard activation (`detail` 0) and a multi-click begun inside the sheet pass. | Shipping it now: a behaviour a person can notice, beyond the picks (Codex round 1), fixing a hazard that predates the restyle (F11). A Confirm-only guard: misses the close area and forms. Refusing every `detail > 1` inside a sheet: also refuses a quick double toggle begun inside it. An 800 ms arming (outline B): a timer and a visibly disabled control on every sheet |
| D12 | Deviations found in implementation, the tree winning: `pages/settings/index.test.ts` also searched "full" and was re-pointed to "motion"; the stale 40 px wording in `helpers/legal-drivers.ts` and the e2e-testing skill was rewritten; `settings-display` is captured in the redirect case of `settings-routes.test.ts`; the review diff's base is dev 13d5f8d0, merged in before Phase 0, since `1b93cbfa..HEAD` carries #650 and #655; the Codex loop ran over the finished code while Phase 3's suites ran, to resume if they forced a change | Each the smallest change that keeps a test or a doc true |
| D13 | The light scrim is the light value of `--scrim-popup`, `color-mix(in srgb, var(--app-bg) 70%, transparent)` in `base.css`'s `[theme="light"]` block; `Popup`'s light rule goes and `DappCancelledOverlay` reads the token unchanged. `--scrim-sheet`, the Terms sheet's, stays near-black in both themes (P39-02 C) | A second component rule in `DappCancelledOverlay` mirroring `Popup`'s: two copies of one value. D2's objection, a token that restyles the overlay unsigned, fell with P39-02. Codex consult: the token, high confidence; the contrast parser reads the value and the drift check compares only the unthemed and dark roots |
| D14 | The guard, on `Popup.vue`'s wrapper: `@mousedown.capture` arms it on a primary-button press with `detail` 1; until armed, `@click.capture` stops and prevents a click with `detail` above 1; `activate()` disarms it synchronously when the sheet opens. Only `click` is refused: every consequential sheet control acts on it (Confirm, `FormPopup`, `Toggle`, `Checkbox`, the close area), and a press's earlier effects (focus, selection, a tooltip hiding on `pointerdown`) stay | `pointerdown.detail` (0 by Pointer Events); `dblclick` (it fires after the second click); timestamps (a threshold of its own instead of the platform's); refusing down and up events too (breaks selection and native controls); arming on any button (a right press would arm it); a reset bound to the wrapper element (machinery for the same effect). Codex consult: high confidence in the mechanism, moderate across physical devices; touch and pen are not claimed |
| D15 | The reproducer drives a real double-click through a new driver method, `doubleClick`: CDP's `Input.dispatchMouseEvent` with `clickCount` on Chrome; on Firefox one BiDi `input.performActions` chain (move, press, 150 ms pause, press), since its remote agent counts presses only inside one chain and restarts on a move (`Actions.sys.mjs`, `ClickTracker`, 640 ms, timed from the first release before its dispatch). Both first move through Puppeteer's mouse, so its record of the pointer stays true. A window capture listener records each click: the first must hit `contact-delete`, the second `confirm-submit` with `detail` 2, prevented and never reaching the window's bubble listener, so the test cannot pass on a press that missed (the first's delivery is not read: `RowAction` stops its own click). The list scrolls through the page's own testid, `contacts-page`, and the test waits for the saved contacts' snacks to leave, since a snack sits over the bottom rows; a single real press then deletes the contact | Two `pointerClick`s or `mouse.down`/`up` pairs: Firefox sees two clicks of `detail` 1; Puppeteer's internal `clickCount` mouse option; a 300 ms gap: `handleDeleteContact` opens the Confirm synchronously, so the pause need not wait for a render, and a shorter one leaves Firefox's 640 ms more margin under load; a browser-mounted `Popup` fixture: cheaper, but no production wiring |

## Audit verdicts

**Round 1, Codex** (`gpt-6.1-sol`, high, session `01a14a43`): `reject` (blocking: D11 not approved and Confirm-only, an uncovered account-creation path, a Phase 2 gate that cannot pass).
1. Medium, New account's Create meets the same path: **accepted and measured** (F11): a path today through the rise, which this arc removes; 1 px after it.
2. Medium, I4's proof is the drivers', not physical input: **accepted**; F11 states it as the driver's count, and I4 left with D11.
3. Medium, I1 has no gate: **accepted**; the 500-row assertion.
4. Medium, the Phase 2 grep finds the store test's fixture: **accepted** (D5).
5. Medium, onboarding's shared sheets are missing: **accepted**; in UI impact. Its duplicate Confirm opens after an async check (`useProfileImportFlow.ts:108-137`), so S1 does not reach it; the shared Confirm's capture uses `duplicate-phrase-import.test.ts`.
6. Low, `firstElementChild` keeps a structural coupling: **accepted** (`popup-card-body`).
7. Medium, the guard is a behaviour a person can notice: **accepted**; OA-3, and the arc ships without it.

**Round 1, Opus** (Plan agent): `conditional approve` (re-aim the reproducer, widen the guard, fix the Button stubs, list the visible consequences).
1. High, the passkey reproducer lands in the gap between Cancel and "Download anyway" and could never go red; that case is skipped on CI: **accepted**; the passkey step is dropped. A later probe found the class on Contacts, today and after (F11); its reproducer goes with the guard (OA-3).
2. High, the guard covers one member of the class: **accepted** in D11's design (in `Popup`, with the press flag); left out with OA-3.
3. Medium, the Button stubs in `useConfirm.test.ts` and `ConfirmPopup.test.ts` drop `$event`: **moot**; `ConfirmPopup` is untouched.
4. Medium, four consequences the plan did not list (the moving top edge, the snack over last rows, stacked sheets peeking, the onboarding strip): **accepted** as OA-4 and UI impact lines; a stacked capture added; the 360×900 capture rejected (D10).
5. Medium, D4's premise is false (F8): **accepted** (D4).
6. Low, I5 misread the comment: **accepted**; the passkey dependency is gone.
7. Low, three docs name `slide-enter-*` or the offset: **accepted** (change map).
8. Low, a second press slower than the platform's double-click interval passes the guard: **accepted** into D11's issue text.
9. Low, Firefox's empty search state: **accepted** (D6).
- Its fact check: nine SFCs, not ten, carry a light theme rule: **accepted** (recon).

**Final pass, Codex** (`gpt-6.1-sol`, high, fresh session `01a14a67`): `reject` (blocking: a Phase 1 gate that cannot pass, a capture that never runs, S1's evidence incomplete).
1. Medium, Phase 1's grep finds `useFullscreenPopupSetting`, deleted only in Phase 2: **accepted**; the name moves to Phase 2's grep.
2. Medium, a row icon that opens a Confirm can be scrolled into the answer's band (Contacts' delete): **accepted and measured**. It deletes the contact today and after this arc (F11), so S1 predates this arc; S1 rewritten, OA-3 reworded, its issue moved to Phase 0.
3. Medium, `stale-network-captures.test.ts` skips without `STALE_NETWORK_CAPTURES=1`, and a PNG count is ambiguous: **accepted**; its existing `A3-confirm` capture with the flag, and gates on the nine named captures.
- **Resumed, verify round**: `approve`; each fix correct, no new material finding.

**Implementation, round 1, Codex** (`gpt-6.1-sol`, high, session `01a14aab`, the diff from dev 13d5f8d0): `approve with fixes`; three low comment findings, no functional regression.
1. `base.css.test.ts`'s "verbatim flatten" and "pixel-identical constraint": **accepted**. The same claim in `base.css`'s header: **declined**; pre-existing provenance this arc does not make false, its plan path resolves under `archive/`, and a header edit in a shared stylesheet widens another lane's conflict for no behaviour.
2. `FormPopup.test.ts`'s header called the stubbed children real: **accepted**.
3. `display.vue`'s dust-field comment said the handler parseFloat-normalizes: **accepted**; the clause is gone.

**Implementation, round 1, Opus** (general-purpose agent, alongside): `approve with fixes`; no correctness, clipping, keyboard, theme or CSP finding.
1. The e2e-testing skill's `pointerClick` passage still described the 40 px rise: **accepted**.
2. `base.css:78`, "the light theme inherits … every scrim unchanged": **declined**; true of the tokens (the plan's ruling), the light `Popup` scrim being a component rule.
3. The long-import test's header did not name the fit assertion's failure mode: **accepted**.
- Its note that a scrolled onboarding tab leaves an undimmed strip below a sheet (the wrapper resolves against the first screen, not the scrolled one) predates this arc: a known limit, #686.

**Implementation, round 2, Codex** (resumed `01a14aab`, the fix commit 80d913c2): `approve`; the fixes verified, no new material finding. The loop converged.

**Page 39, design consult, Codex** (`gpt-6.1-sol`, high, fresh session `01a14b8b`): the guard on `mousedown.detail` and `click.detail`, refusing `click` only, armed on a primary press, reset synchronously in `activate()`; the light `--scrim-popup` token over a second component rule; Firefox's double-click as one BiDi action chain. All taken (D13, D14, D15; `lessons/phase-4.md`).

**Page 39, round 1, Codex** (resumed `01a14aab`, `a833c439..c4aa2b75`): `approve with fixes`; three low findings, all accepted.
1. `doubleClick` left Puppeteer's record of the pointer stale (a later `mouse.wheel` would scroll at the old point): **accepted**; both drivers move Puppeteer's mouse first.
2. The close-area refusal had no success control: **accepted**; a single press now closes it once.
3. The plan's Architecture and Delivery lines contradicted the fold-in: **accepted**.

**Page 39, round 1, Opus** (general-purpose agent, alongside): `approve with fixes`.
1. High, the reproducer could never pass: `RowAction`'s `@click.stop` keeps the first click from the window's bubble listener: **accepted** (the first Chrome run had already shown it); only the second click's delivery is read.
2. Medium, a double-click that dismisses a top sheet can land on an armed, taller sheet beneath: **accepted as a known limit**, #715, closed; extending the signed rule to an uncovered sheet is the owner's call.
3. Low, the gap: Firefox's 640 ms window runs from the first release, and the Confirm opens synchronously: **accepted**; 150 ms (D15).
4. Low, up to ten `addContact` round trips: **declined**; measured at 5.6 s on Chrome and 8.6 s on Firefox, against a contacts import that would bring a file chooser and the Testnet refusal into this file.
5. Low, the plan not yet filled in: **accepted**; filled from the runs.
6. Low, the scroller found by computed overflow, not a testid: **accepted**; the Contacts page's shell takes `data-testid="contacts-page"`, as two other settings pages already pass theirs.

**Page 39, round 2, Codex** (resumed `01a14aab`, `c4aa2b75..eb228334` and the plan): `approve`. The loop converged.

## Arc 1: the flat sheet (Closes or Refs #590, D9)

**Smoke runs, every time**: build the armed build for the browser, then run, from the repo root:
`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<chrome|firefox>`, then `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- <files> --retry=0` (with `NULO_E2E_BROWSER=firefox` for Firefox). Rebuild after any other build or network run has written `dist/`. **Network runs**: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <files>` from the repo root; never two in this worktree at once. Before any e2e, check that `uptime` shows load1 under 150.

**Captures** (D10), each `shotSend(page, "<name>", "<focus testid>")`, light and dark:
- `sheet-receive`: `snackbar.test.ts`, after `sheetAtRest(page, "receive-close")` at line 504.
- `flagged-send-picker` (Select token): `token-list.test.ts:176`, existing.
- `sheet-confirm-delete`: `contacts.test.ts`, after line 146.
- `sheet-send-review`: `network/send-amount-exact.test.ts`, after `openReviewFromStrip`.
- `A3-confirm` (`StaleNetworkConfirm`): `stale-network-captures.test.ts:83`, existing; it runs only with `STALE_NETWORK_CAPTURES=1`, on Chrome, and writes both themes to `tests/e2e/.captures/`.
- `sheet-import-contacts`: `contacts-import.test.ts`, the 500-row review.
- `sheet-stacked`: `popup-stack.test.ts`, New account over Accounts, after line 40.
- `sheet-duplicate-confirm`: `duplicate-phrase-import.test.ts`, after line 71.
- `settings-display`: `settings-routes.test.ts`, the Display page.

### Phase 0: base, captures, "before" shots ✓

1. Record the base SHA in `STATUS.md`. Merge `origin/dev` first if it moved. File S1's issue unless the orchestrator already has (dedupe with `gh issue list --state all --search "double-click confirm"`): the trace, F11, D11's design with the Contacts reproducer, and the slow-second-press residual.
2. Add the capture calls that do not exist yet. Commit them alone.
3. Run the capture specs on Chrome with `NULO_E2E_SHOT_DIR=~/.cache/nulo-backlog/sheet-1/before` (create it first) and `STALE_NETWORK_CAPTURES=1`: the smoke specs and `network/send-amount-exact.test.ts`. Copy `A3-confirm`'s pair from `tests/e2e/.captures/` into `before/`.

**Validation gate**: the capture specs green at retry 0; each of the nine named captures present in `before/` in both themes (other shots those specs write are ignored); the SHA and S1's issue number recorded. Layers: e2e, e2e-live-network.

### Phase 1: the sheet ✓

1. Edit `PopupCard.vue` and `Popup.vue`; drop `fit` from `SendReviewSheet.vue`; rename `.slide-*` in `base.css`; restamp `base.css.test.ts`.
2. Rewrite `PopupCard.test.ts`: (a) a card mounts with no setting to read, has no `flex-grow` and no handle element, while its slot renders inside `popup-card-body`; (b) the displace case as today. Update `SendReviewSheet.test.ts` and `FormPopup.test.ts`.
3. Update `lengthenCard`, `sheetAtRest`'s comment and the three docs.
4. In the 500-row case of `contacts-import.test.ts`, with the review open: `import-contacts-submit` and `import-contacts-cancel` lie inside the viewport; the card around `popup-card-body` does not scroll (`scrollHeight <= clientHeight`); the list, the nearest scrolling ancestor of `import-contacts-section`, does (`scrollHeight > clientHeight`).

**Validation gate**: `bun run lint && bun run typecheck:all && bun run test && bun run test:all && bun run --cwd apps/extension build-storybook`, each exit 0; on Chrome the smoke files `snackbar popup-stack contacts contacts-import token-list keyboard-guards accounts duplicate-phrase-import` green at retry 0, and `snackbar contacts-import popup-stack` on Firefox. Pass also needs `git grep -n 'handle_zone\|slide-enter' -- apps packages` empty. Layers: lint, typecheck, unit, component, storybook build, e2e.

### Phase 2: retire the setting ✓

1. Delete the key, the composable and its test, the Display row and the search row (change map). Regenerate the auto-import files with `bun run --cwd apps/extension build`.
2. Re-point the search tests to surviving rows; check each new expectation with `searchSettings` over the registry.
3. Add to `store.test.ts`: a stored config holding an unknown key (`legacyFlag: true`) beside `theme: "light"` loads `theme`, and the stored object has no unknown key after load.
4. Re-target `settings-routes.test.ts` (D6).

**Validation gate**: `bun run lint && bun run typecheck:all && bun run test && bun run test:all`, exit 0; `git grep -n -i 'showPopupFullscreen\|display-full-height\|fullscreenPopupSetting' -- apps packages` empty; `settings-routes.test.ts` green at retry 0 on Chrome and on Firefox. Layers: lint, typecheck, unit, e2e.

### Phase 3: full suites, "after" shots ✓

1. Run the whole smoke suite on Chrome, then on Firefox, each from a fresh armed build.
2. Run on Chrome `network/snack-placement network/send-picker network/popup-escape-layered network/send-amount-exact network/stale-network-reset`, then `network/popup-escape-layered network/snack-placement` with `NULO_E2E_BROWSER=firefox`.
3. Rerun Phase 0's captures into `after/`, the same way. Copy both sets into `implementations-plan/sheet-1/screenshots/{before,after}/`. Compare each with the page 33 drawings; record differences in `lessons/phase-3.md`.
4. Search the docs: `git grep -n -i 'full-height\|slide-enter\|40 *px start' -- '*.md'`; update any live doc that names them.

**Validation gate**: `bun run audit:vue` exit 0; both smoke suites and the seven network runs green at retry 0; the nine named captures in both themes in each of `screenshots/before/` and `screenshots/after/`; each browser's smoke wall-clock before (the base's last CI run) and after, and the 500-row assertion's measured runtime, recorded. Layers: all, e2e, e2e-live-network.

### Phase 4: decision page 39, folded into the PR before the merge ✓

1. Merge `origin/dev`. Drop the light line from `PopupCard.vue` (P39-01). Move the light scrim into `--scrim-popup` (D13), restamp the `base.css` hash.
2. The guard in `Popup.vue` (D14) with two `Popup.test.ts` cases; the driver's `doubleClick` and the Contacts reproducer (D15); a FIREFOX.md row and the e2e-testing skill's note for it.
3. Captures: the light sheets without the line, and `connect-expired` (the dApp overlay, `network/session-tabClose.test.ts`) before and after, light and dark, into `screenshots/p39/`.

**Validation gate**: `audit:vue`, `test:all`, `test:ci-gating` and `check:plans` exit 0; the reproducer red without the guard and green with it on Chrome and Firefox; the arc's nine smoke files green at retry 0 on both engines; `network/session-tabClose` green at retry 0 on Chrome; the reproducer's runtime recorded per browser (`lessons/phase-4.md`).

## Delivery

- One arc, one PR against `dev` from `worktree-sheet-1`, no stack (D-orch-1): `feat(ui): the flat bottom sheet, a light scrim, the full-height setting retired` (79 characters). Body: the three picks quoted with their ids; OA-1 to OA-4 and their "now" forms; the screenshots; the inventory's answer to page 30's question (no sheet needs the frame's height); the validation runs; each browser's smoke wall-clock before and after; `Closes #590` or `Refs #590` (D9).
- Open it only after Phase 3's gate and the Codex loop converge. Both e2e lanes run on `apps/extension/**` and `packages/design/src/**`; no label is needed.
- Close-out lands as the PR's final commits. The PR body first linked Phase 0's S1 issue as moved, not fixed; after Phase 4 it quotes the page-39 picks and closes it.
- S1's issue (#656, Phase 0) closes with this PR: decision page 39 picked the guard, which Phase 4 ships.
- Parallelism: none; each phase edits what the next reads.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `1b93cbfa`. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, prompts starting "You are a subagent. Don't run memo." and carrying the standard's two verbatim rules. One loop over the net diff from `1b93cbfa` after Phase 3; hard stop at three rounds.
- Log each round in `lessons/phase-N.md` and its verdict under Audit verdicts.
- Teardown after the merge: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/sheet-1/plan.md`, then `agent-worktree done sheet-1 --merged`.

## Seeds (draft; the orchestrator runs none)

```
/goal implementations-plan/sheet-1/plan.md done: Phases 0-3 marked ✓, each gate's commands reported passing in the transcript, LESSONS_FILE printed per phase, the Codex loop converged on the net diff from 1b93cbfa (resumed pass quoted with no new material finding), the PR open with Closes or Refs #590 per D9 and green checks, S1's issue linked from the PR, the close-out's archive move shown by git show --stat, `bun run test` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/sheet-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks), the next pending phase, its gate, the Codex loop after Phase 3, delivery and close-out per the Delivery section; ship OA-1 to OA-4 in their "now" forms without waiting.
```
