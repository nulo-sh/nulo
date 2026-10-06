import { describe, expect, it, vi } from "vitest"
import { isFirefox, passkeyNeedsOwnWindow } from "./browser-surface"

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
})
