# Phase 1: #1226

- Change: `service.test.ts`'s restore describe gains `afterEach(vi.useRealTimers)` and a helper `firstRegistrationTakes(ms)` that fakes only `Date` and makes the first registration advance it; the PER-LAUNCH case uses 30 ms, a new control uses 5 ms of the same 10 ms budget.
- Red at the base (recon): a 20 ms real delay around `ensureInitialized` gives `expected "vi.fn()" to be called 1 times, but got 0 times`.
- Green on the fix with the same delay injected into both PER-LAUNCH cases: 2/2.
- Mutation: `expired` made true after the first launch whenever a deadline is set; the control goes red (`expected 3 times, got 1`), the 30 ms case stays green. Reverted.
- Gate: `bun run lint` exit 0; `bun run typecheck:all` exit 0; `service.test.ts` 30/30 at retry 0 (37 tests per run, load about 100).
