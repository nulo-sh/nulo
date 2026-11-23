---
plan: harden-security-fixes-4
tier: mid
status: approved, arc 1 next
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual review (Codex gpt-6.1-sol high + Opus Plan); one fresh final Codex pass; at most two in-process agents at once
base: origin/dev at 8ae2c06a4
trunk: dev
post_implementation_hardening: not scheduled
---

# harden-security-fixes-4: four boundary invariants, made to hold

Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Live log: [STATUS.md](STATUS.md).

This plan carries the lane's code changes. Items settled without a code change are settled outside it. Two arcs, one PR each against `dev`, no stack.

| Arc | Phases | Surface | Waits for |
|---|---|---|---|
| 1 | 1-4 | the dApp boundary and its logs (`apps/extension/src/wallet/services/{execution,wallet-sdk}`, `wallet/logger`) | nothing |
| 2 | 5 | the task registry (`apps/extension/src/wallet/services/task`) | arc 1 merged: one arc at a time, and arc 2's branch takes the plan from `dev` |

## Outcome & Quality Bar

**For whom.** A person on v1.3 who connects dApps they did not write, keeps more than one profile, and may send a log export with a bug report; and the maintainer who inherits these files.

**What excellent looks like.**
- Each change is stated in the code as the invariant it protects, in one sentence, beside a test that fails on `8ae2c06a4` and a success control that passes before and after.
- Each fix sits in the module that already owns the concern; nothing adds a store, a lifecycle, an event, a field on an RPC type or a dApp-facing method.
- No screen, copy or layout changes.

**Good enough.** No e2e scenario is added: each phase says which cheaper layer proves it. Arc 1 reruns the one network spec its message-handling change can reach, on both browsers, as a check that nothing broke.

## Assumptions

**Facts** (verified at `8ae2c06a4`; recon.md has the rest):
- F1. `executeNoFromSendTx`'s opening `logDebug` interpolates `JSON.stringify(op.opts?.additionalScopes)` (`execution/dapp-send-executor.ts:1222-1224`); `prepareNoFrom` logs the same set as counts a moment later, with the reason (`:1317-1327`). `additionalScopes` is in no stored shape or backup (recon sweep).
- F2. `rehydrateOptimizablePrefix` scans `type` and `isStatic` only (`execution/fast-path.ts:95-101`); `partitionFastPrefix` also stops at `hideMsgSender === true` (`helpers/batched-view-simulation.ts:314`). These are the only two callers of `simulateViaNode`, which sets each call's `msg_sender` to the account (recon).
- F3. `SESSION_BOUND_TYPES` holds `ping` and `secure-message` (`wallet-sdk/stale-session.ts:24`); `stale-session.test.ts:34` pins `disconnect-request` among the types forwarded without the tab check.
- F4. Firefox 153, the manifest's minimum (`manifest/manifest.firefox.config.ts:40`), sets `sender.origin` on a content script's message from the document principal (`ExtensionParent.sys.mjs` `getSender`, read in Firefox 153.0.4's `omni.ja`); Chrome sets it too. The note above `senderDocumentOrigin` says Firefox sets only `sender.url` (`wallet-sdk/content-admission.ts:140-141`).
- F5. `TaskService` never pulls the active profile, and the silent restore emits no `onActiveProfileChanged` (`task/service.ts:42-45,246-254`; `profile/service.ts:514-516`). Two stub profile services lack `getActiveProfile`: `startedTaskService`'s (used by five test files) and `task/service.test.ts`'s `createTestSetup`.
- F6. Each phase's new test fails at `8ae2c06a4` and passes with the change; each control passes on both (scratch runs, kept as patches outside the tree).

**Inferences** (challenge these):
- I1. No dApp the wallet is tested against sends a `disconnect-request` from a tab other than the connected one: the SDK sends it from the connected page's own content script.
- I2. A page whose session the background forgot (SW restart) loses nothing when its `disconnect-request` is answered with `session-disconnected`: its content script still holds the port and closes it, but the page's own `disconnect()` has already closed its end (wallet-sdk `extension_wallet.js`, `handleDisconnect`).
- I3. Moving `TaskService` one start phase later (behind `ProfileService`) delays nothing: no phase-0 service calls it during `init`, and its methods do not wait for its own start.

**Asks** (working assumption in brackets; the orchestrator may overrule):
- A1. [No screen, copy or layout changes, so each PR says "No visible change." and carries no frames. Two behaviours a dApp or a profile can observe change, and each PR names them: a sender-hiding call's simulation runs on the PXE (P2); a profile no longer receives tasks of the profile restored before it (P5).]
- A2. [No new e2e scenario; arc 1 reruns `network/session-explicitDisconnect.test.ts` on Chrome and Firefox.]

## Architecture & Implementation

**P1. The NO_FROM path logs scope counts, never scope addresses.** The opening line of `executeNoFromSendTx` is deleted: `prepareNoFrom`'s line already logs the scope and call counts. `additionalScopes` joins `REDACTED_KEYS` in a group of its own ("a dApp's viewing scopes: whose private state it may read"), and the set's header widens from "a secret, or the ciphertext of one" to also cover privacy material whose count is the diagnostic. `trim()` then blanks the key when an options object is logged, and `log-payload-ban.test.ts`, which imports the set, refuses it flattened. The guard covers that spelling only; `scopesWithAccount` and `scopes` are locals of the same path, logged as counts. Account addresses in other debug lines stay as they are.

**P2. A sender-hiding call is simulated with its sender hidden.** `rehydrateOptimizablePrefix`'s boundary scan also stops at `hideMsgSender === true`, as `partitionFastPrefix` does; the comment names why (`simulateViaNode` sets each call's `msg_sender` to the account). That call and the rest run on the standard arm, which honours the flag. The node still sees the account as fee payer of any fast-path batch, as today; the fix is about the sender the simulated call observes.

**P3. A disconnect request ends a session only from the tab holding it.** `disconnect-request` joins `SESSION_BOUND_TYPES`. From the holding tab it is forwarded as today. From another tab it is answered with `session-disconnected` in that tab, which holds no port for the id, and never reaches the handler; the holding tab is never written to. An id no tab holds and another tab's live id get the same answer. The module comment's "presupposes an established session" now holds for all three types.

**P4. The sender-fields note says what the browsers do.** The note above `senderDocumentOrigin` says both browsers set `sender.origin` on a content script's message and `sender.url` is the fallback for a sender without one. No behaviour changes.

**P5. The task registry knows its profile from start.** `TaskService` declares `dependencies = [ProfileService.name]`. `init` subscribes first, then pulls `getActiveProfile()` and sets `this.profile` only if no emission set it meanwhile, so a late pull never overwrites a newer profile. The existing clear rule then holds after a silent restore as it does after an unlock: a switch to another profile clears the earlier profile's tasks; a lock and an unlock to the same profile keep them. Both stub profile services gain `getActiveProfile`.

**UI impact:** none. No surface changes its layout, copy, rows or formatting; A1 names the two behaviours a dApp or a profile can observe.

**File-level change map** (paths under `apps/extension/src/`).

| Phase | Files |
|---|---|
| 1 | `wallet/services/execution/dapp-send-executor.ts` (one call deleted) and its `.test.ts`; `wallet/logger/utils.ts` (one entry, header) and `utils.test.ts` |
| 2 | `wallet/services/execution/fast-path.ts` (scan, comment) and `fast-path.test.ts` |
| 3 | `wallet/services/wallet-sdk/stale-session.ts` (set, comment), `stale-session.test.ts`, `background.transport.test.ts` |
| 4 | `wallet/services/wallet-sdk/content-admission.ts` (two comment lines) |
| 5 | `wallet/services/task/service.ts`, `test-task-service.ts`, `service.test.ts` |

## Security & Adversarial Considerations

- **Threat model.** A web page in any tab (content scripts run on every origin) and a connected dApp: both send untrusted input at the content-script and dApp-call boundaries. Other local profiles' extension pages see what the background's services hand them. A log export can leave the machine with a bug report.
- **Invariants this plan makes hold.** (P1) the NO_FROM path writes no viewing-scope address into a log line, and `trim()` blanks `additionalScopes`; (P2) a call flagged to hide its sender is never simulated with the account as its sender; (P3) a disconnect request ends a session only from the tab holding it; (P5) after a silent restore, a switch to another profile clears the earlier profile's tasks, as after an unlock, and a late pull never overwrites a newer profile.
- **Input validation.** Unchanged: the envelope schema, the top-frame check and the key-exchange binding run first (`content-admission.ts`). P3 reads only browser-supplied sender fields.
- **Least privilege, crypto, supply chain.** No permission, key, dependency, workflow or package change.
- **Domain risks.** Extension messaging: P3 never writes to the holding tab on another tab's request; a test asserts the reply goes only to the sender. Logging: P1 changes no level.

## Decision ledger

| Id | Decision | Alternative not taken | Why |
|---|---|---|---|
| D1 | P1: delete the opening line (outline B; Codex r1, Opus agreed), and add `additionalScopes` to `REDACTED_KEYS` in its own group | a count in the opening line (outline A); the name in the guard's `EXTRA_NAMES` | the later line already logs the counts; a name the guard denies must also be one `trim()` blanks, or the object form `{ additionalScopes }` reads as safe to the guard and is printed whole |
| D2 | P2: the raw scan checks the flag in place (outline A) | skip the fast path for the whole payload (B); one predicate shared by both scans | B gives up the fast path for leading calls that do not hide their sender; the two scans read different shapes (wire object vs `FunctionCall`) |
| D3 | P3: `disconnect-request` joins the session-bound set (A) | a separate tab check in `content-admission.ts` (B) | the set exists to name the messages that presuppose a session; B duplicates it |
| D4 | P4: correct the note only; no change to the relay's per-origin key | key the relay on the parsed origin (A) or the tab id (B) | both browsers set `sender.origin` on supported versions (F4), so the relay's `sender.url` fallback is not reached; the wrong note is what made the fallback look live |
| D5 | P5: pull at `init`, as `PriceService` does (A) | stamp each task with its profile and filter reads (B); clear on the first emission after start (`trackProfileSwitchEpoch`'s rule) | B adds a field to `Task`, an RPC type, and needs every event filtered; the first-emission rule also clears a restored profile's own tasks on re-unlock, and an in-flight send's `WrappedTask` then throws |

## Phases

### Phase 1 — the NO_FROM path logs scope counts (arc 1) ✓
1. Add to `dapp-send-executor.test.ts`, NO_FROM describe, with scopes as the dispatch parse hands them over (`AztecAddress` instances, which serialize to hex): run a send with two scopes; assert no string argument of any `logDebug` call contains either address. Control: a line carries `additionalScopes=2`.
2. Delete the opening line. In the test "%s: the call list is read for the title only after acquireSlot", NO_FROM's reads before the slot drop from 1 to 0, the same as standard, and the comment naming the opening line goes. Add the key to `REDACTED_KEYS` in its own group; widen the header.
3. Add a `trim()` case to `utils.test.ts`: `{ additionalScopes: [...] }` comes out blanked.

**Validation gate.** From `apps/extension`: `bun --bun vitest run src/wallet/services/execution/dapp-send-executor.test.ts src/wallet/logger/utils.test.ts src/utils/log-payload-ban.test.ts`; from the root: `bun run lint` and `bun run typecheck:all`. Pass: exit 0, and the new test fails against the base copy of `dapp-send-executor.ts`. Layers: lint, typecheck, unit.

### Phase 2 — a sender-hiding call is simulated with its sender hidden (arc 1) ✓
1. Add to `fast-path.test.ts`, `rehydrateOptimizablePrefix` describe: `[hidden, publicStatic]` gives `null`; `[publicStatic, hidden]` gives a prefix of one and `remainingRaw` equal to `[hidden]`. The existing all-public-static case is the control.
2. Stop the scan at the flag; state why in the function comment.

**Validation gate.** From `apps/extension`: `bun --bun vitest run src/wallet/services/execution/fast-path.test.ts src/wallet/services/execution/view-executor.test.ts`; from the root: `bun run lint` and `bun run typecheck:all`. Pass: exit 0, and both new cases fail on base. Layers: lint, typecheck, unit.

### Phase 3 — a disconnect request ends a session only from the holding tab (arc 1) ✓
1. In `stale-session.test.ts`, move `disconnect-request` into the session-bound `test.each`; keep `discovery-request` and `key-exchange-request` forwarded.
2. In `background.transport.test.ts` (the real upstream handler behind the wallet's admission), beside the single cross-tab `ping` test: a `disconnect-request` from another tab is answered in that tab only, never forwarded, and the session stays live in its tab. Control: the holding tab's `disconnect-request` ends the session. Extend "another tab's live id and an absent id are indistinguishable to the sender" to a `disconnect-request`.
3. Add the type to the set and update the module comment.

**Validation gate.** From `apps/extension`: `bun --bun vitest run src/wallet/services/wallet-sdk/`; from the root: `bun run lint` and `bun run typecheck:all`. Pass: exit 0, and the cross-tab case fails on base. The composition test in step 2 is what proves P3. Layers: lint, typecheck, unit, composition.

### Phase 4 — the sender-fields note (arc 1) ✓
1. Rewrite the note above `senderDocumentOrigin` as P4 says.

**Validation gate.** From the root: `bun run lint`. Pass: exit 0. Layers: lint.

### Arc 1 gate ✓
1. `bun run audit:vue` from the root (typecheck, test and lint, then build). Pass: exit 0.
2. `bun run test:all` from the root. Pass: exit 0.
3. With load1 under 150, from the root: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/session-explicitDisconnect.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`. Pass: green at retry 0 on both. This checks that a dApp's own disconnect still works end to end; it cannot prove P3, whose cross-tab case Phase 3's composition test proves. Layers: network e2e.

### Phase 5 — the task registry knows its profile from start (arc 2)
1. Add to `task/service.test.ts`: a stub whose `getActiveProfile` answers A and which emits nothing; create a task; emit B; `getTasks()` returns `[]`. Control: emit `undefined` (lock), then A; the task stays. Race: hold the pull, emit B, let the pull answer A, create a task, emit A; the task is cleared.
2. Declare the dependency; pull in `init` after subscribing; give both stubs `getActiveProfile`.

**Validation gate.** From `apps/extension`: `bun --bun vitest run src/wallet/services/task/ src/wallet/request-captures.reach.test.ts src/wallet/services/auth-registry/service.test.ts src/wallet/services/execution/execution-coordinator.test.ts src/wallet/services/execution/service.fence-entry.test.ts src/wallet/services/execution/transfer-executor.test.ts`; then from the root: `bun run lint`, `bun run typecheck:all`, `bun run audit:vue` and `bun run test:all`. Pass: exit 0, and the first new test and the race test fail on base. Layers: lint, typecheck, unit, build.

## Delivery

- Arc 1: branch `harden-security-fixes-4-a1` off `origin/dev`, its first commit this plan's commit cherry-picked from `worktree-harden-security-fixes-4`. PR `fix(dapp): scope counts in logs, sender-hiding sims on the pxe, tab-bound disconnects` (85 characters).
- Arc 2: branch `harden-security-fixes-4-a2` off `origin/dev` once arc 1 has merged. PR `fix(tasks): the task registry learns the active profile at start` (64).
- Both against `dev`, opened ready only after their arc's review loop converges, with no label at creation and no `Closes` line. The body describes each change and its invariant, the validation run with outcomes, the two observable behaviours (A1), and "No visible change."
- Parallelism: disjoint files, but the lane runs one arc at a time by the orchestrator's pacing; no lanes.
- Close-out: the final commits of arc 2's PR (Outcome block, lessons pass, `git mv` into `archive/` in its own commit, index line moved). First merge `origin/dev` and read what changed in `index.md` and `lessons.md`.

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) as read at `8ae2c06a4`. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2, per arc at its boundary: Codex `gpt-6.1-sol` at `high` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`), resumed with each fix diff, hard stop at three rounds; each prompt carries the arc map ("arc N of 2") and the standard's two rules verbatim. One Opus 5.5 diff review (`Agent`, `general-purpose`, `model: opus`) runs beside the first round. Log every round in `lessons/phase-N.md` and below. After arc 2, one fresh Codex session over the net diff from `8ae2c06a4` asks for cross-arc issues.
- Step 3: `gh pr create` per arc, then `gh pr checks <n> --watch`. Add a label only when a path filter would skip a suite the change needs.
- Step 4: as the Delivery section says.
- Step 5, teardown after the close-out merges: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/harden-security-fixes-4/plan.md`, then `agent-worktree done harden-security-fixes-4 --merged`. The orchestrator notices the merge; a session resumed here runs the check first.
- Failure policy: three failures on one step stop that arc and report.

## Plan review

- **Codex r1** (`gpt-6.1-sol`, high): conditional approve, conditions: P5's other stub and a test that a late pull never overwrites a newer profile. Accepted: delete P1's opening line (outline B), keep A for P2-P5; extend the live-versus-absent test to disconnects; add a missing-URL control to P4 (moot once P4 became a note, D4); the task-registry stubs and race test; A1 names the two observable behaviours; drop recon's token-list row.
- **Opus r1** (Plan agent): conditional approve, conditions: P1's entry gets its own group and the invariant names only what the guard covers; I2's reason corrected (the content script does hold its own forgotten session's port); F4 checked on Firefox 153; both P5 stubs; the network spec named as a no-regression check. All accepted. Checking F4 showed Firefox 153 sets `sender.origin` (F4), so P4 shrank to the note (D4). Its P2 note, that the node sees the account as fee payer of any fast-path batch, narrowed P2's invariant to the sender the call observes. Its wording points on facts that read as triggers were rewritten.
- **Final Codex pass** (fresh `gpt-6.1-sol` session, high): conditional approve, then **approve** once two invariants were narrowed. Accepted: P1 also updates the read-ordering test (NO_FROM's reads before the slot become 0, a tighter pin); P3's invariant names disconnect requests only; P5's invariant names the silent-restore clear only; gate commands say where they run. Confirmed D4 against Firefox 153.0.4's and Chromium's sender construction.

### Arc 1 review

- **Codex round 1** (`gpt-6.1-sol`, high, over `8ae2c06a4..` of `apps/`): clean, two comment nits, both applied (the url-only control's name and note; the fast-path prefix note cut to its one constraint).
- **Opus diff review** (beside round 1): the code clean; P3 refuses no flow the SDK sends (it disconnects only after the key exchange, from the holding tab); P2 keeps payload order. Material: two committed texts read as describing the problem, not the change; the plan sentence was deleted and the branch's commit messages rewritten before its first push. Nits applied: the sender-fields note no longer reads as if Firefox 153 introduced `sender.origin`; `view-executor.ts`'s fast-path note names the new boundary.
- **Codex round 2** (resumed): clean, one nit applied (the stale "Mirrors `BaseWallet.simulateTx`"). Loop converged.

## Seeds

Not run: the orchestrator drives each arc.

```
/goal Every phase of implementations-plan/harden-security-fixes-4/plan.md is marked ✓, each backed by its validation gate reported passing in the transcript; each arc's Codex loop converged (a resumed pass reporting no new material point, quoted); the arc's PR exists against dev, opened after its loop; bun run test and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/harden-security-fixes-4 forward per its plan.md: read plan.md, STATUS.md and lessons/ first; take the next unmarked phase of the current arc; run its gate; at an arc boundary run the Codex loop per the Post-implementation section, then open the arc's PR; never merge; stop and report after three failures on one step.
```
