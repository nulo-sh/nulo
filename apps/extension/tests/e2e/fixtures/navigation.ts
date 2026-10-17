import type { Page } from "puppeteer"
import { clickByTestId, waitForHash } from "./dom"

/** Click a bottom navigation tab. `general` is the HOME tab (the route name never changed). */
export async function clickNavTab(page: Page, tab: "activity" | "general" | "holdings" | "settings"): Promise<void> {
	await page.waitForSelector(`[data-testid="nav-${tab}"]`, { visible: true, timeout: 5_000 })
	await clickByTestId(page, `nav-${tab}`)
}

/** Open the Holdings tab and wait for its page to mount. */
export async function openHoldings(page: Page): Promise<void> {
	await clickNavTab(page, "holdings")
	await page.waitForFunction(() => window.location.hash === "#/popup/holdings", { timeout: 5_000 })
	await page.waitForSelector('[data-testid="holdings-page"]', { visible: true, timeout: 5_000 })
}

/** Navigate to a settings sub-page by URL segments. Only the first segment
 *  has a `setting-nav-<segment>` testid on the index page; deeper segments
 *  must be exposed by their parent page (add one when the test needs it).
 *  Example: `navigateToSettings(page, "accounts")`. */
export async function navigateToSettings(page: Page, ...segments: string[]): Promise<void> {
	await clickNavTab(page, "settings")
	await page.waitForFunction(() => window.location.hash === "#/popup/settings", { timeout: 5_000 })

	const pathSoFar: string[] = []
	for (const segment of segments) {
		pathSoFar.push(segment)
		const href = `#/popup/settings/${pathSoFar.join("/")}`
		// First segment: use the testid on the settings index. Deeper
		// segments: fall back to the SettingItem's `to` prop since child
		// pages don't yet have a consistent testid naming convention.
		const testidSelector = `[data-testid="setting-nav-${pathSoFar.join("-")}"]`
		// Poll for the nav target to RENDER, then click it. The destination route
		// component mounts asynchronously AFTER the hash changes, so finding the
		// next segment's link immediately (the prior `waitForFunction` only
		// confirmed the hash, not the DOM) races the mount — and on a slow CI box
		// that race is reliably lost: the page is still blank, the link absent.
		// `waitForFunction` retries the find+click until the element exists; the
		// click is the side effect that resolves it.
		const clicked = await page
			.waitForFunction(
				({ id, hash }: { id: string; hash: string }) => {
					const byTestId = document.querySelector<HTMLElement>(id)
					if (byTestId) {
						byTestId.click()
						return "testid"
					}
					const a = [...document.querySelectorAll("a")].find(
						(el) => el.getAttribute("href") === hash || el.getAttribute("to") === hash.slice(1),
					)
					if (a) {
						a.click()
						return "href"
					}
					return null
				},
				{ timeout: 10_000, polling: 200 },
				{ id: testidSelector, hash: href },
			)
			.then((h) => h.jsonValue())
			.catch(() => null)

		if (!clicked) {
			// Should be rare now that we wait for render. If it still fails, show
			// what the page actually held so a regression (stale path vs genuinely
			// absent target) is diagnosable instead of a bare throw.
			const diag = await page
				.evaluate(() => ({
					hash: window.location.hash,
					allTestids: [...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")).slice(0, 60),
					anchorCount: document.querySelectorAll("a").length,
					buttonCount: document.querySelectorAll("button").length,
					bodyText: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 400),
				}))
				.catch(() => "nav diag read failed")
			console.error(`[nav-diag] navigateToSettings FAIL for ${href} (want ${testidSelector}): ${JSON.stringify(diag)}`)
			throw new Error(`navigateToSettings: no setting nav target for ${href} (expected testid ${testidSelector})`)
		}

		await page.waitForFunction((expected: string) => window.location.hash.startsWith(expected), { timeout: 5_000 }, href)
		// No explicit post-route sleep — every caller follows with its own
		// `waitForSelector` for an element on the landed page, which gives a
		// deterministic mount signal. The previous fixed 200ms padding was
		// wasted on every fast path. Confirmed safe across 26 smoke call
		// sites + 6 network sites.
	}
}

/** Open Settings → Developer → Account State → `section`. Account State keeps its
 *  `setting-nav-advanced-account-state-*` ids, which `navigateToSettings` cannot build. */
export async function openAccountState(page: Page, section: "notes" | "authwits" | "contracts" | "senders"): Promise<void> {
	await navigateToSettings(page, "developer")
	await clickByTestId(page, "setting-nav-advanced-account-state")
	await waitForHash(page, "#/popup/settings/developer/account-state", 5_000)
	await clickByTestId(page, `setting-nav-advanced-account-state-${section}`)
	await waitForHash(page, `#/popup/settings/developer/account-state/${section}`, 5_000)
}

/** Navigate by hash. Vue Router's hash mode listens for `hashchange`, but
 *  setting `location.hash` to the same value is a no-op — dispatch the
 *  event explicitly so the router sees a transition. Used for deep-linking
 *  past pages whose link buttons don't yet expose testids. */
export async function navigateByHash(page: Page, hash: string, timeout = 5_000): Promise<void> {
	await page.evaluate((h: string) => {
		if (window.location.hash !== h) {
			window.location.hash = h
		} else {
			window.dispatchEvent(new HashChangeEvent("hashchange"))
		}
	}, hash)
	await page.waitForFunction((h: string) => window.location.hash === h, { timeout }, hash)
	// No post-hash sleep: every caller follows with a `waitForSelector` for
	// an element on the destination page (or asserts on a globally-stable
	// document attribute like `theme`). If a new caller doesn't, it should
	// add its own state-driven wait, not bring the sleep back.
}
