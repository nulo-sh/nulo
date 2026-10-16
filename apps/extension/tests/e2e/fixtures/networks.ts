import type { Page } from "puppeteer"
import { clickByTestId } from "./dom"
import { acceptConfirmPopup } from "./widgets"

/**
 * Switch to a network by name. The header chip now routes to the Manage
 * Networks settings page; from there we drill into the network's detail
 * page and tap "Set as active".
 */
export async function switchToNetwork(page: Page, networkName: string): Promise<void> {
	// The BEFORE snapshot below disambiguates real vs repeat switch, so it
	// must read a RENDERED header: on a freshly-opened popup the chip mounts
	// with empty text for a beat, and an empty read misclassifies an
	// already-on-target wallet as a real switch — whose "address flips" wait
	// below can then never be satisfied, because the target chain re-derives
	// the address the wallet already shows. Wait for the render signal.
	await page.waitForFunction(
		() => {
			const btn = document.querySelector('[data-testid="network-button"]')
			return !!btn && (btn.textContent ?? "").trim().length > 0
		},
		{ timeout: 15_000, polling: 200 },
	)
	// Snapshot the BEFORE state. The header text identifies the chain the
	// popup is currently on; the activeAccount key identifies the address
	// `setupActiveAccount` last wrote. Both are needed to disambiguate
	// "this is a real chain switch" vs "this is a no-op repeat switch":
	//   - real switch  → activeAccount FLIPS to the target chain's address
	//                    (different secret-derivation key per chain)
	//   - repeat switch → activeAccount stays put; the network watcher fires
	//                    but `setupActiveAccount` re-picks the same account
	const beforeHeader = await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="network-button"]')
		return (btn?.textContent ?? "").trim()
	})
	const beforeAccount = await page.evaluate(async () => {
		const r = await chrome.storage.local.get("nulo:ui:activeAccount")
		return (r["nulo:ui:activeAccount"] as string | undefined) ?? ""
	})
	// Exact match (not substring) on the trimmed header text. Substring
	// matching collides when a custom network is renamed to contain another
	// network's name (e.g., "Local Backup" would falsely look like a no-op
	// when switching to "Local"). Network names are user-visible identifiers,
	// so an exact match against the rendered header is the precise contract.
	const isRealSwitch = beforeHeader !== networkName

	// Navigate via the header chip → Manage Networks → detail page → set active.
	// SettingItem rows render as <a> elements whose `href` can be `null`; raw
	// `.click()` doesn't reliably fire on those, so the row tap uses a synthetic
	// dispatchEvent (matches openNetworkDetail's contract).
	await clickByTestId(page, "network-button")
	const rowSelector = `[data-testid="network-row"][data-network-name="${networkName}"]`
	await page.waitForSelector(rowSelector, { visible: true, timeout: 5_000 })
	await page.evaluate((sel: string) => {
		const row = document.querySelector(sel) as HTMLElement | null
		row?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
	}, rowSelector)
	await page.waitForSelector('[data-testid="network-set-active"]', { visible: true, timeout: 5_000 })
	await clickByTestId(page, "network-set-active")
	// Return to /popup/general so callers can keep using general-page selectors
	// (importToken, refreshBalances, gas-balance reads, …). The chip flow took
	// us from general → settings list → detail; navigate explicitly back rather
	// than `history.go(-2)`, which is fragile under deep-link bypasses.
	await page.evaluate(() => {
		window.location.hash = "/popup/general"
	})
	await page.waitForFunction(() => window.location.hash.includes("/popup/general"), { timeout: 5_000 })

	// First: wait for the network-button header to display the target name
	// exactly. This is the "appStore.network changed" signal.
	await page.waitForFunction(
		(target: string) => {
			const btn = document.querySelector('[data-testid="network-button"]')
			return !!btn && (btn.textContent ?? "").trim() === target
		},
		{ timeout: 30_000, polling: 250 },
		networkName,
	)

	// Then: wait for the network watcher's `setupActiveAccount` to land. On
	// a real switch, `nulo:ui:activeAccount` flips away from `beforeAccount`
	// because each chain derives its own address. On a repeat switch we just
	// confirm the existing value is still set (the watcher may briefly clear
	// the `account` ref while re-fetching).
	await page.waitForFunction(
		async ({ prev, real }: { prev: string; real: boolean }) => {
			const r = await chrome.storage.local.get("nulo:ui:activeAccount")
			const addr = r["nulo:ui:activeAccount"]
			if (typeof addr !== "string" || addr.length === 0) return false
			return real ? addr !== prev : true
		},
		{ timeout: 30_000, polling: 250 },
		{ prev: beforeAccount, real: isRealSwitch },
	)
}

/** Switch to the Local Network (chain ID 0, http://localhost:8080). */
export async function switchToLocalNetwork(page: Page): Promise<void> {
	await switchToNetwork(page, "Local Network")
}

/** Drill into a Network detail page (`/popup/settings/networks/[id]`) by name.
 *  Clicks the network-row via dispatchEvent (SettingItem renders as <a> whose
 *  href can be null). Resolves once the detail page has mounted (the rename
 *  row is the most stable detail-page testid). Caller is on the detail page. */
export async function openNetworkDetail(page: Page, name: string): Promise<void> {
	const rowSelector = `[data-testid="network-row"][data-network-name="${name}"]`
	await page.waitForSelector(rowSelector, { visible: true, timeout: 5_000 })
	await page.evaluate((sel: string) => {
		const row = document.querySelector(sel) as HTMLElement | null
		row?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
	}, rowSelector)
	await page.waitForFunction(() => window.location.hash.includes("/popup/settings/networks/"), { timeout: 5_000 })
	await page.waitForSelector('[data-testid="network-detail-rename"]', { visible: true, timeout: 5_000 })
}

/** Open the detail page for the network row matching `name` and click
 *  "Delete chain". Accepts the ConfirmPopup and resolves after the
 *  router navigates back to the list (the row should be gone).
 *
 *  The inline delete icon lives on the per-`Network` detail page
 *  (`/popup/settings/networks/[id]`); the list drills via
 *  `chevron` + `@click`. Trigger navigation with the `dispatchEvent`
 *  trick because `SettingItem`'s `<a>` can have `href=null`. */
export async function deleteNetworkRow(page: Page, name: string): Promise<void> {
	const rowSelector = `[data-testid="network-row"][data-network-name="${name}"]`
	await page.waitForSelector(rowSelector, { visible: true, timeout: 5_000 })
	await page.evaluate((sel: string) => {
		const row = document.querySelector(sel) as HTMLElement | null
		row?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
	}, rowSelector)
	// Wait for the detail page to mount.
	await page.waitForSelector('[data-testid="network-delete-chain-btn"]', { visible: true, timeout: 5_000 })
	await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="network-delete-chain-btn"]') as HTMLElement | null
		btn?.click()
	})
	await acceptConfirmPopup(page)
	// We should be back on the list; the deleted row should be gone.
	await page.waitForFunction(
		() => window.location.hash.startsWith("#/popup/settings/networks") && !window.location.hash.includes("/networks/"),
		{ timeout: 5_000 },
	)
	await page.waitForFunction((sel: string) => !document.querySelector(sel), { timeout: 5_000 }, rowSelector)
}
