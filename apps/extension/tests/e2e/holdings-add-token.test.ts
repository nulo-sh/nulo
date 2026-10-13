/**
 * Holdings search offers to add a pasted contract address that no listed token matches, and the
 * offer hands the address to the New token popup. Nothing is submitted, so no node is needed: the
 * add itself is the network suite's (`network/holdings.test.ts`).
 */
import { expect } from "vitest"
import { clickByTestId, openPopup, replaceInputValue, test, waitForHash } from "./fixtures/extension"
import { openHoldings, waitForNewTokenAddress } from "./fixtures/helpers"
import { shotSend } from "./fixtures/send-page"

/** A curve point (a valid address) that no seeded token holds. */
const UNLISTED = "0x1200000000000000000000000000000000000000000000000000000000000002"

test("holdings search: a pasted address no token matches opens the New token popup filled in", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")
	await openHoldings(page)

	await replaceInputValue(page, '[data-testid="holdings-search"]', UNLISTED)
	await page.waitForSelector('[data-testid="holdings-add-token"]', { visible: true, timeout: 5_000 })
	expect(await page.$eval('[data-testid="holdings-add-token"]', (el) => el.textContent?.trim())).toBe("Add token 0x12…02")
	expect(await page.$('[data-testid="holdings-no-results"]')).toBeNull()
	await shotSend(page, "holdings-add-token", "holdings-add-token")

	await clickByTestId(page, "holdings-add-token")
	await waitForNewTokenAddress(page, UNLISTED)

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})
