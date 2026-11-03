# Phase 0: planning consults

## Codex R1 (gpt-6.1-sol, high, read-only), 2026-11-03

Verdict: changes. Four findings, all accepted (the third in part):
1. "Confirm password" moving from 8 px to 12 px above its field is a layout change the signed pick does not name; keep 8 px by grouping the slotted heading with its field inside the pair, the default `labelRepeat` heading at 12 px. Adopted (D5).
2. `audit:vue`'s plain build fails the smoke setup's armed-build check, and Firefox is not rebuilt: build each browser armed and run with the smoke flags. Adopted in the arc-end gate.
3. Holdings' shared module-level config events reach pages earlier cases left mounted: make them per client. Adopted; the first-connect announcement stays on the first `getValue`, which Codex called allowed.
4. The base has no eye, so no "revealed" capture exists before the change. Adopted: the base captures empty and typed (masked).

## Opus Plan lens (opus), 2026-11-03

Verdict: conditional approve. Accepted: Fact 6 corrected (`registration.test.ts` drives New profile); one key per Holdings pin with the other key landing, an unrelated-key control in BalanceView, parked reads that capture the value at call time; the explicit import in `create.vue` (the test mount registers no component resolver); the cleared-hint pin's success control; keep the `test.each`'s `isAllowedToContinue` half and fix the hook's header line; a separate handle for BalanceView's config `onConnected`; the callers' tests in the Phase 2 gate. Rejected: a test for a forgotten `dispose()` (D8: a disconnected client never announces again); the gap prop or owner question for the heading gap (the group keeps 8 px with neither).

## Codex R2 (resumed), 2026-11-03

Verdict: conditional approve. Both findings accepted: the Phase 2 captures need the armed Chrome build before the arc end (each revision builds its own); Delivery still named the superseded 12 px. Verified the confirm-field column changes no caller's layout or tests, the gate list, D8.

## Codex R3 (resumed), 2026-11-03

Verdict: approve. Both R2 fixes verified; no regression.
