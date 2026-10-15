import type { Page } from "puppeteer"
import { waitForHash } from "../fixtures/extension"

/** Routes an open onboarding tab to its Presto step. */
export async function gotoPrestoStep(page: Page): Promise<void> {
	await page.evaluate(() => {
		window.location.hash = "#/onboarding/presto"
	})
	await waitForHash(page, "#/onboarding/presto", 10_000)
}
