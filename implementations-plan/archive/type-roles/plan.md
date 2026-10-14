---
plan: type-roles
tier: mid
status: closed (2026-10-13); arcs 1 to 5 in review as #357 to #361, with the close-out PR on top
driver: claude-code
claude_model: opus
codex_model: sol (gpt-6.1-sol, high)
code_review: off
explainer: off
eli5_mode: artifact
base: ac259a7 (rebased from f5ca160 on 2026-10-10); resynced onto dev 73c000e, 8d01f9b, 39b50d8, 1cb8d8b4 and e900f710
---

## Outcome

- **Date:** 2026-10-13.
- **Status:** closed with its delivery. Arcs 1 to 5 are open as a stack on dev `e900f710`, and the close-out PR sits on top. Merging is the owner's call; the merge that lands the stack closes the plan.
- **Shipped:**
  - **#357, arc 1** (`worktree-type-roles`), no visible change: the 28 roles generated from `@nulo/design`'s token contract, `Text`'s `variant`, the floors, the source guard `type-role-ban.test.ts` with its content-keyed baseline (1,578 entries in 170 files on day one), the two inventory generators with their reviewed expected files, the computed-style sweep and its smoke spec, the role specimen story.
  - **#358, arc 2** (`type-roles-arc2`): the design primitives (`Button`, `Input`, `SectionLabel`, `Banner`, `Tooltip` and the rest), `AddressDisplay`, `SettingItem`, the shared style modules and their callers; the window sweep `type-roles-windows.test.ts`.
  - **#359, arc 3** (`type-roles-arc3`): wallet, Send, onboarding and entry surfaces; the three hero numbers; the Holdings total's shrink-to-fit.
  - **#360, arc 4** (`type-roles-arc4`): Settings and the approval windows; the guard's baseline reached 0 (538 entries before).
  - **#361, arc 5** (`type-roles-arc5`): the dead type utilities, `Text`'s `size`, `weight`, `mono` and `tabular`, and `.fz--*` and `.fw--*` removed; `base.css` re-pinned; the package README lists the 28 roles.
  - **The close-out PR that archived this record:** the tooling's rollout gate removed (`liveFrom`, the `arc` option, `ARC_GLOBS` and the expected files' `arcs`), so every live identifier site is asserted; the open items filed; one lesson promoted.
- **Final board:** none. The owner dropped it on 2026-10-13 (ledger 36): "Maybe we can drop the screenshots, and trust all the work you've already done." The committed sweeps stand in: smoke's `type-roles.test.ts` and the window spec, on Chrome and Firefox. They observe 20 of the 86 live identifier sites (7 in smoke, 13 in the windows). The last observation of every live site is arc 4's re-signed board at `23d704a` (85 of 85); the 86th, Holdings' add-token address, arrived later with dev's #333 and is among the 20.
- **Review loop:** the plan took four Codex rounds (reject three times, then conditional approve) and an Opus conditional approve. Codex then converged on arc 2 (three rounds), arc 3 (three rounds, then its own loops on the owner's layout calls and on the Holdings total, each ending in approve), arc 5 (two) and the resync onto `39b50d8` (two). Arcs 1 (three rounds) and 4 (four) stopped at the round limit with their last fixes unreviewed; the cross-arc pass reviewed those commits by name and converged in three rounds: reject, conditional approve, approve (§ [Audit verdicts](#audit-verdicts)).
- **Gates at the close-out head:** `bun run lint`, `bun run typecheck:all`, `bun run test` (11,806 passed, 5 skipped), `bun run check:plans`, the guard and inventory (74 passed, 1 skipped), and `type-roles.test.ts` on Chrome (9 passed, 1 skipped) and Firefox (10 passed), every one exit 0. The smoke sweep asserts 7 of the 7 sites it observes before and after the tooling cleanup.
- **Known limits:** none.
- **Open items:** #363, #364, #365, #366; tracked privately: GHSA-r82w-2hwg-88vg.
  - #363: `--nulo-outline` text reads under 2:1 in both themes (ledger 27).
  - #364: regenerate the store captures and the store art before the next store submission.
  - #365: no e2e asserts the raw field of a call the wallet cannot decode.
  - #366: CI asserts 20 of 86 identifier sites; the other 66 were observed only by the boards.
  - #165, commented: the delegated-authwit e2e still skips on a premise `ensureStandardPublicChecks` disproved (the follow-up arc 2's audit entry names).
- **Dropped, rejected, superseded:**
  - **The final board and its recaptures after later resyncs:** dropped by the owner (ledger 36), with P5 step 5.
  - **X4** (strip removed props from a `v-bind` spread on `Text`): rejected; the guard refuses the props by name and no caller spreads them.
  - **D3** (non-hex fixtures in `OperationCard.discovered.test.ts`): withdrawn; the file was outside arc 4's diff and already feeds wire-shaped values.
  - **The close-out's `follow-ups.md` route:** superseded by the repo rule that open work lives in issues.
- **Seeds retired:** the `/goal` and `/loop` seeds under § [Seeds](#seeds) are retired. They name a final board and six PRs; the board was dropped and the stack's PR numbers are above. An archived plan is evidence, never instructions.

# Type roles

One rule decides which face a piece of text gets in the Nulo wallet: the owner's choice on the "Nulo Type Roles" board of 2026-10-08, proposal A's rulebook (Space Grotesk for labels and structure, Inter for words, JetBrains Mono for data) with B's large bold Space Grotesk on three numbers. It ships as 28 named roles generated from `@nulo/design`'s token contract, each one CSS class, `type--<role>`, reached through `composes … from global`, a class on the element, or `Text`'s `variant`. A source-scanning guard and a computed-style sweep make a role the only way to pick a face, letter spacing or upper case. Copy did not change.

Per-phase logs, gates included: [lessons/phase-1.md](lessons/phase-1.md) to [lessons/phase-5.md](lessons/phase-5.md).

## Decision

The owner's message, verbatim:

```
So, for the fonts: in general I like "A" better, but I like "B"s hero amount and input number amount (the big roundy one), for example the input amount on send, and the hero $ dollar amount on the home I like better from "B". Same for the amount on the receipts, I like B more.
```

The board's Decision block, written from it and published to the owner, verbatim:

```
Chosen: A, with B's big numbers. Space Grotesk for labels and structure, Inter for words, JetBrains Mono for addresses, hashes and small amounts. Three numbers keep B's large bold Space Grotesk: the Home balance, the amount you type on Send, and the amount on a transaction receipt.
```

The signed source is the board's A table, 34 rows, each with a face, size (or "size per slot"), weight, case and tracking. B's "Hero amount" cell (size per slot, 700, -0.04em, tabular) replaces A's on three numbers: the Home balance, the Send amount entry and the Send review amount. Two rows share a role only when all five values are equal (ledger 18); any other difference from the board was an Ask with the board's value as default (§ [Asks and answers](#asks-and-answers)). An element whose job no row names takes the nearest row (ledger 19); only typed words in `Input` keep today's value, through `input`.

How a role is applied, in order of preference:

1. **Composes first.** A module rule that picked a face, tracking or case opens with `composes: type--<role> from global` and loses those picks, plus its size and weight when the role is fixed-size. A site-sized role's rule keeps its `font-size`. CSS Modules allow `composes` only in a single-class rule, and never inside `:global()`.
2. **A static class** where no such rule exists (a compound or descendant selector, or no class).
3. **`<Text variant>`**, which arc 5 left as `Text`'s only type prop; a site-sized role on a `<Text>` takes its size from one module class.

A role is one class at (0,1,0). No plain module rule may set a property its role sets; the listed compound rules that must override a role (the segment's active weight, `Input`'s mini size) are `OVERRIDES` entries. No role sets line height (ledger 5).

## Why

**Recon at `f5ca160`** (the base before the rebase), scoped as the guard: 247 `font-family` declarations in 110 files; 148 `letter-spacing` declarations with 18 distinct values; 121 `text-transform: uppercase`; 23 off-scale sizes (8.5 to 12.5px, 48 and 56px); 430 `<Text>` tags, 393 of them picking `size`, `weight` or `mono`; 12 distinct address treatments, one of them Inter 15/500 for typed addresses; about 50 face-less size and weight rules. Picks had drifted per screen, so a rulebook needed enforcement, not a style guide.

**The shape, and what was not taken:**

- **Roles in the generated `utilities.css`** (chosen) over CSS variables per role or a package `.module.css`. The generated layer is drift-pinned and reaches every shell through `base.css`'s one import. Per-role variables need a `font:` shorthand, which resets line height and the `font-variant` longhands; a package module needs a new export.
- **Composes first** over a class on every element: templates and testids stay untouched, rebases conflict only in `<style>` blocks, and a role and any leftover declaration share one rule, so the tie check needs no template analysis.
- **One class per role at (0,1,0), ties banned** over a doubled selector, which would also beat the compound rules that must override a role.
- **The board row by row, 28 roles,** over a short merged list: merging rows with different values changes signed values silently.
- **Tabular figures on the heroes, as drawn,** over proportional: they stop a counting figure's width from moving each frame; arc 3 measured that the review amount still fits.
- **`Text`'s `size` and `weight` banned** over letting a `<Text>` keep picking: otherwise a sentence stays at 13px beside one at 12px.
- **Six arcs in a `gh stack`** over one PR: arc 1 invisible and reviewable as code, arcs 2 to 4 each against one board, arc 5 the `base.css` re-pin and the `Text` API cut, arc 6 the record.

**Security considerations.** The change is presentational: no message, storage, permission, network call, dependency or font file. The adversary that matters is a dApp or sender who hopes the person misreads an address, an amount or a hostname. Every identifier site has a mono role path, with truncation markup, separators and the receive mask unchanged, so two addresses compare chunk by chunk. Activity hashes keep their stored case (they read `0X…` before). Caps go on UI vocabulary; three contract- or user-supplied strings stay under caps (the Send unit pair's symbol, chain names upper-cased in script, decoded argument names, which are keys and keep their values' case). The hero fit measures and draws one class, so it cannot fit one face and draw another. Font claims (`packages/third-party-notices/src/policy.ts`) and the store art's font reads stay valid.

## What shipped

### The rulebook (28 roles)

G = Space Grotesk (`--font-headline`), I = Inter (`--font-body`), M = JetBrains Mono (`--font-mono`). "Site" means the role leaves the size to the element (the board's "size per slot"), raised to the floors. Tracking is in em. Every role sets its case and tracking, so neither leaks in from a parent; a non-tabular role writes `font-variant-numeric: normal` (ledger 29).

| Role | A rows | Face | Size | Weight | Case | Tracking | Figures | Covers |
|---|---|---|---|---|---|---|---|---|
| `title-hero` | Screen hero title | G | site | 700 | upper | -0.04 | | Tab hero titles, `BrutalistTitle`, the collapsing hero title, wordmarks, the unlock and register headings |
| `amount-hero` | Hero amount, B's value | G | site | 700 | none | -0.04 | tabular (Ask E) | Home balance, Send amount entry and its height strut, Send review amount |
| `amount-total` | Hero amount, A's value | M | site | 500 | none | -0.02 | | Holdings total (Ask F) |
| `title-page` | Sub-page / popup title | G | 13 | 700 | upper | 0.12 | | Sub-page and popup titles, sheet titles, loading and empty-state titles |
| `label-section` | Section label | G | 11 | 700 | upper | 0.1 | | `SectionLabel`, Settings group labels, form section labels, popup pre-titles, date group headers, toast titles, onboarding step labels |
| `label` | Field / key label; Toggle label; Inline action | G | 10 | 700 | upper | 0.1 | | Field and key labels, toggle labels, inline actions and links, table heads, the Send unit pair |
| `row-title` | Row title | G | site | 700 | none | -0.02 | | Token, activity and Settings row titles, card and status titles, the tx call method, operation titles |
| `caption` | Row secondary line | I | 11 | 400 | none | normal | | Row sub lines, Settings descriptions, the dApp name line |
| `name` | Person or thing name | I | site | 600 | none | normal | | Account, contact and profile names, fee method names, a name `AddressDisplay` shows in an address's place |
| `name-tag` | Account name tag | I | 11 | 600 | upper | 0.04 | | The account name in the header and in the windows' identity strip |
| `body` | Body / help text | I | 12 | 400 | none | normal | | Sentences: help, explanations, warnings and errors, empty-state lines, tooltips |
| `button` | Primary button | G | 14 | 700 | upper | 0.2 | | The three CTA variants at every size (Ask G), Home's action buttons |
| `button-md` | Medium button | G | 13 | 700 | upper | 0.03 | | `primary`, `primary_outline` and `destructive` at every size (Ask G), the boot retry |
| `nav` | Bottom nav label | G | 10 | 500 | upper | 0.05 | | Bottom-nav labels |
| `segment` | Segmented control | G | 10 | 500, active 700 | upper | 0.06 | | The Send type toggle, onboarding method tabs |
| `tag` | Chip / tag / network | G | 10 | 600 | upper | 0.08 | | Chips and badges, the network and lock chips, publish strip cells, fee priority |
| `tag-name` | Chip name | G | 10 | 700 | upper | 0.08 | | The publish strip's name cell |
| `brand` | Brand mark | G | 10 | 700 | none | 0.2 | | "NULO" in the identity strip |
| `input-data` | Address input | M | 14 | 400 | none | normal | | Typed text in mono fields: recipient, `AddressInput`, the four plain address `Input`s, the dust threshold, token search |
| `data` | Address; Hash / id / function; Amount, inline | M | 12 | 500 | none | normal | | Addresses in rows and tables, hashes, ids, function names, inline amounts and fees |
| `data-lead` | Address, prominent; dApp hostname | M | 13 | 600 | none | normal | | Header address, Receive address, From and To, the dApp hostname |
| `amount-row` | Amount in a row | M | 14 | 500 | none | normal | | Token and activity row amounts |
| `amount-detail` | Amount, detail | G | 24 | 700 | none | -0.02 | tabular | The receipt pages' amount (Ask A) |
| `fiat` | Fiat value | M | site | 400 | none | normal | | Every dollar line |
| `time` | Date and time | M | 11 | 400 | none | normal | | Timestamps |
| `meta` | Hash, small; Token symbol; Meta / count / hint | M | 11 | 400 | none | normal | | Small hashes and aux ids, symbols beside amounts, counts, hints, conversions |
| `value` | Value text | I | 12 | 600 | none | normal | | Values in key/value rows, Settings trailing values, banner titles |
| `input` | none (no row draws typed words) | I | 15 | 500 | none | normal | | Text a person types into `Input`, unchanged |

The 34th row, "Avatar initial", takes no role: `AccountAvatar` sizes its initials from its box at run time, a carve-out (ledger 10). `meta` is 11px where its A rows draw 10px (Ask D), so `meta` and `time` render alike; they stay two roles, as drawn. Floors: no text under 10px (`MIN_TEXT_PX`), no mono under 11px (`MIN_MONO_PX`); upper-case Space Grotesk tracks at most 0.12em except the CTA at 0.2em. Stated exceptions: avatar initials, and a hero figure its fit shrinks past the floor as a last resort.

The 217 per-screen before → after rows, in eight tables, are in this file's history before the close-out condensed it. Each board was reviewed against them, and its computed records were diffed against the before set.

### Enforcement

- **The guard,** `apps/extension/src/utils/type-role-ban.test.ts`, scans `apps/extension/src` and `packages/design/src` (CSS and `<style>` blocks with `postcss`, the one `.scss` face pick with `sass`, templates and scripts with `@vue/compiler-sfc`). Ten rules: a face, a tracking or an upper case outside a role; `font` and `font-variant` shorthands judged by their longhands; an off-scale or under-floor size; `size`, `weight`, `mono` or `tabular` on a `<Text>` under any local name (barrel aliases included, K1); a tie with a composed role; a face-less size or weight in module CSS; a site-sized `<Text>`'s module class setting anything but `font-size`; a template `trimAddress(` outside a mono role. Its baseline was keyed by file, rule and normalized text as a multiset, never by line (ledger 20), and shrank by arc: 1,578, 1,411, 538, 0. `CARVE_OUTS` and `OVERRIDES` are short, reasoned, stale-checked lists.
- **The inventories,** `apps/extension/scripts/type-roles/identifier-sites.ts` and `surfaces.ts`, list every identifier occurrence (file, expression, branch, ordinal) and every rendered surface (108: routes, popups, overlays, each with the files its closure renders) from the code. Each has a reviewed expected file; `inventory.test.ts` fails on an item with no entry, a stale entry, a missing field, a selector that names a row around its label instead of the value, two entries one selector cannot tell apart, or a pinned unreachable producer set that moved.
- **The sweep,** `apps/extension/tests/e2e/fixtures/type-roles.ts`, checks the loaded faces, then every role-bearing element against its record in px after the fonts load, then each identifier site of a seeded state at its selector, then the page's hex text outside a mono role; a figure role (`amount-*`, `fiat`) also fails on a clip or an ellipsis, its own or an ancestor's. The smoke spec and `type-roles-windows.test.ts` run it on both browsers, with named cases for the Home hero, the native inputs, the `Button` matrix with its padding, and long strings written into the execute card.

### Identifiers and sweep coverage

The identifier expected file holds 111 occurrences: 86 live, 15 attested unreachable and 10 reviewed as `none`. The unreachable ones carry producer sets pinned by search and file digest, so a new producer reopens them: four `OperationActionRow` sites and its top-level call target (`add_public_authwit`, `action_operations`: the one operation with actions that reaches the execute window is `grantPublicAuthwit`'s) and ten execute-window operation cards (`execute_window`: the window shows only the four operations the dispatcher hands the interaction service). The `none` entries are the two Terms version labels, the consent hint and ordinal, a hidden accessible name, three native `:title` tooltips, and `AddressDisplay`'s and `AddressInput`'s own text, which are read at each caller's selector instead.

Every live site was observed at its role on each arc's board; the last full record is arc 4's re-signed board at `23d704a`, 85 of 85. With the final board dropped, CI observes 20 of the 86: smoke 7 (Holdings' add-token address, the tx detail's From and To, the Accounts popup address, the Send recipient field, a network's chain ID, New contact's address field), the windows 13. The other 66 are #366; the raw field of a call the wallet cannot decode, which the boards reached through `pg-btn-sendTx-delegated` with its consumer unregistered, is #365. The close-out removed the rollout gate, so every site a sweep observes is asserted: on smoke's Chrome run, 7 of 7 before and after.

### Asks and answers

The owner, 2026-10-09: "haven't we decided through the first board? Also, it's impossible for me to decide without images on the asks. But I thought we had already defined everything through the first board." Read as: every Ask takes the board's value, except D, answered the same day ("Pick 11px - good fix."). The Firefox toolbar panel's substitute image (a same-size window, the real panel measured in-test) was accepted.

- **A, the receipt amount:** B's G 24/700, -0.02em, tabular, as the Chosen column drew (`amount-detail`, shared by the tx, received and journal pages). Not taken: A's M 24/500.
- **B, off-scale small sizes:** raised. 8 to 9.5px rise to 10px (11px for mono); 11.5 and 12.5px move to their role's step.
- **C, approval-window keys:** `label`, one vocabulary with the tx detail page.
- **D, small mono:** 11px, not the board's 10px: JetBrains Mono at 10px gives about 6px a glyph, too small for a hash a person compares. `meta` 11 and `MIN_MONO_PX = 11`.
- **E, tabular figures on the three heroes:** on. The review amount measured 19.2px (scale 0.64 of 30) with no overflow on both browsers, above the 18px floor.
- **F, the Holdings total:** A's value, `amount-total` M 26/500 -0.02. Not taken: `amount-hero`.
- **G, button sizes:** the board's two buttons at every size: every CTA 14/0.2em (the compact CTA 12 → 14), every `primary` and `primary_outline` 13/0.03em (large 14/0.05 → 13/0.03). Not taken: today's size exceptions kept as compound overrides.

### Board sign-offs

The owner delegated board sign-off on 2026-10-09 (ledger 35): "To be complete honest: this arc is humanly impossible to review. It's a lot of views. I'd also be able to test them through the chrome extension, so I'll rely on you and Chrome as reviewers. Move forward." A board is signed by the orchestrating session's review of every image (clipping, wrapping, overflow, anything off the rulebook) plus a green Chrome sweep on its head, bound to that head's SHA; the owner keeps a veto by testing the built extension. Scope (ledger 34): Chrome full and a Firefox subset, dark only.

- **Before set** (arc 1): shot at `3ba2d1f` (`ceaa36f` after a message-only reword), smoke Chrome 107 and Firefox 5, network Chrome 25 and Firefox 2, each image with the sweep's record; private Artifact https://claude.ai/artifact/We9yw2nuj33e9rkzhMRyyM.
- **Arc 2:** signed 2026-10-09, smoke `fdf448a` (contracts and debug panel recaptured at `c71b155`), network `d454e64`, window sweep green on both browsers at `3a41147`; 139 pairs, every change matching its row. Re-signed after each resync, the whole board recaptured each time with no computed type changed: 2026-10-10 at `664f31a` (onto `ac259a7`), 2026-10-11 at `4411782` (onto `73c000e`), 2026-10-13 at `0390a38` (onto `8d01f9b`).
- **Arc 3:** signed 2026-10-11 after three owner layout calls (below), the whole board recaptured at `e16689b` and the Holdings shots at `9bddc33`; `32005a5` after it moves the fit threshold by 0.05px and changes none. Re-signed at `9218d86` (onto `73c000e`) and `7751eb9` (onto `8d01f9b`).
- **Arc 4:** signed 2026-10-12, shot at `9e9f39f`, 85 of 85 live sites observed. Gate there: `bun run test` 11,346 passed; smoke Chrome 221 and Firefox 219 passed; the network five 14 passed and 1 skipped on each browser. Re-signed 2026-10-13 at `23d704a` (onto `8d01f9b`): 145 shots, 85 of 85 live sites, every hex run in mono; smoke Chrome 222 and Firefox 220 passed.
- **Arc 5 and later resyncs:** no board (ledger 36). Arc 5 changes no rendered output: the landing's declarations differ from arc 1's only by the 29 removed utility rules, and `base.css` against the stack's base only by the eight removed rules.

### Owner calls beyond the rows

Visible effects no row named went to the owner, answers quoted:

- **Header address under a long network chip** (B3), 2026-10-10: "Chip truncates more"; the address button reserves the copy icon's 6px.
- **Token row's fiat line at the big-balance seed** (B4): "Wrap to 2 lines".
- **The boot banner's RETRY:** "RETRY below, as before". **The review sheet's fee line wrapping:** "Accept the wrap".
- **The Holdings total** past the page from about $1 trillion, 2026-10-11: "Shrink to fit". The total keeps 26px until it no longer fits beside its meta line's min-content width, then scales with Home's fit; Firefox's 1/60 px layout needed 0.05px slack at the boundary (H2).
- **Manage accounts' imported line** clipping its tail at `data` M 12, 2026-10-12: "Set it at meta M 11 (Recommended)".
- **The identity strip's network name** ("Local Netwo…" in 80px): "Raise the cap to 96px".
- **Execute-card arguments and long dApp-supplied names and values** (D1, D2): "Mono, wrapping inside the card"; names, values, arguments, the call row's "on <address>" (E1), parameter labels (E2), the `.prop` and `.row` values (X1) and the `register_token` symbol (X6) all break inside the card.
- **The import preview address on three lines and the capabilities "Previously denied" tag beside its title:** "Accept both (Recommended)".
- **Holdings' add-token offer** (dev's #333), 2026-10-13: the address "Address in mono"; the words at normal tracking, since `secondary` takes no role, "Accept normal tracking".
- **History's token filter label** (dev's #348, X2), 2026-10-13: "label-section (Recommended)".

## Decision ledger

| # | Decision | Source | Alternatives not taken | Outcome |
|---|---|---|---|---|
| 1 | Roles generated from the token contract into `utilities.css`; `typeRoles` a top-level export | lead | per-role CSS variables; a package `.module.css`; a `tokenGroups` member | Kept; records and both floors rendered into `tokens.ts` (F11, S6) |
| 2 | `Text` takes `variant: TypeRole`, with a runtime validator | lead | `role` (an ARIA attribute); `kind`; a sibling component | Kept (F20) |
| 3 | Raw CSS adopts roles by `composes … from global`; a template class only where no single-class rule exists | audit (F23) | a class on every element | Changed from class-first; proved on Activity's hero title first |
| 4 | 28 roles reproduce the A table row by row, B's value on three numbers | audit (C1, F1) | 19 merged roles; A's 34 rows one to one | Changed (ledger 18) |
| 5 | No role sets line height | draft | a line-height step per role | Adopted: 358 of 430 tags use `lh--100`, module rules `normal`, `SettingItem` pins its boxes |
| 6 | `amount-hero` tabular at -0.04; the detail amount B; the Holdings total A | audit (C1, F1) | no tabular figures; -0.04 on all five | Asks A, E and F at the board's values |
| 7 | Guard rules 1 to 10, a content-keyed baseline shrinking to empty, reasoned carve-outs and overrides | lead, audit | `path:line` keys; per-file counts; a path skip list | Changed (C6, F7, C5, F4, F6, F2) |
| 8 | A role is one class at (0,1,0); listed compound rules may override it | draft | a doubled selector; reordering `base.css` | Tightened: shorthands expanded, `Button`'s and `Input`'s ties fixed (C5, F4, F5, S2) |
| 9 | Floors: 10px; mono 11px (Ask D); upper-case Space Grotesk at most 0.12em but the CTA | lead, audit (S12) | mono 10px, as drawn | Ask D answered 11px, 2026-10-09 |
| 10 | Avatar initials take no role | lead | a site-sized `avatar` role (F10) | Kept; `ContactRow`'s initials joined |
| 11 | `AddressDisplay`: `lead` replaces `size` and `weight`; a shown name takes `name` | draft, corrected | keep size props; mono for names | Changed |
| 12 | `SettingItem` `titleVariant` and `descriptionVariant`; `Input` `textVariant` | draft, audit (C2, F2) | a slot per call site; a `mono` prop on `Input` | Widened (S15) |
| 13 | Carve-outs: Presto banner variables, the console banner, CodeMirror's theme, `BrutalistTitle`'s sizes, avatar initials, the Send strut's size | draft | migrate them | Widened (C5, C10, S3, S22), all stale-checked |
| 14 | Arc 5 removes the dead utilities and `Text`'s type props, re-pins `base.css` | lead | keep the props | Done in #361 |
| 15 | Six arcs in a `gh stack`; the close-out is a docs-only top layer | lead, audit (F12) | close-out inside arc 5; a single PR | Kept; the close-out also removed the tooling's rollout gate |
| 16 | Per-screen boards at arcs 2, 3, 4 and a final board | lead, audit (C11) | one board at the end | Widened (S4, S20, S9); signer changed by 35; final board dropped by 36 |
| 17 | Arc 1 starts after `settings-by-task` merges | lead, owner | build in parallel | Kept |
| 18 | Two A rows share a role only when all five values are equal; any other difference is an Ask | lead (C1, F1) | a target of 12 to 18 roles | New |
| 19 | An undrawn surface takes the A row of its job; only typed words in `Input` keep today's value | lead | a role per undrawn treatment | New |
| 20 | Baseline key `(file, rule, normalized text)` as a multiset, each entry naming its target role | lead (C6, F7) | `path:line`; per-file counts | New |
| 21 | `amount-hero` composed into `.hero_fit`, shared by figure and ruler | lead (C4, F3) | a carve-out for `.hero_fit`'s tracking | New |
| 22 | A computed-style sweep after a font-load check, in smoke and a window spec | lead (F5, C9) | probes only | Widened (S5, S7, S8, S18, S21) |
| 23 | The close-out carries the record | lead (F12) | close-out in arc 5 | New |
| 24 | `detail-page.module.css` migrates in arc 3 only | lead (C3) | split across arcs 2 and 3 | New |
| 25 | Every identifier has a mono path; guard rule 10 on template `trimAddress(` | audit (C2, F2) | `AddressDisplay` only | New; a name-suffix rule not adopted (it would fail on non-identifiers) |
| 26 | One Section label at 11px for `SectionLabel` and Settings group labels | audit (F19) | two label levels | New |
| 27 | Colours out of scope; `--nulo-outline` text a follow-up | lead (C10, F22) | fix contrast here | #363 |
| 28 | No `Button` size rule sets a role-bearing variant's type | audit (S2, S13) | size rules' `font-size` kept as overrides | New; `Button.test.ts` pins declared values, the sweep computed ones |
| 29 | A non-tabular role writes `font-variant-numeric: normal` | audit (S7) | write nothing | New: the property inherits into the hero's symbols |
| 30 | After every resync, recapture each surface whose rendered files changed | audit (S10, S19) | compare swept values; trust a clean sync | Changed (S19); suspended by 36 |
| 31 | Generated inventories against reviewed expected files; the sweep must observe every site | audit (S15, S16, S18, S20) | hand-written tables | New |
| 32 | `Button`'s box stays in its compound rules; only the type composes | audit (S14) | `width` and `padding` in `.cta_type` | New |
| 33 | The four plain address `Input`s take `input-data` in arc 2 | audit (S17) | split their row by arc | New |
| 34 | Before set and boards: Chrome full and a Firefox subset, dark only | owner, 2026-10-09: themes "Dark only"; Firefox "Firefox subset (Recommended)" | both themes and both browsers everywhere | Owner's scope cut |
| 35 | Board sign-off by the orchestrating session's image review plus a green Chrome sweep; the owner keeps a veto | owner, 2026-10-09 (quoted in § [Board sign-offs](#board-sign-offs)) | the owner's quoted sign-off on each board | Owner's delegation |
| 36 | No final board, no recaptures on later resyncs, the full local e2e only at the top head | owner, 2026-10-13: "Maybe we can drop the screenshots, and trust all the work you've already done." | the final board, recaptured after every resync | Owner's scope cut; #366 records the coverage left |

## Audit verdicts

- **Codex (`gpt-6.1-sol`, high), the plan:** reject (blocking C1, C2, C3, C4, C7).
- **Opus 5.5, the plan:** conditional approve (F1, F2, F3, F4, F5, F6, F7, F9).
- **Final fresh Codex pass, the plan:** round 1 reject (S1 to S13); round 2 reject (S14 to S22); round 3 reject (S23 to S26); round 4 **conditional approve** (S27, S28 adopted; S29 an arc-1 condition, met by the before set).

Codex plan findings, all adopted: C1 (the A table row by row, B on three numbers); C2 (`descriptionVariant`, a mono path for every identifier); C3 (only fixed-size roles lose their size); C4 (`amount-hero` in `.hero_fit`); C5 (the guard's missed forms as rules or self-tests); C6 (content keys with multiplicity); C7 (rows for `SearchField`, `Input`'s left text, `AccountAvatar`); C8 to C13 (the Accounts popup fact, the sweep's named cases, floors checked apart from the generator, the board checklist, the landing by normalized declarations, caller overrides moving with `SettingItem`).

Opus plan findings adopted: F1, F3 to F9, F11 to F13, F15 to F17, F19, F22, F23. In part: F2 (the connected-apps string stays one string in `data`; no name-heuristic guard rule), F10 and F23's `avatar` role (avatars stay a carve-out), F14 (the unit pair keeps the board's caps), F18 (Asks A and C stay Asks), F20 (separate prop names), F21 (arc 3 not held for arc 2's sign-off).

Final Codex plan pass, adopted: S1 to S13 (missing identifier sites, the `Button` cascade, keyed hero carve-outs, a capture checklist, before values by site, both floors exported, `font-variant-numeric: normal`, every identifier asserted, the Firefox panel measured in-test, a resync rule, both browsers in P5, Ask D's default); S14 to S22, four of which shared one cause, hand-written inventories, which ledger 31 replaced; S23 to S26 (sites keyed by occurrence, bare `mono` discovered, closures with imported modules and shells, `withBlockedAccount` asserting the barrier); S27 (an unreachable attestation names its producer set, rechecked every gate); S28 (gates say "every live site observed, every unreachable one listed"). S29: the raw-field fixture, proven reachable by the before set.

The competing outline: CSS variables per role not adopted; parser-based scanning and a content-keyed allowlist adopted; a `PENDING` whole-file skip list rejected (unmigrated files would go unguarded); no line height per role adopted; no tabular figures on mono roles adopted; state roles not adopted; two label levels rejected; pinned security sites adopted as § Identifiers and rule 10; a contract floors test adopted.

**Arc 1** (Codex on arc 1's diff from dev): R1 reject, eight findings, all adopted. C1 (Medium): AuthwitCard's `encoded_call`, `intent` and `message_hash` sites were attested unreachable, but a restored backup reaches them; live now, seeded by a restored record. C2 (Medium): the site reader took the first role-bearing descendant, so a row testid read its label; selectors now name the value element and `inventory.test.ts` checks them. C3 (Medium): `AddressDisplay`'s name state is a `data-address-shows` attribute. C4 (Medium): an override holds only on its role in its `scope`. C5 (Medium): a `font` key in script styles and a `font:` shorthand go through the longhand judge. C6 (Medium): each producer file pinned by digest. C7, C8 (Low): `trimAddress (a)` and the contract test's comments. R2 reject, three new: C9 (every `font:` in a style string judged), C10 (an inside testid counts only when the component the site renders through declares it), C11 (the header role composes into `.address_text`). R3 reject, one: C12 (an inside testid counts only on the element that renders the site's bound prop), adopted after the round. The loop stopped at three rounds; C12's fix and the `execute_window` attestation went to the cross-arc pass by name.

**Arc 2:** R1 conditional approve: A1 (Medium, in part) the unit matrix now asserts every `Button` variant and size's padding beside its type; no browser rows added. A2 (Low) a restating comment deleted. R2 approve. R3 (on the network board's fix to a note's contract name weight) approve. Two later commits went to the cross-arc pass by name: `ensureStandardPublicChecks`, which publishes `PublicChecks` at its canonical address so a send discovers an authwit, and the `action_operations` attestation. The stale skip in `tx-sendTx-delegated-authwit.test.ts` that the first disproves is commented on #165.

**Arc 3:** R1 conditional approve: B1 (Medium) the panel's clip check skipped every `overflow-x: visible` box; each reading now names the clipping ancestor its text crosses (`clippedBy`). B2 (Low) the Home hero case requires the symbol to inherit the figure's px tracking. R2: B5 (Medium) and B6 (Low), `clippedBy` precision, adopted; B3 and B4 went to the owner (§ [Owner calls](#owner-calls-beyond-the-rows)). R3 conditional approve, no new findings. On the owner's three layout calls: F1 to F4 adopted (the copy icon's reserved 6px, the unpriced token name exempt by testid, `ellipsizedBy`, a comment), then approve. On the Holdings total: H1 (Low) the resize observer follows the summary's element; reopened by the orchestrating session for the meta line's wrap, fitted against its min-content (`9bddc33`); H2 (Low) Firefox's 1/60 px rounding, a 0.05px allowance. Approve.

**Arc 4:** R1 conditional approve, D1 and D2 (Medium, long names and values past the execute card) to the owner, D3 withdrawn. R3 on the owner's calls: E1 and E2 (Medium) the call row and parameter labels break inside the card; E3 (Low) the window sweep measures rows against the card after writing the longest strings a dApp can make it show; E4 (Low) a comment. R4 conditional approve, no new implementation findings; the in-window strings commit went to the cross-arc pass by name.

**Resync onto `39b50d8`:** round 1 conditional approve: G1 (Low) the add-token fit check measures the text's range, not the label's box; G2 (Low) the counts. Round 2 approve; no merge loss.

**Arc 5:** R1 conditional approve: K1 (Medium) the text-prop rule now catches `Text` aliased from the package barrel; K2 (Low) a comment. R2 approve. Verified by Codex: no removed class or prop in use; the README's 28 rows equal the contract; `base.css` holds only the eight removals.

**Resync onto `1cb8d8b4`:** no Codex round on the resolutions, both of which took both sides (phase 5 lessons). The stack was later resynced onto dev `e900f710` (#353, #347); every commit kept its subject, so a SHA named here maps by subject.

**Cross-arc pass** (fresh Codex session, arcs 1 to 5 on dev `1cb8d8b4`):

- **Round 1, reject.** X1 (High, arc 4) adopted: a 64-character function name ran about 165px past the execute card; `.prop` and `.row` values take `min-width: 0; overflow-wrap: anywhere`. X2 (High, arc 3) adopted: dev's #348 History filter label picked a face outside a role; the owner chose `label-section`. X3 (Medium, arc 5) adopted: `expectSitesClean` read `hexOutsideMono` without asserting it. X4 rejected (above). X5 (Low, arc 1) adopted: two comments in `surfaces.ts` narrated a workflow.
- **Round 2, conditional approve;** X1 to X3 and X5 hold, X4 stays rejected. X6 (Medium, arc 4) adopted: the `register_token` row's 31-character symbol clipped the name whole; the row and symbol break. X7 (Medium, arc 5) adopted: the smoke sweep read hex only inside identifier states; a page with no state now reads its hex text.
- **Round 3, approve.** The same session resumed on X6 (`f58d33f9`) and X7 (`44dede10`): "Both fixes hold and are complete. ... No new material findings in either commit. Focused validation: 84 passed, one skipped." The loop converged in three rounds. After the resync onto `e900f710` the two commits are `772dda6a` and `87a626aa`.

## Lessons

Promoted to `implementations-plan/lessons.md`, one line:

- **CSS Modules refuse `composes` inside `:global()`.** The export and import section labels take the role as a static class instead ([phase 3](lessons/phase-3.md)).
- **`text-transform` changes `innerText`, never `textContent`.** An e2e that asserts copy through `innerText` breaks, or passes vacuously, when a role adds or drops caps ([phase 1](lessons/phase-1.md), step 15).
- **Firefox lays out in 1/60 px.** A total laid out exactly beside its neighbour measured 75.41667 against 75.41666 of room and shrank; a fit compared at its boundary needs slack (H2, [phase 3](lessons/phase-3.md)).

Kept here:

- **An "unreachable" claim is a claim about producers.** Ten execute-window cards and five authwit record sites were first called reachable or unreachable from one producer; a run, a restore path and a producer search each overturned one. Pin the producer set and its files ([phase 1](lessons/phase-1.md)).
- **A reader that returns findings must have each one asserted.** X3 and X7 were sweeps that collected hex outside mono and asserted nothing, on every page with no identifier state.
- **`test:ci-gating` is not in the local gates.** `workflow-refs.test.ts` refused an arc word in a code comment from arc 1 on, and only CI's `quality-status` would have shown it ([phase 5](lessons/phase-5.md)).

## Seeds

Final, 2026-10-09: approved with every default but Ask D, answered 11px; otherwise the board as drawn.

ELI5 companion (private Artifact): https://claude.ai/artifact/1YHTw22wVrqoatMjAh4i3n

Recommended: `/goal`. Fallback: `/loop`.

```
/goal All phases marked ✓ in implementations-plan/type-roles/plan.md (the per-phase headers in the file, not the chat, not the task list), each ✓ backed by its phase's validation gate (as defined in plan.md) reported passing in the transcript; arc 1's steps 2, 10, 13, 15 and 16 ran only after `git cat-file -e origin/dev:apps/extension/src/popup/pages/settings/lock.vue` succeeded and the branch was rebased onto origin/dev (both in the transcript), and every later dev move was taken with `gh stack sync`; Asks A to G each carry the owner's answer or the confirmed default in plan.md; for each phase the agent has printed `LESSONS_FILE=implementations-plan/type-roles/lessons/phase-N.md` in the transcript; plan.md's `code_review` is `off`, so `/code-review` was NOT run; the codex fix loop (`/codex high` on gpt-6.1-sol) converged for each arc and for the final cross-arc pass, each evidenced by a resumed codex pass reporting no new material findings, quoted in the transcript; each board (arcs 2, 3, 4 and the final board) carries the orchestrating session's sign-off (its review of every image and a green e2e sweep in Chrome, ledger 35) in plan.md's UI impact section next to the head SHA it binds to; the six stacked PRs exist on GitHub, PRs 1 to 5 created by `gh stack submit --auto` only AFTER every loop converged and PR 6 (`type-roles-close-out`, docs only) carrying the close-out that archived the plan (`gh pr view` output for each and `git show --stat` of the archive-move commit in the transcript); `bun run test`, `bun run test:all` and `bun run lint` all report exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/type-roles forward. Never idle waiting for my input. Delegate every code edit to a subagent and review its diff. Each firing:
1. **Reality check**: read implementations-plan/type-roles/plan.md and lessons/ (authoritative state, not the chat), including its Outcome & Quality Bar section: every step is judged against those criteria, not just against "it runs". If that path is gone, the close-out has run: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/type-roles/plan.md` succeeds → the stack merged and the plan is completely done: run the teardown now, without asking: `ExitWorktree` (`keep`) if this session entered the worktree through `EnterWorktree`, then `agent-worktree done type-roles --merged`. Report what it removed or, if it refused, its output verbatim (never force past a refusal), clear this loop and STOP. Fails → delivered and awaiting my merges: babysit only (CI per step 2, fixes on the arc's branch then `gh stack sync`, keep the Outcome true), never resume a phase or read the archived plan as a task list; once every PR is green, report that once and STOP. Later firings repeat only this merge check. A live plan.md that already carries an Outcome section means a close-out was interrupted: finish it on the `type-roles-close-out` branch. No phase started yet? First `git fetch origin && git cat-file -e origin/dev:apps/extension/src/popup/pages/settings/lock.vue`: if it fails, settings-by-task is not on dev yet: do the steps P1's step 1 allows before the merge (3 to 9, 11, 12 and 14), report that once, and re-check on the next firing; if it succeeds, `git rebase origin/dev` (the only plain rebase; later dev moves use `gh stack sync`) and start P1 at step 1. Otherwise, native task list empty (fresh session)? rebuild it from plan.md, one task per remaining step; run `git status` and `git log --oneline -5`. If PRs exist, `gh pr view --json statusCheckRollup` on each (no --watch). Without PRs, `gh run list --branch $(git branch --show-current) --limit 1 --json status,databaseId`.
2. **Waiting on CI is fine.** Confirm it's actually progressing (`gh run watch <run-id>` up to 10 minutes; queued or stuck past that → inspect logs, log it as blocked in lessons). Use the wait productively: review the diff, prep the next phase, strengthen tests. Don't start work that would conflict with the in-flight change. Never run smoke and network e2e at the same time in this worktree.
3. **No task in hand?** Pick the next pending step from plan.md and start it on the current arc's branch. After each meaningful edit, run `bun run lint` + the touched test files (and `bun run --cwd packages/design test` when packages/design changed). Catch mistakes in-step, not phases later. Then commit → push the arc branch.
4. **Stuck, or facing a decision you'd normally bring to me?** Don't wait. Call `/codex high` (on gpt-6.1-sol) with full context and go back and forth until you two reach a defensible decision, then act on it. Log every consult + verdict in lessons/phase-N.md. Exception: hard limits stay hard. never merge to main or release branches, never merge any PR, never publish or deploy, never expand scope beyond plan.md, never change user-visible type beyond plan.md's UI impact tables and the answered Asks (an element with no row gets a row and my sign-off first), never change copy; if the decision requires crossing one, surface it and hold.
5. **Same step failed 5 times?** Stop retrying; reassess the approach with codex, then continue down the agreed path.
6. **Phase green?** "Green" means THE PHASE'S VALIDATION GATE as written in plan.md passes (commands + pass criteria, not generic vibes). Run the full gate, paste the result, mark ✓ in plan.md, file the lessons entry, print `LESSONS_FILE=implementations-plan/type-roles/lessons/phase-N.md` in the transcript. Then run the arc's codex audit per plan.md's Post-implementation section (`/codex high` on gpt-6.1-sol, the arc's diff from the arc below + adversarial / security ask + the plan's no-over-engineering + comment-quality rules) → apply accepted fixes, commit, `gh stack sync`, recapture any image a fix changed, then RESUME the same codex session with the fix diff. Loop until a round yields no new material findings (still churning after 3 rounds → surface and stop). Then sign off the arc's board (arcs 2 to 5) per ledger 35: review every image for clipping, wrapping, overflow and anything off the signed rulebook, confirm the e2e sweep is green in Chrome on its head, record the sign-off and its SHA in plan.md, then cut the next arc's branch from this one and advance. I keep a veto: I test the built extension myself.
7. **All phases ✓ in plan.md?** Run the final cross-arc codex pass the same way. Then Delivery per plan.md, the FIRST time any PR is opened: `gh stack submit --auto` for arcs 1 to 5, each PR body for arcs 2 to 5 quoting my message of 2026-10-09 (ledger 35) as its sign-off record, with its board's sign-off SHA (no PR without it), and arc 1's PR linking the before set and the generators' reviewed output. Then cut `type-roles-close-out` from arc 5, run the close-out per plan.md's Post-implementation section as its docs-only commits, `gh stack push` and `gh stack submit` for PR 6. Then `gh pr checks --watch` on each PR. Then write the wrap-up report: what shipped, every contentious decision codex and I debated, each with ELI5 context (what the question was, the options, why we picked ours), and open items. Surface and stop. Merging completes the plan, and that is my call; the firing after the last merge tears the worktree down (step 1).

Keep the native task list current (`TaskUpdate` as steps start/finish; plan.md stays the source of truth).
```
