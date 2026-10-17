# Phase 3: merge, evidence, gates, review loop

- 2026-10-17, merged `origin/dev` at 98d51e89: conflicts in `tests/e2e/helpers/activity-seeds.ts` (dev's `storeRow`, `to`, `block`, `chunkNonce`, `seedArrivalRow` kept around this arc's `method` and journal union) and `implementations-plan/index.md`. testers-fixes-1 had not landed, so #582's scroll-restore check had nothing to check.
- 2026-10-17, `audit:vue`, `test:all` and `build-storybook` exit 0.
- 2026-10-17, review round 1 (Codex gpt-6.1-sol high, session 01a1476b; Opus general-purpose): see plan.md § Audit verdicts. A popup's scrim is `position: absolute` and drawn where the popup mounts, so any stacking context between it and the shell (`isolation`, a `z-index` on the hero) caps its `z-index` under siblings with their own; red-proved by appending a z-400 layer in the middle and hit-testing the hero and the nav.
- 2026-10-17, a hash set right after `seedUsdQuoteAndReload` is overridden by the reload's start-up navigation to Home (probe: hash read `#/popup/general` with Home's hero drawn); read Home first, where the reload lands, then navigate.
- 2026-10-17, review round 2 (Codex resumed): approve, no new material findings; one low comment fix (a scrim drawn in the positioned hero covers only the hero). Converged, no round 3.
