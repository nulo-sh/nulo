import { EventHandler } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"
import { sealOnRowKeysReady } from "./seal-on-unlock"

const MESSAGE = "sealing the profile's plaintext rows failed; the next worker retries"

describe("sealOnRowKeysReady", () => {
	test("a failing pass starts in the event's turn and warns once with its message and the error", async () => {
		const profiles = { onRowKeysReady: new EventHandler<string>() }
		const warn = vi.fn()
		const error = new Error("quota")
		const seal = vi.fn(async () => {
			throw error
		})
		sealOnRowKeysReady(profiles, warn, MESSAGE, seal)

		profiles.onRowKeysReady.invoke("p1")
		expect(seal).toHaveBeenCalledExactlyOnceWith("p1")
		await vi.waitFor(() => expect(warn).toHaveBeenCalledExactlyOnceWith(MESSAGE, { error }))
	})

	test("a pass that succeeds warns nothing", async () => {
		const profiles = { onRowKeysReady: new EventHandler<string>() }
		const warn = vi.fn()
		let done = false
		sealOnRowKeysReady(profiles, warn, MESSAGE, async () => {
			done = true
		})

		profiles.onRowKeysReady.invoke("p1")
		await vi.waitFor(() => expect(done).toBe(true))
		await Promise.resolve()
		expect(warn).not.toHaveBeenCalled()
	})

	test("no profile service subscribes nothing", () => {
		const seal = vi.fn(async () => {})
		expect(() => sealOnRowKeysReady(null, vi.fn(), MESSAGE, seal)).not.toThrow()
		expect(seal).not.toHaveBeenCalled()
	})
})
