# Phase 8: full gate, review loop, delivery

## Review round 1 (2026-10-15), over phases 1 and 2

- Codex (`run-codex.sh`, gpt-6.1-sol, high, read-only; session `01a141e3`): conditional approve. (1) Accepted, fixed in 84e49ca0: the rename control's shared address and `FRESH` were above the field modulus, so `sameFieldAddress` never matched and the control could not catch a gate that blocks renaming a legacy duplicate; with field-valid addresses a mutation that reads the error outside the `addressChanged` branch now reds it. (2) Pre-existing, outside the arc: the submit button bypasses `submitWaitsForShow` while the list loads, on four popups: known limit #528. (3) Pre-existing, already a BUG PIN: an FPC added during the held read is dropped.
- Opus diff review (`Agent`, opus, general-purpose): approve after one test fix (the same as Codex 1). (2) Same as Codex 2 (#528). (3) A Send-page send the cap refused is filed as `transfer` (`failureKind` has no `TooManyPendingError` arm), so it reads "Stopped before broadcast": a visible change P18-11 does not cover, so OWNER-ASKS OA-5, shipped as is. (4) An `onFpcAdded` row from another network can warn falsely: known limit #529.

## Review round 2 (2026-10-15)

- Codex resume (session `01a141e3`): **approve**. The fixture fix holds (field-valid `OTHER`/`FRESH`, the rename control's rows share `OTHER` through `getFpc` and `getFpcs`); no new material finding, no regression. The loop converged at round 2.
