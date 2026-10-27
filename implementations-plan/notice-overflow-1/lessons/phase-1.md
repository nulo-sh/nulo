# notice-overflow-1: phase 1 log

- 2026-10-27. The new source-scan case failed on the base copy (1 failed, 27 passed) and passed with the rule (28). `audit:vue` green (942 files, 15932 tests), `test:all` green, armed Chrome build, smoke `import-errors-scroll.test.ts` green at retry 0 (4 tests, 56 s).
- The after capture ran on the arc's armed build: the 90-character name stays inside the card in both shells (popup 324 / 324, card 222 px tall; onboarding 480 / 480); `Local Network` and the ten `createFailedNotice` measurements match the base's to the pixel.
- The plan commit hung once at signing with the SSH agent; `env -u SSH_AUTH_SOCK git commit` with the message from a file and stdin closed went through (as the common brief says).
