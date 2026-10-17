import type { Page } from "puppeteer"
import { clickByTestId, clickSelector, replaceInputValue } from "./dom"
import { navigateToSettings } from "./navigation"
import { closeStuckPopup } from "./widgets"

/** Read the active account address from chrome.storage. */
export async function getAccountAddress(page: Page): Promise<string> {
	return await page.evaluate(async () => {
		const result = await chrome.storage.local.get("nulo:ui:activeAccount")
		return result["nulo:ui:activeAccount"] as string
	})
}

/** Poll `chrome.storage.local["nulo:ui:activeAccount"]` until it equals
 *  `address`, or throw with expected-vs-observed.
 *
 *  The account-switch click handlers fire `selectAccount` UN-awaited
 *  (`AccountsPopup.vue`), and `selectAccount` mutates the store ref before
 *  awaiting persistence — so the authoritative `nulo:ui:activeAccount` write
 *  lands a beat after the click. A caller that needs the switch to have TAKEN
 *  EFFECT (e.g. before reading the switched account's feed) must wait on this
 *  storage signal, not on the click returning. */
async function waitForActiveAccount(page: Page, address: string, timeoutMs = 5_000): Promise<void> {
	try {
		await page.waitForFunction(
			async (want: string) => {
				const r = await chrome.storage.local.get("nulo:ui:activeAccount")
				return r["nulo:ui:activeAccount"] === want
			},
			{ timeout: timeoutMs, polling: 100 },
			address,
		)
	} catch {
		const observed = await getAccountAddress(page).catch(() => "<read failed>")
		throw new Error(`switch account: expected nulo:ui:activeAccount="${address}" but observed "${observed}" after ${timeoutMs}ms`)
	}
}

/** Create a new account via the NewAccountPopup. */
export async function createAccount(page: Page, name: string): Promise<void> {
	// Navigate to the accounts settings page
	await navigateToSettings(page, "accounts")

	await clickByTestId(page, "accounts-new-btn")

	// Wait for the name input to mount
	await page.waitForSelector('[data-testid="account-name-input"]', { visible: true, timeout: 5_000 })
	await replaceInputValue(page, '[data-testid="account-name-input"]', name)

	await clickByTestId(page, "new-account-submit")

	// Wait for the new ROW (the post-create signal) — NOT the popup input
	// vanishing: Vue's <Transition> can stick mid-leave in headless Chrome
	// (rAF throttling). Mirrors the proven flow in accounts.test.ts.
	await page.waitForSelector(`[data-testid="manage-accounts-row"][data-account-name="${name}"]`, {
		visible: true,
		timeout: 10_000,
	})
	await closeStuckPopup(page)
}

/** Switch to an account by name via the AccountsPopup in header.
 *
 *  The AccountsPopup row exposes BOTH `data-account-name` and
 *  `data-account-address`, so we resolve the target address from the row
 *  before clicking and then wait until the switch actually lands in storage —
 *  callers can assume the active account IS the target on return, not merely
 *  that the row was clicked. */
export async function switchAccount(page: Page, name: string): Promise<void> {
	await clickByTestId(page, "account-selector")
	await page.waitForSelector('[data-testid="accounts-popup"]', { visible: true, timeout: 5_000 })

	const selector = `[data-testid="account-item"][data-account-name="${name}"]`
	await page.waitForSelector(selector, { visible: true, timeout: 5_000 })
	// Resolve the target address from the row so the post-click wait can key
	// on the authoritative storage signal (see waitForActiveAccount).
	const targetAddress = await page.evaluate(
		(sel: string) => document.querySelector(sel)?.getAttribute("data-account-address") ?? null,
		selector,
	)
	await clickSelector(page, selector)

	// Vue Transition can stick mid-leave; force-close.
	await closeStuckPopup(page)

	if (targetAddress) {
		await waitForActiveAccount(page, targetAddress)
	} else {
		// Row lacked a resolvable address (shouldn't happen — pinned by the
		// selector rule that both attrs are present). Fall back to the weaker
		// guarantee: the popup closed and an account is active.
		await page.waitForFunction(
			async () => {
				const r = await chrome.storage.local.get("nulo:ui:activeAccount")
				const addr = r["nulo:ui:activeAccount"]
				return typeof addr === "string" && addr.length > 0
			},
			{ timeout: 5_000, polling: 100 },
		)
	}
}

/** Switch the wallet's active account by ADDRESS — stable across runs, unlike the
 *  display name, which depends on creation order vs the dApp's account-exposure
 *  order (e.g. `accountAddresses[0]` may be the "Second"-named account).
 *
 *  Waits until `nulo:ui:activeAccount === address` before returning — the click
 *  fires `selectAccount` un-awaited, so without this a caller can read a
 *  half-switched state. */
export async function switchAccountByAddress(page: Page, address: string): Promise<void> {
	await clickByTestId(page, "account-selector")
	await page.waitForSelector('[data-testid="accounts-popup"]', { visible: true, timeout: 5_000 })

	const selector = `[data-testid="account-item"][data-account-address="${address}"]`
	await page.waitForSelector(selector, { visible: true, timeout: 5_000 })
	await clickSelector(page, selector)

	// Vue Transition can stick mid-leave; force-close.
	await closeStuckPopup(page)

	await waitForActiveAccount(page, address)
}

/** Create a second account and return its address.
 *
 *  Creating an account SELECTS it: `NewAccountPopup.handleCreateAccount` sets
 *  `appStore.account` and writes `nulo:ui:activeAccount = <new address>`. So we
 *  snapshot the current active address, create, then wait for the active
 *  account to flip to a NEW non-empty value and return it. Reuses
 *  `createAccount` for the UI flow. */
export async function createSecondAccount(page: Page, name = "Second"): Promise<string> {
	const previous = await getAccountAddress(page)
	await createAccount(page, name)
	await page.waitForFunction(
		async (prev: string) => {
			const r = await chrome.storage.local.get("nulo:ui:activeAccount")
			const addr = r["nulo:ui:activeAccount"]
			return typeof addr === "string" && addr.length > 0 && addr !== prev
		},
		{ timeout: 15_000, polling: 100 },
		previous,
	)
	return getAccountAddress(page)
}
