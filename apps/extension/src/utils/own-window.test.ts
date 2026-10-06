import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { captureOwnWindow, closeOwnWindow, moveToOwnWindow, ownWindowRoute, postAuthRoute, releaseOwnWindow } from "./own-window"

const EXPORT = "/popup/settings/security/export/full"
const BROWSER = { left: 100, top: 50, width: 1200, height: 900, type: "normal" }

let create: ReturnType<typeof vi.fn>
let getCurrent: ReturnType<typeof vi.fn>
let closeDocument: ReturnType<typeof vi.spyOn>

beforeEach(() => {
	create = vi.fn().mockResolvedValue({ id: 7 })
	getCurrent = vi.fn().mockResolvedValue(BROWSER)
	vi.stubGlobal("chrome", {
		runtime: { getURL: (path: string) => `moz-extension://nulo/${path}` },
		windows: { create, getCurrent },
	})
	closeDocument = vi.spyOn(window, "close").mockImplementation(() => undefined)
})

afterEach(() => {
	releaseOwnWindow()
	closeDocument.mockRestore()
	vi.unstubAllGlobals()
})

describe("own window identity", () => {
	test("a marked export or import URL is an own window, recorded without its marker", () => {
		captureOwnWindow(`#${EXPORT}?window=own`)
		expect(ownWindowRoute()).toBe(EXPORT)

		captureOwnWindow("#/popup/import?option=full_backup&window=own&name=Alice")
		expect(ownWindowRoute()).toBe("/popup/import?option=full_backup&name=Alice")
	})

	test("an unmarked URL, another marker value or any other route is not", () => {
		for (const hash of [`#${EXPORT}`, `#${EXPORT}?window=tab`, "#/popup/general?window=own", "#/windows/passkey?window=own"]) {
			captureOwnWindow(hash)
			expect(ownWindowRoute(), hash).toBeUndefined()
		}
	})

	test("after auth: a dApp window's page first, then the own-window route, then Home", () => {
		expect(postAuthRoute()).toBe("/popup/general")
		captureOwnWindow(`#${EXPORT}?window=own`)
		expect(postAuthRoute()).toBe(EXPORT)
		expect(postAuthRoute("")).toBe(EXPORT)
		expect(postAuthRoute("/windows/execute?id=1")).toBe("/windows/execute?id=1")
	})

	test("a released window is an ordinary page again", async () => {
		captureOwnWindow(`#${EXPORT}?window=own`)
		releaseOwnWindow()

		expect(ownWindowRoute()).toBeUndefined()
		expect(postAuthRoute()).toBe("/popup/general")
		getCurrent.mockResolvedValue({ type: "popup" })
		expect(await closeOwnWindow()).toBe(false)
	})
})

describe("moving to an own window", () => {
	test("opens the marked route in a popup-sized window centred on this browser window, then closes the panel", async () => {
		expect(await moveToOwnWindow("/popup/import?option=full_backup")).toBe(true)

		expect(create).toHaveBeenCalledWith({
			type: "popup",
			url: "moz-extension://nulo/src/popup/index.html#/popup/import?option=full_backup&window=own",
			width: 380,
			height: 660,
			left: 510,
			top: 170,
		})
		expect(closeDocument).toHaveBeenCalledTimes(1)
	})

	test("a refused position is retried once with the size only", async () => {
		create.mockRejectedValueOnce(new Error("Invalid value for bounds"))

		expect(await moveToOwnWindow(EXPORT)).toBe(true)
		expect(create).toHaveBeenCalledTimes(2)
		expect(create.mock.calls[1]?.[0]).toEqual({
			type: "popup",
			url: `moz-extension://nulo/src/popup/index.html#${EXPORT}?window=own`,
			width: 380,
			height: 660,
		})
	})

	test("a window that cannot open leaves the panel open", async () => {
		create.mockRejectedValue(new Error("no"))

		expect(await moveToOwnWindow(EXPORT)).toBe(false)
		expect(create).toHaveBeenCalledTimes(2)
		expect(closeDocument).not.toHaveBeenCalled()
	})

	test("without a browser window to centre on, a refusal is not retried", async () => {
		getCurrent.mockRejectedValue(new Error("no window"))
		create.mockRejectedValue(new Error("no"))

		expect(await moveToOwnWindow(EXPORT)).toBe(false)
		expect(create).toHaveBeenCalledTimes(1)
	})
})

describe("closing an own window", () => {
	test("an own window in a popup-type window closes", async () => {
		captureOwnWindow(`#${EXPORT}?window=own`)
		getCurrent.mockResolvedValue({ type: "popup" })

		expect(await closeOwnWindow()).toBe(true)
		expect(closeDocument).toHaveBeenCalledTimes(1)
	})

	test("the same URL in a tab keeps ordinary back", async () => {
		captureOwnWindow(`#${EXPORT}?window=own`)
		getCurrent.mockResolvedValue({ type: "normal" })

		expect(await closeOwnWindow()).toBe(false)
		expect(closeDocument).not.toHaveBeenCalled()
	})

	test("a page that is not an own window never closes, and never asks", async () => {
		expect(await closeOwnWindow()).toBe(false)
		expect(getCurrent).not.toHaveBeenCalled()
	})
})
