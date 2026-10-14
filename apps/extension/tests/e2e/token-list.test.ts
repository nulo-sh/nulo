/**
 * The signed token list from the moment the Terms are accepted. A loopback host with the Worker's
 * headers serves lists a per-run key signs, and the armed build reads that host and key from
 * `nulo:e2e:token-list`. An artifact build pins the production keys, so this spec runs only in a
 * source run; the artifact run's leg is `shipped-token-list.test.ts`.
 */
import type { Page } from "puppeteer"
import { describe, expect, inject } from "vitest"
import { TOKEN_LIST_SOURCE_KEY } from "@/e2e/chrome-storage-token-list"
import { isFirefox, newPage, openScratchPage } from "./fixtures/browser"
import { type ExtensionContext, openPopup, test, waitForHash } from "./fixtures/extension"
import {
	type ListHost,
	e2eSigner,
	heldListEntries,
	requestListRefresh,
	serveTokenList,
	signForgedList,
	signTestList,
	waitForStoredList,
} from "./fixtures/token-list"
import { createProfileAcceptingTerms } from "./helpers/legal-drivers"

const SEED_ROW = '[data-testid="token-seed-row"]'

/** A cookie the host set through a top-level visit: a request that carried credentials would send it. */
async function storeHostCookie(ctx: ExtensionContext, host: ListHost): Promise<void> {
	const tab = await newPage(ctx.browser)
	try {
		await tab.goto(host.cookieUrl, { waitUntil: "load" })
	} finally {
		await tab.close().catch(() => {})
	}
}

async function seedRowSymbols(page: Page): Promise<string[]> {
	return (await page.$$eval(SEED_ROW, (rows) => rows.map((row) => row.getAttribute("data-symbol") ?? "?"))).sort()
}

describe.skipIf(inject("liveLeg") === true)("the signed token list", () => {
	test("accepting the Terms fetches the list, whose defaults show as placeholders; a forged list and an older one change nothing; no request carries a cookie or a referrer", {
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
			}
			console.log(`[token-list] ${isFirefox ? "Firefox" : "Chrome"} sends Origin: ${host.requests()[0]?.origin ?? "(none)"}`)
		} finally {
			await host.stop()
		}
	})
})
