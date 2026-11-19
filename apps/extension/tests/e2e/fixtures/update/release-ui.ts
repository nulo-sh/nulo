import type { Page } from "puppeteer"
import type { FeePickUpdate, FeeSide, SendPick } from "@/utils/fee-picks"
import { UI_PREFERENCE_SERVICE_NAME } from "@/wallet/services/ui-preference/spec"
import { clickByTestId } from "../dom"
import { approveDiscover } from "../popups"
import { type FeeMethodSubtitle, selectFeeMethod } from "../fee-method"
import { captureSoleProfileId } from "../profiles"
import { chooseRecipient, openSend, selectSendFeeMethod } from "../send-page"
import { callService } from "../session"
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

/** The record a press on a Fee Juice radio saves. */
const FEE_JUICE_PICKS: Readonly<Record<Exclude<FeeMethodSubtitle, "sponsored">, SendPick>> = {
	public: { type: "fj" },
	private: { type: "private_fpc" },
}

/**
 * Picks `method` on the release's own Send, opened from Home, and leaves Send open. A `person-first`
 * release's Fee sheet saves a pick only when a press changes the payer, so on the sandbox, where
 * `method` is the one payer and already chosen, `saveFor` names the account whose pick the release's
 * own `saveFeePick` then writes, as the press would have.
 */
export async function pickReleaseSendFee(
	page: Page,
	release: ReleaseTraits,
	{ recipient, method, saveFor }: { recipient: string; method: FeeMethodSubtitle; saveFor?: string },
): Promise<void> {
	if (release.send === "one-form") {
		await clickByTestId(page, "actions-send")
		await page.waitForSelector('[data-testid="send-from-type"]', { timeout: 10_000 })
		await selectFeeMethod(page, method)
		return
	}
	await openSend(page)
	await chooseRecipient(page, recipient)
	await selectSendFeeMethod(page, method)
	if (saveFor === undefined) return
	if (method === "sponsored") throw new Error("pickReleaseSendFee: a sponsor's pick names its id; save it with its row")
	const side = await page.$eval('[data-testid="send-from-type"]', (el) => el.getAttribute("data-side") as FeeSide)
	const update: FeePickUpdate = { kind: "send", address: saveFor, side, pick: FEE_JUICE_PICKS[method] }
	if (!(await callService<boolean>(page, UI_PREFERENCE_SERVICE_NAME, "saveFeePick", [await captureSoleProfileId(page), update]))) {
		throw new Error(`pickReleaseSendFee: the release refused to save the ${side} send pick`)
	}
}
