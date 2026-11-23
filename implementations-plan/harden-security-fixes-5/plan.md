---
plan: harden-security-fixes-5
tier: mid
status: arc 1 implemented and reviewed; arc 2 waits
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual review (Codex gpt-6.1-sol high + Opus Plan); one fresh final Codex pass; at most two in-process agents at once; one Codex consult at a time
base: origin/dev at fe2a12524
trunk: dev
post_implementation_hardening: not scheduled
---

# harden-security-fixes-5: four boundary invariants at the dApp edge and the worker

Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md), [lessons/phase-1.md](lessons/phase-1.md). Live log: [STATUS.md](STATUS.md).

This plan carries the lane's code changes. Two owner decisions outside both arcs are in OWNER-ASKS.md; nothing here builds them. Two arcs, one PR each against `dev`, no stack.

| Arc | Phases | Surface | Waits for |
|---|---|---|---|
| 1 | 1-2 | content admission (`wallet/services/wallet-sdk`), three log lines (`execution`, `token-balance`) | nothing |
| 2 | 3-4 | discovery pacing (`wallet-sdk`), the task registry (`task`), batch arguments (`packages/wallet-bridge`) | the numbers A1-A3 approved; `harden-security-fixes-4` arc 2 merged (it changes `TaskService.init`) |

## Outcome & Quality Bar

**For whom.** A person on v1.3 who keeps several dApp tabs open, connects dApps they did not write, and may attach a log export to a bug report; and the maintainer who inherits these files.

**What excellent looks like.**
- Each change is stated in the code as the invariant it protects, in one sentence, beside a test that fails on `fe2a12524` and a success control that passes before and after.
- Every bound sits well above what the standard `@aztec-labs/wallet-sdk` client and `apps/playground` send, measured (recon.md); each number is an approved trade-off (A1-A3), not a claim about every dApp; a refusal uses a class the wire already carries.
- Each fix sits in the module that already owns the concern; nothing adds a store, an event, a field on an RPC type, a feature string or a dApp-facing method.
- No screen, copy or layout changes.

**Good enough.** No e2e scenario is added: each phase names the cheaper layer that proves it. Each arc reruns the network specs its message-handling change can reach, on both browsers, as a no-regression check.

## Assumptions

**Facts** (verified at `fe2a12524`; recon.md has the rest):
- F1. Upstream's handler keys a discovery, and the session its key exchange opens, by the page's `requestId` (`@aztec-labs/wallet-sdk` 6.0.0 `dest/extension/handlers/background_connection_handler.js:119-130,159-190`), and restores the discovery row as approved when it ends a session (`:236-258`).
- F2. The content admission already binds a key exchange to its discovery's tab and document origin and answers session-bound messages from a tab that does not hold the session (`content-admission.ts:62-170`); it is the one place every content-script message passes before upstream records it.
- F3. P2 changes three log calls: `token-balance/service.ts:368`, `execution/claim-helper.ts:233-236` and `execution/service.ts:1027`, whose text comes from `classifyOperationCatch` (`rpc-cancel.ts:86-110`).
- F4. The claim helper's logger takes a message only (`claim-helper.ts:37-41`).
- F5. Discovery's popup caps and the reconnect bucket run inside `handleSecureDiscovery` (`discovery-flow.ts:148-231`); the unlock drain calls `handleDiscovery` again for a queued discovery (`background.ts`, `drainQueuedDiscovery`).
- F6. `TaskService` removes finished roots by age (60 min, `task/spec.ts:7`) in `cleanupStaleTasks`, called from its read paths (`task/service.ts:200-235`). `argsBatch` checks a batch's shape (`packages/wallet-bridge/src/method-descriptors.ts:106-110`); `BATCH_REFUSED_METHODS` refuses popup methods as legs with a plain `Error` (`dispatcher.ts:287-292`).
- F7. Each new test named in Phases 1-4 fails at `fe2a12524` in a scratch run kept outside the tree.

**Inferences** (challenge these):
- I1. No standard client sends a discovery whose id names a session or a discovery the wallet already holds: the SDK mints a fresh `randomUUID()` per `discoverWallets` call, and no wallet-side path re-delivers a discovery through the content listener after the handler exists.
- I2. Nothing reads a finished root task created for a dApp after its operation returns (recon.md, "Registry readers").
- I3. A fixed category and the error's class name are an accepted trade-off: an exported log loses the failure's text. The dApp never received it (an unclassified failure reaches it as the constant envelope, `error-envelope.ts`); the text stays on the failed task, and Developer Mode's request capture records it for a dApp request.

**Asks** (working assumption in brackets; the orchestrator may overrule):
- A1. Discovery pacing [per tab a burst of 8 and one more each second]. Measured: one discovery per connect action (recon.md); the reconnect bucket after it passes 3 per 20 s plus a queue of 4 per origin, so a burst of 8 refuses nothing those gates admit. Past it a dApp sees what any refused discovery shows today: no answer, so its `discoverWallets` returns no wallet when its timeout ends (60 s by default); a retry a second later passes. Each tab has its own bucket, so restoring many tabs of one dApp is not affected. Revisit on a report of a dApp that cannot find the wallet.
- A2. Finished dApp roots kept [the 256 latest-finished; older finished ones are dropped at once, unfinished ones never]. Measured: a read's root tree holds one task of a few hundred bytes (an in-memory harness); a failed root also holds its error and its subtasks, so the bound is 256 trees, not a byte figure. Nobody observes the drop (I2). Revisit if a consumer starts reading finished dApp tasks.
- A3. Legs per batch [at most 1,024; a nested `batch` refused]. Measured: aztec.js 6.0.0 `BatchCall.simulate` sends one batch of one `executeUtility` leg per utility call plus one `simulateTx` (`dest/contract/batch_call.js:70-101`), with no limit; the playground sends at most 3 legs; the SDK's batch schema cannot carry a nested batch. A leg limit narrows what `WalletSchema.batch` accepts, so it is a limit on the dApp-facing surface, for the orchestrator to approve or route to the owner. Past it the dApp gets `InvalidWalletArgumentsError` for its `batch`, as for any malformed batch today. Revisit on a report of a dApp, a `BatchCall` with many utility calls included, that batches more. The registry bound (P4) does not cover this: a batch's duration and its result array grow with its legs.
- A4. [No screen, copy or layout changes, so each PR says "No visible change." and carries no frames.]
- A5. [No new e2e scenario; arc 1 reruns the network connect and reconnect specs on Chrome and Firefox.]

## Architecture & Implementation

**P1. A discovery is admitted only under an id the wallet does not already hold.** `admitContentMessage` gains one check after the schema check: a `discovery-request` whose `content.requestId` names a live session or a pending discovery is dropped, logged at `debug`, and never forwarded. A new wrapper dependency, `idHeld(id)`, answers `handler.getSession(id) !== undefined || handler.getPendingDiscovery(id) !== undefined` for the handler that exists right now ("no" before it exists). The page gets no reply, as for any refused discovery, so an id held by another tab and one held by its own tab read the same. The check runs before upstream records the discovery (F1), so the binding of a key exchange to its discovery's tab, already enforced, holds for the session's whole life.

**P2. Three log lines carry categories, not values.**
- `token-balance/service.ts`: `this.logWarn("balance ensure: a row create failed", { tokenId: token.id, errorName: errorName(error) })`. The local `key` stays for the set lookups. `errorName` (an error's class name, else its `typeof`) joins `wallet/logger/utils.ts` beside `trim`, and the incoming-transfer receipt-fee line, which spells it inline today, uses it too.
- `claim-helper.ts`: the line says which parts of the scope changed ("profile", "account", "network"), from the three comparisons `executingScopeMatches` makes, plus the journal id; no address, no network id.
- `execution/service.ts`: `logOperationOutcome` receives the caught error. Its last branch logs `` `[${traceId}] executeOperations: ${kind} failed` `` at `error` with `{ errorName: errorName(error) }` and the trace tag. The error's text is not logged at any level: a contract chooses it, and the policy logs a category when a message can hold any text.

**P3. Discovery work is paced where it arrives.** A small synchronous gate, `DiscoveryPacing` in `wallet-sdk/discovery-pacing.ts`: a token bucket per tab (A1), keyed on the browser's `sender.tab.id`, on the `ClockPort` the handler state already holds. Each call refills and drops every entry whose bucket is full again, so tabs seen once leave no entry. `admitContentMessage` asks it for a `discovery-request` after P1's check; a refused discovery is dropped and logged at `debug` before upstream records it, so no row needs rejecting and the unlock drain never pays again. The refill arithmetic follows `VerifyAdmissionGate.refill`; the two gates stay separate because the verify gate's reservations, queue and deadlines have no meaning for a dropped discovery (D5).

**P4. The worker keeps a bounded number of finished dApp tasks, and a batch carries a bounded number of legs.**
- `TaskService.createTask` runs `cleanupStaleTasks()` first. When a root task created for a dApp (`origin.type === OriginType.DAPP`) completes, fails or is cancelled, the service emits that update first, then drops the earliest-finished dApp roots beyond A2 (by `finishedAt`, ties by insertion order) through `deleteTaskTree`, so `onTaskDeleted` fires for each. Unfinished tasks and tasks of other origins keep today's 60-minute retention.
- `argsBatch` refuses more than A3 legs and any leg named `batch`; the dispatcher's existing arity refusal turns that into `InvalidWalletArgumentsError`.
- The bound never reads a task's profile, so it neither depends on nor changes how a task created across a profile switch behaves.

**UI impact:** none. No surface changes its layout, copy, rows or formatting.

**File-level change map** (paths under `apps/extension/src/` unless they start with `packages/`).

| Phase | Files |
|---|---|
| 1 | `wallet/services/wallet-sdk/content-admission.ts` (one check, one dependency), `background.ts` (wires it), `background.transport.test.ts` |
| 2 | `wallet/logger/utils.ts` and `utils.test.ts` (`errorName`); `wallet/services/token-balance/service.ts` and `service.test.ts`; `wallet/services/execution/claim-helper.ts` and `claim-helper.test.ts`; `wallet/services/execution/service.ts` and `service.composition.test.ts`; `wallet/services/incoming-transfer/service.ts` (one line uses the helper) |
| 3 | `wallet/services/wallet-sdk/discovery-pacing.ts` (new) and its `.test.ts`; `content-admission.ts`, `background.ts` (state), `background.transport.test.ts` |
| 4 | `wallet/services/task/service.ts`, `spec.ts` and `service.test.ts`; `packages/wallet-bridge/src/method-descriptors.ts`, `method-descriptors.test.ts`, `dapp-grant.characterization.test.ts` |

## Security & Adversarial Considerations

- **Threat model.** A web page in any tab (content scripts run on every origin) sends discovery messages before any connection; a connected dApp sends calls and batches; a page may learn nothing of another tab's session ids, and the changes keep it so. A log export can leave the machine with a bug report.
- **Invariants this plan makes hold.** (P1) a session or pending discovery keeps the tab it was first credited to: a discovery never reuses an id the handler holds; (P2) these three lines write no account address and no simulator text at any level; (P3) one tab's discovery messages cost the worker no storage read past A1's rate; (P4) the registry holds at most A2 finished dApp roots, and one batch message runs at most A3 legs.
- **Input validation.** P1 reads the id after the envelope schema has checked it; P4 adds to the arity guard that already runs before the schema parse. Refusals use existing wire classes; P1 and P3 answer nothing, as refused discoveries do today.
- **Least privilege, crypto, supply chain.** No permission, key, dependency, workflow or package change.
- **Domain risks.** Extension messaging: P1 writes nothing to any tab; the holding tab is never touched. Availability: P3 and P4 bound work and memory a page or a dApp can cause; neither bound can block the wallet's own UI paths. Logging: no level rises.

## Decision ledger

| Id | Decision | Alternative not taken | Why |
|---|---|---|---|
| D1 | P1 checks pending discoveries as well as live sessions | live sessions only (outline B) | one predicate keeps one rule: an id stays bound to its first tab, whether its handshake is pending or done (F1) |
| D2 | P1 sits in the content admission | reject in `handleDiscovery` (outline B) | upstream records the discovery before `handleDiscovery` runs; admission is where the other id-to-tab checks live |
| D3 | `log-payload-ban.test.ts` is not extended | teach it the three forms | its rule is textual: the key is an alias and the error text is a flattener's result returned through a classifier, both false negatives its header names, and catching them needs data flow; an account address is not a denied key (it is kept at `debug` for diagnosis), so a name rule would refuse safe lines and still miss `{ accountAddress }` at `warn`. The phase tests hold the three sites |
| D4 | P2 drops the values (outline A), the error text included | demote the lines to `debug` with their values (outline B); `{ error }` at `debug`; a buffer-wide 32-byte scrub | the policy logs a category when a message can hold any text, and a debug line still reaches a debug-enabled export; a buffer-wide scrub hides contract and class ids that diagnose failures, so it is an owner option (OWNER-ASKS.md, OA-3), not built |
| D5 | P3 is its own small gate | reuse `VerifyAdmissionGate` | that gate's reservations, FIFO and deadlines model verify windows; a dropped discovery needs none of them |
| D6 | P4 caps finished dApp roots by count | skip tasks for read-only dApp kinds; a shorter age for dApp roots (outline B) | `request-captures.ts` records stages from task updates; an age alone still lets a burst grow without bound |
| D7 | P3 paces per tab, at the content admission (outline B's key) | per origin in `handleDiscovery` (first draft, Codex r1); a bucket across tabs | a page can move its own tab across origins it controls with no gesture, but needs a gesture to open a tab; at admission a refused discovery creates no upstream row and the unlock drain does not pay twice; a shared bucket lets one set of pages starve other dApps |
| D8 | P4 refuses a nested batch in `argsBatch` | add `batch` to `refusedInBatch` | the dApp then gets `InvalidWalletArgumentsError`, a wire class it can read; `refusedInBatch` throws a plain `Error` worded for popup methods |

## Phases

### Phase 1 — a discovery never reuses a held id (arc 1) ✓
1. In `background.transport.test.ts`, with ports that report the verify window closed: tab 7 holds `s1`; a discovery for `s1` from tab 9, then its key exchange; the session stays tab 7's, tab 9 receives nothing, the SDK listener never sees the discovery. Same for an id whose discovery tab 7 has had approved but not yet key-exchanged (tab 7's own key exchange then opens the session, control), and for the approved row upstream restores when it ends a session (tab 7's key exchange is still forwarded to upstream, control). A duplicate discovery from tab 7 itself is dropped too. Control: a fresh id from tab 9 is approved and opens its own usable session.
2. Add `idHeld` to the wrapper's dependencies, wire it in `background.ts`, add the check and a comment stating the invariant.

**Validation gate.** From `apps/extension`: `bun --bun vitest run src/wallet/services/wallet-sdk/`; from the root: `bun run lint` and `bun run typecheck:all`. Pass: exit 0, and every new refusal case fails against the base copy of `content-admission.ts` while the controls pass on both. Layers: lint, typecheck, unit, composition.

### Phase 2 — three log lines carry categories (arc 1) ✓
1. `token-balance/service.test.ts`: a row create that fails; no argument of `logWarn` holds the account address; the call carries `{ tokenId, errorName }`.
2. `claim-helper.test.ts`: a refile across accounts and networks; no logged string holds either address or network id; the line names "account and network". Control: the refile still happens.
3. `service.composition.test.ts`: update the unclassified-failure case: an error whose message holds an address; no argument of any log call holds it; the `error` line carries `{ errorName: "Error" }`.
4. Add `errorName` to `wallet/logger/utils.ts` with a case in `utils.test.ts`; change the three lines and the receipt-fee line.

**Validation gate.** From `apps/extension`: `bun --bun vitest run src/wallet/services/token-balance/service.test.ts src/wallet/services/execution/claim-helper.test.ts src/wallet/services/execution/service.composition.test.ts src/wallet/logger/utils.test.ts src/utils/log-payload-ban.test.ts`; from the root: `bun run lint` and `bun run typecheck:all`. Pass: exit 0, and the three new assertions fail against the base sources. Layers: lint, typecheck, unit, composition.

### Arc 1 gate
1. `bun run audit:vue` from the root. Pass: exit 0.
2. `bun run test:all` from the root. Pass: exit 0.
3. With load1 under 150, from the root: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<connect and reconnect specs>` in one run, then the same with `NULO_E2E_BROWSER=firefox`. The spec list is the files that `git grep -l "discovery\|reconnect" apps/extension/tests/e2e/network` names, recorded in STATUS.md. Pass: green at retry 0 on both. Layers: network e2e.

### Phase 3 — discovery work is paced (arc 2)
1. `discovery-pacing.test.ts` on a fake clock: a tab's burst passes and the next is refused; one passes again after the refill; a second tab of the same origin is served while the first is refused; after a refill, an entry for a tab never seen again is gone.
2. `background.transport.test.ts`, under fake timers (`fakeSdkPorts` reads `Date.now`): 200 discoveries from one tab reach the SDK listener at most A1's burst times; one after the refill is served (control).
3. Add the gate, construct it in the handler state, ask it in `admitContentMessage`.

**Validation gate.** From `apps/extension`: `bun --bun vitest run src/wallet/services/wallet-sdk/`; from the root: `bun run lint` and `bun run typecheck:all`. Pass: exit 0, and step 2 fails on base. Layers: lint, typecheck, unit, composition.

### Phase 4 — bounded finished tasks and batch legs (arc 2)
1. `task/service.test.ts`, asserting with `hasTask()` and the emitted events before any read path runs: A2 + 50 dApp roots finished by complete, fail and cancel leave the A2 latest-finished, each drop after its terminal `onTaskUpdated` and with its `onTaskDeleted`; an unfinished dApp root and a finished UI root survive (controls); `createTask` drops a root finished over 60 min ago with no reader.
2. `packages/wallet-bridge` `dispatcher.test.ts`, or the extension's `service.composition.test.ts`: one batch of A3 `getChainInfo` legs through the real dispatcher and `ExecutionService` leaves at most A2 finished roots and answers every leg.
3. `method-descriptors.test.ts`: A3 legs pass; A3 + 1 fail; a leg named `batch` fails. Update the nested-batch characterization to the refusal.
4. Change `TaskService` and `argsBatch`.

**Validation gate.** From `apps/extension`: `bun --bun vitest run src/wallet/services/task/ src/wallet/request-captures.reach.test.ts src/wallet/services/incoming-transfer/balance-outbox.test.ts`; from `packages/wallet-bridge`: `bun run test`; from the root: `bun run lint`, `bun run typecheck:all`, `bun run audit:vue` and `bun run test:all`. Pass: exit 0, and the new tests fail on base. Layers: lint, typecheck, unit, build.

## Delivery

- Arc 1: branch `harden-security-fixes-5-a1` off `origin/dev`, its first commit this plan's commit cherry-picked from `worktree-harden-security-fixes-5`. PR `fix(dapp): bind discovery ids to their first tab, category-only log lines` (72 characters).
- Arc 2: branch `harden-security-fixes-5-a2` off `origin/dev` once A1-A3 are approved and `harden-security-fixes-4` arc 2 has merged. PR `fix(dapp): pace discovery, bound finished tasks and batch legs` (63).
- Both against `dev`, opened ready after their arc's review loop converges, no label at creation, no `Closes` line. The body describes each change and its invariant, the validation runs, and "No visible change."
- Close-out: the final commits of arc 2's PR (Outcome block, lessons pass, `git mv` into `archive/` in its own commit, index line moved). First merge `origin/dev` and read what changed in `index.md` and `lessons.md`.

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) as read at `fe2a12524`. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2, per arc at its boundary: Codex `gpt-6.1-sol` at `high` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`), resumed with each fix diff, hard stop at three rounds; each prompt carries the arc map ("arc N of 2") and the standard's two rules verbatim. One Opus 5.5 diff review (`Agent`, `general-purpose`, `model: opus`) beside the first round. Log every round in `lessons/phase-N.md` and below. After arc 2, one fresh Codex session over the net diff from `fe2a12524` asks for cross-arc issues.
- Step 3: `gh pr create` per arc, then `gh pr checks <n> --watch`. Add a label only when a path filter would skip a suite the change needs.
- Step 4: as the Delivery section says.
- Step 5, teardown after the close-out merges: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/harden-security-fixes-5/plan.md`, then `agent-worktree done harden-security-fixes-5 --merged`.
- Failure policy: three failures on one step stop that arc and report.

## Plan review

- **Codex r1** (`gpt-6.1-sol`, high, plan and outline B): conditional approve. Accepted: the quality bar names the numbers as trade-offs; A3 is a limit on the dApp-facing surface; P2 logs an error's class name, never its text, at any level; the claim helper names profile changes too; no bucket across tabs or origins; P4 emits before it drops and orders drops by `finishedAt`, with a multi-leg dispatch test; P1's controls (restored row, original tab's retry, same-tab duplicate); OA-2's option B restated with its lag cost, A recommended; OA-1's options classify each reading outcome. Rejected: a per-origin burst of 4 (the gates after it already pass up to 7 per origin).
- **Opus r1** (Plan agent): conditional approve. Accepted: P3 keyed per tab and asked at the content admission (D7: a page can move its tab across origins without a gesture; the unlock drain would pay twice); every call sweeps full entries; recon's batch fact corrected (`BatchCall` sends wire batches), A3's basis restated; A2 counted per tree; D8; facts trimmed to the mechanism each change needs, base numbers kept out of the plan; two drifted steps fixed. It found no bypass of P1 and no awaited task P4 can drop (I1, I2 hold).
- **Final Codex pass** (fresh `gpt-6.1-sol` session, high): conditional approve, then **approve** once four points were applied: the restored-row control asserts only that tab 7's key exchange is forwarded (establishing needs a verify-window slot it no longer holds; a fresh id is the usable-session control); three public texts trimmed to the change; I3 restated as an accepted trade-off; Phase 4 asserts drops before any read. It confirmed D7 (per tab, at admission, after P1) and the burst of 8. `audit:vue` stays as the repository's command name.

## Arc 1 review

- **Codex r1** (`gpt-6.1-sol`, high): approve with fixes. Accepted: a contract revert named in the failure line (`SimulationError` sets no `name`); the admission comment states the synchronous invariant; the claim-helper comment trimmed to the legacy-profile wildcard.
- **Opus r1** (diff review): accepted the drifted profile-chaos citation, I3 corrected (an unclassified failure reaches a dApp only as the constant envelope; D4 rests on the logging policy and stands), a locked-wallet pending-row test, `heldDiscoveryId` and three stale comments. Two points left unchanged and routed to the owner with their reasons.
- **Codex r2** (resumed with the fix diff): no new points; **approve**. Details: [lessons/phase-1.md](lessons/phase-1.md).

## Seeds

Not run: the orchestrator drives each arc.

```
/goal Every phase of implementations-plan/harden-security-fixes-5/plan.md is marked ✓, each backed by its validation gate reported passing in the transcript; each arc's Codex loop converged (a resumed pass reporting no new material point, quoted); the arc's PR exists against dev, opened after its loop; bun run test and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/harden-security-fixes-5 forward per its plan.md: read plan.md, STATUS.md and lessons/ first; take the next unmarked phase of the current arc; run its gate; at an arc boundary run the Codex loop per the Post-implementation section, then open the arc's PR; never merge; stop and report after three failures on one step.
```
