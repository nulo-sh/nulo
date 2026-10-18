# Recon: icons-1

Base: `origin/dev` at 9470d4e9. Two sonnet explorers (a reuse sweep over eight capabilities; sizes, e2e and collisions) plus direct checks of the Tabler package. Every claim below was read in the tree or the package; the search trail follows each absence claim.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| One glyph table the app draws from | `packages/design/src/core/glyphs.ts` (58 entries, `Glyph = { s?, f? }`, `GlyphName`) | adapt: same names and shape, Tabler paths |
| The renderer | `packages/design/src/core/Icon.vue` (single root `<svg>`, root `fill` and `stroke` `currentColor`, `s` paths `fill="none"`, `f` paths `stroke="none"`) | adapt: weight, caps, joins, fill rule |
| A committed artifact pinned to its source | `scripts/gen-tokens.ts` + `src/internal/render-tokens.ts` + `tokens.drift.test.ts` (the generator writes, a test fails on drift) | reuse the pattern |
| Locating a dependency's files | `@nulo/resolve-asset` (banned in `packages/design/src` by the Biome floor, `boundary.test.ts`); the package's exports map `"./*": ["./icons/*"]` | resolve through the exports map |
| Attribution of copied third-party source | `packages/third-party-notices/src/policy.ts` `DERIVED` (one record today, Azguard), `texts/<slug>.<SPDX>.txt`, `expected-minimum.txt` § "source adapted into first-party files" | reuse: one new record |
| The glyph review sheet | `packages/design/src/core/Icon.stories.ts` `Sheet` (sizes 24, 12, 10, 9) | adapt: add 14 |
| Unknown-name guard | `apps/extension/src/utils/icon-names.test.ts` (names only, no count) | reuse as is |
| Before/after capture harness | the showcase's scratch specs (`~/.cache/nulo-backlog/icons-showcase/specs/`), never committed | adapt as scratch, never committed |

No build-new item: the generator and its drift test follow the token pattern.

## Facts

1. **All 58 Tabler picks are `<path>` only** (169 paths; commands `M a c h l m s v z`, no uppercase `A`). Three are filled (`square-check`, `square`, `filter`), 55 outline. Beside the 169, each file carries Tabler's no-op box `<path stroke="none" d="M0 0h24v24H0z" fill="none" />` (58 more `<path>` elements, to drop); no drawable child carries an attribute beyond `d`. The showcase report's "libraries use circle, rect, line and polyline" does not apply to Tabler's 58.
2. **Integrity**: the showcase tarball's sha512 is `l+GnSkFETx0U26icxv1VUFnxxiTqXfCcVRiRAnyMwibupM2S2L/hSaZ9gmSgz01rkrsH/93NvLsxykqdanc6lw==`, equal to the registry's `dist.integrity` for `@tabler/icons@3.49.0`. Tag `v3.49.0` is commit `bbed884d15354b5cebf2493371f20dc2d5e83eaf`. Its `LICENSE` is byte-identical to the package's (MIT, "Copyright (c) 2020-2026 Paweł Kuna"). The 58 icons' path data is identical at the tag and in the tarball.
3. **Age gate**: 3.49.0 (2026-10-05T14:17Z) is still `latest` on 2026-10-18 and 13 days old, past `minimumReleaseAge = 604800` (`bunfig.toml:56`). No runtime dependency.
4. **Scanner**: `scripts/ci-cd/workflow-refs.test.ts:25` reads `\b[MA][0-9]+\.[0-9]+\b` as a milestone tag in every tracked `.ts`/`.vue` file (`.md`, `.json`, `.svg` skipped). 18 of the 169 Tabler paths trip it (`M3.05 11a9`, `M18.333 2c`, …). A space after `M` clears all 18; today's `glyphs.ts` header states that rule. The scanner runs in `test:ci-gating` only (the trap icons-d2-1 hit).
5. **Computed fill is pinned by e2e**: `apps/extension/tests/e2e/send-outcome-rows.test.ts:101,128-129` requires `getComputedStyle(activity-status-icon).fill` to equal the status line's colour. It holds because the root sets `fill="currentColor"`; the root must keep it.
6. **Unit pins on the old drawing**: `packages/design/src/core/Icon.test.ts:12-15` (one `close` path, stroke `2.5` / `3`, square caps), `:19-24` (`holdings` solids even-odd), `:28-30` (`square-check` two `M`), `:42-45` (`private` 1 solid, `public` 8 solids). `PermissionRow.test.ts:31,88` need ≥1 path for `check` and `signature` (Tabler: 1 each). `mount-all.test.ts:36` needs `open` to exist.
7. **No CSS reaches inside an icon**: no rule targets `path`, `stroke`, `fill` or `stroke-width` of a glyph; svg rules set `color`, transitions and position only (`LogsViewer.vue:326`, `Banner.vue:98-118`, `RowAction.vue:51-56`, …). Fallthrough attributes (`data-testid`, `aria-*`, `class`) need the single root `<svg>`.
8. **Orientation**: `chevron` must point right (rotated 90/180/270 at eight sites), `more` horizontal (rotated 90 at four), `forward` right (rotated 90 in `LogsViewer.vue:287`). Tabler `chevron-right`, `dots`, `arrow-right` keep them.
9. **Sizes in use** (235 tags; Opus's count across multi-line tags: 14 px 73, 12 px 52, 10 px 15, so 19 tags under 12 px, `open` the largest group): 14 px 67, 12 px 48, 16 px 25, 18 px 18, 10 px 13, then 24, 15, 9, 11, 40, 22, 20, 13, 48, 32, and `PasskeyScreen` 36/20 (`glyphSize`) and 20/14 (`badgeSize`). The marks: `TokenCard.vue:101,104` 9 px, `BalanceView.vue:325,335` 12 px, `FeeMethodSelector.vue:36`, `PublishStrip.vue:31`, `SendReviewSheet.vue:143` 10 px.
10. **Glossary copy** (`apps/extension/src/utils/glossary.ts:15,20`): "Only you can see it. Marked with a solid square." and "Anyone can see it, like a balance on Ethereum. Marked with a dotted square." Pinned verbatim by `glossary.test.ts:6,11` and `popup/pages/settings/glossary.test.ts:40,44`. Signed P33-05 B: "solid square / dotted square. A wall versus a fence you can see through."
11. **Text that becomes false**: `packages/design/README.md:93-95` ("original drawings … none taken from a third-party icon set"), `:101-102` (2.5 units, square caps, 1.5 px floor), `:105-108` (adding a glyph); `glyphs.ts:1-9` header; `Icon.vue:20` comment. `ACKNOWLEDGEMENTS.md`, `NOTICE`, `ARCHITECTURE.md` name no icon source.
12. **Notices**: a `DERIVED` record needs `name`, optional `version`, an `https` `source`, `texts`, an allowed `license`, a `note` (`generate.ts:184-196`); it renders in every build. No test asserts `texts/` byte identity (README convention). `check-minimum.test.ts:35-45` does not require `DERIVED` names in `expected-minimum.txt`, but CI's `check-minimum` reads the list; Azguard sits there.
13. **Landing**: `apps/landing` imports only `@nulo/design/base.css`, never `Icon`. Its favicon is its own. Out of scope.
14. **`boundary.test.ts`** refuses `v-html`/`innerHTML` and `@nulo/*` imports in `packages/design/src`: the renderer cannot inject a library's raw SVG.

## Collisions (open work, 2026-10-18 13:3xZ)

- **wallet-bugs-2** arc 1 (#654, plan committed ed41c27b, not yet a PR): moves `TokenCard.vue`'s marks 9 → 12 px and the loading bars 9 → 11 px. Same marks, different files (it edits call sites; this lane edits `glyphs.ts`/`Icon.vue`). Land after it, or merge `dev` and re-take the mark pictures.
- **#743** (onboarding-3, draft, 100 files): touches `BalanceView.vue` (the 12 px marks). No file in common with this lane.
- **#702**: `packages/design/src/base.css` only. No file in common.
- **p46-ui-1, ui-dedupe-1 A7, iface-line-1**: header chips, the token row, the accounts list, popup dedupe. None edits `packages/design/src/core/**` or `third-party-notices`; this lane edits no call site.
- Open issues on icons beyond #764 and #654: none (`gh issue list --search icon|glyph`). Closed `known-limit` on icons: none (`--label known-limit --search icon|glyph`).

## Search trails (absence claims)

- Other hand-drawn SVG: `<svg|<path|<circle|<rect|createElementNS|svg\+xml|viewBox` over `.vue .ts .js .html .mjs .tsx` in apps, packages, scripts: only `Icon.vue`; logos are files.
- Glyph-shape consumers: `glyphs`, `\bGlyph\b`, `stroke-linecap|stroke-linejoin|stroke-width|fill-rule`, `findAll("path")`, `querySelector.*path` across apps, packages, scripts: only the files in Facts 5-6.
- E2E on icons: `\bsvg\b|data-name|data-glyph`, `getBoundingClientRect` in `tests/e2e`: no size or glyph assertion beyond Fact 5 and the hit boxes in `contacts.test.ts:190-192`, `rows.test.ts:306-313`.
- Notices tests on `DERIVED`: `generate.test.ts:330-348`, `check-minimum.test.ts:35-45`; no byte-identity test of `texts/`.
