import type { Page } from "puppeteer"
import { expect } from "vitest"
import { prepareKeys } from "./fixtures/browser"
import { openPopup, test, waitForHash } from "./fixtures/extension"
import { navigateByHash, seedUsdQuoteAndReload } from "./fixtures/helpers"
import { shotSend } from "./fixtures/send-page"
import { readActivityScope, seedTokenRow, seedTransaction } from "./helpers/activity-seeds"
import { focusRing, tabTo, tokenColor } from "./helpers/pointer-probes"

const sel = (testid: string) => `[data-testid="${testid}"]`

/** The seeded transaction's token, registered so its page opens. */
const TOKEN_ID = 1

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

// "View all" shows only once a fourth token has landed, which the live network behind smoke cannot
// promise: network/home-cap.test.ts covers it on four funded tokens.
test("View history on Home and on a token's page is a Tab stop after the token list, in the link colour with the accent ring, and Enter opens History", async ({
	registeredExtensionPerTest: ctx,
}) => {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general")
	const scope = await readActivityScope(page)
	await seedTransaction(page, scope, { hash: `0x${"5e".repeat(32)}`, amount: "1500000" })
	await seedUsdQuoteAndReload(page)
	await page.waitForSelector(sel("activity-view-all"), { visible: true, timeout: 15_000 })
	await waitForSettledTokens(page)
	await prepareKeys(page)
	await shotSend(page, "home-links-rest", "activity-view-all")

	await tabTo(page, "tokens-menu-trigger")
	// The nav bar follows the feed, so a walk that crosses it reached the link by wrapping the page.
	const onward = await tabTo(page, "activity-view-all")
	expect(
		onward.filter((id) => id === "BODY" || id.startsWith("nav-")),
		`the walk on: ${onward.join(" → ")}`,
	).toEqual([])
	await shotSend(page, "home-links-view-history-focused", "activity-view-all")
	await expectLinkLook(page, "activity-view-all")
	await page.keyboard.press("Enter")
	await waitForHash(page, "#/popup/activity")

	// Seeded after Home settles: a token row the wallet did not land holds its default token's seed open.
	await seedTokenRow(page, scope, TOKEN_ID)
	await seedUsdQuoteAndReload(page)
	await navigateByHash(page, `#/popup/tokens/${TOKEN_ID}`)
	await page.waitForSelector(sel("activity-view-all"), { visible: true, timeout: 15_000 })
	await prepareKeys(page)
	await tabTo(page, "activity-view-all")
	await shotSend(page, "token-page-view-history-focused", "activity-view-all")
	await expectLinkLook(page, "activity-view-all")
	await page.keyboard.press("Enter")
	await waitForHash(page, "#/popup/activity")

	expect(ctx.pageErrors).toEqual([])
}, 240_000)
