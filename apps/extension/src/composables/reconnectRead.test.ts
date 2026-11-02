import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import { createReconnectRead } from "./reconnectRead"

/** A client whose first request opens the port, as the real client's does; `reconnect` is a
 *  worker restart: the port drops, the pending reads reject and the client opens it again. */
function harness(fetchImpl?: () => Promise<string>) {
	const client = { onConnected: new EventHandler<void>() }
	let open = false
	const reads: PromiseWithResolvers<string>[] = []
	const landed: string[] = []
	const request = () => {
		if (open) return
		open = true
		client.onConnected.invoke()
	}
	const fetch =
		fetchImpl ??
		(() => {
			request()
			const read = Promise.withResolvers<string>()
			reads.push(read)
			return read.promise
		})
	const run = vi.fn(async (isCurrent: () => boolean) => {
		let value: string
		try {
			value = await fetch()
		} catch {
			return false
		}
		if (isCurrent()) landed.push(value)
		return true
	})
	const reader = createReconnectRead(client, run)
	return {
		client,
		run,
		reads,
		landed,
		request,
		read: reader.read,
		dispose: reader.dispose,
		reconnect() {
			for (const read of reads) read.reject(new Error("disconnected"))
			client.onConnected.invoke()
		},
	}
}

describe("createReconnectRead", () => {
	test("the mount's read opens the port and reads once", async () => {
		const h = harness()
		void h.read()
		h.reads[0].resolve("a")
		await flushPromises()
		expect(h.run).toHaveBeenCalledTimes(1)
		expect(h.landed).toEqual(["a"])
	})

	test("another request that opens the port first in the mount step adds no read", async () => {
		const h = harness()
		h.request()
		void h.read()
		await flushPromises()
		expect(h.run).toHaveBeenCalledTimes(1)
	})

	test("every later open reads again", async () => {
		const h = harness()
		void h.read()
		h.reads[0].resolve("a")
		await flushPromises()
		h.client.onConnected.invoke()
		h.reads[1].resolve("b")
		await flushPromises()
		expect(h.run).toHaveBeenCalledTimes(2)
		expect(h.landed).toEqual(["a", "b"])
	})

	test("a read the drop rejected lands nothing, and the reconnect's read lands", async () => {
		const h = harness()
		void h.read()
		h.reconnect()
		await flushPromises()
		expect(h.landed).toEqual([])
		h.reads[1].resolve("b")
		await flushPromises()
		expect(h.landed).toEqual(["b"])
	})

	test("a read the drop rejected before the open was announced reads again on the next open", async () => {
		const reads: PromiseWithResolvers<string>[] = []
		const h = harness(() => {
			const read = Promise.withResolvers<string>()
			reads.push(read)
			return read.promise
		})
		void h.read()
		reads[0].reject(new Error("disconnected"))
		await flushPromises()
		h.client.onConnected.invoke()
		reads[1].resolve("b")
		await flushPromises()
		expect(h.run).toHaveBeenCalledTimes(2)
		expect(h.landed).toEqual(["b"])
	})

	test("an older read that answers last is ignored", async () => {
		const h = harness()
		void h.read()
		h.client.onConnected.invoke()
		h.reads[1].resolve("new")
		await flushPromises()
		h.reads[0].resolve("old")
		await flushPromises()
		expect(h.landed).toEqual(["new"])
	})

	test("a run that throws rejects the read and marks nothing: the first open reads no more", async () => {
		const client = { onConnected: new EventHandler<void>() }
		const run = vi.fn(async () => {
			throw new Error("land threw")
		})
		const reader = createReconnectRead(client, run)
		await expect(reader.read()).rejects.toThrow("land threw")
		client.onConnected.invoke()
		await flushPromises()
		expect(run).toHaveBeenCalledTimes(1)
	})

	test("a read in flight at dispose never lands", async () => {
		const h = harness()
		void h.read()
		h.dispose()
		h.reads[0].resolve("a")
		await flushPromises()
		expect(h.landed).toEqual([])
	})

	test("dispose removes the handler: a later open reads nothing", async () => {
		const h = harness()
		const removed = vi.spyOn(h.client.onConnected, "remove")
		void h.read()
		h.dispose()
		h.client.onConnected.invoke()
		await flushPromises()
		expect(h.run).toHaveBeenCalledTimes(1)
		expect(removed).toHaveBeenCalledTimes(1)
	})

	test("dispose twice is safe", () => {
		const h = harness()
		h.dispose()
		expect(() => h.dispose()).not.toThrow()
	})
})
