---
plan: unlock-conversions-1
tier: light
status: completed; #1726 carries the change and this close-out
issues: none (decision page 117, P117-04)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 0bfd2c088
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-06. Planned and delivered the same day; one arc. No issue closes.
- **Status:** completed. #1726 into `dev` carries the change and this close-out; its merge archives the plan.
- **Shipped:** `UNLOCK_CONVERSIONS` and `runUnlockConversions` (`wallet/services/unlock-conversions.ts`) with a table per entry; `NetworkService.convertRows` on them; the AST guard over every unlock handler; one sentence each in `ARCHITECTURE.md` § 5 and `CLAUDE.md`.
- **Deviations:** D5's throw line at `warn` (the orchestrator's brief update, 2026-11-06 21:42 UTC); D6 follows every same-file method a handler calls (Opus, diff review); the arc branch cut at 4ae04b194 and `dev` merged at close-out (#1722 only; the replays ran at 962b967eb, before it).
- **Review loop:** plan: Codex and Opus conditional approve, Codex resumed conditional approve, the final fresh Codex `approve`; diff: Codex and Opus 0 material, Codex resumed `approve`.
- **Gates:** lint, `typecheck:all`, `test`, `test:all` exit 0; `baseline:storage` unchanged; the update replay from v1.1.0 and v1.2.0 on Chrome and Firefox, 4/4 each at retry 0 ([lessons/phase-3.md](lessons/phase-3.md)).
- **Dropped:** the relay append, which is rpc-fallback-1 arc 5's, its once-memory that arc's call (I2).
- **Known limits:** none. **Open items:** none.
- **Lessons:** none promoted; `lessons.md` is at its budget. Over the 150-line target by the Outcome and the review record; nothing restated.
- **Seeds retired:** the `/goal` and `/loop` below; they are no live instructions.

# unlock-conversions-1: one ordered list of the row conversions a sealed root takes at unlock

One arc, one PR against `dev`, sequenced before rpc-fallback-1's arc 5. The two conversions the network service applies at unlock (a retired default endpoint, a retired seed name) become entries of one ordered list; one runner applies the list at the same hook, one log line records each entry's run, and a guard test refuses a step at the hook that nobody reviewed. No stored-shape change, no screen change; every row that converts is written as today. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/src/` unless stated.

**Sign-off** (decision page 117, P117-04, the owner on 2026-11-06 at 18:18 UTC, approved as written): "(1) Rows the migration engine cannot open (the sealed per-profile roots: networks, accounts, tokens, fee payers, contacts, the journal, the history) convert at unlock, once the profile's keys exist; that is the heuristic the wallet already applies three times, as three separate code paths at the same hook (the retired-endpoint rewrite, the seeded-name fix that landed in #1697, the relay append coming with rpc-fallback arc 5). (2) The proposal is one ordered list of those unlock conversions, each a small idempotent pure function over one root with a predicate and a table test, run in order at that hook, with a test that refuses a conversion written outside the list; the three existing ones move into it, with no stored-shape change and no behaviour change."

## Outcome & Quality Bar

- **For whom:** the maintainer who adds the next unlock conversion (the relay append first); and every person whose profile unlocks on this build, who must see nothing change.
- **Excellent:** (1) a new conversion is one entry and one table, and a new step at the hook outside the list reds a unit test that says where it belongs; (2) for every stored profile, the rows written, their order, the node evictions and the `onNetworkUpdated` events are today's (unit tests, the update replay from v1.1.0 and v1.2.0 on both browsers).
- **Good enough:** the guard reads the handlers and the methods they call, one hop deep; code added inside a deeper step passes, and its header says so.

## Assumptions

**Facts** (verified at 0bfd2c088):
1. The hook: `NetworkService.init` subscribes through `sealOnRowKeysReady`; the handler seals plaintext rows, then runs `retireDefaults` inside `runSealing`, whose failure logs `warn` with `{ error }` (`network/service.ts:266-283`, `seal-on-unlock.ts:11-31`).
2. `retireDefaults` (`network/service.ts:292-313`), under the network lock: reads the reset journal's network id, reads the profile's rows once (the held row included), and per row not held runs `moved = retireEndpoints(row)`, `next = retireDefaultName(moved ?? row, rows) ?? moved`, then writes before it converts the next row: one `storage.set`, the transient-node evictions for changed URLs, the chain's node eviction when the primary URL changed, one `onNetworkUpdated(next)`. A throw ends the pass.
3. Both conversions return the converted copy or `undefined` (`network/retired-endpoints.ts:17-33`, async; `network/seeds.ts:107-112`, sync); each is idempotent by its own tests (`retired-endpoints.test.ts:35`, `seeds.test.ts:90`).
4. `onRowKeysReady` fires once per profile when its keys arrive in a worker (`profile/service.ts:247-252`), and again for every held profile at the boot replay (`wallet/runtime.ts:704-708`); a later unlock in the same worker announces nothing. A failed conversion runs again at that replay if one follows, else in the next worker.
5. `networks` is sealed (`wallet/storage/stores.ts:193`); `SealedStoreName` and `StoredRow<N>` type the sealed roots (`:231-237`). A value change there needs no migration, stamp or golden (CLAUDE.md § Persisted-storage; #1697's precedent).
6. The migration engine records no log line per run; it keeps durable `nulo:schema:*` keys (`packages/wallet-core/src/migration/migrator.ts:55-71`).
7. Fifteen non-test sites subscribe to the hook, the shell `seal-on-unlock.ts:30` included (recon.md). `TransactionService.adoptOwnerless` reads the profile's accounts and gives an ownerless transaction its owner there; the account service deletes orphan keys there. Neither is a pure function over one root.
8. `private-fetch.scan.test.ts` and `stored-shapes.scan.test.ts` scan source with `ts.createSourceFile`; no test pins the warn texts; no complexity acceptance or chaos citation names `network/service.ts` or `seal-on-unlock.ts`.

**Inferences:**
- I1. Per row, today's fold and the list's fold give the same copy: each entry reads only its row and the snapshot `rows`.
- I2. Unresolved, owned by OA-5: the relay append fits the entry contract only if its once-memory lives in the row; in `SeedOffers` (a second, plaintext root) it does not, and arc 5 reconciles the two before it builds (D7).

**Asks:** none for the owner (no screen). Panel questions are D1-D9.

## Claims that did not hold

- "applies three times": two conversions exist; the relay append is not written (rpc-fallback-1 arc 5, OA-5 open). A third row change at the hook, `adoptOwnerless`, is no single-root conversion (Fact 7).
- "retried at the next unlock": the boot replay or the next worker retries it (Fact 4).
- "borrows the engine's recording (one line per conversion run)": the engine logs nothing per run (Fact 6); the line is new, with no stored state.
- "no behaviour change" holds for every row that converts; a conversion that throws now skips the rest of that row's list instead of ending the pass (D4, the brief's ask).

## Decisions

| id | Decision | Rejected alternative and why |
|---|---|---|
| D1 | An entry is `{ name, root, convert(row, rows) }`; `convert` returns the converted copy, or `undefined` when its predicate does not hold | A separate predicate: the endpoint rewrite would hash every URL twice, and the halves could disagree (both legs) |
| D2 | List and runner in `wallet/services/unlock-conversions.ts` beside `seal-on-unlock.ts`; the transforms stay beside their data and tests | Moving them in: their data is the network's |
| D3 | The runner owns the loop: per row not skipped, fold the root's entries in list order, then await `commit(before, after)` before the next row; the service keeps the lock, the journal skip, the snapshot, the write, the evictions and the events | Collecting every changed row before writing (the draft): a worker stopped mid-pass loses rows today's order had written (Codex, demonstrated) |
| D4 | An entry that throws ends that row's remaining entries; other rows go on. A written row is the read row plus a prefix of the list. A throw from `commit`, the lock or the journal read ends the pass under `runSealing`'s `warn`, as today | Skipping only the throwing entry (the draft): a row could be written as B-without-A, an order the list never makes (Opus) |
| D5 | One line per entry per pass, written in a `finally` so a rejected `commit` still records it: `{ conversion, root, converted, failed }`, `converted` counting copies produced; no error object (a row holds keyed endpoint URLs and an error message can quote its input). `debug` ("unlock conversion ran") while `failed` is 0; `warn` ("an unlock conversion threw; the next worker retries") otherwise, today's reach for a failed pass. Failures of the lock, the journal read or a `commit` keep `runSealing`'s `warn` | All at `debug`: the planned form under the brief's first wording; the orchestrator's update of 2026-11-06 21:42 UTC moves the throw line to `warn` (Opus's view; a deterministic failure must show in a bug report) |
| D6 | The guard parses each subscriber with the TypeScript AST: the handler and the bodies of the same-file methods it calls (one hop); it pins the set of callees (member calls and free functions, `log*` dropped) per file. Plus: each listed root is passed to a runner call, and only the registry imports `retireEndpoints`/`retireDefaultName` | A transitive same-file closure of method names (the draft): misses free functions and inline writes, and reds on helper extraction in shared transaction code (both legs). Following only a sole delegation (the plan's first form): left the network handler's own `convertRows` unread (Opus, diff review) |
| D7 | The relay append is no entry here; arc 5 reconciles its once-memory with the contract before it builds | Building its seam now: OA-5 is open |
| D8 | `rows` is the profile's rows as read before the pass, the held row included (network-rename-1 D8) | Rows as converted so far: changes today's result for no supported state |
| D9 | `UnlockConversion<R extends SealedStoreName>` over `StoredRow<R>`: naming an unsealed root is a type error | A hand-written root map (the draft): restates `stores.ts`. A network-only type (Codex): equally small, but leaves the sealed-root rule to a runtime test |

## Architecture & Implementation

- **Contract** (TSDoc on the type): pure over `row` and `rows`, never a build version or stored marker; `convert` of its own output returns `undefined`; keeps `id` and `profileId`; order holds within one root only, since each service's handler runs on its own.
- **List:** `UNLOCK_CONVERSIONS = [retiredEndpointsConversion(RETIRED_DEFAULT_ENDPOINTS), retiredNamesConversion]`, today's order and data; the factory exists so a test can pass a synthetic retired list, as `retireDefaults`' parameter does today.
- **Runner:** `runUnlockConversions(root, rows, { skip, commit, log, conversions = UNLOCK_CONVERSIONS })`. A row changed when its final copy is not the read object.
- **Wiring** (`network/service.ts`): `retireDefaults` becomes `convertRows(profileId, conversions = UNLOCK_CONVERSIONS)`: lock, journal, snapshot, runner, with today's write, evictions and event as `commit`. The `runSealing` message becomes "converting the profile's networks failed; the next worker retries"; `log` is the service's `logDebug`.
- **Files:** new `wallet/services/unlock-conversions.ts`, `.test.ts`, `.scan.test.ts`; modified `network/service.ts`, `network/service.test.ts` (the reach-in only); `ARCHITECTURE.md` § 5 (one sentence in the row-keys paragraph); `CLAUDE.md` § Persisted-storage (one clause: a value change of a sealed root at unlock is an entry of the list).

## UI impact

None. No screen, copy or row changes; the stored rows and events are today's.

## Security & Adversarial Considerations

- **Threat model:** entries read schema-decoded rows that may be hostile: a planted plaintext row is read and sealed as today (#1053), and a custom row's endpoints are whatever a person or a node probe stored. Entries make no network call; a row that makes one throw is counted, and no row content, URL or error text reaches a log.
- **Sealed-root rule:** D9's type; the runner runs only behind `onRowKeysReady`, after sealing, so once the profile's keys exist. Kept as today: profile filtering, the network lock, seal-before-convert, the journal skip.
- **Crypto, privileges, supply chain:** unchanged; no dependency (`typescript` is already a devDependency); SHA-256 stays WebCrypto's.

## Phase 1: the list, the runner and the wiring ✓

1. Write `unlock-conversions.ts` and `unlock-conversions.test.ts`. One small table per entry, keyed by entry name; a test that the tables' names equal the list's, in order. Each converting case checks the output, the input unmutated, `id` and `profileId` kept, and `convert(output, rows) === undefined`; each other case `undefined`. Edge cases stay in `seeds.test.ts` and `retired-endpoints.test.ts`, unchanged.
2. Runner cases, synthetic entries: list order (the second sees the first's output); `skip`; on one row A converts, B throws and C never runs, the row commits A's copy and the next row converts, `failed` counts it and B's line is `warn`; per-row order of calls (`convert A, commit A, convert B, commit B`); a throwing `commit` rejects and its lines are still logged; a second run commits nothing. One service case: a throwing entry reaches `logWarn` by name and root, a run reaches `logDebug`, and neither carries the error text.
3. Rewire `network/service.ts` (D3) inside the complexity budgets; add no suppression. In `service.test.ts` change the reach-in: `convertRows` with `UNLOCK_CONVERSIONS`, its endpoint entry swapped for one on the synthetic retired list.
4. Remove the names entry from `UNLOCK_CONVERSIONS`; confirm the service test reds; restore. Log it in `lessons/phase-1.md`.

**Validation gate:** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/unlock-conversions src/wallet/services/network src/wallet/services/seal-on-unlock`. Pass: each exits 0; step 4 reds; `git diff --stat` shows `seeds.test.ts` and `retired-endpoints.test.ts` unchanged.

## Phase 2: the guard ✓

1. Write `unlock-conversions.scan.test.ts` (D6), on `sourceFiles` and `ts.createSourceFile`, member callees receiver-qualified, only logging calls dropped. Its header names the limits: code deeper than one hop, changed arguments, a repeated or reordered permitted callee, and aliasing pass; a root literal at a runner call proves syntax, not reachability. Self-tests on fixtures: a new subscriber reds; a new `this.renameTokens(profileId)` in a handler reds; an inline `this.storage.set(...)` in a followed body reds; a root no runner call names reds; a comment naming a callee passes.
2. Add `await this.storage.set(id, row)` to one followed handler body locally; confirm the guard reds naming the file and the callee; revert.

**Validation gate:** Phase 1's commands plus `cd apps/extension && bun --bun vitest run src/wallet/services/unlock-conversions.scan`. Pass: exit 0; step 2 reds; `git status` clean of the edit.

## Phase 3: docs, baselines and the update replay ✓

Warning: never rerun a red replay. Read it; run the same case on a base candidate (0bfd2c088) before you diagnose. The v1.1.0 recording's dApp session passes the replay's check until about 2026-11-10 17:56 UTC (#1641); past it, the v1.1.0 runs become "not run, with reason".

1. Edit `ARCHITECTURE.md` and `CLAUDE.md` (Files above). Run `bun run baseline:storage`.
2. Commit. Build each candidate: `bash apps/extension/scripts/e2e/build-update-candidate.sh <chrome|firefox>`. From `apps/extension`, run `NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_UPDATE_FROM=<v1.1.0|v1.2.0> NULO_E2E_UPDATE_TO=$PWD/.e2e-state/update-candidate/<browser> bun run test:e2e -- tests/e2e/update-replay.test.ts --retry=0` for both tags on Chrome and on Firefox (`NULO_E2E_BROWSER=firefox`). Record each wall-clock.
3. Run `bun run test`, `bun run test:all`, then `bun run check:plans` after staging the plan files.

**Validation gate:** `baseline:storage` prints "stored shapes unchanged" and writes no file; the four replays green at retry 0 (past the v1.1.0 expiry, the two v1.2.0 runs, with the reason recorded); `test`, `test:all`, `check:plans` exit 0. Not run, with reason: smoke and network e2e (no screen, dApp, node or PXE path changes; the PR's required lanes run both on both browsers); `lint:actions`, `test:ci-gating`, `test:release` (no `scripts/` or `.github/` change).

## Delivery

| Arc | Phases | Branch | Base | PR title (≤ 92) | code_review |
|---|---|---|---|---|---|
| 1 | 1-3, then the close-out | `unlock-conversions-1-a1` | `origin/dev` + the plan commit | `refactor(network): one ordered list of the row conversions a sealed root takes at unlock` | off |

The body: the change and why, the sign-off quoted, the claims that did not hold, the validation runs with outcomes and each replay's wall-clock, and the note for arc 5 (I2). No issue closes. Open it ready, without labels. Parallelism: none.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at 0bfd2c088, with these values:
- **Review loop:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, over the diff from the plan commit once Phase 3 is green; one Opus `general-purpose` review beside the first round; hard stop at three rounds, then report.
- **Delivery:** `gh pr create --base dev`; `gh pr checks <n> --watch` to the end.
- **Close-out:** the PR's final commits. Merge `origin/dev` in first; read `index.md` and `lessons.md`. Outcome: `Known limits: none`, `Open items: none` unless a review adds one.
- **Teardown:** after the merge, `agent-worktree done unlock-conversions-1 --merged`.
- **Approval boundaries:** a finding that adds stored state, a lifecycle, a protocol, a recovery policy beyond D4 or a public contract stops for approval; any screen change is a new owner ask.

## Audit verdicts

**Round 1** (2026-11-06; consult log in [lessons/phase-0.md](lessons/phase-0.md)).
- **Codex (gpt-6.1-sol, high): conditional approve.** Batching changed persistence order (D3); the name-closure guard was both weak (inline rewrites) and brittle, and its mutation step called an undefined method; Fact 4 missed the boot replay; the threat model called stored rows trusted; "no behaviour change" overstated D4; I2 must not pre-decide OA-5. Held: D1, D2, D8, the exceptions in D6, D5's omission of the error.
- **Opus 5.5 (Plan): conditional approve.** The guard (AST, one hop, free functions, an every-root-runs pin); D4 as a per-row prefix; the harness asserting `id`/`profileId`; types from `SealedStoreName`/`StoredRow`; the service test deriving its list from `UNLOCK_CONVERSIONS` so the mutation can red; failures moving from `warn` to `debug` silently; the shell site in Fact 7; the v1.1.0 expiry.
- **Accepted:** all of the above but the `warn` level (Round 2); D3, D4, D5, D6, D9 rewritten; Facts 2, 4, 5, 7, 8 and the threat model corrected.
- **Rejected:** a service-level deferred-promise test (Codex): the runner's call-order case proves the same order one layer down. Dropping two of the four replays (Opus): the brief requires all four.
- **Disagreement settled:** D9 takes Opus's typing over Codex's network-only type (the sealed-root rule becomes a compile error at no extra size).

**Round 2** (Codex, resumed): **conditional approve.** D3, D4, D6 and D9 verified; the batching finding closed. New: a rejected `commit` dropped the pass's lines (record in `finally`); the gate contradicted the v1.1.0 expiry; Fact 7's wording; D6's further limits; a three-entry prefix case. All accepted. **D5 settled for Codex:** the brief's explicit `debug` stands over Opus's `warn`-on-failure; the trade is raised in the report, not decided here.

**Final fresh Codex pass** (new session, 2026-11-06): **approve**, no new material finding. Facts 1-8 verified against the source; D4's failure-path change stands as accepted; D6's limits stand as stated; both mutation steps can red.

**Arc 1 review loop** (2026-11-06; the diff d250ab26f..a2b9c4838, then a2b9c4838..67c376c4f; log in [lessons/phase-3.md](lessons/phase-3.md)).
- **Round 1, Codex (gpt-6.1-sol, high): 0 material, approve.** Nits, all accepted: the "second run" case swapped lists; the header's "a new subscriber reds" held only for a new file; the runner TSDoc said "skipped" where the row's list ends; five comments restated their lines. **Opus 5.5 (general-purpose): 0 material**, seven nits, all accepted: the same TSDoc and second-run points plus a list-level double-run test; the transform pin by import, not call; the network handler's `convertRows` left unread (D6 now follows every method a handler calls); a self-contradicting comment; a truncated test label; each file parsed twice.
- **Round 2, Codex (resumed): 0 material, approve.** The loop converged.

## Seeds (not run; orchestrator-owned)

```
/goal implementations-plan/unlock-conversions-1/plan.md: Phases 1-3 ✓ with their gates pasted, the Codex loop converged and quoted, the PR open against dev; `bun run test` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/unlock-conversions-1 forward per its plan.md: next unchecked phase, its gate, then the Post-implementation section; never merge.
```
