import { describe, expect, test, vi } from "vitest"
import { CHAIN_LAG_MAX_MS, ChainTipGate } from "./chain-tip-gate"

const SCOPE = { chainId: 1, account: "0xme" }
const K = (...k: string[]) => new Set(k)
/** A dApp call with no transfers holds every sequence of its contract (`recordedTxKeys`). */
const SHARES = K("seq:0xt:0xbob")
const DISJOINT = K("seq:0xu:0xbob")

const settledRow = (over: object = {}) => ({
	chainId: 1,
	account: "0xMe",
	networkId: "net",
	block: { number: 7, hash: "0xb7" },
	calls: [{ contract: "0xT", method: "swap", args: [] }],
	...over,
})

type Tip = number | Error | "hang"

/** A gate on a manual clock: a sleep yields a macrotask, then advances the clock unless it was cut
 *  short, so a read that answers at once beats its timeout. */
function harness(tip: Tip) {
	const clock = { now: 1_000 }
	const node = { tip, reads: 0 }
	const gate = new ChainTipGate({
		readTip: async () => {
			node.reads += 1
			if (node.tip === "hang") return new Promise<number>(() => {})
			if (node.tip instanceof Error) throw node.tip
			return node.tip
		},
		sleep: async (ms, signal) => {
			await new Promise((r) => setTimeout(r, 0))
			if (!signal.aborted) clock.now += ms
		},
		now: () => clock.now,
		logDebug: vi.fn(),
	})
	return { gate, clock, node }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

describe("ChainTipGate", () => {
	test("an observation holds only sends of its scope sharing a key, until a tip read reaches its block", async () => {
		const { gate, node } = harness(6)
		gate.observe(settledRow())
		await settle()
		expect(gate.unconfirmed(SCOPE, SHARES, "net")).toBe(true)
		expect(gate.unconfirmed(SCOPE, undefined, "net")).toBe(true)
		expect(gate.unconfirmed(SCOPE, DISJOINT, "net")).toBe(false)
		expect(gate.unconfirmed(SCOPE, K(), "net")).toBe(false)
		expect(gate.unconfirmed({ chainId: 1, account: "0xother" }, SHARES, "net")).toBe(false)
		expect(gate.unconfirmed({ chainId: 2, account: "0xme" }, SHARES, "net")).toBe(false)
		node.tip = 7
		await gate.refresh("net")
		expect(gate.unconfirmed(SCOPE, SHARES, "net")).toBe(false)
	})

	test("an observation stops holding 60 s after this worker made it, whatever the tip", async () => {
		const { gate, clock } = harness(6)
		gate.observe(settledRow())
		await settle()
		clock.now += CHAIN_LAG_MAX_MS - 1
		expect(gate.unconfirmed(SCOPE, SHARES, "net")).toBe(true)
		clock.now += 1
		expect(gate.unconfirmed(SCOPE, SHARES, "net")).toBe(false)
	})

	test.each<[string, Tip]>([
		["a failed", new Error("node down")],
		["a timed-out", "hang"],
	])("%s read lets what was observed by then run; a later observation holds again", async (_, tip) => {
		const { gate, clock, node } = harness(tip)
		gate.observe(settledRow())
		await gate.refresh("net")
		expect(gate.unconfirmed(SCOPE, SHARES, "net")).toBe(false)
		clock.now += 1
		node.tip = 6
		gate.observe(settledRow({ block: { number: 8, hash: "0xb8" } }))
		await settle()
		expect(gate.unconfirmed(SCOPE, SHARES, "net")).toBe(true)
	})

	test("reads are shared per network while one runs, and a row with no block or network observes nothing", async () => {
		const { gate, node } = harness(6)
		gate.observe(settledRow({ block: undefined }))
		gate.observe(settledRow({ networkId: undefined }))
		expect(node.reads).toBe(0)
		expect(gate.unconfirmed(SCOPE, undefined, "net")).toBe(false)
		const first = gate.refresh("net")
		expect(gate.refresh("net")).toBe(first)
		void gate.refresh("other")
		await first
		expect(node.reads).toBe(2)
	})

	test("wait reads the tip until it reaches the block, ends at its bound, and answers an abort without throwing", async () => {
		const reaching = harness(6)
		reaching.gate.observe(settledRow())
		const waited = reaching.gate.wait(SCOPE, SHARES, "net", new AbortController().signal, 30_000)
		await settle()
		reaching.node.tip = 7
		expect(await waited).toBe("confirmed")

		const bounded = harness(6)
		bounded.gate.observe(settledRow())
		expect(await bounded.gate.wait(SCOPE, SHARES, "net", new AbortController().signal, 2_500)).toBe("expired")
		expect(bounded.gate.unconfirmed(SCOPE, SHARES, "net")).toBe(true)

		const aborted = harness(6)
		aborted.gate.observe(settledRow())
		const abort = new AbortController()
		const cancelled = aborted.gate.wait(SCOPE, SHARES, "net", abort.signal, 30_000)
		abort.abort()
		await expect(cancelled).resolves.toBe("aborted")
	})
})
