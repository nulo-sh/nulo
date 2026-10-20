import { describe, expect, it, vi } from "vitest"
import { hasSidePanelSurface, isFirefox, isFirefoxSidebar, passkeyNeedsOwnWindow, sidebarAction } from "./browser-surface"

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
		expect(passkeyNeedsOwnWindow()).toBe(false)
		expect(getViews).not.toHaveBeenCalled()
	})

	it("Firefox's toolbar panel needs its own window", () => {
		const getViews = stubBrowser({ firefox: true, views: () => [window] })
		expect(isFirefox()).toBe(true)
		expect(passkeyNeedsOwnWindow()).toBe(true)
		expect(getViews).toHaveBeenCalledWith({ type: "popup" })
	})

	it("a Firefox page outside the panel keeps the in-page ceremony", () => {
		const other = {} as Window
		stubBrowser({ firefox: true, views: () => [other] })
		expect(passkeyNeedsOwnWindow()).toBe(false)
	})

	it("a Firefox page with no popup open keeps the in-page ceremony", () => {
		stubBrowser({ firefox: true })
		expect(passkeyNeedsOwnWindow()).toBe(false)
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
