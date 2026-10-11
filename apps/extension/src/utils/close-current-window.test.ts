import { afterEach, describe, expect, test, vi } from "vitest"
import { collectUnhandledRejections } from "../../tests/helpers/unhandled-rejections"
import { closeCurrentWindow } from "./close-current-window"

type ListFailure = "reject" | "throw" | null

/** A `chrome.windows` for window 7 whose `remove` rejects, as both browsers' does, for a window that
 *  is not open. No handler is attached to any promise it returns, so only the code under test can
 *  keep a rejection from being collected. */
function stubWindows(open: number[], fail: { remove?: boolean; list?: ListFailure } = {}) {
	const live = new Set(open)
	const refused: Error[] = []
	vi.stubGlobal("chrome", {
		windows: {
			getCurrent: (_query: unknown, callback: (window: { id: number }) => void) => callback({ id: 7 }),
			remove: (id: number) => {
				if (fail.remove || !live.has(id)) {
					refused.push(new Error(`Invalid window ID: ${id}`))
					return Promise.reject(refused.at(-1))
				}
				live.delete(id)
				return Promise.resolve()
			},
			getAll: () => {
				if (fail.list === "throw") throw new Error("Extension context invalidated.")
				if (fail.list === "reject") return Promise.reject(new Error("Extension context invalidated."))
				return Promise.resolve([...live].map((id) => ({ id })))
			},
		},
	})
	return { live, refused }
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe("closeCurrentWindow", () => {
	test("a window another closer removed first closes quietly", async () => {
		const error = vi.spyOn(console, "error")
		const windows = stubWindows([])
		const seen = await collectUnhandledRejections(async () => closeCurrentWindow())
		expect(windows.refused.map((e) => e.message)).toEqual(["Invalid window ID: 7"])
		expect(seen).toEqual([])
		expect(error).not.toHaveBeenCalled()
	})

	test("an open window is removed once", async () => {
		const windows = stubWindows([7])
		const seen = await collectUnhandledRejections(async () => closeCurrentWindow())
		expect(windows.live.size).toBe(0)
		expect(windows.refused).toEqual([])
		expect(seen).toEqual([])
	})

	test.each([
		["the listing still shows the window", null],
		["the listing rejects", "reject"],
		["the listing throws", "throw"],
	] as const)("a remove that fails unconfirmed still rejects with the browser's error: %s", async (_, list) => {
		const error = vi.spyOn(console, "error")
		const windows = stubWindows([7], { remove: true, list })
		const seen = await collectUnhandledRejections(async () => closeCurrentWindow())
		expect(windows.refused).toHaveLength(1)
		expect(seen).toHaveLength(1)
		expect(seen[0]).toBe(windows.refused[0])
		expect(error).not.toHaveBeenCalled()
	})
})
