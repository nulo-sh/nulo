import { expect } from "vitest"
import { test, openPopup, replaceInputValue, waitForHash } from "./fixtures/extension"
import { clickNavTab } from "./fixtures/helpers"
import { shotSend } from "./fixtures/send-page"

// A fresh profile's defaults: keep this test first, ahead of any test in the file that writes config.
test("the hub shows each row's current value once read", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")
	await clickNavTab(page, "settings")
	await waitForHash(page, "#/popup/settings")

	const rows = ["setting-nav-lock", "setting-nav-privacy", "setting-nav-display", "setting-nav-developer"]
	const values = await page
		.waitForFunction(
			(ids: string[]) => {
				const read = ids.map((id) =>
					document.querySelector(`[data-testid="${id}"] [data-testid="setting-value"]`)?.textContent?.trim(),
				)
				return read.every(Boolean) ? read : null
			},
			{ timeout: 10_000, polling: 200 },
			rows,
		)
		.then((handle) => handle.jsonValue())
	expect(values).toEqual(["30 min", "Prices on", "System", "Off"])
	await shotSend(page, "settings-hub", "page-hero")

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
	await page.close()
})

for (const { from, to, control } of [
	{ from: "#/popup/settings/security", to: "#/popup/settings/lock", control: "lock-now-btn" },
	{ from: "#/popup/settings/appearance", to: "#/popup/settings/display", control: "theme-trigger" },
	{ from: "#/popup/settings/advanced", to: "#/popup/settings/developer", control: "settings-toggle-developerMode" },
	{
		from: "#/popup/settings/advanced/account-state/senders",
		to: "#/popup/settings/developer/account-state/senders",
		control: "senders-add-btn",
	},
]) {
	test(`${from} lands on ${to}`, async ({ registeredExtension }) => {
		const page = await openPopup(registeredExtension)
		await waitForHash(page, "#/popup/general")

		// `navigateByHash` waits for the hash it set, which the redirect replaces.
		await page.evaluate((hash: string) => {
			window.location.hash = hash
		}, from)
		await waitForHash(page, to, 10_000)
		await page.waitForSelector(`[data-testid="${control}"]`, { visible: true, timeout: 10_000 })
		if (to === "#/popup/settings/display") await shotSend(page, "settings-display", "display-row-network-name")

		expect(registeredExtension.consoleErrors).toEqual([])
		expect(registeredExtension.pageErrors).toEqual([])
		await page.close()
	})
}

// The hand-off a unit test cannot see: the real router, the row mounting after the real config read,
// the browser's own side panel API deciding the results, and the outline actually painting.
test("a settings search opens the row's page with the row outlined", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	try {
		await waitForHash(page, "#/popup/general")
		await clickNavTab(page, "settings")
		await waitForHash(page, "#/popup/settings")

		const shownResults = () =>
			page.$$eval('[data-testid^="settings-search-result-"]', (rows) => rows.map((row) => row.getAttribute("data-testid")))
		// Firefox's sidebar stands in for the side panel, so a search finds the row on both browsers.
		const sidePanel = "settings-search-result-display-side-panel"
		await page.type('[data-testid="settings-search-input"]', "panel")
		await page.waitForSelector(`[data-testid="${sidePanel}"]`, { visible: true, timeout: 10_000 })
		expect(await shownResults()).toEqual([sidePanel])

		const animations = "settings-search-result-display-animations"
		await replaceInputValue(page, '[data-testid="settings-search-input"]', "nimat")
		await page.waitForSelector(`[data-testid="${animations}"]`, { visible: true, timeout: 10_000 })
		expect(await shownResults()).toEqual([animations])

		// The outline lasts a moment: freeze its first frame as it starts, so no timing bounds the reads.
		await page.evaluate(() => {
			const observer = new MutationObserver((records) => {
				for (const { target } of records) {
					if (!(target instanceof Element) || !target.hasAttribute("data-highlighted")) continue
					for (const animation of target.getAnimations()) {
						animation.pause()
						animation.currentTime = 0
					}
					observer.disconnect()
				}
			})
			observer.observe(document, { subtree: true, attributes: true, attributeFilter: ["data-highlighted"] })
			Object.assign(window, { settingsSearchObserver: observer })
		})
		await page.click(`[data-testid="${animations}"]`)
		await waitForHash(page, "#/popup/settings/display")

		const row = '[data-testid="display-row-animations"]'
		await page.waitForSelector(`${row}[data-highlighted]`, { timeout: 10_000 })
		const shown = await page.$eval(row, (el) => {
			const style = getComputedStyle(el)
			// The canvas reads any colour syntax; one it cannot parse leaves the transparent fill and fails.
			const pixel = document.createElement("canvas").getContext("2d")
			if (!pixel) return null
			pixel.fillStyle = "transparent"
			pixel.fillStyle = style.outlineColor
			pixel.fillRect(0, 0, 1, 1)
			const alpha = pixel.getImageData(0, 0, 1, 1).data[3]
			let scroller = el.parentElement
			while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
			const view = scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight }
			const box = el.getBoundingClientRect()
			return {
				outline: style.outlineStyle,
				painted: alpha > 0,
				inView: box.top >= view.top && box.bottom <= view.bottom,
			}
		})
		expect(shown).toEqual({ outline: "solid", painted: true, inView: true })

		expect(registeredExtension.consoleErrors).toEqual([])
		expect(registeredExtension.pageErrors).toEqual([])
	} finally {
		await page
			.evaluate(() => (window as { settingsSearchObserver?: MutationObserver }).settingsSearchObserver?.disconnect())
			.catch(() => {})
		await page.close()
	}
})
