# Phase 1-2 (arc 1): the backup screens

## Build

- T1-T5 and the pins test's ports went red on the base code (105 cases), then green after D2-D7.
- `profile-chaos-model.test.ts` pins three line numbers in `useFullBackupExport.ts` (`tests/e2e/helpers/profile-chaos/model.ts`, `cite(EXPORT, …)`); any edit above them reds `audit:vue` until the citations move. They moved twice in this arc.
- A stub component that declares its props as an array receives a bare boolean attribute as `""`; declare `{ flag: Boolean }` to read it as `true`.
- The download capture (`tests/e2e/helpers/download-capture.ts`) times out from its arming. With one press sealing before it saves, the full-backup helpers arm it with `withinMs: 90_000`, the old flow's 60 s seal wait plus its 30 s capture.

## Review, round 1

- **Codex, gpt-6.1-sol, high, read-only** (session `01a19d82-39ff-7db1-ac24-a5818ea0f50a`): **approve**. Traced the fence through every reset path; confirmed `useFullBackupExport.test.ts`'s stale-press case reds without the outer check. Three comment findings (a stale "Protect with Password", a stale plaintext-download line in `runEncrypt`, two narrating comments), all applied.
- **Opus 5.5, general-purpose**: conditional approve. Applied: a per-warning case for the "Backup" label rule (mutation-checked: dropping one term of `showsBackupBanner` reds its row), a corrected comment on what stops a second same-tick press, the file-accept example name. Rejected: an owner ask for the password profile's ready state with no warning (reading R1, settled by the panel; the PR shows and names its picture); collapsing the bottom slot's one-child `Flex` (no visible effect, churn on a signed surface); a narrow-fit e2e for the retry state (its banner and button label are narrow-checked in the finished and saved states; the PR adds its picture).

## Arc 2 (2026-11-03)

- **A spec edited during a run changes the run.** Vitest loads each e2e file when it starts it, so editing a spec mid-run made the base timing run execute head assertions against the base bundle. Held the three edited specs aside (restored from `HEAD`) until both base runs finished, then put them back.
- **A component the test does not resolve cannot be found by name.** `findComponent({ name: "Tooltip" })` passed with the Tooltip restored, because the auth test mounts without the auto-import resolver and `<Tooltip>` stayed an unknown element. A named stub (`Tooltip: { name: "Tooltip", ... }`) makes the absence meaningful; checked both ways.
- **A default parameter swallows `undefined`.** `mountChecks(undefined)` mounted with the default profile; the no-profile case passes `null`.
- **`vi.getTimerCount()` counts every fake timer**, not the page's own: spy on `setTimeout` for the 500 ms call and assert `clearTimeout` receives its id at unmount.
- **Codex** (gpt-6.1-sol, high, read-only; session `01a1a22d-2b3c-7532-b3cc-71b9bd6eec6c`): round 1 approve with two cleanups; round 2 conditional (the Tooltip assertion, reproduced in memory and here); round 3 approve. **Opus 5.5** beside round 1: conditional approve, four test findings folded.

## Arc 2 runs (retry 0)

Arc 1's runs are in #1559's body.

- **Base `67c1ac545`.** T4, T6-T12 red (29). Network files (`connect-check-window`, `connect-dapp`, `session-reconnect`, `cap-window`, `cap-chain-mismatch`, through `e2e:agent`): Chrome 13 tests, 136.1 s of tests in the touched files; Firefox 10 passed and 1 skipped, wall 242 s. Touched smoke files (`auth-flows`, `tooltips-glossary`, `security`, `security-reset`, `imported-account-lifecycle`, `account-import-export`, `type-roles`; 37 tests, armed build): Chrome 283.6 s, Firefox 439.0 s.
- **Head.** Network files: Chrome 146.6 s, Firefox wall 320 s (beside a review agent's unit runs). Touched smoke files: Chrome 370.4 s (beside a Codex session), Firefox 512 s.
- **Armed chaos.** Chrome seeds 1-10: `changePassword` committed in seed 9, `deleteProfile` via the lock screen's link in seeds 1, 3, 7 and 8. Firefox seeds 1-5: `changePassword` committed and a wrong one refused in seed 2, `deleteProfile` via the link in seeds 4 and 5. Seeds 1-5 on Chrome drew no `changePassword`, hence 6-10.
- **After merging `dev` (`c2257be7f`).** Lint, `typecheck:all`; the vitest list plus `wallet-sdk`, `window-manager` and the chaos model (70 files, 1597 tests); `test:all` 159 s; `audit:vue` 163 s. Full smoke: Chrome 1709 s (62 files, 275 tests; arc 1 1850 s), Firefox 2649 s (66 files, 279 tests; arc 1 2791 s).
- **After merging `dev` again (`67cf73b0b`; #1621 wraps `NewPasswordPair`'s repeat field, `labelRepeat` kept).** Lint, `typecheck:all`; the vitest list with `NewPasswordPair.test.ts` (71 files, 1617 tests); `test:all` 170 s; `audit:vue` 163 s. Touched smoke files, armed: Chrome 279 s, Firefox 409 s.
- **`audit:vue` rebuilds `dist/chrome` without the e2e flags,** so an armed suite after it runs on the wrong bundle: rebuild armed first.
