# Phase 2: arc 1192 (onboarding phrase countdown)

- A module class that sets a type-role property on the role's own element ties with the role's utility at equal specificity, and no gate sees it across files: `type-role-ban.test.ts` misses cross-file composition and the e2e sweep never visits the phrase step. Put such a property on a child with no role, as the Settings reveal's `close_label` does.
- `pressOn` focuses its target first, so a test that a key lands somewhere after a focus hand-off must press `document.activeElement`, or it passes without the hand-off.
- Signing hung on a stale `SSH_AUTH_SOCK` (the machine profile's known gotcha); `env -u SSH_AUTH_SOCK git commit` signs from the key file.
- Codex round 1: one comment finding, accepted. Opus diff review: four accepted (the type-role tie, a test that did not prove the hand-off, a test name, a stale doc). Round 2: `clean`.
- Gates at `212584dc1`: `bun run audit:vue` green (944 files, 15965 tests); armed Chrome and Firefox builds; `onboarding-tab.test.ts` 7/7 and `keyboard-guards.test.ts` 2/2 on both; `legal-acceptance.test.ts` 14/14 on Chrome at `6ca25aa57`.
