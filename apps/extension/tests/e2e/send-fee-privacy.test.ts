/**
 * Fail-closed under a dead node: with NOTHING readable, the Send page pays with nothing, never shows
 * the account's own public Fee Juice as the payer, never claims "you have no gas" about balances
 * nobody read — and, with no token to send, says nothing about what a send would publish: no publish
 * line, no warning, no fee-source tag.
 *
 * What this does NOT prove is the selection rule itself — with both balances unread, Fee Juice is
 * ineligible under any walk order, so a rule that wrongly defaulted to it on an unread PRIVATE balance
 * would still pass here. That case (private unread, public held) cannot be staged end to end: the
 * private leg is a PXE-local simulation, not an interceptable request. It is pinned where it can be —
 * `fee-privacy.test.ts` and the "by knowledge state" cases in `FeeSettingsCard.test.ts` — and the
 * funded shapes are covered against a real chain in `network/fee-methods.test.ts`.
 *
 * A new profile is on the default network; its node's origin is refused inside the browser, so the
 * run does not depend on the public endpoint being up or down.
 */
import { describe, expect } from "vitest"
import { interceptRpc } from "./fixtures/browser"
import { openPopup, test, waitForHash } from "./fixtures/extension"
import { DEFAULT_NODE_ORIGIN } from "./fixtures/networks"
import { chooseRecipient, openSend } from "./fixtures/send-page"

/** Wire-shaped and on the curve; the form only needs someone to pay. */
const RECIPIENT = "0x09c1c9d2ce72c53c2451f8e9add86ccb8cb284dd4dc4f0eaf301b40b38a9459b"

/** The card has settled once it either shows a method or explains why it shows none. Before that —
 *  a fresh profile has no saved pick to preview — neither is present, so no assertion below can pass
 *  against a card that simply has not resolved yet. */
const SETTLED = `(() => {
	const payers = document.querySelector('[data-testid="send-fee-payers"]')
	return Boolean(payers?.getAttribute("data-fee-method")) || Boolean(document.querySelector('[data-testid="fee-init-degraded"]'))
})()`

describe("send fee privacy (dead RPC)", () => {
	test("with nothing readable the card pays with nothing and blames no empty balance", { timeout: 180_000, retry: 0 }, async ({
		registeredExtensionPerTest: ctx,
	}) => {
		const interception = await interceptRpc(ctx.browser, ctx.extensionId, DEFAULT_NODE_ORIGIN, { kind: "refuse" })
		try {
			const page = await openPopup(ctx)
			await waitForHash(page, "#/popup/general", 30_000)
			await openSend(page)
			await chooseRecipient(page, RECIPIENT)
			// The card stays mounted behind its sheet, so it is read without opening it.
			await page.waitForSelector('[data-testid="send-fee-payers"]', { timeout: 30_000 })

			// Private is the Send page's default origin — asserted, not assumed.
			const origin = await page.$eval('[data-testid="fee-settings-card"]', (el) => el.getAttribute("data-origin"))
			expect(origin).toBe("private")

			await page.waitForFunction(SETTLED, { timeout: 120_000, polling: 500 })

			const state = await page.evaluate(() => ({
				method: document.querySelector('[data-testid="send-fee-payers"]')?.getAttribute("data-fee-method") ?? null,
				publish: Boolean(document.querySelector('[data-testid="send-publish"]')),
				warning: Boolean(document.querySelector('[data-testid="send-fee-warning"]')),
				explained: Boolean(document.querySelector('[data-testid="fee-init-degraded"]')),
				takeover: Boolean(document.querySelector('[data-testid="send-get-fee-juice"]')),
			}))
			console.log(`[send-fee-privacy] settled: ${JSON.stringify(state)}`)

			expect(state.method).not.toBe("public")
			// No token, nothing to send: the page makes no claim about what a send would publish.
			expect(state.publish).toBe(false)
			expect(state.warning).toBe(false)
			// Nothing was read, so nothing is known to be empty: no "you have no gas" takeover either.
			expect(state.takeover).toBe(false)
			// Either a payer that does not name the account, or no payer plus the reason why.
			expect(state.method !== null || state.explained).toBe(true)

			expect(await interception.failures()).toEqual([])
			expect(await interception.hits()).toBeGreaterThan(0)
			await page.close()
		} finally {
			await interception.stop()
		}
	})
})
