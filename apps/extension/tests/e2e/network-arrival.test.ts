/**
 * The arrival of a new default network in the real popup shell, whose boot no cheaper layer runs:
 * the Terms sheet goes first and the arrival waits for it, the arrival comes back at every open until
 * it is answered, and an answered one stays answered when the popup opens again.
 *
 * `NETWORK_ARRIVAL_CAPTURES=1` instead writes the arrival over Home, dark and light, into
 * `tests/e2e/.captures/` (Chrome only).
 */
import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { isFirefox } from "./fixtures/browser"
import { clickByTestId, type ExtensionContext, openPopup, test, waitForHash } from "./fixtures/extension"
import { pointerClick, reloadWithLegalState, waitForSheet } from "./helpers/legal-drivers"
import { ARRIVAL, readArrivalTrace, readSeedOffers, seedNetworkArrival, traceArrival } from "./helpers/network-arrival"
import { CAPTURE_VIEWPORT, capture } from "./helpers/stale-network-capture"

const CAPTURES = process.env.NETWORK_ARRIVAL_CAPTURES === "1"
const HOME = '[data-testid="tokens-menu-trigger"]'

const textOf = (page: Page, testid: string) => page.$eval(`[data-testid="${testid}"]`, (el) => el.textContent?.trim())

async function reopen(extension: ExtensionContext, page: Page): Promise<Page> {
	await page.close()
	const next = await openPopup(extension)
	await waitForHash(next, "#/popup/general", 30_000)
	return next
}

describe.skipIf(CAPTURES)("network arrival", () => {
	test("waits for the Terms sheet, shows until answered, and stays answered after Stay", async ({
		registeredExtensionPerTest: extension,
	}) => {
		let page = await openPopup(extension)
		await waitForHash(page, "#/popup/general", 30_000)
		const { profileId } = await seedNetworkArrival(page)
		await reloadWithLegalState(page, "stale")
		await traceArrival(page)

		await waitForSheet(page, "changed")
		expect(await page.$(ARRIVAL)).toBeNull()
		await pointerClick(page, "legal-consent-checkbox")
		await pointerClick(page, "legal-continue")
		await page.waitForSelector(ARRIVAL, { visible: true, timeout: 15_000 })
		expect(await textOf(page, "network-arrival-title")).toBe("Mainnet is in your wallet")
		expect(await readArrivalTrace(page)).toEqual({ mounted: true, stacked: false })

		// Closed unanswered, it is back at the next open.
		page = await reopen(extension, page)
		await page.waitForSelector(ARRIVAL, { visible: true, timeout: 15_000 })

		await pointerClick(page, "network-arrival-stay")
		await page.waitForSelector(HOME, { visible: true, timeout: 15_000 })
		expect(await page.$(ARRIVAL)).toBeNull()
		expect(await readSeedOffers(page, profileId)).toEqual({ offered: ["local", "mainnet", "testnet"] })

		page = await reopen(extension, page)
		await traceArrival(page)
		await page.waitForSelector(HOME, { visible: true, timeout: 15_000 })
		expect(await readArrivalTrace(page)).toEqual({ mounted: false, stacked: false })
		await page.close()
	}, 180_000)
})

describe.skipIf(!CAPTURES || isFirefox)("network arrival captures", () => {
	test("the arrival over Home, dark and light", { timeout: 300_000, retry: 0 }, async ({ registeredExtension: ctx }) => {
		const page = await openPopup(ctx)
		await page.setViewport(CAPTURE_VIEWPORT)
		await waitForHash(page, "#/popup/general", 30_000)
		await seedNetworkArrival(page)
		await reloadWithLegalState(page, "current")
		await page.waitForSelector(ARRIVAL, { visible: true, timeout: 30_000 })
		await capture(page, "arrival")
		await clickByTestId(page, "network-arrival-stay")
		await page.waitForSelector(HOME, { visible: true, timeout: 15_000 })
	})
})
