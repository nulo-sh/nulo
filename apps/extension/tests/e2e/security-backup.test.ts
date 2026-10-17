import type { Page } from "puppeteer"
import { expect } from "vitest"
import { TEST_PASSWORD } from "./fixtures/constants"
import { waitForNewTab } from "./fixtures/browser"
import { test, openPopup, waitForHash, clickByTestId, replaceInputValue } from "./fixtures/extension"
import { navigateByHash, revealSeedPhrase } from "./fixtures/helpers"
import { shotSend } from "./fixtures/send-page"
import { downloadEncryptedBackup, openEncryptedBackup } from "./helpers/backup-export"
import { FULL_BACKUP_V2_TAG } from "@/utils/full-backup-helpers"

const PASSWORD = TEST_PASSWORD

const sel = (testid: string) => `[data-testid="${testid}"]`
const waitForGone = (page: Page, testid: string) =>
	page.waitForFunction((s: string) => !document.querySelector(s), { timeout: 10_000, polling: 100 }, sel(testid))

test("Home's reminders clear as they are done: How Aztec works opens its page, and the seed reveal clears only the phrase row", async ({
	registeredExtension,
}) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")
	await page.waitForSelector(sel("get-started-phrase"), { visible: true, timeout: 30_000 })
	expect(await page.$(sel("get-started-aztec"))).not.toBeNull()
	expect(await page.$(sel("backup-reminder-banner"))).toBeNull()

	// The flag is written before the tab opens; the tab still opens after that wait.
	const tab = await waitForNewTab(registeredExtension.browser, () => clickByTestId(page, "get-started-aztec"), 10_000)
	await tab.close()
	await waitForGone(page, "get-started-aztec")

	const tokens = await revealSeedPhrase(page, PASSWORD)
	expect(tokens.length).toBe(24)
	for (const token of tokens) expect(token).toMatch(/^[a-z]+$/)
	// At the popup's fixed 360 px every cell holds the widest BIP39 word, eight letters, beside its number.
	const overruns = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('[data-testid="reveal-content-word"]')].flatMap((word, i) => {
			const shown = word.textContent
			word.textContent = "abstract"
			const past = word.getBoundingClientRect().right - (word.parentElement as HTMLElement).getBoundingClientRect().right
			word.textContent = shown
			return past > 0.5 ? [`cell ${i + 1} by ${past.toFixed(1)} px`] : []
		}),
	)
	expect(overruns).toEqual([])

	await navigateByHash(page, "#/popup/general")
	await page.waitForSelector(sel("get-started"), { visible: true, timeout: 30_000 })
	expect(await page.$(sel("get-started-phrase"))).toBeNull()
	expect(await page.$(sel("get-started-presto"))).not.toBeNull()

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
}, 30_000)

test("a password profile's full backup downloads only once it is encrypted", async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")

	await navigateByHash(page, "#/popup/settings/security/export/full")
	await clickByTestId(page, "agree-continue-btn")

	await page.waitForSelector('[data-testid="unlock-password-input"]', { visible: true, timeout: 5_000 })
	await replaceInputValue(page, '[data-testid="unlock-password-input"]', PASSWORD)
	await clickByTestId(page, "unlock-submit-btn")

	// handleBackup loops over ~11 service clients and computes a SHA hash —
	// in CI / cold extension boot this can take a while. Generous timeout.
	await page.waitForFunction(
		() => {
			const protect = document.querySelector('[data-testid="protect-password-btn"]') as HTMLButtonElement | null
			const download = document.querySelector('[data-testid="download-backup-btn"]') as HTMLButtonElement | null
			return !!protect && !protect.disabled && !!download && !!document.querySelector('[data-testid="backup-ready-banner"]')
		},
		{ timeout: 30_000, polling: 250 },
	)
	// The plain file holds the recovery phrase and every key, so Download waits for encryption.
	expect(await page.$eval('[data-testid="download-backup-btn"]', (el) => (el as HTMLButtonElement).disabled)).toBe(true)
	await shotSend(page, "export-full-ready", "backup-ready-banner")

	const file = await downloadEncryptedBackup(page)
	expect(file.trim().startsWith(`${FULL_BACKUP_V2_TAG}:`)).toBe(true)
	expect((await openEncryptedBackup(file))["master-key"]).toBeTruthy()
	await shotSend(page, "export-full-encrypted", "download-backup-btn")

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
}, 90_000)
