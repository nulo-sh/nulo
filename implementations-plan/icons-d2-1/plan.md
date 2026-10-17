---
plan: icons-d2-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev 493ff497
issues: "#602 (closed by arc 1), #590 (icon part: arc 2; the sheet part stays open)"
---

# icons-d2-1: Direction 2 glyphs, Material and icons.json retired

Decision page 30 (2026-10-16) signed **#590 P30-08 = B** and **#602 = B**. This plan replaces every glyph in the wallet with one original set drawn in Direction 2, and deletes the borrowed families: the Material Symbols font, `packages/design/src/internal/icons.json`, and the stale-network marks whose origin is unproven. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

## Outcome & Quality Bar

- **For whom**: a person using the wallet on Chrome or Firefox (Home, Send, the approval windows), and the maintainer who adds the next glyph.
- **Excellent looks like**:
  1. Every glyph on every screen comes from one set on the 24-unit grid, with square ends and solid blocks. No stroke renders under 1.5 px at any size the app uses (9 to 48 px); holes keep the source's fixed 2.5 units.
  2. No screen shows a blank glyph or a picture whose meaning changed. Status, warning and permission marks in the approval windows keep their colour token, and a test refuses an unknown glyph name.
  3. The build ships no third-party glyph and no icon font: the notices list no Material, `ACKNOWLEDGEMENTS.md` no longer names icons.json, and the 343 628-byte font file leaves every build.
  4. A maintainer adds a glyph by adding one entry to one TypeScript file.
- **Good enough**: the 20 drawn glyphs match `recon.md` § Design source, with one recorded deviation (D17). The long-tail glyphs follow the same rules; the owner asks for redraws from the PR's glyph sheet (OA-2) without blocking the arc.

## UI impact

- **Every icon in the app** moves to a Direction 2 glyph, including the stale-network takeover's marks. Signed, P30-08 B: *"Direction 2: geometric brutalist, square-ended strokes and solid blocks, matched to the titles; about 35 glyphs; Material retires (343 KB off every build); Settings rows lose their icons."*
- **Settings rows lose their icons**: the decorative leading glyph on each row of a page under `apps/extension/src/popup/pages/settings/**` goes. Same record. A glyph that shows state (the selected network or account) stays. Rows of the same kind in popups keep a glyph until OA-1 is answered.
- **No third-party glyph ships.** Signed, #602 B: *"Retire icons.json with the chosen direction and skip the attribution work; the next release carries no third-party glyph."*
- **Each site keeps the picture it shows today**, redrawn (D8). No two pictures are merged unless the sheet merges them (cancelled and failed). Collapsing further is OA-2.
- **Not changed here**: the private and public balance marks keep today's padlock and globe, redrawn, and the Home hero's Send and Receive stay words only, until decision page 33 settles P30-10 and P30-09 (arc 2). No copy, no layout outside an icon's own box, no sheet change (P30-11).
- Each PR body quotes these records and carries light and dark screenshots, before and after, of Home, Holdings, Send, Activity, Settings, the execute window, the capabilities window with a flagged row, and the connection check (`windows/verify`), plus the glyph sheet story.

## Architecture & Implementation

**Shape.** One glyph module and one renderer in `@nulo/design`; every call site names a glyph from that module.

- `packages/design/src/core/glyphs.ts` (new): `export const glyphs = { … } as const satisfies Record<string, Glyph>` and `export type GlyphName = keyof typeof glyphs`, with `type Glyph = { readonly s?: readonly string[]; readonly f?: readonly string[] }`. `s` holds stroke paths drawn at the set's weight. Each `f` entry is one solid path drawn with `fill-rule="evenodd"`, so an inner subpath is a hole and separate solids never cancel. Solids inside one glyph do not overlap except to cut a hole. Each entry's TSDoc names its picture. `index.ts` exports `GlyphName` only; `glyphs` stays internal to `core/` and the guard imports it by path.
- `packages/design/src/core/Icon.vue` (rewritten, same tag): props `name: PropType<GlyphName>` (required), `size` (default 16), `color: TextColorName`, `hoverColor`, `rotate`, `loading`. It renders `<svg viewBox="0 0 24 24" :width :height role="img" fill="currentColor" stroke="currentColor" :stroke-width stroke-linecap="square" stroke-linejoin="miter">`, one `<path fill="none">` per stroke and one `<path stroke="none" fill-rule="evenodd">` per solid. The stroke width is `Math.max(2.5, 36 / Number(size))`, the source's 1.5 px floor. `color` adds the class `color--<name>`; `hoverColor` sets `color` on hover. `role="img"` stays (`BalanceView.vue:360,370` name their marks with `aria-label`). The props `fill` and `scale` have no caller and go. The Azguard header stays: the prop API derives from it.
- **One paint channel (D3).** A glyph paints only through `color`. The root's `fill="currentColor"` keeps the computed `fill` equal to the colour, which `send-outcome-rows.test.ts:95-101` reads. Today `Icon.vue:38` sets an inline `fill: currentColor` on every glyph without a `color` prop, so a stylesheet `fill` reaches only glyphs that have one. Sort each `fill` rule in recon's list: a rule that paints a glyph today becomes `color` on a selector that matches the `svg` only (so text keeps its colour); a rule that paints nothing today is deleted; `transition: fill` becomes `transition: color`. `render-css.ts` stops emitting `.fill--*`; `utilities.css` is regenerated; the comments at `token-contract.ts:172` and `color-names.ts:4` drop `.fill--*`.
- **Rotation (D10).** A converted chevron's base turn and its open/closed turn go into the one `rotate` prop (`:rotate="open ? 270 : 90"`); the caller's transition stays in a class. This applies at `DropdownTrigger.vue:85-90`, `IncomingTrustPopup.vue:168-176`, `TxFeeRow.vue:36-45`, `TxDebugPanel.vue:32`, `GrantedCapabilitiesList.vue:42-45`, whose inline `transform` would otherwise replace Icon's.
- **Name guard (D4)**, `apps/extension/src/utils/icon-names.test.ts`, parsing SFCs with `@vue/compiler-sfc` and expressions with `typescript`, as `copy-dash-ban.test.ts` does:
  - (a) Every glyph name a template states is a key of `glyphs`: the `name` of `<Icon>`, and any attribute named `icon` or ending in `Icon`/`-icon` on any tag, static or bound. In a bound expression only value positions count: both branches of `?:`, the right side of `&&`, both sides of `||` and `??`, parentheses. The `default` of a prop named `icon` or `*Icon` in `defineProps` counts too.
  - (b) Completeness: `<Icon :name>` bound to anything but such literals must be a prop named `icon`/`*Icon` of the same SFC, or sit in a `lang="ts"` SFC, where vue-tsc checks it against `GlyphName`.
  - (c) No `MaterialIcon` tag, `materialIcon` attribute, `StaleIcon` tag or `material-symbols` class remains.
  - Scope: `.vue` under `apps/extension/src` and `packages/design/src`. Forwarding props in `lang="ts"` SFCs (`Input`, `SubPageHeaderBase`, `PermissionRow`, `TransactionCardLayout`, `TransactionAwaitingCard`, `TransactionTerminalCard`, `Button`) are typed `PropType<GlyphName>`, so the extension's `*.stories.ts` args typecheck; `packages/design/tsconfig.json` excludes the design package's stories, so `Input.stories.ts`'s `icon` arg is checked by neither (blind spot, valid today: `search`). TS tables (`journal-state.ts` `ICONS` and `activityIcon`, `permission-rows.ts`, `publish-facts.ts`) are typed `GlyphName`. Three plain-JS SFCs keep names in script and gain `lang="ts"` with the names typed: `Navigation.vue`, `TransactionCard.vue`, `StaleNetworkTakeover.vue`; `FeeMethodSelector.vue`'s one constant name becomes a static `name="public"`. Blind spots left: that story arg, and a name built at run time from a string the guard cannot see (none exists today).
- **Material and StaleIcon retire**: `MaterialIcon.vue` and its test, the font, `base.css:38-66` with the hash in `base.css.test.ts`, the notices record, its text and its `expected-minimum.txt` line, the resolver entry and its test, `components.d.ts` (regenerated by the extension build), `mount-all.test.ts`, the type-role carve-out (`exceptions.ts:119-124`), `SettingItem`'s `materialIcon` prop, branch and `.material_icon` rule; `StaleIcon.vue` (its `color` CSS-variable prop maps to `TextColorName`, `--txt-warning` to `txt-warning`).
- **Trade-off not taken**: outlining every stroke into a filled polygon would keep the `fill` channel, but it loses the 1.5 px floor, the names would keep describing old pictures, and the Material sites already paint by `color` (`PermissionRow.vue:89-95`, `CapabilityDisclosure.vue:73-75`, `SettingItem`'s `.material_icon`), so it saves less than it seems.

### Glyph catalogue and name map (D8, D9)

`rot N` means the site passes `:rotate="N"`. The 20 sheet glyphs use the geometry in `recon.md`; the others follow the same rules (2.5-unit strokes, square caps, mitre joins, 0/45/90 degree lines, solids for weight, no curves).

| Glyph | Picture | Replaces (old name → sites) |
|---|---|---|
| `home` | square with one diagonal | Material `home` (nav) |
| `holdings` | three solid bars | `account_balance_wallet` (nav; `tokens/[id].vue:217` leading icon) |
| `history` | square clock | `history` (nav, `activity.vue:244`) |
| `settings` | two sliders, square knobs | `settings` (both), the theme trigger's `system` |
| `send` | arrow to top right | `arrow-narrow-up-right` |
| `receive` | arrow to bottom left | `arrow-narrow-up-right` + rotate 180, `arrow-bottom-circle`; `iconRotate` goes |
| `copy` | two squares | `copy`, `content_copy` |
| `open` | box, arrow out | `external-link`, `open_in_new`, `arrow_outward` (`SettingItem` external) |
| `remove` | square bin | `trash` |
| `edit` | pencil | `edit` |
| `back` / `forward` | arrow left / its mirror | `arrow_back` / `arrow-right` (`LogsViewer` keeps rot 90) |
| `close` | X | `close` (both), StaleIcon `cross`, `close-circle` on a control that clears, dismisses or removes |
| `square-check` | solid square, check hole | `check-circle`, selected state of a radio pair |
| `square-half` | half-filled square | `clock-circle` |
| `square-cross` | square with X | `cancel`, `close-circle` as a state (failed, error, false) |
| `square` | empty square | `circle` (unselected state of a radio pair) |
| `check` | bare tick | `check` (both), StaleIcon `check`, `task_alt` |
| `warning` | solid triangle, `!` hole | `warning` (all three) |
| `info` | square `i` | `info` (both) |
| `lock` | solid body, square shackle | `lock` meaning lock state or password (both, StaleIcon) |
| `private` | interim: `lock`'s picture | `lock` meaning private (`BalanceView`, `TokenCard`, `publishGlyph`) |
| `public` | interim: octagon, equator, meridian | `globe` meaning public (same sites, `FeeMethodSelector` tag) |
| `more` | three solid squares | `dots`, `more_vert` (rot 90) |
| `chevron` | chevron right | `chevron_right`, `chevron-right`; down-pointing `chevron` and `expand_more` (rot 90, D10); `chevron_left` (rot 180) |
| `eye` / `eye-off` | outlined diamond, square pupil / slashed | `eye`, `visibility` / `eye-off`, `visibility_off` |
| `search` | square lens, 45° handle | `search` (both) |
| `add` | plus in a square | `plus-circle`, `add_circle` |
| `refresh` | square loop, arrowhead | `refresh` (both), `refresh-circle`, StaleIcon `reset` |
| `undo` | arrow back with a 90° turn | `arrow-back-up` |
| `user` / `contacts` | square head, block shoulders / the same in a card | `user`, `person` / `contacts` |
| `app` | four squares | `dapp` |
| `log-out` | open bracket, arrow out | `log-out` |
| `zap` | 45° bolt | `zap` |
| `expand` | four corner brackets | `expand` |
| `download` / `upload` | arrow into / out of a tray | `download`, `download-outline` / `upload-outline` |
| `help` | square `?` | `help` |
| `code` | `< >` at 45° | `code-circle`, `code_blocks` |
| `pin` | square pin head | `push_pin` |
| `passkey` | key, square bow | `passkey` |
| `extension` | puzzle piece | `extension` (onboarding done page) |
| `play` | solid triangle | `play_circle` |
| `signature` | 45° zigzag over a rule | `signature` (authorizations permission row) |
| `mail-lock` | envelope, small solid lock | `mail_lock` (private events permission row) |
| `faucet` | square tap, drop | `faucet` (mint operation) |
| `network-edit` | the `public` globe with a pencil | `globe-edit` (Edit network popup row) |
| `sun` / `moon` | square with rays / crescent of straight cuts | `sun` / `moon` (theme trigger) |
| `filter` / `filter-solid` | outlined / solid funnel | `filter-outline` / `filter` |
| `package` / `fee` | box / fuel pump | `package`, `fpc` on popup rows (OA-1) |
| `pause` / `no-signal` / `swap` | square with two bars / stepped bars, slash / two opposed arrows | StaleIcon `pause`, `no-signal`, `swap` |

Gone with the Settings rows, no glyph: Material `account_balance_wallet`, `group`, `toll`, `hub`, `local_gas_station`, `speed`, `download`, `password`, `palette`, `bolt`, `menu_book`, `note_alt`, `verified_user`, `receipt_long`, `inbox`, `memory`, `layers`, `lan`, `delete`, and every icons.json name that leads a Settings row (`key`, `face`, `bug`, `banknote`, `text`, `globe`, `user`, `package`, `help`, `info`, `edit`, `warning`, `fpc`). Odd sites: `privacy.vue:141`'s `chevron-down` renders blank today beside `DropdownTrigger`'s own chevron, so its tag goes (D12); the `''` spacers in `display.vue` and `privacy.vue` become `check` hidden by a `visibility: hidden` class (D13); `BarrierOverlay.vue:13`'s `color="--red"` matches no class today, so the converted glyph takes no colour prop (D14).

### File ownership against type-scale-1

This lane owns `packages/design/src/core/{Icon.vue,Icon.test.ts,Icon.stories.ts,glyphs.ts,MaterialIcon.*}`, `src/index.ts`'s icon lines, `src/fonts/MaterialSymbolsOutlined.woff2`, `src/base.css` lines 38-66 and the hash in `base.css.test.ts`, `src/internal/render-css.ts`'s `.fill--*` line, `color-names.ts`'s comment, `mount-all.test.ts`, the notices record, text and minimum line, `design-resolver(.test).ts`, the MaterialIcon carve-out in `scripts/type-roles/exceptions.ts`, `StaleIcon.vue`, and every icon tag and its test. type-scale-1 owns `token-contract.ts`'s `typeRoles`, the rest of `scripts/type-roles/*` and every `<Text variant>` or role class. Shared, resolved by the second to land: `utilities.css` (generated: `bun run --cwd packages/design gen:tokens`, never by hand), the one comment at `token-contract.ts:172`, and SFCs where both lanes edit different lines (rebase).

## Security & Adversarial Considerations

- **Threat model.** Glyphs are static constants. No dApp or stored value supplies path data, but a dApp's request decides which wallet-owned permission rows, flags and warnings appear (`permission-rows.ts:172-207`). A blank, merged or recoloured glyph there weakens the signal a person reads before approving. Controls: the name guard (D4); no picture merged (D8); colour props and `STATUS_ICON_FILL` kept site by site; `PermissionRow.test.ts` asserts the real rendered glyph and colour class of a flagged and an unknown row; screenshots of the capabilities window with a flagged row and of the execute window.
- **Input handling.** No `v-html`, no markup strings: paths bind through `:d`. `Icon` renders nothing for a name outside `glyphs`; the guard keeps that state out of the tree.
- **CSP.** Inline `<svg>` needs no source. `rotate` stays a CSSOM style binding, as today; stroke width is an attribute. No CSP string changes (`manifest.test.ts:132-133` stays green).
- **Supply chain and licences.** No dependency is added. The font, its record, its text and its minimum line leave together (`generate.ts:198-201` and `generate.test.ts:467-473` require it). `ALLOWED`, `FONT_ALLOWED`, `OVERRIDES` and `VENDORED` gain nothing. `StaleIcon`'s paths share endpoints with Lucide's `refresh-cw`, `circle-pause` and `wifi-off` (plausible but unverified derivation; Lucide is ISC and asks for a notice), so they retire with the others. The new glyphs are original: no path is traced or copied from Material, icons.json, Solar, MDI or Lucide, and the PR says so. Azguard's `DERIVED` record stays for the code that carries its header.
- **Crypto, auth, storage, logging**: not touched.

## Assumptions

**Facts**
- F1. icons.json has 104 keys and 51 are never used (recon § Inventory).
- F2. The font is 343 628 bytes; its `VENDORED` record is `policy.ts:321-334`; the generator refuses a record that matches nothing (`generate.ts:198-201`), and `generate.test.ts:467-473` ties the shipped fonts to the reviewed hashes.
- F3. The decision texts quoted under UI impact are the issue comments on #590 and #602 (read 2026-10-16).
- F4. `vue-tsc` skips an SFC whose script lacks `lang="ts"` (`lessons.md`, CI & gates); 20 of the 88 SFCs that use `Icon` have it.
- F5. `send-outcome-rows.test.ts:95-101` compares the computed `fill` of `activity-status-icon` with the status line's `color` in both themes.
- F6. `Icon.vue:38` sets an inline `fill: currentColor` when no `color` prop is set; `LogsToolbar.vue:166-173`'s `.filter_button_active { fill }` therefore paints nothing today.
- F7. `vitest.e2e.network.config.ts:26` retries twice unless `NULO_E2E_RETRY` is set.
- F8. `shotSend` captures already exist for Home (`home-links.test.ts:68`), History (`:103`), Holdings (`holdings-add-token.test.ts:23`), Send (`fixtures/send-page.ts`), the execute window (`network/type-roles-windows.test.ts:296`) and the connection check (`network/connect-verify-mismatch.test.ts:58`); none for the Settings hub or a flagged capabilities row.
- F9. The smoke setup loads `dist/<browser>` and refuses a build without the armed stamps (`tests/e2e/global-setup-smoke.ts:34,41-52,66-73`); it never builds.

**Inferences**
- I1. An `<svg>` in place of a Material `<span>` inside a flex row keeps the row's box; before/after screenshots check each named surface.
- I2. At 9 px (`TokenCard.vue:101,104`) the floor makes strokes 4 units and the marks stay legible; the sheet story's 9 and 10 px rows check it.
- I3. type-scale-1 does not edit `base.css`; if it does, the second to land rehashes `base.css.test.ts`.
- I4. The design source on disk is still edited for page 33, so `recon.md` § Design source is the spec.

**Asks** (each in OWNER-ASKS.md; the arc ships its "now" form, which stays inside the signed records)
- A1. Tier: the spawn prompt said `light`, the lane brief says `mid`; the prompt's own rule ("the tier the lane brief names") makes it `mid`.
- A2. OA-1: popup rows of the Settings kind keep a glyph now.
- A3. OA-2: the long-tail glyphs ship as drawn, every picture kept; the owner may redraw or merge.
- A4. OA-3: the reveal toggles' eye is page 33's current public-mark candidate.

## Decision ledger

| # | Decision | Rejected alternative and why |
|---|---|---|
| D1 | One PR for arc 1 (P30-08 B and #602), one for the page 33 marks | Two PRs for arc 1 (outline-alt): #602 B needs icons.json and Material out of the same release; both auditors agreed |
| D2 | Glyphs as a typed TS module | SVG files and a loader (a build step for 58 entries), JSON (no type), markup with `v-html` (an XSS-shaped habit) |
| D3 | Paint through `color`; `.fill--*` no longer generated | Outlined strokes (lose the floor; see Trade-off); keeping `.fill--*` unused (dead CSS in every build) |
| D4 | Static guard by attribute convention plus typed TS | A Vue prop validator (a Vue warning fails no unit test: `tests/vitest.setup.ts` only shims the console); `lang="ts"` on every caller (68 SFCs, out of scope); a "used" check (dropped: a dead glyph costs bytes, and common words make it prove nothing) |
| D5 | Knock-outs as evenodd holes, one path per solid | A per-instance SVG mask (ids, more DOM); painting the background colour (wrong on any other surface) |
| D6 | `StaleIcon` retires into the set | Keeping it: its paths may derive from Lucide (ISC), against #602 B, and it is a second renderer |
| D7 | Interim private and public marks redrawn from today's metaphors | Keeping icons.json for two names: a release cut between arcs would ship a borrowed glyph |
| D8 | Each site keeps its picture; merge only where the sheet merges | Merging near pictures (signature into the pencil, contacts into the user, mail_lock into the padlock, faucet into the plus): changes what the approval window shows; now OA-2 |
| D9 | Picture names for the status ladder (`square-check` …) | Sheet labels (`confirmed` would also mean "selected"); old names (`check-circle` drawing a square) |
| D10 | Rotations in the one `rotate` prop | Caller transforms beside Icon's (the caller's wins: chevrons point the wrong way) |
| D11 | `fill` and `scale` props and `iconRotate` go | Keeping props with no caller |
| D12-D14 | `chevron-down` tag removed; spacers kept hidden; `BarrierOverlay` keeps the inherited colour | Each alternative changes what a screen shows today |
| D15 | Screenshots by `NULO_E2E_SHOT_DIR` on the existing captures, plus two `shotSend` calls added to tests that already open the Settings hub and a flagged capabilities row; "before" taken at the rebased base SHA before Phase 1 | A spec copied in and deleted (not reproducible, both auditors) |
| D16 | Azguard header stays on `Icon.vue` | Dropping it: the prop API derives from Azguard's component |
| D17 | `square-cross`'s inner X at the set weight (source: 2.25 units) | A per-stroke width in `Glyph` for one 0.25-unit difference |
| D18 | Plain-TS modules take `GlyphName` from `@nulo/design/core/glyphs.ts` | The barrel: the e2e typecheck reaches `journal-state.ts` and resolves no `.vue`, so every SFC the barrel exports fails it |
| D19 | `StaleNetworkTakeover`'s screen branch is `v-else-if="content"` and its mark `v-else-if="line.mark"`, so vue-tsc narrows them; four identifier-inventory branches re-keyed to match | A non-null cast on `content`, which hides the `undefined` the loading and progress screens produce |
| D20 | Two more no-op-by-default `shotSend` calls, the Accounts popup (`accounts.test.ts`) and a network page (`endpoints.test.ts`), so the PR shows both | A capture spec copied in and deleted (as D15) |

## Audit verdicts

**Round 1, Codex** (`gpt-6.1-sol`, high): `conditional approve` (repair the phase gates, bound the guard, preserve rotations, owner sign-off for unresolved visual changes).
1. High, Phase 1's typecheck fails while callers keep old names: **accepted**; Phases 1 and 2 merged into one migration phase.
2. Medium, the guard rejects `'dark'` in `display.vue:186-188` and misses story args and forwarding props: **accepted**; value positions only, attribute convention, typed forwarding props.
3. Medium, caller transforms override `rotate`: **accepted** (D10).
4. Medium, one weight cannot carry the 2.25 cross and holes are not floored: **accepted** as recorded deviation D17 and a reworded quality bar; holes keep the source's fixed width.
5. High, "ships now" cannot stand in for a product decision, and the collapses change permission pictures: **accepted in part**; no picture is merged (D8), so every "now" form stays inside the signed records. Holding delivery for the asks is **rejected**: the program ships each "now" form without waiting.
6. Medium, the capabilities window is not captured: **accepted**; capture added, and `PermissionRow.test.ts` asserts glyph and colour on real SVGs.
7. Medium, the network gate is not retry 0: **accepted** (`NULO_E2E_RETRY=0`).
8. Medium, the copied-in capture spec is not reproducible: **accepted** (D15).

**Round 1, Opus** (Plan agent): `conditional approve`.
1. Gates and untyped forwarding props: **accepted** (as Codex 1).
2. Guard misses `TransactionCard.vue`, `Navigation.vue`, more forwarding props and defaults; the "used" check proves nothing: **accepted**; completeness rule (b), three SFCs gain `lang="ts"`, "used" check dropped.
3. The five chevron sites: **accepted** (D10).
4. Dead `fill` rules would start to apply on conversion: **accepted**; rules sorted into live, dead and transitions.
5. `StaleIcon` may derive from Lucide: **accepted** (D6).
6. The capabilities window's merges and capture: **accepted** (D8, D15); `task_alt` maps to `check`.
7. OA-3's eye is page 33's public candidate: **accepted**, OA-3 says so.
8. Story sizes and fidelity claims: **accepted**; story rows at 24, 12, 10 and 9 px; D17.
9. Joined solids cancel where they overlap: **accepted** (one path per solid).
10. Reuse existing captures; take "before" without a stash: **accepted** (D15); stale `.fill--*` comments added to the change map.

**Final pass, Codex** (fresh session, `gpt-6.1-sol`, high): `conditional approve` (complete the migration before its gate, fix the missed guard caller, armed builds for screenshots and smoke).
1. High, the Phase 1 guard rejects `materialIcon`/`leadingIcon` values that only the Material phase converts: **accepted**; the two phases are one migration phase, gated once, nothing exempted.
2. Medium, `FeeMethodSelector.vue:19,40` binds a script constant in a plain-JS SFC: **accepted**; static `name="public"`.
3. Medium, smoke runs load `dist/` and need the armed build: **accepted**; the armed build and its flags precede every smoke batch (F9).
4. Low, design stories are not typechecked: **accepted**; the claim is scoped and the blind spot named; the sheet story is generated from `glyphs`.
5. Low, the PNG counts do not match the reused captures: **accepted**; the eight required pairs are named and extra captures allowed.

Resumed to verify: **`approve`**; all five fixes present, no regression in phase numbering, seeds, loop placement or gate commands. No finding in any round adds state, a lifecycle, a protocol or a public contract.

### Arc 1 implementation review

**Round 1, Codex** (`gpt-6.1-sol`, high, session `01a1473a`): `conditional approve`.
1. Medium, the Settings FPC page's rows keep a leading `fee` glyph: **accepted**; they are Settings-page rows (step 8), not OA-1 popup rows.
2. Low, `TransactionTerminalCard.vue` forwards untyped glyph props: **accepted**; `lang="ts"` with `GlyphName` and `StatusTone`, stale header sentence dropped.

**Round 1, Opus** (general-purpose agent): `conditional approve`.
1. Medium, the senders page's copied tick turns primary on hover and focus: **accepted**; inline `color`, as its inline `fill` did.
2. Low, `.filter_button_active:hover svg` turns a hovered active funnel blue, where its `fill` form never painted: **accepted**; the rule and its dead class go.
3. Low, glyphs that were Material spans now meet RowAction's hover rule: **accepted** for `DetailsTable`'s copy glyph (a specificity tie, now three classes); History's chip × darkening on hover is inside the icon's own box and is recorded as OA-5.
4. Low, `mount-all.test.ts` mounts a retired name: **accepted** (`open`).
5. Low, `Icon.test.ts` no longer pins `role="img"`: **accepted**.
6. Low, `TransactionTerminalCard` untyped (as Codex 2) and a story-string `chevron`: **accepted**; the guard's limits name story strings, the story keeps the right-pointing chevron.
7. Low, two stale comments: **accepted**.
8. Low, the network page's rename row loses its only edit cue: **accepted** as OA-5; a capture of the page is added (D20).

Resumed (round 2, same Codex session, over `6860b443..5b18cc75`): **`approve`**, no new material finding; every accepted fix verified, both added captures no-ops without `NULO_E2E_SHOT_DIR`.

## Arc 1: Direction 2 everywhere (closes #602)

**Smoke runs, every time** (F9): build the armed smoke build for the browser, then run with its flags, from the repo root:
`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<chrome|firefox>`, then `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- <files> --retry=0` (with `NULO_E2E_BROWSER=firefox` for Firefox). Rebuild after any other build or network run has written `dist/`. **Network runs**: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <files>` from the repo root. Before any e2e, check `uptime` shows load1 under 150.

**The eight capture pairs** (D15), each a light and a dark PNG: Home (`home-links.test.ts`, `home-links-rest`), Activity (`home-links.test.ts`, `history-filtered`), Holdings (`holdings-add-token.test.ts`), Send (`send-keyboard.test.ts`), Settings hub (`settings-routes.test.ts`, added), the execute window (`network/type-roles-windows.test.ts`, `authwit-summary`), the capabilities window with a flagged row (`network/cap-window.test.ts` A-5, added) and the connection check (`network/connect-verify-mismatch.test.ts`, `verify-mismatch-new`). The files write other captures too; those may stay in the folder.

### Phase 0: base and "before" shots ✓

1. Wait for #613 on `dev`, then rebase. Record the SHA in `STATUS.md`.
2. Add `shotSend` to `settings-routes.test.ts` (the Settings hub) and to `network/cap-window.test.ts`'s flagged widening (A-5). Commit them.
3. Run the capture files on Chrome with `NULO_E2E_SHOT_DIR=~/.cache/nulo-backlog/icons-d2-1/before` (create it first), smoke and network as above.

**Validation gate**: the capture files green at retry 0; the eight pairs present in `before/`; the source SHA recorded. Layers: e2e, e2e-live-network.

### Phase 1: the migration ✓

1. Add `glyphs.ts` with every entry of the catalogue.
2. Rewrite `Icon.vue` as the Architecture section says.
3. Rewrite `Icon.test.ts`: a stroke glyph renders `fill="none"` paths at the floor width (`size 12` gives `3`, `24` gives `2.5`); a solid renders `evenodd` paths, one per entry; `square-check` keeps its hole; `color` adds `color--<name>`; `rotate` sets the transform; an unknown name renders no path, beside a known name that does.
4. Add `Icon.stories.ts`, generated from the keys of `glyphs`: every glyph at 24, 12, 10 and 9 px.
5. Type the forwarding props and TS tables `GlyphName`. Give `TransactionCard.vue`, `Navigation.vue` and `StaleNetworkTakeover.vue` `lang="ts"` with their names typed. In `FeeMethodSelector.vue`, write `name="public"` and drop the `TAG_GLYPH` constant.
6. Rename every `Icon` name and forwarding value by the catalogue. Apply D10, D12, D13; drop `iconRotate`.
7. Convert every `MaterialIcon` tag and table to `Icon`. A converted tag keeps its colour: an explicit `color` stays; none becomes `color="primary"` (MaterialIcon's default) unless a stylesheet rule set its colour. Convert every `StaleIcon` use; its `color` CSS-variable names map to `TextColorName`.
8. Remove the leading glyph from every Settings-page row; keep selection marks; drop `presto-ui-state.ts`'s row icons and `SettingItem`'s `materialIcon` prop, branch, CSS and the ligature comment on `.icon_slotted`.
9. Sort and convert the `fill` rules (Architecture, D3). Drop `.fill--*` from `render-css.ts`, then run `bun run --cwd packages/design gen:tokens`.
10. Delete `icons.json` and its `ACKNOWLEDGEMENTS.md` line; rewrite `journal-state.ts:48-58`'s comment to the invariant the guard proves. Delete `StaleIcon.vue`, `MaterialIcon.vue` and its test, the font, `base.css:38-66` (update the hash and comment in `base.css.test.ts`), the notices record, text and minimum line, the resolver entry and its test, the `mount-all` entry and the carve-out. Regenerate `components.d.ts` with `bun run --cwd apps/extension build`. Update `Settings.stories.ts`.
11. Add `icon-names.test.ts` (a), (b) and (c). Update the stub tests that pin names, and `StaleNetworkTakeover.test.ts`. Rewrite the ligature-text tests (`CapabilityDisclosure`, `DetailsTable`, `PermissionRow`, `PasswordVisibilityToggle`, `credential-pins.ts`) to read the rendered glyph's `name` prop; `PermissionRow.test.ts` also asserts the colour class of a flagged and an unknown row.

Steps may land as several commits; only the end of the phase is gated.

**Validation gate**: `bun run lint && bun run typecheck:all && bun run test && bun run test:all && bun run --cwd packages/third-party-notices test && bun run build && bun run --cwd apps/extension build-storybook`. Pass: exit 0 each; the guard fails when one site is set back to `check-circle`, then passes after the revert; `find apps/extension/dist -iname '*material*'` prints nothing; `THIRD-PARTY-NOTICES.txt` names no Material. Layers: lint, typecheck, unit, build, storybook build.

### Phase 2: docs, e2e, "after" shots ✓

1. Update `CLAUDE.md`'s L1 line, `packages/design/README.md` (Icon: the glyph module, the paint rule, how to add a glyph), and `packages/third-party-notices/README.md` if it names Material.
2. Run the whole smoke suite on Chrome, then on Firefox, each from a fresh armed build. Run `network/cap-window.test.ts`, `network/type-roles-windows.test.ts` and `network/connect-verify-mismatch.test.ts`.
3. Rerun Phase 0's captures into `after/`. Copy the eight pairs from `before/` and `after/` and a capture of the sheet story into `implementations-plan/icons-d2-1/screenshots/`. Record both SHAs and the commands in `lessons/phase-2.md`.

**Validation gate**: `bun run audit:vue` exit 0; both smoke runs and the three network files green at retry 0; the eight pairs before and after, and the sheet, in `screenshots/`. Layers: all, e2e, e2e-live-network.

## Arc 2: the page 33 marks (refs #590)

Starts when the orchestrator relays P30-09 and P30-10. Rebase onto `dev` first (testers-fixes-2 changes Home's layout).

### Phase 3: private and public marks, hero arrows

1. P30-10: redraw `private` and `public` (and `eye`/`eye-off`, `network-edit` if the pick redraws them) in `glyphs.ts`. Call sites already name `private` and `public`.
2. P30-09 = A: put `send` and `receive` before the words in `ActionButtonsView.vue`'s two buttons, inside each button's own box. B: nothing.
3. Update the sheet story and any test that pins a renamed glyph.

**Validation gate**: `bun run audit:vue`; `home-links.test.ts` and `send-keyboard.test.ts` green as smoke runs above; their Home and Send pairs, light and dark. Pass: exit 0 and green.

## Delivery

- **Arc 1** → one PR against `dev` from `worktree-icons-d2-1`: `feat(design): draw every icon in direction 2, retire icons.json and the material font` (85 characters). Body: the UI impact quotes, the catalogue, the screenshots, the validation runs, each browser's smoke wall-clock before and after, `Closes #602`, `Refs #590`.
- **Arc 2** → one PR against `dev` after arc 1 merges, branch `icons-d2-1-marks` from `dev`: `feat(design): draw the private and public marks and the hero's send and receive arrows` (86; drop the arrows from the title if P30-09 = B). Body: the page 33 picks quoted, `Refs #590`. After it merges, comment on #590 that its icon part shipped; the sheet part keeps #590 open.
- No stack (orchestrator decision D-orch-1). Open each PR only after its gates pass and its Codex loop converges. Add `e2e:extension-smoke` or `e2e:extension-network` only if the path filter skips a suite the change needs.
- Close-out lands as arc 2's final commits. If the orchestrator drops arc 2, it lands as arc 1's final commits and #590's icon part becomes the orchestrator's call.
- Parallelism: none; each phase edits files the next one reads.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `493ff497`. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`; prompts start "You are a subagent. Don't run memo." and carry the standard's two verbatim rules. Run it on arc 1's diff after Phase 2, on arc 2's diff after Phase 3, then one fresh session over the net diff from `493ff497` for cross-arc issues. Hard stop at three rounds per loop.
- Log each round in `lessons/phase-N.md` and its verdict under Audit verdicts.
- Teardown after the close-out merges: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/icons-d2-1/plan.md`, then `agent-worktree done icons-d2-1 --merged`.

## Seeds (draft; the orchestrator runs none)

```
/goal Arc 1 of implementations-plan/icons-d2-1/plan.md done: Phases 0-2 marked ✓, each gate's commands reported passing in the transcript, LESSONS_FILE printed per phase, the Codex loop converged on the arc 1 diff (resumed pass quoted with no new material finding), the arc 1 PR open with Closes #602 and green checks, `bun run test` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/icons-d2-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks), next pending phase, its gate, the Codex loop at the arc boundary, delivery per the Delivery section; never open arc 2 before the orchestrator relays P30-09 and P30-10.
```
