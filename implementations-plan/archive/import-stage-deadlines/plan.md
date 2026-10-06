# Import stage timing and console-capture truth in the e2e suite

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a stage-aware wait inside `importFullBackup` in `apps/extension/tests/e2e/helpers/import-drivers.ts`, the pure timing helpers in `apps/extension/tests/e2e/helpers/import-stage-timing.ts` with `apps/extension/tests/e2e/import-stage-timing.test.ts`, and the console-capture mechanism written into `.claude/skills/e2e-testing/SKILL.md`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

This is a named arc of the e2e flake-reduction programme; the programme's record is [e2e-deflake](../e2e-deflake/plan.md).

## Decision

Two open flake-ledger entries were closed.

- **Backup-import 300-second lapse.** Measure the import's per-stage envelopes in both proving modes, then classify. The classification produced no stage that warrants an early-fail window, so no stage deadline and no early exit shipped. The fixed 300-second wait stays the only overall criterion, and a lapse now explains itself.
- **Console-error blind spot.** Root-cause it and document it as permanent by design. No tap on the service worker's console was added.

## Why

The settled design granted an early-fail window only to a stage with a product-owned deadline. The one candidate, chain sync, has a 45-second budget whose designed overruns degrade to skip records and still reach `finished`, so a deadline mirrored in the test would only add a false-fire surface. A regression there already reds the unchanged 300 seconds. Reacting to the import's terminal failure screens was ruled out as outside that spec, its coverage would be incomplete, and a partial-success screen with a Continue button would be misclassified as failure.

The console gap has a simple cause: the sniffer's success path never invokes the native page console, because ordinary app logging is forwarded over RPC to the service worker's realm. Browser-emitted entries and uncaught errors do reach the e2e capture.

## What shipped

- The pick-file, password and submit half of the import driver became an exported `submitFullBackupImport`, and the crash-truth helper delegates to it. The `importFullBackup` signature and its consumers are unchanged, and no existing timeout was raised.
- A page-side `MutationObserver` on the restore-stage attribute is armed before submit and read once when the wait settles, on one page clock. The success route is a hash route, so the page and its buffer survive success.
- On a lapse, the error carries the full stage trajectory and a label: a failure-terminal stage, the Continue-gated screen (degraded partial success, not failure) or finished-but-not-activated. A new 10-second bound caps the post-settle read so a wedged renderer cannot swallow the diagnostic.
- With `NULO_E2E_STAGE_LOG=1`, each import writes one JSONL record per test-file fork and nothing is written otherwise. A stage that rendered within one turn is reported unobserved, never as zero milliseconds, and a timeout marks the last stage right-censored.
- The measured envelopes were healthy solo-run baselines, stratified by scenario. They are not a CI tail estimate, and nothing derives a deadline from them. The import wait was certified green three times in a row solo with retries off.
- Residuals of the console capture. The skill records the first, second and fourth:
  - An error that the app catches and logs is invisible on both channels.
  - The service worker's log trail is delayed and bounded by a two-second persistence debounce.
  - Entries logged before wiring completes replay through whichever method fires first, so severity can be wrong, and they are lost if wiring never finishes.
  - Approval windows carry no listeners.
  - Per-page capture arrays reset.
- Terminal-failure early exit stays an option only through a deliberate amendment of the flake design, not through this arc.
