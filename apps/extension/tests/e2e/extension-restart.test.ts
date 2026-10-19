import { expect } from "vitest"
import { allowSelfRestart } from "./fixtures/browser"
import { openPopup, test, waitForHash } from "./fixtures/extension"
import { ensureUnlocked } from "./fixtures/helpers"
import { pressHeaderLock, readSessionRow, refuseSessionDeletes, waitForExtensionRestart } from "./fixtures/session"

// An unlocked session lives in `storage.session`, which both browsers start empty whenever the
// extension restarts. A lock whose session record refuses every delete restarts the wallet, so the
// lock still holds: every Nulo page closes, and the next one opens on the lock screen.
test("a lock the wallet cannot save restarts it, locked", async ({ registeredExtension: ctx }) => {
	await allowSelfRestart(ctx.browser)
	const page = await openPopup(ctx)
	await ensureUnlocked(page)
	const tab = await openPopup(ctx)
	await waitForHash(tab, "#/popup/general")
	expect(await readSessionRow(page)).toBeDefined()
	await refuseSessionDeletes(ctx)

	await waitForExtensionRestart(ctx, tab, () => pressHeaderLock(page))
	expect(page.isClosed()).toBe(true)

	const reopened = await openPopup(ctx)
	await waitForHash(reopened, "#/popup/auth", 15_000)
	expect(await readSessionRow(reopened)).toBeUndefined()
	await reopened.close()
})
