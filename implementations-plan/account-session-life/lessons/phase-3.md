# Arc 3: lessons

## Start (2026-10-14)

- Base: `origin/dev` at the branch point of `account-session-life-arc-3` (D-orch-4). Facts re-checked there: F14 holds (`ToastOptions.sub`, `packages/design/src/composables/toast.ts`); F15 holds for `change-password.vue` (one `isPasswordType` drives all three fields, and both eyes already exist, each negating that one flag); F16 holds (SECURITY.md § Session secret (password profiles), item 5). The `auth.vue` failure ladder still ends with a passkey-only toast, so a password unlock with an unlisted error fell through silently.
- Page 7 signed 2026-10-14 17:42Z. backup-import-export arc 3 has not merged (#418 is its arc 2, open), so Phase 3.4 is deferred (D-orch-7).

## Phase 3.1: #24

- Closed as not planned with a comment quoting P7-01, its date and SECURITY.md § Session secret (password profiles) item 5, plus a reopening condition. No code.

## Phase 3.2: the unlock toast

- The passkey rung now returns after its toast, and the ladder ends with `{ kind: "error", label: "Something went wrong", sub: "Try unlocking again." }`. The error's text never reaches the toast.
- Unit: the new proof (an unlisted error from `unlockProfile` shows exactly that toast, once, and the latch releases) fails on the base `auth.vue`. Guards already present in `auth.test.ts`, each asserting no toast or a different one: wrong password, bootstrap failure, the lost-race timeout, the passkey generic line and the passkey cancel. The torn-import case gained the missing no-toast assertion. A `UserRejectedError` from a password unlock is not reachable (`unlockProfile` throws none), so its guard stays the passkey cancel case.
- E2E (`auth-flows.test.ts`, per-test fixture because it breaks the profile row): the row's embedded `id` is moved off its storage key, which the key-identity guard hides (`EntityStorage` `requireKeyIdentityMatch`), so the unlock throws "Invalid profile id", a plain error no rung names. Failure mode: the toast must render over the real lock screen and the real button must come back; the component test stubs both. Estimated 10 s; measured 6.9 to 7.1 s on Chrome, 10.7 s on Firefox.
- A screenshot taken right after the toast appears catches its fade-in; `settleThemeTransitions` before `shotSend`, as `send-outcome-rows.test.ts` does.

## Phase 3.3: the split reveal

- `change-password.vue` had both eyes already, each negating the one `isPasswordType`. Two flags now: `isCurrentPasswordHidden` drives the current field and its eye, `isNewPasswordHidden` the new field, its confirmation and the second eye. Test ids, the eyes' `tabindex="-1"` (`PasswordVisibilityToggle`) and every word stay.
- `change-password.test.ts`: the old `test.each` pinned that either eye masks all three fields together. It became two cases on the shared `expectMaskToggle` helper, whose `others` list asserts the fields an eye must leave alone: the current eye drives the current field only, the new eye the pair only. Both fail on the base copy (the new pair, or the current field, flips with the wrong eye) and pass now. No e2e case is added: the component test proves the split, and `security.test.ts` guards the page's flows on both browsers.
- Screenshots: a throwaway spec outside the repo, run with `vitest --config vitest.e2e.config.ts --dir <scratch>` and absolute imports of the repo's fixtures, drives the page and calls `shotSend`. The before shots come from the build carrying the base copy.

## Arc 3 review

- Codex round 1 (session `01a13b93-9f54-7221-b3c1-0e543b35f333`, on the alejo-icloud account that `best` picked): APPROVE with one Low (the passkey rung's `return` unguarded) and two Comments (a stale test count, accepted; the two-flag comment, rejected). Opus: CHANGES, the same two plus a Low that became OWNER-ASKS OA-6 (the error toast outlives a successful retry). Fixed in a71acaea.
- A guard that a branch returns needs a call count: `toHaveBeenCalledWith` passes when any one call matches, so a fall-through that adds a second toast stays green.
