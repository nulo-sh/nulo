# Phase 3: merge, evidence, gates, review loop

- 2026-10-17, merged `origin/dev` at 98d51e89: conflicts in `tests/e2e/helpers/activity-seeds.ts` (dev's `storeRow`, `to`, `block`, `chunkNonce`, `seedArrivalRow` kept around this arc's `method` and journal union) and `implementations-plan/index.md`. testers-fixes-1 had not landed, so #582's scroll-restore check had nothing to check.
- 2026-10-17, `audit:vue`, `test:all` and `build-storybook` exit 0.
- 2026-10-17, review round 1 (Codex gpt-6.1-sol high, session 01a1476b; Opus general-purpose): see plan.md § Audit verdicts. A popup's scrim is `position: absolute` and drawn where the popup mounts, so any stacking context between it and the shell (`isolation`, a `z-index` on the hero) caps its `z-index` under siblings with their own; red-proved by appending a z-400 layer in the middle and hit-testing the hero and the nav.
- 2026-10-17, a hash set right after `seedUsdQuoteAndReload` is overridden by the reload's start-up navigation to Home (probe: hash read `#/popup/general` with Home's hero drawn); read Home first, where the reload lands, then navigate.
- 2026-10-17, review round 2 (Codex resumed): approve, no new material findings; one low comment fix (a scrim drawn in the positioned hero covers only the hero). Converged, no round 3.
- 2026-10-17, screenshots: both new scenarios with `NULO_E2E_SHOT_DIR` on the armed Chrome build, 2/2 (12.0 s and 15.0 s, run beside the full smoke).
- 2026-10-17, full smoke on Chrome (armed, `--retry=0`): 253 passed, 3 failed, 14 skipped, 1681 s.
  - The three failures were in files the arc does not touch. `import-dead-rpc` REFUSED died on a detached frame after 3 s, `migration` on a detached navigating frame and then a closed connection, and `viewers-csp` on a 10 s wait for log lines.
  - The three files rerun alone: 15/15, 146 s. Flakes under the machine's load.
- 2026-10-17, full smoke on Firefox (armed, `--retry=0`): 256 passed, 14 skipped, 0 failed, 2355 s.
- 2026-10-17, merged `origin/dev` at e021210a (#623; only `index.md` overlapped). `lint`, `typecheck:all` and `test:all` exit 0 on the merged head (extension: 13349 passed).
- 2026-10-17, close-out: filed #624 and #625 (known limits, closed) and #626 to #629 (open), each deduplicated first.
