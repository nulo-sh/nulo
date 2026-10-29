/**
 * The signed token list from the moment the Terms are accepted. A loopback host with the Worker's
 * headers serves lists a per-run key signs, and the armed build reads that host and key from
 * `nulo:e2e:token-list`. An artifact build pins the production keys, so this spec runs only in a
 * source run; the artifact run's leg is `shipped-token-list.test.ts`.
 */
import type { Page } from "puppeteer"
import { describe, expect, inject } from "vitest"
import { TOKEN_LIST_SOURCE_KEY } from "@/e2e/chrome-storage-token-list"
import { extensionUrl, isFirefox, newPage, openScratchPage, stopBackground } from "./fixtures/browser"
import { type ExtensionContext, clickByTestId, openPopup, replaceInputValue, test, waitForHash } from "./fixtures/extension"
import { navigateByHash, openHoldings, switchToNetwork, unlockAfterBackgroundDeath } from "./fixtures/helpers"
import { shotSend } from "./fixtures/send-page"
import {
	E2E_LIST_FLAGGED,
	E2E_LIST_TOKENS,
	type ListHost,
	e2eSigner,
	heldListEntries,
	requestListRefresh,
	serveTokenList,
	signForgedList,
	signTestList,
	waitForStoredList,
} from "./fixtures/token-list"
import { readScopeIdentity, seedTokenRow } from "./helpers/activity-seeds"
import { refuseTestnet } from "./helpers/contacts"
import { createProfileAcceptingTerms } from "./helpers/legal-drivers"

const SEED_ROW = '[data-testid="token-seed-row"]'
const sel = (testid: string) => `[data-testid="${testid}"]`
const VISIBLE = { visible: true, timeout: 15_000 } as const

/** A cookie the host set through a top-level visit: a request that carried credentials would send it. */
async function storeHostCookie(ctx: ExtensionContext, host: ListHost): Promise<void> {
	const tab = await newPage(ctx.browser)
	try {
		await tab.goto(host.cookieUrl, { waitUntil: "load" })
	} finally {
		await tab.close().catch(() => {})
	}
}

/**
 * Seeds a token row for the pair the held list flags, with a balance, then restarts the worker: the
 * balance service reads its token map only as it starts. The caller holds the Testnet RPC refused,
 * or a refresh writes the real zero over the seed.
 */
async function openHomeHoldingFlagged(ctx: ExtensionContext): Promise<Page> {
	const seeder = await openPopup(ctx)
	await waitForHash(seeder, "#/popup/general", 30_000)
	const identity = await readScopeIdentity(seeder)
	const [pair] = E2E_LIST_FLAGGED
	if (identity.chainId !== pair.chainId)
		throw new Error(`the profile is on chain ${identity.chainId}, the flagged pair on ${pair.chainId}`)
	// Transfer functions, so the token page and Send read as for any sendable token; balance
	// functions, so a refresh asks the refused node: a token without one reads that side as 0.
	const transfers = Object.fromEntries(
		[
			"transferPublicFn",
			"transferPrivateFn",
			"transferPublicToPrivateFn",
			"transferPrivateToPublicFn",
			"balanceOfPublicFn",
			"balanceOfPrivateFn",
		].map((key) => [key, { name: key, impl: 0 }]),
	)
	const scope = { ...identity, token: { contract: pair.address, name: "Scam Token", symbol: "SCAM", decimals: 6, ...transfers } }
	await seedTokenRow(seeder, scope, 1)
	await seeder.evaluate(
		(key: string, row: string) => chrome.storage.local.set({ [key]: row }),
		"nulo:core:token-balances@1",
		JSON.stringify({
			id: 1,
			token: 1,
			account: scope.account,
			profileId: scope.profileId,
			chainId: scope.chainId,
			contract: pair.address,
			publicBalance: "50000000000",
			privateBalance: "0",
			updatedAt: Date.now(),
		}),
	)
	// Firefox keeps its event page alive while an extension page is open.
	for (const open of await ctx.browser.pages()) {
		if (open.url().startsWith(extensionUrl(ctx.extensionId, "/"))) await open.close()
	}
	await stopBackground(ctx)
	const page = await openPopup(ctx)
	await unlockAfterBackgroundDeath(page)
	return page
}

async function seedRowSymbols(page: Page): Promise<string[]> {
	return (await page.$$eval(SEED_ROW, (rows) => rows.map((row) => row.getAttribute("data-symbol") ?? "?"))).sort()
}

describe.skipIf(inject("liveLeg") === true)("the signed token list", () => {
	test("accepting the Terms fetches the list, whose defaults show as placeholders; a forged list and an older one change nothing; no request carries a cookie, a referrer or a cache validator", {
		timeout: 180_000,
		retry: 0,
	}, async ({ freshExtensionPerTest: ctx }) => {
		const host = await serveTokenList()
		try {
			const first = await signTestList()
			host.serve(first)
			await storeHostCookie(ctx, host)
			const control = await openScratchPage(ctx.browser, ctx.extensionId)
			const { pinned } = await e2eSigner()
			await control.evaluate((key: string, source: unknown) => chrome.storage.session.set({ [key]: source }), TOKEN_LIST_SOURCE_KEY, {
				url: host.url,
				publicKey: pinned.publicKey,
			})

			await createProfileAcceptingTerms(ctx)
			await waitForStoredList(control, (state) => state.envelope === first)
			expect(host.requests()).toHaveLength(1)

			const popup = await openPopup(ctx)
			await waitForHash(popup, "#/popup/general", 30_000)
			// The list names Testnet tokens only, and a new profile starts on Mainnet.
			await switchToNetwork(popup, "Testnet")
			await popup.waitForSelector(SEED_ROW, { visible: true, timeout: 30_000 })
			const listed = new Set(heldListEntries().map((e) => e.symbol))
			const shown = await seedRowSymbols(popup)
			expect(
				shown.every((symbol) => listed.has(symbol)),
				`seed rows ${shown.join(", ")}`,
			).toBe(true)

			host.serve(await signForgedList())
			await requestListRefresh(control)
			expect((await waitForStoredList(control, (state) => state.failures === 1)).envelope).toBe(first)

			host.serve(await signTestList({ nowMs: Date.now() - 60 * 60 * 1000 }))
			await requestListRefresh(control)
			expect((await waitForStoredList(control, (state) => state.failures === 2)).envelope).toBe(first)
			expect(await seedRowSymbols(popup)).toEqual(shown)

			expect(host.requests()).toHaveLength(3)
			for (const request of host.requests()) {
				expect(request.cookie, "a list request carried a cookie").toBeUndefined()
				expect(request.referer, "a list request carried a referrer").toBeUndefined()
				expect(request.ifNoneMatch, "a list request carried a cache validator").toBeUndefined()
			}
			console.log(`[token-list] ${isFirefox ? "Firefox" : "Chrome"} sends Origin: ${host.requests()[0]?.origin ?? "(none)"}`)
		} finally {
			await host.stop()
		}
	})

	test("a token the held list flags reads the warning on its Home, Holdings and Send picker rows; its page and the Send form carry the banner; a pasted flagged address carries it on the picker's add row", {
		timeout: 180_000,
		retry: 0,
	}, async ({ listedExtensionPerTest: ctx }) => {
		const refusal = await refuseTestnet(ctx)
		try {
			const page = await openHomeHoldingFlagged(ctx)
			await page.waitForSelector(`${sel("tokens-card")} ${sel("token-flagged")}`, VISIBLE)
			const rows = await page.$$eval(
				sel("tokens-card"),
				(cards, symbol: string, flagged: string) =>
					cards.map((card) => [card.querySelector(symbol)?.getAttribute("data-symbol"), card.querySelector(flagged) !== null]),
				sel("token-symbol"),
				sel("token-flagged"),
			)
			expect(rows).toEqual([["SCAM", true]])
			await shotSend(page, "flagged-home", "token-flagged")

			await openHoldings(page)
			await page.waitForSelector(`${sel("holdings-page")} ${sel("token-flagged")}`, VISIBLE)
			await shotSend(page, "flagged-holdings", "token-flagged")

			await navigateByHash(page, "#/popup/tokens/1", 10_000)
			await page.waitForSelector(sel("token-flagged-banner"), VISIBLE)
			await shotSend(page, "flagged-token-page", "token-flagged-banner")

			await navigateByHash(page, "#/popup/send?tokenId=1", 10_000)
			await page.waitForSelector(sel("token-flagged-banner"), VISIBLE)
			await shotSend(page, "flagged-send", "token-flagged-banner")

			await clickByTestId(page, "send-token-trigger")
			await page.waitForSelector(`${sel("select-token-row")}[data-symbol="SCAM"] ${sel("select-token-flagged")}`, VISIBLE)
			await shotSend(page, "flagged-send-picker", "select-token-flagged")

			const [, unheld] = E2E_LIST_FLAGGED
			await replaceInputValue(page, sel("select-token-search"), unheld.address.toUpperCase().replace("0X", "0x"))
			await page.waitForSelector(sel("select-token-add-token-flagged"), VISIBLE)
			expect(await page.$eval(sel("select-token-add-token"), (el) => (el as HTMLButtonElement).disabled)).toBe(false)
			await shotSend(page, "send-picker-flagged", "select-token-add-token")
			// A listed token nothing holds: its add row carries no flag.
			await replaceInputValue(page, sel("select-token-search"), E2E_LIST_TOKENS[1].address)
			await page.waitForFunction(
				(s: string) => document.querySelector(s) === null,
				{ timeout: 5_000 },
				sel("select-token-add-token-flagged"),
			)
			expect(await page.$(sel("select-token-add-token"))).not.toBeNull()
		} finally {
			await refusal.stop()
		}
		expect(ctx.pageErrors).toEqual([])
	})
})
