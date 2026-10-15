/**
 * Home's hero when no price can be fetched: a funded wallet whose price-mapped holdings have no
 * usable quote shows "—" with "Prices unavailable", never a made-up $0.00. The provider is refused
 * before any profile exists, so no quote is ever cached; the funded sandbox wallet then arrives by
 * backup import (the agent build maps its token to a priced id).
 */

import { expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { interceptRpc } from "../fixtures/browser"
import { type ExtensionContext, launchExtension, test } from "../fixtures/extension"
import { switchToLocalNetwork, waitForHomeTotal, waitForTokenCardAmount } from "../fixtures/helpers"
import { shotSend } from "../fixtures/send-page"
import { exportFundedBackup } from "../helpers/crash-truth"
import { gotoPopupImport, importFullBackup, POPUP_IMPORT_SHELL, TEST_PASSWORD } from "../helpers/import-drivers"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

test.skipIf(!aztecConfig)(
	"a funded wallet whose price fetch failed shows Prices unavailable, not $0.00",
	{ timeout: 600_000 },
	async ({ tokenReadyExtension }) => {
		const { filePath } = await exportFundedBackup(tokenReadyExtension, aztecConfig!.tokenAddress)
		let ctx: ExtensionContext | undefined
		try {
			ctx = await launchExtension()
			await interceptRpc(ctx.browser, ctx.extensionId, "https://api.coingecko.com", { kind: "refuse" })
			const page = await gotoPopupImport(ctx)
			await importFullBackup(page, filePath, TEST_PASSWORD, POPUP_IMPORT_SHELL)
			await switchToLocalNetwork(page)
			await waitForHomeTotal(page)

			await page.waitForSelector('[data-testid="balance-prices-unavailable"]', { visible: true, timeout: 30_000 })
			const hero = await page.$eval('[data-testid="balance-amount"]', (el) => el.textContent?.trim() ?? "")
			expect(hero).toBe("—")
			expect(await page.$('[data-testid="balance-fiat-partial"]')).toBeNull()
			// The token row keeps its balance and shows no dollar figure.
			await waitForTokenCardAmount(page, "1,000", "TST")
			expect(await page.$('[data-testid="token-fiat"]')).toBeNull()
			await shotSend(page, "hero-prices-unavailable", "balance-amount")
		} finally {
			await ctx?.close()
		}
	},
)
