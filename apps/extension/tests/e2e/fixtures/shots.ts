/** Kept free of the other fixtures' imports: its unit test loads it under the scripts typecheck. */
import type { Page } from "puppeteer"

/** Waits, at most 1 s and never throwing, for the CSS transitions a theme flip started: sheets and
 *  buttons fade their colours over 0.2 s, and a shot taken mid-fade reads washed out. Only transitions
 *  count, so an endless spinner animation cannot hold it. */
export async function settleThemeTransitions(page: Page): Promise<void> {
	await page
		.evaluate(() => {
			const ends = document.getAnimations().flatMap((a) => (a instanceof CSSTransition ? [a.finished.catch(() => undefined)] : []))
			return Promise.race([Promise.all(ends), new Promise((r) => setTimeout(r, 1_000))])
		})
		.catch(() => undefined)
}

/** Opt-in capture of the popup (`NULO_E2E_SHOT_DIR`), both themes: a popup-surface change ships with a
 *  picture of it, and a colour token that only reads well on one theme is what a row count never sees.
 *  The page must be shown on entry: a hidden one (a Chrome tab behind another) draws no frame, and a
 *  capture of it can hang, so it is refused before any capture. */
export async function shotSend(page: Page, name: string, focus = "send-publish-strip"): Promise<void> {
	const dir = process.env.NULO_E2E_SHOT_DIR
	if (!dir) return
	const visibility = await page.evaluate(() => document.visibilityState)
	if (visibility !== "visible") {
		throw new Error(
			`shotSend(${name}): the page is ${visibility}; a hidden page draws no frame, and its capture can hang. Bring it to the front where the spec acts on it.`,
		)
	}
	await page.evaluate((id: string) => document.querySelector(`[data-testid="${id}"]`)?.scrollIntoView({ block: "center" }), focus)
	// A popup still entering is drawn part-way through its fade; a shot of it ghosts the page beneath.
	await page
		.waitForFunction(
			() =>
				![...document.querySelectorAll("#popup *, [class*='dark_bg'i]")].some((el) => /enter/.test(el.getAttribute("class") ?? "")),
			{ timeout: 3_000, polling: 100 },
		)
		.catch(() => undefined)
	await page.screenshot({ path: `${dir}/${name}.png` as `${string}.png` })
	const flipped = await page.evaluate(() => {
		const root = document.documentElement
		const was = root.getAttribute("theme")
		root.setAttribute("theme", was === "dark" ? "light" : "dark")
		return was
	})
	await settleThemeTransitions(page)
	await page.screenshot({ path: `${dir}/${name}-${flipped === "dark" ? "light" : "dark"}.png` as `${string}.png` })
	await page.evaluate((was: string | null) => {
		if (was === null) document.documentElement.removeAttribute("theme")
		else document.documentElement.setAttribute("theme", was)
	}, flipped)
	// A caller's next shot can follow at once; it must not catch the restore mid-fade.
	await settleThemeTransitions(page)
}
