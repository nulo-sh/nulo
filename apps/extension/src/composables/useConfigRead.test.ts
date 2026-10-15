import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import type { ConfigProp } from "@/wallet/services/config/client"
import { useConfigRead } from "./useConfigRead"

/** A config client whose first request opens the port, as the real client's does; `reconnect` is a
 *  worker restart: the port drops, the pending reads reject and the client opens it again. */
function harness(fetchImpl?: () => Promise<string>) {
	const config = { onConnected: new EventHandler<void>(), onUpdate: new EventHandler<ConfigProp>() }
	let open = false
	const reads: PromiseWithResolvers<string>[] = []
	const request = () => {
		if (open) return
		open = true
		config.onConnected.invoke()
	}
	const fetch = vi.fn(
		fetchImpl ??
			(() => {
				request()
				const read = Promise.withResolvers<string>()
				reads.push(read)
				return read.promise
			}),
	)
	const land = vi.fn<(value: string, updatedSince: (key: string) => boolean) => void>()
	const reader = useConfigRead(config, fetch, land)
	return {
		config,
		fetch,
		land,
		reads,
		request,
		read: reader.read,
		dispose: reader.dispose,
		update: (key: string) => config.onUpdate.invoke({ key, value: true } as ConfigProp),
		reconnect() {
			for (const read of reads) read.reject(new Error("disconnected"))
			config.onConnected.invoke()
		},
	}
}

describe("useConfigRead", () => {
	test("the mount's read opens the port and reads once", async () => {
		const h = harness()
		void h.read()
		h.reads[0].resolve("a")
		await flushPromises()
		expect(h.fetch).toHaveBeenCalledTimes(1)
		expect(h.land).toHaveBeenCalledExactlyOnceWith("a", expect.any(Function))
	})

	test("another request that opens the port first in the mount step adds no read", async () => {
		const h = harness()
		h.request()
		void h.read()
		await flushPromises()
		expect(h.fetch).toHaveBeenCalledTimes(1)
	})

	test("every later open reads again", async () => {
		const h = harness()
		void h.read()
		h.reads[0].resolve("a")
		h.config.onConnected.invoke()
		h.reads[1].resolve("b")
		await flushPromises()
		expect(h.fetch).toHaveBeenCalledTimes(2)
		expect(h.land).toHaveBeenLastCalledWith("b", expect.any(Function))
	})

	test("a read the drop rejected lands nothing, and the reconnect's read lands", async () => {
		const h = harness()
		void h.read()
		h.reconnect()
		await flushPromises()
		expect(h.land).not.toHaveBeenCalled()
		h.reads[1].resolve("b")
		await flushPromises()
		expect(h.land).toHaveBeenCalledExactlyOnceWith("b", expect.any(Function))
	})

	test("an older read that answers last is ignored", async () => {
		const h = harness()
		void h.read()
		h.config.onConnected.invoke()
		h.reads[1].resolve("new")
		await flushPromises()
		h.reads[0].resolve("old")
		await flushPromises()
		expect(h.land).toHaveBeenCalledExactlyOnceWith("new", expect.any(Function))
	})

	test("an update during the read is reported for its key only", async () => {
		const h = harness()
		void h.read()
		h.update("theme")
		h.reads[0].resolve("a")
		await flushPromises()
		const updatedSince = h.land.mock.calls[0][1]
		expect(updatedSince("theme")).toBe(true)
		expect(updatedSince("showFiatValues")).toBe(false)
	})

	test("an update before the read started is not reported", async () => {
		const h = harness()
		h.update("theme")
		void h.read()
		h.reads[0].resolve("a")
		await flushPromises()
		expect(h.land.mock.calls[0][1]("theme")).toBe(false)
	})

	test("a fetch that throws synchronously ends the read", async () => {
		const h = harness(() => {
			throw new Error("Failed to connect")
		})
		await expect(h.read()).resolves.toBeUndefined()
		expect(h.land).not.toHaveBeenCalled()
	})

	test("a read in flight at dispose never lands", async () => {
		const h = harness()
		void h.read()
		h.dispose()
		h.reads[0].resolve("a")
		await flushPromises()
		expect(h.land).not.toHaveBeenCalled()
	})

	test("dispose removes both handlers: a later open reads nothing", async () => {
		const h = harness()
		const removed = { update: vi.spyOn(h.config.onUpdate, "remove"), connected: vi.spyOn(h.config.onConnected, "remove") }
		void h.read()
		h.dispose()
		h.config.onConnected.invoke()
		await flushPromises()
		expect(h.fetch).toHaveBeenCalledTimes(1)
		expect(removed.update).toHaveBeenCalledTimes(1)
		expect(removed.connected).toHaveBeenCalledTimes(1)
	})

	test("dispose twice is safe", () => {
		const h = harness()
		h.dispose()
		expect(() => h.dispose()).not.toThrow()
	})
})
