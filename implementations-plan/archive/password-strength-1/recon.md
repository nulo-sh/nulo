# password-strength-1 recon

Base: `origin/dev` at `3af5f7840`. One Explore agent (sonnet) swept the repo; the planner verified each row below against the tree and probed the candidate library in a scratch directory outside the repo.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Grapheme count | `apps/extension/src/utils/password.ts:2-7`, module-private `characterCount` (the only `Intl.Segmenter` in `apps/`, `packages/`, `infra/`) | reuse: export it |
| Acceptance rule | `isNewPasswordValid`, `password.ts:9-11`; also imported by `wallet/services/profile/service.ts:4` and `wallet/services/account/service.ts:22` | reuse as is, untouched |
| Hint text | `newPasswordHint`, `password.ts:14-20`, length only | adapt: move to a UI-only module and add the meter |
| Repeat, sequence, keyboard, common-password, entropy logic | none. Searched `zxcvbn\|entropy\|passwordStrength\|password-strength\|common-password\|qwerty` over `*.ts`, `*.vue`, `package.json`, `bun.lock`; the `entropy` hits are the recovery phrase's | build new or add a library (D1) |
| Estimator library | none installed (`zxcvbn` absent from every `package.json` and `bun.lock`) | add `@zxcvbn-ts/core` + `@zxcvbn-ts/language-common` (D1) |
| Licence gate | `packages/third-party-notices/src/policy.ts:63-74` (`ALLOWED`: MIT and nine more); licence file match `packages.ts:26` (`LICENSE.txt`, `LICENSE.md` match) | reuse; no policy edit |
| Bundle split | `vite-plugin-pages` routes are lazy chunks; `scripts/vendor-chunks.ts` groups only the Aztec stack; `scripts/parse-limit-guard.ts` fails a file of 4.5 MiB or more | reuse; no config edit |
| Copy bans | `utils/copy-dash-ban.test.ts` scans string literals in `utils/`; `utils/red-text-ban.test.ts` scans `.vue`/`.css` | reuse; new strings carry no em dash, no colour changes |
| Logging | nothing in `password.ts` logs; `wallet/logger/utils.ts` redacts `password` by key only | reuse; the meter logs nothing |

## Surfaces that render `newPasswordHint` (seven, not two)

The issue and the lane brief name Create profile and Change password. The function is shared; these all render it, each as `<Text variant="body">` in the field's existing hint place, `color="tertiary"` (onboarding: `secondary`), never red:

| Surface | File | Existing pin on the hint |
|---|---|---|
| Create profile, first run | `onboarding/pages/create.vue:238` via `useProfileCreateFlow.ts:105` | `useProfileCreateFlow.test.ts:348-359` |
| Create profile, later profiles | `popup/components/modules/settings/new-profile/NewProfileCredentials.vue:43` | `NewProfileCredentials.test.ts:15,52` |
| Change password | `popup/pages/settings/security/change-password.vue:62,199` | none |
| Unlock method, passkey to password | `popup/pages/settings/security/unlock-method.vue:58,328` | `unlock-method.test.ts:274-281` |
| Import secret (new profile password) | `components/composite/import/ImportSecretForm.vue:33,103` | none |
| Import full backup (new profile password) | `components/composite/import/ImportFullBackupForm.vue:48,166` | none |
| File password (account export, full backup export) | `components/composite/FilePasswordSection.vue:18,44` | `FilePasswordSection.test.ts:54-61`; `full-passkey.pins.test.ts:473-475,489` |

`password.test.ts:41-48` pins eight repeated emoji, eight repeated `é` and thirteen `é` as "Strong password": the repeat case this lane changes.

## Smoke e2e

No e2e asserts the hint. `tests/e2e/registration.test.ts` (popup create, `TEST_PASSWORD = "TestPassword123!"`), `tests/e2e/onboarding-tab.test.ts` (first-run create, `"OnboardingTest_!23"`) and `tests/e2e/security.test.ts` (change password) drive the forms; each enables submit on an 8+ matching pair, which the advisory meter leaves as is.

## Library probe (scratch directory outside the repo; Bun 1.4.2)

- `@zxcvbn-ts/core` 4.2.0 (published 2026-08-12, MIT, `LICENSE.txt`; depends on `fastest-levenshtein` 1.0.16, MIT, `LICENSE.md`, 2022). `@zxcvbn-ts/language-common` 4.1.3 (2026-07-16, MIT, `LICENSE.txt`, `sideEffects: false`; depends on `@zxcvbn-ts/dictionary-compression` 3.0.1, MIT, `LICENSE`, 2025-01-02). All four are older than the 7-day gate. No `fetch`, `eval` or dynamic import in core's ESM.
- Size before minification: core ESM 103 kB, language-common ESM 429 kB (380 kB is the compressed common-password list). `@zxcvbn-ts/language-en` (5.4 MB unpacked) is not needed.
- Score (`0-4`), log10 guesses, warning key:

| Value | Score | log10 | Warning |
|---|---|---|---|
| `aaaaaaaa` | 0 | 2.0 | `simpleRepeat` |
| `12345678` | 0 | 0.6 | `topTen` |
| `qwertyuiop` | 0 | 1.4 | `topHundred` |
| `abcdefghij` | 0 | 1.6 | `sequences` |
| `zxcvbnm,./` | 1 | 3.6 | `straightRow` |
| 12 × `😀` | 1 | 3.1 | `extendedRepeat` |
| 12 different emoji | 4 | 24.0 | none |
| `Password1!` | 1 | 4.3 | `similarToCommon` |
| `longenough` | 2 | 7.7 | none |
| `xK9#mQ2v` | 2 | 8.0 | none |
| `TestPassword123!` | 3 | 8.1 | none |
| `correct horse battery staple` | 4 | 19.7 | none |
| `blue7Kettle!` | 4 | 10.7 | none |
| `silver-otter-lamp` | 4 | 13.1 | none |
| `йцукенгшщзх` (Russian row) | 4 | 11.0 | none |
| `contraseña` | 3 | 8.2 | none |

- Speed: the factory builds in about 20 ms; a check takes 0.7-2.3 ms for 16-28 characters, about 12 ms for 64 and 29-76 ms for 128; a new factory plus one check, 6-23 ms on realistic values.
- Shipped code of all four packages: no network, storage, messaging, DOM, `eval` or dynamic import; one `console.info` in core's `addMatcher` (a matcher name). Core keeps the last checked password in `scoring/index.mjs:161`.
- `@zxcvbn-ts/language-en` 4.1.1 adds 1.2 MB of ESM; with it the factory takes 57 ms and a 128-unit check 225-320 ms, and 15 realistic word and name passwords keep their band (only `longenough` moves, 2 to 1, weak either way).
- The common list has 49 233 entries, all ASCII; the keyboard graphs are Latin layouts and keypads.
- Score bands (`TimeEstimates.mjs`): 0 < 10^3, 1 < 10^6, 2 < 10^8, 3 < 10^10, 4 at 10^10 and above (each `+ 5`). Default `translations` are the keys (`Options.mjs:19`), so `feedback.warning` is a key such as `simpleRepeat`.

## Collisions

None open. `gh issue list --state all --search "password strength"`: #1401 (this lane) and #1391 (closed, the grapheme count). No closed `known-limit` on the meter.

## Final configuration probe

Common dictionary plus `language-en`'s `commonWords-en`, `timeEstimationValues.scoring` at `{0: 1e3, 1: 1e6, 2: 1e10, 3: 1e12}` (B) or the library default (A). `log10` / A tier / B tier and warning:

| Value | log10 | A | B, warning |
|---|---|---|---|
| `congratulations` | 3.1 (15.0 without the English list) | weak | weak, none |
| `TestPassword123!` | 8.1 | good | weak, `similarToCommon` |
| `kettle-violet` | 8.8 | good | weak, none |
| `xK9#mQ2vxK9#mQ2v` | 8.3 | good | weak, `extendedRepeat` |
| `blue7Kettle!` | 10.7 | strong | good |
| `maple.river.42` | 12.5 | strong | strong |
| `йцукенгшщзх` | 11.0 | strong | good |
| `contraseña123` | 10.2 | strong | good |

Adding Wikipedia and name lists: factory about 100 ms, 350-510 ms per 128-unit check, no band change on the probe set. `language-en` imports in 42 ms (all lists), its `commonWords` file alone in 24 ms. `language-en` ships `NOTICE.md`: `commonWords` is OpenSubtitles 2024 data under ODC-BY.

