import { describe, expect, test } from "vitest"
import type { ConfigProp } from "./config"
import { ConfigStore } from "./store"

/**
 * Seed an in-memory `chrome.storage.local` with `stored` (or empty), then the
 * ConfigStore reads/writes through it. The shared vitest setup stubs `chrome`
 * with a non-functional `storage: {}`; we install a real `.local` per test
 * (before `new ConfigStore()`, which captures `chrome.storage.local`).
 */
function withStored(stored: Record<string, unknown> | undefined): void {
	const mem: Record<string, string> = {}
	if (stored !== undefined) mem["nulo:config"] = JSON.stringify(stored)
	;(chrome.storage as { local: unknown }).local = {
		get: async (key: string) => (key in mem ? { [key]: mem[key] } : {}),
		set: async (obj: Record<string, string>) => {
			Object.assign(mem, obj)
		},
	}
}

describe("ConfigStore — persisted-value validation", () => {
	test("ignores an out-of-domain stored value, applies valid overrides", async () => {
		withStored({ theme: "bogus", sidePanel: true })
		const store = new ConfigStore()
		await store.load()
		expect(store.get("theme")).toBe("system") // 'bogus' rejected → default kept
		expect(store.get("sidePanel")).toBe(true) // valid override applied
	})

	test("applies + emits a persisted defaultExplorer:null (the prior typeof check wrongly rejected it)", async () => {
		withStored({ defaultExplorer: null })
		const store = new ConfigStore()
		const emitted: ConfigProp[] = []
		store.onUpdate.add((p) => emitted.push(p))
		await store.load()
		expect(store.get("defaultExplorer")).toBe(null)
		expect(emitted.some((e) => e.key === "defaultExplorer" && e.value === null)).toBe(true)
	})

	test("a corrupted stored strictSecurityMode string cannot flip the security default", async () => {
		withStored({ strictSecurityMode: "false" })
		const store = new ConfigStore()
		await store.load()
		expect(store.get("strictSecurityMode")).toBe(true) // string rejected → default true kept
	})

	test("set() throws on an out-of-domain value and does not mutate", async () => {
		withStored(undefined)
		const store = new ConfigStore()
		await store.load()
		await expect(store.set("theme", "bogus" as never)).rejects.toThrow(/Invalid config value/)
		expect(store.get("theme")).toBe("system")
	})

	test("set() persists + emits a valid value", async () => {
		withStored(undefined)
		const store = new ConfigStore()
		const emitted: ConfigProp[] = []
		store.onUpdate.add((p) => emitted.push(p))
		await store.set("theme", "dark")
		expect(store.get("theme")).toBe("dark")
		expect(emitted).toContainEqual({ key: "theme", value: "dark" })
	})
})

describe("ConfigStore — apply/set serialization", () => {
	test("a set() racing reset()'s parked persist is not clobbered in storage", async () => {
		// Manufacture the interleave: park reset()'s final persist (the first
		// storage write after this test arms), fire a concurrent set(), then
		// release the park. An unlocked apply persists its pre-set snapshot
		// AFTER set()'s write, leaving storage stale; the shared lock instead
		// queues set() behind the whole apply, so the fresher value lands last.
		const mem: Record<string, string> = {}
		let parked: (() => void) | null = null
		let armed = false
		;(chrome.storage as { local: unknown }).local = {
			get: async (key: string) => (key in mem ? { [key]: mem[key] } : {}),
			set: async (obj: Record<string, string>) => {
				if (armed && parked === null) {
					await new Promise<void>((resolve) => {
						parked = resolve
					})
				}
				Object.assign(mem, obj)
			},
		}
		const store = new ConfigStore()
		await store.load()
		await store.set("theme", "dark")

		armed = true
		const resetRun = store.reset()
		// Let reset reach its parked persist before firing the racing set.
		await new Promise((resolve) => setTimeout(resolve, 0))
		const setRun = store.set("theme", "light")
		await new Promise((resolve) => setTimeout(resolve, 0))
		;(parked as (() => void) | null)?.()
		await Promise.all([resetRun, setRun])

		expect(store.get("theme")).toBe("light")
		expect(JSON.parse(mem["nulo:config"]).theme).toBe("light")
	})
})

describe("ConfigStore — persist before announce", () => {
	/** An in-memory `chrome.storage.local` whose next `failWrites` writes throw. */
	function failingStorage(stored?: Record<string, unknown>) {
		const mem: Record<string, string> = {}
		if (stored) mem["nulo:config"] = JSON.stringify(stored)
		const io = { failWrites: 0, writes: 0 }
		;(chrome.storage as { local: unknown }).local = {
			get: async (key: string) => (key in mem ? { [key]: mem[key] } : {}),
			set: async (obj: Record<string, string>) => {
				if (io.failWrites > 0) {
					io.failWrites--
					throw new Error("quota exceeded")
				}
				io.writes++
				Object.assign(mem, obj)
			},
		}
		return { io, stored: () => JSON.parse(mem["nulo:config"]) as Record<string, unknown> }
	}

	test("a set() whose write fails keeps the stored value and announces nothing; the retry writes once", async () => {
		const { io, stored } = failingStorage({ showFiatValues: true })
		const store = new ConfigStore()
		await store.load()
		const emitted: ConfigProp[] = []
		store.onUpdate.add((p) => emitted.push(p))

		io.failWrites = 1
		await expect(store.set("showFiatValues", false)).rejects.toThrow("quota exceeded")
		expect(store.get("showFiatValues")).toBe(true)
		expect(emitted).toEqual([])

		await store.set("showFiatValues", false)
		expect(store.get("showFiatValues")).toBe(false)
		expect(stored().showFiatValues).toBe(false)
		expect(emitted).toEqual([{ key: "showFiatValues", value: false }])
	})

	test("a reset() whose write fails keeps the stored values and announces nothing; the retry writes once", async () => {
		const { io, stored } = failingStorage({ theme: "dark" })
		const store = new ConfigStore()
		await store.load()
		const emitted: ConfigProp[] = []
		store.onUpdate.add((p) => emitted.push(p))

		io.failWrites = 1
		await expect(store.reset()).rejects.toThrow("quota exceeded")
		expect(store.get("theme")).toBe("dark")
		expect(emitted).toEqual([])

		await store.reset()
		expect(store.get("theme")).toBe("system")
		expect(stored().theme).toBe("system")
		expect(emitted).toEqual([{ key: "theme", value: "system" }])
	})

	test("a load() whose write-back fails still holds the stored values", async () => {
		const { io } = failingStorage({ developerMode: true, theme: "dark" })
		const store = new ConfigStore()
		io.failWrites = 1
		await expect(store.load()).rejects.toThrow("quota exceeded")
		expect(store.get("developerMode")).toBe(true)
		expect(store.get("theme")).toBe("dark")
		expect(io.writes).toBe(0)
	})
})
