# soak-flakes-1: phase 0 (recon and planning consults)

## Recon runs

- Instrumented copies of both test files sat beside the originals for the runs, uncommitted, and were deleted after; `git status` was clean. A main-process reporter (outside the repo) sampled the event-loop delay and the live forks each second. Numbers: recon.md.
- Two full Node-launcher runs of `apps/extension` (226 s and 229 s, both exit 0, 15150 tests with the two copies). Load5 85 to 120 from other host users.
- Starvation runs of the original `background.transport.test.ts` with its vitest process pinned to one CPU: beside 20 busy loops all green, the flag-on tests 2.9 to 3.6 s; beside 40, two of the three timed out at 5000 ms. The loops ran in their own process group and were killed by pgid; none was left.
- A worker-RPC proxy counted 5 or 6 `fetch` and 2 `onTaskUpdate` calls per re-import, so the cost is mostly evaluation in the fork. Whether CPU or the queueing of those few RPCs dominated at 160+ forks was not measured (the Opus leg's correction; the contention runs pinned the main process and the fork to one CPU together).
- Fetch-delay proof at 1000 ms per fetch: base 2, 3 and 2 of the 3 flag-on tests timed out in three runs (5, 6 and 5 fetches each, every run); with the D1 trial edit 25 of 25 passed and 0 fetches ran inside any flag-on test.
- Builds: at base the unflagged subframe check compiles to `if(Gb(i))`, and the flagged build drops the branch. The D1 trial edit (then reverted) built byte-identical JS to base for Chrome and Firefox, flag unset and set: four builds, 485 files each.

## Fetch-delay proxy

Appended, uncommitted, to a copy of `background.transport.test.ts`; `DIAG_OUT` names a JSONL file outside the repo.

```ts
// DIAG (temporary, uncommitted): every module fetch inside a flag-on test body waits DIAG_FETCH_DELAY_MS.
type WorkerState = { rpc: Record<string, unknown> }
const worker = (globalThis as unknown as { __vitest_worker__: WorkerState }).__vitest_worker__
const counts = { fetch: 0, evaluatedBefore: 0 }
const evaluated = () => {
	let n = 0
	for (const node of (globalThis as unknown as { __vitest_worker__: { evaluatedModules: { idToModuleMap: Map<string, { evaluated?: boolean }> } } }).__vitest_worker__.evaluatedModules.idToModuleMap.values()) if (node.evaluated) n += 1
	return n
}
let original: WorkerState["rpc"] | undefined
beforeEach((ctx) => {
	if (!ctx.task.suite?.name.startsWith("with VITE_NULO_ALLOW_IFRAME_DAPPS")) return
	counts.fetch = 0
	original = worker.rpc
	const ms = Number(process.env.DIAG_FETCH_DELAY_MS ?? "1000")
	worker.rpc = new Proxy(original, {
		get(target, key) {
			const value = Reflect.get(target, key)
			if (key !== "fetch" || typeof value !== "function") return value
			return async (...args: unknown[]) => {
				counts.fetch += 1
				await new Promise((resolve) => setTimeout(resolve, ms))
				return (value as (...a: unknown[]) => unknown).apply(target, args)
			}
		},
	})
})
afterEach((ctx) => {
	if (!original) return
	worker.rpc = original
	original = undefined
	require("node:fs").appendFileSync(process.env.DIAG_OUT ?? "/dev/null", `${JSON.stringify({ test: ctx.task.name.slice(0, 40), state: ctx.task.result?.state, fetches: counts.fetch, evaluated: evaluated() })}\n`)
})
```

## Consults

### Codex round 1 (gpt-6.1-sol, high): conditional approve

1. `expect.poll` and `vi.waitFor` advance fake timers after each failed attempt, so `vi.useFakeTimers({ toFake: ["Date"] })` gives no still clock (checked: vitest 4.1.10 `test.*.js`, `vi.isFakeTimers()` then `advanceTimersByTime`). Accepted: D2 uses `vi.setSystemTime` alone, which mocks only `Date`, and asserts `qLive.createdAt` equals the restart's time.
2. "The gap cannot be 0 in production" overreached. Accepted: restated as the documented conservative rule, with KL-1 filed at close-out; no product change.
3. The causes were overstated: neither failing run kept its state, the RPCs can queue, and approval reached 60 ms. Accepted: reworded "reproductions consistent with the reported reds"; I1 and I2 keep their confidence; the matched-control distinction is kept.
4. Step 6's fallback was imprecise. Accepted: four builds, both browsers and both flag values, byte-identical to base; demonstrated in planning; a difference stops the arc.
5. The starvation run is a controlled contention run, not deterministic. Accepted: the fetch-delay proof at 5000 ms per fetch is the deterministic red; contention runs are recorded with timings; trap-based cleanup.
6. Proportion: add `lint:actions`; 3 failures, not 5, in the loop seed; acceptance after any executable review fix; load samples kept outside the repo and summarized; cut to 150 lines. All accepted; Phase 3 moved after the Codex loop.

### Opus Plan leg: conditional approve

1. The 22 unflagged tests' times came from the 20-loop run and spanned 13 to 282 ms, not 13 to 130. Accepted: recon corrected; step 6 compares the flag-on tests with the slowest unflagged session test in the same run.
2. I1 unsafe as worded (RPC queueing at a 3 s main-loop delay fits too). Accepted, as Codex 3.
3. A 30-of-30 soak passes 36% of the time with nothing fixed at 1 red in 30. Accepted: the reproductions are the proof, the soaks are smoke runs (D4).
4. `boot()`'s `init` parameter goes unused after D1, and `withFlag` can be synchronous. Accepted.
5. D1 versus test-only fixes: decided for D1; the condition to keep "build-time, immutable per release" at the new read is accepted.
6. The build fallback was uncheckable, and Firefox was missing. Accepted, as Codex 4.
7. +1000 ms pins only one side of `>=`. Accepted: +1 ms, so line 134 pins cutoff − 1 as failed and line 147 the cutoff as live. Codex had found +1000 acceptable; +1 is stronger at the same cost.
8. I3 missed a clock coarser than a restart. Accepted into KL-1.
9. Size. Accepted: 150 lines.

### Codex round 2 (resumed): conditional approve

1. The contention recipe read the loops' pgid from the parent before `setsid` could finish, so a race could name the caller's group; and the absence check ran before the cleanup. Accepted: the loops' leader writes its own `$$`, the parent verifies it, kills and waits before checking.
2. A timed-out test does not cancel its delayed fetch or import, which can leak into the next test's probe. Accepted: one vitest invocation per flag-on probe, on base and on the fix, plus one whole-file run of the fix.

### Codex round 3 (resumed): approve

Both conditions verified; no further finding.
