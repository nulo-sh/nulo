# Phase 5 lessons: arc 5a (page 5 follow-ups) and arc 5 (nightly retention)

Arc 5a branches from `dev` at e900f710 (D-orch-10); arcs 1 to 4 are merged (#252, #261, #263, #265). Arc 5 branches from `dev` at dd922823 (D-orch-13) and merges arc 5a's branch before the close-out (D29).

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

## 5.1 The selection (#178)

- `planPrune` unions release and tag names, drops every name off `^v\d+\.\d+\.\d+-nightly\.\d{5}$` before counting, orders by date code then version, and returns the names past the newest fourteen, oldest first, each with every release that holds it. It filters instead of refusing, so it cannot return a stable or rc name (D25).
- Tests: twenty keep fourteen; none up to fourteen; ten stable, rc and near names never selected nor counted; the year boundary; code before version, and version within one code; a draft counted by name, a tag-only and a release-only name; several releases on one name. Version-before-code ordering and an unanchored pattern each red one test.

## 5.2 The runner and the job

- `prune-nightlies-run.ts`: dry run unless `--apply`; per name, each release re-read (skip if gone, refuse if retagged), deleted, read back; then the tag, read back; stop at the first failure with `::error::prune stopped at <tag>`. Pagination follows `Link: rel="next"` on `https://api.github.com/` only, with `redirect: "manual"` (D28). `git/matching-refs` ignores `per_page` and returns every ref without a `Link` (Opus, checked live).
- The job: after a successful `publish-nightly`, in the same run; `contents: write` only; checkout without persisted credentials; `setup-bun` with no install and no cache; `bun --no-install`; `--apply` only when `dry_run` is false; in `status`'s needs.
- The plan's release-write guard exception was not needed: the guard reads `gh release` in step text, and the prune deletes through REST (D24). `pruneFindings` pins the job instead; five mutations red it.
- Gates on bb4d6e8c: lint, lint:actions, typecheck:all, test:ci-gating 532, test:release 0 fail.
- Live state on 2026-10-13: three nightly tags (`v0.30.2-nightly.26280` to `.26282`), so the first deletion comes about eleven published nights after the merge.

## Arc 5 review

- Codex round 1 and the Opus review: both approve with fixes.
  - Both found that a freed name could be cut again: codes run ahead of the calendar on same-day re-runs, and with fourteen or more names at or after today's code, `resolve` re-cuts a pruned one, which sorts oldest and is pruned in the same run; immutable releases never reissue it. Fixed in `resolve` (D26); `nightly-resolve.test.ts` runs the real step under `git`, `jq` and `date` shims, red on the base step in two of four cases.
  - Both found the pins blind outside the prune job and to its checkout and token placement: `privileged()` now counts `contents: write`, and `pruneFindings` requires the one prune step in the prune job (the moved-step mutation reds only through that check).
  - Opus found the exclusion already applied (read-only readback, `updated_at` 2026-10-13T20:47Z) and the release skill stale; rewritten. Opus noted that the exclusion also leaves nightly tags movable: reported to the owner, not built.
  - Codex found that a quiet day runs no prune, so an interrupted one waits for the next published night: docs corrected, no new trigger (D27).
  - Opus found two selection mutations that survived; both cases added.
- Fixes 494267c0; gates: lint, lint:actions, typecheck:all, test:ci-gating 538, test:release 0 fail.
- Codex round 2 (resumed, on 494267c0): CLEAN. The loop converged in two rounds.
