import { describe, expect, test } from "vitest"
import { type ScanIntent, ScanGate } from "./scan-gate"

type Held = { key: string; intent: ScanIntent; resolve: () => void; reject: (error: unknown) => void; done?: boolean }

/** A gate whose every run is held on its own deferred promise, released by the test. */
function heldGate(limit: number) {
	const runs: Held[] = []
	const gate = new ScanGate(limit, (key, intent) => new Promise<void>((resolve, reject) => runs.push({ key, intent, resolve, reject })))
	const running = () => runs.filter((r) => !r.done).map((r) => r.key)
	const release = async (key: string, outcome: "resolve" | "reject" = "resolve") => {
		const run = runs.find((r) => r.key === key && !r.done)
		if (!run) throw new Error(`${key} is not running`)
		run.done = true
		if (outcome === "resolve") run.resolve()
		else run.reject(new Error("scan failed"))
		await flush()
	}
	return { gate, runs, running, release }
}

const flush = () => new Promise((r) => setTimeout(r, 0))
const plain: ScanIntent = { force: false, retry: false }

/** Tracks whether a promise has settled, without awaiting it. */
function settledFlag(p: Promise<void>) {
	const state = { settled: false }
	void p.then(() => {
		state.settled = true
	})
	return state
}

describe("ScanGate", () => {
	test("runs at most `limit` at once, in request order, and every requested key exactly once", async () => {
		const { gate, runs, running, release } = heldGate(2)
		for (const key of ["a", "b", "c", "d", "e"]) gate.request(key, plain)
		expect(running()).toEqual(["a", "b"])

		await release("b")
		expect(running()).toEqual(["a", "c"])
		await release("a")
		await release("c")
		expect(running()).toEqual(["d", "e"])
		await release("d")
		await release("e")

		expect(runs.map((r) => r.key)).toEqual(["a", "b", "c", "d", "e"])
		expect(running()).toEqual([])
	})

	test("a request for a waiting key merges into one run in its place, its intents ORed, and its waiters settle after that run", async () => {
		const { gate, runs, running, release } = heldGate(1)
		gate.request("a", plain)
		const first = settledFlag(gate.requestAndWait("b", { force: true, retry: false }))
		gate.request("c", plain)
		gate.request("b", plain)
		const second = settledFlag(gate.requestAndWait("b", { force: false, retry: true }))

		await release("a")
		expect(running()).toEqual(["b"])
		expect(runs.filter((r) => r.key === "b").map((r) => r.intent)).toEqual([{ force: true, retry: true }])
		await flush()
		expect([first.settled, second.settled]).toEqual([false, false])

		await release("b")
		expect([first.settled, second.settled]).toEqual([true, true])
		expect(running()).toEqual(["c"])
		expect(runs.map((r) => r.key)).toEqual(["a", "b", "c"])
	})

	test("a request for a running key waits behind that run while other keys pass it, and owns its own waiters", async () => {
		const { gate, runs, running, release } = heldGate(2)
		const old = settledFlag(gate.requestAndWait("a", plain))
		const successor = settledFlag(gate.requestAndWait("a", { force: true, retry: false }))
		gate.request("b", plain)
		gate.request("c", plain)
		expect(running()).toEqual(["a", "b"])

		await release("b")
		expect(running()).toEqual(["a", "c"])

		await release("a")
		expect(old.settled).toBe(true)
		expect(successor.settled).toBe(false)
		expect(running()).toEqual(["c", "a"])
		expect(runs.filter((r) => r.key === "a").map((r) => r.intent.force)).toEqual([false, true])

		await release("a")
		expect(successor.settled).toBe(true)
	})

	test("a run that rejects, or whose runner throws, frees its slot and settles its waiters", async () => {
		const { gate, running, release } = heldGate(1)
		const waiter = settledFlag(gate.requestAndWait("a", plain))
		gate.request("b", plain)

		await release("a", "reject")
		expect(waiter.settled).toBe(true)
		expect(running()).toEqual(["b"])

		const started: string[] = []
		const throwing = new ScanGate(1, (key) => {
			started.push(key)
			if (key === "x") throw new Error("runner threw")
			return Promise.resolve()
		})
		const thrown = settledFlag(throwing.requestAndWait("x", plain))
		throwing.request("y", plain)
		await flush()
		expect(thrown.settled).toBe(true)
		expect(started).toEqual(["x", "y"])
	})

	test("clear() settles every waiting request and starts none; a running key keeps its slot and a new request waits behind it", async () => {
		const { gate, runs, running, release } = heldGate(1)
		const runningWaiter = settledFlag(gate.requestAndWait("a", plain))
		const dropped = settledFlag(gate.requestAndWait("b", plain))
		gate.request("c", plain)

		gate.clear()
		await flush()
		expect(dropped.settled).toBe(true)
		expect(runningWaiter.settled).toBe(false)
		expect(running()).toEqual(["a"])

		gate.request("a", { force: true, retry: false })
		gate.request("d", plain)
		await flush()
		expect(running()).toEqual(["a"])

		await release("a")
		expect(runningWaiter.settled).toBe(true)
		expect(running()).toEqual(["a"])
		expect(runs.map((r) => r.key)).toEqual(["a", "a"])
		await release("a")
		expect(running()).toEqual(["d"])
		expect(runs.map((r) => r.key)).toEqual(["a", "a", "d"])
	})
})
