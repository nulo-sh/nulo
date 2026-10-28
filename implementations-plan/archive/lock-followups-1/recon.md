# Recon: lock-followups-1

Read at `origin/dev` 210d02f1f by one Sonnet reuse sweep plus the planner's own trace. Paths are relative to `apps/extension/` unless they start with `implementations-plan/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A selection held by reference across an await | `src/popup/pages/auth.vue:259,280-286` (`settled`); no shared helper (searched `!== settled`, `profile !==`, `profile ===`, `\.profile = ` over `src`) | superseded: an activation's same-id write defeats it for `followPick` (plan D1); `settled` stays as it is |
| Knowing a pointer event arrived during a read | `follows` already counts every event before any early return (`auth.vue:279-282`) | reuse; add the newest event's id |
| Moving focus to a design `Button` | `export/full.vue:42,133-137,358-361`, `export/account.vue:355-359,549-552` (`useTemplateRef(...).value?.$el?.focus()`); `HandoffCard.vue:15` | reuse as-is |
| Refusing a held Enter on a control a key's handler focused | `src/composables/usePopupEntity.ts:7` `refuseRepeatEnter`; on Close in both export pages, on "Do it later" in `OnboardingPhraseStep.vue:105` | reuse as-is |
| Deferred reads and other windows' writes in a page test | `auth.test.ts:50-64` (`elsewhere`), `:411-428`, `:653-697` | reuse as-is |
| Pressing a key as a browser does | `tests/helpers/press-key.ts` `pressOn`; the onboarding hand-off tests `OnboardingPhraseStep.test.ts:65-85` | reuse as-is; mount with `attachTo: document.body`, as `DisableAutoCloseLink.test.ts:12` does |

Nothing is built new.

## Claims checked

- **Writers of `appStore.profile`** with the selected id while the lock screen is mounted: the chooser (`popup/components/popups/SelectProfilePopup.vue:60`), the settle (`auth.vue:258`, marked `settled`), and an activation (`composables/useProfileBootstrap.ts:248`), which can begin and end inside one follow lookup; this last point, missed here at first, is why the plan's D1 rejects an object comparison. `:290` is Import's path. Of the rest: the shell and the route guard replace only a selection that is gone or empty (`popup/locked-state.ts:49-53`, `popup/route-guard.ts:84`, `popup/app.vue:435,453` after `popup/lock-landing.ts:62,86`); New profile runs on its own route (`popup/pages/profile/new-profile-helpers.ts:109`); a rename runs from Settings › Profile, an auth-required page (`popup/components/popups/EditProfilePopup.vue:88`, opened only by `popup/pages/settings/profile/index.vue:25`); Delete clears to `undefined` (`popup/pages/settings/security/reset.vue:227`).
- **Pointer listeners**: only `auth.vue:290` follows `onLastActiveProfileChanged` (`src/utils/lastActiveProfile.ts:21-29`). The route guard and the shell's boot helpers read the pointer but listen to nothing, so no other screen has the settle's race.
- **Line citations**: `tests/e2e/helpers/profile-chaos/model.ts:354` cites `src/popup/pages/auth.vue:382` (`data-testid="auth-delete-retired"`), checked by `profile-chaos-model.test.ts`. Nothing cites `SecretCountdownClose.vue` by line.
- **Consumers**: `SecretCountdownClose.vue` only in `popup/pages/settings/security/export/seed.vue:251`; `DisableAutoCloseLink.vue` there and in `onboarding/components/OnboardingPhraseStep.vue:110`. `seed.test.ts` stubs the composite. No e2e presses `disable-auto-close-btn`; `tests/e2e/security-backup.test.ts:82` presses `close-btn`, and `tests/e2e/keyboard-guards.test.ts:85` holds Enter on the same page's Reveal.
- **Test conventions**: the follow block's titles are full sentences ("a selection made here while another window's pick loads stands"); `SecretCountdownClose.test.ts` mounts the real `Button` without `attachTo`, so the new focus cases add it and unmount after.
- **Closed known limits** searched with "lock screen pick" and "auto-close focus": none in this area before this plan filed #1315. Related closed issues: #1192 (the onboarding countdown, shipped with the hand-off), #517 (the composite's styles).
