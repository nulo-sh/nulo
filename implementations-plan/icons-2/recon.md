# icons-2 recon

Base: `origin/dev` at `767789b7`. One Explore agent (sonnet) for the reuse sweep, plus the planner's own reads. Nothing here is a backlog; open work lives in issues.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Choose a glyph's drawing | `packages/design/src/core/glyph-sources.ts:28-31` (`private: "filled/square"`, `public: "square-dashed"`) | adapt: two rows |
| Write the glyph table | `bun run --cwd packages/design gen:glyphs` (`scripts/gen-glyphs.ts`, then Biome format) through `tablerGlyphs` in `src/internal/render-glyphs.ts` | reuse as is |
| Refuse a drawing `Icon.vue` would not draw faithfully | the parser in `render-glyphs.ts:11-74` (frame and paint allowlist, the no-op box stripped, bare `<path d>` only) | reuse as is: it accepts both new icons (run below) |
| Catch a hand edit | `src/core/glyphs.drift.test.ts` (the table equals the installed release) | reuse as is: it pins no path itself |
| Pin the marks' shape class | `src/core/Icon.test.ts:35-41` (private one filled path, public stroked paths only, neither the padlock) | adapt: add the network glyph to the "neither" check |
| Licence record | `packages/third-party-notices/src/policy.ts:331-338`, one whole-package `DERIVED` record for Tabler Icons 3.49.0; `expected-minimum.txt:56` names the package only | reuse as is: no per-icon list |
| Glossary text | `apps/extension/src/utils/glossary.ts:15,20`; pinned word for word in `utils/glossary.test.ts:6,11` and `popup/pages/settings/glossary.test.ts:40,44` | adapt: two sentences, four pins |
| Pictures of the real rows | the shots-787 lead's scratch capture (`zz-shots-787.test.ts`, network suite, `feeJuiceReadyExtension`, five bands at 1x and 2x, both themes) and `compose.ts` (nearest-neighbour enlargement) | adapt: drop the `Icon.vue` pair switch; capture a real base build and a real head build |

Search trail for the absences: `git ls-files | xargs grep` for `square-dashed|filled/square|solid square|dotted square|Marked with a|Only you can see|Anyone can see|name="(private|public)"`; `glyph-sources.ts` for `world|shield|lock|globe`; `apps/extension/tests/e2e` for `currentColor|fill|stroke|<svg|data-name`. No e2e reads a mark's shape, and no story pins a drawing (`Icon.stories.ts` draws every glyph from the table; `PublishStrip.stories.ts` takes names from `publishGlyph`).

## The two Tabler icons at 3.49.0

Run through the repo's own parser (`tablerGlyph`):
- `filled/shield`: one filled path, `M 11.884 2.007l… z`, from 2 to 22 units high. It replaces one filled path, so the private mark stays `{ f: [one path] }`.
- `world`: five stroked paths, a 9-unit circle, two latitudes at y 9 and 15, two meridian arcs. It replaces `square-dashed`'s stroked paths, so the public mark stays `{ s: [...] }`.
- `world-pin` (the `network-edit` glyph): seven stroked paths. Its circle is cut open at the lower right for a map pin, its lower latitude stops at x 12.5, and its right meridian stops at y 12. No path of `world` equals one of `world-pin` except the upper latitude `M 3.6 9h16.8` and the left meridian.

## Where the marks draw

| Site | Glyph | Size |
|---|---|---|
| `popup/components/modules/general/TokenCard.vue:101,104` (Home's token row) | private, public | 12 px |
| `popup/components/modules/general/BalanceView.vue:325,335` (the token page) | private, public | 12 px |
| `popup/components/modules/send/FeeMethodSelector.vue:36` (the "NAMES YOUR ADDRESS" tag) | public | 10 px |
| `components/composite/send/PublishStrip.vue:31` | `publishGlyph(…)` | 10 px |
| `popup/components/modules/send/SendReviewSheet.vue:143` | `publishGlyph(…)` | 10 px |

`publishGlyph` (`components/composite/send/publish-facts.ts:118`) is the only computed source; its consumers are the strip and the review sheet.

## The network glyph

`network-edit` (Tabler `world-pin`) has one caller: `popup/components/popups/EditNetworkPopup.vue:109`, a large `SettingItem` whose `Icon` is 18 px (`components/ui/Settings/SettingItem.vue:127`). The popup opens from Settings → Networks → a network → Edit. No screen draws a balance mark and `network-edit` together: Settings draws no balance mark, and Settings → Glossary shows the definitions as text only.

## Words that name the old drawing

Test titles and comments that would turn false; none is user-visible:
- `components/composite/send/publish-facts.ts:116` (comment), `publish-facts.test.ts:92` (title).
- `popup/components/modules/general/TokenCard.test.ts:344` (title; the assertions read `data-name` only).
- `popup/components/modules/general/BalanceView.vue:321` (template comment, "the two squares").
- `packages/design/src/core/glyph-sources.ts:28,30` (row comments).

Outside this lane: `implementations-plan/landing-explainer-1/OWNER-ASKS.md:18,21`, clip 01's picture column, still describes "a solid square (private) and a dotted square (public)". That lane owns the file.

## Collisions

Open branches on `origin` at the base: `consent-display-1-a2` (no shared file), `send-fees-ux-arc2` (adds `QUEUED_SPONSORED_COPY` at `publish-facts.ts:72-75`, far from `:116`), `worktree-onboarding-3`, `owner-feedback-1-a1` (no shared file). consent-display-1's arc 3 plans new exports in `publish-facts.ts` (`TOKEN_CAVEAT`, `isValidatedTokenClass`), not the `publishGlyph` comment.
