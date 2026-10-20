# Phase 4: composition and e2e

- Composition: the not-listed control (`Insufficient fee payer balance`) stays "Not confirmed yet" after a Dropped read; an `Existing nullifier` refusal reads refused on a Dropped read, then Sent once mined. 3/3, run three times.
- Smoke `send-outcome-rows`: the refused row is the newest seed, so Home's five-row budget now drops the raw-token row (still checked on History and its page).
- Attempt 1 failed: opening one journal page from another by hash leaves the first record on screen. The page reads its record once, at mount (`[id].vue` `onMounted` → `loadOp`), and no user path links journal to journal, so the spec returns to History between the two pages. Not a product change.
- Smoke wall-clock, retry 0, one run each, no shots: Chrome 19.6 s → 17.8 s, Firefox 29.9 s → 28.8 s (the added step is under the run-to-run noise).
- Network: `failed-send-check.test.ts` gates on `NULO_E2E_PROVERLESS=1`; `agent.sh` refuses the run without it. `wait-for-tx-mined.test.ts` + `failed-send-check.test.ts`, Chrome, retry 0: 5 passed, 625 s wall (boot included). The resend of the mined mint threw a text `isFinalRefusal` accepts on the real rc.3 node; the mint test took 5.1 s.
- Gate F: lint 0, typecheck:all 0, test 0 (14659 passed).
