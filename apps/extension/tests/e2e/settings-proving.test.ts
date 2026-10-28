import type { Page } from "puppeteer"
import { expect } from "vitest"
import type { AnsweredRequests } from "./fixtures/browser"
import { clickByTestId, openPopup, test, waitForHash } from "./fixtures/extension"
import { navigateToSettings } from "./fixtures/helpers"
import { interceptHealth, PRESTO_DETAILED_HEALTH, PRESTO_HTTP_HEALTH_URL, PRESTO_HTTPS_HEALTH_URL } from "./fixtures/presto"

const rowSelector = (status: string) => `[data-testid="setting-nav-proving"][data-status="${status}"]`
const cardSelector = (status: string) => `[data-testid="settings-proving-status"][data-status="${status}"]`

/** The health probes the page has sent, on either scheme, as the answerer counted them. */
const probesOf = async (answered: AnsweredRequests): Promise<number> =>
	(await answered.hits(PRESTO_HTTPS_HEALTH_URL)) + (await answered.hits(PRESTO_HTTP_HEALTH_URL))

async function backToSettingsList(page: Page): Promise<void> {
	await page.evaluate(() => {
		window.location.hash = "#/popup/settings"
	})
	await waitForHash(page, "#/popup/settings")
}

test("settings rests without probing; a check that reaches Presto is remembered, and the list then probes on its own", async ({
	registeredExtensionPerTest,
}) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")
	const answered = await interceptHealth(page, { https: { status: 200, body: PRESTO_DETAILED_HEALTH }, http: "refused" })

	// A probe can raise the browser's local-network prompt, so neither page may send one unasked.
	await navigateToSettings(page)
	await page.waitForSelector(rowSelector("idle"), { visible: true, timeout: 10_000 })
	await navigateToSettings(page, "proving")
	await waitForHash(page, "#/popup/settings/proving")
	await page.waitForSelector(cardSelector("idle"), { visible: true, timeout: 10_000 })
	await page.waitForSelector('[data-testid="settings-proving-get"]', { visible: true, timeout: 5_000 })
	expect(await probesOf(answered)).toBe(0)

	await clickByTestId(page, "settings-proving-retry")
	await page.waitForSelector(cardSelector("available"), { visible: true, timeout: 10_000 })
	expect(await answered.hits(PRESTO_HTTPS_HEALTH_URL)).toBeGreaterThan(0)
	const state = await page.evaluate(() => ({
		retry: !!document.querySelector('[data-testid="settings-proving-retry"]'),
		get: !!document.querySelector('[data-testid="settings-proving-get"]'),
	}))
	expect(state).toEqual({ retry: true, get: false })

	// The card turns `available` before the flag's write lands, and the list reads the flag once.
	await page.waitForFunction(
		async () => {
			// ValueStorage persists the config as one JSON string.
			const raw = (await chrome.storage.local.get("nulo:config"))["nulo:config"]
			return typeof raw === "string" && (JSON.parse(raw) as { prestoReached?: boolean }).prestoReached === true
		},
		{ timeout: 10_000 },
	)
	await backToSettingsList(page)
	await page.waitForSelector(rowSelector("available"), { visible: true, timeout: 10_000 })

	expect(registeredExtensionPerTest.consoleErrors).toEqual([])
	expect(registeredExtensionPerTest.pageErrors).toEqual([])
})

test("a check that finds nothing shows the not-running card and the Get Presto row, and is not remembered", async ({
	registeredExtensionPerTest,
}) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")
	const answered = await interceptHealth(page, { https: "refused", http: "refused" })

	await navigateToSettings(page, "proving")
	await waitForHash(page, "#/popup/settings/proving")
	await page.waitForSelector(cardSelector("idle"), { visible: true, timeout: 10_000 })
	await clickByTestId(page, "settings-proving-retry")
	await page.waitForSelector(cardSelector("offline"), { visible: true, timeout: 10_000 })
	await page.waitForSelector('[data-testid="settings-proving-get"]', { visible: true, timeout: 5_000 })

	// `offline` cannot tell a granted permission from a dismissed prompt, so the list stays at rest.
	const afterCheck = await probesOf(answered)
	expect(afterCheck).toBeGreaterThan(0)
	await backToSettingsList(page)
	await page.waitForSelector(rowSelector("idle"), { visible: true, timeout: 10_000 })
	expect(await probesOf(answered)).toBe(afterCheck)

	expect(registeredExtensionPerTest.consoleErrors).toEqual([])
	expect(registeredExtensionPerTest.pageErrors).toEqual([])
})

test("HTTPS refused + a detailed HTTP body without https_port is the encrypted-connection card (https-disabled)", async ({
	registeredExtensionPerTest,
}) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")
	// Only the plain-HTTP fallback reaches this diagnosis, so the page's real loopback fetch must get through.
	const { https_port: _omitted, ...withoutHttpsPort } = PRESTO_DETAILED_HEALTH
	const answered = await interceptHealth(page, { https: "refused", http: { status: 200, body: withoutHttpsPort } })

	await navigateToSettings(page, "proving")
	await page.waitForSelector(cardSelector("idle"), { visible: true, timeout: 10_000 })
	await clickByTestId(page, "settings-proving-retry")
	await page.waitForSelector(cardSelector("secure-connection-unavailable"), { visible: true, timeout: 10_000 })
	const card = await page.$eval('[data-testid="settings-proving-status"]', (el) => ({
		diagnosis: el.getAttribute("data-diagnosis"),
		steps: el.querySelectorAll("li").length,
	}))
	expect(card).toEqual({ diagnosis: "https-disabled", steps: 3 })
	expect(await answered.hits(PRESTO_HTTPS_HEALTH_URL)).toBeGreaterThan(0)
	expect(await answered.hits(PRESTO_HTTP_HEALTH_URL)).toBeGreaterThan(0)

	expect(registeredExtensionPerTest.consoleErrors).toEqual([])
	expect(registeredExtensionPerTest.pageErrors).toEqual([])
})
