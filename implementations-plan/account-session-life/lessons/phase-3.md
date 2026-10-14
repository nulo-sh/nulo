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
