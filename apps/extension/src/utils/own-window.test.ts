import { flushPromises } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createMemoryHistory, createRouter } from "vue-router"
import {
	captureOwnWindow,
	closeOwnWindow,
	followOwnRoute,
	isCardWindow,
	leavePanelFor,
	moveToOwnWindow,
	ownWindowRoute,
	postAuthRoute,
	releaseOwnWindow,
	returnToPanel,
} from "./own-window"
import { HANDBACK_KEY } from "./panel-handback"
import { deferred } from "@nulo/wallet-core/utils"

const surface = vi.hoisted(() => ({ inPanel: false }))
vi.mock("@/utils/browser-surface", () => ({ closesOnFocusLoss: () => surface.inPanel }))

const EXPORT = "/popup/settings/security/export/full"
const BROWSER = { left: 100, top: 50, width: 1200, height: 900, type: "normal" }
const EXPORT_KEY = "nulo:own-window:export"
const IMPORT_KEY = "nulo:own-window:import"
const FOCUS = { focused: true, drawAttention: true, state: "normal" }

let create: ReturnType<typeof vi.fn>
let getCurrent: ReturnType<typeof vi.fn>
let getWindow: ReturnType<typeof vi.fn>
let update: ReturnType<typeof vi.fn>
let session: Map<string, unknown>
let sessionGet: ReturnType<typeof vi.fn>
let sendMessage: ReturnType<typeof vi.fn>
let closeDocument: ReturnType<typeof vi.spyOn>

beforeEach(() => {
	create = vi.fn().mockResolvedValue({ id: 7 })
	getCurrent = vi.fn().mockResolvedValue(BROWSER)
	getWindow = vi.fn().mockRejectedValue(new Error("No window with id"))
	update = vi.fn().mockResolvedValue({})
	sendMessage = vi.fn().mockResolvedValue({ ok: true })
	session = new Map()
	sessionGet = vi.fn(async (keys: string | string[]) =>
		Object.fromEntries([keys].flat().flatMap((key) => (session.has(key) ? [[key, session.get(key)]] : []))),
	)
	vi.stubGlobal("chrome", {
		runtime: { getURL: (path: string) => `moz-extension://nulo/${path}`, sendMessage },
		windows: { create, getCurrent, get: getWindow, update },
		storage: {
			session: {
				get: sessionGet,
				set: async (items: Record<string, unknown>) => {
					for (const [key, value] of Object.entries(items)) session.set(key, value)
				},
				remove: async (keys: string | string[]) => {
					for (const key of [keys].flat()) session.delete(key)
				},
			},
		},
	})
	closeDocument = vi.spyOn(window, "close").mockImplementation(() => undefined)
	surface.inPanel = false
})

afterEach(async () => {
	await releaseOwnWindow()
	closeDocument.mockRestore()
	vi.unstubAllGlobals()
})

/** Boots this document as the export flow's own window, hosted in popup-type window `id`. */
async function bootExportWindow(id: number): Promise<void> {
	getCurrent.mockResolvedValueOnce({ id, type: "popup" })
	captureOwnWindow(`#${EXPORT}?window=own`)
	await flushPromises()
}

describe("own window identity", () => {
	test("a marked export or import URL is an own window, recorded without its marker", () => {
		captureOwnWindow(`#${EXPORT}?window=own`)
		expect(ownWindowRoute()).toBe(EXPORT)

		captureOwnWindow("#/popup/import?option=full_backup&window=own&name=Alice")
		expect(ownWindowRoute()).toBe("/popup/import?option=full_backup&name=Alice")
	})

	test.each([
		["contacts", "/popup/settings/contacts"],
		["account import", "/popup/settings/accounts/import"],
		["restore again", "/popup/restore-again"],
	])("a marked %s URL is an own window that returns to its page after auth, not Home", (_name, route) => {
		captureOwnWindow(`#${route}?window=own`)
		expect(ownWindowRoute()).toBe(route)
		expect(postAuthRoute()).toBe(route)
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

describe("leaving Firefox's toolbar panel for a step", () => {
	test("outside the panel the step stays, and no window is asked for", async () => {
		expect(await leavePanelFor("/popup/settings/contacts")).toBe(false)
		expect(create).not.toHaveBeenCalled()
		expect(closeDocument).not.toHaveBeenCalled()
	})

	test("in the panel the route moves to its own window", async () => {
		surface.inPanel = true
		expect(await leavePanelFor("/popup/settings/contacts")).toBe(true)
		expect(create.mock.calls[0]?.[0].url).toBe("moz-extension://nulo/src/popup/index.html#/popup/settings/contacts?window=own")
		expect(closeDocument).toHaveBeenCalledTimes(1)
	})

	test("in the panel, a window that cannot open keeps the step here", async () => {
		surface.inPanel = true
		create.mockRejectedValue(new Error("no"))
		expect(await leavePanelFor("/popup/restore-again")).toBe(false)
		expect(closeDocument).not.toHaveBeenCalled()
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

describe("the card window", () => {
	const CONTACTS = "/popup/settings/contacts"
	const SNACK = { kind: "success", label: "Import completed successfully", profileId: "a1b2c3d4" } as const

	test("the three file picks are cards; export, the profile restore and an unmarked page are not", () => {
		for (const route of [CONTACTS, "/popup/settings/accounts/import", "/popup/restore-again"]) {
			captureOwnWindow(`#${route}?window=own`)
			expect(isCardWindow(), route).toBe(true)
		}
		for (const hash of [`#${EXPORT}?window=own`, "#/popup/import?option=full_backup&window=own", `#${CONTACTS}`]) {
			captureOwnWindow(hash)
			expect(isCardWindow(), hash).toBe(false)
		}
	})

	test("the panel names its browser window as the opener, which the window strips from its route and keeps", async () => {
		getCurrent.mockResolvedValue({ ...BROWSER, id: 12 })
		await moveToOwnWindow(CONTACTS)
		expect(create.mock.calls[0]?.[0].url).toBe(`moz-extension://nulo/src/popup/index.html#${CONTACTS}?window=own&opener=12`)

		captureOwnWindow(`#${CONTACTS}?window=own&opener=12`)
		expect(ownWindowRoute()).toBe(CONTACTS)
		await returnToPanel(CONTACTS)
		expect(sendMessage).toHaveBeenLastCalledWith({ type: "nulo:return-to-panel", opener: 12 })

		captureOwnWindow(`#${CONTACTS}?window=own&opener=twelve`)
		await returnToPanel(CONTACTS)
		expect(sendMessage).toHaveBeenLastCalledWith({ type: "nulo:return-to-panel", opener: undefined })
	})

	test("the return writes the record, asks the background, then closes, whatever the answer", async () => {
		captureOwnWindow(`#${CONTACTS}?window=own&opener=12`)
		sendMessage.mockImplementationOnce(async () => {
			expect(session.get(HANDBACK_KEY)).toEqual({ route: CONTACTS, snack: SNACK })
			expect(closeDocument).not.toHaveBeenCalled()
			return { ok: false }
		})
		expect(await returnToPanel(CONTACTS, SNACK)).toBe(true)
		expect(closeDocument).toHaveBeenCalledTimes(1)

		sendMessage.mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."))
		expect(await returnToPanel("/popup/settings/accounts")).toBe(true)
		expect(session.get(HANDBACK_KEY)).toEqual({ route: "/popup/settings/accounts" })
		expect(closeDocument).toHaveBeenCalledTimes(2)
	})

	test("outside a card window the return does nothing", async () => {
		captureOwnWindow(`#${EXPORT}?window=own`)
		expect(await returnToPanel(CONTACTS, SNACK)).toBe(false)
		expect(session.has(HANDBACK_KEY)).toBe(false)
		expect(sendMessage).not.toHaveBeenCalled()
		expect(closeDocument).not.toHaveBeenCalled()
	})

	test("Cancel or back in a card window hands back to the flow's page with no snack", async () => {
		captureOwnWindow("#/popup/restore-again?window=own&opener=12")
		getCurrent.mockResolvedValue({ id: 30, type: "popup" })

		expect(await closeOwnWindow()).toBe(true)
		expect(session.get(HANDBACK_KEY)).toEqual({ route: "/popup/restore-again" })
		expect(sendMessage).toHaveBeenCalledWith({ type: "nulo:return-to-panel", opener: 12 })
		expect(closeDocument).toHaveBeenCalledTimes(1)
	})
})

describe("one own window per flow", () => {
	test("a live window under the flow's key is focused as the window manager focuses, and none is created", async () => {
		session.set(EXPORT_KEY, 11)
		getWindow.mockResolvedValue({ id: 11, type: "popup" })

		expect(await moveToOwnWindow(EXPORT)).toBe(true)
		expect(update).toHaveBeenCalledWith(11, FOCUS)
		expect(create).not.toHaveBeenCalled()
		expect(closeDocument).toHaveBeenCalledTimes(1)
	})

	test("a closed window's key opens a new window and is dropped", async () => {
		session.set(EXPORT_KEY, 11)

		expect(await moveToOwnWindow(EXPORT)).toBe(true)
		expect(create).toHaveBeenCalledTimes(1)
		expect(update).not.toHaveBeenCalled()
		expect(session.has(EXPORT_KEY)).toBe(false)
	})

	test("a stored window that is not a popup window is never focused", async () => {
		session.set(EXPORT_KEY, 11)
		getWindow.mockResolvedValue({ id: 11, type: "normal" })

		expect(await moveToOwnWindow(EXPORT)).toBe(true)
		expect(update).not.toHaveBeenCalled()
		expect(create).toHaveBeenCalledTimes(1)
		expect(session.has(EXPORT_KEY)).toBe(false)
	})

	test("the other flow's window is not this flow's", async () => {
		session.set(EXPORT_KEY, 11)
		getWindow.mockResolvedValue({ id: 11, type: "popup" })

		expect(await moveToOwnWindow("/popup/import?option=full_backup")).toBe(true)
		expect(update).not.toHaveBeenCalled()
		expect(create).toHaveBeenCalledTimes(1)
	})

	test("a second contacts import focuses the contacts window, under its own key", async () => {
		session.set("nulo:own-window:contacts", 12)
		getWindow.mockResolvedValue({ id: 12, type: "popup" })

		expect(await moveToOwnWindow("/popup/settings/contacts")).toBe(true)
		expect(update).toHaveBeenCalledWith(12, FOCUS)
		expect(create).not.toHaveBeenCalled()
	})

	test("a storage read that rejects still opens a window", async () => {
		sessionGet.mockRejectedValueOnce(new Error("storage gone"))

		expect(await moveToOwnWindow(EXPORT)).toBe(true)
		expect(create).toHaveBeenCalledTimes(1)
	})

	test("a refused focus opens nothing new, since the window exists", async () => {
		session.set(EXPORT_KEY, 11)
		getWindow.mockResolvedValue({ id: 11, type: "popup" })
		update.mockRejectedValue(new Error("refused"))

		expect(await moveToOwnWindow(EXPORT)).toBe(true)
		expect(create).not.toHaveBeenCalled()
		expect(session.get(EXPORT_KEY)).toBe(11)
	})

	test("two starts in one document open one window and share its answer", async () => {
		const read = deferred<Record<string, unknown>>()
		const opened = deferred<{ id: number }>()
		sessionGet.mockReturnValueOnce(read.promise)
		create.mockReturnValueOnce(opened.promise)

		const first = moveToOwnWindow(EXPORT)
		const second = moveToOwnWindow(EXPORT)
		read.resolve({})
		await flushPromises()
		opened.resolve({ id: 7 })

		expect(await Promise.all([first, second])).toEqual([true, true])
		expect(create).toHaveBeenCalledTimes(1)
	})

	test("a start after a failed one tries again", async () => {
		create.mockRejectedValue(new Error("no"))
		expect(await moveToOwnWindow(EXPORT)).toBe(false)
		create.mockResolvedValue({ id: 7 })

		expect(await moveToOwnWindow(EXPORT)).toBe(true)
		expect(create).toHaveBeenCalledTimes(3)
	})
})

describe("registering an own window", () => {
	test("a window that boots on its flow in a popup window stores its id under the flow's key", async () => {
		await bootExportWindow(21)
		expect(session.get(EXPORT_KEY)).toBe(21)

		getCurrent.mockResolvedValueOnce({ id: 22, type: "popup" })
		captureOwnWindow("#/popup/import?option=full_backup&window=own")
		await flushPromises()
		expect(session.get(IMPORT_KEY)).toBe(22)
	})

	test("the same marked URL in a browser window's tab stores nothing", async () => {
		getCurrent.mockResolvedValueOnce({ id: 1, type: "normal" })
		captureOwnWindow(`#${EXPORT}?window=own`)
		await flushPromises()

		expect(ownWindowRoute()).toBe(EXPORT)
		expect(session.size).toBe(0)
	})

	test("a release clears the key only while it names this window", async () => {
		await bootExportWindow(21)
		session.set(EXPORT_KEY, 31)
		await releaseOwnWindow()
		expect(session.get(EXPORT_KEY)).toBe(31)

		await bootExportWindow(21)
		await releaseOwnWindow()
		expect(session.has(EXPORT_KEY)).toBe(false)
	})

	test("a popup window that boots without the marker, as a reload does, is named by no flow", async () => {
		session.set(EXPORT_KEY, 21)
		session.set(IMPORT_KEY, 22)
		getCurrent.mockResolvedValueOnce({ id: 21, type: "popup" })
		captureOwnWindow("#/popup/auth")
		await flushPromises()

		expect(ownWindowRoute()).toBeUndefined()
		expect(session.has(EXPORT_KEY)).toBe(false)
		expect(session.get(IMPORT_KEY)).toBe(22)
	})

	test("the toolbar panel or a tab boots without touching a registration", async () => {
		session.set(EXPORT_KEY, 21)
		getCurrent.mockResolvedValueOnce({ id: 21, type: "normal" })
		captureOwnWindow("#/popup/general")
		await flushPromises()

		expect(session.get(EXPORT_KEY)).toBe(21)
	})

	test("a release before the registration lands leaves no key behind", async () => {
		const current = deferred<{ id: number; type: string }>()
		getCurrent.mockReturnValueOnce(current.promise)
		captureOwnWindow(`#${EXPORT}?window=own`)

		const released = releaseOwnWindow()
		current.resolve({ id: 21, type: "popup" })
		await released

		expect(session.has(EXPORT_KEY)).toBe(false)
	})
})

describe("leaving the flow", () => {
	const PAGE = { render: () => null }
	const paths = [EXPORT, "/popup/import", "/popup/auth", "/popup/general", "/popup/profile/new", "/popup/settings/profile"]

	async function exportWindowRouter() {
		const router = createRouter({ history: createMemoryHistory(), routes: paths.map((path) => ({ path, component: PAGE })) })
		router.afterEach(followOwnRoute)
		await router.push(`${EXPORT}?window=own`)
		await bootExportWindow(21)
		return router
	}

	test.each(["/popup/general", "/popup/profile/new?from=/popup/auth", "/popup/settings/profile", "/popup/import"])(
		"landing on %s releases the flow",
		async (path) => {
			const router = await exportWindowRouter()
			await router.push(path)
			await flushPromises()

			expect(ownWindowRoute()).toBeUndefined()
			expect(session.has(EXPORT_KEY)).toBe(false)
		},
	)

	test.each(["/popup/auth", `${EXPORT}?step=2`])("landing on %s keeps it", async (path) => {
		const router = await exportWindowRouter()
		await router.push(path)
		await flushPromises()

		expect(ownWindowRoute()).toBe(EXPORT)
		expect(session.get(EXPORT_KEY)).toBe(21)
	})

	test("a cancelled navigation away keeps it", async () => {
		const router = await exportWindowRouter()
		router.beforeEach((to) => to.path !== "/popup/general")
		await router.push("/popup/general")
		await flushPromises()

		expect(router.currentRoute.value.path).toBe(EXPORT)
		expect(ownWindowRoute()).toBe(EXPORT)
		expect(session.get(EXPORT_KEY)).toBe(21)
	})
})
