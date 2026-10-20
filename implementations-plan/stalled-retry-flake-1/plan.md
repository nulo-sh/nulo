---
plan: stalled-retry-flake-1
tier: light
status: planned, final Codex approve (2026-10-20); arc 1 under auto-continue
issues: "#911 (arc 1 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg
base: origin/dev at a36fd2445
trunk: dev
post_implementation_hardening: not scheduled
---

# stalled-retry-flake-1: the stalled-network stub ends held calls with a refusal, not a reset

One arc, one PR against `dev`, test code only. Recon and the traced runs: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Root cause (#911): demonstrated in reproduction; CI's instance inferred (I2)

Initial conditions: the spec's stub answers Testnet's identity probe (`aztec_getNodeInfo`) and holds every other call. A browser opens at most six HTTP/1.1 connections to one host, here the stub's `127.0.0.1:<port>`, and each held call keeps one.

1. Before the Retry, up to six calls are held: the first pass's abandoned registration (`aztec_getL1ContractAddresses`) and block-number reads, most from the second popup's Home on Testnet.
2. `stub.dropUnanswered()` destroys their sockets (`tests/e2e/helpers/rpc-stub.ts:120-122`).
3. The browser re-sends each reset request at once on a new connection, since no reply had started: Firefox every one, Chrome only those on a connection that carried an earlier call. The stub holds each copy again.
4. With six copies held, the Retry's probe waits for a connection. Each attempt aborts at 5 s; after the third, the preflight's 21 s are spent, and the tail records `ACCOUNT_STATE_SKIP_UNREACHABLE` (`src/composables/importChainSync.ts:105`).

Invariant broken: the Retry's probe reaches the stub, which the spec assumes the drop guarantees (`backup-import-stalled-network.test.ts:193-195`). Consequence: the Retry's row reads "couldn't reach the network", and the exact deadline row fails.

Evidence, at retry 0 through `agent.sh` (table in recon.md § Traces):
- CI job 118387660896: the Retry ran about 22 s (00:45:38 to 00:46:01). That fits a spent preflight (three timed-out attempts, 21 s), not three fast resets (about 6 s). Its stub log does not exist, so how many calls it held is unknown (I2).
- Unforced: Firefox held 4 and got 3 back within 3 ms; Chrome held 6 and got back the 2 on reused connections. Both green.
- Forced to six held (uncommitted fill): Firefox red 2/2 with the CI row, all six back within 4 ms and no probe in 21 s; Chrome green, four back.
- Forced, the held calls answered with the stand-in's 400: green on both, nothing back, the probe 64-90 ms after the click.

The issue's hypotheses: (1) holds in part. The first pass's calls are still in flight, but the Retry inherits no outcome from them: its own probe starves. (2) does not hold. The probe leaves on a new connection; the cause is the re-send, and Chrome does it too, on reused connections.

Not a product defect: each Retry probes with fresh clients and no status cache (recon § Product path). Against a really stalled node nothing resets the wallet's own pending calls, but they can still fill the pool. The row then says "couldn't reach the network", which is true of that node, and stays retryable: known limit KL-1, filed closed at close-out.

## Outcome & Quality Bar

For a maintainer reading the network lane on either browser:
- The Retry's probe never waits behind a call the stub held before the Retry.
- The stub's API does what its name says: no release that the browser undoes.

Good enough: the spec and its stub. No product change, no new e2e scenario.

## Architecture & Implementation

- `apps/extension/tests/e2e/fixtures/node-stub.ts`: export `refuseNodeCall(res)`, the stand-in's terminal answer (HTTP 400, its JSON-RPC error body); `startNodeStub`'s handler calls it. Same bytes on the wire.
- `apps/extension/tests/e2e/helpers/rpc-stub.ts`: replace `dropUnanswered()` with `refuseUnanswered()`, which answers every request the stub holds with `refuseNodeCall`. Held requests are tracked as `ServerResponse`s, dropped on `close`; the socket set stays for `close()`. Every later unanswerable request is held as before.
- `apps/extension/tests/e2e/network/backup-import-stalled-network.test.ts:193-195`: `stub.refuseUnanswered()`, with a comment stating why a reset is no release.
- `apps/extension/tests/e2e/import-dead-rpc.test.ts`: test T1 in a `startStub (no browser)` block beside `planBatchReplies`'s.

Mechanics. A 400 with a readable JSON-RPC body ends each held request at both layers: the transport has a reply, so it re-sends nothing, and the node client throws `NoRetryError` (`packages/aztec-runtime/src/utils/fetch.ts`, `classifyRpcFailure`), as `node-stub.ts:2-4` already relies on. The body must parse: a 400 whose body fails to parse takes `mapBodyFailure`'s retryable path. The refusal ends requests, not the work behind them: the first pass's registration loop launches its next call (`aztec_getL1ContractAddresses`, seen 19-52 ms after the release in both 400 runs), which the stub holds. The Retry's registration can then wait behind it in the PXE's chain guard. The row is the deadline either way, as it was before this change: `importChainSync.ts:122` records the deadline for a rejected call too. The deadline row also implies the Retry's probe answered, since only a `go` verdict reaches registration (`importChainSync.ts:104-106`).

### Alternatives not taken
- (W) A refusal window: also refuse every unanswerable call until the next `aztec_getNodeInfo`, to cover calls the browser still queued past six at the release. Rejected (D3): under A the probe starves only if six calls reach the stub between the release and the probe. If those can only be calls the browser queued past six and the first pass's next launch (one at a time), that takes eleven pending at the release. The count assumes no other producer fires in the ~100 ms before the probe, and no request is mid-body at the release. The traces count calls the stub held, at most six, not calls the browser queued; in Chrome's baseline the reset freed four slots and no queued call arrived. The window coordinates by method name, and a status read's `getNodeInfo` queued from before the Retry (`network/service.ts:873-886`, run in the background) would close it early anyway. Known limit KL-2.
- (B) Read the local sender after the Retry, so Home's reads come later, and delete the drop. It removes the largest source, but rests the Retry on "the wallet leaves fewer than six calls", the bound #838 already saw broken. The soft sender check would also stop reporting a wrong first-pass row.
- (C) A fresh stub on a new port for the Retry: a mid-test re-arm of the interception, a new driver path on both browsers.
- (D) Raise Firefox's per-host connection pref: masks the cause, and the suite runs with users' prefs (`FIREFOX.md`).
- (E) Abort a tail's abandoned calls in the product: no consequence that matters (KL-1); outside this lane.

## Phase 1 (arc 1): the stub refuses what it held

Steps:
1. Branch `stalled-retry-flake-1-a1` off `origin/dev`, with the plan commit.
2. Make the four changes above.
3. On base, apply the probe patch (recon § Traces) and run the forced Firefox spec once: it must be red with the unreachable row. Revert the patch.
4. Rebase the probe patch onto the fix, keeping its own `held()` count and trace calls, uncommitted. Run the forced spec on both browsers: green. Revert the patch.

T1, one test: start a stub that answers `ok`. Send a `hang` request and wait until `methods` lists it; call `refuseUnanswered()`; that request resolves with status 400 and a body that parses to the JSON-RPC error. Then an `ok` request resolves with its result (the success control). Attach each request's rejection handler at once, read every body, and `close()` in `finally`. Mutation check, run once and not committed: a reset in place of the refusal must turn T1 red.

Validation gate:
- `bun run lint` and `bun run typecheck:all` exit 0.
- Smoke, `node-stub.ts` being a fixture: `cd apps/extension && bun run test:e2e -- tests/e2e/import-dead-rpc.test.ts tests/e2e/egress-guard.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox` after an armed Firefox build (FIREFOX.md § Run it). All green.
- Network, each run started at load1 < 150: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 NULO_E2E_BROWSER=firefox bun run e2e:agent tests/e2e/network/backup-import-stalled-network.test.ts` 10 times, and the Chrome form 5 times. 15/15 green; record each file's wall-clock.
- Steps 3 and 4 as stated: red on base, green on the fix, both recorded in `lessons/phase-1.md`.
- Layers: lint, typecheck, unit (T1), smoke e2e on both browsers, network e2e on both browsers.

## UI impact

None: no product file changes.

## Security & Adversarial Considerations

Test code only. The stub binds loopback on an OS-assigned port, reached through the existing interception; the refusal body carries a fixed message and no data. No dependency, no secret, no permission, nothing that ships in a bundle. The refusal runs only when the spec calls it, on what the stub holds then. Every later call is held as before, so the Retry still meets a stalled node.

## Assumptions

Facts:
- F1. Row text and sources: `ACCOUNT_STATE_SKIP_UNREACHABLE` and `_DEADLINE` (`src/wallet/services/account-state/normalize.ts:35-37`), set at `importChainSync.ts:105,115,123`.
- F2. The preflight's maximum budgets: three attempts of 5 s, waits 2 s and 4 s, 21 s in all (`importPreflight.ts:18-19`, `importChainSync.ts:32`).
- F3. A Retry probes with fresh service clients and no status cache (`full-backup-restore.ts:971-973`, `network/service.ts:889-903`). That isolates no HTTP pool, and its registration shares the PXE with the first pass's.
- F4. `dropUnanswered` destroys sockets; its one caller is the spec (`rpc-stub.ts:120-122`, spec `:195`).
- F5. The node client ends one request at once on a 4xx with a readable body (`fetch.ts`, `classifyRpcFailure` and `makeFetchWithTimeout`); `node-stub.ts:2-4` states it. A caller above it may start another request.
- F6. Chrome's interception excludes pages, so the forced fill runs in the background: from a page it left one held call on Chrome, six on Firefox.
- F7. The traces in recon.md, all at retry 0 through `agent.sh`.

Inferences:
- I1 (moderate confidence). The copies are each browser's transport re-sending a request whose connection closed before any reply: millisecond copies of the forced fetches, with no app-level wait between. The browser source was not read.
- I2 (low confidence). CI's run held six calls at the drop. A spent preflight fits it, but does not prove it.

Asks: none for the owner.

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | Fix the fixture, not the product | E | The product probes fresh and its row is true of a stalled node (KL-1) |
| D2 | Release by a terminal 400, not a reset | keep the reset; B; C; D | A reset is undone by the browser's re-send |
| D3 | Refuse only the held calls | W | Codex: W is a coordination protocol for an unseen case. Opus: W also catches a Retry that skips its probe, and #838 saw counts vary. Decided for A, on the demonstrated cause and both forced controls: starving the probe under A takes about eleven pending calls at the release (the count's assumptions under (W)); KL-2 |
| D4 | Share the stand-in's refusal (`refuseNodeCall`) | a second copy of the body | One terminal answer for the suite |
| D5 | One no-browser unit test, no new e2e scenario | none | The spec stays the e2e proof |

## Delivery

One PR against `dev`, opened ready after the gate, the Codex loop and an `origin/dev` merge. No label: `apps/extension/**` trips both e2e lanes.
- Title: `test(e2e): end the stalled stub's held calls with a refusal, not a reset` (72 characters).
- Body: the cause, the traces, the runs with the spec's wall-clock per browser before and after, `UI impact: none`, `Closes #911`.
- The close-out lands as the PR's final commits.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `a36fd2445`, once over the arc's diff. `code_review: off`.
- Codex loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/stalled-retry-flake-1/`. Hard stop at three rounds. One Opus diff review beside round 1. Log the rounds in `lessons/phase-1.md` and under Audit verdicts.
- Close-out: the standard's step 4, plus a flake-ledger row in the `e2e-testing` skill (next free number), a `lessons.md` line on resets (dedupe first), and KL-1 and KL-2 filed as closed `known-limit` issues (dedupe first).
  - KL-1: against a stalled HTTP/1.1 node, the wallet's own pending calls can fill the browser's six connections, so a Retry soon after reads "couldn't reach the network". True of that node, retryable, nothing lost; an HTTP/2 node, as production Testnet is per the archived `ci-e2e-hygiene-1`, has no such cap (not rechecked). Reopen on a user report of a Retry that cannot pass a node that answers.
  - KL-2: a call the browser still queued past six at the release is not held when the stub refuses, so it hangs on arrival; the probe starves only with about eleven pending (the count's assumptions under (W)). Reopen if this spec's Retry row reads "couldn't reach the network" again.
- Teardown after the merge: `agent-worktree done stalled-retry-flake-1 --merged`.

## Audit verdicts

Detail and each finding's disposition: [lessons/phase-0.md](lessons/phase-0.md) § Consults.
- Codex round 1 (gpt-6.1-sol, high): approve with changes. Five findings; all accepted but one extra probe assertion, rejected because the deadline row already implies an answered probe.
- Opus Plan leg: approve with changes. Six findings: four accepted, two moot once the window went. It dissented on D3 (for the window); decided for A.
- Codex round 2: approve with changes; the eleven-pending count qualified with its assumptions.
- Codex round 3: approve.

## Seeds

`/goal`: `/goal Phase 1 of implementations-plan/stalled-retry-flake-1/plan.md is ✓, backed by its gate in the transcript (lint, typecheck:all, T1, the two smoke files on both browsers, 10 Firefox and 5 Chrome runs of the stalled spec at retry 0 started at load1 < 150, the forced run red on base and green on the fix); code_review is off and /code-review was not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR closing #911 exists, opened after the loop.`

`/loop`: `/loop 15m Drive implementations-plan/stalled-retry-flake-1 forward; never idle. If the plan directory is gone, git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/stalled-retry-flake-1/plan.md: success means merged, so run agent-worktree done stalled-retry-flake-1 --merged and stop; failure means delivered, so watch the PR's checks. Otherwise run Phase 1's gate, then Post-implementation. Never merge. The same step failing 5 times: reassess with Codex.`
