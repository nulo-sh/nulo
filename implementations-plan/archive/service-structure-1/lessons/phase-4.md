# service-structure-1: arc 4, phases 4 and 5 (#560, #549)

## Implementation

- Base 244badd3 (`origin/dev` after #751). Every cited site re-read first; the shifts are D16.
- The call-shape rewrites (about 30 `finalizeGasLimits` test calls, four `handleWalletMessage` test files) ran through a balanced-parenthesis script that maps each positional argument to its option name and drops literal `undefined`s. It also rewrote one positional call inside a doc comment (`fpc-strategy.ts`), which was then reworded by hand.
- A hand splice in `fee-settings-rpc-guard.test.ts` cut the next `test.each` block along with the old text (34 tests became 27). Caught by the count, restored from `HEAD`, and the new case re-added with an exact edit. A test count that drops after an edit that only adds is the signal.
- That suite's harness spies the method once per `harness()`, so `ran` accumulates across calls in one harness: a test that needs two independent outcomes takes two harnesses.
- Mutation checks, all red as intended: a fee flag flipped, a scope flipped and a kind dropped in the table each fail to compile; `isAccountScoped` replaced by `!isNetworkScoped` reds the prototype-name cases in `materialize`, `validateSession` and `resolveOperations`; `Object.hasOwn` replaced by `in` reds `operation-traits.test.ts`; an inherited-lookup fee reader reds the RPC guard case. Each file restored and diffed after.
- The prototype-name cases pass on the base too (each old switch had a default). They guard the new structure, the account branch never being the default, which the mutations show they catch.

## Codex round 1 (gpt-6.1-sol, high, session 01a14d24)

- Verdict: findings, three low, all comments. It ran 770 in-memory base/head comparisons of the scope and fee readers (18 kinds, four unknown kinds, five fee paths, refusal prefixes): lookup order, check order, key order and `feeSettings` presence matched. All 31 `finalizeGasLimits` calls keep their arguments; the four refactored bodies are AST-identical once the entry destructuring is removed.
- Accepted: the `FinalizeGasOptions` doc line, the moved FIFO comment, the card predicate's comment.

## Opus review (alongside round 1)

- Verdict: no behaviour change; one low design risk and five nits. The risk: `isSendTx` gates the whole send card, so reading the table there would give a future fee kind a send card with no payload rows. Accepted as D20 (literal kinds kept). Nits accepted: the controls comment and the module header overclaimed, a test title named a `switch` that no longer exists, `handleFeeUpdate`'s five-line comment. Kept: an out-of-range `handleFeeUpdate` index now returns where `op.kind` threw; unreachable.
- It type-checked edited copies in memory without touching the tree, as briefed: the arc 3 lesson (a reviewer's mutation overlapping a gate run) did not recur.

## Cross-arc pass (fresh session 01a14d26, arcs 1 to 4)

- Verdict: no functional seam. `handleWalletMessage` takes arc 2's `sessionProfiles` map and reads `switchEpoch` at call time; the outbox and session teardown are intact. Two low comment findings, accepted: the handler's doc repeated the call site's history, and the init-order pins header still said "pre-extraction" after arc 2's move.

## Round 2 (both sessions resumed)

- Clean. The arc session confirmed `isSendTx` byte-identical to base and the other changed files emitting unchanged JavaScript; the cross-arc session confirmed both fixes. The loop converged at round 2.
