import { expect } from "vitest"
import { test, openPopup, waitForHash } from "./fixtures/extension"
import { clickNavTab } from "./fixtures/helpers"

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

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
	await page.close()
})

for (const { from, to, control } of [
	{ from: "#/popup/settings/security", to: "#/popup/settings/lock", control: "lock-now-btn" },
	{ from: "#/popup/settings/appearance", to: "#/popup/settings/display", control: "theme-trigger" },
	{ from: "#/popup/settings/advanced", to: "#/popup/settings/developer", control: "settings-toggle-developerMode" },
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

		expect(registeredExtension.consoleErrors).toEqual([])
		expect(registeredExtension.pageErrors).toEqual([])
		await page.close()
	})
}
