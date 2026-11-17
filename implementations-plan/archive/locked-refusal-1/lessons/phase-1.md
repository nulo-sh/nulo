# Phase 1: build and gates

- Red before: with `error-envelope.ts`, `wallet-message.ts` and `wallet-locked-error.ts` from `33906a052` and the new tests, both new cases fail (`WalletLockedError → {code:4900 …}` and `answers WALLET_LOCKED with the call's trace id …`); with only `wallet-message.ts` reverted, the trace case fails on the log level. Green after.
- Gates at `081ca99e3`, retry 0, in order: `bun run lint` (one format fix in the e2e file first), `typecheck:all`, `bun run test` (1045 files, 18600 tests), `test:components` (104 files, 1499 tests), all exit 0. `e2e:agent tests/e2e/network/wallet-locked-mid-session.test.ts`, Chrome: 1 passed, the test 12.4 s, about 99 s with the build and sandbox.
- Codex pass (gpt-6.1-sol, high, read-only, session `01a1eb5c`): `approve`, three low comment findings taken (plan § Audit verdicts). The fixes touch comments only; biome and the two unit files rerun green on that head, and CI's lanes certify the final head.
- Known limit filed and closed: #1841 (D8).
