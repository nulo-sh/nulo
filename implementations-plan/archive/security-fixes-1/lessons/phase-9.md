# Phase 9 — #25 the note arm gets the public arm's epoch re-checks

- `commitScannedNote` passes `standDown` to `resolveReceiptTrust`, returns on `undefined`, and re-checks the epoch after the trust step; `commitDiscoveredNote` re-checks after the dirty mark and before the `Added` emit, as `commitPublicRecord` does. The overload is gone: both arms supply `standDown`.
- Matrix (`service.scenarios.test.ts`): N1-N5 stand down at the trust read (`000000`, log ends at `getTrust`); N6 and N7 keep `111000` and their `(DRIFT PIN)` (the unfenced `setTrust` await), the log now ending at `pending`; N9 `111100`, N9-trusted `000100`, N10-trusted and N11 `000110` (log ends at the `Added` visibility read); N10 unknown stays `111110` (a bump during the record write itself is unfenced, as public P9). Eleven rows red on be365a9's `service.ts`.
- `bun run lint` (with the complexity baseline check) is clean: the two added `if`s kept `commitScannedNote` under budget.
