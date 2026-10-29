/**
 * Nothing is submitted, so no node is needed: the import and its pick are `network/send-picker.test.ts`'s.
 * The flag on a pasted address's add row is `token-list.test.ts`'s, since only a source run's list flags a pair.
 */
import { expect } from "vitest"
import { clickByTestId, openPopup, replaceInputValue, test, waitForHash } from "./fixtures/extension"
import { getAccountAddress, seedUsdQuoteAndReload } from "./fixtures/helpers"
import { readSendInputs, shotSend } from "./fixtures/send-page"
import { skipUnlessListPrices } from "./fixtures/token-list"
import { waitForNewTokenAddress } from "./fixtures/tokens"
import { readActivityScope, seedTokenRow } from "./helpers/activity-seeds"
import { focusInPopupOf, pressEscape, waitForFocus } from "./helpers/pointer-probes"

const sel = (testid: string) => `[data-testid="${testid}"]`
const VISIBLE = { visible: true, timeout: 15_000 } as const
/** A curve point no seeded token holds. */
const UNLISTED = "0x1200000000000000000000000000000000000000000000000000000000000002"

test("the Send picker: New token opened from a pasted address's add row closes back onto the picker", {
	timeout: 180_000,
	retry: 0,
}, async ({ listedExtension: ctx, skip }) => {
	skipUnlessListPrices(skip)
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general", 30_000)
	// With no token, Send's token card opens New token instead of the picker.
	const scope = await readActivityScope(page, { priced: true })
	await seedTokenRow(page, scope, 1)
	await seedUsdQuoteAndReload(page, scope.token.priceId)
	const recipient = await getAccountAddress(page)
	await clickByTestId(page, "actions-send")
	await page.waitForSelector(sel("send-token-symbol"), VISIBLE)
	await replaceInputValue(page, `${sel("send-destination-field")} input`, recipient)

	// From the focused card, so closing the picker has a control to hand focus back to.
	await page.focus(sel("send-token-trigger"))
	await page.keyboard.press("Enter")
	await page.waitForSelector(sel("select-token-search"), VISIBLE)
	await replaceInputValue(page, sel("select-token-search"), UNLISTED)
	await page.waitForSelector(sel("select-token-add-token"), VISIBLE)
	// No list flags this address, in either run mode.
	expect(await page.$(sel("select-token-add-token-flagged"))).toBeNull()
	await shotSend(page, "send-picker-add", "select-token-add-token")
	await clickByTestId(page, "select-token-add-token")
	await waitForNewTokenAddress(page, UNLISTED)

	expect(await pressEscape(page)).toBe(true)
	await page.waitForFunction((s: string) => document.querySelector(s) === null, { timeout: 5_000 }, sel("token-address-field"))
	await page.waitForFunction(
		(s: string, q: string) => document.querySelector<HTMLInputElement>(`${s} input, input${s}`)?.value === q,
		{ timeout: 5_000 },
		sel("select-token-search"),
		UNLISTED,
	)
	expect(await page.$(sel("select-token-add-token"))).not.toBeNull()
	// A released trap hands focus back on a timer.
	await page.waitForFunction(() => document.activeElement !== document.body, { timeout: 5_000 })
	expect(await focusInPopupOf(page, "select-token-search")).toBe(true)

	expect(await pressEscape(page)).toBe(true)
	await waitForFocus(page, "send-token-trigger")
	expect(await page.$eval(sel("send-token-symbol"), (el) => el.textContent?.trim())).toBe(scope.token.symbol)
	expect((await readSendInputs(page)).destination).toBe(recipient)

	expect(ctx.consoleErrors).toEqual([])
	expect(ctx.pageErrors).toEqual([])
})
