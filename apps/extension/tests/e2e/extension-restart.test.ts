import { expect } from "vitest"
import { allowSelfRestart } from "./fixtures/browser"
import { openPopup, test, waitForHash } from "./fixtures/extension"
import { ensureUnlocked } from "./fixtures/helpers"
import { readSessionRow, waitForExtensionRestart } from "./fixtures/session"

// An unlocked session lives in `storage.session`, which both browsers start empty whenever the
// extension restarts. The wallet's lock relies on it.
test("a restart of the extension starts it locked", async ({ registeredExtension: ctx }) => {
	await allowSelfRestart(ctx.browser)
	const page = await openPopup(ctx)
	await ensureUnlocked(page)
	expect(await readSessionRow(page)).toBeDefined()

	await waitForExtensionRestart(ctx, page, async () => {
		await page.evaluate(() => {
			setTimeout(() => chrome.runtime.reload(), 0)
		})
	})

	const reopened = await openPopup(ctx)
	await waitForHash(reopened, "#/popup/auth", 15_000)
	expect(await readSessionRow(reopened)).toBeUndefined()
	await reopened.close()
})
