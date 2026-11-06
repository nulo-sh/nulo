---
plan: pxe-flag-1
tier: light
status: measured (2026-11-06); D2 hold, recommendation close (owner's call); bridge leg (OA-1) pending
issues: none (a probe on the owner's page 116 pick A, "Measure first, no UI")
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex gpt-6.1-sol high audit round-trip plus one Opus Plan leg
base: origin/dev at 002b76fc7
trunk: dev
post_implementation_hardening: not scheduled
---

# pxe-flag-1: measure PXE's experimental concurrent contract sync, in the lab and on Testnet

The owner asked whether PXE's "pre-compute what needs syncing" flag (`concurrentContractSyncEnabled`) should be on, and picked "measure first, no UI", with three asks: many tokens on a real network, the L1 → L2 bridge, and what repeats (fee juice, token balances) and could be cached. **Phase 1** measures the flag on and off, first in a lab on the local network, then in two builds of the extension on Testnet with a throwaway profile. D2 reads the numbers as **close**, **ship as a Developer toggle** or **hold**. No code ships from this plan: the numbers go into [recon.md](recon.md) § Probe and the report, and a ship verdict names a later lane. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/` unless they name a package.

## Outcome & Quality Bar

- **For whom:** the owner, deciding on the next page whether the flag is worth a lane; and through them, a person whose balances refresh and sends wait on node round trips.
- **Excellent:** (1) each verdict rests on paired numbers per workload that a reader can rerun: round trips, node calls, wall time, the host load and the Testnet block height beside each; (2) the owner's own case, a fresh profile's first sync with many tokens, has its own numbers; (3) the caching question has numbers too: how many node calls a cache or a batched read would save, per refresh and per operation; (4) no key, recovery phrase or node address appears in any log, file or report.
- **Good enough:** the bridge workload runs only if the owner approves the keyed run in time (Phase 1 step 7); the verdict does not wait on it.

## Assumptions

**Facts** (recon.md has every line):
- F1. The flag is a `PXEConfig` key, read once when `PXE.create` builds `ContractSyncService`; it learns per-(address, selector) edges from committed operations only, predicts an edge from its second sighting, and lives in memory.
- F2. A top-level request records no edge; only a nested call does. Speculation starts from the invoked function and from `sync_state`. The contract sync cache is per (contract, scope) and wiped when the anchor moves or any operation is discarded. PXE also caches hash-pinned node reads itself, below which both instruments count (`PXE6/node/caching_aztec_node.js`).
- F3. `simulateTx`, `proveTx` and `executeUtility` return `stats.nodeRPCCalls` (per-method call times, round trips, blocking time) and `stats.timings`, a snapshot taken inside the operation; the operation then waits for its speculative syncs to settle before it commits (`PXE6/operation_lifecycle.js:19-27`), so the snapshot misses the speculation's late calls. The wallet drops the stats (`src/wallet/services/execution/app-facing-results.ts:26, 42`).
- F4. A balance refresh projects 12 tokens per chunk (`src/wallet/services/token-balance/spec.ts:14`): public balances in one direct node simulation, and one `executeUtility(balance_of_private)` per token, which the PXE's queue runs one after another, each with its own block sync (`src/wallet/services/execution/helpers/batched-view-simulation.ts:207-213`).
- F5. The fee juice balance is cached for up to 5 minutes with single-flight dedup, invalidated on settlements and bypassed by a forced refresh (`src/wallet/services/execution/gas-balance-reader.ts:28, 49-106`); its public leg is a direct node simulation and its private leg a PrivateFPC read.
- F6. `agent.sh` can run only vitest files of the network lane against the local network it boots, after a wallet build (`scripts/e2e/agent.sh:84-266`). The Testnet path is the smoke lane with `NULO_E2E_ARTIFACT_RUN=1` and `launchExtension({ live: true, extensionPath })` (prior art `tests/e2e/shipped-token-list.test.ts:125-170`); its egress proxy claims its port in `~/.agents/ports.md` (`tests/e2e/fixtures/egress-guard.ts:14-16`) and refuses every host but the CRS hosts, the Testnet node and the token list (`tests/e2e/fixtures/extension.ts:135`). The smoke config retries twice unless told otherwise (`vitest.e2e.config.ts:30`).
- F7. A new profile starts on Mainnet; on Testnet the wallet seeds the default list's USDC, USDT, EURC and GBPC (`infra/token-list/list.source.json`). unleashed's faucet (`/faucet`) drips SIGNAL and NOISE, public or private, through the wallet's `sendTx` with the SponsoredFPC embedded; it cannot create tokens. A fresh Testnet account needs no fee juice for it.
- F8. unleashed's bridge CLIs refuse any L1 signer but the pinned one; its tools app bridges through an injected EIP-1193 wallet (`apps/tools/src/composables/useL1Wallet.ts:25` there), and its own browser tests answer one from Node (`apps/tools/tests/browser/fixtures/l1-wallet.ts` there). Its Sepolia test ERC-20s are `permissionless-mint`.
- F9. A keyed run executes at the approved commit only: when it receives the secrets, `env-exec` refuses a moved HEAD, a dirty tree (a modified tracked file included), or a HEAD that is no longer a branch tip on the remote (`env-exec` `keyed_pin`, `cmd_receive`); it checks nothing after the start.

**Inferences:**
- I1. Workload (c), a fresh profile's first pass, gains nothing: the graph starts empty and an edge needs two committed sightings, each at a new anchor (a cached contract sync runs no nested call). This says nothing about a whole first session of many operations.
- I2. Workload (b), a refresh, gains little once trained (from its third pass): the registry's `sync_state` can start beside the first token's own sync once per anchor; later tokens hit the cache.
- I3. Round-trip counts on the local network are nearly deterministic, while wall time there hides network latency. On Testnet, a round trip saved is worth about the measured mean round-trip time.
- I4. A profile restored from the throwaway phrase into an empty browser profile is a faithful "fresh profile": same account, the four default tokens seeded, SIGNAL and NOISE absent until imported.
- I5. This shared host (188 cores, other leads) moves CPU-bound timings more than round-trip counts; every run records load1.

**Asks** (working assumption in force):
- A1. The bridge needs the owner to approve one keyed run and fund the throwaway L1 key it prints ([OWNER-ASKS.md](OWNER-ASKS.md) OA-1). Until then, every other workload runs; after six hours without approval the record finishes without it.
- A2. Testnet sessions run in the smoke lane, not through `agent.sh`, which cannot reach Testnet (F6); the smoke lane claims its port in the same registry. Working assumption: this keeps the spawn rule's purpose.
- A3. A ship verdict is a recommendation; the owner decides on the next page, and a Developer toggle is a UI change with its own sign-off.
- A4. "Many tokens" on Testnet is six (the four defaults, SIGNAL and NOISE), four of them empty until the bridge runs; the faucet cannot create more. The lab carries the scale: 12 tokens. Working assumption: the record names the count beside every number.

## Decisions

| id | decision | why | rejected |
|---|---|---|---|
| D1 | Scratch instruments under `~/.cache/nulo-backlog/pxe-flag-1/patches/`, applied for the runs and removed after; the one exception is D9's harness | nothing measured ships; prover-warm-1's method | committing a stats logger |
| D2 | **Stages** a person waits on: the estimate and the proof of a send, a refresh pass, a first sync. Each stage's wall time is measured outside the PXE, with the node calls and round-trip spans a counting proxy over the PXE's node sees through settlement (F3); returned stats are diagnostics. The saving is the median over pairs of (off − on) per stage, and every paired delta is published. **Ship as a Developer toggle:** on Testnet, a stage saves ≥ 1 s at the median with every pair but one agreeing in sign; node calls on that stage rise ≤ 5 % on Testnet and in the lab; the lab shows fewer spans on that workload; no operation fails with `Speculative syncs failed`. **Close:** every stage saves < 0.5 s, or a speculative failure has no external cause. **Hold:** anything else. Lab spans saved × Testnet's mean span time is reported as a rough magnitude beside each Testnet median, not as a check. "On by default" is out of this probe's reach: a failed speculation fails the user's operation, its warning puts a contract address into every log buffer, and no measurement retires either | a person notices a second; per-stage timing keeps a proof's tens of seconds from hiding a sync saving | a whole-send denominator; a round-trip-only bar; the returned stats as the metric; an on-by-default verdict |
| D3 | Pairs alternate the arm order (on-off, then off-on); run k compares only with run k. In the lab an untimed minter transaction precedes every measured operation or pass, and the harness asserts that the arm's anchor moved; on Testnet blocks arrive on their own and the block number is recorded. Passes and sends 1-2 are training and reported apart from 3 onward; on Testnet a pass counts as trained only after two earlier completed passes at distinct anchors, which the instrument records per operation. On Testnet every (c) and (b) session runs before any send, in four ABBA pairs, so a growing account history cannot favour one arm; the (a) sessions follow. Every run records load1 | the off arm also warms across runs; an edge needs two committed sightings at new anchors (I1) | fixed order; untrained passes pooled with trained ones |
| D4 | Lab: one scratch vitest file in the network lane through `agent.sh` (`NULO_E2E_PROVERLESS=1`). Per run two `EmbeddedWallet`s that differ only in the flag, both with `autoSync: true` as the extension's PXE has it (`packages/aztec-runtime/src/pxe/chain-runtime.ts:181-185`), each with its own genesis-funded account, the same 12 tokens and private balances, the SponsoredFPC, and the counting proxy. (a) is `EmbeddedWallet.sendTx` (a stub-account simulation, then the proof), the shape the extension's own estimate takes (`packages/aztec-runtime/src/pxe/service.ts:530-560`); its extra explicit sync is the same on both arms. (b) and (c) call the PXE's `executeUtility` directly, 12 at once, as the extension does (F4) | the extension's shape at a cost the lab can repeat | the PrivateFPC (its funding is a bridge per arm); one shared account (notes would cross arms) |
| D5 | Extension: two plain `bun run build:chrome` builds, prover ON, Presto absent. Both carry the instrument; the on build also adds `PXE_CONCURRENT_CONTRACT_SYNC_ENABLED: "true"` to `processEnvDefine` (`vite.shared.ts:50`). The instrument wraps the PXE's node and the PXE: each operation's wall time, outcome and returned stats, every node call by method and argument digest, and the flag as `getPXEConfig()` read it, in an in-page buffer read over CDP | the research note's Route A; the recorded flag catches a define that did not land | a Developer toggle before the numbers |
| D6 | Throwaway profiles live in memory only: one harness process creates a profile, reads its words through the wallet's own reveal screen, and restores them into an empty browser profile for each measured session (I4). The words are never printed, logged or written to a file, and no screenshot is taken on those screens | each session is a fresh install of the same account, so (c) repeats; nothing outlives the process | a mode-600 phrase file (a same-user process could read it); one reused browser profile (its PXE store warms) |
| D7 | Caching numbers from the node-call records, per pass or operation, in three classes: (i) calls that repeat an earlier method and argument digest within it; (ii) of those, reads a cache could serve (hash-pinned answers PXE's own cache misses, content-addressed contract classes), apart from conditional ones (a block named by number, a contract's current instance) and from tip and freshness queries; (iii) an upper bound for one batched read of N balances: the per-operation block-sync calls and spans times N − 1. Calls are not wall time; each class also gets its spans | answers "might make sense?" without counting necessary freshness checks as waste | a cache prototype; counting every repeat as removable |
| D8 | Testnet traffic: four faucet drips, three sends per session, the bridge's deposits and claims; nothing scripted beyond the measurement | the lane's traffic rule | more pairs on Testnet than the lab already gives |
| D9 | Bridge: one keyed run of a smoke-lane harness that creates its own throwaway profile in memory, then drives the tools app's Send wizard with Nulo and an EIP-1193 wallet answered from Node (the shape of unleashed's fixture, F8). The wallet answers on Sepolia only, sends only zero-value transactions to an allowlist (the four test ERC-20s, Permit2 and the bridge's router and portals, copied from unleashed's `testnet-bridge.json` at 7de51e7 into the harness), signs typed data only for Permit2 with an allowlisted spender, and refuses everything else. That narrows what a compromised tools page could get signed but does not bound it (an allowed token can approve any spender): the exposure is the throwaway key's Sepolia ETH and free test tokens, a known limit. The template names a generated throwaway key, the existing Sepolia RPC reference and `NULO_E2E_RETRY=0`; the harness builds its signer from the key, deletes the variable before Chrome starts, prints the key's address and waits up to 60 min for Sepolia ETH. The tools app's extra direct hosts come from its own Content-Security-Policy `connect-src`, read at run time and never printed, and only its sessions get them. It bridges USDC, USDT, EURC and GBPC privately as "Token + gas" (a fresh account holds no private gas, and the wizard refuses a token-only private claim without it, `SendWizard.vue:97-106` there), claims two in each build (a functional characterization, not pairs), then runs trained (b) on the funded profile in both builds. Every source it reads (the harness, the egress option, the template) is committed on this branch (F9) and the run starts from a detached worktree at that commit under `.claude/worktrees/`; the branch is not pushed again until the run has started or been abandoned, and the next commit removes the harness. A deposit the run leaves unclaimed is a known limit (throwaway funds) | the keyed-run protocol pins committed sources; a user's own bridge path; nothing signs outside the bridge | unleashed's CLIs (pinned signer); its SDK's `depositL1` and `claimToken` (private to unleashed, and a claim needs a Wallet, which Nulo exposes only to a page); an L1-only script whose claims run later (the tools app resumes only its own journal, or a backup sealed in unleashed's format) |

## Phase 1: the measurement

**Warning:** never print or log the throwaway phrase, the L1 key, the Testnet node address or any `https://` node address; never open `src/wallet/constants/network-endpoints.ts`.

1. Run the lab: `NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/_lab-pxe-flag.test.ts` from the worktree root; the test also sets `retry: 0`. After an unmeasured warm-up in which every token reads non-zero on both arms: (b) six pairs of a pass of 12 `executeUtility(balance_of_private)` calls; (a) five pairs of one private transfer paid by the SponsoredFPC; (c) three pairs of a new PXE's first pass. Write one JSON line per operation to the scratch dir.
2. Build the off and on extensions (D5) and copy each `dist/chrome` to the scratch dir. Check that only the on bundle holds the env key, then remove both patches.
3. Commit D9's harness, the egress option and the template; push; add the detached worktree and run `bun install --frozen-lockfile` there. Run the harness's address-only dry run (an L1 wallet that knows a public address and signs nothing) through the wizard, "Token + gas" selected, up to its first signature, under `env -i` with the keyed run's PATH and the template's plain variables. Then file the request, and put its id and command in OWNER-ASKS.md and STATUS.md.
4. Run the sessions harness from the lane worktree: `NULO_E2E_RETRY=0 NULO_E2E_ARTIFACT_RUN=1 bun run test:e2e -- tests/e2e/_probe-pxe-flag.test.ts --retry=0` from `apps/extension`. Setup, with the off build: create the profile, switch to Testnet, wait for the four defaults, drip SIGNAL and NOISE public and private from the faucet, add both, and save a light Holdings capture under `~/.cache/nulo-backlog/pxe-flag-1/shots/`.
5. In the same process, run four ABBA session pairs (D3), each in an empty browser profile: restore; switch to Testnet; time (c4) until `[data-testid="tokens-list"][data-settled="true"]` with no `token-balance-loading` (four tokens and fee juice); import SIGNAL and NOISE and time (c6) until all six settle; run (b) as six refreshes, each timed from `tokens-menu-refresh` until `tokens-refreshing` clears and the instrument shows the pass's last operation; read the offscreen JS heap before and after (b). Then run three session pairs of (a): restore, then three private SIGNAL sends paid by the SponsoredFPC, the estimate and the proof timed apart.
6. Count every `Speculative syncs failed` rejection and every `Speculative sync of` warning, from the instrument and the log viewer. Count only; never print the lines.
7. Poll `env-exec status <id>` at most once an hour for six hours from filing. If it runs, record its claims and its funded (b).
8. Remove the instruments, write recon.md § Probe (paired deltas, medians, load1, block heights, the caching table, the token counts per workload) and D2's verdict, and commit the removal of D9's harness.

**Validation gate:** every measured operation has its outside wall time and node calls; each build's records show the flag it was built with; every workload has its pairs (lab 6/5/3; Testnet 4 for (b) and (c), 3 for (a)); `git status --porcelain` shows only `implementations-plan/pxe-flag-1/`; `bun run check:plans` passes on the staged files. A run that fails for a host reason is rerun once and said so.

## UI impact

None. No screen, copy, row or format changes. The Holdings capture is evidence for the owner, not a change.

## Security & Adversarial Considerations

- **Secrets:** the L1 key exists only in 1Password and in the keyed process's environment; the run's log is masked. A throwaway phrase lives only in its harness process's memory (D6); a same-user process on this shared host could still read that memory, a known limit for valueless Testnet profiles. The template carries `op://` references only and the harness reads the RPC from its environment, so no node address lands in a committed file.
- **The keyed run's L1 wallet** signs only D9's allowlist on Sepolia. Code on the tools page could still misuse an allowed target, so the throwaway key's Sepolia ETH and test tokens are exposed to that page, a known limit. The pin does not cover the live page, the extension builds or `node_modules`.
- **Privacy:** the flag's warning line names a contract inside a finished string at `warn`, which `trim()` cannot redact; the probe only counts it. Speculation re-queries contracts this PXE already used, so the node learns little new.
- **Hostile dApp:** the research note's risk 3 (a dApp teaching an edge whose sync later fails) stays unverified; the probe does not try it. If a run shows it, it goes to a private advisory, never a public issue.
- **Traffic:** one throwaway account's drips, sends and claims (D8).

## Delivery

No PR from the probe. The plan commit, the record commit and the revert of D9's harness sit on `worktree-pxe-flag-1`, pushed once after step 8 (and once at step 4 for the keyed run). The orchestrator decides the close-out PR, docs-only, which archives this plan.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 002b76fc7, with:
- **Review loop:** none; no code ships. Codex reads the record once with the plan before the report, at `high`, and its verdict is logged in lessons/phase-1.md.
- **Close-out:** a docs-only PR when the orchestrator asks: the Outcome block, `git mv` into `archive/`, the index line moved; merge `origin/dev` in first and read `index.md` and `lessons.md`.
- **Teardown:** after that merge, `agent-worktree done pxe-flag-1 --merged`; remove the detached worktree of D9 first.
- **Approval boundaries:** a ship verdict stops at the report; the owner decides on the next page.

## Audit verdicts

**Round 1** (2026-11-06; consult log in [lessons/phase-0.md](lessons/phase-0.md)).
- **Codex (gpt-6.1-sol, high): reject.** (1) the lab's wallet ran with `autoSync` off and an explicit sync, unlike the extension; (2) the returned stats are a snapshot taken before the speculative syncs settle; (3) no warm-up and no mechanism to move the anchor, so cached syncs record no edges; (4) D7 counted every repeat, freshness queries included, and recon overstated the fee juice cache; (5) (c) was four tokens and the claims were unpaired, under labels that said otherwise; (6) the phrase file broke the quality bar; (7) the L1 wallet signed whatever the page asked; (8) every source a keyed run reads must be committed, the pin holds only until the start, and the smoke config retries twice; (9) D2 had no rule for dispersion.
- **Opus 5.5 (Plan): conditional approve.** Same (1), (3), (5) and retries; also: D2 divided a sync saving by a whole send's time, so per-stage timing and a lab estimate; Testnet sessions drift as sends grow the account's history (ABBA, sends last); the keyed PATH runs another Node, so rehearse under it; the tools app needs every host its CSP names; the key must leave the environment before Chrome starts; discarded operations clear the whole sync cache; PXE caches hash-pinned reads below which both instruments count.
- **Accepted:** all of Codex's nine; from Opus, per-stage D2 with the lab estimate as a guard, ABBA with sends last, the keyed-PATH rehearsal, CSP-derived hosts, the key removed before Chrome, `NULO_E2E_RETRY=0` everywhere, the F2 and recon corrections.
- **Disputed and settled:** Codex kept whole wall time primary; Opus wanted the sync part and round trips. D2 now judges each stage a person waits on by its wall time, and the lab estimate must agree in sign. **Rejected:** Codex's SDK runner and Opus's L1-only script (D9's last column says why); Opus's six-token (c) with the bridge's canonical USDC and WETH (they are L1 tokens; the six are named in A4).

**Round 2** (Codex, resumed): **conditional approve**, conditions: (1) Testnet passes were labelled trained without anchor evidence; (2) a fresh account cannot claim a private token-only deposit (`SendWizard.vue:97-106` there), so the first claim needs gas; (3) the allowlist narrows but does not bound what a compromised page gets signed; (4) block-number and current-instance reads are not cache-safe; (5) the lab estimate is no sign check, and the call ceiling covered only the lab. All accepted: trained only after two passes at distinct anchors; every deposit "Token + gas", rehearsed; the exposure stated as a known limit; D7's conditional class; the estimate reported as a magnitude and the ceiling applied on Testnet too.

**Round 3** (Codex, resumed): **approve**. All five round-2 conditions verified; no new material defect.

## Seeds (not run; orchestrator-owned)

```
/goal implementations-plan/pxe-flag-1/plan.md: Phase 1's gate pasted with D2's verdict, the numbers in recon.md § Probe, the keyed-run id in OWNER-ASKS.md, and no PR.
```

```
/loop 60m Drive implementations-plan/pxe-flag-1 from plan.md: one e2e run at a time; poll the keyed run at most hourly; finish without it after six hours.
```
