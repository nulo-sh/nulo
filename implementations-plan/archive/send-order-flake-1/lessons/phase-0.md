# Phase 0: planning evidence and consults

## Measurement 1: the base test alone under host load (2026-10-22, load1 about 140)

`cd apps/extension && bun --bun vitest run src/wallet/services/execution/send-order.composition.test.ts --retry=0 -t "silent-path"`, six runs in sequence at `421bf33b4`: **3 of 6 red**, each `AssertionError: expected 'pending' to be 'queued'` at `:346`. The issue's "passed 3 of 3 alone" did not hold at this load.

## Measurement 2: the worst legal interleaving, deterministic

A scratch copy of the file (uncommitted, removed after) held the requeue's journal write until the test's next `getOperation` returned. The product promises nothing about that order, so this is a legal schedule, not a fault injected into the product:

```ts
import { deferred } from "@nulo/wallet-core/utils"

/** Holds every `transitionIfStage` to `queued` until a `getOperation` has returned. */
const gate = (h: Harness) => {
	const read = deferred()
	const getOperation = h.journal.getOperation.bind(h.journal)
	vi.spyOn(h.journal, "getOperation").mockImplementation(async (id: string) => {
		try {
			return await getOperation(id)
		} finally {
			read.resolve()
		}
	})
	const transitionIfStage = h.journal.transitionIfStage.bind(h.journal)
	vi.spyOn(h.journal, "transitionIfStage").mockImplementation((async (...args: Parameters<typeof transitionIfStage>) => {
		if (args[2].stage === "queued") await read.promise
		return transitionIfStage(...args)
	}) as never)
}
```

Five runs of three variants, at load1 about 140:

| Variant | Body | Result |
|---|---|---|
| R1 | the base test, `gate(h)` first | **red 5/5**, `expected 'pending' to be 'queued'` (the flake's message) |
| R2 | the fixed body (wait for the stored stage, then the history check), `gate(h)` first | green 5/5 |
| R3 | the fixed body, no gate | green 5/5 |

The gate works only because the fixed body's first poll is a `getOperation`; an event-only wait would deadlock under it (nothing reads, so nothing opens the gate). With `requeue` moved before `keep`, the gate would hold the slot and `parkedSend` would never return: the gate is a negative control for this order, not a test to commit (plan D4).

To rerun: copy the file under a new `*.composition.test.ts` name, add `gate` inside the second `describe`, add the variants, run, delete the copy.

## Consults

- **Codex round 1** (gpt-6.1-sol, high, session 01a16550): conditional approve; 4 findings, all accepted (plan § Audit verdicts). The account `best` resolved to ran it without error.
- **Opus Plan leg** (opus): conditional approve; 5 findings, all accepted. Its decisive one: the reader that needs write-before-`wait` is the claim helper (lock-free read, skips its transition on `pending`), so a fire-and-forget requeue would leave a running send at `queued`; nothing pinned it, hence D7.
- **Codex round 2** (resume): conditional approve; 1 finding (the gate's test count with D7), accepted. **Round 3** (resume): approve.
