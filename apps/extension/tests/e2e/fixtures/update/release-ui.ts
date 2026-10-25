import type { Page } from "puppeteer"
import { approveDiscover } from "../popups"

/**
 * Allow a connection on a 0.31.0 build, whose emoji check replaces the connect window's page where
 * later builds open it in a window of their own. Resolves with that page, now the check.
 */
export async function approveReleaseConnect(discoverPage: Page): Promise<Page> {
	await approveDiscover(discoverPage)
	await discoverPage.waitForFunction(
		() => location.hash.startsWith("#/windows/verify") && document.querySelector('[data-testid="verify-emoji-grid"]') !== null,
		{ timeout: 30_000, polling: 200 },
	)
	return discoverPage
}
