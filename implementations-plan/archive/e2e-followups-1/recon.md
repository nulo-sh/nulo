# Recon: e2e-followups-1

Base: `origin/dev` at `210d02f1f`. Three Explore agents (sonnet), one per issue, plus the planner's own reads and two baseline runs. `E` is `apps/extension/tests/e2e`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A release's passkey trait | `E/fixtures/update/release.ts` `RELEASE_TRAITS`, `releaseTraits(tag)` (throws on an unreviewed tag) | reuse as is |
| Keeping a release's credential across the update | `E/update-replay.test.ts:700-722`: the populating tab parks on `about:blank`, then `gotoExtensionPage` back to the popup; proved on both browsers from v1.1.0, and its control (tab closed) times out on Chrome (#1314 body) | reuse the mechanism; it is inline, so the chaos start does the same two calls |
| Loading the popup into a page the run already holds | `E/fixtures/wallet-pages.ts` `loadPopup` (private: polling patch, viewport, front, error recording, navigation) and `waitForServiceReady`; `openPopup`'s fallback swaps the tab, which would drop a Chrome credential | adapt: export `loadPopup` |
| Binding a credential by the authenticator's answer | `E/helpers/profile-chaos/prf-capture.ts` (`capturePrf`, private `takeAll`, `minted`), `checkers.ts` `bindCeremonies` / `answeredBy` | reuse; export `takeAll` |
| A live passkey profile in the model | `model.ts` `createPasskey` (`credential: K<n>`, `phrase: W<n>`), slots `mintedCredentials` = `next.credential - 1` | reuse its shape for `P2` |
| The start's checks for a live profile | `checkers.ts` `checkPreUpdate` → `startBound` (`listed.retired === !!p.retired`), `checkLockScreens` (unlock offered, no Set up again), `checkCredential` (needs `K1` bound) | reuse as is |
| The release's Testnet chain | `pre-update.ts` `releasedTestnet`: parses plaintext network rows only. `E/helpers/identity-rows.ts` `readNetworkRows` (`network.getNetworks`), present in v0.31.0, v1.0.0 and v1.1.0 (`services/network/spec.ts`) | adapt: read through the release's own service while its password profile is open |
| The first open's answers | `pre-update.ts` `answerFirstOpen` (takeover, Terms, arrival) in one `s.afterUpdate` slot, set for every non-retired release profile (`:142`), so a second live one overwrites the first | adapt: one entry per release profile, the Terms once |
| Model unit tests | `apps/extension/scripts/e2e/profile-chaos-model.test.ts` (pre-update cases `:189`, `:1005`, `:1885-2010`), run by `apps/extension/vitest.config.ts` (`scripts/**`) | extend |
| Picker evidence on Firefox (#1222) | `E/toolbar-panel.test.ts:486-496` (`recordInputClicks`, the poll), `pickFile` in `apps/extension/src/utils/files.ts:106-146` (removes the input on `cancel` or `change` only), `fixtures/browser/firefox.ts` `capabilities()` (`:291-317`, `permissionRequestPrefs` pattern) | reuse for the triage probe; no driver member exists for a picker the browser opens |
| Flake ledger | `.claude/skills/e2e-testing/SKILL.md` § 5 (rows 1-64; row 47 is this file's `expected null to be 'queued'`, fixed) | add rows as the triage decides |

Absence trail: no credential-owner or authenticator field in the model (searched `owner`, `authenticator`, `page` in `model.ts`, `state.ts`); no parked-page helper (`about:blank` under `E`: only `update-replay.test.ts:713` is update-related); no `unhandledPrompt` or dismissal pref under `E` (grep); no seed for the heavy shard (`SEED`/`seed` in `.github`, `E`, `scripts`).

## #1313

- Every `startWorld` caller passes the start name only: `model.ts:1646`, `:1663`, `run.ts:571`, `spec.ts:85`, `pre-update.ts:133`, `chaos-session/serve.ts:189` (`empty`), and 7 unit calls. `Plan.start` is the only carrier into `runPlan`.
- `startRun` (`start.ts:21-42`) opens a new anchor and a new authenticator. On Chrome a credential lives on its page's authenticator (`credentialOutlivesPage: false`); on Firefox the authenticator is the session's, and `cleanup()` removes it with its credentials (`firefox.ts:734-752`). `populateRelease` cleans up and closes its page (`pre-update.ts:94-98`), so today the release's credential is gone on both browsers.
- Baselines, Chrome 155 and Firefox 153.0.4, candidates `1.1.0.1` built at `210d02f1f`, seed 3001, retry 0, host load about 95 (the same red on each browser; Chrome's times below, Firefox's in lessons/phase-0.md):
  - from v1.1.0: the start check reds, as the issue shows (`P2 is listed not as retired`, no Set up again, an unlock offered), 10.5 s;
  - from v1.0.0: the start passes, then step 4 reds with `O5 the update's first open could not be answered`: `no network-reset screen … Waiting failed: 30000ms exceeded (from run.ts:493)`, 48 s. v1.0.0 and v1.1.0 seal network rows (`stores.ts:193`, `sealedCodec`), so `releasedTestnet` finds none and reads the chain as moved; both seed Testnet `685146337` (rollup version `679261766`), as `dev` does (`utils/chain-ids.ts:32-35` at each tag).

## #1222

- The step is Firefox-only and the one place the suite lets the browser open a native picker; every other pick goes through `BrowserDriver.pickFile` (`firefox.ts:711-722` sets the pending input's files; `chrome.ts:329-332` intercepts with `waitForFileChooser`).
- e2e-infra-3 Phase 3 already measured: 10 native and 10 dismissed runs on two pinned CPUs with two busy loops, click to `cancel` median 11 ms and 13 ms, none past 10 s; D4's bar was not met, so the dismissal did not ship and the issue stays open with the reopening condition "a reproducer of the miss, for example a trace of the picker's `open` and `done` from privileged scope on a run that times out".
- No Firefox smoke PR run failed on it in the last 200 (`gh run list`; the one failure is a change-detection job). Smoke keeps 2 retries, so a CI miss would show only as a first-attempt error under `RetryErrorReporter`; the job logs were not searched.

## #1300

- Shard: `network-e2e-heavy-concurrent` in `_extension-network-e2e-lane.yml`: `same-token-concurrent-sends` then `concurrent-sendtx-confirm`, proverless, `VITE_NULO_FEE_MULTIPLIER=10`, retry 0, Firefox 153.0.4, `ubuntu-latest` (4 vCPU inferred), files sequential. The issue's "with the seed" does not apply: the chaos seeds feed `send-chaos` only, and the job's `chaos_seed` is empty.
- Attempt 1 (job 122558104944): test 8 failed at `reopen` → `waitForHash` (15 s); tests 9-15 passed (test 15 on its own browser); test 16, back on the file's browser, failed with B at `proving` and no `[same-token] re-ask` line, which every green run prints (`fee 239127978458250` over `cap 143000000000000`, or `229339110766500` over `137000000000000`). So (b) is not a direct cascade of (a).
- Its Firefox log shows `Script terminated by timeout` at 01:11:09, in a zod parse under the offscreen page's `proveTx`, 18 s after B's row was created and just before the file's teardown. Green job 122620887434 shows one too (ABI decode under `fromNameAndParameters`); four other green jobs show none; attempt 2 none.
- On Firefox every wallet page is in the `extension` process, and the PXE host is a frame of the background page (`E/FIREFOX.md:36`, `:61`). That one process's documents share its main thread, so a long synchronous task in the PXE host would hold the popup as well (inference; the triage measures it). No artifact survives (`total_count: 0`).
- Ledger row 47 is this file's earlier, fixed fingerprint; no row matches either failure.
