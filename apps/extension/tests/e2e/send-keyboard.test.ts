/**
 * Send by keyboard alone: Tab reaches each control in the order it is drawn, Enter or Space presses
 * it, a held Enter acts once, and the focused control draws the 2 px accent ring. An Enter meant for
 * another control never picks a destination suggestion.
 *
 * The smoke wallet holds no balance, so the amount field and Max are disabled and out of the Tab
 * path here; Max's own stop is proven in the funded `network/send-amount-exact.test.ts`.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { clickByTestId, openPopup, test, waitForHash, type ExtensionContext } from "./fixtures/extension"
import { getAccountAddress, seedUsdQuoteAndReload } from "./fixtures/helpers"
import { readSendInputs } from "./fixtures/send-page"
import { readActivityScope, seedTokenRow } from "./helpers/activity-seeds"
import { activeTestId, coveredAt } from "./helpers/pointer-probes"

const sel = (testid: string) => `[data-testid="${testid}"]`
const DESTINATION_INPUT = `${sel("send-destination-field")} input`

async function openSendPage(ctx: ExtensionContext, { priced = false } = {}): Promise<Page> {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general", 30_000)
	if (priced) {
		await seedTokenRow(page, await readActivityScope(page), 1)
		await seedUsdQuoteAndReload(page)
	}
	await clickByTestId(page, "actions-send")
	await page.waitForSelector(sel("send-destination-field"), { visible: true, timeout: 15_000 })
	return page
}

test("Enter picks a destination suggestion only from the destination field", { timeout: 120_000, retry: 0 }, async ({
	registeredExtensionPerTest: ctx,
}) => {
	const page = await openSendPage(ctx)
	const account = await getAccountAddress(page)

	// Accounts are suggested by name, so the profile's own "Account 1" stands in for a contact.
	await page.focus(DESTINATION_INPUT)
	await page.keyboard.type("Acc")
	await page.keyboard.press("Enter")
	await page.waitForSelector(sel("recipient-card"), { timeout: 5_000 })
	expect((await readSendInputs(page)).destination).toBe(account)

	await clickByTestId(page, "recipient-card-change")
	await page.waitForSelector(DESTINATION_INPUT, { timeout: 5_000 })
	await page.focus(DESTINATION_INPUT)
	await page.keyboard.type("Acc")
	// Inside the quarter second the suggestions outlive the field's blur by.
	await page.keyboard.press("Tab")
	await page.keyboard.press("Enter")
	expect((await readSendInputs(page)).destination).toBe("Acc")
})

test("an open destination suggestion list covers neither Max nor the fee method picker", { timeout: 120_000, retry: 0 }, async ({
	registeredExtensionPerTest: ctx,
}) => {
	const page = await openSendPage(ctx)
	await page.waitForSelector(sel("send-fee-method-trigger"), { visible: true, timeout: 30_000 })
	await page.focus(DESTINATION_INPUT)
	await page.keyboard.type(await getAccountAddress(page))

	const covered = {
		token: await coveredAt(page, "send-token-trigger"),
		max: await coveredAt(page, "send-amount-max"),
		fee: await coveredAt(page, "send-fee-method-trigger"),
	}
	console.log(`[send-keyboard] under the open suggestion list: ${JSON.stringify(covered)}`)
	expect(await activeTestId(page)).toBe("send-destination-field")
	expect(covered.max).toBeNull()
	expect(covered.fee).toBeNull()
})
