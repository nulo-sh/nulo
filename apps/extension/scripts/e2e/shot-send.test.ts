import type { Page } from "puppeteer"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { shotSend } from "../../tests/e2e/fixtures/shots"

const DIR = "/shots"

/** A page whose scripts run in this jsdom document, as Puppeteer's run in the browser's: a throw
 *  rejects. Each capture records its path and the theme it saw. */
function fakePage() {
	const captures: { path: string; theme: string | null }[] = []
	const page = {
		evaluate: vi.fn(async (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => fn(...args)),
		waitForFunction: vi.fn(async () => undefined),
		screenshot: vi.fn(async ({ path }: { path: string }) => {
			captures.push({ path, theme: document.documentElement.getAttribute("theme") })
		}),
	}
	return { page, captures, asPage: page as unknown as Page }
}

function showPage(state: DocumentVisibilityState): void {
	vi.spyOn(document, "visibilityState", "get").mockReturnValue(state)
}

describe("shotSend", () => {
	beforeEach(() => {
		// jsdom has no Web Animations, so the theme settle finds nothing to wait for.
		Object.defineProperty(document, "getAnimations", { value: () => [], configurable: true })
		document.documentElement.setAttribute("theme", "light")
	})

	afterEach(() => {
		vi.restoreAllMocks()
		vi.unstubAllEnvs()
		Reflect.deleteProperty(document, "getAnimations")
		document.documentElement.removeAttribute("theme")
	})

	test("refuses a hidden page before any capture", async () => {
		vi.stubEnv("NULO_E2E_SHOT_DIR", DIR)
		showPage("hidden")
		const { page, asPage } = fakePage()

		await expect(shotSend(asPage, "row")).rejects.toThrow("shotSend(row): the page is hidden")
		expect(page.screenshot).not.toHaveBeenCalled()
	})

	test("captures a shown page light then dark and restores its theme", async () => {
		vi.stubEnv("NULO_E2E_SHOT_DIR", DIR)
		showPage("visible")
		const { captures, asPage } = fakePage()

		await shotSend(asPage, "row")

		expect(captures).toEqual([
			{ path: `${DIR}/row.png`, theme: "light" },
			{ path: `${DIR}/row-dark.png`, theme: "dark" },
		])
		expect(document.documentElement.getAttribute("theme")).toBe("light")
	})

	test("touches no page outside capture mode", async () => {
		vi.stubEnv("NULO_E2E_SHOT_DIR", undefined)
		showPage("hidden")
		const { page, asPage } = fakePage()

		await shotSend(asPage, "row")

		expect(page.evaluate).not.toHaveBeenCalled()
		expect(page.waitForFunction).not.toHaveBeenCalled()
		expect(page.screenshot).not.toHaveBeenCalled()
	})
})
