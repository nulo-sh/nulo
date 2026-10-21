# execution-integrity-2 · phase 2 (the page, the suites)

- 2026-10-20 · Red check: with `snapshotTransfer`'s `shownFee` forced to `undefined`, the 8 self-paid rows of the Send sweep in `send.integration.test.ts` fail; restored.
- Gate deviations (commands only, recorded in the plan): the smoke suite refuses an unarmed `dist/chrome` and names the build to make; `agent.sh` refuses a selection holding `same-token-concurrent-sends.test.ts` without `NULO_E2E_PROVERLESS=1`.
- `bun run audit:vue` 0 (886 files / 14678 tests, build 1m13s); `bun run test:all` 0; smoke `send-fee-privacy` + `send-keyboard` on Chrome: 2 files / 6 tests, 85 s.
- Network e2e, Chrome, at `7b89da7b` (proverless, retry 0): `same-token-concurrent-sends` + `fee-methods`, 2 files / 24 tests green, 1375 s wall-clock. The queued re-ask case asked, was answered from Home and went out once; the public and private Fee Juice Sends went out with no question.
- Review loop: Codex r1 clean; Opus clean with three low items applied (`96db5421`); Codex r2 clean.
- Network e2e, Firefox, at `96db5421` (the final code head; proverless, retry 0): the same two files, 24/24 green, 1221 s wall-clock.
