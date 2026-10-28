/**
 * The Send token picker with more than one token: choosing another token updates the trigger,
 * and re-opening the picker marks that row as selected. One extra token is deployed and imported
 * beside the fixture's TST; the import is waited for with the fixture's freshness-gated row check.
 * A token deployed and never imported is added from the picker by its pasted address, and Send
 * picks it with the form kept.
 */

import { expect, inject } from "vitest"
import { test as base, openPopup, waitForHash, clickByTestId, replaceInputValue } from "../fixtures/extension"
import { extraTokensFixture } from "../fixtures/extra-tokens"
import { selectSendToken, setActiveSendType, submitNewTokenPopup, waitForNewTokenAddress } from "../fixtures/helpers"
import { openSend, readSendInputs, shotSend } from "../fixtures/send-page"
import type { AztecTestConfig } from "../fixtures/aztec"
import { waitForFocus } from "../helpers/pointer-probes"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const ONE = 10n ** 18n

const test = base.extend<{ extraTokens: Record<string, string> }>({
	extraTokens: extraTokensFixture([{ symbol: "ALT", amount: 25n * ONE }]),
})

test.skipIf(!hasConfig)(
	"send picker: choosing another token updates the trigger and marks the row selected",
	{ timeout: 420_000 },
	async ({ tokenReadyExtension, extraTokens: _extraTokens }) => {
		const page = await openPopup(tokenReadyExtension)
		await waitForHash(page, "#/popup/general")

		// The trigger is inert until the page's tokens load; openSend waits for the token itself.
		await openSend(page)

		// Two tokens: the search box for a paste, both rows listed, the current token marked selected.
		await clickByTestId(page, "send-token-trigger")
		await page.waitForSelector('[data-testid="select-token-row"][data-symbol="ALT"]', { visible: true, timeout: 15_000 })
		expect(await page.$('[data-testid="select-token-search"]')).not.toBeNull()
		await shotSend(page, "send-picker-list", "select-token-search")
		const rows = await page.$$eval('[data-testid="select-token-row"]', (els) =>
			els.map((el) => ({ symbol: (el as HTMLElement).dataset.symbol, selected: (el as HTMLElement).dataset.selected })),
		)
		expect(rows.map((r) => r.symbol).sort()).toEqual(["ALT", "TST"])
		expect(rows.filter((r) => r.selected === "true")).toHaveLength(1)
		await page.evaluate(() => {
			;(document.querySelector('[data-testid="select-token-row"][data-symbol="ALT"]') as HTMLElement)?.click()
		})
		await page.waitForFunction(() => document.querySelector('[data-testid="send-token-symbol"]')?.textContent?.trim() === "ALT", {
			timeout: 10_000,
		})

		// Pick TST back through the helper, then re-open and read the selection marks.
		await selectSendToken(page, "TST")
		await clickByTestId(page, "send-token-trigger")
		await page.waitForSelector('[data-testid="select-token-row"][data-symbol="TST"]', { visible: true, timeout: 15_000 })
		const marks = await page.$$eval('[data-testid="select-token-row"]', (els) =>
			Object.fromEntries(els.map((el) => [(el as HTMLElement).dataset.symbol, (el as HTMLElement).dataset.selected])),
		)
		expect(marks).toEqual({ TST: "true", ALT: "false" })

		expect(tokenReadyExtension.consoleErrors).toEqual([])
		expect(tokenReadyExtension.pageErrors).toEqual([])
	},
)

const sel = (testid: string) => `[data-testid="${testid}"]`
const textOf = (testid: string, want: string) =>
	`document.querySelector('[data-testid="${testid}"]')?.textContent?.trim() === ${JSON.stringify(want)}`

test.skipIf(!hasConfig)(
	"send picker: a pasted address imports its token, picked with the recipient and amount kept, its unread side reading 0",
	{ timeout: 420_000, retry: 0 },
	async ({ tokenReadyExtension }) => {
		const config = aztecConfig as AztecTestConfig
		const { deployExtraTokensForAccount } = await import("../fixtures/aztec")
		const { PICK } = await deployExtraTokensForAccount(config, tokenReadyExtension.accountAddress, [
			{ symbol: "PICK", amount: 7n * ONE },
		])
		const page = await openPopup(tokenReadyExtension)
		await waitForHash(page, "#/popup/general")
		await openSend(page)

		// The fixture mints public tokens only: the amount field takes text on the funded side.
		await setActiveSendType(page, "send-from-type", "public")
		await page.waitForSelector(sel("send-amount-balance"), { visible: true, timeout: 30_000 })
		await replaceInputValue(page, `${sel("send-destination-field")} input`, config.minterAddress)
		await page.type(sel("send-amount-input"), "1")

		// From the focused card, so the closes after the import have a control to hand focus back to.
		await page.focus(sel("send-token-trigger"))
		await page.keyboard.press("Enter")
		await page.waitForSelector(sel("select-token-search"), { visible: true, timeout: 15_000 })
		await replaceInputValue(page, sel("select-token-search"), PICK)
		await clickByTestId(page, "select-token-add-token")
		await waitForNewTokenAddress(page, PICK)
		await submitNewTokenPopup(page)

		await waitForFocus(page, "send-token-trigger")
		await page.waitForFunction(textOf("send-token-symbol", "PICK"), { timeout: 15_000 })
		// The picker closed with New token: its leave transition removes it.
		await page.waitForFunction((s: string) => document.querySelector(s) === null, { timeout: 5_000 }, sel("select-token-search"))
		expect(await readSendInputs(page)).toEqual({ amount: "1", destination: config.minterAddress })
		// The pick re-selects the private side, which the mint never funded.
		await page.waitForFunction(textOf("send-amount-balance", "0 PICK"), { timeout: 30_000 })
		await shotSend(page, "send-amount-zero", "send-amount-row")

		await setActiveSendType(page, "send-from-type", "public")
		await page.waitForFunction(textOf("send-amount-balance", "7 PICK"), { timeout: 30_000 })
		await page.waitForSelector(sel("fee-estimate"), { visible: true, timeout: 120_000 })

		expect(tokenReadyExtension.consoleErrors).toEqual([])
		expect(tokenReadyExtension.pageErrors).toEqual([])
	},
)
