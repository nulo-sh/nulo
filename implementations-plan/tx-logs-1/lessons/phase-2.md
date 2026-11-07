# Phase 2: the capture

- **Deviation, `begin`.** `begin(walletTraceId, meta)` records a capture under an id the ingress mints with `randomIdNotIn(id => requests.has(id), 8)`, instead of minting the id itself. That keeps one mint path when no capture store is wired (tests) and changes nothing a caller sees.
- **Found while testing:** `chainInfoToChainId` throws `InvalidWalletArgumentsError` on a malformed `chainInfo`. Reading it at arrival, outside the handler's `try`, would have thrown out of `onWalletMessage` before the slot was admitted. `chainIdOf` records `-1` instead, and the handler still answers its typed -32602 (`wallet-message.trace.test.ts`).
- **Write cost:** the flush rewrites `nulo:request-logs` only when a capture changed since the last write (`requestsDirty`), since up to 50 × 64 KB would otherwise be rewritten on every log line's flush.
- **Pinned line numbers:** `tests/e2e/helpers/profile-chaos/model.ts` cites `background.ts` by line (`DAPP_QUEUE`); the two lines `background.ts` gained moved it from 373 to 375.
- The estimate and preview stages are proven at the producer (`service.refusal.test.ts`), and the prove phases at the coordinator (`execution-coordinator.prove-phase.test.ts`). The reach test (`request-captures.reach.test.ts`) drives the real `TaskService` and the runtime's wiring, with a journal stub that emits the queued row before the alias.

# Phase 3: the report

- The golden (`request-report.golden.txt`) was written by hand from the OA-2 template, not generated from the code, and the code matched it on the first run.
- **Deviation:** the timeline is sorted by start, ties kept in arrival order. Stages are appended when they finish, so the request's own stage, which opens first and closes last, would otherwise read last.

# Phase 4: the buttons

- **Found in the pictures:** `Button`'s `left-icon` is absolutely positioned for wide buttons and overlapped the label of a small chip; nothing else in the extension uses it. The glyph is an `Icon` inside the slot, spaced by the wrapper's flex gap.
- **Found at retry 0:** a popup opened right after the connect fixture can still be routing when `setDeveloperMode` navigates to Settings, and the toggle never shows. The test waits for `#/popup/general` first, as the other network tests that turn developer mode on do.
- The pictures came from one run of the scope-refusal e2e with `NULO_E2E_SHOT_DIR` set, a temporary runtime switch between the three looks and temporary shot steps, all reverted. The History file of that run holds one log line, the ingress's debug failure line; the refusal itself shows as the `fee estimate` stage. Without Debug Mode that file would hold no line (OA-2 says so).

# Review loop, round 1

- Codex round 1 rejected with seven local findings, and the Opus review found the burst eviction. All were folded with a test each that fails on the pre-fix code (checked by swapping the five pre-fix sources back in: 9 of the new tests failed, all passed after). The plan's audit verdicts list them.
- **Round 1's prompt left out the standard's two verbatim rules and its adversarial question**; round 2 carries them.
- **Held sends.** `makeRoom` holds a send past the cap instead of evicting at `begin`, and `settle` evicts when the journal alias lands. The cap counts captures that are not held sends, so two held sends aliasing one after the other evict one each, and a held send refused before any row evicts nothing.
