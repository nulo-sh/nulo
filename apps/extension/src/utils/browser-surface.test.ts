import { describe, expect, it, vi } from "vitest"
import {
	closesOnFocusLoss,
	hasSidePanelSurface,
	isFirefox,
	isFirefoxSidebar,
	isToolbarPopup,
	pointToolbarAtSidebar,
	sidebarAction,
} from "./browser-surface"

function stubBrowser({ firefox, views }: { firefox: boolean; views?: () => Window[] }) {
	const getViews = vi.fn(views ?? (() => []))
	vi.stubGlobal("chrome", {
		runtime: firefox ? { getBrowserInfo: () => Promise.resolve({ name: "Firefox" }) } : {},
		extension: { getViews },
	})
	return getViews
}

describe("browser surface", () => {
	it("Chrome is not Firefox and never asks for the panel's views", () => {
		const getViews = stubBrowser({ firefox: false, views: () => [window] })
		expect(isFirefox()).toBe(false)
		expect(closesOnFocusLoss()).toBe(false)
		expect(getViews).not.toHaveBeenCalled()
	})

	it("Firefox's toolbar panel needs its own window", () => {
		const getViews = stubBrowser({ firefox: true, views: () => [window] })
		expect(isFirefox()).toBe(true)
		expect(closesOnFocusLoss()).toBe(true)
		expect(getViews).toHaveBeenCalledWith({ type: "popup" })
	})

	it("a Firefox page outside the panel keeps the in-page ceremony", () => {
		const other = {} as Window
		stubBrowser({ firefox: true, views: () => [other] })
		expect(closesOnFocusLoss()).toBe(false)
	})

	it("a Firefox page with no popup open keeps the in-page ceremony", () => {
		stubBrowser({ firefox: true })
		expect(closesOnFocusLoss()).toBe(false)
	})

	it("Chrome's action popup is the toolbar popup; a page another popup lists beside it is not", () => {
		const getViews = stubBrowser({ firefox: false, views: () => [window] })
		expect(isToolbarPopup()).toBe(true)
		expect(getViews).toHaveBeenCalledWith({ type: "popup" })

		stubBrowser({ firefox: false, views: () => [{} as Window] })
		expect(isToolbarPopup()).toBe(false)
	})

	it("a side surface is Chrome's side panel or Firefox's sidebar, and a browser with neither has none", () => {
		stubBrowser({ firefox: false })
		expect(hasSidePanelSurface()).toBe(false)
		Object.assign(chrome, { sidePanel: {} })
		expect(hasSidePanelSurface()).toBe(true)
		expect(sidebarAction()).toBeUndefined()

		stubBrowser({ firefox: true })
		const sidebar = { open: vi.fn() }
		vi.stubGlobal("browser", { sidebarAction: sidebar })
		expect(sidebarAction()).toBe(sidebar)
		expect(hasSidePanelSurface()).toBe(true)
	})

	it("the toolbar button points at Firefox's sidebar or its manifest popup, and Chrome keeps its popup", async () => {
		const setPopup = vi.fn(async () => undefined)
		stubBrowser({ firefox: false })
		Object.assign(chrome, { sidePanel: {}, action: { setPopup } })
		vi.stubGlobal("browser", undefined)
		await pointToolbarAtSidebar(true)
		expect(setPopup).not.toHaveBeenCalled()

		stubBrowser({ firefox: true })
		Object.assign(chrome, { action: { setPopup } })
		vi.stubGlobal("browser", { sidebarAction: { open: vi.fn(), close: vi.fn(), toggle: vi.fn() } })
		await pointToolbarAtSidebar(true)
		await pointToolbarAtSidebar(false)
		expect(setPopup.mock.calls).toEqual([[{ popup: "" }], [{ popup: null }]])
	})

	it("only Firefox's sidebar document is the sidebar, and Chrome, which refuses the type, is never asked", () => {
		const chromeViews = stubBrowser({ firefox: false, views: () => [window] })
		vi.stubGlobal("browser", undefined)
		expect(isFirefoxSidebar()).toBe(false)
		expect(chromeViews).not.toHaveBeenCalled()

		vi.stubGlobal("browser", { sidebarAction: { open: vi.fn(), close: vi.fn() } })
		const firefoxViews = stubBrowser({ firefox: true, views: () => [window] })
		expect(isFirefoxSidebar()).toBe(true)
		expect(firefoxViews).toHaveBeenCalledWith({ type: "sidebar" })
		stubBrowser({ firefox: true, views: () => [{} as Window] })
		expect(isFirefoxSidebar()).toBe(false)
	})
})
