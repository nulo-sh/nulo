import type { Page } from "puppeteer"
import { clickByTestId } from "../dom"
import { approveDiscover } from "../popups"
import { type FeeMethodSubtitle, selectFeeMethod } from "../fee-method"
import { chooseRecipient, openSend, selectSendFeeMethod } from "../send-page"
import type { ReleaseTraits } from "./release"

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

/**
 * Opens the release's own Send from Home and picks its fee payer, which saves Send's pick: on a
 * `one-form` release through the menu of the fee card in its form, on a `person-first` one through
 * its Fee sheet, once `recipient` answers who is paid.
 */
export async function pickReleaseSendFee(page: Page, release: ReleaseTraits, recipient: string, method: FeeMethodSubtitle): Promise<void> {
	if (release.send === "person-first") {
		await openSend(page)
		await chooseRecipient(page, recipient)
		await selectSendFeeMethod(page, method)
		return
	}
	await clickByTestId(page, "actions-send")
	await page.waitForSelector('[data-testid="send-from-type"]', { timeout: 10_000 })
	await selectFeeMethod(page, method)
}
