---
plan: detail-styles-home-1
tier: light
status: completed
issues: "#1929"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex gpt-6.1-sol high pass over the plan and one over the completed diff; an Opus Plan lens on the plan
base: origin/dev at 4d62d8c92
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-24. Planned and delivered as one arc.
- **Status:** completed. The arc and this close-out ship as one PR into `dev` (#1966); its merge archives this plan and closes #1929.
- **Shipped:** the detail family's shared sheet moved byte-identical to `popup/components/modules/tx/detail-shared.module.css`, the lowest layer that consumes it, so every class it owns keeps its name. Nine role-less copies compose it: `TxDebugPanel`'s three, `TxFeeRow`'s four and the received page's two. The estimated fee is now `.detail_value_mono.detail_value_est`, so it wins in any chunk order. `utils/page-sheet-compose-ban.test.ts` refuses any sheet outside `popup/pages/` composing one under it.
- **Review:** the Codex diff pass found P1 and P2, both fixed in 750f695ef. E1 came from smoke and was fixed in 1d0f330ff. Codex then verified all three fixes with no new finding (Audit verdicts).
- **Gates:**
  - Phase 2 green at 1d0f330ff. The Chrome glyph-fringe pixels are the one recorded deviation.
  - `audit:vue` and `test:all` green at e60d73eb9, and `audit:vue` green again after merging `origin/dev` at 2e2604c76.
  - Smoke and network e2e green on both browsers at retry 0.
- **Dropped:**
  - The `.detail_value_aux` → `.meta_sep` merge: two copies now compose `detail_value_aux`, so the issue's condition fails.
  - Composing `TxDebugPanel` `.details_box`: it would import the shared narrow-width `column-gap`.
  - Composing the copies that render an identifier: the static role scan needs the role in their own rule, and the e2e sweep refuses it twice (D2).
- **Known limits:** none.
- **Open items:** none.
- **Lessons:** none promoted. `lessons.md` sits at its budget (8,148 of 8,192 bytes) and nothing in it is superseded here. The doubled role token stays in `lessons/phase-1.md`.
- **Seeds retired:** none were written; the orchestrator drove this lane.

# detail-styles-home-1: the detail rows' shared styles move below their consumers

One arc, one PR against `dev`. Paths are under `apps/extension/src/` unless they say otherwise. Consults: [lessons/phase-1.md](lessons/phase-1.md). `#1929` carries the `enhancement` label; the orchestrator's lane brief is the recorded decision that brought it in.

**UI impact: none (computed styles and pixels identical; proof in the PR).**

## The issue, checked (#1929)

- **Demonstrated: upward `composes`.** Nine `composes … from "…/pages/detail-page.module.css"` lines sit in L4 and L5 files: `TxHashRow.vue:44,53`, `DetailHeroMeta.vue:48,52,56,60`, `DetailAddressCard.vue:58,71` (all under `popup/components/modules/tx/`), and `popups/IncomingTrustPopup.vue:307`. Biome's `noRestrictedImports` reads only script imports, so nothing stops a tenth.
- **Demonstrated: hand copies.** The detail family re-declares shared rules by hand: `TxDebugPanel.vue` (`.detail_key`, `.detail_value_mono`, `.detail_value_aux`, and `.raw_call_method`, `.raw_call_aux` under other names), `TxFeeRow.vue` (`.detail_key`, `.fee_grid_key`, `.detail_value_mono`, and `.detail_value_aux`, a copy of `.amount_fiat`), `TxHashRow.vue` (`.detail_value_mono`), `tx/[id].vue` (`.detail_value_mono`, `.detail_value_aux`, `.call_contract`) and `received/[id].vue` (`.detail_value_mono`, `.detail_value_aux`, `.detail_key_note`). Retuning a shared rule today misses all of them.
- **Did not hold as stated: "merge `.detail_value_aux` with `.meta_sep`".** The shared `.detail_value_aux` is dead only while the copies above stay copies. Once two compose it (D2), it has consumers, and the brief's condition for the merge (nothing composes it) fails. See D3.
- **Did not hold: "replace each copy with `composes:`".** Seven copies render a trimmed identifier. The two type-role guards together forbid them to compose a shared rule that carries their role (Facts 7 and 9), so they stay copies. See D2.
- **Consequence:** a retune that reaches some detail rows and not others, a wrong screen; and a page stylesheet that four lower-layer files break on if it moves.

## Outcome & Quality Bar

**For whom.** The maintainer who next retunes a detail row; and every person who opens a tx, receipt or failed-send detail, who must see nothing change.
- **Excellent:** one stylesheet owns the detail family's look, at the lowest layer that consumes it; every hand copy of its rules that the role guards allow composes it; a source scan keeps a component from composing a page's sheet again; every changed element computes identical styles at base and head, light and dark, on the built extension in Chrome and Firefox, and the screens match pixel for pixel.
- **Good enough:** same-declaration rules outside the detail family stay as they are (D2); near-copies stay and are listed.

## Assumptions

**Facts** (checked at 4d62d8c92)
1. Vite builds CSS modules with postcss-modules' default scoped name, `_<local>_<hash of the sheet's content>_<line>`: the base build names the shared sheet's classes `_detail_key_cbymy_16` and so on in all six CSS files that carry it. A byte-identical move keeps every class name.
2. postcss-modules prepends a composed sheet's whole CSS to the composer's output, so each chunk that composes the shared sheet carries a copy of all its rules: six CSS files in the base Chrome build.
3. In the tx page's chunk CSS, `TxFeeRow`'s rules come first and the shared sheet's copy comes after them (`dist/chrome/assets/_id_-*.css`, base build). `TxFeeRow.vue:51` binds `[detail_value_mono, detail_value_est]`, two equal-specificity rules that both set `color`.
4. `detail-page.styles.test.ts` pins the pages' and `DetailHeroMeta.vue`'s `composes` strings with the path; `a11y-css.test.ts:95` reads the sheet, `:124` matches `detail-page.module.css` in a regex and `:175` lists its path.
5. No other sheet under `popup/pages/` is composed from outside `popup/pages/` (`git grep 'composes:.*from ".*pages/'`).
6. `.copyable` (`packages/design/src/base.css:356`) sets only `cursor`; `FeeAmount.vue` has no styles.
7. `type-role-ban.test.ts` sees a role only in the element's own rule (its header lists cross-file composition as a blind spot), and its reviewed list is empty: a copy that drops its own `composes: type--meta from global` reports every `trimAddress(` under it.
8. Composing a class brings every selector that names it: the shared `.details_box` carries `@media (width < 359px) { .details_box > * { column-gap: 16px } }`, which `TxDebugPanel`'s own `.details_box` does not.
9. The e2e role sweep (`tests/e2e/fixtures/type-roles.ts`, `judgeReading`) refuses an element whose class list holds anything but exactly one role token: a rule composing `type--meta` and a shared rule that composes it too renders `type--meta` twice (smoke `type-roles.test.ts`, red at 3f94bce25). `archive/type-roles/lessons/phase-5.md` records why `TxHashRow` kept its own role.

**Inferences**
1. Composing a copy moves its declarations from the composer's own rule to the shared sheet's copy, earlier in the composer's chunk. Only an element that also carries another class setting the same property at equal specificity can change. Fact 3 is the one such element found by reading every template use (`TxFeeRow`'s estimated value). The proof below is what settles it, not this reading.
2. Making `TxFeeRow` and `TxDebugPanel` compose the sheet adds two more copies of it to the tx chunk. The proof covers that too.

**Asks:** none. Anything visible goes to `OWNER-ASKS.md` and out of the PR.

## Architecture & Implementation

- **D1, the home.** `git mv popup/pages/detail-page.module.css popup/components/modules/tx/detail-shared.module.css`, byte-identical. Pages compose it downward (`../../components/modules/tx/detail-shared.module.css`), the tx modules as a sibling (`./`), the popup from `../modules/tx/`. `modules/tx/` is the lowest layer that consumes the sheet and already holds `tx-shared.module.css`.
  - *Not taken:* extract the component-used rules and leave the page-only ones (`.wrapper`, `.content`, `.empty_*`, `.type_chip`, `.app_*`, `.address_pair`) in `pages/`. It splits the narrow-width `@media` block across two sheets, changes every composer's prepended CSS and every class hash, and gains no reader anything: the family's look stays one sheet either way.
- **D2, copies compose where the role guards allow.** A copy with no `trimAddress(` under it becomes `composes: <shared> from "<sheet>";` alone, keeping its local class name (templates and testids untouched); its role arrives once, through the shared rule, as on the journal page and in `DetailHeroMeta`: `TxDebugPanel` `.detail_key`, `.detail_value_aux`, `.raw_call_method`; `TxFeeRow` `.detail_key`, `.fee_grid_key`, `.detail_value_mono`, `.detail_value_aux` (→ `amount_fiat`); `received/[id].vue` `.detail_value_mono`, `.detail_key_note` (→ `detail_value_aux`). A copy that renders an identifier stays a copy, byte-identical to base: the static scan needs its role in its own rule (Fact 7) and the sweep refuses it twice (Fact 9). Those are `TxHashRow` `.detail_value_mono`, `TxDebugPanel` `.detail_value_mono` and `.raw_call_aux`, `tx/[id].vue` `.detail_value_mono`, `.detail_value_aux` and `.call_contract`, and `received/[id].vue` `.detail_value_aux`. Scope is the detail family: the three detail pages, `popup/components/modules/tx/`, and `IncomingTrustPopup.vue`.
  - Left, with reason: rules outside the family that happen to share a type role and colour (`GasBalanceCard .fiat`, `FeeCostReadout .fee_usd`, the activity cards' `.hash`, the settings `section_label`s and more, from a scan of every `.vue` and `.css`). Composing them would tie unrelated screens to the detail sheet, the coupling this issue removes. Rules whose one declaration is `color: var(--nulo-secondary)` (`TxFeeRow .detail_value_est`, `.fee_grid_aux`) are a token, not a copy of a role. `TxDebugPanel`'s `.details_box` stays a near-copy: composing would add the narrow-width `column-gap` to its rows (Fact 8). Near-copies that differ by a declaration are listed in the PR.
- **D3, no merge.** The shared `.detail_value_aux` stays: after D2 two aux copies compose it, and its name says what they are; `.meta_sep` stays for the hero's separator, pinned by `detail-page.styles.test.ts`. The identical `.caption` / `.detail_key` pair stays for the same reason. The sheet stays byte-identical, so Fact 1 holds for every class.
- **D4, the estimated fee keeps its colour.** `TxFeeRow`'s `.detail_value_est` becomes `.detail_value_mono.detail_value_est`, as `DetailAddressCard`'s `.card.card_static` does: two classes outrank the shared one-class rule in any chunk order (Fact 3). The proof shows the computed colour unchanged.
- **D5, the edge stays closed.** New `utils/page-sheet-compose-ban.test.ts`, in the style of the ban tests: it walks every `composes` declaration in every `.vue` and `.css` under `scripts/type-roles/source-scan.ts`'s `SCAN_ROOTS` with `parseSource`, resolves `from` (relative, the `@/`, `~/` and `src/` aliases of `vite.config.ts`, or root-relative `/src/`), and fails on a file outside `popup/pages/` that composes a sheet under it. Controls: the real tree yields no finding and at least one resolved `composes from` per detail page; synthetic sources composing a page's sheet by a relative path, by each alias, by `/src/`, in single quotes, with two names, as a rule's second `composes` and from a `.module.scss` each yield one finding; a page composing `../empty-state.module.css` yields none.
- **Tests that change, path only:** `detail-page.styles.test.ts` (the path in each pinned `composes` string and the sheet's path at `:37`), `a11y-css.test.ts:95` (the path it reads), `:124` (the regex's path part) and `:175` (the path it expects the scan to read). Each edited expectation is listed in the PR.

## Security & Adversarial Considerations

No trust boundary, data, permission or dependency changes: stylesheets and tests only. The one risk is a visible change, which is a wrong screen for the person reading a transaction; the proof below guards it.

## Phase 1: move, compose, guard

1. Do D1. Update the nine lower-layer and the page `composes` paths, and the two tests' paths.
2. Build Chrome. Confirm every CSS file matches the base build once each composer's own `_<local>_<hash>_<line>` names are normalised: a composer's hash covers its own block, `from` path included; the shared sheet's `_cbymy_` names stay byte-identical.
3. Do D2 and D4. Do D5.
4. Run the fast gates after each step.

**Validation gate.** `bun run lint`, `bun run typecheck:all`, `bun run test` (new ban test and both edited tests green), `bun run test:all`, `bun run audit:vue`, `bun run check:plans`. Pass: exit 0 at retry 0.

## Phase 2: prove nothing changed

1. Build the armed smoke extension for Chrome and Firefox at base (done: copies under `~/.cache/nulo-backlog/detail-styles-home-1/dist/`) and at head.
2. Run one scratch smoke spec (kept outside the repo) against each build and browser. It seeds a token, a dApp transfer with a block, fee estimate and chunk nonce, a public receipt, a failed send and a dApp call record, and a pending trust; it turns developer mode on and refuses the Testnet RPC.
3. On each screen (an estimate-only tx and a paid tx, each with the fee breakdown and debug panel open; a public and a private receipt; both journal details; the incoming-trust popup), with prices on and the explorer on and set to None, matching elements by DOM path, never by class, in light and dark, at 360 and 320 px wide, the spec dumps every element's full computed style, `::before` and `::after` included, and screenshots a viewport tall enough to show the whole screen. It also hovers each element with a pointer cursor and each address card, and tabs through each focus stop, hashing the computed styles after transitions settle. It visits the screens in two orders on fresh popups (tx first, received first).
4. Compare base to head per browser: identical style dumps and zero differing pixels. Write frames and `manifest.json` under `~/.cache/nulo-backlog/detail-styles-home-1/frames/`.
5. Run the existing smoke specs that open these screens (`rows.test.ts`, `send-outcome-rows.test.ts`, `received-fee-privacy.test.ts`, `type-roles.test.ts`) on Chrome and Firefox at retry 0. Run the network specs that open them in one `e2e:agent` run per browser and prover mode: proverless `failed-send-check` and `incoming-arrival`; prover-on `fee-sponsor-funding`, `incoming-transfers`, `snack-placement`, `token-add-auto-trust` and `type-roles-windows`.

**Validation gate.** Every dump identical, every pixel count zero, every listed spec green at retry 0. A difference stops the arc: capture it and write `OWNER-ASKS.md`.

**Result at 1d0f330ff** (the PR carries the per-screen table):
- **Computed styles:** 144 captures (72 per browser), 49,016 element reads in all, identical at base and head, hover states and focus stops included.
- **Firefox frames:** byte-identical.
- **Chrome frames (deviation, judged noise):** 22 pixels in 5 frames differ. Every one lies in column x=19 with a channel delta of at most 5, the subpixel fringe of one glyph. Two runs of the one head build differ by 48 such pixels, so the gate reads this as render noise rather than a difference.
- **Trust popup:** its first capture caught Home's loading placeholders under the popup in one run. It was recaptured over a settled Home on both builds; all 16 captures match, with zero differing pixels.
- **Smoke:** Chrome 27 passed and 1 Firefox-only skip; Firefox 28 passed.
- **Network (`e2e:agent`, retry 0):** proverless 9/9 on Chrome (549 s) and Firefox (530 s); prover-on 19/19 on Chrome (1,132 s) and Firefox (1,520 s).

## Audit verdicts

Codex plan pass (`gpt-6.1-sol` high) and the Opus Plan lens, both over this plan at 4d62d8c92; transcript summary in [lessons/phase-1.md](lessons/phase-1.md).

| # | Finding | Label | Disposition |
|---|---|---|---|
| C1, O2 | Composing `TxDebugPanel .details_box` adds the shared narrow-width `column-gap` to its rows | demonstrated (base CSS) | accepted: left as a near-copy (Fact 8) |
| C2, O4 | `a11y-css.test.ts:175` names the old path | demonstrated | accepted: path updated |
| C3, O5 | D5 misses the `~/` and `src/` aliases, `.scss`, quotes, a second `composes` | demonstrated (design) | accepted: all resolved, a control each |
| C4, O6 | The proof never renders D4's element, the static card, the copy branches; one navigation order only | plausible | accepted: Phase 2 states and orders widened |
| O1 | A copy dropping its own role reds `type-role-ban` | demonstrated | accepted: role first in each copy (D2) |
| O3 | Composer hashes change with the `from` path, so "byte-identical CSS" cannot hold | demonstrated | accepted: compare after normalising composer names |
| O5b | `<style module src>` bypasses the scan | needs conditions the tree lacks (no `<style src>` exists) | rejected: the ban covers `composes`, which is the edge #1929 names |

Both legs found no other equal-specificity flip in the changed templates; both endorse D1, D3 and D4.

Post-implementation: one Codex pass (`gpt-6.1-sol` high) over the plan and `4d62d8c92..3f94bce25`, then targeted verification in the same session.

| # | Finding | Label | Disposition |
|---|---|---|---|
| P1 | A root-relative `from "/src/popup/pages/…"` resolves in Vite and passed the ban | demonstrated (compiled) | fixed in 750f695ef; the new control reds without the fix |
| P2 | The comment on `compositions` narrated its code | demonstrated | removed, 750f695ef |
| E1 | Smoke `type-roles.test.ts` red: copies composing their own role and the shared rule render the role token twice | demonstrated (smoke, Chrome) | fixed in 1d0f330ff (D2 revised); Codex verified one role token per class export and byte-identical restored copies |

## Delivery

One arc, one PR, `refactor(styles): detail rows' shared styles move below their consumers`, `Closes #1929`, opened ready after the Codex pass and its verification. The body states where the rules live and why, each copy replaced, each near-copy left, the computed-style and pixel tables, the validation runs and "No visible change." The close-out is the PR's final commits.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 4d62d8c92, bounded work: one Codex pass (`gpt-6.1-sol`, `high`) over this plan and the completed diff, with the two verbatim rules and the adversarial ask: a `composes` that changes which of two equal-specificity rules wins; a "copy" that differed by a declaration; a class removed that a test, a spec or another `composes` still names; a specificity change from a rewritten selector; a build whose chunk order differs from the one measured. Then targeted verification of material fixes, re-running Phase 2 for any style change. Close-out per that standard (step 4), including `STATUS.md` deleted and the `git mv` into `archive/` in its own commit. Teardown (step 5) is the orchestrator's after the merge.

`/goal` and `/loop` seeds: none; the orchestrator drives this lane.
