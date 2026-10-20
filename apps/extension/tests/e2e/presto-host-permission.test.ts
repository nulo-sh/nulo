/**
 * Firefox lets a person withhold the loopback origins Presto listens on. Only a real Firefox proves
 * what Settings › Proving rests on: `contains` after a removal, the change reaching a page that did
 * not make it, a hit-tested click or a key counting as the request's user input, the ring in real
 * layout, and focus landing on the title, with no ring, when the row leaves with it.
 */
import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { FIREFOX_ONLY, isFirefox, openScratchPage, prepareKeys } from "./fixtures/browser"
import { type ExtensionContext, launchExtension, openPopup, registerProfile, test, waitForHash } from "./fixtures/extension"
import { navigateToSettings } from "./fixtures/navigation"
import { interceptHealth, PRESTO_DETAILED_HEALTH, PRESTO_HTTP_HEALTH_URL, PRESTO_HTTPS_HEALTH_URL } from "./fixtures/presto"
import { pointerClick } from "./helpers/legal-drivers"
import { focusRing, tabTo, tokenColor, waitForFocus } from "./helpers/pointer-probes"

const LOOPBACK = ["https://127.0.0.1/*", "http://127.0.0.1/*"]
/** The content script's all-sites pattern covers loopback too, so it is withheld with them. */
const WITHHELD = [...LOOPBACK, "*://*/*"]

/** Withholds the grant from a page that does not show the row, as about:addons would. */
async function withhold(extension: ExtensionContext): Promise<boolean> {
	const scratch = await openScratchPage(extension.browser, extension.extensionId)
	const held = await scratch.evaluate(
		async (withheld, loopback) => {
			await chrome.permissions.remove({ origins: withheld })
			return chrome.permissions.contains({ origins: loopback })
		},
		WITHHELD,
		LOOPBACK,
	)
	await scratch.close()
	return held
}

const statusCard = (status: string) => `[data-testid="settings-proving-status"][data-status="${status}"]`

const readPage = (page: Page) =>
	page.evaluate(() => {
		const shown = (testid: string) => document.querySelector(`[data-testid="${testid}"]`)?.checkVisibility() ?? false
		return {
			row: shown("presto-permission-row"),
			card: shown("settings-proving-status"),
			get: shown("settings-proving-get"),
		}
	})

describe.skipIf(!isFirefox)(FIREFOX_ONLY.permissionRequest, () => {
	test("a withheld grant puts the row in place of the card; Allow brings it back checked, focus on the title", async () => {
		const extension = await launchExtension({ grantPermissionRequests: true })
		try {
			await registerProfile(extension)
			const page = await openPopup(extension)
			await waitForHash(page, "#/popup/general")
			await interceptHealth(page, { https: { status: 200, body: PRESTO_DETAILED_HEALTH }, http: "refused" })
			// The stub answers whatever the grant, so only the count proves the check came after Allow.
			const probes: string[] = []
			page.on("request", (req) => {
				if (req.url() === PRESTO_HTTPS_HEALTH_URL || req.url() === PRESTO_HTTP_HEALTH_URL) probes.push(req.url())
			})
			await navigateToSettings(page, "proving")
			await page.waitForSelector(statusCard("idle"), { visible: true, timeout: 10_000 })
			expect(await readPage(page)).toEqual({ row: false, card: true, get: true })

			expect(await withhold(extension)).toBe(false)

			await page.waitForSelector('[data-testid="presto-permission-row"]', { visible: true, timeout: 10_000 })
			expect(await readPage(page)).toEqual({ row: true, card: false, get: false })

			await prepareKeys(page)
			await tabTo(page, "presto-permission-allow")
			expect(await focusRing(page, "presto-permission-allow")).toEqual({
				ring: "solid 2px 2px",
				color: await tokenColor(page, "--nulo-accent"),
			})

			expect(probes).toEqual([])
			await pointerClick(page, "presto-permission-allow")
			await page.waitForSelector(statusCard("available"), { visible: true, timeout: 10_000 })
			await waitForFocus(page, "subpage-title")
			expect(await readPage(page)).toEqual({ row: false, card: true, get: false })
			expect(probes).toEqual([PRESTO_HTTPS_HEALTH_URL])

			// A click ends keyboard modality, so only a grant from a key shows whether the title keeps the
			// browser's ring off.
			expect(await withhold(extension)).toBe(false)
			await page.waitForSelector('[data-testid="presto-permission-row"]', { visible: true, timeout: 10_000 })
			await prepareKeys(page)
			await tabTo(page, "presto-permission-allow")
			await page.keyboard.press("Enter")
			await waitForFocus(page, "subpage-title")
			expect((await focusRing(page, "subpage-title")).ring).toMatch(/^none /)
			expect(extension.consoleErrors).toEqual([])
			expect(extension.pageErrors).toEqual([])
			await page.close()
		} finally {
			await extension.close()
		}
	})
})
