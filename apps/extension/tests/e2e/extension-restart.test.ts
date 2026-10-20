import { expect } from "vitest"
import { allowSelfRestart } from "./fixtures/browser"
import { openPopup, test, waitForHash } from "./fixtures/extension"
import { ensureUnlocked, optOutOfStrictMode, pressHeaderLock } from "./fixtures/helpers"
import { readSessionRow, refuseSessionDeletes, waitForExtensionRestart } from "./fixtures/session"

const SENTINEL = "nulo:e2e:restart-sentinel"

const readSentinel = (page: Parameters<typeof readSessionRow>[0]) =>
	page.evaluate(async (key) => (await chrome.storage.session.get(key))[key] as unknown, SENTINEL)

// A lock whose session record refuses every delete restarts the wallet, and both browsers start
// `storage.session` empty on a restart, so the lock holds: every Nulo page closes and the next one
// opens on the lock screen. Strict mode is off, so a record that survived would unlock that page.
test("a lock the wallet cannot save restarts it, locked", async ({ registeredExtension: ctx }) => {
	await allowSelfRestart(ctx.browser)
	const page = await openPopup(ctx)
	await ensureUnlocked(page)
	await waitForHash(page, "#/popup/general")
	await optOutOfStrictMode(page)
	const tab = await openPopup(ctx)
	await waitForHash(tab, "#/popup/general")
	expect(await readSessionRow(page)).toBeDefined()
	await page.evaluate((key) => chrome.storage.session.set({ [key]: true }), SENTINEL)
	await refuseSessionDeletes(ctx)
	await ctx.checkCspViolations()

	await waitForExtensionRestart(ctx, tab, () => pressHeaderLock(page))
	expect(page.isClosed()).toBe(true)

	const reopened = await openPopup(ctx)
	await waitForHash(reopened, "#/popup/auth", 15_000)
	expect(await readSentinel(reopened)).toBeUndefined()
	expect(await readSessionRow(reopened)).toBeUndefined()
	await reopened.close()
})
