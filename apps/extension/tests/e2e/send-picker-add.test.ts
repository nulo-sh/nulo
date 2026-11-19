/**
 * Nothing is submitted, so no node is needed: the import and its pick are `network/send-picker.test.ts`'s.
 * The flag on a pasted address's add row is `token-list.test.ts`'s, since only a source run's list flags a pair.
 * A listed token's mark is the held list's picture, decoded under the real CSP after the worker sent
 * it, which no component test can show; an artifact run's published list may carry none.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { clickByTestId, openPopup, replaceInputValue, test, waitForHash } from "./fixtures/extension"
import { getAccountAddress, navigateByHash, seedUsdQuoteAndReload } from "./fixtures/helpers"
import { chooseRecipient, openSend, readSendInputs, shotSend } from "./fixtures/send-page"
import { E2E_LIST_TOKENS, heldListEntries, skipUnlessListPrices } from "./fixtures/token-list"
import { waitForNewTokenAddress } from "./fixtures/tokens"
import { readActivityScope, seedTokenRow } from "./helpers/activity-seeds"
import { focusInPopupOf, pressEscape, waitForFocus } from "./helpers/pointer-probes"

const sel = (testid: string) => `[data-testid="${testid}"]`
const VISIBLE = { visible: true, timeout: 15_000 } as const
/** A curve point no seeded token holds. */
const UNLISTED = "0x1200000000000000000000000000000000000000000000000000000000000002"
/** A token the person added, on no list. */
const ADDED = { contract: `0x${"0".repeat(62)}c5`, name: "Mine", symbol: "MINE", decimals: 6 }

/** The mark inside `within` once it shows `kind`, the list's snapshot arriving after the token, and
 *  a picture once it has finished: decoded, or failed and about to fall back to initials. */
async function drawnMark(page: Page, within: string, kind: "logo" | "initials"): Promise<{ kind: string | null; width: number }> {
	const mark = `${within} ${sel("token-mark")}`
	const logo = `${mark} ${sel("token-mark-logo")}`
	await page.waitForSelector(`${mark}[data-kind="${kind}"]`, VISIBLE)
	if (kind === "logo") {
		await page.waitForFunction((s: string) => document.querySelector<HTMLImageElement>(s)?.complete !== false, { timeout: 5_000 }, logo)
	}
	return page.$eval(
		mark,
		(el, s: string) => ({ kind: el.getAttribute("data-kind"), width: document.querySelector<HTMLImageElement>(s)?.naturalWidth ?? 0 }),
		logo,
	)
}

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
	await seedTokenRow(page, scope, 2, { token: ADDED })
	await seedUsdQuoteAndReload(page, scope.token.priceId)
	const recipient = await getAccountAddress(page)
	await openSend(page)
	await chooseRecipient(page, recipient)
	await page.waitForSelector(sel("send-token-symbol"), VISIBLE)
	const pictured = heldListEntries().some((e) => e.address === scope.token.contract && e.icon !== undefined)
	expect(pictured || !E2E_LIST_TOKENS.some((e) => e.address === scope.token.contract), "a source run's list pictures its tokens").toBe(
		true,
	)
	const asset = await drawnMark(page, sel("send-token-trigger"), pictured ? "logo" : "initials")
	expect(asset.kind).toBe(pictured ? "logo" : "initials")
	if (pictured) expect(asset.width, "the listed picture decoded").toBeGreaterThan(0)
	await shotSend(page, "send-asset-mark", "send-token-trigger")

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

	await navigateByHash(page, "#/popup/tokens/2", 10_000)
	await page.waitForFunction(
		(s: string, symbol: string) => document.querySelector(s)?.textContent?.trim() === symbol,
		{ timeout: 10_000 },
		sel("subpage-title"),
		ADDED.symbol,
	)
	expect(await drawnMark(page, sel("token-hero"), "initials")).toEqual({ kind: "initials", width: 0 })

	expect(ctx.consoleErrors).toEqual([])
	expect(ctx.pageErrors).toEqual([])
})
