import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
	changedGetStarted,
	combineHoldings,
	type GetStartedFlags,
	type GetStartedInput,
	gasHoldings,
	getStartedKeys,
	getStartedView,
	markGetStarted,
	readGetStarted,
} from "./get-started"

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
	test("the flags are the profile's own keys", () => {
		expect(getStartedKeys("p1")).toEqual([
			"nulo:ui:getStartedPhraseSaved@p1",
			"nulo:ui:getStartedBackupSaved@p1",
			"nulo:ui:getStartedAztecOpened@p1",
			"nulo:ui:getStartedFeeJuiceHeld@p1",
			"nulo:ui:getStartedHidden@p1",
			"nulo:ui:profileImported@p1",
			"nulo:ui:profileNotFirst@p1",
		])
	})

	test("one storage read answers every flag, and nothing stored reads as nothing done", async () => {
		expect(await readGetStarted("p1")).toEqual({
			phraseSaved: false,
			backupSaved: false,
			aztecOpened: false,
			feeJuiceHeld: false,
			hidden: false,
			imported: false,
			notFirst: false,
		})
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
		expect(await readGetStarted("p1")).toEqual({
			phraseSaved: false,
			backupSaved: false,
			aztecOpened: true,
			feeJuiceHeld: false,
			hidden: false,
			imported: false,
			notFirst: false,
		})
	})

	test("a mark writes `true` under the profile's key, and reads back as done", async () => {
		await markGetStarted("p1", "hidden")
		expect(set).toHaveBeenCalledWith({ "nulo:ui:getStartedHidden@p1": true })
		expect((await readGetStarted("p1")).hidden).toBe(true)
		expect((await readGetStarted("p2")).hidden).toBe(false)
	})

	test("a change event's own values name the profile's flags; other keys and profiles are left out", () => {
		const changes = {
			"nulo:ui:getStartedAztecOpened@p1": { newValue: true, oldValue: undefined },
			"nulo:ui:getStartedHidden@p1": { oldValue: true },
			"nulo:ui:getStartedPhraseSaved@p1": { newValue: "true" },
			"nulo:ui:getStartedBackupSaved@p2": { newValue: true },
			"nulo:config": { newValue: "{}" },
		}
		expect(changedGetStarted("p1", changes)).toEqual({ aztecOpened: true, hidden: false, phraseSaved: false })
		expect(changedGetStarted("p3", changes)).toEqual({})
	})

	test("a failed write resolves and leaves a debug line carrying the error", async () => {
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
		const error = new Error("quota")
		set.mockRejectedValueOnce(error)
		await expect(markGetStarted("p1", "phraseSaved")).resolves.toBeUndefined()
		expect(debug).toHaveBeenCalledWith("get-started flag write failed", { error })
	})
})

describe("get started view (pure)", () => {
	const NONE = {
		phraseSaved: false,
		backupSaved: false,
		aztecOpened: false,
		feeJuiceHeld: false,
		hidden: false,
		imported: false,
		notFirst: false,
	}
	const base = { type: "password" as const, flags: NONE, funds: "none" as const, feeJuice: "none" as const, prestoReached: false }
	const view = (over: Partial<GetStartedInput> = {}, flags: Partial<GetStartedFlags> = {}) =>
		getStartedView({ ...base, ...over, flags: { ...NONE, ...flags } })

	/** The drawn steps, a done one marked: `["phrase done", "aztec", ...]`. */
	const drawn = (over: Partial<GetStartedInput> = {}, flags: Partial<GetStartedFlags> = {}) =>
		view(over, flags)?.steps.map(({ item, done }) => (done ? `${item} done` : item))

	test("a new password wallet: the phrase first, then Aztec, Fee Juice and Presto, with Hide", () => {
		expect(view()).toEqual({
			banner: false,
			steps: [
				{ item: "phrase", done: false },
				{ item: "aztec", done: false },
				{ item: "feeJuice", done: false },
				{ item: "presto", done: false },
			],
			canHide: true,
		})
	})

	test("a new passkey wallet: the backup step in the phrase's place", () => {
		expect(drawn({ type: "passkey" })).toEqual(["backup", "aztec", "feeJuice", "presto"])
	})

	test("a funded password wallet keeps the phrase as the card's step 1, with no banner", () => {
		expect(view({ funds: "some" })).toEqual({
			banner: false,
			steps: [
				{ item: "phrase", done: false },
				{ item: "aztec", done: false },
				{ item: "feeJuice", done: false },
				{ item: "presto", done: false },
			],
			canHide: true,
		})
	})

	test("never a banner while funds are unknown: nothing shows until they are read", () => {
		expect(view({ funds: "unknown" })).toBeNull()
	})

	test("never a banner for a passkey wallet, funded or not", () => {
		expect(view({ type: "passkey", funds: "some" })?.banner).toBe(false)
		expect(drawn({ type: "passkey", funds: "some" })).toEqual(["backup", "aztec", "feeJuice", "presto"])
	})

	test("null until the flags, the profile type and the Presto flag are read", () => {
		expect(getStartedView({ ...base, flags: undefined })).toBeNull()
		expect(getStartedView({ ...base, type: undefined })).toBeNull()
		expect(getStartedView({ ...base, prestoReached: undefined })).toBeNull()
	})

	test("a saved phrase checks the phrase step in place", () => {
		expect(drawn({ funds: "some" }, { phraseSaved: true })).toEqual(["phrase done", "aztec", "feeJuice", "presto"])
	})

	test("a full backup checks the passkey backup step", () => {
		expect(drawn({ type: "passkey" }, { backupSaved: true })).toEqual(["backup done", "aztec", "feeJuice", "presto"])
	})

	test("an opened Aztec page, a Fee Juice balance and a reached Presto each check their step; an unread balance does not", () => {
		expect(drawn({}, { aztecOpened: true })).toEqual(["phrase", "aztec done", "feeJuice", "presto"])
		expect(drawn({ feeJuice: "some" })).toEqual(["phrase", "aztec", "feeJuice done", "presto"])
		expect(drawn({ feeJuice: "unknown" })).toEqual(["phrase", "aztec", "feeJuice", "presto"])
		expect(drawn({ prestoReached: true })).toEqual(["phrase", "aztec", "feeJuice", "presto done"])
	})

	test("Fee Juice once held stays done: a later empty read, as on a new chain, does not reopen it", () => {
		expect(drawn({ feeJuice: "none" }, { feeJuiceHeld: true })).toEqual(["phrase", "aztec", "feeJuice done", "presto"])
		expect(drawn({ type: "passkey", feeJuice: "none" }, { feeJuiceHeld: true })).toEqual(["backup", "aztec", "feeJuice done", "presto"])
	})

	test("Hide offers while a step it removes is listed, done or not", () => {
		expect(view({}, { phraseSaved: true, aztecOpened: true })?.canHide).toBe(true)
		expect(view({ feeJuice: "some", prestoReached: true }, { aztecOpened: true })?.canHide).toBe(true)
	})

	test("a hidden password card keeps only the phrase step, which cannot be hidden, and the banner takes it once funded", () => {
		expect(view({}, { hidden: true })).toEqual({ banner: false, steps: [{ item: "phrase", done: false }], canHide: false })
		expect(view({ funds: "some" }, { hidden: true })).toEqual({ banner: true, steps: [], canHide: false })
		expect(view({}, { hidden: true, phraseSaved: true })).toEqual({ banner: false, steps: [], canHide: false })
		expect(view({ funds: "some" }, { hidden: true, phraseSaved: true })).toEqual({ banner: false, steps: [], canHide: false })
	})

	test("a hidden passkey card is gone, backup step included, and a funded one gets no banner", () => {
		expect(view({ type: "passkey" }, { hidden: true })).toEqual({ banner: false, steps: [], canHide: false })
		expect(view({ type: "passkey", funds: "some" }, { hidden: true })).toEqual({ banner: false, steps: [], canHide: false })
	})

	test("an imported profile shows no card and no banner, password or passkey, funded or not", () => {
		const nothing = { banner: false, steps: [], canHide: false }
		expect(view({}, { imported: true })).toEqual(nothing)
		expect(view({ funds: "some" }, { imported: true })).toEqual(nothing)
		expect(view({ type: "passkey" }, { imported: true })).toEqual(nothing)
	})

	test("a later password profile shows its phrase alone, with no Hide and no banner, funded or not", () => {
		const phraseAlone = { banner: false, steps: [{ item: "phrase", done: false }], canHide: false }
		expect(view({}, { notFirst: true })).toEqual(phraseAlone)
		expect(view({ funds: "some" }, { notFirst: true })).toEqual(phraseAlone)
		expect(view({}, { notFirst: true, phraseSaved: true })).toEqual({ banner: false, steps: [], canHide: false })
	})

	test("a later passkey profile shows no card and no banner", () => {
		expect(view({ type: "passkey" }, { notFirst: true })).toEqual({ banner: false, steps: [], canHide: false })
	})

	test("no card once every listed step is done; an unsaved phrase keeps it up, funded or not", () => {
		const done = view({ feeJuice: "some", prestoReached: true }, { phraseSaved: true, aztecOpened: true })
		expect(done).toEqual({ banner: false, steps: [], canHide: false })
		const passkey = view({ type: "passkey", prestoReached: true }, { backupSaved: true, aztecOpened: true, feeJuiceHeld: true })
		expect(passkey).toEqual({ banner: false, steps: [], canHide: false })
		const funded = view({ funds: "some", feeJuice: "some", prestoReached: true }, { aztecOpened: true })
		expect(funded).toEqual({
			banner: false,
			steps: [
				{ item: "phrase", done: false },
				{ item: "aztec", done: true },
				{ item: "feeJuice", done: true },
				{ item: "presto", done: true },
			],
			canHide: true,
		})
	})
})

describe("holdings", () => {
	test("any positive side holds funds; an unknown side waits; else none", () => {
		expect(combineHoldings("some", "unknown")).toBe("some")
		expect(combineHoldings("unknown", "some")).toBe("some")
		expect(combineHoldings("none", "unknown")).toBe("unknown")
		expect(combineHoldings("none", "none")).toBe("none")
	})

	test("Fee Juice: a positive public or private amount holds it", () => {
		const slice = (publicFeeJuice: string | null, privateFeeJuice: string | null) => ({
			display: { publicFeeJuice, privateFeeJuice },
			status: "ready",
		})
		expect(gasHoldings(slice("1", "0"))).toBe("some")
		expect(gasHoldings(slice("0", "5"))).toBe("some")
		expect(gasHoldings(slice("0", "0"))).toBe("none")
		expect(gasHoldings(slice(null, null))).toBe("none")
		expect(gasHoldings(slice("not a number", "0"))).toBe("none")
	})

	test("Fee Juice: unknown until the first read; a failed first read claims nothing held", () => {
		expect(gasHoldings(undefined)).toBe("unknown")
		expect(gasHoldings({ status: "fetching" })).toBe("unknown")
		expect(gasHoldings({ status: "degraded" })).toBe("none")
	})
})
