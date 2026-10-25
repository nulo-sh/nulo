/**
 * Privacy mode at the wire. With it on, opening a received public transfer sends the node nothing
 * that names the transaction, and only a press of "Show fee" sends the lookup; with it off, opening
 * the page sends it. Component tests mock the client, so only here does a request visibly leave.
 *
 * The default network is active; its node's origin is redirected to a stub that logs every method
 * and answers each with `null`, a reply every caller refuses at once, so no lookup hangs or retries
 * and each one is one logged request.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { interceptRpc } from "./fixtures/browser"
import { clickByTestId, openPopup, test, waitForHash } from "./fixtures/extension"
import { navigateByHash, navigateToSettings } from "./fixtures/helpers"
import { DEFAULT_NODE_ORIGIN } from "./fixtures/networks"
import { readActivityScope, seedPublicReceipt, seedTokenRow } from "./helpers/activity-seeds"
import { startStub } from "./helpers/rpc-stub"

const RECEIPT_LOOKUP = "aztec_getTxReceipt"
const TOKEN_ID = 911
/** Below the BN254 modulus, so the lookup's hash parse accepts it. */
const TX_HASH = `0x${"1d".repeat(32)}`
/** How long an open page is watched for a lookup it must not make. */
const QUIET_MS = 3_000

const sel = (testId: string) => `[data-testid="${testId}"]`

/** From any page: the received page has no bottom nav, so it goes home first. */
async function setPrivacyMode(page: Page, on: boolean): Promise<void> {
	await navigateByHash(page, "#/popup/general")
	await waitForHash(page, "#/popup/general")
	await navigateToSettings(page, "privacy")
	const state = () => page.$eval(sel("privacy-mode-toggle"), (el) => el.getAttribute("data-toggle-active"))
	await page.waitForSelector(sel("privacy-mode-toggle"), { visible: true, timeout: 10_000 })
	if ((await state()) !== String(on)) await clickByTestId(page, "privacy-mode-toggle")
	await page.waitForFunction(
		(s: string, want: string) => document.querySelector(s)?.getAttribute("data-toggle-active") === want,
		{ timeout: 5_000, polling: 50 },
		sel("privacy-mode-toggle"),
		String(on),
	)
}

test("privacy mode holds the receipt fee lookup until Show fee; with it off, opening the page looks it up", {
	timeout: 180_000,
	retry: 0,
}, async ({ registeredExtensionPerTest: ctx }) => {
	const stub = await startStub(() => null)
	const lookups = () => stub.methods.filter((m) => m === RECEIPT_LOOKUP).length
	try {
		const node = await interceptRpc(ctx.browser, ctx.extensionId, DEFAULT_NODE_ORIGIN, { kind: "redirect", to: stub.url })
		try {
			const page = await openPopup(ctx)
			await waitForHash(page, "#/popup/general", 30_000)
			const scope = await readActivityScope(page)
			await seedTokenRow(page, scope, TOKEN_ID)
			const id = await seedPublicReceipt(page, scope, { tokenId: TOKEN_ID, amount: "4200000", txHash: TX_HASH })
			const receiptHash = `#/popup/received/${id}`

			await setPrivacyMode(page, true)
			const started = Date.now()
			await navigateByHash(page, receiptHash)
			await page.waitForSelector(sel("received-fee-show"), { visible: true, timeout: 15_000 })
			await new Promise((r) => setTimeout(r, QUIET_MS))
			expect(lookups(), "lookups before the press").toBe(0)

			await clickByTestId(page, "received-fee-show")
			await expect.poll(lookups, { timeout: 15_000, interval: 100 }).toBe(1)
			await page.waitForSelector(sel("received-fee-show"), { visible: true, timeout: 15_000 })
			console.log(`[received-fee-privacy] mode on: open to press answered in ${Date.now() - started} ms`)

			await setPrivacyMode(page, false)
			await navigateByHash(page, receiptHash)
			await page.waitForSelector(sel("received-fee-none"), { visible: true, timeout: 15_000 })
			expect(lookups(), "lookups after opening with the mode off").toBe(2)

			expect(await node.failures(), "testnet interception failures").toEqual([])
			expect(ctx.pageErrors).toEqual([])
			await page.close()
		} finally {
			await node.stop()
		}
	} finally {
		await stub.close()
	}
})
