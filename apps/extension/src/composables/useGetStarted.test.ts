import { flushPromises } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { effectScope, nextTick, ref } from "vue"
import { useGetStarted } from "./useGetStarted"

type Listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void

let stored: Record<string, unknown>
let listeners: Set<Listener>
let pendingReads: Array<{ keys: string[]; resolve: () => void }>
let holdReads: boolean
const get = vi.fn((keys: string[] | string) => {
	const wanted = typeof keys === "string" ? [keys] : keys
	const answer = () => Object.fromEntries(wanted.filter((k) => k in stored).map((k) => [k, stored[k]]))
	if (!holdReads || !Array.isArray(keys)) return Promise.resolve(answer())
	return new Promise((resolve) => pendingReads.push({ keys: wanted, resolve: () => resolve(answer()) }))
})
const set = vi.fn(async (items: Record<string, unknown>) => {
	Object.assign(stored, items)
})

beforeEach(() => {
	stored = {}
	listeners = new Set()
	pendingReads = []
	holdReads = false
	get.mockClear()
	set.mockClear()
	vi.stubGlobal("chrome", {
		storage: {
			local: { get, set },
			onChanged: { addListener: (l: Listener) => listeners.add(l), removeListener: (l: Listener) => listeners.delete(l) },
		},
	})
})
afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

const KEY = (flag: string, id: string) => `nulo:ui:getStarted${flag}@${id}`
const fire = (changes: Record<string, unknown>) => {
	for (const l of [...listeners]) l(Object.fromEntries(Object.keys(changes).map((k) => [k, { newValue: changes[k] }])), "local")
}
const flagReads = () => get.mock.calls.filter(([keys]) => Array.isArray(keys)).length

function mountHook(initial: string | undefined) {
	const profileId = ref(initial)
	const scope = effectScope()
	const hook = scope.run(() => useGetStarted({ profileId: () => profileId.value }))
	if (!hook) throw new Error("no hook")
	return { hook, profileId, scope }
}

describe("useGetStarted", () => {
	test("flags are undefined until the first read, then the profile's own", async () => {
		stored[KEY("AztecOpened", "p1")] = true
		const { hook } = mountHook("p1")
		expect(hook.flags.value).toBeUndefined()
		await flushPromises()
		expect(hook.flags.value).toEqual({
			phraseSaved: false,
			backupSaved: false,
			aztecOpened: true,
			hidden: false,
			imported: false,
			notFirst: false,
		})
		hook.dispose()
	})

	test("no profile, no read and no flags", async () => {
		const { hook } = mountHook(undefined)
		await flushPromises()
		expect(flagReads()).toBe(0)
		expect(hook.flags.value).toBeUndefined()
		hook.dispose()
	})

	test("a switch hides the old profile's flags at once", async () => {
		stored[KEY("Hidden", "p1")] = true
		const { hook, profileId } = mountHook("p1")
		await flushPromises()
		expect(hook.flags.value?.hidden).toBe(true)
		holdReads = true
		profileId.value = "p2"
		await nextTick()
		expect(hook.flags.value).toBeUndefined()
		hook.dispose()
	})

	test("a switch whose old read lands last never shows the old profile's flags for the new one", async () => {
		stored[KEY("Hidden", "p1")] = true
		holdReads = true
		const { hook, profileId } = mountHook("p1")
		await flushPromises()
		profileId.value = "p2"
		await flushPromises()
		expect(pendingReads.map((r) => r.keys[0])).toEqual([KEY("PhraseSaved", "p1"), KEY("PhraseSaved", "p2")])
		pendingReads[1].resolve()
		await flushPromises()
		pendingReads[0].resolve()
		await flushPromises()
		expect(hook.flags.value?.hidden).toBe(false)
		hook.dispose()
	})

	test("a change to one of its keys takes the event's value, with no read that could answer the old one", async () => {
		const { hook } = mountHook("p1")
		await flushPromises()
		const before = flagReads()
		// Storage still answers the old value, as a read issued from the listener can on Firefox.
		fire({ [KEY("PhraseSaved", "p1")]: true })
		await flushPromises()
		expect(hook.flags.value?.phraseSaved).toBe(true)
		expect(flagReads()).toBe(before)
		hook.dispose()
	})

	test("a removed key reads as not done", async () => {
		stored[KEY("Hidden", "p1")] = true
		const { hook } = mountHook("p1")
		await flushPromises()
		fire({ [KEY("Hidden", "p1")]: undefined })
		await flushPromises()
		expect(hook.flags.value?.hidden).toBe(false)
		hook.dispose()
	})

	test("a change while the first read is out survives that read's older answer", async () => {
		holdReads = true
		const { hook } = mountHook("p1")
		await flushPromises()
		fire({ [KEY("AztecOpened", "p1")]: true })
		pendingReads[0].resolve()
		await flushPromises()
		expect(hook.flags.value).toEqual({
			phraseSaved: false,
			backupSaved: false,
			aztecOpened: true,
			hidden: false,
			imported: false,
			notFirst: false,
		})
		hook.dispose()
	})

	test("a change to another profile's key, or to another area, changes nothing", async () => {
		const { hook } = mountHook("p1")
		await flushPromises()
		const before = flagReads()
		fire({ [KEY("PhraseSaved", "p2")]: true, "nulo:config": "{}" })
		for (const l of [...listeners]) l({ [KEY("PhraseSaved", "p1")]: { newValue: true } }, "session")
		await flushPromises()
		expect(flagReads()).toBe(before)
		expect(hook.flags.value?.phraseSaved).toBe(false)
		hook.dispose()
	})

	test("mark writes the active profile's flag", async () => {
		const { hook, profileId } = mountHook("p1")
		await flushPromises()
		await hook.mark("aztecOpened")
		expect(set).toHaveBeenCalledWith({ [KEY("AztecOpened", "p1")]: true })
		profileId.value = undefined
		await hook.mark("hidden")
		expect(set).toHaveBeenCalledTimes(1)
		hook.dispose()
	})

	test("a failed read shows every reminder rather than none", async () => {
		vi.spyOn(console, "debug").mockImplementation(() => {})
		get.mockImplementationOnce(() => Promise.reject(new Error("storage"))).mockImplementationOnce(() =>
			Promise.reject(new Error("storage")),
		)
		const { hook } = mountHook("p1")
		await flushPromises()
		expect(hook.flags.value).toEqual({
			phraseSaved: false,
			backupSaved: false,
			aztecOpened: false,
			hidden: false,
			imported: false,
			notFirst: false,
		})
		hook.dispose()
	})

	test("after dispose the listener is gone", async () => {
		const { hook } = mountHook("p1")
		await flushPromises()
		hook.dispose()
		expect(listeners.size).toBe(0)
	})

	test("a read in flight at dispose is dropped", async () => {
		holdReads = true
		stored[KEY("Hidden", "p1")] = true
		const { hook } = mountHook("p1")
		await flushPromises()
		hook.dispose()
		pendingReads[0].resolve()
		await flushPromises()
		expect(hook.flags.value).toBeUndefined()
	})

	test("after dispose a profile change reads nothing", async () => {
		const { hook, profileId } = mountHook("p1")
		await flushPromises()
		hook.dispose()
		const before = flagReads()
		profileId.value = "p2"
		await flushPromises()
		expect(flagReads()).toBe(before)
	})
})
