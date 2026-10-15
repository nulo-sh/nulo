/**
 * The opt-in stale-network captures: when they run, the popup's frame, and one frame written in
 * both themes into `tests/e2e/.captures/` (gitignored), named after its `ui-spec/` reference.
 */
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import type { Page } from "puppeteer"

/** `STALE_NETWORK_CAPTURES=1`. Each capture test also skips Firefox: the references are compared at Chrome's pixels. */
export const CAPTURES_ENABLED = process.env.STALE_NETWORK_CAPTURES === "1"
export const CAPTURE_VIEWPORT = { width: 360, height: 600, deviceScaleFactor: 2 }
const OUT_DIR = resolve(__dirname, "../.captures")

/** Every finite animation and transition has ended; a spinner's infinite one never does. */
async function settled(page: Page): Promise<void> {
	// Two frames first: a style change starts its transitions on the next one.
	await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
	await page.waitForFunction(
		() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
		{ timeout: 10_000 },
	)
}

/** Both themes of the frame on screen, named after its ui-spec reference. */
export async function capture(page: Page, name: string): Promise<void> {
	mkdirSync(OUT_DIR, { recursive: true })
	for (const theme of ["dark", "light"] as const) {
		await page.evaluate((t: string) => document.documentElement.setAttribute("theme", t), theme)
		await settled(page)
		await page.screenshot({ path: resolve(OUT_DIR, `${name}.${theme}.png`) })
	}
	await page.evaluate(() => document.documentElement.setAttribute("theme", "dark"))
}
