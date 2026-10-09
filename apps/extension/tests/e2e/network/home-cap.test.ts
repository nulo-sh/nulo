/**
 * Home shows at most three token rows, ordered by value, with a "View all" link when more exist.
 * Four tokens on the sandbox (the fixture's TST + three deployed here) and a seeded quote — the
 * agent build maps every sandbox contract to USDC, so a quote prices them all and the biggest
 * balance ranks first. Every imported token is waited for with the same freshness-gated row check
 * the fixture uses, so the assertions never race the balance projector.
 */

import { expect, inject } from "vitest"
import { prepareKeys } from "../fixtures/browser"
import { test as base, openPopup, waitForHash } from "../fixtures/extension"
import { extraTokensFixture } from "../fixtures/extra-tokens"
import { seedUsdQuoteAndReload } from "../fixtures/helpers"
import { shotSend } from "../fixtures/send-page"
import { focusRing, tabAround, tabTo, tokenColor, waitForFocus } from "../helpers/pointer-probes"
import type { AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const ONE = 10n ** 18n

// Fixture: TST with 1000 public. Add BIG (5000), MID (10), TINY (1) — four tokens total.
const test = base.extend<{ extraTokens: Record<string, string> }>({
	extraTokens: extraTokensFixture([
		{ symbol: "BIG", amount: 5000n * ONE },
		{ symbol: "MID", amount: 10n * ONE },
		{ symbol: "TINY", amount: 1n * ONE },
	]),
})

const homeSymbols = (page: Awaited<ReturnType<typeof openPopup>>) =>
	page.$$eval('[data-testid="tokens-card"] [data-testid="token-symbol"]', (els) => els.map((el) => (el as HTMLElement).dataset.symbol))

test.skipIf(!hasConfig)(
	"home caps at three value-ordered rows and links to Holdings by keyboard when more exist",
	{ timeout: 420_000 },
	async ({ tokenReadyExtension, extraTokens: _extraTokens }) => {
		const page = await openPopup(tokenReadyExtension)
		await waitForHash(page, "#/popup/general")

		await seedUsdQuoteAndReload(page)

		await page.waitForFunction(
			() =>
				[...document.querySelectorAll('[data-testid="tokens-card"] [data-testid="token-symbol"]')]
					.map((el) => (el as HTMLElement).dataset.symbol)
					.join(",") === "BIG,TST,MID",
			{ timeout: 60_000 },
		)
		expect(await homeSymbols(page)).toEqual(["BIG", "TST", "MID"])
		expect(await page.$eval('[data-testid="tokens-count"]', (el) => el.textContent?.trim())).toBe("4")

		await prepareKeys(page)
		await tabTo(page, "tokens-view-all")
		await shotSend(page, "home-cap-view-all-focused", "tokens-view-all")
		const viewAll = '[data-testid="tokens-view-all"]'
		expect(await page.$eval(viewAll, (el) => getComputedStyle(el).color)).toBe(await tokenColor(page, "--nulo-secondary"))
		expect(await focusRing(page, "tokens-view-all")).toEqual({ ring: "solid 2px 2px", color: await tokenColor(page, "--nulo-accent") })
		expect(await tabAround(page, 1)).toEqual(["tokens-menu-trigger"])
		await page.keyboard.down("Shift")
		await page.keyboard.press("Tab")
		await page.keyboard.up("Shift")
		await waitForFocus(page, "tokens-view-all")
		await page.keyboard.press("Enter")
		await waitForHash(page, "#/popup/holdings")
		await page.waitForSelector('[data-testid="holdings-page"] [data-testid="token-symbol"][data-symbol="TINY"]', {
			visible: true,
			timeout: 30_000,
		})

		expect(tokenReadyExtension.consoleErrors).toEqual([])
		expect(tokenReadyExtension.pageErrors).toEqual([])
	},
)
