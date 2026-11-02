# Phase 1: the meter and the hint

- Locked versions match the reviewed ones (core 4.2.0, language-common 4.1.3, language-en 4.1.1, dictionary-compression 3.0.1, fastest-levenshtein 1.0.16); `language-en`'s shipped code scanned clean like the other four.
- `MIN_NEW_PASSWORD_LENGTH` exported beside `isNewPasswordValid` so the hint module does not repeat the literal 8.
- Every hint pin outside `password-hint.test.ts` reads `NEW_PASSWORD_HINTS`, so a wording change edits one test.
- Red against base: with the base `newPasswordHint` swapped in, 31 of the new or changed cases fail; the set pin and the strong and short controls pass, as they should.
- Gate: lint 0; typecheck:all 0; targeted vitest 67 files, 1413 tests at retry 0 (the chaos model's 266 citations included).
