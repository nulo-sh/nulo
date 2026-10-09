# code-followups-1 — recon

Recon read the tree at `86a89c5` (origin/dev) with three Explore agents (sonnet): two checked every
entry of `follow-ups.md` against the code and today's merged PRs, one mapped the code-only candidates.
The driver checked the CI evidence and the Aztec CLI wrapper by hand. Absence claims name what was
searched.

## Reuse map

| Capability needed | Existing code found | Verdict |
|---|---|---|
| Wait for a DOM state with a bounded Node-side loop | `waitForTransferStage` / `expectStageHeld` (`tests/e2e/fixtures/send-burst.ts`) | adapt: the new awaiting-card wait takes their 250 ms loop shape |
| Read a journal row's stage from storage | `readTransferRows` (`fixtures/send-burst.ts`) | reuse-as-is |
| Hold a service snapshot in a component test | `RecentActivityView.test.ts` hoisted `H.getOperations` / `H.getTasks` mocks; orphan-task positive control at :339 | reuse-as-is |
| A page-level "loaded" attribute | `data-settled` (`TokensView.vue:422`), `data-arrivals-seeded` (`popup/app.vue:456`), `data-active-account` on the same root (`activity.vue:172`) | adapt: same pattern; `data-arrivals-seeded` is not the History read (it seeds from the shell's own read) |
| Wait on a loaded attribute in e2e | `waitForSelector('[data-arrivals-seeded="true"]')` (`network/incoming-arrival.test.ts:233`) | reuse the pattern |
| Activity page component test | `src/popup/pages/activity.test.ts` (mocks the clients) | reuse-as-is |
| Assert a dApp call succeeded in e2e | `assertPgOk`, `waitForPgResult`, `callExpectingNoPopup` (`fixtures/playground.ts`) | reuse-as-is |
| A test budget for the fee-juice fixture | `fee-methods.test.ts:85` gives the same `feeJuiceImportedExtension` 300 s | reuse the value |
| Wait for CSS transitions before a screenshot | `shotSend`'s own "popup still entering" wait (`fixtures/send-page.ts:215-221`) | adapt: same bounded, catch-and-continue shape |
| Real Token artifact in a node test | `utils/token-transfer-vocabulary.real.test.ts`, `call-decoder.test.ts` (`// @vitest-environment node`, `encodeArguments`, `FunctionSelector.fromNameAndParameters`); fixtures in `call-surface.test.ts:7-13` | reuse-as-is |
| Per-test timeout in `bun test` / vitest | `hang`'s trailing `30_000` (`test-soak/cli.test.ts:83`); `presto-policy.test.ts:78,88` | reuse the pattern |
| vite-plugin-pages exclude test | `apps/extension/scripts/pages-options.test.ts` | extend |
| `.ts` imports in a tsconfig-checked config | `allowImportingTsExtensions` in `apps/extension/tsconfig.json:17`, `packages/third-party-notices/tsconfig.json:8` | reuse the setting |
| Account scope key | `accountScopeKey` (`wallet/services/account/spec.ts:55`), already imported by `auth-registry/service.ts` and `token-balance/service.ts`; `full-backup-restore.ts` already imports from that spec | reuse-as-is |
| Legacy IndexedDB sweep tests | `pxe/service-sweep.test.ts`, `pxe/service-idb-delete.test.ts`; the erase rule "never keyval-store" in `pxe/service.test.ts:262-278`; `crs-cache.sources.test.ts` | adapt (rewrite the reclaim cases to "never deletes") |
| Test-list comparison across runs | vitest `list --json`; none in the repo (searched `vitest list`, `--reporter=json` in `scripts/` and `package.json` files) | build new: a throwaway comparison, not committed |

No new shared helper is built. The awaiting-card wait stays local to its one test file (one file reads
the card); a fixture would be premature.

## The boot line (Arc 1)

- `gh run view 37855435855 --log` (Chrome network lane, every job green): `[aztec-node] Error: Address
  already in use (os error 98)` appears once in each of the 8 jobs, 45-55 ms after `Starting local
  Aztec network` (job-log timestamps).
- Network-lane history since this repository's CI started (2026-10-06): 50 runs per lane, one rerun
  (run 37790178426, attempt 1, "heavy / concurrent-confirm"), searched with
  `gh run list --workflow <lane> --created '>=2026-09-15' --json attempt,conclusion`. The two nightly
  runs and the soak workflow have no failure or rerun.
- The rerun's failure (job log): `same-token-concurrent-sends.test.ts:320`, `expected null to be
  'queued'`, then `waitForFreshBalanceRow` in the next test (`burst-account.ts:69`, from `:378`).
- Wrapper: `~/.aztec/versions/6.0.0-rc.1/node_modules/@aztec-labs/aztec/scripts/aztec.sh`, `start`
  case with `--local-network`: `ANVIL_PORT=${ANVIL_PORT:-8545}`, `anvil --silent --port "$ANVIL_PORT" &`,
  then `aztec start "$@"` (`exec node …/dest/bin/index.js`). `dest/local-network/local-network.js`
  spawns no anvil (searched `anvil`, `ANVIL_PORT`, `spawn`).
- `apps/extension/scripts/e2e/resolve-ports.ts` header: the old "sticky boot flake" was the node's own
  `.listen()` losing a released port to an outgoing connection; the static window below the ephemeral
  floor fixed it, and `classify-exit.ts` maps a boot failure to exit 86 for one bounded retry.
- `.claude/skills/e2e-testing/SKILL.md` §4 already calls the line cosmetic; flake-ledger row 4 owns
  `waitForExecuteApprovable: … feeMethod:null` (open).
- Hydration order: `RecentActivityView.vue` `onMounted` awaits `loadExecutingTaskSnapshot()` before
  `resnapshotJournal()` (:710-735); the orphan-task card (:808-817) and the fallback card (:818) pass no
  `stage`; `TransactionAwaitingCard.vue` omits `data-stage` when `stage` is null (pinned by its test
  "data-stage is omitted when stage prop is null/default").

## Overlap map (files this lane must not touch)

| Owner | Files relevant to follow-ups |
|---|---|
| PR #55 (backup download) | `ConfirmPopup.vue`, `export/full.vue`, `passkey-backup.test.ts`, backup e2e helpers |
| PR #56 (settings by task) | settings pages, `reset.vue`, `change-password.vue`, `Header.vue`, `auto-imports.d.ts`, `useContactImportExport.ts`, `tests/e2e/fixtures/helpers.ts`, `sw-resilience.test.ts`, `selfpay-phase.test.ts`, `store-captures.test.ts`, `CLAUDE.md`, `.claude/skills/e2e-testing/SKILL.md` (two route names in §2) |
| PR #58 (emoji refusal) | `wallet-sdk/background.ts`, `session-revocation.ts`, `dapp-session/*`, verify window |
| PR #60 (security-fixes-1 arc 3) | merged as `a6c2fb5` on 2026-10-09, during this plan's audit; its files are free again |
| PR #61 (security-fixes-1 close-out) | `implementations-plan/{index.md,follow-ups.md,lessons.md,archive/index.md}`, its archive |
| PR #55, PR #56 (documents) | #55: `implementations-plan/index.md`; #56: `implementations-plan/{follow-ups.md,lessons.md,archive/index.md,.gitignore}`, `.claude/skills/{e2e-testing,chrome-extension-debug}/SKILL.md` |
| hardening-2 (in flight) | `wallet-bridge` dispatcher, `aztec-runtime/src/pxe/artifact-registry.ts`, `purge-rows.ts`, `token-balance/*`, `profile/*`, `wallet-core` migration, manifest CSP, `tests/e2e/fixtures/extension.ts`, `scripts/e2e/agent.sh`, the e2e workflows |

No code, test or config file of this lane appears in these. The shared documents (the planning
index, `follow-ups.md`, `lessons.md`, `archive/index.md`, the e2e-testing skill) do; plan.md §
File-level change map says how each is handled.

## Candidate deep-dives (verified)

- `isMinting`: computed at `TokensView.vue:200`; only reader is the fixture `TokenCard.test.ts:60`
  (searched `isMinting`, `minting` in `apps/*/src`, `apps/*/tests`, `packages/*`).
- `SelectNetworksPopup`: mounted at `PopupManager.vue:26,90`; no `open("select_network")` anywhere
  (searched `select_network`, `SelectNetworksPopup` in `src`).
- `--displace`: set at `PopupCard.vue:36`; no `var(--displace)` reader (searched `displace` in `src`).
- `EditNetworkPopup.vue`: `url` form field (:38), `urlTerm` (:42) and the `url` key in `rebase` (:61)
  are never rendered; the template shows only a read-only note.
- `full-backup-restore.ts:368,392,401,456` build `${chainId}:${address}` (the last for the balance
  re-link), the exact string `accountScopeKey` returns.
- `pxe/service.ts:79-94,263,313-331`: the `keyval-store` reclaim runs only after every legacy `pxe/*`
  IndexedDB at boot is gone; its tests are `service-sweep.test.ts:116-143` and
  `service-idb-delete.test.ts` (:53, :191, :225-263).
- `presto-banners` is a `<presto-banner>` web component rendered on the onboarding Presto page
  (`onboarding/pages/presto.vue:6-7`), so its bump is a screen change.
- `TooManyPendingError`: thrown at `execution-lane.ts:336,394`, turned into `-32005` only in
  `error-envelope.ts:150`; `rpc-cancel.ts:89-104` carries six classes, not one; surviving the port
  would change what a dApp receives.
- `jsonStringify` (`wallet-core/src/utils/serialization.ts`) is an accepted complexity function
  (score 23) copied from `@aztec-labs/foundation/json-rpc`; merging its two Buffer branches diverges
  from upstream for no behaviour change.
- Playground: `apps/playground/src/sections/simulation.ts:41,115-135` sends `balance_of_public`
  (`abi_public`, `abi_view`) through `executeUtility`; the installed Token artifact's
  `balance_of_private` is `is_unconstrained: true` with `abi_utility`, one argument `owner`.
  `err-scope-and-cap.test.ts:29` reuses the button's test id and expects a refusal before any popup.
  The wallet's utility path never registers the target contract (`view-executor.ts:342-374`) and the
  PXE refuses an unregistered one, so the button would fail on `balance_of_private` too; the phase
  section's register-then-read controls (`phase.ts:170-182`, `:230-237`) are what the passing tests use.
- `apps/extension/scripts/pages-options.ts:19` excludes `**/*.test.*`; vite-plugin-pages 0.33.3 calls
  `micromatch.isMatch` without `dot` on watcher events (`dist/index.js:89`, `:796-815`), so a path
  under `.claude/worktrees/` never matches; `**/.*/**/*.test.*` does (checked with the installed
  micromatch).
- `apps/landing/vite.config.ts:5` imports `./scripts/headers` with no extension; the landing tsconfig
  lacks `allowImportingTsExtensions`.
- `.storybook/main.ts:83` passes `dirs: ["../src/components"]`, resolved against the Vite root
  (`apps/extension`), so it names `apps/src/components`; `preview.ts:44` returns early when `chrome`
  exists.
- `scripts/ci-cd/test-soak/cli.test.ts`: five `runFixture` cases (:59, :71, :86, :93, :100) run under
  `bun test`'s 5 s default; `runFixture` allows 60 s; `hang` sets its own 30 s.
- `src/e2e/config.test.ts`: eight cases import `./config` in their bodies after `vi.stubEnv`.
- The two skills: `aztec-update/SKILL.md:206-208` ("3-4 concurrent shards are safe") against
  `e2e-testing/SKILL.md:65-67` ("nor two `e2e:agent` runs there"); `agent.sh:36,50,68` and both global
  setups' `pkill -f "chrome.*--load-extension=<path>"` support the second.
- Test-count nondeterminism: no registration found that varies by run (env-gated:
  `batched-view-simulation.integration.test.ts:36`, `price/real-data.test.ts:16`, `files.test.ts:36`,
  `webdriver-ownership.test.ts:100`; computed `test.each`: `footprint-coverage.test.ts:112`,
  `service.scenarios.test.ts:5269`). Needs a measurement.

## Triage

Verdicts are at `86a89c5`. Dispositions: *build* (this lane), *delete* (resolved; the close-out
deletes it), *rewrite* (the close-out cuts the entry to the part that is left), *keep* (not this
lane, reason given). Line numbers that moved are listed after the table and are not rewritten in
`follow-ups.md`, to keep the shared file's diff small.

| n | Entry | At 86a89c5 | Disposition |
|---|---|---|---|
| 1 | The gas link | holds | keep: External trigger: unleashed has no public mainnet bridge yet |
| 2 | Unleashed publishes no privacy notice | holds | keep: Owner call in another repository |
| 3 | Fetch the default token list instead of building it in | holds | keep: Owner-parked: the fetched token list |
| 4 | A V6 mainnet seed and its fee policy | cannot tell | keep: External trigger: no V6 mainnet yet |
| 5 | An automated live-transaction smoke | cannot tell | keep: Owner call ("if wanted") |
| 6 | `presto-banners` 1.2.0 | holds | keep: presto-banners renders the onboarding banner, so a bump can change a screen |
| 7 | Every other failure before a dApp send is claimed reads "Popup closed early" | holds | keep: Copy call; background.ts is in PR #58 |
| 8 | A dApp cannot widen a contract-classes grant | holds | keep: Product change for its own plan; dispatcher is hardening-2's |
| 9 | Repeated scope refusals pile up in Activity | holds | keep: Changes which Activity rows show |
| 10 | `shotSend` takes its second theme mid-transition | holds | build: Arc 2, Phase 4 |
| 11 | The unit switch, Max and Refresh quote are mouse-only | holds | keep: Accessibility wave |
| 12 | A press on Max while the destination holds the focus is lost | holds | keep: Changes the page or the press: owner call |
| 13 | In USD mode a long derived amount wraps the line under the field | holds | keep: Owner layout call |
| 14 | At rest the USD field hides its tail | holds | keep: Owner layout call |
| 15 | A wrapped review line indents its symbol 4 px | holds | keep: Cosmetic call |
| 16 | The fiat notice can say the price moved when it did not | holds | keep: Copy call |
| 17 | The address-keyed fee maps outlive a deleted profile off the live path | holds | keep: Needs its own decision; reset.vue is in PR #56 |
| 18 | An Allow the watchdog displaced mid-un-hide leaves receipts hidden under `trusted` | holds | keep: Accepted residual with a BUG PIN |
| 19 | A pin or a token-deletion cleanup racing a profile deletion can recreate its pinned-tok… | holds | keep: Accepted residual; needs a fencing design |
| 20 | Two of the token add's compensations delete by id without lock ownership | holds | keep: Needs its own decision (entry says so) |
| 21 | Recovery phrase and Change password have no submit latch | holds | keep: Changes what a double-click does; change-password.vue is in PR #56 |
| 22 | Two keyboard focus rings do not show | holds | keep: Accessibility wave |
| 23 | Send's token card has no focus style of its own | holds | keep: Accessibility wave |
| 24 | A restored token with a receipt opens the first-receive prompt | holds | keep: A person would notice the prompt no longer asking |
| 25 | The first-receive trust prompt shows no explorer link | holds | keep: New UI |
| 26 | A deleted default token returns after a full-backup restore on a fresh install | holds | keep: Backup-slice design or an accepted gap: owner call |
| 27 | `AccountService` has no chain-scoped critical section | holds | keep: Design: a new critical section, not a small change |
| 28 | Creating a profile waits for activation with no identity check or deadline | holds | keep: A deadline needs a failure surface the owner has not chosen |
| 29 | Six surfaces still read a token without a decimals getter in base units | holds | keep: Changes how an edge-case value is formatted; "when next touched" |
| 30 | A mint outside the standard shapes shows no amount | holds | keep: Feature for its own plan |
| 31 | A listed token's mint figure rests on its method's name and arity | holds | keep: Feature for its own plan |
| 32 | An unlisted token's mint shows no amount | holds | keep: Feature for its own plan |
| 33 | The authwit popups keep the 60 s ceiling | holds | keep: Removes a visible false failure; what the popups show while waiting is the owner's |
| 34 | A definitive "won't go through" | cannot tell | keep: Design; needs an upstream field |
| 35 | A checked dApp send can leave its public authwit out of the revoke index | holds | keep: The revoke list would show a new row |
| 36 | A chain prune after inclusion is caught by no send path | cannot tell | keep: Design with its own copy |
| 37 | A failed card beside a settled row for the same send | holds | keep: Owner UI call |
| 38 | A neutral snack style for "Send not confirmed" | holds | keep: Owner UI call |
| 39 | The status colours' contrast in the light theme | holds | keep: Accessibility wave |
| 40 | A node's refusal at the send line reads "Not confirmed yet" for 30 minutes | holds | keep: Copy and design |
| 41 | A checked record shows no tx hash or explorer link | holds | keep: Owner UI call |
| 42 | Home's error snack covers the row above the tab bar | cannot tell | keep: Owner UI call |
| 43 | The Revoke authorizations and authwit registry popups never check the sponsor | holds | keep: Needs an estimate or a probe in each popup: design |
| 44 | A dApp's embedded sponsor payment is never checked | holds | keep: Owner UI decision |
| 45 | The dApp window offers no way to get fee juice when nothing can pay | holds | keep: Owner UI call |
| 46 | A Confirm before a sponsor-paid estimate returns skips the funding check | holds | keep: Accepted as today's behaviour |
| 47 | A re-enabled Sponsored row reads "free" before it is checked again | holds | keep: Copy call |
| 48 | The sponsor notice is not announced | holds | keep: Accessibility wave |
| 49 | A hand-added sponsor that falls back to Nulo's names the payer by its row title | holds | keep: Copy call |
| 50 | **Owner decision: a failed first price fetch still ends Home's hero in "$0.00" and "pri… | holds | keep: Owner decision |
| 51 | Revisit the private-origin fee order when a funded sponsor ships on mainnet | cannot tell | keep: External trigger: a funded mainnet sponsor |
| 52 | An embedded fee payment with no `maxFeesPerGas` commits an unpadded cap | holds | keep: Design (FPC budget assertion) |
| 53 | The fee-estimate admission cap frees a slot while its simulation still runs | holds | keep: Design (offscreen ack) |
| 54 | Two `BATCH_SIZE = 12` constants size the batched balance views | holds | keep: balance-job-queue.ts is hardening-2's |
| 55 | The connect page's header names the active network, not the dApp's | holds | keep: Owner UI call |
| 56 | The waiting connect window still says the dApp "wants to connect to your wallet" after… | holds | keep: Copy call |
| 57 | The connect step bar's empty half barely shows | holds | keep: Accessibility wave |
| 58 | A connect window whose wait fails closes with no message | holds | keep: Owner UI call |
| 59 | The swap to the emoji check in the connect window is likely not announced to screen rea… | holds | keep: Accessibility wave |
| 60 | A dApp refused for want of a current Terms acceptance opens nothing in the wallet | holds | keep: Owner UI call |
| 61 | A `sendTx` leg inside a dApp `batch` gets no queued journal record while it waits | holds | keep: Design; background.ts is in PR #58 |
| 62 | **Ask upstream whether `@aztec/wallet-sdk` should refuse a discovery `requestId` that c… | cannot tell | keep: Upstream question |
| 63 | The playground's "executeUtility (balance_of_public)" button can never succeed, and the dApp cannot tell why | holds | rewrite: the typed refusal only (dApp-facing text: owner); the button stays as the failing probe two suites use, and a working utility call already has its controls (see 101) |
| 64 | Deleting one profile's dApp-session row tears down another profile's live channel on th… | holds | keep: background.ts and session-revocation.ts are in PR #58 |
| 65 | Home's two view links are mouse-only | holds | keep: Accessibility wave |
| 66 | From a token's page, History should open filtered to that token | holds | keep: Owner UI call |
| 67 | The two view links fail contrast | holds | keep: Accessibility wave |
| 68 | Screen readers hear History's and Settings' title twice | holds | keep: Accessibility wave; settings/index.vue is in PR #56 |
| 69 | Home's section header against the drawing | holds | keep: Cosmetic call |
| 70 | Onboarding ignores the stored theme | holds | keep: A person would notice |
| 71 | Paste a token address into the Holdings search to add it | holds | keep: Feature |
| 72 | Add token shows the PXE store's developer errors verbatim | holds | keep: Copy call |
| 73 | A password profile's unlock that fails for an unexpected reason shows nothing | holds | keep: Copy call |
| 74 | New incoming public transfers wait on a from-zero history scan | holds | keep: Owner-parked: the tip-first scan |
| 75 | A reorg that re-mines a surviving incoming transfer emits nothing | partly | rewrite: The event is now declared but never emitted; emitting it changes what an open received page shows (owner) |
| 76 | Incoming note rows are never reconciled against the PXE | holds | keep: Design |
| 77 | An opt-in "Privacy maxi" setting | cannot tell | keep: Owner feature |
| 78 | Only transactions get explorer links | holds | keep: Owner UI call |
| 79 | The incoming-transfer pollers call dRPC every 30 s per watched token, on the shared key | holds | keep: Product call |
| 80 | A profile deletion leaves a JSON-broken account row at its canonical key | holds | keep: purge-rows.ts is hardening-2's |
| 81 | The migration engine has no watchdog on `up()` | holds | keep: Decide before the first real migration; migration engine is hardening-2's |
| 82 | An edited Local Network reads "InvalidChain" and drops out of full backups | holds | keep: Owner nice-to-have design |
| 83 | Report the handshake-loss behaviours to aztec-packages | cannot tell | keep: Upstream report |
| 84 | Recovery for installs that already lost a third-party note | cannot tell | keep: Owner call |
| 85 | Nothing stops a second own window for the same flow | holds | keep: A person would notice (focus instead of a new window) |
| 86 | account-switch-isolation's restructuring stages were not built | holds | keep: Design |
| 87 | No network e2e proves two concurrent NO_FROM sends serialize and both confirm | holds | keep: Blocked: no NO_FROM-compatible private call |
| 88 | Owner check: does the Queued card switch macOS Spaces? | cannot tell | keep: Owner check on a Mac |
| 89 | First-party service methods still trust a caller's `profileId` | holds | keep: Owner call |
| 90 | proverless-network-stabilization left three items | holds | keep: Design; the salt sits in workflows hardening-2 edits |
| 91 | Onboarding has no "Grant access" step for Presto on Firefox | holds | keep: Owner UI call |
| 92 | The Ready-handshake transport rework is parked | holds | keep: Owner-parked: the Ready-handshake rework |
| 93 | `ConfirmPopup`'s passkey confirmation is dead | holds | keep: ConfirmPopup.vue is in PR #55 |
| 94 | **A passkey profile created in the page saves a second passkey when its confirmation fa… | cannot tell | keep: A person would notice |
| 95 | **Owner checks on a Mac: does Firefox's toolbar panel survive the file picker, and does… | cannot tell | keep: Owner check on a Mac |
| 96 | Test whether `withStaleAnchorRetry` retires the e2e's 5 s anchor sleep | holds | keep: helpers.ts, selfpay-phase and store-captures are in PR #56 |
| 97 | The skills disagree on concurrent local network runs | holds | build: Arc 2, Phase 5 |
| 98 | `network/incoming-transfers.test.ts:40` sleeps 3 s before asserting zero incoming cards | holds | build: Arc 2, Phase 4 |
| 99 | The strict-mode opt-out restore has no e2e | holds | keep: sw-resilience and settings pages are in PR #56; tied to #24 |
| 100 | `network/price-fixture` keeps a 120 s budget while its fixture bridges Fee Juice over L… | holds | build: Arc 2, Phase 4 |
| 101 | The `sim-methods` case for `executeUtility` never exercises a successful call | resolved elsewhere | delete: `stale-anchor-recovery.test.ts:166-187` (accounts-cap fixture) and `connect-locked-queue.test.ts:51-57` assert an ok executeUtility via `pg-btn-phase-register` then `pg-btn-phase-balance` |
| 102 | Storybook misrenders the extension's components two ways | holds | build: Arc 2, Phase 5 |
| 103 | `TokensView.vue` computes `isMinting` for every token row and nothing reads it | holds | build: Arc 3, Phase 7 |
| 104 | `passkey-backup.test.ts`'s export case is skipped on CI and fails on a fast host | holds | keep: passkey-backup.test.ts is in PRs #55 and #56 |
| 105 | The playground's multicall sends nonces the standard Token refuses | holds (inferred) | keep: Needs a live run to establish, then a playground change: not small |
| 106 | No test runs the real selector hash, the real decoder and `callSurface` together | holds | build: Arc 2, Phase 6 |
| 107 | No e2e shows a discovered authorization's transfer row | holds | keep: Needs a network that publishes the standard contracts |
| 108 | No e2e shows a private transfer's row | holds | keep: A new playground control plus a private-balance e2e: not small |
| 109 | CI builds no Storybook | holds | keep: Adds CI minutes to quality-status: owner call |
| 110 | An earlier green copy of a required check stands while a later run of the same head works | holds | keep: Accepted window |
| 111 | **A PR run decides from its own event's snapshot, and runs can reach their concurrency… | holds | keep: CI design; the lane workflows are hardening-2's |
| 112 | The e2e aggregators trust GitHub's fold of a shard matrix | holds | keep: Unverified report; the aggregators sit in workflows hardening-2 edits |
| 113 | `hoist = false` is still not set | holds | keep: Its own gate after a soak |
| 114 | Two auto-import globals outlive their exports | holds | keep: auto-imports.d.ts is in PR #56 (stale names now at :277 and :284) |
| 115 | `packages/resolve-asset` still tests on Node | resolved | delete: Resolved: CLAUDE.md records resolve-asset as a Node exception |
| 116 | Retire vitest's interop stopgap | holds | keep: Waits on vitest 5.0.1 or later |
| 117 | Nine `z.nativeEnum` calls use an API zod 4.4.3 deprecates | holds | keep: dapp-session/spec.ts is in PR #58, and the nine calls move together |
| 118 | Five declined third-party-notices items wait on their triggers | cannot tell | keep: External triggers |
| 119 | `vite dev` in an agent worktree routes a new test file | holds | build: Arc 2, Phase 5 |
| 120 | The home-path guard runs only as a local hook | resolved | delete: Resolved by #57: scripts/ci-cd/no-local-paths.test.ts runs in test:ci-gating |
| 121 | The store launch's owner steps are open | cannot tell | keep: Owner steps |
| 122 | The auto-unstick switch's next stage is due | resolved | delete: Resolved by #57: unset or empty AUTO_UNSTICK_ENABLED is on |
| 123 | Attest the release zips | resolved | delete: Resolved by #50: release.yml attests the zips |
| 124 | A store-match check | holds | keep: Supply-chain follow-up; design |
| 125 | The Chrome preflight lets a `STAGED` revision through | resolved | delete: Resolved by #57: the Chrome preflight refuses STAGED |
| 126 | The plans `.gitignore` catches only four transcript shapes | holds | keep: Owner call (entry says so) |
| 127 | commitlint accepts a subject CLAUDE.md forbids | resolved | delete: Resolved by #57: subject-case is lower-case |
| 128 | No release step refuses a stable publish while a `«FILL»` placeholder survives in `legal/` | holds | keep: Release-process gate: owner call |
| 129 | Every document log line, debug included, crosses to the worker as an RPC | holds | keep: Design (client-side level gating) |
| 130 | Route the e2e gotchas the lessons rewrite retired into the `e2e-testing` skill | partly | rewrite: Docs routing, not code; the certifying-greens item is already in the e2e-testing skill |
| 131 | Route four retired gotchas to their owners | holds | keep: Docs routing, not code; CLAUDE.md is in PR #56 |
| 132 | Lint and type-check the root `scripts/` tree | resolved | delete: Resolved by #57: scripts/ is under Biome and typecheck:scripts |
| 133 | The landing's Vite config imports `./scripts/headers` without an extension | holds | build: Arc 2, Phase 5 |
| 134 | The fee-cap change's post-audit proposals, to re-check against the tree | cannot tell | keep: Design |
| 135 | A resurrected late-mined authwit transaction leaves its registry row pending forever | cannot tell | keep: Design; no site cited |
| 136 | Accounts deployed under an older artifact than the wallet's aztec.js | cannot tell | keep: Design; no site cited |
| 137 | The full-backup import's yellow warning reads at about 1.6:1 on the light theme (`apps/… | holds | keep: Owner decision |
| 138 | A Retry on the import's errors screen that fails again returns a pixel-identical screen… | holds | keep: Owner decision |
| 139 | The import's error viewer lists networks by id, and onboarding's `View errors` notice s… | holds | keep: Owner decision |
| 140 | vitest 4.1.10 never re-runs a fixture setup that failed: a retry of a test-scoped fixtu… | holds | keep: Waits on a vitest release |
| 141 | A full backup's account-state still carries the contracts every PXE boot registers, onc… | holds | keep: Backup-format design |
| 142 | An import could also skip the profile's own account contracts and Nulo's protocol spons… | holds | keep: Backup-import design |
| 143 | A popup closed during the import's account-state tail loses its per-network outcome: `f… | holds | keep: Owner design; profile service is hardening-2's |
| 144 | Five of `scripts/ci-cd/test-soak/cli.test.ts`'s six fixture cases per engine start a vi… | holds | build: Arc 2, Phase 5 |
| 145 | A static guard against workflow references in code. Nothing yet refuses a new comment t… | holds | keep: A new gate that needs an allowlist for the existing archived-plan citations: design |
| 146 | `apps/extension/src/e2e/config.test.ts` still imports in its timed body and times out u… | holds | build: Arc 2, Phase 5 |
| 147 | Firefox prover-ON `imported-account-execution` overran `sendTransfer`'s 300 s wait with… | cannot tell | build: Arc 1, Phase 3 (an evidence run) |
| 148 | The e2e tree does not type-check: no type gate reads `tests/e2e/**` (only `unresolved-n… | holds | keep: 103 errors to fix first; fixtures/extension.ts is hardening-2's |
| 149 | The legacy boot sweep still deletes bb.js's CRS cache | holds | build: Arc 3, Phase 8 |
| 150 | No CI lane proves in browser WASM, | holds | keep: CI minutes: owner call |
| 151 | An unknown `priorityLevel` from malformed internal popup RPC input | holds | keep: Owner lead: `operation-estimate-reuse.pins.test.ts:344` keeps the throw on purpose |
| 152 | `safe_json_rpc_client` returns `undefined` for a null-like node result before schema pa… | holds | keep: Upstream code |
| 153 | Account RPC params are not schema-validated | holds | keep: Not small: a params schema per account method, and its texts are copy |
| 154 | The SDK `chainInfo` decoder folds non-canonical fields onto canonical composites | holds | keep: Changes which dApp sessions resolve |
| 155 | An NBSP in an RPC URL | holds | keep: A stricter URL check refuses input in Settings |
| 156 | `TooManyPendingError` does not survive a port | holds | rewrite: survival changes the error a dApp receives (-32005); Arc 3, Phase 7 corrects `operation-result.ts:12-18`'s "sole failure" comment (six classes ride the channel, `rpc-cancel.ts:94-100`) |
| 157 | Async drift kept as today | holds | keep: Kept as today |
| 158 | Decode drift kept as today | holds | keep: Kept as today |
| 159 | The incoming arms differ in dedupe order, call counts and record timing | cannot tell | keep: Design |
| 160 | Program-level deferrals | cannot tell | keep: Deferrals, each with its reason |
| 161 | Fee and reuse helpers that would add an await or move reads | cannot tell | keep: Would add an await or move reads |
| 162 | Row lifecycle | cannot tell | keep: Design (the cited names are not found; code moved) |
| 163 | Popup reducers the harness cannot stage | holds | rewrite: Arc 3, Phase 7 removes SelectNetworksPopup and the unread --displace; the reducers and useContactImportExport.ts (PR #56) stay |
| 164 | Visual shells left local | cannot tell | keep: Visual shells: cosmetic |
| 165 | Smaller residue | holds | rewrite: Arc 3, Phase 7 removes the EditNetworkPopup url field and the unused NetworkInfoSchema, and uses accountScopeKey in restore; the Buffer encoders (an accepted-complexity copy of upstream) and RestoreData (narrowing it needs guards in its readers) stay |
| 166 | BalanceView's add has no id dedupe | holds | keep: Owner UI drift (section rule) |
| 167 | Enter at a failed full-backup import re-runs the restore while its button is disabled | holds | keep: Owner UI drift |
| 168 | The import-contacts sheet pushes the EXISTING tag off the card edge | cannot tell | keep: Owner UI drift |
| 169 | Change password reveals current, new and repeat together | holds | keep: Owner UI drift; PRs #55 and #56 |
| 170 | Journal rows have two profile rules and three network rules | cannot tell | keep: Owner UI drift |
| 171 | Popup stacking drift | cannot tell | keep: Owner UI drift |
| 172 | Detail pages | cannot tell | keep: Owner UI drift |
| 173 | LogsViewer appends the first live log line to the last loaded line | holds | keep: Owner UI drift (the log viewer's text) |
| 174 | The extension's test count was nondeterministic, | cannot tell | build: Arc 2, Phase 6 (a measurement) |
| 175 | A recurring Firefox network-lane flake | partly | rewrite: Arc 1 refutes the port-collision attribution (the boot line prints on every green shard); the feeMethod:null failures stay open with flake-ledger row 4 |
| 176 | Home's in-progress card shows "0" for an empty `amountRaw` | holds | keep: Owner UI call |
| 177 | Contacts import keeps outer spaces in staged names | resolved | delete: Resolved by #41: staging uses sanitizeContactName and contactNameKey |
| 178 | Two more popups compare names untrimmed | holds | keep: A person would notice a duplicate now blocked |
| 179 | NewSenderPopup's own shake ignores reduced motion | holds | keep: Accessibility wave |
| 180 | "Disable animations" stops transitions, not keyframe animations | holds | keep: Accessibility wave |
| 181 | Merge the skeleton shimmer twin | holds | keep: Cosmetic CSS: a visual check for no gain in behaviour |
| 182 | At the 25-character name cap, the contact popups block a duplicate but show only "Maxim… | holds | keep: Design-system decision |
| 183 | Confirm a queued send at once, then estimate and send it when unblocked | cannot tell | keep: Owner-parked: queued same-token sends |
| 184 | dApp sends are not ordered behind earlier sends until inclusion | holds | keep: Owner-parked family: send ordering |
| 185 | Three send-ordering questions carry a working answer | partly | keep: Working answers for the owner; one already in code |
| 186 | Send-ordering residuals that fail as before, never worse | cannot tell | keep: Design |
| 187 | The send chaos run's nightly jobs are advisory | holds | keep: Promote or drop after weeks: owner call |
| 188 | A fee-method click right after a dApp send may not take | cannot tell | keep: Product behaviour |

### Moved citations (recorded, not rewritten)

- 7: `failQueuedForError` callers now `background.ts:1324` and `:1279`.
- 8: the coverage plan is now `dispatcher.ts:772-781`.
- 9: `gc.ts:121-124`; `queued-journal.ts:170-190`.
- 11: Max `AmountCard.vue:442`, unit toggle `:415`, Refresh quote `send.vue:744`.
- 16: `send.vue:744`.
- 19: `usePinnedTokens.ts:178`, `:216-243`.
- 20: `token/service.ts:420`, `:429`, guarded delete `:461`.
- 29: `RecentActivityView.vue:199`, `:354`; `journal/[id].vue:80`; `journal-state.ts:374`.
- 35: `dapp-send-executor.ts:520`.
- 47: `fee-helpers.ts:233-236`. 48: `FeeSettingsCard.vue:925`. 45: `FeeSettingsCard.vue:304-313`.
- 54: `balance-projector.ts:49`.
- 65: `RecentActivityView.vue:765`; `TokensView.vue:379-382`.
- 96: a fifth site, `network/store-captures.test.ts:205`.
- 114: the stale globals are `auto-imports.d.ts:277` (`resolveRestoredActiveNetworkId`) and `:284`
  (`restoreNetworksStage`).
- 148: `tests/e2e/fixtures/extension.ts:468`.
- 156: now `execution/rpc-cancel.ts:89-104`.
- 157: `composables/importPreflight.ts:41`, `composables/importChainSync.ts:115`, `popup/auth-guard.ts`.
- 162: `unsealImportedKey` is now `unsealImportedSigningKeyV2` (`account/service.ts:387`);
  `settleRegistryTx` no longer exists in `apps/` or `packages/`.
- 182: `Input.vue:273-286`.
