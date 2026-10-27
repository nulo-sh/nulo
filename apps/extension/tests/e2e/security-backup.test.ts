import type { Page } from "puppeteer"
import { expect } from "vitest"
import { TEST_PASSWORD } from "./fixtures/constants"
import { waitForNewTab } from "./fixtures/browser"
import { test, openPopup, waitForHash, clickByTestId, replaceInputValue } from "./fixtures/extension"
import { navigateByHash, readRecoveryWords } from "./fixtures/helpers"
import { createAndActivateProfile } from "./fixtures/profiles"
import { shotSend } from "./fixtures/send-page"
import { getStartedRows, waitForHomeReminders } from "./fixtures/tokens"
import { expectFitsNarrow } from "./fixtures/type-roles"
import { downloadEncryptedBackup, openEncryptedBackup } from "./helpers/backup-export"
import { FULL_BACKUP_V2_TAG } from "@/utils/full-backup-helpers"

/** Windows' classic scrollbar; headless browsers draw none, so the probe takes its width out itself. */
const CLASSIC_SCROLLBAR_PX = 17

/**
 * At the popup's 360 px, with a classic scrollbar taking its width from the page, puts the longest
 * BIP39 word (eight letters) in every cell and returns each cell it runs past. The word role is
 * monospace, so every eight-letter word is the list's widest; the probe refuses to answer if it is not.
 */
async function widestWordOverruns(page: Page, scrollbarPx: number): Promise<string[]> {
	return page.evaluate((scrollbar: number) => {
		const words = [...document.querySelectorAll<HTMLElement>('[data-testid="reveal-content-word"]')]
		const shown = words.map((word) => word.textContent)
		const width = (word: HTMLElement, text: string) => {
			word.textContent = text
			return word.getBoundingClientRect().width
		}
		if (Math.abs(width(words[0], "iiiiiiii") - width(words[0], "wwwwwwww")) > 0.1) return ["the word role is not monospace"]
		let scroller = words[0].parentElement
		while (scroller && getComputedStyle(scroller).scrollbarGutter !== "stable") scroller = scroller.parentElement
		if (!scroller) return ["no scroller reserves a scrollbar gutter"]
		const drawn = scroller.offsetWidth - scroller.clientWidth
		const padding = scroller.style.paddingRight
		scroller.style.paddingRight = `calc(${getComputedStyle(scroller).paddingRight} + ${Math.max(0, scrollbar - drawn)}px)`
		const overruns = words.flatMap((word, i) => {
			word.textContent = "abstract"
			const past = word.getBoundingClientRect().right - (word.parentElement as HTMLElement).getBoundingClientRect().right
			return past > 0.5 ? [`cell ${i + 1} by ${past.toFixed(1)} px`] : []
		})
		scroller.style.paddingRight = padding
		words.forEach((word, i) => {
			word.textContent = shown[i]
		})
		return overruns
	}, scrollbarPx)
}

const PASSWORD = TEST_PASSWORD

const sel = (testid: string) => `[data-testid="${testid}"]`

test("Home's steps are checked as they are done: How Aztec works opens its page, and the seed reveal checks the phrase step and closes out of Back's reach", async ({
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
	await page.waitForSelector(`${sel("get-started-aztec")}[data-done="true"]`, { timeout: 10_000 })

	// Opened from the Backup menu, as a person opens it: a link pushes the page, a hash change does not.
	await navigateByHash(page, "#/popup/settings/security/export")
	await clickByTestId(page, "seed-phrase-link-btn")
	await waitForHash(page, "#/popup/settings/security/export/seed")
	await clickByTestId(page, "agree-continue-btn")
	await page.waitForSelector(sel("unlock-password-input"), { visible: true, timeout: 5_000 })
	await replaceInputValue(page, sel("unlock-password-input"), PASSWORD)
	await clickByTestId(page, "unlock-submit-btn")
	const tokens = await readRecoveryWords(page)
	expect(tokens.length).toBe(24)
	for (const token of tokens) expect(token).toMatch(/^[a-z]+$/)
	expect(await widestWordOverruns(page, CLASSIC_SCROLLBAR_PX)).toEqual([])

	// Close returns to the menu, and the menu's Back reaches the page before it, never the phrase.
	await clickByTestId(page, "close-btn")
	await waitForHash(page, "#/popup/settings/security/export")
	await clickByTestId(page, "subpage-back")
	await waitForHash(page, "#/popup/general")
	await waitForHomeReminders(page)
	expect(await getStartedRows(page)).toEqual([
		"get-started-phrase done",
		"get-started-aztec done",
		"get-started-feeJuice",
		"get-started-presto",
	])
	expect(await page.$eval(sel("get-started-count"), (el) => el.textContent)).toBe("2 of 4 done")

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
}, 30_000)

test("a later password profile's Home asks only for its own phrase", async ({ registeredExtensionPerTest }) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")
	await waitForHomeReminders(page)
	expect(await page.$(sel("get-started-aztec"))).not.toBeNull()

	await createAndActivateProfile(page, "Later", PASSWORD)
	await waitForHomeReminders(page)
	expect(await getStartedRows(page)).toEqual(["get-started-phrase"])
	expect(await page.$(sel("get-started-hide"))).toBeNull()

	expect(registeredExtensionPerTest.consoleErrors).toEqual([])
	expect(registeredExtensionPerTest.pageErrors).toEqual([])
}, 60_000)

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
	for (const id of ["backup-ready-banner", "protect-password-btn", "download-backup-btn"])
		await page.waitForSelector(sel(id), { visible: true, timeout: 5_000 })
	await expectFitsNarrow(page, "a ready backup")
	await shotSend(page, "export-full-ready", "backup-ready-banner")

	const file = await downloadEncryptedBackup(page)
	expect(file.trim().startsWith(`${FULL_BACKUP_V2_TAG}:`)).toBe(true)
	expect((await openEncryptedBackup(file))["master-key"]).toBeTruthy()
	await page.waitForSelector(sel("backup-close-btn"), { visible: true, timeout: 10_000 })
	expect(await page.$(sel("download-backup-btn"))).toBeNull()
	await page.waitForSelector(sel("backup-done-banner"), { visible: true, timeout: 5_000 })
	expect(await page.$eval(sel("backup-done-banner"), (el) => el.textContent)).toContain("Saved to your downloads")
	await expectFitsNarrow(page, "the done state")
	await shotSend(page, "export-full-saved", "backup-close-btn")

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
}, 90_000)
