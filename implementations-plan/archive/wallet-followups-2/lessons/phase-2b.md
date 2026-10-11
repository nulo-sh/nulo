# Phase 2b: every log line under the service that owns it

## 2026-10-11: implementation

- Scan first: `useLogFilters.scan.test.ts` A (every source resolves to a row) and all 22 B rows failed on the tree before any source edit; C (the resolver self-test) passed.
- Applied the per-source mechanisms of plan § OA-1 (a). Signature changes rippled to 18 `NuloAccount` sites in tests and e2e fixtures, the ticker's and the telemetry sink's tests, and the queue and projector constructions; a bulk edit also rewrote one doc comment in `tests/e2e/fixtures/aztec.ts`, reverted by hand.
- `price/service.test.ts` spied on the deleted private `log` helper; it now spies on `logWarn`, the base method that replaced it.
- Behavioural pins against the base sources (queued-journal, seeder, the offscreen client, telemetry and base client swapped in from HEAD, then restored from saved copies): `queued-journal.test.ts` 3 failures, `seeder.status.test.ts` 1, `offscreen/client.test.ts` 1.
- The account KAT and freeze tests changed only by the new `logSource` argument: no vector, hash or pin edit, and they pass.
- Gate: scan 27/27; targeted suites 2,251 pass; `test:all` exit 0; lint 0; typecheck:all 0.
- Shell gotcha: zsh does not word-split an unquoted `$VAR`, so a space-joined file list loops once over the whole string; use an array.
