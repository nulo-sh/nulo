import type { Page } from "puppeteer"
import { expect } from "vitest"
import { TEST_PASSWORD } from "./fixtures/constants"
import { prepareKeys, reloadExtensionPage, waitForNewTab } from "./fixtures/browser"
import { test, openPopup, waitForHash, clickByTestId, replaceInputValue } from "./fixtures/extension"
import { navigateByHash, readRecoveryWords } from "./fixtures/helpers"
import { createAndActivateProfile } from "./fixtures/profiles"
import { shotSend } from "./fixtures/send-page"
import { getStartedRows, waitForHomeReminders } from "./fixtures/tokens"
import { expectFitsNarrow } from "./fixtures/type-roles"
import { downloadEncryptedBackup, openEncryptedBackup } from "./helpers/backup-export"
import { waitForFocus } from "./helpers/pointer-probes"
import { FULL_BACKUP_V2_TAG } from "@/utils/full-backup-helpers"
import { changelogUrl, isStable, minorOf, releaseCore, WHATS_NEW_SEEN_KEY } from "@/utils/whats-new"

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

/** The loaded build's own version: an artifact run may carry an rc, whose Home never prompts. */
const buildVersion = (page: Page): Promise<string> => page.evaluate(() => chrome.runtime.getManifest().version_name ?? "")
const readSeen = (page: Page): Promise<unknown> =>
	page.evaluate((key: string) => chrome.storage.local.get(key).then((stored) => stored[key]), WHATS_NEW_SEEN_KEY)
const writeSeen = (page: Page, seen: unknown): Promise<void> =>
	page.evaluate((key: string, value: unknown) => chrome.storage.local.set({ [key]: value }), WHATS_NEW_SEEN_KEY, seen)

test("Home's steps are checked as they are done: How Aztec works opens its page, and the seed reveal checks the phrase step and closes out of Back's reach", async ({
	registeredExtension,
}) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")
	await page.waitForSelector(sel("get-started-phrase"), { visible: true, timeout: 30_000 })
	expect(await page.$(sel("get-started-aztec"))).not.toBeNull()
	expect(await page.$(sel("backup-reminder-banner"))).toBeNull()
	// The card stands, inert, while the funds load; a press lands once they have.
	await waitForHomeReminders(page)
	// The install stamped the device at its own minor, so this Home holds no What's new row.
	expect(await readSeen(page)).toBe(minorOf(await buildVersion(page)))
	expect(await page.$(sel("whats-new-row"))).toBeNull()

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

test("after a minor update Home shows What's new above Get started: nulo.sh is reached only on its tap, Tab goes on to Dismiss, and Dismiss keeps it gone; About links the release", async ({
	registeredExtension,
}) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")
	const version = await buildVersion(page)
	const installed = await readSeen(page)
	const guard = registeredExtension.egress?.guard
	if (!guard) throw new Error("the launch carries no egress guard")
	const site = new URL(changelogUrl("0.0.0")).hostname
	const siteAttempts = () => guard.attempts().reduce((sum, attempt) => sum + (attempt.host === site ? attempt.count : 0), 0)
	const before = siteAttempts()

	await writeSeen(page, "0.0")
	await reloadExtensionPage(page)
	await waitForHash(page, "#/popup/general")
	await waitForHomeReminders(page)
	if (!isStable(version)) {
		expect(await page.$(sel("whats-new-row"))).toBeNull()
		await writeSeen(page, installed)
	} else {
		await page.waitForSelector(sel("whats-new-row"), { visible: true, timeout: 10_000 })
		expect(
			await page.$eval(sel("whats-new-row"), (row) => {
				const card = document.querySelector('[data-testid="get-started"]')
				return card !== null && (row.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
			}),
		).toBe(true)
		expect(siteAttempts()).toBe(before)
		await shotSend(page, "whats-new-home", "whats-new-row")

		await prepareKeys(page)
		await page.focus(`${sel("whats-new-open")} [data-row-target]`)
		await page.keyboard.press("Tab")
		await waitForFocus(page, "whats-new-dismiss")
		await shotSend(page, "whats-new-dismiss-focus", "whats-new-row")

		// Where the tab lands is the component test's: the guard keeps hosts, and Firefox names the tab about:blank.
		const tab = await waitForNewTab(registeredExtension.browser, () => clickByTestId(page, "whats-new-open"), 10_000)
		await tab.close()
		await expect.poll(siteAttempts, { timeout: 10_000 }).toBeGreaterThan(before)
		expect(await page.$(sel("whats-new-row"))).not.toBeNull()

		await clickByTestId(page, "whats-new-dismiss")
		await page.waitForSelector(sel("whats-new-row"), { hidden: true, timeout: 5_000 })
		await expect.poll(() => readSeen(page), { timeout: 5_000 }).toBe(minorOf(version))
		await reloadExtensionPage(page)
		await waitForHash(page, "#/popup/general")
		await waitForHomeReminders(page)
		expect(await page.$(sel("whats-new-row"))).toBeNull()
	}

	await navigateByHash(page, "#/popup/settings/about")
	const about = await page.waitForSelector(sel("about-whats-new"), { visible: true, timeout: 10_000 })
	expect(await about?.evaluate((row) => row.getAttribute("href"))).toBe(changelogUrl(releaseCore(version) ?? ""))
	await shotSend(page, "whats-new-about", "about-whats-new")

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
}, 45_000)

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

test("a password profile's full backup leaves only encrypted, from one press", async ({ registeredExtension }) => {
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
			const download = document.querySelector('[data-testid="download-backup-btn"]') as HTMLButtonElement | null
			return !!download && !download.disabled
		},
		{ timeout: 30_000, polling: 250 },
	)
	await page.waitForSelector(sel("download-backup-btn"), { visible: true, timeout: 5_000 })
	await expectFitsNarrow(page, "a ready backup")
	await shotSend(page, "export-full-ready", "download-backup-btn")

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
