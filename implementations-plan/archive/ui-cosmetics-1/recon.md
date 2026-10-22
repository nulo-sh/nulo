# ui-cosmetics-1: recon

Read on `dev` at `6d507c611`. Two Explore agents (sonnet): one reuse sweep (onboarding header, onboarding e2e, Get started) and one icon-rendering map; the parent verified each claim used in the plan and ran one pixel probe ([lessons/phase-0.md](lessons/phase-0.md)).

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Onboarding page shell | `apps/extension/src/onboarding/components/OnboardingPage.vue` (640 px column, `margin: 24px auto 0`, `gap` prop, default 32) | reuse-as-is; the page gap keeps spacing the content below the header |
| Back link | `onboarding/components/OnboardingBackLink.vue` (`testid` prop, pushes `/onboarding/welcome`) | reuse-as-is, inside the new header's fixed row |
| Step row | `onboarding/components/StepIndicator.vue` (`current`, `path`; `margin: 0 0 16px`) | reuse-as-is, inside the new header |
| Title | `packages/design/src/ui/BrutalistTitle.vue` (`<h1>`, `main`, `sub`, `align`, `size`; attrs fall through to the `h1`) | reuse-as-is |
| A shared step header | none. Searched `hero_bar`, `BrutalistTitle`, `StepIndicator`, `OnboardingBackLink` in `apps/` and `packages/`: four onboarding files repeat `<header :class="$style.hero">` + title + bar, and done the same in a `Flex`, each with its own `.hero`/`.hero_bar` CSS; the popup's `CollapsingHeroLayout.vue` and `tab-hero.module.css` serve popup pages only | build new: `OnboardingStepHeader.vue` |
| Title-top e2e read | `tests/e2e/legal-acceptance.test.ts` S1 walks terms → create → phrase (later) → done; S3 walks terms → import. Geometry-read pattern: `tests/e2e/contacts-import.test.ts:105-112` (`getBoundingClientRect` in `page.evaluate` on a testid) | adapt: add reads to S1 and S3, no new scenario |
| Per-profile Get started flag | `utils/profile-ui-keys.ts` (root, prefix, key fn, `PROFILE_UI_KEY_PREFIXES`, which profile deletion and row commit clear); `utils/get-started.ts` (`GetStartedFlag`, `KEYS`, `markGetStarted`, `firstProfileSteps`); `composables/useGetStarted.ts` (`NOTHING_DONE`); `wallet/storage/stored-shapes.ts:259` (`uiFlag(ROOT)`); `stored-shapes/goldens.json` (`.full`, `.minimal`); `snapshot.json` via `bun run baseline:storage` | adapt: `prestoOpened` is `aztecOpened`'s twin in every one of these |
| Presto step's click | `popup/pages/general.vue:52,113-120`: `ITEM_ROUTES.presto = "/popup/settings/proving"`, a route push with no mark | adapt: mark `prestoOpened`, then push |
| Glyph rendering | `packages/design/src/core/Icon.vue` (one `<path>` per glyph path, root `stroke-width="2"`, round caps and joins, paint from `currentColor`); `glyphs.ts` generated from `glyph-sources.ts` (Tabler Icons 3.49.0), pinned verbatim by `glyphs.drift.test.ts` | adapt (on the owner's pick): `Icon.vue` only; `glyphs.ts` stays verbatim |
| Glyph pictures | `packages/design/src/core/Icon.stories.ts` (`Sheet` at 24, 14, 12, 10, 9 px); no permanent screenshot tool for icons (`icons-1` used scratch specs) | the probe in `lessons/phase-0.md` produced `screenshots/`; the arc adds real-screen crops |

## Facts the plan rests on

1. Header geometry per step today: terms = back link, `StepIndicator`, header at page gap 28 (`pages/terms.vue:46-52`); create = the same at 32 (`pages/create.vue:131-137`); phrase = no back link, `StepIndicator`, header at 32 (`components/OnboardingPhraseStep.vue:31-36`, `.hero { padding: 8px 0 0 }`); import = the same as create at 24 (`pages/import.vue:136-142`); done = no back link, centred, `StepIndicator`, hero at 40 with `padding: 48px 0 24px` (`pages/done.vue:72-75`). Terms, create and import pad `.hero` 8 px on top.
2. The phrase step focuses its header (`ref="title" tabindex="-1" data-testid="onboarding-phrase-title"`, `OnboardingPhraseStep.vue:23-26`); `pages/create.test.ts:298` and `tests/e2e/keyboard-guards.test.ts:134` depend on that element.
3. `legal-terms-page` sits on terms' `<header>`; no test reads it.
4. `aztecOpened` is a per-profile `chrome.storage.local` flag (`nulo:ui:getStartedAztecOpened@<id>`), set by `general.vue:118` before the tab opens; `prestoReached` is a global config key (`wallet/config/config.ts:64`) that only `usePrestoCheck.ts:49` writes.
5. `stored-shapes/pins.ts` holds no pin: the storage baseline is not frozen, so `bun run baseline:storage` rewrites the one stamp; pre-production, no migration (CLAUDE.md § Persisted-storage shape changes).
6. Glyphs: 58, all Tabler Icons 3.49.0 since #790 (`packages/design/README.md` § Icons). 45 have more than one stroke path; none has more than one fill path; none mixes stroke and fill paths.
7. Colour tokens carry alpha: `--txt-tertiary` is `rgba(245, 240, 230, 56%)` dark and `rgba(0, 0, 0, 56%)` light; light `--txt-primary` 88 %, `--txt-secondary` 60 % (`packages/design/src/base.css:87-158`).
8. Bottom navigation draws Home, Holdings, History and Settings at 22 px, `tertiary` when inactive (`popup/components/Navigation.vue:45`). Icon sizes in `apps/extension/src`: 14 (66 tags), 12 (48), 16 (20 plus 21 by default), 18 (17), 10 (10), 22 (1), others rare.

## Collisions

- Open issues: none other than #1019 (searched "onboarding title", "icon crisp", "presto step"). Closed known limits near the area (#571, #686, #727, #729, #847) do not touch these three changes.
- `icons-1` (archived) settled stroke 2 at every size with no floor (its D3) and the owner signed the Tabler set: this plan changes neither the drawing nor the weight.
