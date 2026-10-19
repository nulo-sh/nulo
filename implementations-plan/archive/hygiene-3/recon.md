# hygiene-3 recon

Base: `dev` at `7eada4c6`. One Explore agent (Sonnet) mapped #735's remainder; the driver traced #797 and #517 directly. Paths are under `apps/extension/src/` unless they start with `packages/` or `implementations-plan/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Settings control row | `components/ui/Settings/SettingControlRow.vue` (L2, 5 cases), `settings-row.module.css` `.control_title` (row-title at 13px), shipped by #779 (`021bdc56`) | reuse-as-is; Developer's titles compose `.control_title`, its markup stays (structure-2's approved shape) |
| Settings plumbing | `composables/useSettingUpdate.ts:20-55` (`updateSetting`, `onSettingUpdate`, `landSettings`); Privacy and Display adopted it | reuse-as-is for Developer |
| Failure toast label | `SETTING_UPDATE_FAILED` (`useSettingUpdate.ts:10`), used by Display and all three Lock sites | done by #779 |
| Explorer name, hero line, hero observer | `explorerDisplayName` (`wallet/constants/explorers.ts:29-31`), `DetailHeroMeta.vue`, `composables/useHeroVisible.ts` | done by #779 |
| Profile-flow notice payload | none: four inline literals; `NotificationItem` type in `stores/notification.store.ts:16-21`. Searched `notificationStore.create`, `Profile creation failed`, `Profile import failed`, `Windows Hello` over `apps` and `packages` | build new: `utils/profile-flow-notices.ts` |
| Dispatching a key through every Vue listener | test-utils `trigger` stamps `_vts = Date.now() + 1` (vue-test-utils 2.4.11, `dist/vue-test-utils.esm-bundler.mjs:7196-7204`); `tests/helpers/press-key.ts` (`pressOn`) dispatches raw events | reuse `trigger` |
| Outline CTA box | `packages/design/src/ui/Button.vue` `cta_outline` (`:356-396`), root `position: relative; overflow: hidden` (`:150-153`), default slot a direct child of the root (`:138`); extension wrapper `components/ui/Button.vue` forwards `$attrs` | reuse-as-is; no new design-package export |

## #735 at HEAD, item by item

| Item | State |
|---|---|
| Row markup, Privacy, Display, Lock | done (#779) |
| Row markup, Developer | hand-written, by design: the toggle loop's inner column carries `justify="center"`, Logs has an id and a failure dot, Account State is a link (`settings/developer/index.vue:139-190`) |
| `.title_size` | left on Developer (`:233-235`, the copy), About (`about.vue:63,172-174`, the "Nulo" heading, not a settings row) and Contracts (`developer/account-state/contracts/index.vue:82,101-103`, 14px) |
| Toast literal | done (#779) |
| Plumbing | Developer's `onSettingUpdate` (`:105-111`) and land (`:114-122`) equal the composable's; Lock's differs on purpose (`lock.vue:85-92`, minutes as a string) |
| Display `.item` CSS | done (#779) |
| Notices | not started; both pairs byte-identical: `onboarding/pages/create.vue:62-75` = `popup/pages/profile/new.vue:74-87`; `onboarding/pages/import.vue:112-124` = `popup/pages/import.vue:138-150`. Callers: `composables/useProfileCreateFlow.ts:95`, `useProfileImportFlow.ts:213`. No test pins a payload |
| Explorer name, hero line, observer | done (#779) |

## #797 trace

- `SettingsSearch.vue:70` listens for `keydown` on its root `Flex`; the field is Input's `<input>`, which has its own Vue `keydown` listener (`packages/design/src/ui/Input.vue:349`).
- Vue's invoker (`@vue/runtime-dom` 3.5.42, `dist/runtime-dom.esm-bundler.js:738-781`): the first Vue listener on the path stamps `e._vts = Date.now()`; each later Vue listener returns without running when `e._vts <= invoker.attached`, its attach time in milliseconds (`getNow()`, cached per microtask).
- So the root's listener runs only when the clock has ticked between the mount and the dispatch. The test mounts with an empty field (no result rows, the fastest mount in the file) and dispatches at once.
- Measured (scratch copy of the suite, never committed), 400 back-to-back mounts on Bun 1.4.2: 141 held Escapes not cancelled, each with stamp minus attach = 0 ms; none at 1 ms or more. With `Date.now` frozen, the held Escape is never cancelled. The committed file passed 15 of 15 runs alone, which is why only CI's loaded runs see it.
- Every other `key()` use in the file that dispatches on the field has the same exposure; the empty-field case is the one whose assertion reads the root's work right after the fastest mount.

## #517 trace

- Drifts, verified: ring `2px dotted` (`components/composite/SecretCountdownClose.vue:82-85`) against Button's `2px solid` (`Button.vue:185-188`); `.cta:active` fill (`:71-75`) shows only without hover, since `.cta_outline:hover` (`:95-99`) comes later at equal specificity; Button's `cta_outline` has no `:active`; transition `0.2s var(--bezier)` (`:65`) against `0.2s ease` (`Button.vue:169`).
- Other differences a pixel proof must clear: Button's root is `display: flex` (the raw button lays the label out inline), `min-height: 40px` and `gap: 8px` from `.medium` (the absolutely placed bar is no flex item), `background-clip: padding-box` (the outline tokens are opaque, `packages/design/src/base.css:55,57,137,139`), `user-select: none`, `tabindex="0"`.
- The dotted ring is the wallet's ring for hand-styled controls (`LegalAcceptanceSheet.vue:175`, `LegalConsent.vue:139`, `SendReviewSheet.vue:197`, `OnboardingBackLink.vue:35`, four more); `Button` is the only solid one.
- Sole consumer: `popup/pages/settings/security/export/seed.vue` (`CollapsingHeroLayout.vue:10` names it in a comment).

## Collisions (open PRs at `7eada4c6`)

- #743 (onboarding-3, draft, CI green): edits `onboarding/pages/create.vue` with a hunk ending on `notifyCreateFailed`'s first line, plus `onboarding/pages/import.vue`, `popup/pages/profile/new.test.ts`, `seed.vue`, `seed.test.ts`. Whichever lands second merges `dev` and keeps both.
- #811 (popup-fixes-1 A1): `seed.vue`'s reveal label and `seed.test.ts`. No file of this lane.
- No open PR edits `SecretCountdownClose.vue`, `settings/developer/index.vue`, `SettingsSearch*` or `useSettingUpdate.ts`.
- `implementations-plan/structure-2/plan.md` arc 3 (Phases 6-7) still schedules #735's notices and Developer; this lane takes them.
- Closed known limits near this work: #736 (a settings change applies twice). Nothing here reopens it.
