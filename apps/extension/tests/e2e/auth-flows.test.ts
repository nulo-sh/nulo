import { expect } from "vitest"
import { TEST_PASSWORD } from "./fixtures/constants"
import { test, openPopup, waitForHash, clickByTestId, expectNameFieldPrefill, replaceInputValue } from "./fixtures/extension"
import { ensureUnlocked, lockWallet, openForgotPasswordFromAuth, waitForToast } from "./fixtures/helpers"
import { settleThemeTransitions, shotSend } from "./fixtures/send-page"

test("wrong password surfaces error-text and lets the user retry", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await ensureUnlocked(page)
	await waitForHash(page, "#/popup/general")

	await lockWallet(page)
	await page.close()

	const page2 = await openPopup(registeredExtension)
	await waitForHash(page2, "#/popup/auth", 10_000)

	await page2.waitForSelector('[data-testid="auth-password-input"]', { visible: true, timeout: 5_000 })
	await replaceInputValue(page2, '[data-testid="auth-password-input"]', "WrongPassword!")
	await clickByTestId(page2, "auth-submit")

	// Error appears, with role="alert" + testid contract
	await page2.waitForSelector('[data-testid="error-text"][role="alert"]', { visible: true, timeout: 10_000 })

	// Field clears on retry-input — verify by typing the correct password and unlocking
	await replaceInputValue(page2, '[data-testid="auth-password-input"]', TEST_PASSWORD)
	await clickByTestId(page2, "auth-submit")
	await page2.waitForFunction(() => !window.location.hash.includes("/popup/auth"), { timeout: 10_000 })

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
	await page2.close()
}, 30_000)

test("ForgotPassword link opens popup and routes to reset", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await ensureUnlocked(page)
	await waitForHash(page, "#/popup/general")

	await lockWallet(page)
	await page.close()

	const page2 = await openPopup(registeredExtension)
	await waitForHash(page2, "#/popup/auth", 10_000)

	await openForgotPasswordFromAuth(page2)
	await clickByTestId(page2, "forgot-reset-btn")

	// handleReset calls popupStore.closeAll() then router.push to reset
	await page2.waitForFunction(() => window.location.hash.includes("/popup/settings/security/reset"), { timeout: 5_000 })

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
	await page2.close()
}, 30_000)

// The tests below use the per-test fixture: each gets a fresh registered browser, so a locked
// wallet, a lingering popup or a tampered row cannot leak into the next. The lock-and-reopen dance
// is heavy enough that a clean fixture is simpler than recovering arbitrary state.

// A stored row the wallet hides (its embedded id disagrees with its key) fails the unlock with an
// error no rung of the failure ladder names. The unit test proves the ladder; this proves the toast
// renders over the real lock screen and the button comes back, on each browser.
test("an unlock that fails for an unlisted reason says so and stops the spinner", async ({ registeredExtensionPerTest }) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")

	await lockWallet(page)
	await page.close()

	const page2 = await openPopup(registeredExtensionPerTest)
	await waitForHash(page2, "#/popup/auth", 10_000)
	await page2.waitForFunction(() => document.querySelector('[data-testid="auth-profile"]')?.textContent?.includes("Main"), {
		timeout: 10_000,
	})

	const moved = await page2.evaluate(async () => {
		let count = 0
		for (const [key, raw] of Object.entries(await chrome.storage.local.get(null))) {
			if (!key.startsWith("nulo:core:profiles@") || typeof raw !== "string") continue
			const row = JSON.parse(raw)
			row.id = `${row.id}-moved`
			await chrome.storage.local.set({ [key]: JSON.stringify(row) })
			count++
		}
		return count
	})
	expect(moved).toBe(1)

	await replaceInputValue(page2, '[data-testid="auth-password-input"]', TEST_PASSWORD)
	await clickByTestId(page2, "auth-submit")

	const snack = await waitForToast(page2, "Try unlocking again.", 15_000, { kind: "error" })
	const read = (testid: string) => snack.evaluate((card, id) => card.querySelector(`[data-testid="${id}"]`)?.textContent?.trim(), testid)
	expect(await read("snackbar-title")).toBe("Something went wrong")
	expect(await read("snackbar-sub")).toBe("Try unlocking again.")
	await page2.waitForFunction(
		() => (document.querySelector('[data-testid="auth-submit"]') as HTMLButtonElement | null)?.disabled === false,
		{ timeout: 5_000 },
	)
	expect(await page2.evaluate(() => window.location.hash)).toBe("#/popup/auth")
	await settleThemeTransitions(page2)
	await shotSend(page2, "unlock-unlisted-failure", "snackbar")

	expect(registeredExtensionPerTest.consoleErrors).toEqual([])
	expect(registeredExtensionPerTest.pageErrors).toEqual([])
	await page2.close()
}, 30_000)

test("SelectProfile from auth lists the active profile", async ({ registeredExtensionPerTest }) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")

	await lockWallet(page)
	await page.close()

	const page2 = await openPopup(registeredExtensionPerTest)
	await waitForHash(page2, "#/popup/auth", 10_000)

	await clickByTestId(page2, "auth-profile")
	await page2.waitForSelector('[data-testid="select-profile-row"]', { visible: true, timeout: 5_000 })

	const rows = await page2.$$('[data-testid="select-profile-row"]')
	expect(rows.length).toBeGreaterThanOrEqual(1)
	const firstId = await rows[0].evaluate((el) => el.getAttribute("data-profile-id"))
	const firstName = await rows[0].evaluate((el) => el.getAttribute("data-profile-name"))
	expect(firstId).toBeTruthy()
	// The first profile had no name field and was created as "Main".
	expect(firstName).toBe("Main")

	expect(registeredExtensionPerTest.consoleErrors).toEqual([])
	expect(registeredExtensionPerTest.pageErrors).toEqual([])
	await page2.close()
}, 30_000)

test("SelectProfile new-btn routes to /popup/profile/new", async ({ registeredExtensionPerTest }) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")

	await lockWallet(page)
	await page.close()

	const page2 = await openPopup(registeredExtensionPerTest)
	await waitForHash(page2, "#/popup/auth", 10_000)

	await clickByTestId(page2, "auth-profile")
	await page2.waitForSelector('[data-testid="select-profile-new-btn"]', { visible: true, timeout: 5_000 })
	await clickByTestId(page2, "select-profile-new-btn")

	await page2.waitForFunction(() => window.location.hash.includes("/popup/profile/new"), { timeout: 5_000 })
	// A later profile keeps the name field, prefilled "Profile 2".
	await expectNameFieldPrefill(page2, "register-page", "register-name-input", "Profile 2")

	expect(registeredExtensionPerTest.pageErrors).toEqual([])
	await page2.close()
}, 30_000)
