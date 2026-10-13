# Phase 5 lessons: arc 5a (page 5 follow-ups) and arc 5 (nightly retention)

Arc 5a branches from `dev` at e900f710 (D-orch-10); arcs 1 to 4 are merged (#252, #261, #263, #265).

## 5a.1 The onboarding blocked-access title (#82)

- The onboarding arm reads `STRINGS["permission-blocked"].title` again ("Your browser blocked this site from reaching Presto"); Settings keeps "Browser blocked local access". The unit test pins the literal: red on the base copy (`expected 'Your browser blocked local access' to be 'Your browser blocked this site from r…'`), green on the new one; `PrestoStatusCard.test.ts` uses the old string only as a prop fixture and stays as it is.
- Screenshot: a throwaway spec outside the repo (a scratch vitest config whose `dir` points at it, the smoke config otherwise) refused both health probes and answered `navigator.permissions.query` with `denied` for `loopback-network` and `local-network-access`, which is what presto-core reads after a failed probe. The card read the new title, the detail line and the three steps unchanged; `shotSend` took both themes (`screenshots/`).
- Gate: `onboarding-tab.test.ts` at `--retry=0` on the armed builds of this head: Chrome 11 of 11, Firefox 11 of 11.

## 5a.2 The launch gate's scope (#183)

- Verified on e900f710, no gap: `launch-legal` runs only when `github.event_name == 'pull_request' && github.base_ref == 'main'` (`pr-quick.yml:365`); `quality-status` binds it with `expect launch-legal "$LAUNCH_LEGAL_RESULT" "$(ran "$into_main")"`, `into_main` true only for a pull request into `main` (`:427-436`); `auto-unstick` reads both documents at the merge commit and refuses before `createTag` (`auto-unstick-run.ts:118-127`). No code change.

## 5a.3 The advisory in-browser canary leg (#195)

- Under `disable_presto` the canary files run the same tests: none is skipped on the build mode, and `tx-sendTx-default` accepts either awaiting card when Presto is not required. On a runner nothing listens on Presto's ports, so the wallet proves in browser WASM.
- A job that calls a reusable workflow cannot carry `continue-on-error`, so the leg is advisory by having no dependent: a red leg reds the run's conclusion, never `status` or `publish-nightly`.
- Pins, red on the base `nightly.yml` (2 fail) and under each mutation: the leg in `publish-nightly`'s `needs` (2 fail: no-dependent, publish condition), `proverless: true`, label `wasm`, one file dropped, `disable_presto: false` (1 fail each), the job renamed (5 fail, the lane pins included).
- Runtime (D23): one dispatch of `extension-network-e2e-soak.yml` on `dev` (run 38461936523: mode `files`, the five canary files, `proverless: false`, `disable_presto: true`, retry 0). No presto-server step ran and `VITE_NULO_PRESTO_REQUIRED` was empty; 5 files and 7 tests passed, vitest 525 s, the job 9 min 39 s. The native canary job takes about 7.5 min (nightlies 38385923742 and 37765624647).
- Review fixes (54156237): on a runner a plain build must show the browser's awaiting card, and the WASM-leg pin holds the suite's proverless and required-mode expressions (a `disable_presto → proverless` mapping fails it). Proof: soak run 38464845247 on this branch (`tx-sendTx-default` alone, Presto off, retry 0, `GITHUB_ACTIONS` set): 1 of 1 in 51 s; local `e2e:agent` of the same file on Chrome at retry 0: 1 of 1 in 51 s.
- Codex round 2 (resumed): CLEAN. The loop converged in two rounds.
