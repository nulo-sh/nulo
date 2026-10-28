---
plan: log-levels-2
tier: light (the orchestrator's call; Opus Plan leg added)
status: planned; Codex approve (round 2); phase 1 next
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 Explore agent (sonnet); one Codex audit round-trip (gpt-6.1-sol, high) plus one Opus Plan critique
base: origin/dev at 210d02f1f
trunk: dev
issues: [1296]
---

# log-levels-2: the last two popup reads that log a lock's refusal above debug

## Outcome & Quality Bar

For whom: a person who exports their log for a bug report, and the maintainer who reads it. `warn` and `error` reach every user's log and export (CLAUDE.md § Logging policy).

- A stale-network refresh or a network-arrival read that a lock ended adds no `warn` or `error` line, and leaves no unhandled rejection. A live failure of either logs at `error` (a client disconnect at `debug`, the shared rule); for the arrival read that moves its live line from `warn`. A test pins each pair.
- No screen, copy, stored row or wire shape changes.

Good enough: the two sites and the helper they share. No other log line, no redactor or log-viewer work.

## Paths (recon.md has the checks)

| Site | Path | Label |
|---|---|---|
| `stale.refresh` | Logged in, the active network stale. A completed reset's `reloadNetwork` writes `appStore.networks` while the store still holds the stale view → the watcher (`app.vue:222`) starts `void stale.refresh()` → `syncActive` → `getStaleNetwork` → a lock lands in the worker during the round trip → `Profile locked` → nothing handles it → the forwarder logs `unhandled rejection` at error. | plausible but unverified at run time (traced); the composable half is reproduced by phase 1's test on the base copy |
| arrival `refresh` | Logged in; a read is in flight → a lock flips `isLogined` → the watcher (`app.vue:246`) re-fires `refresh`, which bumps `generation` and clears → the first read is refused → its catch logs `network arrival read failed` at warn although `mine !== generation`. | same |

Both claims of #1296 hold at `210d02f1f`. One claim of the lane brief does not: log-levels-1 introduced no typed lock refusal (the worker throws a plain `Error("Profile locked")`); its siblings key the demotion on the supersede, so these two sites do too.

## Architecture & Implementation

- `useStaleNetwork.ts`: `whileLive(live, run, line)` takes its debug line, and its doc comment stops naming the resume alone; `resume` passes today's text byte-equal (`stale-network resume ended with its session`). `refresh` captures `const s = session` before anything awaits and returns `whileLive(() => live(s), refreshIn(), "stale-network refresh ended with its session")`, where `refreshIn` is today's body. A lock or profile change (`clear()`) or `dispose` makes the run's failure resolve at debug; a live failure rejects.
- `app.vue`: the networks watcher becomes `() => void stale.refresh().catch((error) => logCallFailure("stale-network refresh failed", error))`, beside the resume's and the switch run's handlers.
- `useNetworkArrival.ts` `refresh` catch: `if (mine !== generation) { console.debug("network arrival read superseded", { error }); return }`, then `arrived.value = null` and `logCallFailure("network arrival read failed", error)`. The composable imports `logCallFailure` from `@/wallet/logger/console-forwarding`.
- Not touched: `stay`'s warn (`useNetworkArrival.ts:64`, a toast reports it), the store's `syncStaleNetwork`, the worker.
- Alternatives not taken: see the decision ledger.

## Decision ledger

- D1 (`stale.refresh`): reuse the resume's shape in the same file: session-keyed `whileLive`, the shell reports a live failure with `logCallFailure`. Rejected: a catch inside `refresh` that logs (two report sites for one composable's runs); matching `Profile locked` text (#1304: every demotion keys on a type or the supersede).
- D2 (`whileLive`'s line): a parameter, so each run keeps a line that names it and the resume's stays byte-equal. Rejected: one generic line (rewrites an existing line, and the log cannot tell the runs apart).
- D3 (arrival): the composable already owns this read's failure (it clears `arrived`), so it reports it: superseded → debug, live → `logCallFailure`. Rejected: rethrowing to the shell (changes `refresh`'s never-rejects contract to move one log call); keeping `console.warn` for the live branch (a worker restart's disconnect would stay at warn, against the shared rule; `warn` and `error` have the same reach).
- D4: the refusal that reaches the popup before the lock event stays live and logs at error, as in the switch run and the resume. That is the closed known limit #1304; phase 2 comments there to name these two lines.
- D5: no e2e scenario. The race needs a lock inside one round trip, which no e2e step can place; the unit tests drive the composables through it, and `app-wiring.test.ts` pins the shell's handler.

## Security & Adversarial Considerations

- Threat: a demotion that hides a real failure, or an attacker-shaped error that rides the debug branch. Both demotions key on wallet-owned state (the session object, the read counter) that no dApp or node reaches; the error's text decides nothing. A live failure keeps `error`, paired with a control test.
- The demotion is for the failure of a read whose session ended (stale) or that a newer read superseded (arrival), whatever its cause, not for a lock refusal alone: nothing reads such a read's result, so its failure has no consequence. This is the switch run's and the resume's rule; no classifier or wire contract is added. A stale refresh that only a network switch overtook stays live, so its failure still logs at error.
- `logCallFailure`'s disconnect test is an exact match on a wallet constant (`errors.ts:111-113`); `getNetworkArrival` reads wallet storage and relays no dApp or node text, so no outside party shapes the arrival's failure.
- No new data reaches a log line: every touched call passes the error as `{ error }`. `REDACTED_KEYS` unchanged.
- No permission, dependency, crypto, storage or wire change. Supply chain: no new package.

## Assumptions

Facts:
- `refresh` is called only by the watcher at `app.vue:222-225`, started with `void`; `syncActive` is `appStore.syncStaleNetwork` (`app.vue:203`), which awaits `getStaleNetwork` with no catch (`stores/app.store.ts:140-145`).
- `clear()` replaces `session` (`useStaleNetwork.ts:254`); the shell calls it on every `isLogined && profile.id` change (`app.vue:252-258`); `live(s)` is `s === session && !disposed` (`:170`).
- The arrival catch logs at warn on every failure, current or not (`useNetworkArrival.ts:49-51`); `generation` moves on every `refresh`, a successful `stay` and `dispose` (`:38`, `:61`, `:72`).
- A lock control flips `isLogined` before it asks the worker to lock (`useLockWallet.ts:58-59`); a lock event's seal flips it before anything awaits (`locked-state.ts:83` → `app.vue:324`).
- `logCallFailure` logs a disconnect at debug and anything else at error, `{ error }` (`console-forwarding.ts:34-37`).
- The only unhandled-rejection path is the forwarder's `onunhandledrejection`, at error unless a disconnect (`console-forwarding.ts:16-21`).

Inferences:
- Ordering, traced (high): a port's response settles its request and an event reaches its handler in the message's own task (`base-client.ts:206-214`, `:242-253`); the lock branch reaches `onLockEvent` with no await (`app.vue:350-374`), whose seal sets `isLogined` (`app.vue:324`); the watchers at `app.vue:246` and `:252` are pre-flush, so they run in that task's microtasks. A refusal in a later task sees `clear()` and the moved `generation`. Only the order across two ports is open: #1304.
- Under #1304's order, or a live non-disconnect failure such as a request timeout, the arrival line moves from warn to error. Same reach in the log, but the profile chaos checker counts a `warn` and fails a run on an `error` (O4, `tests/e2e/helpers/profile-chaos/checkers.ts:728-739`). Accepted (D3): a live arrival failure is a real one, as the switch run's and the resume's are, and a red chaos run on `Profile locked` is #1304's reopen condition.

Asks: none. No question here concerns what a person sees.

## UI impact

None. No screen, copy, toast or route changes.

## Phases

### Phase 1: both sites and their tests

1.1 `useStaleNetwork.ts`: add the `line` parameter to `whileLive`; wrap `refresh` as above.
1.2 `app.vue`: the `.catch(logCallFailure)` on the networks watcher.
1.3 `useNetworkArrival.ts`: the split catch and the import.
1.4 Tests:
- `useStaleNetwork.test.ts`, describe "a refresh whose session a lock ends" (the harness overrides `scope`, `staleActive` and a deferred `syncActive`, or `refresh` reads nothing): a read refused after `clear()` resolves, with `console.debug` exactly once (`"stale-network refresh ended with its session", { error }`); control: a refusal with the session live rejects with the refusal. The resume's cases stay unchanged.
- `useNetworkArrival.test.ts`: a read a newer `refresh` superseded is refused after the newer read installed an arrival → `console.debug` exactly once (`"network arrival read superseded", { error }`), no `warn`, no `error`, and the newer arrival stays. Control: the existing "a failed read shows no arrival" case also asserts `console.error` exactly once (`"network arrival read failed", { error }`) and no `warn`.
- `app-wiring.test.ts`: `stale.refresh(` appears once in `app.vue`, followed by `.catch((error) => logCallFailure(`.

Validation gate:
- Commands: `bun run lint && bun run typecheck:all && bun run test && bun run test:all`. Then build the armed smoke build from the tree under test, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, and run `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/stale-network.test.ts tests/e2e/network-arrival.test.ts --retry=0`.
- Pass criteria: every command exits 0. Each regression case (both debug cases, the arrival control's `error` pin, the wiring pin) fails on the base copy of its source file (`git show 210d02f1f:<path>`) and passes after. The stale control passes on both, since base already rejects. The resume's existing cases pass unchanged.
- Layers: lint, typecheck, unit, smoke e2e (Chrome). Firefox not run: no fixture, focus, window, activation or WebAuthn change.

### Phase 2: close-out

2.1 Comment on #1304: the same order now also applies to `stale-network refresh failed` and `network arrival read failed` (a red chaos run included); its reopen condition covers them.
2.2 Close-out per the Post-implementation section.

Validation gate: `bun run check:plans` exits 0 after staging; `git show --stat` of the archive move shows only renames.

## Delivery

Single arc, one PR on `dev` from `worktree-log-levels-2`; no stack. Title: `fix(popup): a stale-network or arrival read that a lock ends logs at debug` (74). Body: what changed and why, the validation runs with outcomes, `Closes #1296`, no e2e scenario added (so no wall-clock line). Opened without labels; the path filter already runs smoke and network e2e for `apps/extension/src/**`. Nothing merges before the orchestrator's word.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `210d02f1f`, steps 2 to 5 (`code_review: off`, so step 1 is absent). Plan-specific values:
- Review loop, once over `210d02f1f..HEAD` after phase 1 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; hard stop at three rounds. One Opus diff review (`general-purpose`) runs beside round 1.
- Deviation: the close-out commits (phase 2) land before `gh pr create`, so CI runs once on the final head. The Outcome names the PR by its title.
- Teardown after the merge: `agent-worktree done log-levels-2 --merged` once `implementations-plan/archive/log-levels-2/plan.md` is on `dev`. This headless session ends at the PR; the orchestrator's next session for the lane runs it.

## Audit verdicts

Round 1, run in parallel on the draft. Every finding was checked against the tree; all were accepted ([lessons/phase-0.md](lessons/phase-0.md) has each).
- **Codex** (gpt-6.1-sol, high): reject, on one gate defect: the stale control already passes on base, so "each new case fails on base" could never be met. Also: the lock-control citation (`useLockWallet.ts:58-59`); the demotion covers any failure of a superseded read, not a lock refusal alone; the arrival supersede case asserts the newer arrival survives. Design (D1 to D3, the session as the stale signal, warn→error) approved.
- **Opus** (Plan): conditional approve. The smoke gate needs the armed build from the tree under test; the chaos checker fails a run on an `error` but only counts a `warn`, so D3 makes a live arrival failure red a chaos run (kept, see Inferences); the ordering inference is provable from the code (now cited); four citation and wording nits; the stale harness overrides.
- Round 2, Codex resumed on the revised plan: `VERDICT: approve`. On the chaos consequence: a timeout merits that signal, an observed `Profile locked` merits reopening #1304, and keeping `warn` only to avoid a red run would weaken the policy.

## Seeds (not run; orchestrator-owned)

`/goal` Phase 1 of implementations-plan/log-levels-2/plan.md has its gate passing in the transcript, a Codex loop that converged (quoted), the close-out archived the plan, and the PR closing #1296 is open on `dev`; `bun run test` and `bun run lint` exit 0.
`/loop 15m` Drive implementations-plan/log-levels-2 per its plan.md: reality check, next phase, gate, review loop, close-out, delivery; never merge.
