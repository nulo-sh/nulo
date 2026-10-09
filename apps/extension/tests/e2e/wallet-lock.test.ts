import { test, openPopup, waitForHash, clickByTestId } from "./fixtures/extension"
import { lockWallet, ensureUnlocked, navigateToSettings, waitForLockScreen } from "./fixtures/helpers"

test("lock wallet and unlock with password", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await lockWallet(page)

	// Close and reopen popup (fresh DOM after lock)
	await page.close()
	const page2 = await openPopup(registeredExtension)

	await waitForHash(page2, "#/popup/auth", 10_000)

	await ensureUnlocked(page2)

	await page2.waitForFunction(() => !window.location.hash.includes("/popup/auth"), { timeout: 10_000 })

	await page2.close()
})

test("Lock now on the Lock page locks the wallet, and it stays locked until unlocked", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	// The browser is shared per file, so the state the previous test left is not assumed.
	await ensureUnlocked(page)
	await waitForHash(page, "#/popup/general")

	await navigateToSettings(page, "lock")
	await clickByTestId(page, "lock-now-btn")
	await waitForHash(page, "#/popup/auth", 15_000)
	await waitForLockScreen(page)

	await page.close()
	const page2 = await openPopup(registeredExtension)
	await waitForHash(page2, "#/popup/auth", 10_000)

	await ensureUnlocked(page2)
	await page2.waitForFunction(() => !window.location.hash.includes("/popup/auth"), { timeout: 10_000 })

	await page2.close()
})
