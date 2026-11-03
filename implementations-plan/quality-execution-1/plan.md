---
plan: quality-execution-1
tier: light (the spawn prompt names it; one Codex audit at high on gpt-6.1-sol, plus one Opus Plan lens)
status: arc 1 merged (#1585); arc 2 in review
issues: "#1442, #1438, #1440 (arc 1, Closes); #1455, #1472 (arc 2, Closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens
base: origin/dev at 93b9a2dfb
trunk: dev
post_implementation_hardening: not scheduled
---

# quality-execution-1: one lane surface, one registration home, one copy of each send step

Five quality findings on the wallet's execution hub, all refactors a person never notices. Arc 1 reshapes `ExecutionService`: the registry import cycle (#1442), the executors' restated lane and read deps (#1438), the registration block (#1440). Arc 2 removes the send paths' copies (#1455) and the execute window's second confirm list (#1472). The owner's word on these findings (2026-11-02) is the go: "If they are worth doing and legit. I'd do them." Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** the next contributor who changes a lane signature, adds a read the send executors need, changes how a dApp registration is admitted, or adds a hold on Confirm.
- **Excellent:** (1) each of those is one edit: a lane signature lives once, on `ExecutionLane`; a read dep is declared and wired once; a new Confirm hold goes in one computed. (2) Behaviour is byte-identical where a person or a dApp can observe it: same screens, copy, wire answers, stored rows, log lines, and the same call order on every fenced path, proven by the existing tests plus the order pins phase 4 adds first.
- **Good enough:** the dormant authwit block stays in the facade; `ExecutionService` stays the dispatcher.

## Assumptions

**Facts** (citations in recon.md):
1. `beginJournal` is restated on `DappSendExecutorLane` and never called by the executor; `ExecutionLane.beginJournal` stays live through `claimOrCreateJournal`.
2. Both `.name` reads are the only value use of each class across the cycle; Biome reports both edges, and only `import type` cuts them.
3. The registration handlers read no lane, executor, cache, sequencer or tip-gate field.
4. `NO_WAIT` already has one home, `awaitRequested`, used by both dApp paths (#1485). That part of #1455 no longer holds.
5. #1501 already landed #1472's decode helpers; the open parts are the confirm list and the grant computeds.
6. The execute window's `approve()` has one caller, the footer's native button, which is disabled whenever the template list holds.
7. No smoke e2e opens the execute or fee window. The network files in each gate drive one representative path per touched flow; the unit pins cover the branches they miss.
8. `ExecutionCoordinator.proveAndSend` awaits `recordTransaction` and discards its value (`execution-coordinator.ts:355`).

**Inferences:**
- I1. `Pick<ExecutionLane, …>` keeps every `vi.fn()` lane fake compiling, except the literals that still carry `beginJournal` (excess property); the gate proves it.
- I2. The shared deps can share one interface whose `getActiveProfile` returns `{ id }`; the transfer deps narrow it to `ProfileInfo`, a legal override, and the service's literal uses `satisfies` so its real types reach both.

**Asks:** none for the owner. Panel questions are in the decision ledger.

## Architecture & Implementation

**Arc 1 — the facade (branch `worktree-quality-execution-1`).**

- **Phase 1, #1442.** `execution/service.ts` imports `AuthRegistryService` with `import type` and reads it by `services.get<AuthRegistryService>(AUTH_REGISTRY_SERVICE_NAME)` (`get` cannot infer a `Pick`, as at `service.ts:893`); its field becomes `Pick<AuthRegistryService, "assertWithinCap" | "recordPendingAuthwits">`. `auth-registry/service.ts` turns its `@/wallet/services/execution/service` import into one `import type { ExecutionService, … }` and reads the service by `EXECUTION_SERVICE_NAME` from `execution/spec`. `TxRequestBuilder`'s registry parameter becomes `Pick<AuthRegistryService, "assertWithinCap">`. No runtime change: both constants equal the classes' `static name`, and the composition tests register by `.name`. Root `package.json`'s `lint` adds `apps/extension/src/wallet/services/execution apps/extension/src/wallet/services/auth-registry` to its `noImportCycles --error-on-warnings` step, so the cycle cannot come back; the `complexity-budgets` skill's cycle-check line names the new paths.
- **Phase 2, #1438.** `wireExecutors()` builds `ExecutionLane` and `TxRequestBuilder` first (`wireLaneAndBuilder()`), then one shared-deps literal, then the transfer, dApp-send and view executors. New `execution/shared-send-deps.ts` holds `SharedSendDeps`: the eleven deps both send executors declare (ten reads and `addTransaction`), with the dApp widths (`getActiveProfile(): Promise<{ id: string } | undefined>`, `getPendingForAccount(): { hash: string }[]`) and the member docs that today sit in both interfaces. `TransferExecutorDeps extends SharedSendDeps` and narrows `getActiveProfile` to `ProfileInfo` (it calls `requireActiveProfile`); `DappSendExecutorDeps extends SharedSendDeps`. Both lane interfaces go: the deps take `Pick<ExecutionLane, …>` (7 names; 13 without `beginJournal`) and the service passes `this.lane`. Tests drop the `beginJournal` fakes and the two `not.toHaveBeenCalled` pins, which the `Pick` now enforces at compile time.
- **Phase 3, #1440.** Pins first, through the facade's public `executeOperations` so they survive the move unchanged. (a) In `register-counts.composition.test.ts` (bb-free): a dApp `register_token` dispatched under an authorized fence reaches `tokenService.addTokenAuthorized` with that fence by identity. (b) In `register-contract-account.real.test.ts` (Node environment; a keyed registration derives keys through Poseidon, which a composition test may not load, `tests/COMPOSITION-TESTS.md` D6): a dApp's keyed `aztec_registerContract` reaches admission with the app's origin and the authorized fence by identity; a refused admission writes neither the account nor the contract; an admitted control writes the account, then the contract. The facade is built through its own `init` over stub services. Then new `execution/registration-executor.ts`: `RegistrationExecutor` with `RegistrationExecutorDeps` in `ViewExecutorDeps`' shape and field names, typed narrow: `networkService: Pick<NetworkService, "getNetwork">`, `pxeService: Pick<PxeServiceClient, "getContractInstance" | "getContractArtifact" | "registerContract" | "registerSender" | "registerAccount">`, `tokenService: Pick<TokenService, "parseTokenInterface" | "addTokenAuthorized">`, `profileService: Pick<ProfileService, "captureExecutionFence">`, `dappSessionService: Pick<DappSessionService, "admitDappRegistration">` (type-only import). The five handlers, `registrant`, `admitDappRegistration` and the `Registrant` type move verbatim; the only edit is `this.x` to `this.deps.x`, and `registrant`'s `this.captureFence()` becomes `this.deps.profileService.captureExecutionFence()`, the call `captureFence` makes. The dispatch arms keep `await this.registration.registrant(origin, authorizedFence)` before the handler. The stale TSDoc at `service.ts:1226-1235` goes. The seven tests that cast the facade build `new RegistrationExecutor({...} satisfies RegistrationExecutorDeps)`; their assertions do not change. As built, the fakes are cast (`as never`): they are partial stand-ins that cannot meet the full `Pick` shapes, and they were as untyped through the facade's private fields. `execution/README.md`'s file map gains the module.

**Arc 2 — the send paths and the windows (branch `quality-execution-1-a2`, off `dev` after arc 1 landed; D10).**

- **Phase 4, #1455.** Pins first, each red if its extraction were wrong: the full reuse-arm order `getNetwork < getNode < getPXE < assertFence < getAccountContract`, then the fence re-check, on both executors (no test pins `getNode`/`getPXE` today); NO_FROM's history row with a failing `addTransaction` (the send's error and its journal stage as today); distinct `gasLimits` and `teardownGasLimits` sentinels, and absent gas settings, in the existing planner and NO_FROM projection tests (today they pin only the fees and the padding). Then three extractions, one commit each:
  - `gasFeeOptionsOf(gasSettings)` exported from `operation-planner.ts` (the four gas fields and `gasPadding: 1`); `feeOptionsOf` and `prepareNoFrom` write their payer fields first and spread it after, so each object keeps today's keys in today's order. `embeddedPaymentOf(route)` in `utils/fee-detection.ts` is the one embedded collapse, used by `detectEmbeddedFeePayment` and `feeOptionsOf`.
  - NO_FROM's `recordTransaction` becomes `this.sentTxRecorder(sent)`, built where its `feeChoice` starts today (before `leaveLine()`, so the sponsor lookup still overlaps the prove), with `nonce: Fr.ZERO`, `feePaymentMethod: EXTERNAL`, `pendingPublicAuthwits: []`, `feeChosenBy: "app"`; `indexGrants` returns before any write on an empty list. The NO_FROM row of the characterization at `dapp-send-executor.test.ts:2509-2523`, which pins that this callback resolves to `addTransaction`'s value, is retired in the same commit: the coordinator discards that value (Fact 8). The row, failure, journal and order assertions stay.
  - `resolveLiveHandles(deps, fence, networkId, accountAddress)` beside `fenceChecks` in `execution-coordinator.ts`, in its style (a function over the deps), called by both reuse arms; `shared-send-deps.ts` stays type-only. Its order is the arms' order today. `onBuilt` and the scopes stay in the dApp arm.
- **Phase 5, #1472.** Pin first, in `execute/index.test.ts`, with every other hold cleared: a processing error of type `error` disables Confirm, a `warning` does not. Then `execute/index.vue`: one `confirmBlocked` computed holding every hold on Confirm except the fee pick (cancelled, init incomplete, no operations, metadata unread, payer short, estimates awaited, token flag, grants pending, grant refusal, and `processingError?.type === 'error'` exactly, so a warning never holds it). The template disables on `confirmBlocked || needsFeeSelection`. `approve()` returns on `isLoading || refusal || confirmBlocked`, then keeps its fee-pick warning branch. `display-calls.ts` gains `awaitsGrantDecode(op, decoded: boolean)`, true when the operation carries grants and `decoded` is false: the execute window calls it inside its `.some(...)` with `decodedGrants.has(i)`, the fee window with `!!decodedGrants`. `grantRefusal` stays: both windows already call the shared `grantRefusalRow`. After the move, one more case pins the deliberate direct-call change: `approve()` refuses on a processing error.

**File-level change map.** Arc 1: `execution/{service,tx-request-builder,transfer-executor,dapp-send-executor}.ts`, `auth-registry/service.ts`, new `execution/{shared-send-deps,registration-executor}.ts`, `execution/README.md`, root `package.json` (`lint`), `.claude/skills/complexity-budgets/SKILL.md`; tests `register-counts.composition.test.ts` (the two pins), `dapp-send-executor.test.ts`, `feesettings-invariant.test.ts`, `service.characterization.test.ts`, `service.class-id.test.ts`, `register-{bounds,token,contract-void-conformance}.test.ts`, `register-contract-account.real.test.ts`, `service.fence-entry.test.ts` (as far as it reaches the moved handlers). Arc 2: `execution/{operation-planner,dapp-send-executor,transfer-executor,execution-coordinator}.ts`, `execution/utils/fee-detection.ts`, `popup/windows/execute/{index.vue,display-calls.ts}`, `popup/windows/fee/index.vue`, their tests. All paths under `apps/extension/src/wallet/services/` or `apps/extension/src/popup/windows/`.

**Alternatives not taken** (full reasoning in the ledger): live handles on `TxRequestBuilder` (D5); deleting the window's unreachable fee warning (D7); a registrant captured inside each handler (D4); widening the cycle lint to `src/wallet` (D2).

## Security & Adversarial Considerations

- **Threat model.** A hostile dApp drives registrations, sends and authwit grants over the wallet-sdk; a lock, a profile switch or a deletion can land between any two awaits. The refactor moves code on the paths that hold those lines, so the risk is a moved read or an added await, not new input.
- **Invariants each phase keeps, with their proof:** the fence re-check after every account lookup (reuse-arm pins, phase 4); one `node.sendTx` with `legal.assertCurrent()` right before `assertLive()` (`legal/call-sites.test.ts`; no moved file calls `assertCurrent`); a dApp registration's registrant captured before the handler's first await, admission before a keyed account registers (admission checks the deletion epoch, not session liveness, as today), the current-versus-original class binding, strict versus fallback artifact parsing, the SDK's `void` return (the retargeted registration tests, `register-counts.composition.test.ts`); Confirm never enabled in a state it is disabled in today, and `approve()` refusing in every state it refuses today (the window tests). `approve()` also refuses on a processing error, and a combined hold now silences its fee warning: both states already disable the button, its only caller (Fact 6).
- **Input validation:** unchanged; every parse moves verbatim. **Crypto, supply chain, least privilege:** no new dependency, no crypto, no permission. **Logs:** no log line's content changes.

## Phases and gates

Every gate runs from the worktree root. A test command is `cd apps/extension && bun --bun vitest run <paths> --retry=0`. Pass: exit 0 for each command, no test skipped that ran on the base.

- [x] **Phase 1 (#1442).** Gate: `bun run lint`; `bun run typecheck:all`; `./node_modules/.bin/biome lint --only=suspicious/noImportCycles apps/extension/src/wallet/services/execution/service.ts apps/extension/src/wallet/services/auth-registry/service.ts` prints no diagnostic; tests `src/wallet/services/execution src/wallet/services/auth-registry src/wallet/services/network-reset src/wallet/services/dapp-interaction`.
- [x] **Phase 2 (#1438).** Gate: `bun run lint`; `bun run typecheck:all`; tests `src/wallet/services/execution` (composition files included, which prove the wiring and the builder's order).
- [x] **Phase 3 (#1440).** Gate: the two new pins green before the move and after it; phase 2's gate, plus tests `src/wallet/services/legal src/wallet/services/dapp-session`; `grep -nE "private async (executeRegister|executeAztecRegister|registrant|admitDappRegistration)" apps/extension/src/wallet/services/execution/service.ts` prints nothing (grep exits 1, the one command whose pass is not exit 0).
- [x] **Arc 1 end.** `bun run audit:vue`; `bun run test:all`; `bun run audit:dup` (production clones and dup lines no worse than base: 184 / 8768); `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/contracts-register.test.ts tests/e2e/network/data-registerSender.test.ts tests/e2e/network/register-token.test.ts tests/e2e/network/tx-sendTx-noFrom.test.ts tests/e2e/network/transfers.test.ts` on Chrome (the network config retries twice unless `NULO_E2E_RETRY` says otherwise; `tx-sendTx-noFrom` is proverless-gated, so the run is proverless, as CI's shard pool is); `bun run check:plans` after staging.
- [x] **Phase 4 (#1455).** Gate per extraction: the new pins red on a deliberately wrong order (shown once in `lessons/phase-4.md`, then reverted), green after; tests `src/wallet/services/execution src/wallet/services/legal` (the FPC byte-parity test in `fee/strategies-structural.test.ts` included); `bun run lint`; `bun run typecheck:all`.
- [x] **Phase 5 (#1472).** Gate: the error/warning pin green before the move and after it; tests `src/popup/windows/execute src/popup/windows/fee`; `bun run lint`; `bun run typecheck:all`.
- [ ] **Arc 2 end.** Arc 1's end gate, with the network files `tx-sendTx-default.test.ts tx-sendTx-noFrom.test.ts tx-sendTx-feePayer.test.ts tx-sendTx-delegated-authwit.test.ts transfers.test.ts` on Chrome and `tx-sendTx-default.test.ts` on Firefox (`NULO_E2E_BROWSER=firefox`), each with `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0`.

## Decision ledger

- D1. One lane for three issues: arc 1 lands #1442, #1438 and #1440 together, as the issues ask; arc 2 stacks on it (its live-handle helper extends arc 1's `SharedSendDeps`).
- D2. The cycle fix is guarded by adding the two service directories to `bun run lint`'s cycle step (Opus O3): they hold no other cycle. All of `src/wallet` would first need the task and logger cycles cut: out of scope.
- D3. `SharedSendDeps` (not `ExecutionReadPorts`, not `SendReadDeps`): the tree names every such interface `*Deps`, and the set holds a write (`addTransaction`) and the fence capture, not only reads (Opus O7).
- D4. The registrant stays captured at the dispatch arm, before the handler runs, as the issue's merge check asks; the handlers keep `(op, registrant?)`, so the tests that pass a hand-made registrant keep their calls.
- D5. The live-handle helper is a function over the shared deps beside `fenceChecks`, not a `TxRequestBuilder` method (both reviewers agree): same order, no new executor dependency, no construction-order coupling for the transfer executor, and the executor tests' fakes keep pinning it. Cost: the executors keep `getNode`, `getPXE` and `getAccountContract`.
- D6. `gasFeeOptionsOf` lives in `operation-planner.ts`, the home of the projection and of the priority-fee fix's comment.
- D7. `approve()` keeps its fee-pick warning, as the issue says, though the disabled button makes it unreachable from the window; removing copy is not this lane's call.
- D8. PR #1568 merged (`00895dbb1`) without touching the confirm list; arc 2 merges `origin/dev` as usual. #1472 stays in arc 2 rather than a third PR off `dev` (Opus O6 rejected): the lane brief asks for at most two PRs, the second on the first, and one close-out home.
- D9. `awaitsGrantDecode` takes one operation and a boolean (Codex R1, Opus): the fee window has no index; `grantRefusal` stays as is.
- D10. Arc 1 squash-merged before arc 2 began, so arc 2 branched from `dev` at `cf9ed1e40` as `quality-execution-1-a2` and ships as one PR to `dev` (no stack), with the close-out as its last commits. As built: `approve()` reads the fee-pick warning's condition from `needsFeeSelection` instead of a second copy of its expression, and the reuse-order pins share `tests/helpers/call-sequence.ts`.

## Audit verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 (`gpt-6.1-sol`, high) | conditional approve | C1: NO_FROM's record-return characterization retired with its reason (Fact 8); C2: gas-limit sentinels pinned before the projection moves; C3: `NULO_E2E_RETRY=0` on every e2e command; `grantsAwaitDecode` on one operation (D9); Fact 7 narrowed; the shared set named as eleven deps | none |
| Opus Plan lens | conditional approve | O1: dispatch-arm pins before phase 3, grep gate fixed; O2: `services.get<AuthRegistryService>`; O3: the two directories join the lint's cycle step (D2); O4: NO_FROM's recorder built where its fee choice starts; O5: the `approve()` differences stated in the PR body; O7: `SharedSendDeps`, four gas fields, today's key order; O8: `data-registerSender`, `tx-sendTx-feePayer` and the legal tests join the gates; D5: helper beside `fenceChecks`; D8 updated (#1568 merged) | O6's third PR for #1472 (D8) |
| Codex final (fresh) | conditional approve | F1: the keyed-registration pin moves to the Node-environment real test (a keyed registration needs Poseidon), with a refused and an admitted control; the token-fence pin stays in the composition file; F2: an error/warning Confirm pin before phase 5 moves the list; the phase 3 grep's exit code stated; admission's fence scope stated | none |
| Codex final (resumed) | approve | none; F1 and F2 verified, no regression | none |
| Arc 1 Codex R1 (`gpt-6.1-sol`, high, on `51a692426..502420dc6`) | approve | none; no findings (moved methods byte-equivalent apart from the receiver, registrant capture, admission order and fence threading unchanged, the re-pinned digest recomputed) | none |
| Arc 1 Opus review (`opus`) | approve | R1: the executor's module doc states live behaviour only, and no longer says a registration takes no journal record (a token add writes one); R4: the refused-admission pin names `ScopeViolationError.CODE` | R2: `satisfies` on the retargeted fakes (they cannot meet the full `Pick` shapes; recorded at phase 3); R3: info, no change |
| Arc 1 Codex R2 (resumed, on `bd464a4c8`) | approve | none; the Opus fixes verified, no regression | none |
| Arc 2 Codex R1 (`gpt-6.1-sol`, high, on `cf9ed1e40..501fbc21e`) | approve | C1: NO_FROM's sponsor lookup pinned before the line's first `leave`; C2: comment trims (the fee-pick cast, `confirmBlocked`, two restating one-line docs, a narrating NO_FROM line) | none; noted without change: the helper's return and NO_FROM's empty index await add settlement hops, every later check still runs |
| Arc 2 Opus review (`opus`) | approve | O1: the same trims; O2: `resolveLiveHandles`' doc no longer ties the network reads to the fence's profile; O5: the phase-4 lesson's edit count | O3: bigint caps in the NO_FROM sentinel pin (NO_FROM's fingerprint JSON-encodes them, so they arrive as strings); O4: retiring the shared recorder's return pin (predates the arc, still holds) |
| Arc 2 Codex R2 (resumed, on `0d277dcfe`) | approve | none; the fixes verified, no regression | none |

## Delivery

- **Arc 1** (phases 1-3): branch `worktree-quality-execution-1` to `dev`, `gh pr create` (the stack's base layer), ready, no labels at creation. Title: `refactor(execution): one lane surface, a registration executor, no registry import cycle` (88 characters). Body: what moved and why, the gates with outcomes, `audit:dup` and the touched files' line counts before and after, `Closes #1442`, `Closes #1438`, `Closes #1440`.
- **Arc 2** (phases 4-5): branch `quality-execution-1-a2` off `dev` (D10), `gh pr create` once its loop converges, ready, no labels at creation. Title: `refactor(execution): one copy of each send step, one confirm list in the execute window` (87 characters); Body adds the two `approve()` direct-call differences (Security section). `Closes #1455`, `Closes #1472`. The close-out is arc 2's final commits.
- **Parallelism:** none; arc 2 builds on arc 1's interface.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `93b9a2dfb`, with these values:

- Step 1 is absent (`code_review: off`). Step 2 per arc over that arc's diff (arc 1 from `93b9a2dfb`, arc 2 from arc 1's head), then one fresh pass over the net diff after arc 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; one Opus `general-purpose` review beside round 1; hard stop at three rounds.
- Steps 3 and 4 as written. Close-out: the Outcome block; lessons promoted with a pruning pass; a comment on any issue left out; `STATUS.md` deleted; `git mv` to `archive/quality-execution-1/` in its own commit; the index line moved.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/quality-execution-1/plan.md`, then `agent-worktree done quality-execution-1 --merged`; the orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phases 1-3 ✓ in implementations-plan/quality-execution-1/plan.md, each gate passing in the transcript; the Codex loop converged on arc 1's diff from 93b9a2dfb; a ready PR to dev closing #1442, #1438 and #1440; `bun run test` and `bun run lint` exit 0. Then phases 4-5 the same way on the stacked arc 2.
- `/loop 15m` Drive implementations-plan/quality-execution-1 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery, the close-out; never merge.
