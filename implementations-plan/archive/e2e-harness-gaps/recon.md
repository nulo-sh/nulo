# Recon: e2e-harness-gaps

Read at `origin/dev` 4a357b7 (#238 merged as 8099368). Three read-only explorers (sonnet): a batched reuse sweep over nine capabilities, a map of the network e2e run path, and a map of the playground and coverage surface. The planner verified every load-bearing claim below against the tree; where it re-ran something, the command is named.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Port draw for a run | `apps/extension/scripts/e2e/resolve-ports.ts`: `reservePort` (random static window below the ephemeral floor, bind-tested, Fetch bad ports skipped), `reservePortPack`, `main()` writes `.e2e-state/ports.json` and releases the sockets | **adapt**: skip ports the host registry lists, claim the pack there before writing `ports.json` |
| Host port registry client | none in the repo (searched `ports.md`, `.agents`, `registry`, `ports.lock` over the tree; the only hit is a note in `archive/code-followups-2/plan.md`) | **build new**, in the live file's format (below). Justification: no client exists, and the host file has one live writer whose format and lock a second writer must match exactly or the lock excludes nothing |
| Atomic state writes | `apps/extension/tests/e2e/lockfile.ts` `writeLock` (tmp + rename) | **reuse as-is** for `owned.json`; the registry rewrite happens under its own lock file instead |
| Group stop of a live leader | `apps/extension/tests/e2e/process-group.ts` `killProcessGroup` (SIGTERM, SIGKILL after grace, `stopped`; a group whose leader exited is never signalled) | **reuse as-is**; the new marker sweep runs after it |
| Ownership that survives a dead leader | `apps/extension/tests/e2e/fixtures/browser/ownership.ts`: random UUID in `NULO_E2E_LAUNCH`, `/proc/<pid>/environ` scan (`ownedProcesses`), re-check before each signal (`signalIfOwned`), two empty scans to call it stopped (`stopOwned`), owner identity by pid plus `/proc` start time (`readStartTime`) | **adapt**: lift the marker primitives into a shared module; Firefox launches and sandbox services both use it |
| Orphan reap | `lockfile.ts` `killOrphanByPid` (SIGTERM to `-pid` only when the leader lives; no escalation), `reap.ts` (`e2e:reap`), `global-setup.ts` `reapPrior` | **adapt**: marker sweep when the lock carries markers; the pid path stays for a lock written before markers existed |
| L1 identity | `apps/extension/tests/e2e/anvil-probe.ts` `probeAnvil` (hex block number and chain id 31337) | **reuse as-is**; the adoption decision around it changes |
| Stale anchor handling | `packages/aztec-runtime/src/pxe/stale-anchor.ts` `withStaleAnchorRetry`, used by `pxe/service.ts:507` for four chain-reading operations | **reuse as-is**; the e2e sleep it was meant to replace is what goes |
| Background kill in e2e | `stopBackground` (driver seam, `fixtures/browser/index.ts`), `readLivenessBaseline` / `waitForWorkerLiveness` (`fixtures/helpers.ts`) | **reuse as-is** |
| Port reconnect re-read | `apps/extension/src/popup/pages/settings/index.vue:49-60`: `configService.onConnected` re-reads after the first connection | **reuse the pattern** for the Lock page if the investigation confirms the same cause |
| Observing a transient DOM state | e2e waits poll (`waitForFunction`, 100-250 ms); `helpers/backup-export.ts` arms an in-page capture before the click | **build new** (test-only): an in-page `MutationObserver` armed before the click. Justification: polling cannot see a card that mounts and unmounts between two polls, and a build-armed hold gate would add a new e2e build flag to five places |
| Run-level progress signal | none (searched `watchdog`, `stall`, `heartbeat`, `NODE_OPTIONS`, `max-old-space`, `execArgv`, `resourceLimits` over the tree, the e2e configs and `_extension-network-e2e.yml`) | **build new** |
| Type gate for tests | `apps/extension/tsconfig.scripts.json` (covers `scripts/**`, which reaches some `tests/e2e` modules through imports); `scripts/e2e/unresolved-names.test.ts` | **adapt**: a third tsconfig modelled on the scripts one |
| ESM config loading | `"type": "module"` in every workspace but the root and `apps/extension`; `.mts` configs `vite.chrome.config.mts`, `vite.firefox.config.mts` | **adapt**: the landing's form for the extension; a `.mts` rename for the root `vitest.base.ts` |
| Private transfer call | `apps/playground/src/sections/transactions.ts` `buildTransferExec` (public only); `sections/phase.ts:133` `mint_to_private` | **adapt** |
| NO_FROM private call | `@aztec-labs/noir-contracts.js` ships `SponsoredFPC` (installed in `apps/playground`); its `sponsor_unconditionally` takes no arguments and reads no sender | **adapt** (new playground control) |
| Delegated pull rig | `apps/extension/tests/e2e/fixtures/aztec.ts:765` `deployDelegatedPullRig` (noir-contracts `Token` + `Crowdfunding`) | **reuse as-is** |

## The host registry as it is today

`~/.agents/ports.md` exists on this host with live rows. Its format, written today by at least three writers (`bridge-sandbox-*` and `tools-e2e-*` from `alejoamiras/unleashed`, and an ad-hoc `hd-shots-*`):

- Header: `# Ports registry — who is RUNNING what, where (atomic-locked)`, then `| port | service | owner (run) | worktree | pid-hint | claimed |` and `|---|---|---|---|---|---|`.
- One row per port: `| <port> | <label>-<service> | <runId> | <repo root> | <pid> | <ISO time> |`.
- Lock: `~/.agents/ports.md.lock`, created with `open(..., "wx")`, deleted after the rewrite; a lock whose mtime is older than 15 s is treated as abandoned and removed.
- Those writers release their own rows on a clean exit and never reap dead ones: rows from 2026-09-30 to 2026-10-08 still sit in the file, every pid-hint dead.

The `my-stack` skill's template describes a different file layout (`runId | service | port | pid | worktree | started`) and a different lock (`mkdir ~/.agents/ports.lock`). Two writers on two locks exclude nothing, so the live format and lock are the contract here, not the template.

## Verified claims, per issue

- **#169.** 11 holds: `resolve-ports.ts` never touches a host registry. 12 holds as the #234 comment narrowed it: `process-group.ts:55-59` leaves a group whose leader exited unsignalled, and `killOrphanByPid` returns early on a dead leader. 13 holds as narrowed: `ensureAnvil` (`global-setup.ts:343-349`) adopts any chain-31337 listener on the port; the same adopt-on-probe runs for the node (`ensureAztecNode`) and the playground (`ensureDevServer`).
- **#155.** The salt half is done (8099368). The watchdog and memory cap are absent. Data that sizes them: network `testTimeout` 30 s, `hookTimeout` 300 s, browser `protocolTimeout` 300 s, job `timeout-minutes: 30`; per-test timeouts in `tests/e2e/network/*.test.ts` run up to 3,000,000 ms, above the job budget. The last 60 runs of `pr-extension-network-e2e.yml` hold no failure (48 success, 12 cancelled), so no recent run shows the stall.
- **#161.** Holds, and wider than listed: five sleeps in four files (`fixtures/helpers.ts:1261`, `network/fee-methods.test.ts:127,192`, `network/selfpay-phase.test.ts:381`, `network/store-captures.test.ts:205`). `helpers.ts:1261` sits in `sendTransfer`, called by seven network files. `store-captures` runs only with `STORE_CAPTURES` set, on Chrome, and writes into the tracked `apps/extension/store/captures/*.png`.
- **#162.** The skip holds (`sw-resilience.test.ts:137`). "Its navigation is stale" does not hold: the test navigates to `#/popup/settings/lock`, which is the current route (`settings/index.vue:209`, `legacy-routes.ts:8`). The page's own comment (`lock.vue:158`) says its config reads can hang after a worker restart.
- **#163.** Holds (`passkey-backup.test.ts:111`, the 15 s poll at `:144`). The file carries no browser gate.
- **#194.** Holds. A probe tsconfig over `apps/extension/tests/e2e/**/*.ts` (kept outside the repo) reports 461 errors: 312 are the fixture context type (`Record<string, never>` at `fixtures/extension.ts:718,722`) collapsing every spec's context; about 150 remain (TS2769/TS2352 on `chrome.storage` reads inside `page.evaluate`, TS7006 implicit `any`, and others), more than the record's 103.
- **#186.** Holds, reproduced: `bun --bun vitest run` in `apps/extension` prints "ESM syntax in a file loaded as CommonJS" for `vitest.config.ts`, `vite.shared.ts`, `../../vitest.base.ts` and `tests/e2e/retry-error-reporter.ts` (Vite 8.2.1, Node 24.21.0). The root `vitest.base.ts` warns from every workspace that imports it (eleven configs), because the root `package.json` has no type.
- **#153.** Holds: `tx-sendTx-noFrom.test.ts:69` accepts `ok` or `error`, and the playground's NO_FROM button sends a public call, which `tx-request-builder.ts:349` refuses after approval.
- **#164.** Holds: `transactions.ts:64` passes nonce `i` with `from` equal to the sender, and the standard Token's `authorize_once` refuses a nonzero nonce when sender and `from` match (the artifact's error string, and `OperationCard.wire.test.ts:174`). `tx-sendTx-multicall.test.ts` passes once any record reaches `simulating`, so it cannot see the refusal.
- **#165.** Holds. The playground sends no private transfer. `NULO_E2E_STANDARD_CONTRACTS` is set by no workflow, so the delegated-authwit file never runs in CI. Inference to test: `@aztec-labs/standard-contracts` 6.0.0-rc.1 documents that test environments seed `PublicChecks` at genesis, which would let that file run on the local network.

## Collisions and pins

- `scripts/ci-cd/behavior-gating.test.ts` pins workflow job names, the network step's name and its `NULO_E2E_RESULTS_FILE` expression, the lane partition and retry-0 values. Changes to `agent.sh`, `resolve-ports.ts` or `global-setup.ts` trip none of them.
- `scripts/ci-cd/workflow-refs.test.ts` scans every tracked file for milestone or review-round words in comments.
- `scripts/e2e/resolve-ports.test.ts` imports `reservePort`, `reservePortPack`, `ephemeralFloor`, `staticWindow`.
- `scripts/e2e/process-group.test.ts:71-80` pins that `killProcessGroup` never signals a leaderless group; the marker sweep is a separate mechanism, so the pin stays.
- Dedicated network jobs list files by name in four workflows and `behavior-gating.test.ts`; a file that stays in the five-shard pool needs no workflow edit.
- `.e2e-state/` is gitignored and uploaded on CI failure.
- Docs that go stale: `apps/extension/tests/e2e/README.md:101,165,236` (the manual `pkill -f "anvil.*--port"` kills every agent's anvil), `.claude/skills/e2e-testing/SKILL.md:30,89-91`, `CLAUDE.md` § Working in this repo (links `vitest.base.ts`).
- Lane holds: `store-captures.test.ts` is this lane's before `home-onboarding-chrome` (#170, #181); `nightly.yml`, `release.yml`, `pr-extension-network-e2e.yml` and `apps/extension/package.json` are this lane's before `ci-release-supply`.

## Open work read

`gh pr list --state open`: #241 and #245 (accessibility-1, closing). `gh issue list` was read for the lane's thirteen; #218 owns same-source concurrent sends and is not this lane's.
