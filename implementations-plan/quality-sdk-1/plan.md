---
plan: quality-sdk-1
tier: light
status: arc 1 merged (#1587); arc 2 implementing
issues: "#1444, #1474 (arc 1); #1451 (arc 2)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at 51a692426
trunk: dev
post_implementation_hardening: not scheduled
---

# quality-sdk-1: background.ts in three modules, one deadline and abort helper, edge headers that must agree

Three quality findings, refactors a person never notices. `wallet-sdk/background.ts` holds wiring, content admission and the dApp request pipeline in 971 lines (#1444). Eighteen sites hand-write a promise against a timer or an `AbortSignal` (#1451). Five public surfaces write the same HTTP security headers with differing values and no test that compares them (#1474). The owner's go (2026-11-02): "If they are worth doing and legit. I'd do them." Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

## Outcome & Quality Bar

- **For whom**: the maintainer who next changes an admission rule, a dApp call's path, a deadline or a header.
- **Excellent**: (1) every existing test passes unedited except the pins that name a moved file, each edit stated in its commit; (2) each deadline site reads as one call whose contract (timer cleared, late rejection observed, listener removed) is proved once, in `wallet-core`; (3) a header changed on one surface and not the others fails a test that names the surface and the header.
- **Good enough**: no site outside the issue's list; header values unchanged.

## Findings (paths verified at `51a692426`)

| # | Path | Label |
|---|---|---|
| #1444 | Admission (`background.ts:320-474`) reads only the logger and sibling modules; the pipeline (`:100-102`, `:528-740`, `:805-971`) changes for queued journals, pending caps and the Terms gate; wiring for restart and teardown. Consequence: three change drivers in one file. | demonstrated (trace, `git log`) |
| #1451 | Sites 3, 13, 14 clear the timer after the `await`; site 17 hangs if its input rejects; site 16b's `void promise.finally(done)` would leave a rejection unhandled. Every input today only resolves, so all are latent. Consequence: each new deadline re-derives the skeleton. | demonstrated in code; no live failure |
| #1474 | Recon's table: HSTS, X-Frame-Options, Referrer-Policy and Permissions-Policy differ, with no record of which differences are meant. | demonstrated (trace) |

Claims that did not hold (recon): sites 5, 17, 18 use no `Promise.race`; site 4 has one race; site 16a's timer is the injected `deps.sleep`, so it is not this skeleton.

## Assumptions

- **Facts**: F1 the recon cites. F2 `discovery-flow.ts` is the extraction precedent: its own deps type, projected per call by `discoveryDeps` (`background.ts:786`). F3 `background.transport.test.ts` drives every admission check through `initWalletSdkHandler`. F4 `Promise.race` subscribes to every input, so an input that rejects after the race settled is observed. F5 every site's package already imports `@nulo/wallet-core/utils`; site 1 is inside `wallet-core` and imports `../utils/race`. F6 none of the four header modules imports anything; `test:ci-gating` runs `scripts/ci-cd/` in `quality-status`.
- **Inferences**: I1 a pure move adds no `await` and reorders no read, so microtask order is unchanged in arc 1. I2 (corrected, Codex r1; probed on Node 24 and Bun 1.4.2) `raceTimeout` returns the bare `Promise.race`, its timer cleared from `work.then`, so sites 1-5 and 11-15 resume after as many microtask turns as today; the `.finally` sites 6-10 resume earlier (three turns on V8, one on Bun). Those callers act on which input settled first, not on the turn count; their pins prove the outcomes. I3 site 16b keeps its turn count; site 17's caller resumes one turn later (the `.then` that maps the outcome), and its next step (`waitForEarlier`) reads live state after its own awaits. Site 18 is not converted: mapping the outcome to its rejection adds a turn before the catch that frees a capped slot (Codex r1, reproduced; Opus r1 held the ticks would match, the trace shows the mapping's turn).
- **Asks**: none. The header differences with no recorded reason are kept and said so (D6); whether to align them is a separate decision, noted in the #1474 Decision comment.

## Architecture & Implementation

- **D1, `content-admission.ts`** (#1444 step 1): move `DiscoveryCredit`, `ContentWrapperDeps`, `buildContentTransport` (exported), `admitContentMessage`, `keyExchangeFromItsDiscovery`, `senderDocumentOrigin`, `replyIfStale` verbatim, with their imports. `background.ts` imports `buildContentTransport`.
- **D2, `wallet-message.ts`** (#1444 step 2): move `SESSION_NO_LONGER_VALID`, `onWalletMessage`, `createQueuedJournalIfStamped`, `refuseOverPendingCap`, `dropUnrunMessage`, `runEstablishedMessage`, `WalletMessageDeps`, `handleWalletMessage`, `isExpectedRefusal`, verbatim but for the reads the projection renames (`state.late.handler!` to `deps.handler`, `state.sessions` to `deps.sessions`, `state.late.switchEpoch!` to `deps.switchEpoch`), each listed in the PR body. `onWalletMessage(session, message, deps: MessagePipelineDeps)` replaces `(deps: SdkDeps, state: SdkHandlerState)`: the type lists the 13 fields the pipeline reads (`handler`, `sessions`, `switchEpoch`, the dispatcher, five services, the journal, `legal`, `resetRun` and the logger), and `background.ts` projects it per message with `messagePipelineDeps(deps, state)`, as `discoveryDeps` does. `handler` and `switchEpoch` are bound before `handler.initialize()` and never rebound, so reading them at arrival equals reading them later. Wiring, `serializeDecryption`, the discovery drain and the three state helpers stay.
- **D3, the pins and references that name a moved file**, each a deliberate edit in the commit that moves the code: `legal/call-sites.test.ts` lists `wallet-message.ts` for `background.ts`; `copy-dash-ban.test.ts`'s entry follows `SESSION_NO_LONGER_VALID`; `price/not-dapp-exposed.test.ts` reads `wallet-message.ts` too (a dApp-facing module); `useLogFilters.scan.test.ts` `OWNED` gains both modules under `wallet-sdk`; the chaos model's `cite` gets its new line; `CLAUDE.md` § Terms acceptance and `ARCHITECTURE.md:178`, `:187` name the new modules. Comments that name moved code follow it (Opus r1): `operation-journal/{spec.ts:222,service.ts:581,reaper.ts:75}`, `dapp-interaction/service.ts:735`, `execution/service.composition.test.ts:368`, `wallet-sdk/{content-message-relay.ts:41,ping-pong.test.ts:54}`, `packages/wallet-bridge/src/dispatcher.ts:151`, and the e2e headers `cancel-mid-prove.test.ts:23`, `concurrency-rapid-fire.test.ts:12` (its line numbers are already stale), `concurrent-sendtx.test.ts:41`. Each phase reviews `git grep -n "background\.ts" -- apps packages` and leaves only references that still hold (the wiring, the "extracted from" notes). Test imports of `handleWalletMessage` move to `./wallet-message`.
- **D4, `packages/wallet-core/src/utils/race.ts`** (#1451), exported from the barrel:
  - `raceTimeout<T, U>(work: Promise<T>, ms: number, onTimeout: () => U): Promise<T | U>`: settles as `work` does, or with `onTimeout()`'s value or throw once `ms` pass first; the timer is cleared on either outcome; `work` is not cancelled, and its later rejection is observed. Built as `Promise.race([work, expiry])` with `work.then(clear, clear)` beside it, the timer's callback catching `onTimeout`'s throw into `reject` (I2).
  - `raceAbort(promise: Promise<unknown>, signal: AbortSignal): Promise<"settled" | "aborted">`: `"settled"` once `promise` fulfils or rejects, `"aborted"` once `signal` aborts first, or at once when it already has; the first wins; never rejects. It subscribes to `promise` on every path, so a later rejection is observed, and it removes its listener on either outcome.
- **D5, conversions**: sites 1-15 to `raceTimeout`; 16b and 17 to `raceAbort`, which ends their latent defects (an unhandled rejection, a hang). Site 18 stays: it already handles both arms (I3). Site 16a stays: its timer is the injected `deps.sleep` its tests drive. Each caller keeps its budget, clock, early return, error and teardown (`staging.revoke()` as site 1's `onTimeout`; site 4's quarantine in its `catch`; site 8's `late` at once; site 13's monotonic clock). The pre-attached `.catch(() => {})` at sites 1 and 6 go: F4 and the helper's test cover them. Site 8 keeps `read.then(...)` before its early `late`, so a read in flight past the deadline stays observed (pinned first). `withTimeout` stays exported as one line over `raceTimeout`. Three changes reach only inputs that cannot occur today or a value nothing reads, and the PR body states them: site 17 answers `true` where it hung on a rejection; site 16b's rejection is handled where it went unhandled; site 15 rejects with an `Error` where it rejected a string its `catch {}` discards.
- **D6, `scripts/ci-cd/edge-headers.test.ts`** (#1474): reads both `_headers` through `siteHeaders` and imports the three maps; lower-cases names. Shared set: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy. A pure `disagreements(surfaces, exceptions)` reports, per header, every surface outside `EXCEPTIONS` whose value differs from the others', and every exception whose surface no longer differs. `EXCEPTIONS` records today's nine differences, each with its exact value or absence and a one-line note (an empty-bodied `/api/*` error, a JSON-only host, the passkey host's own policy); where no document gives a reason (the HSTS ages, the landing's Referrer-Policy), the note says "as found at `51a692426`, no recorded reason". `disagreements` also reports an excepted surface whose value is not the recorded one (both legs, r1). Notes cite a source where one exists (`infra/subscribe/README.md:35`, `apps/landing/src/worker.ts:13`, `infra/passkey-rp/README.md:7`). CSP, CORS and caching stay per surface.
- **Files**: arc 1: `apps/extension/src/wallet/services/wallet-sdk/{background,content-admission,wallet-message}.ts`, the D3 files, `background.{refusal-log,legal,reset-wait}.test.ts`, `session-revocation.test.ts`, `scripts/ci-cd/edge-headers.test.ts`. Arc 2: `packages/wallet-core/src/utils/{race,race.test,index}.ts`, the 17 site files of D5, their tests where a pin is added.
- **Alternatives not taken**: step 1 alone (the pipeline, the largest driver, stays beside the wiring); exporting `SdkDeps` and `SdkHandlerState` to the pipeline (a child importing its parent's types, against F2's precedent); `raceTimeout` closing with `.finally` (three more turns at ten sites on V8, I2) or as an `async` function; converting site 18 (I3) or 16a (its injected sleep is what its tests drive); the issue's `packages/edge-headers` (four dependency-free deployables gain a dependency for five strings); a canonical value table in the test (a third copy of each value; agreement plus exact exceptions catches the same drift); aligning any header value (a change on the wire, outside a behaviour-preserving lane).

## UI impact

None. No screen, copy, stored shape, wire message or log line changes; header values are unchanged.

## Security & Adversarial Considerations

- **Hostile page or dApp** (sends any content-script envelope, any wallet message): D1 and D2 move the admission order (top frame, schema, key exchange from its discovery's document, stale reply) and the pipeline (pending cap, establishment gate, profile binding, reset wait, Terms gate, liveness, epoch) unchanged; `background.transport.test.ts` and the `background.*` suites prove it, and the Terms pin moves with the guard, never loosened.
- **Deadlines**: a conversion that lost a clear would keep a worker or popup timer alive; one that lost a rejection would leave an operation hung. The helper's tests prove both once; each site's existing pins prove its outcome.
- **Headers**: values unchanged. The test makes a downgrade on one surface visible (for example HSTS dropped on the subscribe Worker). It reads repository files only. **Storage, permissions, crypto, dependencies, logging**: none.

## Arc 1: background.ts in three modules, and edge headers that agree (#1444, #1474)

No runtime behaviour changes in this arc: code moves, and a test is added.

### Phase 1: content admission ✓

- Move D1 and its D3 references (`ARCHITECTURE.md:187`, `OWNED`, the relay and ping-pong comments, the chaos citation's line).
- **Gate**: `bun run lint`; `bun run typecheck:all`; `bun run --cwd apps/extension test src/wallet/services/wallet-sdk src/components/JsonViewer/useLogFilters.scan.test.ts scripts/e2e/profile-chaos-model.test.ts --retry=0`; `diff <(git show 51a692426:apps/extension/src/wallet/services/wallet-sdk/background.ts | sed -n 320,474p) <(sed -n '/^type DiscoveryCredit/,$p' apps/extension/src/wallet/services/wallet-sdk/content-admission.ts | sed 's/^export function buildContentTransport(/function buildContentTransport(/')`. Pass: every command exits 0 (the `diff` too: the one permitted difference, the `export`, is normalised before comparing; Codex final r2).

### Phase 2: the request pipeline ✓

- Move D2 with the rest of D3, in one commit that names each pin edit.
- **Gate**: Phase 1's commands but the diff, plus `src/wallet/services/legal src/wallet/services/price src/wallet/services/operation-journal src/utils/copy-dash-ban.test.ts`; `bun run --cwd packages/wallet-bridge test --retry=0`; `bun run test:all`; `bun run audit:vue`; `bun run audit:dup` (record the figures and `background.ts`'s line count before and after); `git diff --color-moved=zebra 51a692426 -- apps/extension/src/wallet/services/wallet-sdk` shows only the D2 renames outside moved blocks.
- Network e2e at retry 0 from the root: `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-dapp.test.ts tests/e2e/network/concurrent-sendtx.test.ts tests/e2e/network/concurrent-sendtx-approve.test.ts tests/e2e/network/legal-acceptance-wall.test.ts tests/e2e/network/inflight-call-background-death.test.ts`, then `connect-dapp` and `inflight-call-background-death` with `NULO_E2E_BROWSER=firefox` (`senderDocumentOrigin` reads Firefox's `sender.url`). Pass: every command exits 0; record each browser's wall-clock. No smoke file opens a touched path; no e2e scenario is added.

### Phase 3: edge headers ✓

- Add D6. Control tests on a synthetic surface set: a non-excepted surface that drops nosniff yields that surface and header; an exception whose surface now agrees yields a stale entry; an exception whose surface takes another wrong value yields that surface and header.
- **Gate**: `bun test scripts/ci-cd/edge-headers.test.ts`; `bun run test:ci-gating`; `bun run typecheck:scripts`; lint. Pass: exit 0; the real surfaces report no disagreement.

## Arc 2: one helper for deadline and abort races (#1451)

### Phase 4: the helper and the missing pins ✓

- **Pins first**, on the base: site 17's abort and fulfil pins exist (`execution-lane.test.ts:893`, `:909`); add that no abort listener is left after either. Tighten site 2's pin to the request's own timeout error. Add a site 8 pin: the deadline already past, the read rejecting later, gives `late` and no unhandled rejection. All pass on the base: they pin behaviour, not a fix.
- Add D4 with `race.test.ts`: `raceTimeout` work wins (value, no timer left, `onTimeout` never called), work rejects (its reason, no timer left), timer wins (`onTimeout`'s value, called once), `onTimeout` throws (its error; `work`'s later rejection raises no unhandled rejection); `raceAbort` fulfilled, rejected, aborted while pending, already aborted then rejected, aborted then rejected (no unhandled rejection in either), and no listener left in each.
- **Gate**: lint; typecheck:all; `bun run --cwd packages/wallet-core test --retry=0`; the three pinned suites at retry 0.

### Phase 5: the conversions ✓

- Convert D5 one package at a time, one commit each (wallet-core, extension-messaging, aztec-runtime, then the extension's services, composables and views). Each site's pins pass unedited after its commit.
- **Gate**: lint; typecheck:all; each package's `test --retry=0`; `bun run --cwd apps/extension test src/stores src/popup/auth-guard.test.ts src/composables src/components/JsonViewer src/wallet/services/token src/wallet/services/profile src/wallet/services/network-reset src/wallet/services/execution --retry=0`; `bun run test:all`; `bun run audit:vue`; `audit:dup` before and after.
- Network first (it rebuilds `dist/`), as in phase 2, on Chrome: `tx-sendTx-default`, `lock-cancels-dapp-send`, `connect-dapp`, `backup-restore-integrity`, `opfs-storage`; `connect-dapp` on Firefox too (`endAndClose` closes a window).
- Then smoke: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`; from `apps/extension`, `env -u EXTENSION_PATH NULO_E2E_RETRY=0 NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/wallet-lock.test.ts tests/e2e/viewers-csp.test.ts tests/e2e/import-dead-rpc.test.ts tests/e2e/stale-network.test.ts tests/e2e/backup-roundtrip.test.ts tests/e2e/sw-resilience.test.ts`; then the same four `VITE_` flags with `build:firefox`, and the same run with `NULO_E2E_BROWSER=firefox` added. Pass: exit 0; each browser's wall-clock recorded.

## Decision ledger

| Id | Decision | Rejected |
|---|---|---|
| Arcs | by risk (Opus r1): arc 1 changes no runtime behaviour (#1444's moves, #1474's test); arc 2 holds the one change that touches timing (#1451), one revert unit and one review focus | three PRs (the lane brief caps at two); #1474 with #1451 by theme (the first draft: it mixed a test-only change into the risky arc) |
| Site 18 | kept (Codex r1) | converting it (adds a turn before the slot-freeing catch) |
| `concurrency-rapid-fire` e2e | not added (Opus r1, optional): `concurrent-sendtx-approve` covers the FIFO release | adding it |
| D1-D6 | as above | see Alternatives not taken |
| Close-out | arc 2's final commits, as `w3-dapp-1` did | a third, docs-only PR (the two-PR cap) |
| Phase 2 e2e | run with `NULO_E2E_PROVERLESS=1`, as CI's network shard pool runs: `inflight-call-background-death` refuses to start without it | a prover-on run (the file opts out of it) |
| Arc 2 test helpers (deviation) | `collectUnhandledRejections` moves to `@nulo/wallet-core/testing`, typed by the slice of `process` it uses so consumers without Node's types compile, and the extension's helper re-exports it; `trackAbortListeners` joins it | a second copy in `race.test.ts` |
| Arc 2 turn pins (deviation) | `race.test.ts` pins both helpers' resume turn against the hand-built shapes, so a `.finally` close goes red | relying on I2's probe alone |
| Site 15 (deviation) | returns the race's value, one turn earlier than its second `await fetch`; a component's log batch, nothing orders against it | keeping the redundant second await to hold the turn |
| Arc 2 e2e | the plan's phase 5 files plus arc 1's network files, proverless, as the brief asks | the phase 5 list alone |

## Audit verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex r1 | conditional approve: exception values, timing assumptions, site 18 | all 8: site 17's pins exist (1); I2's bound was wrong, the helper became a bare race after a probe (2); site 18 kept (3); exact exception values (4) and unverified reasons stated as such (5); `raceAbort` subscribes when already aborted (6); D2 keeps references and sampling points (7); `concurrent-sendtx-approve` and the Firefox build flags (8) | none |
| Opus r1 | conditional approve: exact exception values, sourced reasons, D3 sweep, a site 8 pin, `raceAbort`'s construction | exact values (1); reasons only with a source (2); the comment sweep (3); the site 8 pin (4); `raceAbort` as one `new Promise` that also subscribes when already aborted (5, with Codex r1 6); I2 corrected by the probe (6); F5, D2 renames, the e2e cycle lint, the stated latent changes (7); the arc split by risk (8) | that sites 17 and 18 keep their turn count (the outcome mapping adds one; I3); `concurrency-rapid-fire` (optional, covered) |
| Codex final r2 (resumed) | conditional approve: the Phase 1 `diff` exits 1 on the permitted `export`; recon's site 17 cell is stale | both: the `export` is normalised before the `diff`; the recon cell corrected | none |
| Codex final r3 (resumed) | approve: both corrections present, no regression | none | none |
| Arc 1 Codex r1 | approve: admission byte-identical bar the `export`; the pipeline identical modulo D2; pins, digests and the header test hold | none | none |
| Arc 1 Opus | conditional approve: the price-exposure scan misses `content-admission.ts`; the projection's early read is unstated; a header no non-excepted surface sets passes; a bare note path | all 4: the scan row, a TSDoc on `messagePipelineDeps`, a null-agreement report with its control test, the full path | none |
| Arc 1 Codex r2 (resumed) | approve: the four fixes hold; an exhaustive comparison of the split `disagreements` finds only the new null report | none | none |

## Delivery

- **Before building**: a `## Decision` comment on each issue (done, and how; for #1474, that today's differences are kept and recorded, and that aligning one is a separate decision).
- **Arc 1**: branch `worktree-quality-sdk-1`, one PR to `dev`, ready, no labels at creation, after the Codex loop and the gates. Title: `refactor: background.ts in three modules, and a test that the edge headers agree` (80 characters). Body: the moves and the D2 renames, each pin edit, the header exceptions as recorded, the gates with outcomes, `audit:dup` and line counts before and after, each browser's wall-clock, `Closes #1444`, `Closes #1474`.
- **Arc 2**: branch `quality-sdk-1-a2` from `origin/dev` once arc 1 merged (no stack), `gh pr create`. Title: `refactor: one helper for deadline and abort races, in place of seventeen copies` (79 characters). Body as arc 1's, with the three stated latent changes and site 18's reason, `Closes #1451`. The close-out lands as its final commits.
- **Neighbours**: quality-services-1 arc 1 edits `token/service.ts`'s constructor (site 8 is at `:1120`); quality-profile-1 (#1439) and quality-popup-1 (#1443) start later and plan on whichever lands first. Arc 2 merges `origin/dev` before its PR and reruns its gate.
- **Parallelism**: arcs share no file but run in sequence in one worktree; lanes would save little.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `51a692426`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, per arc: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the arc's diff against its base, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; the arc map says arc 1 moves code and adds the header test, and arc 2 adds the helper and converts the sites. One Opus `general-purpose` review beside each arc's round 1. Then one fresh Codex session over the net diff from `51a692426` for cross-arc issues. Hard stop at three rounds.
- Steps 3 and 4 as written. The close-out moves this folder to `archive/quality-sdk-1/` and comments the Decision on each issue.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/quality-sdk-1/plan.md`, then `agent-worktree done quality-sdk-1 --merged`. The orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Every phase ✓ in implementations-plan/quality-sdk-1/plan.md, each gate passing in the transcript; the Codex loop converged per arc and on the net diff (a resumed pass with no new material finding, quoted); two ready PRs to dev closing #1444 and #1474, then #1451, the second carrying the close-out; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/quality-sdk-1 from plan.md and lessons/: next unchecked phase, its gate, the arc's Codex loop, delivery; never merge.
