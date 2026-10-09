/** In a real browser: Home's two view links are Tab stops in reading order, read in the link colour,
 *  show the accent ring on focus, and open their pages on Enter. */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { prepareKeys } from "./fixtures/browser"
import { openPopup, test, waitForHash } from "./fixtures/extension"
import { navigateByHash, seedUsdQuoteAndReload } from "./fixtures/helpers"
import { shotSend } from "./fixtures/send-page"
import { readActivityScope, seedTransaction } from "./helpers/activity-seeds"
import { focusRing, tabAround, tabTo, tokenColor } from "./helpers/pointer-probes"

const sel = (testid: string) => `[data-testid="${testid}"]`

/** The default tokens land from the live network; a failing node holds them through the seeder's
 *  retry waits (15 s, then 60 s). */
const TOKENS_LAND_MS = 150_000

/** Home's token list has answered and no row in it is still on its way in, so the Tab walk below
 *  crosses a list that no longer changes. */
async function waitForSettledTokens(page: Page): Promise<void> {
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="tokens-list"][data-settled="true"]') !== null &&
			document.querySelector(
				'[data-testid="token-balance-loading"], [data-testid="tokens-skeleton-row"], [data-testid="token-import-row"]',
			) === null,
		{ timeout: TOKENS_LAND_MS, polling: 200 },
	)
}

async function expectLinkLook(page: Page, testid: string): Promise<void> {
	const color = await page.$eval(sel(testid), (el) => getComputedStyle(el).color)
	expect(color, `${testid}'s text colour`).toBe(await tokenColor(page, "--nulo-secondary"))
	expect(await focusRing(page, testid)).toEqual({ ring: "solid 2px 2px", color: await tokenColor(page, "--nulo-accent") })
}

test("Home's View all and View history are Tab stops in the link colour with the accent ring, and Enter opens Holdings and History", async ({
	registeredExtensionPerTest: ctx,
}) => {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general")
	await seedTransaction(page, await readActivityScope(page), { hash: `0x${"5e".repeat(32)}`, amount: "1500000" })
	await seedUsdQuoteAndReload(page)
	await page.waitForSelector(sel("activity-view-all"), { visible: true, timeout: 15_000 })
	await waitForSettledTokens(page)
	await page.waitForSelector(sel("tokens-view-all"), { visible: true, timeout: 5_000 })
	await prepareKeys(page)
	await shotSend(page, "home-links-rest", "tokens-view-all")

	const walk = await tabTo(page, "tokens-view-all")
	console.log(`[home-links] the Tab walk to View all: ${walk.join(" → ")}`)
	await shotSend(page, "home-links-view-all-focused", "tokens-view-all")
	await expectLinkLook(page, "tokens-view-all")
	expect(await tabAround(page, 1)).toEqual(["tokens-menu-trigger"])

	await tabTo(page, "activity-view-all")
	await shotSend(page, "home-links-view-history-focused", "activity-view-all")
	await expectLinkLook(page, "activity-view-all")
	await page.keyboard.press("Enter")
	await waitForHash(page, "#/popup/activity")

	await navigateByHash(page, "#/popup/general")
	await page.waitForSelector(sel("tokens-view-all"), { visible: true, timeout: 15_000 })
	await tabTo(page, "tokens-view-all")
	await page.keyboard.press("Enter")
	await waitForHash(page, "#/popup/holdings")

	expect(ctx.pageErrors).toEqual([])
}, 240_000)
