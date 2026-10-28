# Phase 1: the pre-update start from every release (#1313)

## 2026-10-28 · Implementation

- The model's unit test first asserted that every `unlockPasskey` open of `P2` used `K1`; it red because `changeUnlockMethod` legitimately gives `P2` a new credential before a later open. The test now asserts that some open uses `K1`.
- v1.1.0's `profile-row.ts` is identical to the base's, so `checkProfiles` at the start reads the release's passkey row against today's field set.

## 2026-10-28 · Gate at `a0d3cae52` (Chrome 155, Firefox 153.0.4, candidates 1.1.0.1, retry 0)

Fast gates: `bun run lint` exit 0; `bun run typecheck:all` exit 0 (65 s); `profile-chaos-model.test.ts` 255 passed (61 s); `bun run test:all` exit 0 (182 s). Candidates: Chrome 52 s, Firefox 30 s.

Every seed below passed. A verdict of `incomplete` came only from `logs: the background restarted inside the step`, the planned `backgroundRestart` step's own log gap, which `evidenceGaps` accepts (41 such steps across the runs).

| Browser | From | Seeds | Per-seed test time (s) | Wall (s) | Base |
|---|---|---|---|---|---|
| Chrome | v1.1.0 | 3001 (red copy) | 48.1 | 54 | red at the start, 10.5 s |
| Chrome | v1.0.0 | 3001 (red copy) | 57.9 | 63 | red at step 4 (O5), 48 s |
| Chrome | v1.1.0 | 8101-8105 | 62.6, 46.1, 52.9, 49.8, 62.4 | 280 | — |
| Chrome | v1.0.0 | 8101-8105 | 53.3, 50.8, 52.0, 58.8, 62.3 | 283 | — |
| Chrome | v0.31.0 | 8101 | 75.2 | 86 | — |
| Chrome | v0.31.0 | first-open control (listed) | 29.6 | 42 | — |
| Chrome | empty (armed smoke build) | 8101 | 43.2 | 48 | — |
| Firefox | v1.1.0 | 3001 (red copy) | 77.9 | 88 | red at the start, 20.8 s |
| Firefox | v1.0.0 | 3001 (red copy) | 79.6 | 94 | red at step 4 (O5), 64.9 s |
| Firefox | v1.1.0 | 8101-8105 | 89.7, 83.9, 94.0, 88.8, 85.4 | 449 | — |
| Firefox | v1.0.0 | 8101-8105 | 68.5, 66.6, 67.6, 83.4, 79.5 | 370 | — |
| Firefox | v0.31.0 | 8101 | 78.4 | 83 | — |
| Firefox | v0.31.0 | first-open control (listed) | 26.1 | 33 | — |
| Firefox | empty (armed smoke build) | 8101 | 55.5 | 61 | — |

- `P2` unlocked by its passkey with `K1` (an `unlockPasskey` committed on `P2`, read from the records): Chrome seeds 3001 (step 2), 8102 (step 14), 8104 (steps 0, 5), 8105 (step 0); Firefox seeds 3001 (step 2), 8104 (step 0), 8105 (step 0).
- The first-open control: `verifyAll` opened `P1` first with v0.31.0's moved Testnet, then `unlockPassword`, then the run answered the takeover before the last `verifyAll`. Had `verifyAll` cleared the takeover, the answer would have timed out as O5. So I3 holds on both browsers, and `verifyOne` needs no change.
- Runtime budget: no scenario added, and the pre-update start runs in no CI lane, so each browser's CI suite wall-clock is unchanged.

## 2026-10-28 · Review loop

- Codex r1 `conditional approve`: the Terms flag was set before the acceptance was stored. Fixed in the shared helper: `answerUpdatedTerms` waits for `legal-sheet` to be hidden, which happens only once `legal.accept` resolves (`LegalAcceptanceSheet.vue:50-58`). Seed 3001 from v1.0.0, whose Terms are stale, and `update-replay.test.ts` from v1.0.0 (4/4) passed on both browsers.
- Opus `conditional approve`: `startWorld` spread one `base` object into both release profiles, and a `structuredClone` keeps shared references, so `P1` and `P2` shared one `imported` array. The base had it too, harmless while `P2` was retired. Fixed with a fresh `base()` per profile, and a model test that reds on the unfixed model. Seed 110867 from v1.1.0, which imports into `P1` and verifies with `P2` live, passed on Chrome (55.7 s).
- A re-run needs a rebuilt candidate: the candidate records the commit it was built from and refuses a run at another head.
- Codex r2 `approve`.
