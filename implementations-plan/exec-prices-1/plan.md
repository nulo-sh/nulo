---
plan: exec-prices-1
tier: light
status: A1 implemented, fix loop converged; PR pending
issues: "#982 (A1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit round-trip (gpt-6.1-sol, high) plus the Opus Plan leg
base: origin/dev at e7192fa8d
trunk: dev
post_implementation_hardening: not scheduled
---

# exec-prices-1: a dApp window reads cached prices only

One arc, one PR against `dev` (`Closes #982`). Privacy Policy § 5.2: "Transaction execution reads cached prices and never triggers a fetch." Today every `usePrices` asks the worker for `refreshIfStale` at mount and on reconnect, and four of them mount in a dApp window. After this arc, a document first loaded at a `/windows/*` route never asks for a refresh: it reads the cache, and still adopts the worker's broadcasts. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue claims checked

#982 holds at `e7192fa8d` (recon § Who asks; § What mounts, paths 1-3). It names three paths; a fourth exists. `PopupManager` mounts `SelectTokenPopup` in every logged-in document, windows included, and its setup calls `usePrices` (path 4, demonstrated by trace). So every dApp window, the connect window included, can ask for a refresh. The issue's guard ("the refreshing form of `usePrices` out of `src/popup/windows/**`") cannot see path 4: no window file imports it.

## Outcome & Quality Bar

**For whom**: a person who approves a dApp's request with fiat values on; a store or privacy reviewer who checks § 5.2 against the build.

**Excellent**:
1. No `refreshIfStale` request leaves a dApp window document, from any component, now or in a window added later. A test reds when one would.
2. Nothing on any screen changes. A window's fee still shows dollars whenever the cache or a broadcast holds a usable quote. Popup pages, Send and the authwit popups keep their refresh at mount and on reconnect.

**Good enough**: no new e2e; no price-service change; `useTokenFlags` stays as #981 shipped it.

## Assumptions

**Facts** (at `e7192fa8d`; `X/` = `apps/extension/src`):
1. `usePrices` is the only UI caller of `refreshIfStale` (`X/composables/usePrices.ts:82-95`). `getQuotes` never fetches; every fetch broadcasts to all clients (`X/wallet/services/price/service.ts:167-170,409,440`).
2. Windows and popup pages share one shell with no window-only layout (`X/popup/app.vue:559-613`). Window routes are `/windows/*` (`apps/extension/scripts/pages-options.ts`). The worker opens every dApp window at `#/windows/<name>?…` (three sites, recon). Popup code opens two more under `/windows/`, json (`X/components/JsonViewer/JsonViewer.vue:88`, `X/popup/windows/{execute,fee}/index.vue`) and logger (`X/popup/pages/settings/developer/index.vue:45`); neither shows a price.
3. A locked window's route leaves `/windows/*` for `/popup/auth` and comes back after unlock (`X/composables/useDappApprovalWindow.ts:147-150`, `X/popup/pages/auth.vue:100-106`). `X/popup/index.ts:41-42` reads the first hash before the router for that reason (`captureOwnWindow`).
4. Paths 1-4 above are the only `usePrices` mounts in a window document (recon, both explorers).
5. Send calls `usePrices` itself (`X/popup/pages/send.vue:263-264`); the authwit popups' hosts do not, so the card's refresh is theirs (recon § Hosts).
6. The network specs `tx-sendTx-default` and `fee-sponsor-funding` seed a quote in the cache, refuse CoinGecko and expect the fee window's and the execute card's figures priced (recon § Real-browser coverage). No smoke spec opens a dApp window.

**Inferences**:
- A window opened on a stale cache shows its fee token-only until a broadcast lands: the next alarm fetch (a worker start re-creates the alarm, `price/service.ts:155-157`, so it can be later than 3 minutes) or a refresh from an open popup. Today it may show dollars a few seconds after mount. The rendering does not change; the lane brief records this as UI impact none.
- In a real browser `onConnected` also fires on the first connect (`packages/extension-messaging/src/background/client.ts:177-187`), so a window mount makes two `getQuotes` reads, as a popup mount makes two `refreshIfStale` today. The fence makes the second harmless; the fakes fire no connect, so tests count one per `resnapshot`.
- vitest's default `isolate: true` (no config overrides it) keeps a captured flag inside its test file; inside a file each test resets it.

**Asks**: none. The § 5.2 boundary (a window document) is the issue's; the owner's records in the lane brief cover the UI. An unlock done inside a window still fetches through the service's own unlock refresh, which § 5.2 discloses ("may also occur on unlock") and the lane may not change: known limit KL1 below, named in the PR body.

## Architecture & Implementation

**Where the decision lives (D1)**: in the document, captured once at boot. A new `X/utils/window-document.ts` exports `captureWindowDocument(hash)` and `isWindowDocument()`. The names stay apart from `isDappWindow(route.name)` (`X/popup/stale-takeover.ts:29`), which reads the current route and is wrong at the unlock moment (Fact 3). The capture is called in `X/popup/index.ts` beside `captureOwnWindow`, before the router exists. `usePrices` reads `isWindowDocument()` at setup. No component, prop or host changes.

**Change map**:
- `X/utils/window-document.ts` (new, about 15 lines): the captured flag is true when the first hash's path is under `/windows/`. Module comment: why the first URL, not the route (Fact 3).
- `X/popup/index.ts`: `captureWindowDocument(window.location.hash)` next to `captureOwnWindow(...)`.
- `X/types/auto-imports.d.ts`, `X/types/.eslintrc-auto-import.json`: regenerated by the build (`src/utils/` is auto-imported, `apps/extension/vite.config.ts:113`); commit them.
- `X/composables/usePrices.ts`: in a window document, `resnapshot` makes exactly one `getQuotes()` read and adopts the whole snapshot (quotes and list). It reuses `listState`'s fence (its `read` hands the snapshot back; internal, no new counter), so a read begun before a broadcast is dropped. Its answer or its failure sets `settled`. It never calls `refreshIfStale`, at mount or on `onConnected`. `onQuotesUpdated` adoption is unchanged. Outside a window document, behaviour is today's. The TSDoc states the § 5.2 invariant in one sentence.
- `ARCHITECTURE.md:100`: one clause, "a dApp window reads quotes the same way and never asks for a refresh (Privacy Policy § 5.2)".
- Tests: Phase 1 below. No change to `AppFeeLine.vue`, `FeeSettingsCard.vue`, `FeeRaisedCard.vue`, `OperationCard.vue`, `SelectTokenPopup.vue` or any window file.

**Flow**: worker opens `#/windows/execute?requestId=…` → `index.ts` captures `true` → any `usePrices` in that document, `SelectTokenPopup`'s included, reads `getQuotes` at mount and on reconnect, whatever the route is by then → a fetch elsewhere (alarm, popup) broadcasts → the window adopts it.

**Alternatives not taken**:
- *A prop on `FeeSettingsCard`* (`OperationCard` passes it; `AppFeeLine`, `FeeRaisedCard` hard-code the cached form). Misses path 4. A new window that mounts the card without the prop refreshes, and no static scan can read a prop's value.
- *`provide` from each window's `index.vue`*. Misses path 4: `PopupManager` is the window page's sibling, not its child. A new window that forgets the call refreshes.
- *`provide` from `app.vue` keyed on `isDappWindow(route.name)`*. Wrong at the unlock moment: `isLogined` turns true while the route is `popup-auth` (Fact 3), so path 4 mounts as a popup page.
- *`provide` from `app.vue` keyed on the captured flag*. Correct, but it adds a key and an `inject` default for a document constant. Window tests mount the window without `app.vue`, so they set the flag either way.
- *Gate `SelectTokenPopup` out of windows*. Fixes path 4 only, by a second mechanism.

## Decision ledger

- **D1 boundary**: the document first loaded under `/windows/`, as above. A dApp's request or the worker's send queue opened every such document that shows a price, so a fetch there is timed by that request. The json and logger windows also match (Fact 2): they lose a refresh they never use (the safe side). Both legs judged D1 better than every listed alternative: props and per-window `provide` miss the shell's `PopupManager`, a route-keyed `provide` breaks across unlock, and an `app.vue` `provide` of the captured flag adds a key for a document constant.
- **D2 cached read**: `getQuotes` on mount and reconnect, fenced, adopting the whole snapshot. This mirrors `useTokenFlags` and adds no lifecycle. The reconnect read replaces broadcasts dropped while the port was down, as today.
- **D3 guard**: a regression guard, not an enforcement boundary: a static test (`X/utils/price-refresh-ban.test.ts`, the `storage-facade-ban.test.ts` pattern). (a) The identifier `\brefreshIfStale\b` appears in `X/**/*.{ts,js,vue}` code lines, tests and `X/types/` aside, only in `composables/usePrices.ts` and `wallet/services/price/{client,service,spec}.ts`. (b) Outside its declaration in `X/utils/window-document.ts`, `captureWindowDocument` is called in non-test code exactly once: `captureWindowDocument(window.location.hash)` in `X/popup/index.ts`, before `createRouter(`. Self-tests: (a) catches a direct call, a `?.` call and a `.call(` extraction in a window file; (b) admits the declaration and catches a second caller. With D1 no window-reachable `usePrices` has a refreshing form, so (a) and (b) pin the remaining ways back: another caller, a moved or lost capture, a re-capture on a later route. No import-graph walker (rejected: it would still miss path 4's shell mount).
- **D4 tests**: the smallest set (Phase 1). Each never-happens count pairs with a success control: the window cards and the shell's picker make 0 refreshes in a window document; the same picker and the Send page's real card make one at mount and one per reconnect in a popup document. `AppFeeLine` and `FeeRaisedCard` mount only in windows, so their component tests move to a window document rather than keep pinning a refresh production never makes.
- **D5 no e2e**: unit and component layers prove which request goes out. Fact 6's network specs prove in a real browser that the cached read still prices both windows (not § 5.2 itself: the request would leave the worker, and a refused fetch writes nothing). The gate runs them locally on Chrome; the PR's network lanes run them on both browsers.
- **KL1 (known limit, filed at close-out as a closed `known-limit` issue)**: (i) locked → a dApp request opens a window → it routes to `/popup/auth` → the person unlocks there → `price/service.ts:239-246` refreshes, gated only by backoff; the dApp chose when the window appeared. § 5.2 discloses unlock refreshes and the lane bars service changes. (ii) A reload at `/popup/auth` inside a window boots as a popup document; the request's route is lost (`X/utils/own-window.ts:122-124`), so it lands on `/popup/general` and shows no execution surface. Both demonstrated by trace; consequence: one disclosed request timed with an unlock the person performs. Reopen if the owner reads § 5.2 as covering an unlock inside a window.

## Security & Adversarial Considerations

- **Threat**: a dApp, or any page that can drive the wallet-sdk, opens a window and so times a request to the price provider from the person's IP to its own request. CoinGecko or a network observer learns the timing of dApp activity. The quote list is fixed, so no holdings leave. The fix removes the request; the alarm's schedule and unlock's refresh, which § 5.2 discloses, stay.
- **Misclassification**: our own code builds every window URL (Fact 2), and the manifest declares no web-accessible resource (`X/manifest.test.ts:63`), so no page can load the popup with a chosen hash. A price-showing window URL outside `/windows/` would refresh; none exists, and (b) plus the capture test pin the predicate. The inverse costs a refresh, not privacy. The UI, not the worker, holds the line: worker-side enforcement would need sender-route tracking, a new protocol, for code we ship ourselves.
- **What stays open**: KL1.
- **Supply chain, crypto, privilege, input validation**: N/A. No dependency, permission or trust boundary moves; the hash read is a prefix test on our own URL.

## UI impact

None, per the lane brief's record ("A fee card without a usable quote renders token-only today and keeps doing so"). No copy, row, layout or format changes. The Inference above (dollars may arrive later on a stale cache) is that recorded behaviour, not a new screen.

## Phase 1: cached reads in dApp windows (arc A1)

Steps, in order. Assumptions: Facts 1-6, D1-D5.
1. Add `X/utils/window-document.ts` and `X/utils/window-document.test.ts`: one table test. True: `#/windows/execute?requestId=r1`, `#/windows/fee?requestId=r1`, `#/windows/passkey?requestId=r1`, `#/windows/json`, `#/windows/logger`. False: `#/popup/general`, `#/popup/settings/security/export/full?window=own`, `#/windowsx`, `""`.
2. Call the capture in `X/popup/index.ts`. Change `usePrices.ts` per the change map. Commit the regenerated `X/types/` files.
3. In `tests/helpers/price-client-fake.ts`, add `reads()` (the `getQuotes` count) and `reconnect()` (invokes every `onConnected` listener still added, as `broadcast()` does).
4. Add to `X/composables/usePrices.test.ts` two tests in a captured window document. First: mount and a reconnect each read `getQuotes` once and adopt quotes and flags, a broadcast is adopted, and `refreshIfStale` is never called. Second: a read begun before a broadcast is dropped, and a failed read settles token-only. The existing popup tests stay as the control.
5. Window component tests. Capture the window in `beforeEach`; reset with `captureWindowDocument("")` in `afterEach`.
   - `X/popup/windows/execute/OperationCard.fee.test.ts`: rewrite `:342-360`. Keep `reads()` 0 while no estimate runs (the line's "no price read"). Then the app-paid line and the `FeeSettingsCard` "You pay" readout are priced from the cached read, with `refreshes()` 0 after mount and after `reconnect()`.
   - `X/popup/windows/fee/index.test.ts`: `:220`, `:248` become `refreshes()` 0 with the card priced (`$0.042`) and `reads()` 1. Add a `reconnect()` with 0 refreshes. `:231`, `:242` keep 0 and add `reads()` 0.
   - `AppFeeLine.test.ts:30`, `FeeRaisedCard.test.ts:55`: `refreshes()` 0, `reads()` 1 (D4).
6. The shell path, A/B, in `X/popup/components/popups/SelectTokenPopup.test.ts`: capture `#/windows/execute?requestId=r1`, set `window.location.hash` to `#/popup/auth`, mount with `show: false`. Expect one `getQuotes` and no `refreshIfStale`; after a reconnect, two `getQuotes` in total and still no `refreshIfStale`; a broadcast's quote adopted. Unmount it (the file's fake shares its events across instances), capture `""` and mount again: one `refreshIfStale`, one more after a reconnect.
7. The Send page's card, success control, in `X/popup/pages/send.integration.test.ts` (Send over the real `FeeSettingsCard`, no window captured). Every price client the page built, the card's included, asks for one `refreshIfStale` at mount and one more after its own reconnect.
8. Add `X/utils/price-refresh-ban.test.ts` (D3: (a), (b), the self-tests). Edit `ARCHITECTURE.md:100`.

**Validation gate** (all exit 0; layers: lint, typecheck, unit, component, smoke and network e2e):
- `bun run lint`, `bun run typecheck:all`, `bun run test` (extension, component suite included), `bun run test:all`
- Red/green proof: keep the new fake, `window-document.ts` and the tests; take only `usePrices.ts` from `e7192fa8d`. Each window test of steps 4-6 fails on its `refreshes()` or `refreshIfStale` assertion, which the run shows; restored, all pass.
- `bun run check:plans` (after staging), `scripts/check-no-local-paths.sh`
- Smoke on Chrome, once, retry 0. From the repo root build with `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`. Then run `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`. Pass: every spec green; record the wall-clock. The smoke setup claims its ports in `~/.agents/ports.md`.
- Network on Chrome, retry 0, the two specs that price a window from the cache (Fact 6): `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-default.test.ts tests/e2e/network/fee-sponsor-funding.test.ts --retry=0`. Pass: both green. Never two `e2e:agent` runs in this worktree at once.

## Delivery

- Branch `exec-prices-1-a1` off `origin/dev`, one PR against `dev`, no stack (D-orch-1). Title: `fix(prices): a dapp window reads cached prices and never asks for a refresh` (75 characters).
- Body: what changed and why (§ 5.2, the four paths, path 4 found here), KL1 in one line, the validation runs with outcomes and the smoke wall-clock, `Closes #982`, the Claude Code line. Not a draft. No label at creation; the extension path filters run smoke and network on both browsers.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `e7192fa8d`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 runs once over `git diff origin/dev...HEAD` after Phase 1 is green, before any PR: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds. An Opus `general-purpose` review runs beside round 1. Log rounds in `lessons/phase-1.md` and § Audit verdicts.
- Step 3: `gh pr create`, then `gh pr checks <n> --watch`.
- Step 4 is the PR's final commits: merge `origin/dev`, file KL1 as a `known-limit` issue closed as not planned, the Outcome (`Known limits:` naming it, `Open items:`), lessons promotion if any, `STATUS.md` deleted, then the `git mv` into `archive/` in its own commit with the index line moved.
- Step 5: `agent-worktree done exec-prices-1 --merged` after the merge. The orchestrator merges.

## Seeds

- `/goal`: "Implement implementations-plan/exec-prices-1/plan.md Phase 1 in this worktree on branch exec-prices-1-a1, run its gate, the Codex loop and the delivery; do not merge."
- `/loop 15m`: "Check exec-prices-1: if its PR is open, watch checks; if merged, run the teardown; else continue the plan."

## Audit verdicts

- **Round 1, Codex (gpt-6.1-sol, high, session `01a15c60-b658-7d22-9402-6eabfe7d5a1b`): conditional approve**, high confidence in D1, no P1. Accepted: the smoke run lacked its runtime flags (`NULO_E2E_MIGRATION_FIXTURE`, `NULO_E2E_CSP_REPORT`; `tests/e2e/backup-migration.test.ts:31-42`), now in the gate; the red/green recipe reverted its own fake, now only `usePrices.ts` reverts; D3's literal `refreshIfStale(` scan missed `?.` and `.call(`, now an identifier scan with self-tests; no test exercised path 4, now step 6; `/windows/` also matches json and logger (Fact 2, D1). Its note on a reload at `/popup/auth` is KL1 (ii).
- **Round 1, Opus Plan: conditional approve**, no P1. Accepted: the same red/green and Fact 2 findings; the unlock inside a window (KL1 (i), an Ask in its view: taken as a known limit, since § 5.2 discloses unlock refreshes and the lane bars service changes); distinct names from `isDappWindow` (now `isWindowDocument`); (b) also pins the capture's only caller; the regenerated `X/types/` files; the path-4 test; the Send success control moved to `send.integration.test.ts` (the comount file calls its mount "an operation window shape"); keep `reads()` 0 in `:342-360`; run the two network specs locally (CLAUDE.md § Quality gates); the inference corrections (alarm re-creation, the first-connect read, vitest's default isolation). Not taken: dropping the `AppFeeLine` and `FeeRaisedCard` edits (D4).
- **Round 2, Codex (resumed): conditional approve**, high confidence; the accepted fixes check out (allowlist complete, test locations feasible, red proof feasible, gate flags right, KL1's traces match). Accepted: (b) must exempt the helper's own declaration (P2); step 6's reconnect count made explicit, with an unmount between the A/B mounts (P3).
- **Round 3, Codex (resumed): approve**, high confidence; both round-2 edits verified, no remaining finding.
- **Fix loop round 1** (diff `e7192fa8d..015b9e896`): Codex (gpt-6.1-sol, high, session `01a15c7d-193a-7592-8350-3a9649be89b7`) findings; Opus `general-purpose` findings, no production bug. Both found the P2: the boot-capture check exempted `popup/index.ts` and matched one literal, so a commented-out capture or a re-capture in a router hook passed (demonstrated in memory); now it reads the boot module's code lines. Accepted P3s: comment trims in the guard, the fake, `listState.read` and `window-document.ts`; `listState.read` keeps its old catch-all after `adopt` (Opus); a popup-document control for the fake's `refreshes()` on the `OperationCard.fee` harness (Opus); one file-scope `reconnect` helper. Fixes in `185a64cd0`.
- **Fix loop round 2** (Codex, resumed): clean, high confidence. Converged.
