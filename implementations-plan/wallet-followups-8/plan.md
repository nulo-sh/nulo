---
plan: wallet-followups-8
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: d59459ab
status: draft (awaiting the orchestrator's approval)
---

# wallet-followups-8: teardown stops waiting on node retries, a dead RPC goes, three popup fixes

Nine wallet follow-ups. Five ship, in two arcs, each its own PR against `dev`; four ship no code, by owner decision or proportion. Recon: [`recon.md`](recon.md); planning log: [`lessons/phase-0.md`](lessons/phase-0.md); owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md).

## Outcome & Quality Bar

- **For whom**: a person who resets the wallet or deletes a profile while offline or while the node is down; a person who pastes a token address or unlocks after a failed attempt; a person whose password manager fills the account-file field.
- **Excellent**: with the node refusing connections for the whole run, a reset purges inside the 15 s the online smoke spec allows, and with a reachable node nothing changes (in-flight work still completes before the purge); a pasted address with no contract reads the owner's line, and only that refusal does; a successful unlock lands on a Home with no error toast.
- **Good enough**: a silent node (accepts, never answers) still costs one request timeout per call made after the stop (KL-3); a token add already running still holds a reset for its retries (KL-4).

## Issues

| Issue | Arc | Disposition |
|---|---|---|
| #339 | arc 1 | `ContractNotFoundError` reads "There is no token at this address on this network." (decision page 18, option A) |
| #465 | arc 1 | `autocomplete="current-password"` on the file password field |
| #466 | arc 1 | Continue closes any error toast (decision page 19, option B; lane brief addendum) |
| #277 | arc 2 | the PXE stops retrying failed node calls for a profile or chain being torn down, and the incoming scan stops holding its lock across a node read (D2) |
| #464 | arc 2 | delete the method, its RPC entries, the coordinator's `confirm` and their tests; fix three stale comments (D1) |
| #338 | no arc | known limit (D3): labelled `known-limit`, closed as not planned at close-out |
| #432 | no arc | owner, decision page 17, option B: as today, a known limit; labelled and closed at close-out |
| #112 | no arc | owner, decision page 15, OA-6 option A: nothing is built; it stays open, with a comment |
| #498 | no arc | what the person sees is the owner's call: OA-1; it stays open until answered |

The lane brief numbers the background set arc 1; this plan builds the popup set first, so it is arc 1 here (it also takes #466, "this lane's first arc").

## Assumptions

**Facts** (verified at `d59459ab`; file:line in `recon.md`)
1. `makeFetchWithTimeout` retries every non-4xx failure with 1, 2, 3 s backoff through the SDK `retry`, which asks its backoff generator for a delay after each failure (rethrowing the last error when it ends), sleeps, then calls the attempt again without asking; no stop handle exists.
2. A deletion waits on node I/O at four points: `incoming.clearProfile` waits on the incoming service lock, which a scan holds across `blockTimestampFor` → PXE `getBlockTimestamp` (`incoming-transfer/service.ts:1573, 1765, 1806`); `tokens.purgeForProfile` waits on the token lock, which a token add holds across `fetchTokenMetadata` → a network-service node (`token/service.ts:416, 457, 797`); `clearChainState` waits on the chain write guard; `clearProfileState` on the profile write barrier. A runtime still being built holds the chain write guard while its node answers `getL1ContractAddresses`. The transaction, journal, token-balance and network locks hold no node I/O (Opus leg).
3. A failed node call need not fail its PXE op: upstream `L2BlockStream.getHeaderFromSource` returns `undefined` on a failed read and `work()` catches, so a synced op can go on to further calls (Codex leg).
4. `confirmProfileOperation` has no caller outside tests; `PasskeyRecoveryCoordinator.confirm` has no caller but it; `reportToPasskeyWindow` has three other callers and stays.
5. `ContractNotFoundError` crosses the popup hop typed (`walletErrorFromPayload`); a node that cannot answer keeps its own error (`token/service.composition.test.ts:137, 143`).
6. `auth.vue:173` closes a toast only when its id is the screen's last failure toast (`failureToastId`, `:60, :194`); `openToast` stores every non-success, non-info kind as `"error"`.
7. With the node refused, `security-reset`, `passkey-backup` and `passkey-paths` fail; with a 400 stand-in they pass (`implementations-plan/chain-endpoints/lessons/phase-1.md`).

**Inferences**: I1. No await in the purge other than the four in Fact 2 waits on node I/O; Phase 2 step 1 tests it with T4 on the base. I2. Nothing matches a failed call's error by attempt count; the stop keeps the original error.

**Asks**: none open. OA-1 (#498) is the owner's; the arcs ship without it.

## Architecture & Implementation

**#277 (D2).** The registry owns which scopes are being torn down; each node it builds asks it before a retry.
- `ChainRuntimeRegistry` keeps a counted set of stopped scopes (a `chainRegistryKey`, or a profile's `chainRegistryKeyPrefix`); `stopRetries(profileId, chainId?)` returns a one-shot release. `ensure` hands `retryWhile: () => !this.isStopped(key)` to `PxeFactory.createChainRuntime` → `NodeFactory.createNode(rpcUrl, { retryWhile })` → `makeFetchWithTimeout`, before the runtime's first node call.
- `makeFetchWithTimeout` checks `retryWhile()` twice per retry: its backoff generator ends once it is false (no sleep is scheduled), and a retry that wakes from a sleep to a stop rethrows the previous attempt's error instead of dispatching (the SDK calls the attempt again without asking the generator). The caller always gets the attempt's own error. A first attempt always runs: a reachable node still serves a stopped scope, so the drain keeps its semantics.
- `clearChainState` raises the stop for its key before `barrier.read`; `clearProfileState` raises it for the prefix after its generation checks, beside `deleting(gen)`. Both release in a `finally`: the stop lives as long as the clear call.
- The incoming scan reads a note's block time before taking its lock when the note's row is missing or has no time (a read outside the lock, no write); the locked section keeps its fenced re-reads and finds the cached time.
- Network-service nodes, `makeSingleAttemptFetch` and callers without `retryWhile` are unchanged.

**#464 (D1).** Delete `confirmProfileOperation` (service, `rpcMethods` list, spec, client passthrough), `PasskeyRecoveryCoordinator.confirm` and their tests. Rewrite `exportPlain`'s comment at `profile/service.ts:1761` and the `password-secret-box.ts` header (the method and its "31-method" count).

**Popup.** #339: in `NewTokenPopup.vue`'s catch, `err instanceof ContractNotFoundError` → the owner's line, inline like `auth.vue:131-140`. #465: the attribute. #466: `auth.vue` closes a showing toast whose `kind === "error"` and drops `failureToastId`.

**File-level change map**
| File | Change |
|---|---|
| `packages/aztec-runtime/src/utils/fetch.ts` (+ `fetch.pins.test.ts`) | `retryWhile` option; T1 |
| `packages/aztec-runtime/src/ports/node-factory-port.ts`, `adapters/aztec-node-factory-adapter.ts` | `createNode(rpcUrl, opts?)`; the fake accepts it |
| `packages/aztec-runtime/src/pxe/chain-runtime.ts` (+ test), `pxe/service.ts` (+ `service.test.ts`) | stopped scopes; raise and release in both clears; T2, T3 |
| `apps/extension/src/wallet/services/incoming-transfer/service.ts` (+ a test beside its scan tests) | the block time read before the lock; T8 |
| `apps/extension/tests/e2e/security-reset.test.ts` | one refused-node scenario; T4 |
| `apps/extension/src/wallet/services/profile/{service,spec,client,passkey-recovery-coordinator}.ts` (+ tests), `packages/wallet-crypto/src/password-secret-box.ts` | #464 |
| `apps/extension/src/popup/components/popups/NewTokenPopup.vue` (+ test), `tests/e2e/network/holdings.test.ts` | #339; T5 |
| `apps/extension/src/popup/pages/settings/accounts/import.vue` (+ `import.test.ts`) | #465; T6 |
| `apps/extension/src/popup/pages/auth.vue` (+ `auth.test.ts`) | #466; T7 |

**Decision ledger** (Codex reject, then conditional approve, then approve; Opus conditional approve; § Audit verdicts)
- D1. #464: delete, not wire. Its only screen (ConfirmPopup's passkey branch) was removed on purpose in #158, and no surface asks for a point-in-time check; live, it answers "is this the password?" and opens the passkey window for any extension page.
- D2. #277: stop retrying, not abort. Rejected: aborting in-flight fetches (cuts a send proving on a reachable node, which a deletion never did); a timeout on the teardown wait (the purge would delete stores an op still uses); a global retry change (every send and read loses its retries); raising the stop at the deletion's start (a new worker-to-offscreen begin/end RPC, a coordination protocol, and it still misses network-service nodes); a known limit (an offline reset that hangs is a stuck-looking flow, and the stale-network reset inherits it). A backoff that ends, not a `NoRetryError` rewrap: the caller keeps the original error (Opus).
- D3. #338: known limit. The consequence is one pin preference in a profile that took a deleted profile's id, behind a stale page or a parked write straddling a delete and a same-id restore. The fix needs `pxeGeneration` in `ProfileInfo` and pins keyed by it with a prefix purge: persistent shape and every pin path for a preference. Reopen on a report or when per-profile UI keys hold more than preferences.
- D4. #277's token-add path: KL-4, not a fix. It needs a token add already running when the reset starts (its popup can be dismissed: the request keeps running, and the lock spans profiles); token persistence is a journaled, resumable state machine, and moving its metadata reads out of `withTokenLock` reworks it. The incoming path is fixed: scans run by themselves, and the read moves before the lock without changing who commits (Codex).
- D-orch-1. Two arcs, each one PR against `dev`, no stack. Arc 1 merges first; arc 2 carries the close-out and merges last.

## Security & Adversarial Considerations

- **#277**: no trust boundary moves. The node is untrusted already; the stop removes retries only for a scope being deleted, so a failing node can no longer stretch a deletion by its retries. Profile ids are hex, so a `${id}:` prefix matches no other profile; a same-id successor cannot exist while the stop is up (the id stays reserved until `clearProfileState` settles); a stale-generation clear refuses before raising. No crypto, dependency or CI change.
- **#464** removes an extension-page RPC that unseals a profile's secrets on a password or opens a passkey prompt on request. The exhaustive passthrough and `rpcMethods` lists fail typecheck if one side is left.
- **#339**: the line repeats the node's answer; a lying node can make a real token read "no token", as it can lie about any read (the decision states it). No address or error text reaches the line or a log beyond today's `{ reason }` at debug.
- **#465, #466**: an attribute; a toast closed earlier. No data moves.

## Phase 1: popup fixes (#339, #465, #466), arc 1

Steps: change the catch, the attribute and the toast check. Update the holdings e2e wait to the new line.

Tests, each red on `git show d59459ab:<path>` copies: **T5** (`NewTokenPopup.test.ts`, the `test.each` split) a `ContractNotFoundError` rebuilt by `walletErrorFromPayload` shows the owner's line; a PXE store `Error` keeps the generic line (control); both log `{ reason }` at debug. **T6** (`import.test.ts`) `expectNativeAttrs(w, "import-account-password-input", { autocomplete: "current-password" })`. **T7** (`auth.test.ts:492`, rewritten as the decided change) Continue closes the screen's own failure toast and the hand-off's error toast; an info toast stays (control).

**Validation gate**: `cd apps/extension && bun --bun vitest run src/popup/components/popups/NewTokenPopup.test.ts src/popup/pages/settings/accounts/import.test.ts src/popup/pages/auth.test.ts src/utils/copy-dash-ban.test.ts`; root `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`; smoke `bun run test:e2e -- tests/e2e/{account-import-export,holdings-add-token}.test.ts --retry=0`, then with `NULO_E2E_BROWSER=firefox`; network `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/holdings.test.ts`, Chrome then Firefox. Pass: exit 0 everywhere; the `new-token-error` shot shows the new line. Layers: lint, typecheck, unit, component, smoke, network.

## Phase 2: teardown stops retrying (#277), arc 2

Warning: run one `e2e:agent` at a time here, at retry 0; never raise the stall watchdog or T4's bound; run network specs after 23:00Z or when `uptime` load1 is under 60.

Steps:
1. Add T4 and run it on the base. It must fail its 15 s purge wait; if it passes, stop and report.
2. Build the predicate path, the two raise points and the incoming read. Add T1 to T3 and T8.
3. Run T4 again. If it still fails, log per-step purge timings at debug to find the await. A wait outside Fact 2's four points is a plan change: stop and report.

Tests: **T1** (`fetch.pins.test.ts`, fake timers) a network error with `retryWhile` false → one attempt, the original error; true → four attempts (today); true then false during the backoff sleep → no further attempt, the first attempt's error; a 200 with `retryWhile` false → resolves. **T2** (`chain-runtime.test.ts`, a table) a key stop turns off only that runtime's predicate; a prefix stop only that profile's; another profile, another chain and a release restore or keep retries as expected; overlapping key and prefix stops need both releases. **T3** (`service.test.ts`, a fake node that fails each attempt) `clearChainState` and `clearProfileState` settle with an op holding the guard; a clear that throws releases its stop; a stale-generation `clearProfileState` raises none; against a node that answers, the clear waits for the op (control). **T4** (`security-reset.test.ts`) arm `interceptRpc(…, TESTNET_RPC_ORIGIN, { kind: "refuse" })` before `openPopup`, assert it saw requests, stop it in `finally`; the reset purges inside 15 s and routes to register. Failure mode: a fake cannot list the real PXE's node calls (boot, sync, ops); only the browser proves the stop reaches them. Estimate 15 s per browser, fixture included; measured in step 3. **T8** (incoming scan) with a block-time read pending, `clearProfile` settles before it does; released afterwards, the read recreates no receipt.

**Validation gate**: `cd packages/aztec-runtime && bun run test`; `cd apps/extension && bun --bun vitest run src/wallet/services/incoming-transfer src/wallet/services/profile-deletion src/wallet/services/network-reset src/wallet/services/network`; root `bun run lint`, `bun run typecheck:all`; smoke `bun run test:e2e -- tests/e2e/{security-reset,passkey-backup,passkey-paths,settings-crud}.test.ts --retry=0`, then Firefox; network `e2e:agent tests/e2e/network/{delete-after-prove,stale-network-reset,profile-reimport-matrix,incoming-transfers,incoming-arrival}.test.ts`, Chrome. Pass: exit 0; T3, T4 and T8 red on base copies. Layers: lint, typecheck, unit, composition, smoke, network.

## Phase 3: delete the dead RPC (#464), then the arc gate

Steps: delete per D1; fix the three comments. Then from the root: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run test:ci-gating`; `cd apps/extension && bun --bun vitest run src/wallet/services/profile`. Merge `origin/dev` (PR #506 edits the node factory adapter) and rerun Phase 2's unit and smoke lines. Pass: exit 0; `rg confirmProfileOperation apps packages` finds nothing. Layers: lint, typecheck, unit.

## UI impact

- **New token popup, the line under Submit** (#339): "There is no token at this address on this network." for an address the node answered holds no contract; every other refusal keeps "Something went wrong. Try again." Owner, decision page 18, option A, on the issue. The PR attaches the `new-token-error` shot.
- **Unlock screen, Continue** (#466): "Any error toast: pressing Continue closes whatever error toast is showing, so a successful unlock always lands on a clean Home." Owner, decision page 19, option B, on the issue.
- **Settings → Accounts → Import, File password** (#465): lane brief, "#465 is an attribute, no visible change".
- #277 and #464 change no screen. #498 is OA-1 and ships nothing.

## Delivery

| Arc | Phases | Branch (from `origin/dev`) | PR title | Closes |
|---|---|---|---|---|
| arc 1 | 1 | `worktree-wallet-followups-8-popup` (`agent-worktree new wallet-followups-8-popup --no-start`) | `fix(popup): name a token address with no contract; unlock closes any error toast` (80) | #339, #465, #466 |
| arc 2 | 2, 3 | `worktree-wallet-followups-8` | `fix(wallet): stop node retries while a profile or chain is torn down; drop a dead rpc` (85) | #277, #464 |

- Each PR opens with `gh pr create --base dev` after its gate and its Codex loop, without labels; add `e2e:extension-smoke` or `e2e:extension-network` afterwards only if the path filter skipped a suite the arc needs. `/code-review` off.
- Bodies: what and why, the validation runs, the e2e wall-clock per browser before and after (arc 2 adds T4), the owner's decision text for #339 and #466, `Closes #n`, ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Commits: conventional, lower case, signed, `Co-Authored-By:` naming the model that ran.
- Merge order: arc 1, then arc 2, whose final commits are the close-out. The arcs share no file; arc 1 can run while arc 2 waits for a quiet host.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `d59459ab`. Specific to this plan:
- Step 1 is absent (`code_review: off`). Step 2 runs per arc over its diff from `origin/dev` after its last gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/wallet-followups-8/`; hard stop at three rounds; rounds logged in `lessons/phase-N.md`. No cross-arc pass: the arcs share no file or seam (deviation).
- Approval boundary: aborting in-flight fetches, a timeout on a teardown wait, a stop raised outside the two clears or outliving its call, a retry change for callers without `retryWhile`, moving token-add I/O out of its lock, or any work on #498 is a plan change and stops for the orchestrator.
- Close-out on arc 2: label #338 and #432 `known-limit` and close them as not planned, each with a comment (hypothesis, consequence, disposition, reopening condition); file KL-3 and KL-4 as closed `known-limit` issues (dedupe first); comment on #112 and #498 why they stay open; delete `STATUS.md`. Teardown of both worktrees after the merges: `agent-worktree done wallet-followups-8-popup --merged`, then `agent-worktree done wallet-followups-8 --merged`; trunk `dev`; `implementations-plan/archive/wallet-followups-8/plan.md`.

Known limits to file: **KL-3** (#277): after the stop, each node call still makes one attempt, so a silent node costs up to one request timeout (60 s) per call, and the PXE may make several (Fact 3), plus at most one backoff sleep (3 s); reopen on a report of a reset stalled on a silent node. **KL-4** (#277): a token add already running (its popup open or dismissed, any profile) holds `withTokenLock` across its metadata reads, so a reset waits out their retries; reopen on a report.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| 1 | Codex, gpt-6.1-sol | reject | the incoming lock path (Fact 2, the read before the lock, T8); I2 false (Fact 3, KL-3 wording); T2/T3 scope, overlap and cleanup cases; T1 transition; T4 interception asserts | a production-PXE regression for header-read failures: T4 runs the real PXE |
| 1 | Opus 5.5 | conditional approve | the token-add path (Fact 2, KL-4); the #464 comment and gate fix; arm T4 before `openPopup`; the backoff wrap; T1 in `fetch.pins.test.ts`; KL-3 per call; OA-1's delay | none |
| 2 | Codex, resumed | conditional approve | a stop raised during a backoff sleep still dispatched one retry (reproduced on the SDK): a second check before each retry; KL-4 is any running add, not a second window; OA-1's visible delay is the popup's 60 s RPC deadline; T8 release check | none |
| 3 | Codex, resumed | **approve** | none new: the three conditions verified, no regression | none |

Over the light target: the two panel rounds and #466 added scope; nothing restates.

## Seeds

```
/goal Phases 1-3 of implementations-plan/wallet-followups-8/plan.md marked ✓, each backed by its validation gate passing in the transcript; LESSONS_FILE=implementations-plan/wallet-followups-8/lessons/phase-N.md printed per phase; the Codex loop (gpt-6.1-sol, high) converged per arc with a resumed pass quoting no new material finding; two PRs against dev opened after their loops (arc 1 closing #339 #465 #466, arc 2 closing #277 #464), arc 2's close-out archiving the plan (git show --stat in the transcript); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/wallet-followups-8 forward per its plan.md and the README § Post-implementation standard at d59459ab: reality-check plan.md and lessons/, run the next phase's gate, one e2e:agent at a time at retry 0, decide open questions with Codex (gpt-6.1-sol, high), never merge, never widen scope; stop after both PRs' checks are green and report.
```
