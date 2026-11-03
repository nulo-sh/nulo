# release-replay-1: recon

One Explore agent (sonnet), 2026-11-03, read-only at `3b845ef02`, asked what changed on the update path since #1314 (`210d02f1f`) and could turn the scenarios red. The planner checked the claims the plan cites.

## The scenario's own files

- No commit since `210d02f1f` touched `tests/e2e/network/update-in-place.test.ts`, `tests/e2e/update-replay.test.ts`, `tests/e2e/fixtures/update/`, `scripts/e2e/build-update-candidate.sh` or `scripts/e2e/update-recording.test.ts`.

## Shared helpers the scenarios import that did change

| Change | Where | Risk |
|---|---|---|
| Firefox moves from `stable_153.0.4` to `stable_158.0` (#1338) | `tests/e2e/fixtures/browser/firefox-revision.ts` | the last green Firefox runs used 153.0.4; both are cached locally |
| The Firefox driver answers the file picker (#1411) | `tests/e2e/fixtures/browser/` | Firefox only |
| A one-step full backup, reworked modes and file name (#1559) | `tests/e2e/helpers/backup-export.ts`, `download-capture.ts` | the replay ends with `exportBackupFile` and `expectBackupImports` |
| `answerUpdatedTerms` also waits for `legal-sheet` to close (#1322) | `tests/e2e/helpers/legal-drivers.ts` | both scenarios answer the Terms after the update |
| `authSubmitReady` gained three lines | `tests/e2e/helpers/profile-chaos/ui.ts` | the replay's passkey case |

Each of these already runs in the required e2e lanes on both browsers; none has run against an in-place update from v1.1.0.

## The candidate side

- **#1622's endpoint move.** At unlock, after the plaintext rows are sealed, `retireDefaultEndpoints` (`src/wallet/services/network/service.ts`, through `retired-endpoints.ts`) gives any endpoint whose URL's SHA-256 matches the one retired keyed default the keyless URL. No row in either scenario can match: the live scenario moves every outside endpoint onto loopback through the release's own service before it updates, and the recording's plaintext names five loopback URLs and no other (zero digest matches).
- **The seed the replay compares** is the recorded Testnet row's chain id against `CHAIN_IDS.TESTNET` (`update-replay.test.ts:227`, used at `:665-668` and `:686`; `src/utils/chain-ids.ts:35`). `chain-ids.ts` is unchanged since `210d02f1f`, so the first case should open with no takeover and the second runs.
- **Stored shapes.** No numbered migration since `210d02f1f`. Three stamps were appended (`tokenPrices` stamp 3, a journal authwit golden at stamp 1, `tokenIdHighWater` at stamp 2); `tokenIdHighWater` is a new family. `HELD` in `fixtures/update/verify.ts` is unchanged, so the recording cannot trip `missingFamilies`; the update's read checks cover the rest.
- **Testids.** All 23 ids the scenarios use on the candidate side still occur in `apps/extension/src`.
- **Default networks.** v1.1.0 and HEAD both seed `testnet`, `local` and `mainnet` (`src/wallet/services/network/seeds.ts`), so the arrival scenario has no kind to arrive.
- **Chrome.** Puppeteer 25.14.0, unchanged; its Chrome 155.0.8059.79 is the one the 2026-10-28 runs used.

## Reuse

- No script runs the four runs in sequence; README § In-place update lists the commands.
- `scripts/e2e/update-recording.test.ts` checks the committed recording: `recordingProblems` (tag, browser, key families, loopback dials) and a loopback-only count of its plaintext URLs. `recording.ts` `dialProblems` holds the dial format.
