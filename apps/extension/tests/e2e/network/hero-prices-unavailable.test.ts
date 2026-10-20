/**
 * Home's hero when no price can be fetched: a funded wallet whose price-mapped holdings have no
 * usable quote shows "—" with "Prices unavailable", never a made-up $0.00. The provider is refused
 * before any profile exists, so no quote is ever cached; the funded sandbox wallet then arrives by
 * backup import (the agent build maps its token to a priced id).
 */

import { expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { interceptRpc } from "../fixtures/browser"
import { clickByTestId, type ExtensionContext, launchExtension, test } from "../fixtures/extension"
import { navigateByHash, revealSeedPhrase, switchToLocalNetwork, waitForHomeTotal, waitForTokenCardAmount } from "../fixtures/helpers"
import { shotSend } from "../fixtures/send-page"
import { getStartedRows, waitForHomeReminders } from "../fixtures/tokens"
import { exportFundedBackup } from "../helpers/crash-truth"
import { gotoPopupImport, importFullBackup, POPUP_IMPORT_SHELL, TEST_PASSWORD } from "../helpers/import-drivers"
import { profileImportedKey } from "@/utils/profile-ui-keys"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

test.skipIf(!aztecConfig)(
	"a funded wallet whose price fetch failed shows Prices unavailable, not $0.00",
	{ timeout: 600_000 },
	async ({ tokenReadyExtension }) => {
		const { filePath } = await exportFundedBackup(tokenReadyExtension, aztecConfig!.tokenAddress)
		let ctx: ExtensionContext | undefined
		try {
			ctx = await launchExtension()
			const refused = await interceptRpc(ctx.browser, ctx.extensionId, "https://api.coingecko.com", { kind: "refuse" })
			const page = await gotoPopupImport(ctx)
			await importFullBackup(page, filePath, TEST_PASSWORD, POPUP_IMPORT_SHELL)
			await switchToLocalNetwork(page)
			await waitForHomeTotal(page)

			await page.waitForSelector('[data-testid="balance-prices-unavailable"]', { visible: true, timeout: 30_000 })
			const hero = await page.$eval('[data-testid="balance-amount"]', (el) => el.textContent?.trim() ?? "")
			expect(hero).toBe("—")
			expect(await page.$('[data-testid="balance-fiat-partial"]')).toBeNull()
			await waitForTokenCardAmount(page, "1,000", "TST")
			expect(await page.$('[data-testid="token-fiat"]')).toBeNull()
			expect(await refused.hits(), "price requests refused").toBeGreaterThan(0)
			expect(await refused.failures(), "price interception failures").toEqual([])
			await shotSend(page, "hero-prices-unavailable", "balance-amount")

			// A restored wallet asks for no backup.
			await waitForHomeReminders(page)
			expect(await page.$('[data-testid="get-started"]')).toBeNull()
			expect(await page.$('[data-testid="backup-reminder-banner"]')).toBeNull()

			// Without the import record the wallet reads as a first created one, whose funds no price
			// covers still need the phrase saved: the card asks first, the banner only once it is hidden.
			await page.evaluate(async (prefix: string) => {
				const keys = Object.keys(await chrome.storage.local.get(null)).filter((key) => key.startsWith(prefix))
				if (keys.length !== 1) throw new Error(`expected one import record, saw ${keys.length}`)
				await chrome.storage.local.remove(keys)
			}, profileImportedKey(""))
			await page.waitForSelector('[data-testid="get-started-phrase"]', { visible: true, timeout: 30_000 })
			// The Fee Juice step's state after the import is not fixed, so only the order is read.
			const rows = await getStartedRows(page)
			expect(rows[0]).toBe("get-started-phrase")
			expect(rows.map((row) => row.replace(/ done$/, ""))).toEqual([
				"get-started-phrase",
				"get-started-aztec",
				"get-started-feeJuice",
				"get-started-presto",
			])
			expect(await page.$eval('[data-testid="get-started-phrase"]', (el) => el.getAttribute("aria-current"))).toBe("step")
			expect(await page.$eval('[data-testid="get-started-count"]', (el) => el.textContent)).toMatch(/^\d of 4 done$/)
			expect(await page.$('[data-testid="backup-reminder-banner"]')).toBeNull()

			await clickByTestId(page, "get-started-hide")
			await page.waitForSelector('[data-testid="backup-reminder-banner"]', { visible: true, timeout: 30_000 })
			expect(await page.$('[data-testid="get-started"]')).toBeNull()
			await shotSend(page, "home-backup-reminder", "backup-reminder-banner")

			await revealSeedPhrase(page, TEST_PASSWORD)
			await navigateByHash(page, "#/popup/general")
			await waitForHomeReminders(page)
			// The reveal does not await its flag write, so Home can first read the phrase as unsaved.
			await page.waitForFunction(
				() => !document.querySelector('[data-testid="backup-reminder-banner"], [data-testid="get-started"]'),
				{ timeout: 15_000, polling: 100 },
			)
		} finally {
			await ctx?.close()
		}
	},
)
