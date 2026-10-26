import type { Page } from "puppeteer"
import { trimAddress } from "@/utils/string"
import { clickByTestId, clickSelector, replaceInputValue } from "./dom"
import { navigateToSettings } from "./navigation"
import { pollUntil } from "./poll"
import { callService, peekSession } from "./session"
import { closeStuckPopup } from "./widgets"

/** The device's account selection as the active profile reads it, the account the popup opens on:
 *  undefined while locked or when another profile made the last selection. Send from an extension page. */
export async function selectedAccount(page: Page): Promise<string | undefined> {
	const profile = await peekSession(page)
	return profile ? callService<string | undefined>(page, "ui-preference", "getSelectedAccount", [profile.id]) : undefined
}

/** The account the popup's header shows, trimmed as it trims it: the selection the popup opened on,
 *  which the stored selection alone does not prove. Read from a page showing the header. */
export async function shownAccount(page: Page): Promise<string | undefined> {
	return page.evaluate(() => document.querySelector('[data-testid="account-address-text"]')?.textContent?.trim() || undefined)
}

/** Polls the header until it shows `address` (see {@link shownAccount}). */
export async function waitForShownAccount(page: Page, address: string, label: string, timeoutMs = 15_000): Promise<void> {
	const trimmed = trimAddress(address, 6, 4, "...")
	await pollUntil(
		() => shownAccount(page),
		(shown) => shown?.startsWith(trimmed) === true,
		{ label, timeoutMs, intervalMs: 250 },
	)
}

/** The active profile's selected account (see {@link selectedAccount}). */
export async function getAccountAddress(page: Page): Promise<string> {
	return (await selectedAccount(page)) as string
}

/** Polls the selected account until `done` accepts it. A read the worker does not answer in time
 *  (busy deriving an import, say) counts as no selection yet, as a missing key did. */
export async function waitForSelectedAccount(
	page: Page,
	done: (address: string | undefined) => boolean,
	label: string,
	timeoutMs = 5_000,
	intervalMs = 100,
): Promise<string | undefined> {
	return pollUntil(() => selectedAccount(page).catch(() => undefined), done, { label, timeoutMs, intervalMs })
}

/** Polls the selected account until it equals `address`, or throws with expected-vs-observed.
 *
 *  The account-switch click handlers fire `selectAccount` UN-awaited
 *  (`AccountsPopup.vue`), and `selectAccount` mutates the store ref before
 *  awaiting persistence — so the authoritative selection write lands a beat
 *  after the click. A caller that needs the switch to have TAKEN EFFECT (e.g.
 *  before reading the switched account's feed) must wait on this signal, not
 *  on the click returning. */
async function waitForActiveAccount(page: Page, address: string, timeoutMs = 5_000): Promise<void> {
	await waitForSelectedAccount(page, (observed) => observed === address, `switch account: the selection is ${address}`, timeoutMs)
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
		await waitForSelectedAccount(page, (addr) => !!addr, "switch account: an account is selected")
	}
}

/** Switch the wallet's active account by ADDRESS — stable across runs, unlike the
 *  display name, which depends on creation order vs the dApp's account-exposure
 *  order (e.g. `accountAddresses[0]` may be the "Second"-named account).
 *
 *  Waits until the selection is `address` before returning — the click
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
 *  `appStore.account` and records the new address as the selection. So we
 *  snapshot the current active address, create, then wait for the active
 *  account to flip to a NEW non-empty value and return it. Reuses
 *  `createAccount` for the UI flow. */
export async function createSecondAccount(page: Page, name = "Second"): Promise<string> {
	const previous = await getAccountAddress(page)
	await createAccount(page, name)
	const created = await waitForSelectedAccount(
		page,
		(addr) => !!addr && addr !== previous,
		"create account: the selection moves to the new account",
		15_000,
	)
	return created as string
}
