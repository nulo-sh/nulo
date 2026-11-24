---
plan: css-recipes-home-1
tier: mid
status: completed
issues: "#1931"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high plan audit and fresh final pass; an Opus Plan lens; per arc a Codex fix loop then an Opus diff review
base: origin/dev at e4f9011f8
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-24. Planned as two arcs; both delivered.
- **Status:** completed. Arc 1 merged as #1973. Arc 2 and this close-out ship as one PR into `dev`, whose merge archives this plan and closes #1931.
- **Shipped:**
  - Arc 1: the accent text action (`components/text-action.module.css` `.accent`), the muted link (`popup/components/modules/general/section-link.module.css` `.section_link`) and visually hidden (`components/a11y.module.css` `.visually_hidden`) each get one home. `utils/sheet-compose-ban.test.ts` refuses a feature sheet composed from outside its folder; today's cross-feature triples sit on a list that only shrinks.
  - Arc 2: form sections (`components/composite/form-section.module.css` `.section`, `.label`) and the filled auth-tab skin (`components/composite/auth-method-choice.module.css`) get one home each. `import-shared.module.css` is deleted and its four composers re-pointed. Change password, reset, new profile and its two modules compose the form-section home. `UnlockMethodChoice` and onboarding's create compose the tab skin and keep their focus rules. The two type-role overrides for the selected tab's weight are one.
- **Review:** arc 1: Codex round 1 one finding, fixed; round 2 clean; the Opus review's four findings fixed. Arc 2: Codex round 1 clean; the Opus review's B1 fixed (9f0e7bb17), B2 and B3 rejected with reasons; round 2 clean (Audit verdicts).
- **Gates:**
  - Arc 2's proof, base 9c913679b against head 9f0e7bb17: 29 smoke states, 272 captures per browser. Computed styles, hover and focus are identical in every capture; every differing pixel is matched by a same-build pair.
  - Affected e2e at retry 0 at 9f0e7bb17, both browsers. Smoke: Chrome 32 passed with 1 Firefox-only skip, Firefox 33 passed. Network `restore-again`: 2/2 on each.
  - After merging `origin/dev` at b7ea94ccc: lint, typecheck:all, test:all, audit:vue, test:ci-gating, check:plans and build-storybook green. The built CSS differs from dev's in 6 of 129 files, with a rule diff identical to the proof's, in both browsers.
- **Dropped:**
  - B2 and B3, rejected (Arc 2 review).
  - Arc 2's network proof run: every state is reached in smoke (Arc 2, Phase 4).
  - `FeeMethodSelector`'s trigger "Checking": no screen renders it (Arc 1 review).
- **Known limits:** #2007.
- **Open items:** none.
- **Lessons:** none promoted. `lessons.md` sits at 8,148 of 8,192 bytes, and nothing in it is superseded here. The Tab-walk anchor this lane learned again is already a rule of the `e2e-testing` skill. The scoped-hash renames and the same-build pixel pairs stay in `lessons/phase-1.md` and `lessons/phase-3.md`.
- **Seeds retired:** none were run; the orchestrator drove this lane.

# css-recipes-home-1: cross-feature CSS recipes get a lower-layer home, and the copies compose them

Two arcs, one PR each against `dev`, no stack. Paths are under `apps/extension/src/` unless they say otherwise. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). `#1931` carries `enhancement`; the orchestrator's lane brief is the recorded decision that brought it in.

**UI impact: none (computed styles and pixels identical; proof in each PR).**

## The issue, checked (#1931)

- **Holds:** four identical `visually_hidden` definitions; the `RecentActivityView`/`TokensView` muted pair; the filled auth-tab skin, identical in `UnlockMethodChoice.vue` and `onboarding/pages/create.vue` but for a line break in one `transition`; `FeeCostReadout.test.ts:33` selecting `[class*="visually_hidden"]`.
- **Did not hold: "the copies are identical apart from layout lines".** Of the accent-action copies only `send.vue .requote_action` is identical to `fee-shared .retry`. The others differ by more than a layout line (site table). Under the identity rule they stay, so an L3 home alone does not let `AmountCard` or `publish-mark` compose.
- **Did not hold as stated: "form sections drift from the owner".** The undivided `.section` copies drop the global's divider on purpose, and two of them say so in a comment. `section_last` copies are identical to `export_section_last`. The labels compose their role, where the global label relies on a static `type--label-section` class in each template.
- **Moved since `8ae2c06a4`:** `pages/detail-page.module.css` is `modules/tx/detail-shared.module.css` (#1966); its `.hero_link`/`.detail_link` are variants, not copies.
- **Consequence:** a retune of a hover, a hiding technique or a section's spacing reaches some screens and not others; and four features reach across folders to compose another feature's sheet, which no guard sees.

## Outcome & Quality Bar

**For whom.** The maintainer who next retunes one of these recipes; and every person on these screens, who must see nothing change.
- **Excellent:** each recipe has one home at or below its lowest consumer; every byte-identical copy composes it; a scan keeps any sheet from composing another feature's sheet, with today's edges on a reviewed list that only shrinks; each changed element computes identical styles at base and head, hovered and focused, in both themes and widths, on the built extension in Chrome and Firefox, and the frames match.
- **Good enough:** near-copies stay, each with the declaration that differs; the type-role-plus-colour labels outside form sections stay (sibling lane D2's reasoning).

## Assumptions

**Facts** (checked at e4f9011f8)
1. Vite names a module class `_<local>_<hash>_<line>`, the hash taken over the sheet's own source (`root.source.input.css`, vite 8.2.4 `build.js:5091`), and postcss-modules prepends a composed sheet's whole CSS to the composer's output (detail-styles-home-1, Fact 2). Editing `fee-shared` or `activity-card` renames every class they define, so every element composing one carries a renamed token; a composer's own names change only where its own block changes.
2. `fee-shared` is composed by 28 declarations in 14 files (25 in `modules/send`; `OperationCard`, `SendTxSummary`, `verify/index.vue` outside), `activity-card` by 11 in 5 files (`TransactionCard` and `AuthwitCard` outside). No script imports either (`git grep -n "fee-shared.module.css\|activity-card.module.css" -- '*.ts'`: only `a11y-css.test.ts:143` reads `activity-card` by path, for `.title_sep`).
3. Every arc-1 recipe element carries its class alone in its template (`:class="$style.retry"`, `$style.requote_action`, `$style.archive_link`, `$style.view_all`, `$style.visually_hidden`, the cards' `$style.direction`), so no second class on the element competes at equal specificity.
4. `type-role-ban.test.ts` reads only an element's own `composes: type--… from global`; `FeeCostReadout .retry` already takes its role through `fee-shared`, so a composer that drops its own role and composes a rule carrying it passes the scan. The e2e sweep refuses two role tokens on one element.
5. `onboarding/pages/create.test.ts:326-333` pins `create.vue`'s own `.tab:focus-visible` and `.tabActive:focus-visible`, in that order. `scripts/type-roles/exceptions.ts` `OVERRIDES` keys `.tab.tabActive { font-weight: 700 }` by file for `create.vue` and `UnlockMethodChoice.vue`.
6. The import composites render in the popup's `pages/import.vue`, inside `CollapsingHeroLayout`, and in `onboarding/pages/import.vue`, which renders no `CollapsingHeroLayout`, so nothing there loads the `export_section*` globals. A module rule can name a global class with `from global` but loads no sheet for it.
7. `.storybook/main.ts` maps `@` and `~`; its stories reach `composite/activity` cards only.
8. `ImportSecretForm.vue:111-118` documents that a composed rule plus a local override of the same property wins or loses on bundle order.

**Inferences** (the proof settles them, not this reading)
1. Removing `.retry` and `.visually_hidden` from `fee-shared` and `.visually_hidden` from `activity-card` drops those rules from each composer's prepended copy. Four composers named nothing else there and lose the whole copy: `RecipientField`, `SendTxSummary` and `verify/index.vue` no longer carry `fee-shared`'s `.detail_row`, `.whole`, `.fee_figure`, `.fee_label` and `.failed`, nor `TransactionIncomingCard` `activity-card`'s `.title_sep`, `.chip` and `.app_chip`. A dropped rule changes a screen only where another element on it relied on that chunk's copy; the proof opens each screen these four render on.
2. Moving a recipe's declarations from a composer's own rule to the home's prepended copy moves them earlier in that composer's CSS, and copies of the home in other chunks match the element too. This is safe only while no declaration left beside a `composes` sets a property the home sets, and Fact 3 leaves no equal-specificity rival on the element.

**Asks:** none. Anything visible goes to `OWNER-ASKS.md` and out of the PR.

## Site table

Verdict: **C** = identical, composes the home; **D** = differs, stays (the declaration named); **O** = out by the brief.

### Accent text action → `components/text-action.module.css` `.accent` (arc 1)

| Site | Rule | Verdict |
|---|---|---|
| `popup/components/modules/send/fee-shared.module.css:45` | `.retry` | becomes the home, byte-identical; removed here |
| `popup/components/modules/send/FeeCostReadout.vue:161` | `.retry` (composes `retry`) | C: re-pointed |
| `popup/components/modules/send/SendReviewSheet.vue:439` | `.retry` (composes `retry`) | C: re-pointed |
| `popup/windows/execute/SendTxSummary.vue:460` | `.retry` (composes `retry`) | C: re-pointed; the cross-feature edge goes |
| `popup/pages/send.vue:1340` | `.requote_action` | C: byte-identical, composes `accent` alone |
| `popup/components/modules/send/SendFeeLine.vue:145` | `.link` | D: `flex: none` for `line-height: inherit` |
| `components/composite/send/publish-mark.module.css:50` | `.warning_fix` | D: no `line-height: inherit` |
| `components/composite/send/AmountCard.vue:703` | `.action_link` | D: adds `transition: opacity 0.2s var(--bezier)` |
| `popup/components/modules/send/FeeSettingsCard.vue:714` | `.get_fee_juice` | D: no `line-height`, no `background: none`, adds `white-space: nowrap`, no focus ring |

### Muted action, accent on hover → `popup/components/modules/general/section-link.module.css` `.section_link` (arc 1)

| Site | Rule | Verdict |
|---|---|---|
| `popup/components/modules/general/RecentActivityView.vue:735` | `.archive_link` | C |
| `popup/components/modules/general/TokensView.vue:450` | `.view_all` | C |
| `popup/components/modules/general/TokensView.vue:501` | `.empty_link` | D: inline underlined link, `color: var(--txt-secondary)`, `font: inherit` |
| `popup/components/modules/general/RecentActivityView.vue:765` | `.stalled_retry` | D: no role, accent also on `:focus-visible`, a `:disabled` state |
| `popup/pages/received/[id].vue:516` | `.fee_show` | D: `type--meta`, `color: var(--txt-primary)` |
| `popup/components/modules/holdings/TokenList.vue:253` | `.fold` | D: a full-width flex row with a dashed top border, no focus ring |
| `popup/components/modules/auth/LockScreen.vue:540` | `.reset_link` | D: `transition: all`, a bottom border that turns accent, no focus ring |
| `popup/components/modules/tx/detail-shared.module.css:88,115` | `.hero_link`, `.detail_link` | D: inline-flex with an svg rule; no base colour plus underline |
| `popup/pages/register.vue:183` | `.link` | D: no role, a bottom border |

### Visually hidden → `components/a11y.module.css` `.visually_hidden` (arc 1)

| Site | Rule | Verdict |
|---|---|---|
| `popup/components/modules/send/fee-shared.module.css:25` | `.visually_hidden` | becomes the home, byte-identical; removed here |
| `components/composite/activity/activity-card.module.css:30` | `.visually_hidden` | C: removed here, with its comment |
| `popup/components/modules/settings/endpoints/EndpointOrderList.vue:400` | `.visually_hidden` | C |
| `popup/components/popups/ImportContactsPopup.vue:440` | `.visually_hidden` | C |
| `FeeCostReadout:153`, `FeeMethodRadios:207`, `FeeMethodSelector:142`, `FeeRaisedCard:143`, `RecipientField:338` (all `modules/send`), `windows/verify/index.vue:279` | `.visually_hidden` (composes `fee-shared`) | C: re-pointed; verify's cross-feature edge goes |
| `composite/activity/Transaction{Awaiting,Incoming,Terminal}Card.vue`, `modules/activity/TransactionCard.vue:229` | `.direction` (composes `activity-card`'s `visually_hidden`) | C: re-pointed |

### Form section → `components/composite/form-section.module.css` `.section`, `.label` (arc 2)

| Site | Rule | Verdict |
|---|---|---|
| `components/composite/import/import-shared.module.css:1,8,15` | `.section`, `.section_last`, `.section_label` | become the home (`.section` and `.section_last` are one declaration set); file deleted |
| `composite/import/ImportFullBackupForm.vue:166,170`, `ImportMethodPicker.vue:27,31`, `ImportSecretForm.vue:120,124`, `UnlockMethodChoice.vue:38` | compose `import-shared` | C: re-pointed |
| `popup/pages/settings/security/change-password.vue:210,217,224` | `.section`, `.section_last`, `.section_label` | C |
| `popup/pages/settings/security/reset.vue:391,398` | `.section_last`, `.section_label` | C |
| `popup/pages/settings/security/reset.vue:379,387` | `.section` + `:last-child` | D: the divider (identical to the global `export_section`, which a module cannot compose; O by the brief's dividers rule) |
| `popup/components/modules/settings/new-profile/NewProfileCredentials.vue:26,33` | `.section_last`, `.section_label` | C |
| `popup/components/modules/settings/new-profile/NewProfileMethodTabs.vue:30,37` | `.section`, `.section_label` | C |
| `popup/pages/profile/new.vue:159,166` | `.section_last`, `.section_label` | C |
| `components/composite/import/ImportSecretForm.vue:111` | `.section` | O: the documented `gap: 8px` override |
| `components/composite/CollapsingHeroLayout.vue:254-275` | `:global(.export_section*)` | stays: template-string consumers and tests select the global names (D5) |
| `popup/pages/import.vue:383` and 15 rules elsewhere (`fee_label`, `detail_key`, `GasBalanceCard .label`, …) | `type--label-section` + `--nulo-secondary` | O: a role and a colour, not a form-section recipe |

### Filled auth-tab skin → `components/composite/auth-method-choice.module.css` (arc 2)

| Site | Rule | Verdict |
|---|---|---|
| `components/composite/import/UnlockMethodChoice.vue:42-92`, `onboarding/pages/create.vue:296-349` | `.tabs`, `.tab`, `.tab:hover`, `.tabActive`, `.tabActive:hover`, `.tab.tabActive`, `.passkeyInfo` | C: identical in both (D6) |
| the same two files | `.tab:focus-visible`, `.tabActive:focus-visible` | stay local: the ring waits on #244 and `create.test.ts` pins them in `create.vue` (Fact 5) |
| `popup/components/modules/settings/new-profile/NewProfileMethodTabs.vue:49-87` | the underlined tabs | O: deliberate |

Banner-family actions: O by the brief. Search trail for "no other copy": the scratch scan (recon) over every `.vue` and `.css` under `src/` found no further identical family for any of the five recipes.

## Architecture & Implementation

- **D1, the accent action's home.** `components/text-action.module.css` holds `.accent`, the declarations of `fee-shared .retry` byte for byte, its role first. Three features share it (send module, send page, execute window), so it sits under `components/`, beside `refreshing-dot.module.css`. Composers write `composes: accent from "@/components/text-action.module.css";` and keep their local class name. `send.vue .requote_action` drops its own role, which now arrives once, through the home (Fact 4).
- **D2, the muted action stays in its feature.** Both copies live in `modules/general/`, so its home is `modules/general/section-link.module.css` `.section_link`, composed as `./section-link.module.css`. Both composers drop their own role. The issue's `text-action.module.css` for both recipes is not taken: rule 2 keeps a one-feature recipe in its feature.
- **D3, visually hidden.** `components/a11y.module.css` `.visually_hidden`, byte-identical to the four copies, keeping the name `FeeCostReadout.test.ts` selects. The two sheets that hold it drop it; their composers and the two in-file definitions compose the home.
- **D4, the guard.** `git mv utils/page-sheet-compose-ban.test.ts utils/sheet-compose-ban.test.ts`; one scan, one policy:
  - A sheet in a feature folder may be composed only from inside it. The feature folders: `popup/pages/` (whole, the old rule unchanged), `popup/windows/<x>/`, `popup/windows/` for its own files, `popup/components/modules/<x>/`, `popup/components/popups/`, `onboarding/`.
  - Shared homes, composable from anywhere: all of `src/components/**` (the L1-L3 layer, `composite/<x>/` included) and `packages/design/src/**`.
  - Any other sheet under `src/` belongs to its own directory.
  - `REVIEWED` lists each remaining cross-feature composition as `{ file, target, names }`, compared as `(file, target, name)` triples, so a new name across a listed pair is refused too. After arc 1 it holds recon edges 3, 6, 7 and the three detail pages (#1966).
  - A `composes` value is read clause by clause, split on commas as postcss-modules splits it.
  - The test fails on an unlisted triple and on a listed triple no longer in the tree, so the list only shrinks.
  - Controls: the nine existing cases, plus one refused case per folder kind (windows into a module, a module into `onboarding/`, a page into `popup/windows/`'s own sheet, an unlisted folder, a new name across a listed pair), and one allowed case per home kind (`components/a11y`, `composite/activity`, `composite/list-empty`, a window into `popup/windows/`'s own sheet).
- **D5, form sections (arc 2).** A module home beside the globals: onboarding's import renders the import composites where no global loads (Fact 6), and switching copies to global class strings edits templates (`reset.vue` collides with #1942). `.section` (= `export_section_last`'s set) and `.label` (role plus `--nulo-secondary`) serve every undivided copy; each `section_label` composer drops its own role. `import-shared.module.css` is deleted and its composers re-pointed. The globals stay. `export_section_last` and `.section` remain two homes of one declaration set: each gets a one-line comment naming the other, and the close-out files the pair as a closed `known-limit` issue (reopen when either changes).
  - *Not taken:* moving the globals into the module as `.section, :global(.export_section_last)` lists. Every composer's chunk would then carry the globals, which widens the set of screens a global's position can reach.
- **D6, the filled tab skin (arc 2).** `components/composite/auth-method-choice.module.css` holds `.tabs`, `.tab`, `.tab:hover`, `.tab_active`, `.tab_active:hover` (after `.tab:hover`: both 0,2,0 and both set `color`), `.tab.tab_active` and `.passkey_info`. The two composers keep their local names and their two focus rules (Fact 5; the brief's ring rule: an identical ring moves with an accent or muted recipe, no ring recipe is pulled out, and the tab rings stay because `create.test.ts` pins them). Each `.tab` composer drops its own `type--segment`. The two `OVERRIDES` entries in `exceptions.ts` become one, keyed on the new file with both scopes joined (`judgeAs` matches a listed scope; `UnlockMethodChoice`'s is already a selector list).
- **D7, no near-copy composes.** A rule that differs by one declaration stays as it is (lane rule 1). Composing a shared core and keeping the difference local is the trap Fact 8 documents.
- **D8, proof shape.** Every recipe element is read in its real rendered state; every screen that renders a renamed class is opened (Phases 2 and 4). A probe never stands in for a state.

**Competing outline (B), rejected.** Keep each recipe in its feature owner, make `send.vue`, `EndpointOrderList` and `ImportContactsPopup` compose `fee-shared`, and close the edge with the scan. It renames fewer classes, so its proof is smaller. It adds three new edges into `modules/send`, leaves the only owners in feature modules, and an L3 component still cannot compose them. Both audit legs rejected it.

## Security & Adversarial Considerations

No trust boundary, data, permission, dependency or wire format changes: stylesheets and tests only. The visually hidden live regions (`verify-announce`, `endpoint-order-announcement`, `send-destination-more-live`, the fee sentences) must stay hidden and in the accessibility tree: a hiding rule that lost to another would show a screen reader's text on screen, or a lost `position: absolute` would shift the layout. The computed-style proof reads every one. The risk the adversarial review targets is a wrong screen: an equal-specificity flip from a moved declaration, a "copy" that differed, a removed class still named somewhere, a doubled role token, or a build whose chunk order differs from the one measured.

## Arc 1, Phase 1: homes, composes, guard

1. Add `components/text-action.module.css`, `components/a11y.module.css` and `modules/general/section-link.module.css`, each with the home's rule byte for byte.
2. Edit only the `<style>` blocks and sheets the arc-1 site table names. Keep at least one unchanged line between this edit and #1945's hunks in `send.vue`.
3. Do D4. Update no other test; list every edited expectation in the PR.
4. Check each composer: no declaration left beside its `composes` sets a property the home sets (Inference 2).
5. Build Chrome at base and head. Normalise scoped names and compare every CSS file. Pass: the only differences are the removed rules, the four whole copies Inference 1 names, the changed `composes` targets and the homes' prepended copies.

**Validation gate.** Run `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run audit:vue`, `bun run test:ci-gating`, `bun run check:plans` and `bun run --cwd apps/extension build-storybook`, one at a time. Pass: each exits 0 at retry 0, and the scan test reds on a mutation that adds a cross-feature `composes` (reverted). Layers: lint, typecheck, unit, build.

## Arc 1, Phase 2: prove nothing changed

1. Copy the sibling's harness (`~/.cache/nulo-backlog/detail-styles-home-1/{proof,scripts}`) into `~/.cache/nulo-backlog/css-recipes-home-1/`. Never edit the originals. Adapt the copy:
   - retarget its worktree and build paths, and record each build's commit and `dist` hash in the manifest;
   - run the hover and focus passes at both widths, not 360 px alone;
   - scroll each target into view, and assert it is the element that matches `:hover` or holds focus;
   - walk the Tab order until it returns to its first stop, and fail loudly past a cap rather than stop silently.
2. Build the armed smoke extension (`VITE_NULO_E2E_*` as the sibling's `rebuild-and-verify.sh`) for both browsers at base and at head.
3. Seed and open each state below. Refuse the Testnet RPC and the price host; seed prices in storage:
   - Home: recent activity with an awaiting, an incoming and a terminal card (their hidden direction words); tokens over the cap, so "View all" shows.
   - The Activity page; a token's detail page.
   - Send: the person step (`send-destination-more-live`); the form with its fee line; the fee sheet while its methods are "Checking", then settled, with the sponsored and the unvouched sentences; the failed estimate with "Try again" (`fee-estimate-retry`, by refusing the route as `snack-placement` does); the review sheet, also failed (`send-review-fee-retry`); both slow branches (`fee-estimate-slow`, `send-review-fee-slow`), by holding the estimate past `ESTIMATE_SLOW_MS`; fiat mode after the seeded price moves (`send-fiat-requote`).
   - The execute window (execute fixture) with its send summary.
   - An endpoint list; the import-contacts popup with a changed contact; the authwits page and its revoke and registry popups (both render `FeeSettingsCard`), with `FeeMethodSelector`'s menu open while its rows are checking (`FeeMethodSelector.vue:76`), by holding the method check. Its trigger's pending branch (`:48-51`) renders on no screen (Arc 1 review).
   - Controls with no changed rule: Holdings, a received detail, the lock screen.

   As run: smoke cannot open the review, since its estimate never lands on the stand-in node. The review's failed and slow lines, the form's and the fee sheet's slow lines, the fee sheet's checking payers, the authwit menus' checking rows and Home's awaiting card are read in the network run (step 4). [lessons/phase-1.md](lessons/phase-1.md) says how each state is reached.
4. Seed and open, in one scratch network proof run per browser and build, reusing the specs' own setups:
   - the verify window (`connect-check-window`'s connect);
   - the fee window's raised card (`tx-sendTx-default`'s approval ceiling);
   - the execute window's failed authorization preview (`execute-op-authwits-preview-retry`): the private sponsored NO_FROM request of `tx-sendTx-noFrom` (proverless). Let setup and admission finish, then fail the preview's node request, recorded by method. Capture only when the retry node is present and the refusal surface is absent. As run, refusing the witness read alone did not fail it, so every node call is refused from the gate's release.
   - As run, the states step 3 could not reach: Send's fee sheet with its payers checking; a queued send's review, waiting, slow, then failed; the form's and the fee sheet's slow lines; Home's awaiting card; the authwit popups' menu rows checking.
   - Keep the scratch spec outside the repo except for the run; never stage it.
5. On each state, dump every element's full computed style, `::before` and `::after` included, in light and dark, at 360 and 320 px. Hover every pointer element and tab through every focus stop. Screenshot the screen. Visit the screens in two orders on fresh popups.
6. A state none of steps 3-4 reaches stops the arc: name it and return it to the panel. A probe is diagnostic only.
7. Compare base to head per browser: identical sorted declarations and zero unexplained pixels. A glyph-fringe pixel passes only with its location and channel delta matching a same-build rerun's. As run, the reruns are the same state in either visit order on any run of that build. Write frames and `manifest.json` under `~/.cache/nulo-backlog/css-recipes-home-1/frames/`.
8. Run the affected e2e at retry 0 on Chrome and on Firefox:
   - smoke: `send-keyboard`, `send-fee-privacy`, `send-outcome-rows`, `type-roles`, `execute-steps`, `home-links`, `rows`, `navigation`, `endpoints`, `contacts-import`;
   - network, one `e2e:agent` run per browser: `fee-methods`, `fiat-send`, `snack-placement`, `home-cap`, `endpoint-order`, `connect-check-window`, `tx-sendTx-default`, `authwit-lifecycle`, `type-roles-windows`.

**Validation gate.** Pass: every dump identical, no unexplained pixel, every state of steps 3-4 read, and every listed spec green at retry 0. A difference stops the arc: capture it and write `OWNER-ASKS.md`.

## Arc 2, Phase 3: form sections and the tab skin

1. Do D5 and D6. Edit only the `<style>` blocks, sheets and `exceptions.ts` the arc-2 tables name. In `reset.vue`, keep an unchanged line between this edit and #1942's hunks.
2. Run Phase 1 steps 4-5 for the arc-2 sheets.

**Validation gate.** Same commands and pass criteria as Phase 1. `create.test.ts`, `FilePasswordSection.test.ts`, `NewPasswordPair.test.ts` and `full.test.ts` pass unedited.

## Arc 2, Phase 4: prove nothing changed

1. Seed and open, per Phase 2's method: the popup's import page (seed, file, full backup, each unlock method); `restore-again` with a backup chosen and its unlock-method step; onboarding's import; change password; reset; new profile (both methods); onboarding create (both tabs, the passkey note).
2. Run the affected e2e at retry 0 on both browsers: smoke `backup-roundtrip`, `security`, `registration`, `onboarding-tab`, `type-roles`; network `restore-again`.

As run ([lessons/phase-3.md](lessons/phase-3.md) says how each state is reached):
- Every state is reached in smoke, so no network proof run: Restore again reads its reminder from storage, seeded as a partial restore leaves it; a pick only reads the file, so a plain file reaches the unlock-method step and a sealed one the decrypt step. Restore again's own form asks no new password, so its unlock-method step is the import page's, read on both import pages.
- The cross comment on `export_section_last` renames every class of `CollapsingHeroLayout.vue`, so D8 also opens its five other screens: accounts import, the three exports, unlock method.
- Onboarding is read at 720 px too, its tab's width.
- Each tab is read unselected, hovered, selected, selected and hovered, and focused. An unselected tab never holds focus: Tab skips it and an arrow selects the tab it focuses. A disabled tablist (`importing`, `isCreating`) matches no rule the enabled states do not, plus `AuthMethodTabs`' own `.disabled`, which this arc leaves alone.

**Validation gate.** As Phase 2.

## Audit verdicts

Codex plan pass (`gpt-6.1-sol` high) and the Opus Plan lens, both over this plan and outline B at e4f9011f8: **conditional approve** from each. Detail in [lessons/phase-0.md](lessons/phase-0.md).

| # | Finding | Label | Disposition |
|---|---|---|---|
| C1 | Facts 1, 2, 6 misstated: the hash covers the sheet's own source; 28 declarations in 14 files and 11 in 5; the popup's import page does render `CollapsingHeroLayout` | demonstrated | accepted: Facts rewritten |
| C2 | A pair-level list lets a new name cross a listed pair | demonstrated | accepted: triples (D4), with a control |
| C3, O4 | A probe can pass while the real state changes (reconstructed ancestry, inherited values, an unloaded chunk) | demonstrated gap | accepted: real states only; an unreached state stops the arc (D8, Phase 2 step 6) |
| C4 | A pixel allowance by count can hide a real difference | plausible | accepted: zero unexplained pixels, fringe evidence by location and channel |
| O1 | Both authwit popups render `FeeSettingsCard` and were not opened; `authwit-lifecycle`, `fiat-send` missing | demonstrated | accepted: Phase 2 steps 3 and 8 |
| O2 | The requote and the hidden sub-states were not named | demonstrated | accepted: Phase 2 step 3 |
| O3 | `restore-again` renders re-pointed import rules | demonstrated | accepted: Phase 4 |
| O5 | `composite/<x>/` as a feature folder refuses L4→L3 edges into the layer the brief names as home | demonstrated | accepted: all of `src/components/**` is shared (D4); recon edges 1-2 leave the list |
| O6 | Inference 2 omitted its condition: no local declaration beside a `composes` sets a home's property | plausible | accepted: Inference 2 and Phase 1 step 4 |
| O7 | Dropping the composer's own role stated for D1 only | plausible | accepted: D2, D5, D6 |
| O8 | `OVERRIDES` is not the baseline; `.tab:hover` must precede `.tab_active:hover` | demonstrated | accepted: D6 |

### Arc 1 review

Codex loop (`gpt-6.1-sol` high, read-only) over `4d18591bd..HEAD` and this plan, and one Opus diff review beside round 1. Detail in [lessons/phase-1.md](lessons/phase-1.md).

| # | Finding | Label | Disposition |
|---|---|---|---|
| A1 | The built-CSS comparison keyed chunks by basename: six `_id_` and three `import` files overwrote each other, so it read 121 of 128 files | demonstrated | accepted: same-named files paired one to one by shared rules, every file paired once; 13 of 128 differ |
| A2 | `REVIEWED` carried a `why` no assertion read, one ending in an issue reference | demonstrated | accepted: field removed |
| A3 | The homes' comment told a composer how to compose, not what it must not do | plausible | accepted: reworded |
| A4 | Inference 1 missed the four composers that lose a whole prepended copy | demonstrated | accepted: Inference 1 and Phase 1 step 5 name them |
| A5 | The scan read a `composes` value as one clause; postcss-modules splits it on commas | demonstrated | accepted: per-clause parse by that grammar, with a case that reds without the split |

Round 1: **findings** (A1; A2-A5 are Opus's). Round 2, resumed over `cef64b7cd`: **clean**. It also confirmed, high confidence, that `FeeMethodSelector`'s trigger "Checking" renders on no screen: its only consumer passes `pending` as `onSend && …` and mounts it only off Send. That branch is dead code, not an unreached state, so step 6 does not stop the arc.

### Arc 2 review

Codex loop (`gpt-6.1-sol` high, read-only) over `9c913679b..HEAD` and this plan, and one Opus diff review. Detail in [lessons/phase-3.md](lessons/phase-3.md).

| # | Finding | Label | Disposition |
|---|---|---|---|
| B1 | The tab skin's comment named `.tab_active:hover` after `.tab:hover`, not `.tab_active` after `.tab`, the same tie | demonstrated | accepted: one comment covers both pairs; the head proof reran on the renamed classes |
| B2 | `popup/pages/import.vue .section_label` is identical to the home's `.label` | demonstrated | rejected: it labels `.name_section` (gap 8px, bottom padding only), not a form section; the Site table's O stands |
| B3 | `ImportMethodPicker` and `NewProfileCredentials` now hash to the same scoped tokens | demonstrated | rejected: neither token carries a declaration |

Round 1: **clean**. The Opus review: B1-B3. Round 2, resumed over B1's fix and the two rejections: **clean**.

## Decision ledger

| # | Question | Codex | Opus | Decided, and why |
|---|---|---|---|---|
| D2 | Muted action's home | `modules/general` | `modules/general` | `modules/general/section-link.module.css` (rule 2) |
| D4a | Detail pages on the list, or exempt by policy | list | list | list: any rule exempting them also admits pages into other modules |
| D4b | Pair or triple entries | triple | pair, plus a known limit | triple: it closes a demonstrated hole at no new mechanism; a growing detail family edits the list in review, which is the point |
| D4c | `composite/<x>/` a feature folder | yes (as drafted) | no | no: Opus's layer argument; `src/components/**` is the home the brief names |
| D5 | Module beside the globals | yes | yes, two homes as a known limit | yes, with the cross comments and the known limit |
| D6 | Move `.tab.tab_active`, merge overrides; `.passkey_info` in the skin | yes, yes | yes, yes | yes; file named `auth-method-choice` (Codex) |
| D8 | Probe as acceptance | never | under four conditions | never: a `v-if` parent cannot be reached by a probe, so its conditions fail where it would be needed |
| B | Outline B | reject | reject | reject |

Fresh final Codex pass (`gpt-6.1-sol` high, new session) over the consolidated plan and this ledger: **conditional approve**. Its three conditions, all accepted into Phase 2: the copied harness reads hover and focus at 360 px only, skips off-screen targets and caps the Tab walk (demonstrated in `detail-styles.proof.ts`); the slow branches and `FeeMethodSelector`'s open checking menu were not named (demonstrated: `ESTIMATE_SLOW_MS`, `FeeMethodSelector.vue:76`); the failed preview needs the NO_FROM setup and an exact interception, or an account-paid request never reaches the preview and a refusal hides the retry (plausible). Resumed over the revision: **approve**, no new material defect.

## Delivery

- **Arc 1** (Phases 1-2): branch `css-recipes-home-1-a1` off `origin/dev`, PR `refactor(styles): text actions and visually hidden get one home each, and a scan closes the edge`, body `Part of #1931` plus what arc 2 leaves. Opened ready after the gates and the arc's review loop.
- **Arc 2** (Phases 3-4 and the close-out): branch off `origin/dev` after arc 1 merges, PR `refactor(styles): form sections and the filled auth tabs get one home each`, `Closes #1931`.
- Each body: where each recipe lives and why, each copy replaced, each near-copy with its differing declaration, the computed-style and pixel tables, the validation runs and outcomes, "No visible change.", every edited test expectation. No arc adds an e2e scenario, so no suite runtime changes. Labels only if a path filter would skip a needed suite.
- Parallelism: none; arc 2's homes and the scan's list depend on arc 1.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at e4f9011f8, per arc, at the arc boundary:
1. No diff review (`code_review: off`).
2. The Codex loop (`gpt-6.1-sol`, `high`, read-only) over the arc's diff, this plan and the arc map ("arc N of 2; arc 2 adds the form-section and tab homes"), with the two verbatim rules and the adversarial ask: a `composes` that changes which of two equal-specificity rules wins; a "copy" that differed by a declaration; a class removed that a test, a spec or another `composes` still names; a specificity change from a rewritten selector; a doubled role token; a build whose chunk order differs from the one measured; a screen that carries a changed rule and was not opened. Until clean, hard stop at three rounds. Then one Opus diff review (`general-purpose`, same asks). Any style change reruns Phase 2 or 4 for what it touches.
3. Delivery as above; `gh pr checks <n> --watch`.
4. Close-out in arc 2's final commits: Outcome block, lessons promotion, open items filed, `STATUS.md` deleted, `git mv` into `archive/` in its own commit, index line moved.
5. Teardown is the orchestrator's after the merge.

## Seeds

None run; the orchestrator drives this lane.
- `/goal Both arcs of implementations-plan/css-recipes-home-1/plan.md delivered: each phase's gate reported green in the transcript, each arc's Codex loop converged, arc 1's PR open with "Part of #1931" and arc 2's with "Closes #1931", the plan archived in arc 2.`
- `/loop 15m Drive implementations-plan/css-recipes-home-1 forward per its plan.md: reality check, next pending step, its gate, the arc loop at each boundary; never merge.`
