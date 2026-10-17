import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { getStartedKeys, markGetStarted, readGetStarted } from "./get-started"

let stored: Record<string, unknown>
const get = vi.fn(async (keys?: string | string[]) => {
	const wanted = typeof keys === "string" ? [keys] : (keys ?? Object.keys(stored))
	return Object.fromEntries(wanted.filter((k) => k in stored).map((k) => [k, stored[k]]))
})
const set = vi.fn(async (items: Record<string, unknown>) => {
	Object.assign(stored, items)
})

beforeEach(() => {
	stored = {}
	get.mockClear()
	set.mockClear()
	vi.stubGlobal("chrome", { storage: { local: { get, set } } })
})
afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe("get started flags (storage)", () => {
	test("the four flags are the profile's own keys", () => {
		expect(getStartedKeys("p1")).toEqual([
			"nulo:ui:getStartedPhraseSaved@p1",
			"nulo:ui:getStartedBackupSaved@p1",
			"nulo:ui:getStartedAztecOpened@p1",
			"nulo:ui:getStartedHidden@p1",
		])
	})

	test("one storage read answers all four, and nothing stored reads as nothing done", async () => {
		expect(await readGetStarted("p1")).toEqual({ phraseSaved: false, backupSaved: false, aztecOpened: false, hidden: false })
		const reads = get.mock.calls.filter(([keys]) => Array.isArray(keys))
		expect(reads).toEqual([[getStartedKeys("p1")]])
	})

	test("only a stored `true` counts: a string or a number reads as not done", async () => {
		stored = {
			"nulo:ui:getStartedPhraseSaved@p1": "true",
			"nulo:ui:getStartedBackupSaved@p1": 1,
			"nulo:ui:getStartedAztecOpened@p1": true,
			"nulo:ui:getStartedHidden@p2": true,
		}
		expect(await readGetStarted("p1")).toEqual({ phraseSaved: false, backupSaved: false, aztecOpened: true, hidden: false })
	})

	test("a mark writes `true` under the profile's key, and reads back as done", async () => {
		await markGetStarted("p1", "hidden")
		expect(set).toHaveBeenCalledWith({ "nulo:ui:getStartedHidden@p1": true })
		expect((await readGetStarted("p1")).hidden).toBe(true)
		expect((await readGetStarted("p2")).hidden).toBe(false)
	})

	test("a failed write resolves and leaves a debug line carrying the error", async () => {
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
		const error = new Error("quota")
		set.mockRejectedValueOnce(error)
		await expect(markGetStarted("p1", "phraseSaved")).resolves.toBeUndefined()
		expect(debug).toHaveBeenCalledWith("get-started flag write failed", { error })
	})
})
