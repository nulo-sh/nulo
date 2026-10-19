# execute-window-2: arc 1, phases 1 and 2

## Phase 1 (worker)

- T1 (`dapp-interaction/service.test.ts`), T2 (`execution/service.refusal.test.ts`) and T3 (`wallet-sdk/queued-journal.test.ts`) green; T1 checked against a copy with D1's substitution and D7's guard removed: its two refusal tests go red.
- The Phase 1 vitest filter (`execution/service`) missed two prototype-called fakes of `InteractionOperationSource` (`dapp-send-executor.test.ts`, `estimate-hold.integration.test.ts`); `audit:vue` caught them in Phase 2 (`source.refusalOf is not a function`). Fix: the fakes implement the two new methods. Lesson: a seam method added to an interface needs a repo-wide search for its fakes, not a path filter.

## Phase 2 (window)

- `approve()` crossed the cognitive-complexity ceiling (16 > 15) once the catch learned the refusal; the catch moved into `showApprovalFailure`, no directive.
- T4 and T5: all five new tests red on the base copies of `index.vue` and `DappApprovalFooter.vue`; the generic-error control passes on both.
- Gate: `audit:vue` exit 0 (856 files passed, build done); `test:all` exit 0 (15 workspaces).
- **Host-load breach**: the second `audit:vue` started at load1 235, above the 150 limit; the check printed the load but did not gate on it. Every later build and e2e run waits in a bounded loop until load1 < 150.
