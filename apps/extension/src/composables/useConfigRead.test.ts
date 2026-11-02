import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import type { ConfigProp } from "@/wallet/services/config/client"
import { useConfigRead } from "./useConfigRead"

/** A config client whose first request opens the port, as the real client's does. The reconnect
 *  rule itself is `createReconnectRead`'s, tested beside it. */
function harness(fetchImpl?: () => Promise<string>) {
	const config = { onConnected: new EventHandler<void>(), onUpdate: new EventHandler<ConfigProp>() }
	let open = false
	const reads: PromiseWithResolvers<string>[] = []
	const fetch = vi.fn(
		fetchImpl ??
			(() => {
				if (!open) {
					open = true
					config.onConnected.invoke()
				}
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
		read: reader.read,
		dispose: reader.dispose,
		update: (key: string) => config.onUpdate.invoke({ key, value: true } as ConfigProp),
	}
}

describe("useConfigRead", () => {
	test("the mount's read opens the port and lands once", async () => {
		const h = harness()
		void h.read()
		h.reads[0].resolve("a")
		await flushPromises()
		expect(h.fetch).toHaveBeenCalledTimes(1)
		expect(h.land).toHaveBeenCalledExactlyOnceWith("a", expect.any(Function))
	})

	test("a reconnect reads again, and only the newest read lands", async () => {
		const h = harness()
		void h.read()
		h.config.onConnected.invoke()
		h.reads[1].resolve("new")
		await flushPromises()
		h.reads[0].resolve("old")
		await flushPromises()
		expect(h.fetch).toHaveBeenCalledTimes(2)
		expect(h.land).toHaveBeenCalledExactlyOnceWith("new", expect.any(Function))
	})

	test("a failed fetch lands nothing, and the first open reads again", async () => {
		const reads: PromiseWithResolvers<string>[] = []
		const h = harness(() => {
			const read = Promise.withResolvers<string>()
			reads.push(read)
			return read.promise
		})
		void h.read()
		reads[0].reject(new Error("disconnected"))
		await flushPromises()
		expect(h.land).not.toHaveBeenCalled()
		h.config.onConnected.invoke()
		reads[1].resolve("b")
		await flushPromises()
		expect(h.land).toHaveBeenCalledExactlyOnceWith("b", expect.any(Function))
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

	test("an update during a superseded read is not reported to the newest", async () => {
		const h = harness()
		void h.read()
		h.update("theme")
		h.config.onConnected.invoke()
		h.reads[1].resolve("b")
		await flushPromises()
		expect(h.land).toHaveBeenCalledExactlyOnceWith("b", expect.any(Function))
		expect(h.land.mock.calls[0][1]("theme")).toBe(false)
	})

	test("a fetch that throws synchronously ends the read", async () => {
		const h = harness(() => {
			throw new Error("Failed to connect")
		})
		await expect(h.read()).resolves.toBeUndefined()
		expect(h.land).not.toHaveBeenCalled()
	})

	test("a land that throws rejects the read", async () => {
		const h = harness()
		h.land.mockImplementation(() => {
			throw new Error("land threw")
		})
		const read = h.read()
		h.reads[0].resolve("a")
		await expect(read).rejects.toThrow("land threw")
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
})
