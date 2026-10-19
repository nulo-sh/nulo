# Phase 1: P42-05, the re-ask sheet's button

- `submitLabel` returns "Send" for a re-ask; the fee line above already carries the re-asked figure. Unit pin `SendReviewSheet.test.ts`, network pin `same-token-concurrent-sends.test.ts:732`.
- Gate: `bun run lint`, `bun run typecheck:all`, `bun run test` exit 0; `same-token-concurrent-sends.test.ts` (network, proverless, Chrome, retry 0) 16/16, the re-ask test 51.7 s.
