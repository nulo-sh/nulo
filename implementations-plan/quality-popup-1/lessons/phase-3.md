# Phase 3: onboarding import refuses a repeat Enter

- Pin first in `onboarding/pages/import.test.ts`: on Decrypt backup, Import profile and Continue, a repeat Enter keydown is prevented and a fresh one is not. Red before the guard (3 failed, `expected false to be true`), green after.
- The guard is `@keydown.enter="refuseRepeatEnter"` on the three buttons, imported from `@/composables/usePopupEntity` as the popup's import page does. No testid, copy or layout changed.
- Gate: the onboarding import test file at retry 0 (39 passed), lint, `typecheck:all`.
