/**
 * Own windows in a real browser: the export and restore pages that Firefox's toolbar panel hands to
 * a window of their own (`src/utils/own-window.ts`). The shell reads the marker on every boot of
 * every surface, so its lifecycle is proven here on both browsers with a password profile; the move
 * out of the real panel belongs to `passkey-toolbar-panel.test.ts`.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { extensionUrl, gotoExtensionPage, newPage, waitForTarget } from "./fixtures/browser"
import { clickByTestId, type ExtensionContext, openPopup, patchPagePolling, test, waitForHash } from "./fixtures/extension"
import { ensureUnlocked, lockWallet } from "./fixtures/helpers"
import { waitForMainFrame, waitForPopupClosed } from "./fixtures/popups"

const EXPORT = "#/popup/settings/security/export/full"
const RESTORE = "#/popup/import?option=full_backup"
const sel = (testid: string) => `[data-testid="${testid}"]`

type Probe = Window & { __wentBack?: boolean }

/** A popup-type window on `hash`, sized as `moveToOwnWindow` opens one. */
async function openWindow(ctx: ExtensionContext, opener: Page, hash: string): Promise<Page> {
	const before = new Set(ctx.browser.targets())
	const url = extensionUrl(ctx.extensionId, `/src/popup/index.html${hash}`)
	await opener.evaluate(async (u: string) => {
		await chrome.windows.create({ type: "popup", url: u, width: 380, height: 660 })
	}, url)
	const target = await waitForTarget(
		ctx.browser,
		(t) => t.type() === "page" && !before.has(t) && t.url().includes("/src/popup/index.html"),
		30_000,
	)
	const page = await target.asPage()
	await waitForMainFrame(page)
	patchPagePolling(page)
	return page
}

/** The boot has decided whether the wallet is locked and where this document lands. */
async function waitForBootDecided(page: Page): Promise<void> {
	await page.waitForSelector('[data-session-checked="true"]', { timeout: 60_000 })
}

async function openUnlockedHome(ctx: ExtensionContext): Promise<Page> {
	const home = await openPopup(ctx)
	await ensureUnlocked(home)
	await waitForHash(home, "#/popup/general")
	return home
}

test("an export window boots on export, returns there after a lock, and its back arrow closes it", async ({ registeredExtension }) => {
	const home = await openUnlockedHome(registeredExtension)
	const own = await openWindow(registeredExtension, home, `${EXPORT}?window=own`)

	// A cold boot parks the window on the lock screen first, so the route without its marker is
	// only reached through the shell's push after auth.
	await waitForHash(own, EXPORT, 60_000)
	await waitForBootDecided(own)
	await own.waitForSelector(sel("agree-continue-btn"), { visible: true, timeout: 15_000 })
	expect(await own.evaluate(() => window.location.hash)).toBe(EXPORT)

	await lockWallet(home)
	await waitForHash(own, "#/popup/auth", 30_000)
	await ensureUnlocked(own)
	await waitForHash(own, EXPORT, 60_000)
	await own.waitForSelector(sel("agree-continue-btn"), { visible: true, timeout: 15_000 })

	await clickByTestId(own, "subpage-back")
	await waitForPopupClosed(own, 10_000)

	expect(registeredExtension.pageErrors).toEqual([])
	await home.close()
}, 180_000)

test("the same URL in a tab keeps ordinary back: the arrow goes back and the tab stays", async ({ registeredExtension }) => {
	const home = await openUnlockedHome(registeredExtension)
	const tab = await newPage(registeredExtension.browser)
	patchPagePolling(tab)
	await gotoExtensionPage(tab, extensionUrl(registeredExtension.extensionId, `/src/popup/index.html${EXPORT}?window=own`))
	await waitForHash(tab, EXPORT, 60_000)
	await tab.waitForSelector(sel("agree-continue-btn"), { visible: true, timeout: 15_000 })

	await tab.evaluate(() => {
		window.addEventListener("popstate", () => {
			;(window as Probe).__wentBack = true
		})
	})
	await clickByTestId(tab, "subpage-back")
	await tab.waitForFunction(() => (window as Probe).__wentBack === true, { timeout: 10_000, polling: 50 })
	expect(tab.isClosed()).toBe(false)

	await tab.close()
	await home.close()
}, 120_000)

test("a restore window opened while locked stays on the restore form; without the marker it locks", async ({ registeredExtension }) => {
	const home = await openUnlockedHome(registeredExtension)
	await lockWallet(home)

	const own = await openWindow(registeredExtension, home, `${RESTORE}&window=own`)
	const control = await openWindow(registeredExtension, home, RESTORE)
	try {
		await waitForHash(control, "#/popup/auth", 60_000)
		await waitForBootDecided(own)
		await own.waitForSelector(sel("import-full-backup-pick-file"), { visible: true, timeout: 15_000 })
		expect(await own.evaluate(() => window.location.hash)).toBe(`${RESTORE}&window=own`)
	} finally {
		await own.close().catch(() => undefined)
		await control.close().catch(() => undefined)
		await home.close().catch(() => undefined)
	}
}, 180_000)
