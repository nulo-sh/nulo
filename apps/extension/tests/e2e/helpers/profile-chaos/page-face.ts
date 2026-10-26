import type { Page } from "puppeteer"

/** A page's route and lock-screen face; undefined only for a page that closed as it was read (the
 *  logger window over a locked wallet closes itself). A page still open is read again once, and
 *  a second failure throws, so an unread page never counts as checked. */
export async function readFace(
	page: Pick<Page, "evaluate" | "isClosed">,
): Promise<{ hash: string; lockScreen?: { setupAgain: boolean; unlockOffered: boolean } } | undefined> {
	const read = () =>
		page.evaluate(() => {
			const shown = (id: string) => {
				const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
				return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
			}
			const onAuth = location.hash.replace(/^#/, "").split("?")[0] === "/popup/auth"
			const lock = onAuth ? { setupAgain: shown("auth-setup-again"), unlockOffered: shown("auth-submit") } : undefined
			return { hash: location.hash, lockScreen: lock }
		})
	try {
		return await read()
	} catch {
		await new Promise((r) => setTimeout(r, 1_000))
		if (page.isClosed()) return undefined
		return read()
	}
}
