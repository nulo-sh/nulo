# Phase 3: arc 1208 (duplicate confirm names every profile)

- A test that a list follows `stringCompare` must feed names whose order differs under plain code-unit `sort()` (a lower-case name before an upper-case one), or it passes with the wrong collation.
- `walletErrorFromPayload` passes `details` unvalidated, so the popup reads `existingProfileNames` as untrusted: non-array or non-string entries fall back to the generic words.
- Codex round 1: `clean`. Opus diff review: one accepted (the collation test). Round 2: `clean`.
- Gates at `b931e502e`: `bun run audit:vue` green (944 files, 15971 tests); `bun run test:all` green in every workspace; armed Chrome build, `duplicate-phrase-import.test.ts` 2/2. The test-only fix after it reran its file (30/30).
