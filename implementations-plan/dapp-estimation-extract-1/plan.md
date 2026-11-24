---
plan: dapp-estimation-extract-1
tier: mid
status: approved by the final Codex pass; arc 1 next
issues: "#1934"
driver: claude-code
claude_model: opus
codex_model: sol (gpt-6.1-sol, as the lane brief names)
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual plan audit (Codex + Opus Plan) and a fresh Codex pass; per arc the Codex fix loop then one Opus diff review
base: origin/dev at 967c626d1
trunk: dev
post_implementation_hardening: not scheduled
---

# dapp-estimation-extract-1: the dApp estimate and preview subsystem moves into its own class

`DappSendExecutor` (1,534 lines) holds the dApp fee estimate and the authorization preview
beside the code that parks lanes, writes the journal, proves and sends. This plan moves the
first part, unchanged, into `DappSendEstimation` (`dapp-send-estimation.ts`). Paths are under
`apps/extension/src/wallet/services/execution/` unless they name another root. **UI impact:
none.** Nothing stored, logged or sent to an app changes. Recon: [recon.md](recon.md). Consults:
[lessons/phase-0.md](lessons/phase-0.md).

## The issue, checked (#1934)

A structural finding (Large Class) with no failure path. Its claims hold at the base, found by
name: the estimate never takes the slot or calls the coordinator; the stash has two writers (the
estimate and the send's `restash`) and one consumer (`resolveStandardBuild` via `tryConsume`);
one deps type and one fixture serve both halves. Two claims did not hold:
- **`estimate-reuse-shared.ts` is not a home for the NO_FROM build and discovery.** Its header
  scopes it to what the two reuse caches share, and both caches and `preview-snapshots.ts` import
  it; NO_FROM is never reuse-eligible. Moving a build there would give the caches an import edge to
  the planner, the builder's types and the decoder.
- **The shared NO_FROM pieces cannot be module functions** without changing a test: the in-process
  fee-race helper replaces `discoverNoFromAuthwits` on the instance
  (`tests/helpers/fee-race-in-process.ts:445`) for the NO_FROM preview; an ES module export cannot
  be replaced that way. (Its confirm stops earlier, at the stubbed `buildNoFrom`.)

The issue is labelled `enhancement`; the lane brief is the decision that schedules it.

## Outcome & Quality Bar

- **For whom:** the next maintainer who changes how a dApp estimate or preview is built, or how
  a confirm consumes it.
- **Excellent:** an estimate-only change is read and tested in one module whose dependency type
  names nothing that parks, journals, proves or sends; the executor's frozen ranges differ from the
  base only by four call receivers; every existing expectation passes unedited.
- **Good enough:** the executor keeps the consume guards and the send's orchestration;
  `transfer-executor.ts` is out of scope.

## The four settled questions

**Q1. Who owns the estimate stash.** `DappSendEstimation` is its only writer: the estimate's stash
and the confirm's re-stash after a fee re-ask both run inside it (`stashOperationEstimate`, now
private; `restash`, moved). The executor is its only consumer: `tryConsume`, and `evict` of its
own re-stash in `executeAztecSendTx`'s `finally`. The cache object stays service-owned; the cancel
registry's `evict` is unchanged. Each side is typed by a `Pick` of the cache: the estimation gets
`OperationEstimateReuse` `stash` and `PreviewSnapshots` `stash`; the executor gets
`OperationEstimateReuse` `tryConsume | evict` and `PreviewSnapshots` `take`. The facade holds the
estimation as `Pick<DappSendEstimation, "estimateOperationFee" | "previewOperationAuthwits">`; the
executor holds it as `Pick<DappSendEstimation, "reuseSnapshot" | "restash" | "prepareNoFrom" |
"discoverNoFromAuthwits">`. So no caller reaches a write or a consume it could not reach before:
the facade reaches a write only through the two entry points, as it did; the executor reaches the
writes only through `restash`, from the one frame that called it; neither side can name the
other's cache methods. The narrowing is type-level, as the existing `Pick<ExecutionLane, …>` is;
the instances passed are the same objects.

**Q2. Where the shared helpers go.** Into `dapp-send-estimation.ts`, the module that defines
what they must agree with:
- methods of the class, because they need its dependencies: `reuseSnapshot`, `restash`,
  `prepareNoFrom`, `discoverNoFromAuthwits`. The send calls all four.
- exported pure functions: `fingerprintInputFor` (send: `executeAztecSendTx`), `noFromFingerprint`
  (send: `executeNoFromSendTx`), `listedRecords` (send: `addDiscoveredNoFromAuthwits`),
  `attachedOf` (send: `resolveStandardBuild`'s embedded arm). Exported types: `ReuseSnapshot`,
  `PreparedNoFrom`.
- module-private: `dedupNoFromScopes` (only `prepareNoFrom` calls it).
- estimate-only, moved: `estimateOperationFee`, `buildForEstimate`, `previewOperationAuthwits`,
  `writePreview`.
`estimate-reuse-shared.ts` is unchanged (see "The issue, checked"). `restash` takes
`StashableBuild & { discoveredHashes; reused? }`, where `StashableBuild` names the `Pick` that
`stashOperationEstimate`'s `built` already declares: the executor's `StandardBuild` stays local
and satisfies it structurally, so the new module imports nothing from the executor and `restash`
receives no `pxe`, `node` or account by type.

**Q3. The dependency type.** `DappSendEstimationDeps` is a fresh interface of 16 members, not an
extension of `SharedSendDeps`: `Pick<SharedSendDeps, "getActiveProfile" | "captureExecutionFence" |
"getNetwork" | "getPendingForAccount" | "readPublicStorageOnce" | "peekPublicFeeJuice" |
"rereadPublicFeeJuice">`, `planner: Pick<OperationPlanner, "processAztecJsPayload">`,
`txBuilder: Pick<TxRequestBuilder, "buildNoFrom">`, `estimateWithDiscovery:
Pick<DiscoveryAwareEstimator, "estimate">`, `buildAndEstimateValidated` (declared here; the
executor's member references `DappSendEstimationDeps["buildAndEstimateValidated"]`, so the
signature is written once), `sequenceEpoch`, `chainTip: Pick<ChainTipGate, "unconfirmed">`, the two
cache `Pick`s of Q1, `logDebug`. The facade builds it as an object literal with no spread, so an
extra key is a compile error, and the wiring pin fails on one added at run time. The executor
keeps `extends SharedSendDeps` (wired once for both executors), so it still carries six members
only the estimate read (`captureExecutionFence`, `getActiveProfile`, `getPendingForAccount`, the
three Fee Juice reads); narrowing them is churn with no reach removed from a send.
*What "by construction" covers* (D5): every dependency. No member parks a lane, writes the
journal, reaches the coordinator (the only prover and the only broadcaster), records a sent
transaction or enters the sequencer. *What it does not cover:* the values its builds return.
`FeeEstimate` and `BuiltNoFromTx` carry live `node`, `pxe` and account handles, as today, because
the confirm needs them whole (the NO_FROM account signs there); the estimation calls only
`node.getNodeInfo`, `pxe.simulateTx` and `account.address` on them. A broadcast through a handle
fails `legal/call-sites.test.ts` (textual, so an alias defeats it); a `pxe.proveTx` has no pin and
rests on review. Fencing the handles means retyping `FeeEstimate` and `BuiltNoFromTx` for every
strategy and the builder: a change of its own, outside this lane.

**Q4. The test fixture.** One fake bag, two objects over it. `makeHarness` builds the bag as
today, constructs `new DappSendEstimation(bag)`, adds it to the bag as `estimation`, and builds
the executor over the same object, so a post-construction change of `h.deps` (`:3711`) reaches
both halves as it reached the one class. It returns `estimation` beside `executor`. Estimate and
preview calls change receiver (`h.executor.estimateOperationFee` → `h.estimation.…`), nothing
else. The estimate-only blocks stay in the file: four mixed blocks need both objects and the
same harness, and moving ~900 lines buys no proof. One new test pins the wiring (below).

## Architecture & Implementation

`DappSendEstimation` is constructed in `wireDappSendAndViewExecutors`, after
`DiscoveryAwareEstimator` and before `DappSendExecutor`, from `shared`'s members by name and the
same service fields the executor reads today (all built earlier: `planner` in `init`, `txBuilder`
in `wireLaneAndBuilder`, both caches in `wireGasBalancesAndEstimateCaches`, `chainTipGate` a field
initializer). One `buildAndEstimateValidated` closure serves both objects. The facade gains
`private dappSendEstimation` and its three estimate and preview methods call it; the executor's
deps gain `estimation` and lose `txBuilder` and `sequenceEpoch`, which only moved code read.

### Site table (each estimate and preview site; every call keeps its place)

| Site | Before: what it did, to which state | After | Awaits around it |
|---|---|---|---|
| Estimate entry | executor `estimateOperationFee`: abort check, fence capture, payload parse, snapshot, build, three probes, abort check, stash unless lagging, preview write when bound | same body in `DappSendEstimation`; the facade's three callers name `dappSendEstimation` | unchanged; the facade's admission and slot wrappers unchanged |
| Snapshot, estimate | `reuseSnapshot`: await `getNetwork`, then sync epoch, pending set, `chainTip.unconfirmed` | same, inside the moved method | unchanged |
| Snapshot, confirm | `standardPass`: `await this.reuseSnapshot(…)` before `resolveStandardBuild` | `await this.deps.estimation.reuseSnapshot(…)` | one awaited call of the same async body |
| Stash write | `stashOperationEstimate`: eligibility, fingerprint, primary endpoint, active profile (awaited only with no `profileId`), `operationEstimateReuse.stash` | moved, private | unchanged |
| Preview write | `writePreview`: `previewSnapshots.stash` under `estimateId ?? randomUUID()` | moved | synchronous |
| NO_FROM preview | `previewOperationAuthwits`: abort, fence, `prepareNoFrom`, abort, discovery, abort, write | moved | unchanged |
| Preview pop | `executeAztecSendTx`: `assertEstimateBinding`, then `takeStandardPreview` pops the snapshot before the first `standardPass`, so before any `tryConsume` | unchanged, executor | unchanged |
| Re-stash | `standardPass` over the figure: `await this.restash(…)`; a reused entry goes back under a new id (sync), a lagging build is not stashed, a fresh one through `stashOperationEstimate(…, profileId)` | `await this.deps.estimation.restash(…)`, body moved | one awaited call of the same async body |
| Consume | `resolveStandardBuild`: `tryConsume(estimateId, identity, fence)` | unchanged, executor | unchanged |
| Request's evict | `executeAztecSendTx` `finally`: `evict(stashId)` | unchanged, executor | unchanged |
| NO_FROM confirm build | `executeNoFromSendTx`: `await this.prepareNoFrom(op, fence, parentTask)` after `simulating` | `await this.deps.estimation.prepareNoFrom(…)` | one awaited call of the same async body |
| NO_FROM confirm discovery | `addDiscoveredNoFromAuthwits`: `await this.discoverNoFromAuthwits(d)`, then the preview hold, then signing | `await this.deps.estimation.discoverNoFromAuthwits(d)` | one awaited call of the same async body |

No site gains or loses an operation. An `await` of an async method returns the same native
promise whichever object owns the method, so the microtask count around each call is unchanged.

### Frozen ranges

`runInSlot`, `joinLines`, `waitForEarlierSends`, `waitForEarlier`, the consume guards
(`assertEstimateBinding`, `takeStandardPreview`, `enforcePreview`), recording (`sentTxRecorder`,
`indexGrants`, `feeChoiceFor`), submission (`proveSendTransaction`, `proveStandardSend`), the fee
re-ask (`askAboutFee`, `overCeiling`) and the sends (`executeSendTransaction`,
`sendTransactionPass`, `executeAztecSendTx`, `awaitRequested`, `standardPass`,
`resolveStandardBuild`, `executeNoFromSendTx`, `addDiscoveredNoFromAuthwits`): a scratch script
cuts each by name from `git show 967c626d1:<file>` and from the arc's head and compares them
line by line, exactly, after stripping only leading indentation (whitespace inside a literal
counts). Expected: exactly the four receiver lines of the site table (snapshot and re-stash in
`standardPass`, build and discovery on the NO_FROM path). Any other line is a defect. The same
script cuts each moved function from the base executor and from `dapp-send-estimation.ts`
(`estimateOperationFee`, `reuseSnapshot`, `buildForEstimate`, `previewOperationAuthwits`,
`writePreview`, `stashOperationEstimate`, `restash`, `prepareNoFrom`, `discoverNoFromAuthwits`,
`listedRecords`, `attachedOf`, `fingerprintInputFor`, `noFromFingerprint`, `dedupNoFromScopes`).
Allowed: `private` → `public` on the four shared methods, `export` on the four helpers, and the
`built` parameter type of `restash` and `stashOperationEstimate` (`StashableBuild`).

### File-level change map

| File | Change |
|---|---|
| `dapp-send-estimation.ts` (new) | the class, its deps type, the exported helpers and types of Q2 |
| `dapp-send-executor.ts` | moved code removed; deps narrowed as Q1 and Q3; four receivers; imports; header docblock no longer lists the estimate |
| `service.ts` | construct the estimation; field; three facade calls |
| `discovery-aware-estimator.ts` | docblock: owned by both dApp halves, not the executor alone |
| `README.md` (execution) | a file-map row for the new module; the executor's row drops the estimate |
| `dapp-send-executor.test.ts` | harness builds both (Q4); 64 receivers; the service-RPC block's fake names `dappSendEstimation`; describe titles whose subject moved say `DappSendEstimation`; type-only: `makeHarness`'s overrides type, `realReuseHarness`'s casts, the `DappSendExecutorDeps["operationEstimateReuse"]` cast (`:1657`); one added test (T2) |
| `service.dapp-send-wiring.test.ts` (new) | the wiring pin (step 5) |
| `feesettings-invariant.test.ts`, `service.characterization.test.ts` | deps literal: `estimation` added, `txBuilder` and `sequenceEpoch` removed |
| `service.refusal`, `service.estimate-queue`, `estimate-admission-order`, `estimate-hold.integration`, `service.composition` tests | the fake or reached field is `dappSendEstimation` |
| `tests/helpers/fee-race-in-process.ts` | the stub and the two parks target `raw.dappSendEstimation` |

### Trade-offs and alternatives not taken

- **Outline B, a functions module** (`dapp-send-shared.ts` with `reuseSnapshot`,
  `stashOperationEstimate`, `prepareNoFrom`, `discoverNoFromAuthwits` taking explicit deps; the
  re-stash stays in the executor). Rejected: the stash keeps two writers, the executor keeps the
  write surface, and the fee-race helper loses its instance stub (a test change).
- **Delegates on the executor** (`estimateOperationFee` forwarding), which would leave every
  facade test untouched. Rejected: it keeps the estimate on the executor's surface, the forwarding
  pattern #1438 removed.
- **A separate estimation test file with its own fixture.** Rejected (Q4).
- **Runtime-narrow cache handles** (closures exposing only `stash`). Rejected: one caller, and
  the `Pick` is the house pattern; the wiring pin catches a widened literal.

## Security & Adversarial Considerations

- Threat surface unchanged: a dApp's request reaches the estimate only through the facade's
  stored-request slot, after materialization; the preview snapshot and the reuse entry stay in
  worker memory with the same TTLs; nothing is persisted.
- What a reviewer attacks: a site whose order moved around an await; a path where what is
  signed is no longer what the preview listed (the NO_FROM build and discovery now run through
  another object, so both must still run the one body); a stash entry that outlives its request
  or that another request can read (the re-stash id, the `finally` evict, the preview pop before
  any consume); the estimation reaching a lane, the journal or the node's send; a dependency its
  type does not need; an expectation that moved.
- Crypto, supply chain, permissions, CI tokens: untouched. No log, error text or RPC change.

## Assumptions

**Facts** (at `967c626d1`)
1. The estimate path never calls `lane`, `coordinator`, `addTransaction`, `recordPendingAuthwits`,
   `noteSent` or the sequencer (read of `estimateOperationFee`, `buildForEstimate`,
   `previewOperationAuthwits`, `writePreview`, `stashOperationEstimate`, `prepareNoFrom`,
   `discoverNoFromAuthwits`).
2. `OperationEstimateReuse` has `stash`, `evict`, `tryConsume`; `PreviewSnapshots` has `stash`,
   `evict`, `claim`, `take`; the facade calls the estimate at `service.ts:796,810`, the preview at `:824`.
3. `legal/call-sites.test.ts` fails on any `node.sendTx(` outside `execution-coordinator.ts`.
4. `tsconfig.json` includes `src/**/*.ts`, so `typecheck:all` checks the test files.
5. No suppression, no complexity acceptance and no chaos citation names `dapp-send-executor.ts`.

**Inferences**
- I1. No moved function crosses a complexity budget: each moves whole, and `restash` and
  `reuseSnapshot` are under 15 lines.
- I2. `service.validated-observer.test.ts` keeps passing: the wiring reads `shared`'s members by
  name (undefined on `{}`) and dereferences none.

**Asks** — none open. Product: no visible surface ([OWNER-ASKS.md](OWNER-ASKS.md)).

## Arc 1 — extract (single arc)

1. Add `dapp-send-estimation.ts`: move the code of Q2 verbatim; write the deps type of Q3.
2. Edit `dapp-send-executor.ts`: remove the moved code; narrow the deps; change the four
   receivers.
3. Wire `service.ts`; update both docblocks and the README row.
4. Change the tests' reach as the change map says. Change no expectation.
5. Add `service.dapp-send-wiring.test.ts`: on a bare `ExecutionService` prototype with sentinel
   `planner`, `txBuilder`, both caches and `chainTipGate`, `wireDappSendAndViewExecutors({})` wires
   an estimation whose deps keys are exactly Q3's 16 and hold those sentinels; the executor's deps
   hold the same estimation instance, the same `estimateWithDiscovery` and the same
   `buildAndEstimateValidated` closure (so the estimate's validated run keeps its observer).
6. Add T2 to the re-ask block: a reuse entry at the risen fee, seeded under the approved
   `estimateId`, goes back under a fresh id as the same object, and the accept proves it with no
   build (`stash` once, `build` never, `proved()` = the risen fee, the cache empty after).
7. Run the frozen-range script and the mutants below.

**Mutants** (each applied alone to a scratch copy, then reverted; each must fail the named test,
confirmed by running it):
- M1 a stash write skipped (`stashOperationEstimate` without its `stash`): "estimateOperationFee
  (aztec_sendTx, fj): stash written with bookkeeping fields, estimateId returned".
- M1b the re-stash of a reused entry skipped: T2 (no existing test runs that arm; both audits).
- M2 a consume that leaves the entry, the request's `finally` without its `evict`: "a refusal ends
  the send cancelled, unproven, and drops the held build". (A re-stash under the consumed id is not
  writable: `restash` never receives that id.)
- M3 the preview pop moved after the reuse: "no owned snapshot (forged id): reuse is never
  attempted — tryConsume untouched, FULL pipeline".
- M4 an identity compare turned into presence (`previewId !== estimateId` → `!previewId`): "a
  popup pairing one interaction's estimateId with another's previewId is refused before either id
  is consumed".
- M5 the estimation reaching a send-only dependency (`lane` added to its literal and type): the
  wiring pin. M3 pins code this lane does not edit; the lane brief asks for it.
A mutant that no test kills gets the smallest test that does, added in this arc.

**Validation gate** (one at a time, retry 0): `bun run lint`, `bun run typecheck:all`,
`bun run test:all`, `bun run audit:vue`, `bun run test:ci-gating`, `bun run check:plans`.
Storybook: not required, as no import under `src/{utils,components,composables,stores}` moves.
E2E, no scenario added, each command once per browser (Chrome, then `NULO_E2E_BROWSER=firefox`):
- proverless, one run: `NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run
  e2e:agent` with `tests/e2e/network/` + `tx-sendTx-default`, `tx-sendTx-delegated-authwit`,
  `tx-sendTx-feePayer`, `tx-sendTx-multicall`, `tx-sendTx-noFrom`, `sim-from-selfpay` (each
  `.test.ts`);
- prover-ON, one run: `tx-sendTx-default.test.ts` (both its tests: the canary send and the re-ask).

What each proves: `tx-sendTx-default`, a dApp send with its estimate, and the fee re-ask, which it
forces by approving half the estimate with its `estimateId` and `previewId`, so the reused entry's
re-stash and the accept run end to end (a stale entry's rebuild is pinned by the unit layer:
`operation-estimate-reuse.pins.test.ts` and the executor's "estimate→confirm reuse" block);
`tx-sendTx-delegated-authwit`, the execute window with discovered authorizations;
`tx-sendTx-feePayer`, the app-paid estimate (the validated run's observer); `tx-sendTx-multicall`,
the batch (the wallet-sdk `batch` method carries no send in the playground, so a multicall is the
batch that reaches the estimate); `tx-sendTx-noFrom` (`@requires-proverless`), the NO_FROM preview
and confirm; `sim-from-selfpay`, a simulate-only call asserting its kernel output (it never reaches
moved code; it checks the edited wiring function).

## Delivery

One branch `dapp-estimation-extract-1-a1` off `origin/dev`, one PR against `dev`, opened ready
after both reviews converge: `refactor(execution): the dApp estimate and preview subsystem moves
into its own class` (85 characters), `Closes #1934`. Body: the four settled questions, the site
table, the frozen-range statement, the test edits, the mutants, the validation runs, "No visible
change.", then the Claude Code line. Close-out (Outcome, lessons, `git mv` to `archive/`, index
line) as the PR's final commits, after `git fetch` and a merge of `origin/dev`.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard)
at `967c626d1`, single arc: the Codex fix loop (`gpt-6.1-sol`, `high`, read-only) over the whole
diff, until a round has no new material finding, hard stop at three rounds; then one Opus 5.5
diff review; then targeted verification of its material fixes. Both carry the Security asks and
the README's two verbatim rules.

## Decision ledger
- D1 (chosen) outline A, one class owning every write; B rejected (above).
- D2 facade calls the estimation directly; delegates rejected.
- D3 type-level `Pick` views per side; runtime-narrow handles rejected.
- D4 one fixture, two objects; a split file rejected.
- D5 "by construction" holds for every dependency, not for the handles the builds return (Q3);
  fencing those is a retype of `FeeEstimate` and `BuiltNoFromTx` outside this lane (Codex C1).

## Audit verdicts

**Round 1, Codex (`gpt-6.1-sol`, high): approve with changes.** Q1, Q2, Q4 agreed; Q3 disputed as
stated.
- C1 (medium, demonstrated): "cannot broadcast by construction" exceeds the evidence; the builds
  return a full `node`. Accepted as a narrowed claim (Q3, D5), no retype.
- C2 (medium, demonstrated): M1b's named test never runs the reused arm. Accepted: T2.
- C3 (medium): the default spec forces the re-ask; it does not expire an estimate. Accepted: the
  gate says what it proves and names the unit pins of the stale ladder.
- C4 (low): `sim-methods` accepts `ok` or `error`. Accepted: `sim-from-selfpay` instead.
- C5 (low): 16 members, not 15; `restash`'s parameter type unnamed. Accepted (Q2, Q3).

**Round 1, Opus 5.5 (Plan): approve with changes.** Q1-Q4 agreed.
- O1 (medium): moved bodies were never diffed. Accepted: the script cuts them too.
- O2 (medium): M1b survives; M2's first form cannot be written. Accepted: T2; M2 names the refusal
  pin.
- O3, O4 (low): the count and `restash`'s type, as C5.
- O5 (low, plausible): a second `buildAndEstimateValidated` closure dropping `observer` would make
  app-paid confirms fail closed, uncaught. Accepted: the wiring pin checks identities;
  `tx-sendTx-feePayer` joins the e2e run.
- O6 (low): the fee-race stub serves the preview only. Accepted (wording). Its pre-existing defect
  (the stub returns `[]` where `listedRecords` reads `.signable`) is an open item: verify and file
  at close-out; not fixed here, since it would change that test's outcomes.
- O7 (low): type-only test edits unlisted. Accepted (change map).
- O8 (low): `shared-send-deps.ts` docs. Rejected: "both send executors take" stays true; the six
  kept members are stated (Q3).

**Final fresh Codex pass: approve with changes**, one finding. F1 (low, demonstrated): a `-w`
compare misses a changed space inside a string literal. Accepted: exact compare after leading
indentation. D5, T2's path through `holding`, the bare-prototype pin and the mutant map confirmed.
Resumed on the fix: **approve**.

**Arc 1, Codex fix loop round 1 (`gpt-6.1-sol`, high): approve**, two low findings. The fee-race
stub's `[]` (pre-existing; the open item above, confirmed by a probe). A comment narrating two
array copies in `estimateOperationFee`: deleted. The lead added the Azguard notice to the new file.
Resumed (round 2): **approve**, no new finding.

**Arc 1, Opus 5.5 diff review: approve with changes**, four low findings, all accepted. The wiring
pin now checks the executor shares both caches (M6, both forms killed); the new file's header
states D5's limit; two history-narrating comments rewritten; one README row split.

## Seeds

```
/goal implementations-plan/dapp-estimation-extract-1/plan.md Arc 1 ✓ with its gate passing in the transcript; the Codex loop and one Opus review converged; the PR exists ready; bun run lint and bun run test:all exit 0.
```

```
/loop 15m Drive implementations-plan/dapp-estimation-extract-1 per its plan.md; never merge.
```
