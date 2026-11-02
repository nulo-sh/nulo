import type { BackgroundConnectionHandler, PendingDiscovery } from "@aztec-labs/wallet-sdk/extension/handlers"
import type { ILogger } from "@nulo/wallet-core/logger"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { DISCOVERY_STALE_MS, DiscoveryQueue, isDiscoveryExpired } from "./discovery-queue"

const noopLogger: ILogger = { log: () => {} }
const T0 = 1_000_000_000

let setBadgeText: ReturnType<typeof vi.fn>

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(T0)
	setBadgeText = vi.fn()
	// biome-ignore lint/suspicious/noExplicitAny: minimal chrome stub for the badge
	;(globalThis as any).chrome = { action: { setBadgeText, setBadgeBackgroundColor: vi.fn() } }
})

afterEach(() => {
	vi.useRealTimers()
})

const at = (ms: number): void => {
	vi.setSystemTime(T0 + ms)
}

/** The SDK's pending-discovery map as `BackgroundConnectionHandler` keeps it: keyed by the page's
 *  id, a fresh row object per receipt, and a reject that only drops a pending row. */
function fakeSdk() {
	const rows = new Map<string, PendingDiscovery>()
	const rejected: string[] = []
	const handler = {
		getPendingDiscovery: (id: string) => rows.get(id),
		rejectDiscovery: (id: string) => {
			const row = rows.get(id)
			if (row?.status !== "pending") return false
			rows.delete(id)
			rejected.push(id)
			return true
		},
	} as unknown as BackgroundConnectionHandler
	const receive = (requestId: string, origin = "https://a.com"): PendingDiscovery => {
		const row = { requestId, origin, status: "pending", timestamp: Date.now() } as unknown as PendingDiscovery
		rows.set(requestId, row)
		return row
	}
	return { handler, rows, rejected, receive, queue: () => new DiscoveryQueue(handler, noopLogger) }
}

async function drainAll(q: DiscoveryQueue): Promise<PendingDiscovery[]> {
	const processed: PendingDiscovery[] = []
	await q.drain(async (d) => {
		processed.push(d)
		return true
	})
	return processed
}

const ids = (rows: readonly PendingDiscovery[]): string[] => rows.map((d) => d.requestId)

describe("DiscoveryQueue — boot badge reconciliation", () => {
	test("construction repaints the badge from the (empty) queue — clears a ghost count left by a killed SW", () => {
		// The badge survives an SW kill; the queue does not. A fresh queue at boot
		// must reconcile the badge to its actual (empty) contents, or the pre-kill
		// count ghosts forever (the empty-queue drain early-returns badge-untouched).
		fakeSdk().queue()
		expect(setBadgeText).toHaveBeenCalledWith({ text: "" })
	})

	test("construction after a non-empty lifetime still paints the live count on the next enqueue", () => {
		const sdk = fakeSdk()
		sdk.queue().enqueue(sdk.receive("r1"), "1")
		expect(setBadgeText).toHaveBeenLastCalledWith({ text: "1" })
	})
})

describe("DiscoveryQueue — the newest live request per (origin, chainId)", () => {
	test("a Connect retried after its first request expired drains on unlock", async () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		q.enqueue(sdk.receive("r1"), "1")
		at(70_000)
		q.enqueue(sdk.receive("r2"), "1")
		at(75_000)
		expect(ids(await drainAll(q))).toEqual(["r2"])
		expect(sdk.rejected).toEqual(["r1"])
	})

	test("a retry while the first is live takes its place, so it survives an unlock after the first expired", async () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		q.enqueue(sdk.receive("r1"), "1")
		at(50_000)
		q.enqueue(sdk.receive("r2"), "1")
		expect(q.size).toBe(1)
		at(58_000)
		expect(ids(await drainAll(q))).toEqual(["r2"])
		expect(sdk.rejected).toEqual(["r1"])
	})

	test("receipt order decides, not the order requests reach the queue; other pairs are untouched", async () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		const older = sdk.receive("r1")
		at(10_000)
		q.enqueue(sdk.receive("r2"), "1")
		q.enqueue(older, "1")
		q.enqueue(sdk.receive("r3", "https://b.com"), "1")
		expect(sdk.rejected).toEqual(["r1"])
		expect(ids(await drainAll(q))).toEqual(["r2", "r3"])
	})

	test("a request whose tab closed before it reached the queue leaves the queued one alone", async () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		q.enqueue(sdk.receive("r1"), "1")
		at(5_000)
		const gone = sdk.receive("r2")
		sdk.rows.delete("r2")
		q.enqueue(gone, "1")
		expect(setBadgeText).toHaveBeenLastCalledWith({ text: "1" })
		expect(ids(await drainAll(q))).toEqual(["r1"])
		expect(sdk.rejected).toEqual([])
	})

	test("a request already expired when it reaches the queue is rejected, never queued or counted", () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		const late = sdk.receive("r1")
		at(DISCOVERY_STALE_MS + 1)
		q.enqueue(late, "1")
		expect(q.size).toBe(0)
		expect(sdk.rejected).toEqual(["r1"])
		expect(setBadgeText).toHaveBeenLastCalledWith({ text: "" })
	})

	test("a first request reaching the queue after its own resend changes nothing", async () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		const first = sdk.receive("x")
		at(5_000)
		const resend = sdk.receive("x")
		q.enqueue(resend, "1")
		q.enqueue(first, "1")
		expect(sdk.rejected).toEqual([])
		const drained = await drainAll(q)
		expect(drained).toHaveLength(1)
		expect(drained[0]).toBe(resend)
	})

	test("a resend of a queued id takes its entry's place without a reject", async () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		q.enqueue(sdk.receive("x"), "1")
		at(5_000)
		const resend = sdk.receive("x")
		q.enqueue(resend, "1")
		expect(q.size).toBe(1)
		expect(sdk.rejected).toEqual([])
		const drained = await drainAll(q)
		expect(drained).toHaveLength(1)
		expect(drained[0]).toBe(resend)
	})

	test("a resend of a queued id for another chain leaves no entry on the old chain", async () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		q.enqueue(sdk.receive("x"), "1")
		at(5_000)
		q.enqueue(sdk.receive("x"), "2")
		q.enqueue(sdk.receive("r3"), "1")
		expect(q.size).toBe(2)
		expect(sdk.rejected).toEqual([])
		expect(ids(await drainAll(q))).toEqual(["x", "r3"])
	})
})

describe("DiscoveryQueue — flood caps", () => {
	test("entries that can no longer succeed free their cap slots", () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		for (let i = 0; i < 4; i++) q.enqueue(sdk.receive(`r${i}`), String(i))
		at(70_000)
		q.enqueue(sdk.receive("r4"), "4")
		expect(q.size).toBe(1)
		expect(sdk.rejected).toEqual(["r0", "r1", "r2", "r3"])
		expect(setBadgeText).toHaveBeenLastCalledWith({ text: "1" })
	})

	test("per-origin cap refuses and rejects past 4 live entries for one origin; a different origin is unaffected", () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		for (let i = 0; i < 4; i++) q.enqueue(sdk.receive(`r${i}`), String(i))
		at(10_000)
		q.enqueue(sdk.receive("r4"), "9")
		q.enqueue(sdk.receive("rb", "https://b.com"), "1")
		expect(q.size).toBe(5)
		expect(sdk.rejected).toEqual(["r4"])
	})

	test("global cap refuses and rejects past 32 across many single-item origins", () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		// 40 distinct origins, 1 each → the per-origin cap (4) never trips; the
		// global cap (32) is the binding limit.
		for (let i = 0; i < 40; i++) q.enqueue(sdk.receive(`r${i}`, `https://o${i}.com`), "1")
		expect(q.size).toBe(32)
		expect(sdk.rejected).toHaveLength(8)
	})
})

describe("DiscoveryQueue — a wallet locked mid-drain", () => {
	test("a request for the pair that arrived during the drain is the one kept", async () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		q.enqueue(sdk.receive("r1"), "1")
		await q.drain(async () => {
			at(5_000)
			q.enqueue(sdk.receive("r2"), "1")
			return false
		})
		expect(q.size).toBe(1)
		expect(sdk.rejected).toEqual(["r1"])
		expect(ids(await drainAll(q))).toEqual(["r2"])
	})

	test.each(["1", "2"])("a resend of the drained id during the drain is the one kept, unrejected (chain %s)", async (chainId) => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		q.enqueue(sdk.receive("x"), "1")
		let resend: PendingDiscovery | undefined
		await q.drain(async () => {
			at(5_000)
			resend = sdk.receive("x")
			q.enqueue(resend, chainId)
			return false
		})
		expect(q.size).toBe(1)
		expect(sdk.rejected).toEqual([])
		const drained = await drainAll(q)
		expect(drained).toHaveLength(1)
		expect(drained[0]).toBe(resend)
	})
})

describe("DiscoveryQueue — SDK-timeout-aligned expiry", () => {
	// The SDK's DEFAULT_DISCOVERY_TIMEOUT_MS is 60s (extension_provider): the
	// dApp removes its DISCOVERY_RESPONSE listener at t=60s. A discovery drained
	// after that window must be REJECTED, never approved — approving a connection
	// the dApp has already abandoned strands a half-open handshake.
	test("rejects a discovery drained past the SDK's 60s discovery window", async () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		q.enqueue(sdk.receive("r1"), "1")
		at(61_000)
		expect(await drainAll(q)).toEqual([])
		expect(sdk.rejected).toEqual(["r1"])
	})

	test("still processes a discovery well within the window", async () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		q.enqueue(sdk.receive("r1"), "1")
		at(5_000)
		expect(ids(await drainAll(q))).toEqual(["r1"])
	})

	// Pin the exact 55s policy boundary (a 5s-green/61s-red pair alone would
	// accept any threshold between them).
	test("isDiscoveryExpired pins the 55s boundary exactly", () => {
		const row = (timestamp: number) => ({ requestId: "r", status: "pending", timestamp }) as unknown as PendingDiscovery
		expect(DISCOVERY_STALE_MS).toBe(55_000)
		const base = 1_000_000
		expect(isDiscoveryExpired(row(base), base + 54_000)).toBe(false) // 54s — inside
		expect(isDiscoveryExpired(row(base), base + 55_000)).toBe(false) // exactly 55s — inside (not strictly past)
		expect(isDiscoveryExpired(row(base), base + 55_001)).toBe(true) // 55.001s — past
		expect(isDiscoveryExpired(row(base), base + 61_000)).toBe(true) // 61s — well past
	})

	// A slow first drain can push a later, already-aging entry past the window.
	test("drain re-reads the clock per entry, expiring a later item during a slow drain", async () => {
		const sdk = fakeSdk()
		const q = sdk.queue()
		const aging = sdk.receive("r2", "https://b.com")
		at(30_000)
		q.enqueue(sdk.receive("r1"), "1")
		q.enqueue(aging, "1")
		const processed: string[] = []
		await q.drain(async (d) => {
			processed.push(d.requestId)
			// Processing r1 takes 30s → r2 (already 30s old) crosses 55s.
			if (d.requestId === "r1") at(60_000)
			return true
		})
		expect(processed).toEqual(["r1"])
		expect(sdk.rejected).toEqual(["r2"])
	})
})
