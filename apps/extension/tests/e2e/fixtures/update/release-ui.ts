import type { Page } from "puppeteer"
import { clickByTestId } from "../dom"
import { approveDiscover } from "../popups"
import { type FeeMethodSubtitle, selectFeeMethod } from "../transfers"

/**
 * Allow a connection on a 0.31.0 build, whose emoji check replaces the connect window's page where
 * later builds open it in a window of their own. Resolves with that page, now the check.
 */
export async function approveReleaseConnect(discoverPage: Page): Promise<Page> {
	await approveDiscover(discoverPage)
	await discoverPage.waitForFunction(
		() => location.hash.startsWith("#/windows/verify") && document.querySelector('[data-testid="verify-emoji-grid"]') !== null,
		{ timeout: 30_000, polling: 200 },
	)
	return discoverPage
}

/** Opens the release's own Send from Home, a form that shows its sides at once. */
export async function openReleaseSend(page: Page): Promise<void> {
	await clickByTestId(page, "actions-send")
	await page.waitForSelector('[data-testid="send-from-type"]', { timeout: 10_000 })
}

/** Picks the fee method on the release's own Send, whose fee card sits in its form. */
export async function selectReleaseSendFee(page: Page, method: FeeMethodSubtitle): Promise<void> {
	await selectFeeMethod(page, method)
}
