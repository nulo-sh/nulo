# @nulo/design

The shared, framework-/host-agnostic design system for Nulo apps (the wallet **extension**; the
**landing** takes its tokens and fonts from `base.css`). **Presentational only** — components take their data and any `data-testid` via props and
never import app utilities, stores, service clients, or `chrome.*`.

## Layers (low → high)

- **L0 tokens** — `src/token-contract.ts` (canonical source) → generated `src/tokens.ts` and
  `src/utilities.css`, the type roles among them; `src/base.css` (fonts, resets, per-theme values)
  is hand-authored and imports `utilities.css`.
- **L1 core** — `src/core/**` primitives: `Flex`, `Icon` (a glyph of the set, below), `Text` (its
  `variant` takes a type role).
- **L2 ui** — `src/ui/**` ui primitives.
- **L3 composite** — `src/composite/**` (empty today; the biome layer rule stays in place).

A lower layer cannot import a higher one (biome enforces `core ⊄ ui`). The package **floor** bans any
`@nulo/*` import and `chrome.*` — via biome `noRestrictedImports` / `noRestrictedGlobals` (see
`biome.json`) plus `src/boundary.test.ts`, which also audits the `window.chrome` /
`globalThis["chrome"]` / `webextension-polyfill` indirections biome can't see and pins the floor so a
PR can't silently weaken it.

## Tokens (single source)

The canonical token names + scales live in **`src/token-contract.ts`**. **`src/tokens.ts` and
`src/utilities.css` are GENERATED** from it by `scripts/gen-tokens.ts` — never hand-edit them.
`src/base.css` is hand-authored. After editing the contract:

```
bun run gen:tokens
```

`src/tokens.drift.test.ts` and `src/utilities.drift.test.ts` byte-pin the generated files (fail CI
on divergence — modeled on the repo's other generated-artifact pins). Per-theme VALUES live in
`src/base.css`.

Error and refusal text is `txt-danger`: 4.5:1 in both themes on the page, a row, a card, a window
footer and, as `--log-error-color`, a log line's tint (`src/theme-contrast.test.ts`), though not on
`--nulo-surface-highest`. `--red` reads 3.56:1 on
the light page, so `red` paints glyphs, fills, borders and large text. The extension's
`src/utils/red-text-ban.test.ts` refuses other text in `--red`.

## Type roles

A face, letter spacing or upper case comes only from a **type role**: one of the 24 records of
`typeRoles` in the contract, each the type for one job (`label-section`, `meta`, `body`, …). Each
renders one generated class, `.type--<role>`, which sets its family, weight, tracking, case and
figures, and its size unless the role leaves the size to the element (`siteSizedTypeRoles`). No
role sets line height. The floors are `MIN_TEXT_PX` (10) and `MIN_MONO_PX` (11).

An element takes a role in one of three ways: `<Text variant="meta">`; `composes: type--meta from
global;` as the first line of the element's own single-class module rule (which then declares no
property the role sets, except a site-sized role's `font-size`); or a static `type--meta` class on
the element. A role class is one class, (0,1,0), so a plain module class on the same element must
not set a role property: which of two equal selectors wins depends on stylesheet load order.
`src/type-roles.contract.test.ts` pins the records to their signed values; the extension's
`type-role-ban.test.ts` refuses a face, tracking or case picked anywhere else, and any `size`,
`weight`, `mono` or `tabular` on a `<Text>`.

Pick a role by the job the text does, from the last column. G is Space Grotesk (`--font-headline`),
I Inter (`--font-body`), M JetBrains Mono (`--font-mono`). "Site" leaves the size to the element,
which sets it in its own rule (at least the floors). Tracking is in em. A dagger marks tabular
figures. `segment`'s selected item takes weight 700 through the component's own compound rule;
Send's publish facts keep 10 px / 600 / 0.08 em in `label-section` the same way, and Manage accounts' address lines keep 11 px in `meta` (each an
`OVERRIDES` entry in the extension's type-role exceptions).

| Role | Face | Size | Weight | Case | Tracking | For |
|---|---|---|---|---|---|---|
| `title-hero` | G | site | 700 | upper | -0.04 | Tab hero titles, wordmarks, the unlock and register headings |
| `amount-hero` † | G | site | 700 | none | -0.04 | Home balance, the Send amount and its review |
| `amount-total` | M | site | 500 | none | -0.02 | The Holdings total |
| `title-page` | G | 13 | 700 | upper | 0.12 | Sub-page, popup and sheet titles; loading and empty-state titles |
| `label-section` | G | 11 | 700 | upper | 0.1 | Every small-caps line: section labels, Settings groups, pre-titles, date groups, toast titles, field and key labels, toggle labels, inline actions, table heads, chips and badges, the network and lock chips, fee priority, the account name in the header and the identity strip |
| `row-title` | G | site | 700 | none | -0.02 | Token, activity and Settings row titles; card and status titles |
| `caption` | I | 11 | 400 | none | normal | A row's secondary line, Settings descriptions |
| `name` | I | site | 600 | none | normal | Account, contact, profile and fee method names |
| `body` | I | 12 | 400 | none | normal | Sentences: help, warnings, errors, empty states, tooltips |
| `button` | G | 14 | 700 | upper | 0.2 | CTA buttons at every size, Home's actions |
| `button-md` | G | 13 | 700 | upper | 0.03 | `primary` and `primary_outline` buttons |
| `nav` | G | 11 | 500 | upper | 0.05 | Bottom-nav labels |
| `segment` | G | 10 | 500 | upper | 0.06 | Segmented controls (the Send type toggle, onboarding method tabs) |
| `tag-name` | G | 10 | 700 | upper | 0.08 | The publish strip's name cell |
| `brand` | G | 10 | 700 | none | 0.2 | "NULO" in the identity strip |
| `input-data` | M | 14 | 400 | none | normal | Typed text in mono fields: addresses, the dust threshold, token search |
| `data-lead` | M | 13 | 600 | none | normal | The address or hostname a screen is about |
| `amount-row` | M | 14 | 500 | none | normal | Token and activity row amounts |
| `amount-detail` † | G | 24 | 700 | none | -0.02 | The receipt pages' amount |
| `fiat` | M | site | 400 | none | normal | Every dollar value |
| `time` | M | 11 | 400 | none | normal | Dates and times |
| `meta` | M | 13 | 400 | none | normal | Addresses, hashes, ids, function names, inline amounts and fees, symbols beside amounts, counts, hints, conversions |
| `value` | I | 12 | 600 | none | normal | Values in key/value rows, Settings trailing values, banner titles |
| `input` | I | 15 | 500 | none | normal | Text a person types into `Input` |

Avatar initials take no role: `AccountAvatar` sizes them from their box.

## Icons

`Icon` draws one glyph of `src/core/glyphs.ts`, the set's only source: Tabler Icons 3.49.0 (MIT),
outline and filled, recorded as a `DERIVED` component in `@nulo/third-party-notices`. `name` is a
`GlyphName`. An unknown name draws nothing, so the extension's `icon-names.test.ts` refuses one in any
template, and vue-tsc refuses one in a `lang="ts"` caller.

- **Source**: `src/core/glyph-sources.ts` maps each name to its Tabler icon (`filled/<name>` for the
  solid variant). `bun run gen:glyphs` writes `glyphs.ts` from it and the exact `@tabler/icons`
  devDependency; `glyphs.drift.test.ts` fails when the two disagree. Never edit `glyphs.ts` by hand.
- **Paint**: a glyph paints only through `color`. The root sets `fill` and `stroke` to
  `currentColor`; the `color` prop adds `.color--<name>`, and without it the glyph takes its
  parent's colour. A stylesheet colours a glyph with `color`, never `fill` or `stroke`, which would
  fill a stroked path.
- **Weight**: Tabler's own: strokes are 2 units on the 24-unit grid at every size, with round caps
  and joins; filled paths use the default fill rule.
- **Turns**: `rotate` turns the glyph about its centre. `chevron` points right; 90 points it down.
- **Adding a glyph**: add one `glyph-sources.ts` row naming a Tabler icon at the installed release,
  run `bun run gen:glyphs`, and check it in the `Core / Icon` sheet story at 24, 14, 12, 10 and 9 px,
  light and dark. The generator refuses an icon `Icon.vue` would not draw faithfully.
- **Changing a picture**: a new row, a changed row, or a bump of `@tabler/icons` changes what screens
  show: a UI change, with pictures and the owner's sign-off. A bump also moves the `DERIVED` record's
  version, source and note in the same PR.

## Consumers compile the source

The package ships **Vue SFC + TS source** (no build step); each consumer's Vite/`vue-tsc` compiles it.
There is **no auto-import** in this package — every component, Vue API, and helper uses **explicit
imports** (a consumer need not run `unplugin-auto-import`/`unplugin-vue-components`). The
extension keeps `<Tag>` templates working by mapping `@nulo/design` component names through a custom
`unplugin-vue-components` resolver, so call sites and `data-testid`s are untouched.

Import the global stylesheet once at app entry: `import "@nulo/design/base.css"`. Fonts are
package-owned.

## Host-DOM contract (teleport roots + `--base-width`)

Some primitives teleport into host-provided roots and read a host CSS var. The consuming app MUST
declare these (the extension declares all of them in its `popup`/`onboarding` app shells):

- **`Tooltip`** → teleports to the `teleportTo` prop (default `#tooltip`) and clamps its text to
  `calc(var(--base-width) - 40px)`, so the host must also define a `--base-width` CSS var.
- **`Popover`** → teleports to `teleportTo` (default `#popover`). Its panel keeps the Tab order of a panel placed right after its trigger: opened from the focused trigger it takes focus, Tab past its last control goes on from the trigger, Shift+Tab before its first closes back onto it, and focus leaving both closes it. Its controls are found by a selector blind to visibility, so a panel holds no hidden control.
- **`ToastManagerBase`** → teleports to `teleportTo` (default `#toast`).

A missing root means the teleported content silently fails to mount (it is NOT a no-op fallback).
`teleportTo` is developer config — never bind it to user/chain data.

## Composables

`@nulo/design/composables/*` (explicit-import, no auto-import): `useToast` with `SUCCESS_TOAST_MS`/`ACTION_TOAST_MS`
(transient single-toast singleton driving `ToastManagerBase`) and `useOutside`/`useEvent`
(outside-press detection used by `Popover`). The extension re-exports both from its local
`composables/{toast,outside}.js` shims so its existing auto-import call sites are untouched.

## Scripts

- `bun run gen:tokens` — regenerate `src/tokens.ts` and `src/utilities.css` from the contract.
- `bun run gen:glyphs` — regenerate `src/core/glyphs.ts` from `glyph-sources.ts` and the installed `@tabler/icons`.
- `bun run typecheck` — `vue-tsc --noEmit`.
- `bun run test` — vitest (drift, boundary, component tests).

## Exports

`.` (barrel, with the `GlyphName` type) · `./tokens` · `./base.css` · `./core/*` (`glyphs.ts` by path, for the name guard and plain-TS modules) · `./ui/*` · `./composables/*`.
