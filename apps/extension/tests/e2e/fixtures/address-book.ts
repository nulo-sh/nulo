import type { Page } from "puppeteer"
import { clickByTestId, replaceInputValue } from "./dom"
import { closeStuckPopup } from "./widgets"

/** The contacts list's row for `name`, as the row states its own name. */
export const contactRow = (name: string) => `[data-testid="contact-row"][data-contact-name="${name}"]`

/** The sender chip on the contacts list's row for `name`. */
export const senderChip = (name: string) => `${contactRow(name)} [data-testid="contact-sender-chip"]`

/** Opens the NewContactPopup from the Contacts page and types `name` and `address`, without saving. */
export async function fillNewContactForm(page: Page, name: string, address: string): Promise<void> {
	await clickByTestId(page, "contacts-new-btn")
	await page.waitForSelector('[data-testid="contact-name-input"]', { visible: true, timeout: 5_000 })
	await replaceInputValue(page, '[data-testid="contact-name-input"]', name)
	await page.waitForSelector('[data-testid="contact-address-input"]', { visible: true, timeout: 5_000 })
	await replaceInputValue(page, '[data-testid="contact-address-input"]', address)
}

/** Add a contact via the NewContactPopup. Saving a contact touches the
 *  contact service only — sender registration is a separate concern
 *  (Settings → Developer → Account State → Senders). */
export async function addContact(page: Page, name: string, address: string): Promise<void> {
	await fillNewContactForm(page, name, address)
	await clickByTestId(page, "new-contact-submit")

	// Deterministic post-mutation signal — wait for the new contact row to
	// render. Previously also asserted the popup had unmounted, but in the
	// headless test context the popup's close transition sticks (Vue
	// <Transition> rAF gets throttled despite the polling fix and
	// --disable-renderer-backgrounding flag — the wallet popup ends up
	// `sheet-enter-from sheet-enter-active` indefinitely even though
	// popupStore.popups is empty). Closing via Escape force-unmounts.
	await page.waitForFunction((s: string) => !!document.querySelector(s), { timeout: 10_000, polling: 200 }, contactRow(name))

	await closeStuckPopup(page)
}

/** Delete a contact by name (assumes contacts page is open). Deleting a
 *  contact never touches sender registration — senders are managed only
 *  in Settings → Developer → Account State → Senders. */
export async function deleteContact(page: Page, name: string): Promise<void> {
	const rowSelector = contactRow(name)
	await page.waitForSelector(rowSelector, { visible: true, timeout: 5_000 })

	// Synthesize a hover so the action icons (revealed via :hover CSS) are
	// rendered + interactive. ElementHandle.hover() goes through the broken
	// CDP path; dispatching mouseover/mouseenter in page context is reliable.
	await page.evaluate((sel: string) => {
		const row = document.querySelector<HTMLElement>(sel)
		if (!row) return
		row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
		row.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
	}, rowSelector)

	// Click the scoped delete icon within this specific row
	await page.evaluate((s: string) => {
		const row = document.querySelector(s)
		const del = row?.querySelector<HTMLElement>('[data-testid="contact-delete"]')
		del?.click()
	}, rowSelector)

	// Confirm deletion via ConfirmPopup
	await page.waitForSelector('[data-testid="confirm-submit"]', {
		visible: true,
		timeout: 5_000,
	})

	await clickByTestId(page, "confirm-submit")

	// Wait for row to disappear
	await page.waitForFunction((sel: string) => !document.querySelector(sel), { timeout: 5_000 }, rowSelector)
}
