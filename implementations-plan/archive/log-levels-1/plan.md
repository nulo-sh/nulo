---
plan: log-levels-1
tier: light (the orchestrator's call; Opus Plan leg added)
status: completed; arc 1 merged (#1268), arcs 2-3 delivered (#1297, #1302) with this close-out
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 Explore agent (sonnet) plus the driver's reads; one Codex audit round-trip (gpt-6.1-sol, high) plus one Opus Plan critique
base: origin/dev at 78f5f9171
trunk: dev
issues: [1131, 1132, 1133, 1136, 1178, 1216]
---

## Outcome

- Date: 2026-10-28.
- Status: completed, delivered as a stack on `dev`:
  - #1268 (arc 1), merged as 2e524ef73;
  - #1297 (arc 2), #1302 (arc 3) and this close-out, awaiting the merge.
- Shipped:
  - #1268 (closes #1131 and #1136). Logs at debug, with a real failure on the same path kept at error:
    - a gas balance retry that a lock, delete or switch overtakes is skipped, or fails at debug;
    - a PXE op that a purge or a delete's generation fence ended (`StoreErasedError`);
    - `getSyncedBlockHeader` asked of a PXE before its first sync.
  - #1297 (closes #1133, #1132 and #1216):
    - a lock that fails the profile activation leaves no unhandled rejection;
    - both apps install `forwardVueError`, so Vue's client-disconnect errors log at debug;
    - every lock path ends the network-switch run and the stale-network resume. A superseded run's failure resolves at debug, and the shell reports a live one with `logCallFailure`.
    - #1216 was two calls; the diagnostic named both (D9).
  - #1302 (closes #1178):
    - these failures reach the popup typed (`PasskeyNotOpenedError`; `exportPlain` keeps the type): a wrong password, another profile's passkey, a passkey with no PRF, and an unconfirmed or cancelled prompt;
    - each logs at debug where its page words it (`logCredentialFailure`);
    - any other failure on those paths stays at error.
- Did not hold: #1178's `Failed to create profile:` + `PasskeyPrfError` form at HEAD. It came from a chaos build that predates #1221 (phase 3.3, [lessons/phase-3.md](lessons/phase-3.md)).
- Superseded:
  - D5's `Promise.all`, which Codex reproduced publishing the failure before the supersede;
  - D2's op-wide match, narrowed to `getSyncedBlockHeader`;
  - `SameUnlockMethodError` as a refusal: it stays at error (D10).
- Lessons:
  - None promoted to `lessons.md`: it holds 8183 of its 8192 bytes, and none of its entries is superseded.
  - The demotion rules went to the `logging-policy` skill, which owns log levels.
  - The tooling candidates stay in [lessons/phase-2.md](lessons/phase-2.md) and [lessons/phase-3.md](lessons/phase-3.md): the chaos model's line citations, the auto-import types of a new `src/utils/` export, `gh stack sync` on a conflict, and Biome's line budget, which ignores comments.
- Known limits:
  - #1299 (D10);
  - #1304: a lock refusal that the popup handles before the lock event, which arrives on another port, still logs at error.
- Open items: #1296, two sibling popup reads that a lock can still leave at warn or error.
- Seeds retired: the `/goal` and `/loop` seeds below. Do not run them.

# log-levels-1: expected refusals leave the error level

## Outcome & Quality Bar

For whom: a person who exports their log for a bug report, and the maintainer who reads it. `warn` and `error` lines reach every user's log and export (CLAUDE.md § Logging policy).

- A lock, a delete, a not-yet-synced PXE, a wrong password or a refused passkey adds no `warn` or `error` line. Real failures on the same paths still log at `error`; a test pins each pair.
- No rejection a lock causes ends as an unhandled rejection: each gets a handler at the call that made it. No screen, copy or stored row changes.

Good enough: no new log categories, no log-viewer work, no change to the redactor.

## Paths (recon.md has the checks; all are S4: log only)

| Issue | Path | Label |
|---|---|---|
| #1131 | gas leg throws → `legWithRetry` sleeps 1.5 s → lock/delete/switch fires `evictAll()` → retry reads under the next session → `logError` | demonstrated (chaos, Chrome and Firefox) |
| #1136 | fresh PXE read before first sync, or a read parked across a purge → `logOpFailure` logs `[READ] … failed` at error; both callers recover | demonstrated (network chaos) |
| #1133 | `runActivation` starts the core, awaits `getProfiles()`; a lock makes the core reject first → unhandled for that moment → `console-forwarding` logs error | demonstrated on Firefox; order inferred from code (moderate) |
| #1132 | a page's async hook awaits a client call; the lock unmounts the page, which disconnects the client → `Client disconnected` → Vue's default `console.error` → error | demonstrated (chaos); component unnamed |
| #1216 | Home → lock → a popup call rejects `Profile locked` with no handler | demonstrated as a 2/40 e2e flake; call unnamed |
| #1178 | a wrong password, another profile's passkey, no PRF, an unconfirmed prompt or a stale form → the page words it and also logs error | demonstrated (agent chaos); the `Failed to create profile:` + `PasskeyPrfError` form does not hold at HEAD (recon.md) |

## Architecture & Implementation

**Arc 1, worker services (#1131, #1136).**
- `execution/gas-balance-reader.ts`: `legWithRetry(label, read, evictGenAtStart)`. Before the retry, an eviction since the compute began means its context was invalidated: skip the read, log at debug, return `{ value: null, failed: true }`. A retry that fails after an eviction logs at debug; one that fails under the same context still logs `Failed to get … FeeJuice balance` at error. Mirrors #1135's fence-at-the-catch fix (`0564b48ce`). Both lines pass the error as `{ error }` (today: bare, `:226`, `:232`).
- `aztec-runtime/src/pxe/lifecycle-coordinator.ts`: export `StoreErasedError extends Error` (literal `name`, no wire entry: thrown and caught in the offscreen document). `assertUnchanged` throws it, and so do both throws of `PxeService.assertGenerationCurrent` (`service.ts:888,893`, a delete's generation fence); every message stays as it is.
- `aztec-runtime/src/pxe/stale-anchor.ts`: export `PXE_NOT_SYNCED_DIAGNOSTIC`, the full installed text (`Trying to get block header with a not-yet-synchronized PXE - this should never happen`); `stale-anchor.sources.test.ts` pins the full text. `isStaleAnchorMessage` keeps its substring.
- `aztec-runtime/src/pxe/service.ts` `logOpFailure`: debug for `StoreErasedError` (READ and WRITE), and for the not-synced text only when the label is `getSyncedBlockHeader`, the one op whose callers recover from it. Its doc comment states the rule: a designed refusal the caller recovers from is debug.

**Arc 2, popup shell (#1133, #1132, #1216).**
- `composables/useProfileBootstrap.ts` `runActivation`: observe the core at once and settle in today's order: `const coreDone = core.promise.then(() => undefined, (error: unknown) => ({ error }))`, then `appStore.profiles = await managers.profile.getProfiles()`, then `const failed = await coreDone; if (failed) throw failed.error`. The core's failure still reaches `trackActivation` after the list answers, where a lock's supersede turns it into `false`. A scratch run of the three variants (original, `Promise.all`, this) gave: original `false` with one unhandled rejection; `Promise.all` threw before the supersede; this `false` with none.
- `wallet/logger/console-forwarding.ts`: export `forwardVueError(error, _instance, info)`: the disconnect matcher picks `console.debug`, else `console.error`, each with `{ error, info }`. The console pipe keeps DevTools output. `popup/index.ts` and `onboarding/index.ts` set it as `app.config.errorHandler` before `mount`.
- #1216: first name the call (phase 2.3), then hold its promise where it is made, as `runFencedBootstrap` holds the bootstrap's.

**Arc 3, credential refusals (#1178).**
- `extension-messaging/src/errors.ts`: `PasskeyNotOpenedError` and `SameUnlockMethodError` (`WalletError`s, in `REBUILT_AS`), with today's exact messages. `profile/service.ts` throws them where it throws the plain `Error`s now (`:502`, `:970`, `:1401`).
- `profile/service.ts` `exportPlain`: its catch flattens every throw to `new Error(message)` (`:2126`), so the account-file path loses the type before the popup sees it. Rethrow `InvalidPasswordError` and `PasskeyNotOpenedError` as they are, at debug; flatten and log the rest at error as today.
- New `apps/extension/src/utils/credential-refusal.ts`: `isCredentialRefusal(err)` and `logCredentialFailure(line, error)` (debug when a refusal, else error, `{ error }` always). A refusal is `InvalidPasswordError`, `PasskeyNotOpenedError`, `SameUnlockMethodError`, or a passkey failure the existing reading already names (`classifyPasskeyFailure` is `not-confirmed` or `no-prf`, or `isPasskeyCancel`); checked on the error, then on its `cause` once, for the import wrap. `PasskeyUnconfirmedError` counts only through its cause: an unknown confirmation failure stays at error.
- Sites: `unlock-method.vue`, `export/account.vue`, `useFullBackupExport.ts` (both catches), `full-backup-restore.ts` (`restore failed` only; `rollback incomplete` stays error), `useProfileCreateFlow.ts`. `useProfileImportFlow.ts` `chooseUnlock` keeps its message and adds `{ cause: err }`.

## Decision ledger

- D1 (#1131): fence on `evictGeneration`, not on the refusal's text: one check covers lock, delete and switch, and it stops the wrong-context read the "No network configured" form shows. Rejected: matching the fence's message (misses two of three texts).
- D2 (#1136): demote the full upstream text, pinned in the installed package, on `getSyncedBlockHeader` only (Codex: an op-wide match could demote a node-relayed failure carrying the same words). Rejected: waiting for a first sync before reading (new state for a log line); a typed error thrown from that one op (a class for one caller).
- D3 (#1136): one local typed `StoreErasedError` for the purge guard and the generation fence (Opus: the second fence refuses a read a delete interrupts the same way, plausible but unverified, and the fix is local), messages unchanged. Rejected: a message match (the generation fence has two texts).
- D4 (#1132): one Vue handler with the rule unhandled rejections already follow. A disconnect is how every page's own teardown ends its calls; a catch per page would copy the rule into each page. Non-disconnect errors keep `error`, so nothing is hidden.
- D5 (#1133): observe the core at once, settle in today's order, rethrow its failure. Rejected: `Promise.all` (Codex, reproduced: it publishes a core failure before a lock's supersede can turn it into `false`, so `runFencedBootstrap` could log and toast); a no-op `.catch` (it drops the core's failure). When `getProfiles()` fails first, its error propagates and the core's is dropped, as `Promise.all` would.
- D6 (#1216): no handler without the call named. The diagnostic records the method beside the rejection and never changes a rejected value, so every exact-message matcher behaves as shipped. If 80 Chrome runs do not reproduce it, comment on #1216 and leave it open.
- D8 (arc 1, a deviation): `StoreErasedError` follows the brand-field idiom of `WrongStoreKeyError` (`isStoreErased = true as const`) with no literal `name`: `instanceof` runs in the module that throws it, and the logged name stays `Error`, as today.
- D9 (arc 2, a deviation): #1216 had two calls, named one after the other by the diagnostic: the network-switch run's `getStaleNetwork` and the stale-network resume's `getPendingReset`. Both take the same fix: a lock ends the run (the switch fence's `supersede`, the resume's session), a superseded run's failure resolves at debug, and the shell reports a live one with `logCallFailure`, the forwarder's disconnect rule. Two sibling reads no run met are #1296.
- D10 (arc 3, a deviation): `SameUnlockMethodError` is typed as planned but is not a refusal. Since #1219 the stale-credential guard runs first, so no page can reach it, and logging it at debug would only hide a future page bug. A slot corrupted under the right credential reads as a wrong one in `openProfileSlots` by design, so it now logs at debug. It is the closed known limit #1299.
- D7 (#1178): typed errors over message matching, per `InvalidPasswordError` and `StaleUnlockCredentialError`; `exportPlain` keeps them through its catch. Reusing `StaleUnlockCredentialError` for the stale form was rejected: its page shows another toast. `PasskeyUnconfirmedError` is a stage, not a refusal: only its cause decides.

## Security & Adversarial Considerations

- Threat: a level change that hides a real failure, or an attacker-shaped error that rides a debug branch. Demotions key on wallet-authored types, the disconnect constant, and one full upstream text on one op (`getSyncedBlockHeader`), pinned by a source test; a hostile dApp controls none of them, and a node-relayed text on another op stays at error. Each demotion is paired with an `error` control.
- No new data reaches a log line; every touched call passes the error under `{ error }`. `REDACTED_KEYS` is unchanged.
- Two new `WalletError` codes cross the worker-popup wire only; the dApp envelope is unchanged (`toWalletResponseError` does not list them).
- No permission, dependency, crypto or storage change. Supply chain: no new package.

## Assumptions

Facts: `onActiveProfileChanged` fires when a session opens (`session-manager.ts:336`, so on a switch) and closes (`:416`, lock and delete), and `evictAll` is its handler (`execution/service.ts:591`). `logOpFailure` serves READ and WRITE (`service.ts:962,1016`). `InvalidPasswordError` survives the wire (`errors.ts:638`). No `app.config.errorHandler` exists in either app entry. `chooseUnlock` flattens `PasskeyPrfError` (`useProfileImportFlow.ts:244`). `exportPlain` flattens every throw (`profile/service.ts:2126`); `openBackupTransfer` does not. A known chaos finding keeps its seed red (`checkers.ts`, `KnownFinding`), so a green replay is a proof.
Inferences: #1132's lock → unmount → disconnect order is inferred; the chaos run shows only Vue receiving the disconnect (moderate). Vue 3.5.42's prod `handleError` calls the app `errorHandler` instead of `console.error`, but only for an error it attributes to a component instance (read in `runtime-core.cjs.prod.js`); an instance-less error still prints. Every `getSyncedBlockHeader` caller recovers (high; two callers, both read).
Asks: none open. An issue needing a screen change goes to `OWNER-ASKS.md`; none does.

## UI impact

None. No arc changes a screen, its copy, a toast or a route. `chooseUnlock`'s message stays byte-equal; a test pins it.

## Phases

### Arc 1 (#1131, #1136) ✓

1.1 ✓ Gas reader. Pass `evictGenAtStart` into `legWithRetry`, then add the two checks. Tests in `gas-balance-reader.test.ts`: an eviction in the retry delay means no second read, a debug line and no `logError`; an eviction while the retry runs, then its failure, logs debug; control: a failed retry with no eviction logs `logError` once.
1.2 ✓ PXE levels. Add `StoreErasedError`, the constant and the two demotions. Tests: `service.test.ts` gets one case per refusal (debug, no error line), and the not-synced text on another op still logs error (the control); the existing "any OTHER failure logs at ERROR" case stays. `lifecycle-coordinator.test.ts` and `incarnation-fence.test.ts` assert the type and the unchanged messages.
1.3 ✓ Remove the #1131 and #1136 entries from `KNOWN_FINDINGS` (`tests/e2e/helpers/profile-chaos/checkers.ts`), and their cases from `scripts/e2e/profile-chaos-model.test.ts`, which now pins that a fixed finding's line is an unfiled red.
Gate: `bun run lint && bun run typecheck:all && bun run test && bun run test:all` exit 0; the new cases fail on the base copy of each source file and pass after. #1131's replay list 15 times on Chrome on the armed smoke build (`NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_ACTIONS=<file> NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/profile-chaos.test.ts --retry=0`; 1 in 5 on base), and one proverless network run of seed 1001 (`NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=1001 NULO_E2E_CHAOS_RUNS=1 NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/profile-chaos.test.ts`): neither shows a #1131 or #1136 line. A red from another lane's open issue is read and named, not fixed here.

### Arc 2 (#1133, #1132, #1216) ✓

2.1 ✓ `runActivation` as D5. Test in `useProfileBootstrap.test.ts`: the core rejects while `getProfiles()` is pending, and no unhandled rejection reaches a runtime listener; the bootstrap settles as superseded. A second case: `getProfiles()` rejects first, and the core's later rejection is not left unobserved.
2.2 ✓ `forwardVueError` in both entry points. `console-forwarding.test.ts`: a disconnect logs debug, another error logs error. A component test mounts an app with the handler: an async `onMounted` that rejects with the disconnect error makes no `console.error` call, and one that rejects with another error makes one (the control).
2.3 ✓ Name #1216's call. Builds below are the armed smoke build (`global-setup-smoke.ts` prints its command) and runs set `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`. Build the armed smoke build with an uncommitted change at `base-client.ts`'s terminal seam: it records each refused request's method beside the rejection, never in the rejected value. Run `security.test.ts` alone on Chrome up to 80 times. A hit names the call: hold its promise at that site with a debug line for a lock refusal, plus a unit test. Drop the instrumentation and rebuild before the gate. No hit: D6.
2.4 ✓ Remove the `KNOWN_FINDINGS` entries (`tests/e2e/helpers/profile-chaos/checkers.ts`) of each issue this arc closes; an entry whose issue stays open stays, re-pointed to it.
Gate: arc 1's commands. Chaos replays from each issue's `## Record`, on a rebuild from the committed tree, all green at retry 0: #1132's list 12 times on Chrome (1 in 4 on base), #1133's list 3 times on Firefox (3 of 3 on base). Then `bun run test:e2e -- tests/e2e/security.test.ts --retry=0` on Chrome: 60 consecutive runs with no `pageErrors` when the call was named (0.95^60 ≈ 5% chance of a false pass); under D6, 20 runs where only the recorded `Profile locked` error may appear. Once on Firefox.

### Arc 3 (#1178) ✓

3.1 ✓ Typed refusals and `exportPlain`. Tests: each new type survives `walletErrorFromPayload` with its message (the existing error-table test); `exportPlain` with a wrong password rejects as `InvalidPasswordError` with no error line, another profile's passkey as `PasskeyNotOpenedError`, and a corrupt-row control still flattens and logs error; the account service's `exportAccount` rejects a wrong password as `InvalidPasswordError`.
3.2 ✓ Classifier and sites. Tests in `credential-refusal.test.ts`: one case per refused class (debug); `PasskeyUnconfirmedError` with a `NotAllowedError` cause (debug) against one with a `TypeError` cause (error); the import wrap around each; an unknown error (error). `useProfileImportFlow` test: the no-PRF wrap keeps its message and carries the cause.
3.3 ✓ Trace the `Failed to create profile:` line: find which error reached it, and fix it only with a written path.
3.4 ✓ Remove no `KNOWN_FINDINGS` entry: #1178 has none.
Gate: arc 1's commands, plus `bun run test:e2e -- tests/e2e/security.test.ts tests/e2e/passkey-backup.test.ts tests/e2e/security-backup.test.ts --retry=0` on Chrome, and `passkey-backup.test.ts` on Firefox.

## Delivery

One `gh stack` on `dev`; `gh stack init --adopt worktree-log-levels-1` makes the plan branch layer 1. No e2e scenario is added, so no budget line.

| Layer | Branch | Phases | PR title (≤ 92) | Closes |
|---|---|---|---|---|
| 1 | `worktree-log-levels-1` | 1.1-1.2 | `fix(logs): a gas retry or a pxe read that a lock or purge ends logs at debug` (77) | #1131, #1136 |
| 2 | `log-levels-1-popup` | 2.1-2.3 | `fix(popup): handle lock refusals at their calls, and vue's disconnect errors at debug` (86) | #1133, #1132, #1216 if named |
| 3 | `log-levels-1-credentials` | 3.1-3.3 | `fix(logs): wrong passwords and refused passkeys log at debug` (60) | #1178 |
| 4 | `log-levels-1-close-out` | close-out | `docs(plans): close log-levels-1` (32) | none |

Lanes: none; arcs share no files but run in order on one stack.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `78f5f9171`, steps 2 to 5 (`code_review: off`, so step 1 is absent). Plan-specific values:
- Review loop per arc at its boundary: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; hard stop at three rounds. Arc map for the prompt: "arc N of 3: 1 worker services, 2 popup shell, 3 credential refusals". Then one fresh cross-arc pass over `dev...HEAD`.
- Delivery: `gh stack submit --auto`, then `gh pr edit` per body; open each PR without labels. Nothing merges before the orchestrator's word.
- Close-out on layer 4; teardown: `agent-worktree done log-levels-1 --merged` once `implementations-plan/archive/log-levels-1/plan.md` is on `dev`.

## Audit verdicts

Round 1, run in parallel on the draft. Every finding was checked against the tree; all were accepted.
- **Codex** (gpt-6.1-sol, high): reject. (1) D5's `Promise.all` publishes a core failure before a lock's supersede (reproduced in a scratch run, see the arc 2 bullet). (2) `exportPlain` flattens the typed refusals (`service.ts:2126`). (3) `PasskeyUnconfirmedError` wraps any cause, so demoting it hides real failures. (4) D2 op-wide is broader than the evidence: narrowed to `getSyncedBlockHeader`. (5) The #1216 diagnostic must not change rejected values. (6) A wrong citation (`session-manager.ts:359`).
- **Opus** (Plan): conditional approve, on the same (1) to (3) and (5) to (6), plus: the arc 2 gate (20 runs) cannot prove a 5% flake gone, and the smoke runs need the armed build (both fixed in 2.3 and the gates); the generation fence (`service.ts:888,893`) logs a delete's refusal at error too (folded into `StoreErasedError`); the gas reader logs a bare error. Opus held D2 op-wide as equivalent in practice (`autoSync` makes the text reach only `getSyncedBlockHeader`); the narrower match costs nothing and was kept.
- Round 2, Codex resumed on the revised plan: `VERDICT: approve` (no remaining material defect).
- Arc 1 review loop (on `4c5c67f2f..HEAD`). Round 1: Codex (fresh session, gpt-6.1-sol, high) found one comment error (the not-synced callers fall back or defer; they do not both answer from elsewhere); Opus (diff review) found `StoreErasedError` splitting the coordinator's doc from its class (also caught in self-review), a gas comment that named too few session changes, a vacuous chaos-model assertion, a stale fixture id, and asked that the erased-store debug line carry the error. All accepted, fixed in `056881d8a`. Round 2 (Codex resumed): `VERDICT: clean`.
- Both: D1, D3, D4 and D7's typed errors sound; no fix adds state, a lifecycle, a protocol, a recovery policy or a public contract.
- Arc 2 review loop.
  - Round 1, Codex (fresh session, gpt-6.1-sol, high): one demonstrated miss, the reconnect path's unhandled `stale.resume(...)`.
  - Round 1, the Opus leg found:
    - the same site;
    - the shell's wiring, untested, now pinned by `popup/app-wiring.test.ts`;
    - five comment fixes;
    - two sibling reads outside the arc's issues, filed as #1296.
  - All accepted. Round 2 (Codex resumed): `VERDICT: clean`.
- Arc 3 review loop.
  - Round 1, Codex and the Opus leg: the same residual, a slot corrupted under the right credential that now reads at debug. It became the closed known limit #1299, since separating the two changes `openProfileSlots`' exported contract.
  - Round 1, the Opus leg also found:
    - the regenerated auto-import types left uncommitted;
    - `SameUnlockMethodError` unreachable from any page, so it stays at error (D10);
    - two stale comments.
  - All fixed. Round 2 (Codex resumed): `VERDICT: clean`.
- Cross-arc pass: a fresh Codex session (gpt-6.1-sol, high) over the net diff from `78f5f9171`.
  - The four demotion rules agree, and none combines with another to hide a live failure.
  - A restore's disconnect and its rollback failure stay at error.
  - No helper is duplicated in three places.
  - All 65 chaos citations resolve.
  - `VERDICT: clean`.

## Seeds (not run; orchestrator-owned)

`/goal` Arcs 1-3 of implementations-plan/log-levels-1/plan.md each have their gate passing in the transcript, a Codex loop that converged (quoted), and a PR on the stack; the close-out layer archived the plan; `bun run test` and `bun run lint` exit 0.
`/loop 15m` Drive implementations-plan/log-levels-1 per its plan.md: reality check, next phase, gate, arc loop, delivery; never merge.
