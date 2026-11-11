# test-issues-1: recon

Base: `dev` at `4c931737acdeb7c6f60d41361ca4b0275c8756eb`. Two Explore agents (sonnet) and the planner's own reads. Paths are under `apps/extension/` unless they start with `packages/` or `.github/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Wait until a page's async list settles | Puppeteer's `waitForSelector(sel, { hidden: true })`, used inline at 7 sites (`tests/e2e/fixtures/tokens.ts:196`, `helpers/network-arrival.ts:47`, …). Five network specs instead poll `!document.querySelector('[data-testid="loading-state"]')` through a raw `waitForFunction` (`tests/e2e/network/senders-advanced.test.ts:59,145`, `tests/e2e/network/backup-import-stalled-network.test.ts:116`, `tests/e2e/network/restore-again.test.ts:75`, `tests/e2e/network/receive-unregistered.test.ts:40`). No exported helper: searched `waitForNoLoading`, `waitForGone`, `loading-state` over `tests/e2e/**`. | reuse the absence form (`!document.querySelector`), as the sweep's own unsettled wait does (D1) |
| The sweep's ready step | `goAndSweep` and `openAndSweep` (`tests/e2e/type-roles.test.ts:778,784`) wait for `sel(ready)` with `VISIBLE` (`:466`, 15 s), then call `expectPageClean` (`:530`). | adapt `goAndSweep` |
| A "page not at rest" wait inside the narrow check | `expectFitsNarrow` (`tests/e2e/fixtures/type-roles.ts:763`) waits out a success snack and `fee-settings-card[data-read-pending]` before its two measurements. Thirteen other spec files call it. | not used (D1) |
| Pin the clock in a unit test | `vi.useFakeTimers({ toFake: ["Date"] })` with `afterEach(() => vi.useRealTimers())`: `src/wallet/services/account-state/service.test.ts:520` (comment: "Only `Date` is faked, so the budget moves when the first registration spends `ms`, never with the host's speed"). 35 files use `toFake`. `tests/vitest.setup.ts` restores no timers and no spies, so a bare `vi.spyOn(Date, "now")` leaks. | reuse |
| The intercept log | `NULO_E2E_INTERCEPT_LOG=1`, read only by `tests/e2e/fixtures/browser/chrome-rpc-intercept.ts:49`; prints `[rpc-intercept]` attach, redirect and failure lines to stdout. Not set in `.github/`. | reuse |
| The guard's count | `note` in `tests/e2e/fixtures/egress-guard.ts:245` counts each request per `host:port`, `held` when the launch's stand-in held the origin; `egressFailure` (`:337`) builds the close failure. | adapt `note` (D2) |
| Smoke failure artifact | `_extension-smoke-e2e.yml` uploads `apps/extension/.e2e-state` on `failure()`; the smoke setup writes little there. | not used (D2) |

## Issue claims checked

- **#1763.** Holds. `senders-add-btn` renders outside the `v-if`/`v-else-if` chain (`src/popup/pages/settings/developer/account-state/senders/index.vue:100,142`); `useEntityCrud` starts with `isLoading = ref(true)` (`src/composables/useEntityCrud.ts:75`), so `loading-state` renders in the same pass as the button. The call is now at `type-roles.test.ts:1127`, not `:1085`.
- **#1743.** The failing CI job (run 42346943042 attempt 1, job 128326689216) shows the spec's own last assertion red, `guard.attempts()` for Mainnet `[{ host: "aztec-mainnet.drpc.org", port: 443, count: 1, held: 1 }]` at `network-arrival.test.ts:114`, then the close's held-count failure, on all three attempts. That assertion reads the whole launch's record, registration included, so the request may predate the spec's baseline. The closed known limit #846 (the guard cannot order a request against an arm) names this log as its reopening test.
- **#1742.** Partly stale. The two-endpoint test now asserts `[["https://a.example", 2_500]]`, not `5_000`: the budget is split across the endpoints still to ask (`src/wallet/services/network/service.ts:1067`). The defect stands: `Math.floor((deadline - Date.now()) / 2)` gives 2_499 after one tick.
- **#1735.** Holds. Same defect; the file has three such assertions (`service.test.ts:2529` single endpoint `5_000`, `:2616` and `:2627` two endpoints `2_500`). The fake-clock describe below them (`:2672`) is already exact.
- **#1683.** Holds, with a path correction: `batched-view-simulation.ts` is under `execution/helpers/`. `completeFeeOptions` (`packages/aztec-runtime/src/account/fee-options.ts:66`) pads `predictedWorstMinFees` by `MIN_FEE_PADDING` (0.5); `predictedWorstMinFees` (`packages/aztec-runtime/src/fee-juice.ts:33`) takes the worst DA fee and the worst L2 fee across slots, each on its own. Upstream `BaseWallet.getMinFees` (`@aztec-labs/wallet-sdk` 6.0.0, `dest/base-wallet/base_wallet.js:232-247`) takes the one slot with the highest L2 fee. No other live comment repeats either claim (searched `getCurrentMinFees\(\) ?\* ?1\.5|byte-for-byte` over `*.ts`, `*.md`, `*.vue`).

## Sweep targets: does the ready testid render while a list still loads?

Every `goAndSweep` target was read. Only Senders renders its ready testid beside a `loading-state`.

| Target (ready) | Verdict |
|---|---|
| Senders (`senders-add-btn`) | same shape: button unconditional, `FETCHING SENDERS` while `isLoading` |
| authwits (`record-hash`, `record-selector`) | ready rendered only after `FETCHING AUTHWITS` ends (`authwits/index.vue:180`) |
| Display (`theme-trigger`) | inside `v-if="!isLoading"` (`display.vue:142`); no loading text |
| Connected Apps, Manage accounts, Export account, Activity, Reset with an imported account | ready is a row, rendered after the load |
| tx, received and journal detail | gated on the record (`v-if="tx"`, `received`, `op && display`) |
| Settings hub, Profile, Home with an import in flight | no async list, no loading text |
| Contacts, Reset, Send | ready is early, but no `loading-state`: a late sender chip, the imported-accounts section, Send's token skeleton (no text). A different shape; Send also belongs to `send-build-1` |

The FPC page renders `fpc-new-btn` beside `FETCHING FPCS` too, but the spec reaches it by the seeded row `[data-fpc-id="e2e-unnamed-fpc"]` (`type-roles.test.ts:1116`), which only renders once the fetch returns.

## Measurements

- `network-arrival.test.ts` with `NULO_E2E_INTERCEPT_LOG=1`, Chrome, one run: 129 `[rpc-intercept]` lines for three tests (about 43 per launch). Target labels seen: `service_worker:<id>/background.js`, `other:`, `background_page:offscreen/index.html`; redirect lines name the origin only.
- The same spec, Chrome, ten runs at retry 0 with the log on, load 154 to 330 on 188 cores: 10 of 10 green, 37 to 69 s each. No held request.
