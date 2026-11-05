/**
 * A10's capture, opt-in with the other stale-network captures (`STALE_NETWORK_CAPTURES=1`, Chrome
 * only): the toast a send gets when an imported account's stored key does not open. It runs in the
 * network suite because the Send page reaches a send only over a live node's balance.
 *
 * The token-ready profile's funded account is exported and imported into a second profile, and its
 * stored key there is made unreadable once the fee is estimated: the estimate needs the key too, and
 * stops the form before any send when the key never opens. Send opened again reads the fee afresh,
 * which needs the key, so it closes onto Home with the same toast (A10b).
 */
import { describe, expect, inject } from "vitest"
import { IMPORTED_UNUSABLE_TOAST } from "@/components/stale-network/copy"
import type { AztecTestConfig } from "../fixtures/aztec"
import { isFirefox, setViewport } from "../fixtures/browser"
import { clickByTestId, launchExtension, openPopup, registerProfile, test, waitForHash } from "../fixtures/extension"
import {
	fillSendForm,
	importToken,
	navigateByHash,
	setActiveSendType,
	switchAccountByAddress,
	switchToLocalNetwork,
	waitForToast,
	waitForToastGone,
} from "../fixtures/helpers"
import { submitSend } from "../fixtures/send-page"
import { confirmImport, exportAccountBody, FIRST_ACCOUNT_NAME, previewImport } from "../helpers/account-io"
import { CAPTURE_VIEWPORT, CAPTURES_ENABLED, capture } from "../helpers/stale-network-capture"
import { corruptImportedKeys } from "../helpers/stale-network-capture-seeds"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

describe.skipIf(!CAPTURES_ENABLED || isFirefox || aztecConfig === undefined)("stale-network captures on a live node", () => {
	test("A10: a send from an imported account whose key does not open", { timeout: 600_000, retry: 0 }, async ({
		tokenReadyExtension: source,
	}) => {
		const sourcePage = await openPopup(source)
		await waitForHash(sourcePage, "#/popup/general", 30_000)
		const accountFile = await exportAccountBody(sourcePage, FIRST_ACCOUNT_NAME, false)
		await sourcePage.close()

		const ctx = await launchExtension()
		try {
			await registerProfile(ctx)
			const page = await openPopup(ctx)
			await setViewport(page, CAPTURE_VIEWPORT)
			await waitForHash(page, "#/popup/general", 30_000)
			await switchToLocalNetwork(page)
			expect(await previewImport(page, accountFile)).toBe(source.accountAddress)
			await confirmImport(page)
			await navigateByHash(page, "#/popup/general", 15_000)
			await importToken(page, aztecConfig!.tokenAddress)
			await switchAccountByAddress(page, source.accountAddress)

			await page.evaluate(() => (document.querySelector('[data-testid="actions-send"]') as HTMLElement | null)?.click())
			await page.waitForSelector('[data-testid="send-from-type"]', { timeout: 10_000 })
			await setActiveSendType(page, "send-from-type", "public")
			await setActiveSendType(page, "send-to-type", "public")
			await fillSendForm(page, { amount: "1", destination: source.accountAddress })
			expect(await corruptImportedKeys(page)).toBe(1)
			await submitSend(page, { expect: "send" })
			await waitForToast(page, IMPORTED_UNUSABLE_TOAST.label, 60_000, { kind: "error" })
			await capture(page, "A10-imported-unusable")

			// An error snack stays until closed, and the second one would find it still up.
			await clickByTestId(page, "snackbar-close")
			await waitForToastGone(page, IMPORTED_UNUSABLE_TOAST.label, 10_000)
			await navigateByHash(page, "#/popup/general", 15_000)
			await page.evaluate(() => (document.querySelector('[data-testid="actions-send"]') as HTMLElement | null)?.click())
			await waitForToast(page, IMPORTED_UNUSABLE_TOAST.label, 60_000, { kind: "error" })
			await waitForHash(page, "#/popup/general", 15_000)
			await capture(page, "A10b-send-closed")
		} finally {
			await ctx.close()
		}
	})
})
