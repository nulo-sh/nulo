import { afterEach, describe, expect, test, vi } from "vitest"
import { SharedReads } from "./shared-reads"

/** A read held on a deferred promise, counted per start. */
function heldRead<V>() {
	const pending: { resolve: (v: V) => void; reject: (e: unknown) => void }[] = []
	const read = vi.fn(() => new Promise<V>((resolve, reject) => pending.push({ resolve, reject })))
	return { read, pending }
}

afterEach(() => vi.useRealTimers())

describe("SharedReads", () => {
	test("callers share a read in flight, and a success serves until `ttlMs` after it settled", async () => {
		vi.useFakeTimers()
		const reads = new SharedReads<number>(5_000)
		const { read, pending } = heldRead<number>()

		const first = reads.get("n1", read)
		const second = reads.get("n1", read)
		expect(read).toHaveBeenCalledTimes(1)
		pending[0].resolve(7)
		expect(await Promise.all([first, second])).toEqual([7, 7])

		vi.advanceTimersByTime(4_999)
		expect(await reads.get("n1", read)).toBe(7)
		expect(read).toHaveBeenCalledTimes(1)
		vi.advanceTimersByTime(1)
		void reads.get("n1", read)
		expect(read).toHaveBeenCalledTimes(2)
	})

	test("a failed read is shared while in flight, and the next caller reads again", async () => {
		const reads = new SharedReads<number>(5_000)
		const { read, pending } = heldRead<number>()

		const first = reads.get("n1", read)
		const second = reads.get("n1", read)
		pending[0].reject(new Error("node down"))
		await expect(first).rejects.toThrow("node down")
		await expect(second).rejects.toThrow("node down")

		void reads.get("n1", read)
		expect(read).toHaveBeenCalledTimes(2)
	})

	test("with no ttl a verdict serves only the callers that came while it was in flight", async () => {
		const reads = new SharedReads<boolean>(0)
		const { read, pending } = heldRead<boolean>()

		const first = reads.get("p1|n1", read)
		void reads.get("p1|n1", read)
		pending[0].resolve(false)
		await first

		void reads.get("p1|n1", read)
		expect(read).toHaveBeenCalledTimes(2)
	})

	test("keys never share, and clear() makes the next caller read again even while a read is in flight", async () => {
		const reads = new SharedReads<number>(5_000)
		const { read } = heldRead<number>()

		void reads.get("n1", read)
		void reads.get("n2", read)
		expect(read).toHaveBeenCalledTimes(2)
		reads.clear()
		void reads.get("n1", read)
		expect(read).toHaveBeenCalledTimes(3)
	})
})
