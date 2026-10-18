# Recon: owner-feedback-1

Base `origin/dev` at `18d29f23`. Two read-only Sonnet explorers (a reuse sweep over six capabilities, an e2e and screenshot map) plus the planner's own reads. Paths are repo-relative; `ext/` is `apps/extension/src/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Fee method label of a stored tx | `ext/popup/components/modules/tx/tx-detail-helpers.ts:49` `describeFeePaymentMethod`, read only by `ext/popup/pages/tx/[id].vue:101` | adapt |
| Which FPC a popup Send paid through | `Tx.feeSpender` (`ext/wallet/services/transaction/spec.ts:147`), written by `transfer-executor.ts` `recordTransfer` from `feeSpenderOf` (`:172`) | reuse as is |
| The PrivateFPC's canonical address | `ext/wallet/services/fpc/private-fpc-address.ts` `PRIVATE_FPC_ADDRESS`, `isPrivateFpc` (sync, pinned by `protocol-fpcs.test.ts`) | reuse as is |
| Hero visibility → compact title | two copies: `ext/popup/pages/settings/index.vue:87-103`, `ext/popup/pages/activity.vue:141-170`; CSS `ext/popup/pages/tab-hero.module.css` | adapt both copies (#735 extracts them later) |
| Per-entry scroll restore | `ext/popup/scroll-memory.ts`, router `scrollBehavior` in `ext/popup/index.ts:53` | reuse as is |
| Fixed hero, scrolling body, scroll shadow | Home `ext/popup/pages/general.vue:61-133` (`hero`, `scroll_shadow`, `scroller`, `onScroll`) | see plan D3 |
| Fee breakdown grid | `ext/popup/components/modules/tx/TxFeeRow.vue:57-66`; `buildGasBreakdown` (`tx-detail-helpers.ts:24`); `formatGas` (`ext/utils/fee-estimation.ts:134`, no other caller) | adapt; delete `formatGas` |
| Landing notice | `apps/landing/index.html:191-200` (section, tag, sentence), `:228` (footer) | adapt |
| Before/after pictures, both themes | `tests/e2e/fixtures/send-page.ts:226` `shotSend` (opt-in `NULO_E2E_SHOT_DIR`, writes both themes); PRs commit frames under `implementations-plan/<plan>/screenshots/` and embed them by SHA (#733) | reuse as is |

## Tx writers

| Writer | Origin | `calls` | `feeSpender` |
|---|---|---|---|
| `transfer-executor.ts` `recordTransfer` (popup Send) | UI | the transfer call only, by design (`:433-436`) | the paying FPC's address, except Nulo's sponsor |
| `dapp-send-executor.ts` `sentTxRecorder` (`:752-766`) | the caller's: DAPP from `dapp-interaction/service.ts:321`; UI from `auth-registry/service.ts:386,435` | `txCalls` from the build, so an FPC's `pay_fee` / `sponsor_unconditionally` is recorded (`fee/fpc-strategy.ts:149,200-205`) | never |
| `dapp-send-executor.ts:1234-1246` (no `from`) | DAPP only (needs an embedded payment) | the app's `exec.calls` | never |

A restored backup row is a fourth source: it can carry any of these fields.

## E2E map

- Smoke is `apps/extension/tests/e2e/*.test.ts` (retry 2 by default; `--retry=0` or `NULO_E2E_RETRY=0`); network is `tests/e2e/network/**`.
- **Settings round trip:** `navigation.test.ts:55-85` scrolls `settings-page`, opens Developer, goes back and checks the offset. `:359-482` checks the compact bar (`page-title-bar`) and hero geometry and opacity for `activity-feed-root` and `settings-page`. No test asserts the bar's state on a return.
- **Token page:** `home-links.test.ts:86-92`, `rows.test.ts:685-720` (10 px row spacing on Home, the token page and History), `token-list.test.ts:166-168` (flagged banner shot), `type-roles.test.ts:642-644,765`, `network/pin-to-home.test.ts` (menu pin). No e2e scrolls the token page or reads its scroller.
- **Home scroller:** `rows.test.ts:985-1100` reads `home-scroller`, `home-scroll-shadow` opacity endpoints.
- **Tx detail fee row:** no e2e reads the fee method, `tx-fee-usd` or the breakdown; unit tests only (`TxFeeRow.test.ts`, `tx-detail-helpers.test.ts`, `pages/tx/[id].test.ts`). No network e2e opens `#/popup/tx/<hash>` after a Private Fee Juice or sponsored send (`network/fee-methods.test.ts:52-76,172-196` stop at the toast).
- **Animations:** `getAnimations().length === 0` is the suite's settle idiom (`send-keyboard.test.ts:133`, `tooltips-glossary.test.ts:29`, `snackbar.test.ts:40`). No unit test asserts "no transition on first render"; jsdom runs no transitions.
- **Path filters:** smoke and network lanes cover `apps/extension/**`; `apps/landing/**` trips only `pr-quick.yml` (`build-landing`, the landing's unit tests).
- **Commands:** smoke `cd apps/extension && bun run test:e2e -- tests/e2e/<file>.test.ts --retry=0` (Firefox: `build:firefox` with the CI `VITE_NULO_E2E_*` flags, then `NULO_E2E_BROWSER=firefox NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_RETRY=0 bun run test:e2e tests/e2e/<file>.test.ts`; `FIREFOX.md:5`).
- **Suite wall-clock** (the e2e skill's measure: the CI job envelope of the PR's run, and of the latest successful run of the same workflow on another PR, `gh run list --workflow <file> --status success`): `gh run view <id> --attempt 1 --json conclusion,jobs --jq 'if .conclusion != "success" then "attempt 1: \(.conclusion)" else [.jobs[] | select((.name | startswith("Run / ")) and .conclusion == "success")] | if length == 0 then "suite skipped" else ((map(.completedAt | fromdateiso8601) | max) - (map(.startedAt | fromdateiso8601) | min)) / 60 | floor end end'` (whole minutes).
- **Local wall-clock on record:** smoke Chrome 1,658 s, Firefox 2,333 s, local, 2026-10-17 (`implementations-plan/archive/harden-quality-fixes-3/lessons/phase-1.md:14`).

## Collisions

- structure-2 (#735) plans to extract the hero observer of Settings and Activity into one composable; this lane's #765 edits both copies first (plan D2).
- wallet-bugs-2 holds `ext/popup/pages/journal/[id].vue` (#648) and the loading bars and glyphs (#654). This lane does not touch the journal page; its tx-detail files are listed in the plan.
- landing-explainer-1 (#723) edits `apps/landing/src/install.ts`, `page.css`, `vite.config.ts`; #767 stays in `apps/landing/index.html`.
- Closed known limit #624 (the snack's lift counts a row scrolled under Home's fixed hero) applies to the token page once its hero is fixed.
