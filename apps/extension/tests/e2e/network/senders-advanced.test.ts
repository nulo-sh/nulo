/**
 * Network-suite coverage for the Advanced senders surface (Settings →
 * Advanced → Account State → Senders) — the ONE place sender registrations
 * are managed now that contacts are decoupled — plus the decoupling pins:
 * adding a contact registers nothing, deleting a contact unregisters
 * nothing, and the contact-row chip is a read-only view of PXE truth.
 * Requires a running local Aztec node (PXE-backed registerSender).
 *
 * Identities are generated PER TEST BODY (not beforeAll): the extension
 * fixture is file-scoped and vitest retries re-enter the test with prior
 * attempts' contacts/senders still present — file-scoped constants turn
 * every retry into a duplicate-validation wall.
 */
import { afterAll, expect, inject } from "vitest"
import { test, openPopup, waitForHash, clickByTestId, replaceInputValue } from "../fixtures/extension"
import { addContact, closeStuckPopup, navigateByHash, navigateToSettings, waitForToast } from "../fixtures/helpers"
import type { AztecTestConfig } from "../fixtures/aztec"
import {
	closeImportWith,
	contactRow,
	contactsFiles,
	exportContactsFile,
	listedAsSender,
	pickContactsFile,
	refuseTestnet,
	senderChip,
	senderLine,
	toastAfter,
} from "../helpers/contacts"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const SENDERS_HASH = "#/popup/settings/advanced/account-state/senders"
const CONTACTS_HASH = "#/popup/settings/contacts"

/** Valid (on-curve) random address + a name tied to it, fresh per call. */
async function freshIdentity(prefix: string): Promise<{ name: string; address: string }> {
	const { AztecAddress } = await import("@aztec-labs/aztec.js/addresses")
	const address = (await AztecAddress.random()).toString()
	return { name: `${prefix}${address.slice(4, 10)}`, address }
}

/** Hash hops between sub-pages (they render a SubPageHeader, no bottom nav —
 *  navigateToSettings would hang waiting for the nav bar). */
async function gotoSenders(page: Awaited<ReturnType<typeof openPopup>>) {
	await navigateByHash(page, SENDERS_HASH)
	await page.waitForSelector('[data-testid="senders-add-btn"]', { visible: true, timeout: 10_000 })
	// The add button renders while the list is still FETCHING — a zero-row
	// assertion against the loading state would false-pass. Wait for the
	// fetch to settle before any caller reads rows.
	await page.waitForFunction(() => !document.querySelector('[data-testid="loading-state"]'), { timeout: 15_000, polling: 100 })
}
async function gotoContacts(page: Awaited<ReturnType<typeof openPopup>>) {
	await navigateByHash(page, CONTACTS_HASH)
	await page.waitForSelector('[data-testid="contacts-new-btn"]', { visible: true, timeout: 10_000 })
}

async function addSenderViaAdvanced(page: Awaited<ReturnType<typeof openPopup>>, address: string) {
	await clickByTestId(page, "senders-add-btn")
	await page.waitForSelector('[data-testid="new-sender-submit"]', { visible: true, timeout: 5_000 })
	await replaceInputValue(page, '[data-testid="new-sender-address-input"]', address)
	await clickByTestId(page, "new-sender-submit")
	// The row renders from the onSenderAdded event only after the PXE
	// registration resolves — this is the deterministic post-mutation signal.
	await page.waitForSelector(`[data-testid="sender-row"][data-sender-address="${address}"]`, {
		visible: true,
		timeout: 30_000,
	})
	await closeStuckPopup(page)
}

test.skipIf(!hasConfig)(
	"adding a contact registers NO sender; Advanced registration lights the read-only chip",
	{ timeout: 120_000 },
	async ({ localNetworkExtension }) => {
		const { name, address } = await freshIdentity("Chip")
		const page = await openPopup(localNetworkExtension)
		await waitForHash(page, "#/popup/general")

		// A freshly-added contact must NOT be registered as a sender.
		await navigateToSettings(page, "contacts")
		await addContact(page, name, address)
		expect(await listedAsSender(page, name)).toBe(false)

		// Register the SAME address through the Advanced surface. Before
		// registering, assert the SETTLED sender list has no row for the
		// address — a delayed add-contact-side mutation would surface here,
		// not just as a missed chip in the instant after row render.
		await gotoSenders(page)
		const preRegRow = await page.evaluate(
			(a: string) => !!document.querySelector(`[data-testid="sender-row"][data-sender-address="${a}"]`),
			address,
		)
		expect(preRegRow).toBe(false)
		await addSenderViaAdvanced(page, address)

		// Back on contacts, the chip reflects the PXE registration.
		await gotoContacts(page)
		await page.waitForSelector(senderChip(name), { visible: true, timeout: 10_000 })

		// Delete the sender from Advanced — the chip clears; the contact stays.
		await gotoSenders(page)
		const rowSelector = `[data-testid="sender-row"][data-sender-address="${address}"]`
		await page.waitForSelector(rowSelector, { visible: true, timeout: 10_000 })
		await page.evaluate((sel: string) => {
			// The delete affordance is an <Icon> (SVG) — SVGElement has no
			// .click(); dispatch a bubbling MouseEvent instead.
			document
				.querySelector(`${sel} [data-testid="sender-delete"]`)
				?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }))
		}, rowSelector)
		await page.waitForSelector('[data-testid="confirm-submit"]', { visible: true, timeout: 5_000 })
		await clickByTestId(page, "confirm-submit")
		await waitForToast(page, "Sender successfully deleted", 30_000)
		await page.waitForFunction((sel: string) => !document.querySelector(sel), { timeout: 10_000 }, rowSelector)
		await closeStuckPopup(page)

		await gotoContacts(page)
		await page.waitForSelector(contactRow(name), { visible: true, timeout: 10_000 })
		await page.waitForFunction((s: string) => !document.querySelector(s), { timeout: 10_000 }, senderChip(name))
	},
)

test.skipIf(!hasConfig)(
	"deleting a contact never unregisters its sender (decoupling pin)",
	{ timeout: 120_000 },
	async ({ localNetworkExtension }) => {
		const { name, address } = await freshIdentity("Keep")
		const page = await openPopup(localNetworkExtension)
		await waitForHash(page, "#/popup/general")

		// Register a sender via Advanced, then add a contact with that address.
		// Same settle rule as gotoSenders: don't act on the list mid-fetch —
		// the initial snapshot could overwrite the add-event's row render.
		await navigateToSettings(page, "advanced", "account-state", "senders")
		await page.waitForSelector('[data-testid="senders-add-btn"]', { visible: true, timeout: 10_000 })
		await page.waitForFunction(() => !document.querySelector('[data-testid="loading-state"]'), { timeout: 15_000, polling: 100 })
		await addSenderViaAdvanced(page, address)

		await gotoContacts(page)
		await addContact(page, name, address)
		await page.waitForSelector(senderChip(name), { visible: true, timeout: 10_000 })

		// Delete the contact. The confirm offers NO sender option.
		const rowSelector = contactRow(name)
		await page.evaluate((sel: string) => {
			const row = document.querySelector<HTMLElement>(sel)
			row?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
			row?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
			row?.querySelector<HTMLElement>('[data-testid="contact-delete"]')?.click()
		}, rowSelector)
		await page.waitForSelector('[data-testid="confirm-submit"]', { visible: true, timeout: 5_000 })
		const toggleVisible = await page.evaluate(() => !!document.querySelector('[data-testid="confirm-toggle"]'))
		expect(toggleVisible).toBe(false)

		await clickByTestId(page, "confirm-submit")
		await waitForToast(page, "Contact deleted", 30_000)
		await page.waitForFunction((sel: string) => !document.querySelector(sel), { timeout: 10_000 }, rowSelector)
		await closeStuckPopup(page)

		// The sender registration survives the contact deletion.
		await gotoSenders(page)
		await page.waitForSelector(`[data-testid="sender-row"][data-sender-address="${address}"]`, {
			visible: true,
			timeout: 10_000,
		})
	},
)

const files = contactsFiles()
afterAll(files.cleanup)

test.skipIf(!hasConfig)(
	"a sender row imported from a contacts file registers on the active network: its chip lights, Senders lists it, and the export marks it",
	{ timeout: 180_000 },
	async ({ localNetworkExtension }) => {
		const sender = await freshIdentity("Imp")
		const plain = await freshIdentity("Pln")
		// The export asks every network for its senders; Testnet must not answer from the public endpoint.
		const refusal = await refuseTestnet(localNetworkExtension)
		try {
			const page = await openPopup(localNetworkExtension)
			await waitForHash(page, "#/popup/general")
			await gotoContacts(page)

			await pickContactsFile(page, files.write({ version: 2, contacts: [{ ...sender, isSender: true }, plain] }))
			expect(await senderLine(page)).toBe("1 sender will be registered on Local Network.")
			// Registration waits on the local node.
			await toastAfter(page, () => closeImportWith(page, "import-contacts-submit"), "Contacts imported · 1 sender registered", 60_000)
			await page.waitForSelector(senderChip(sender.name), { visible: true, timeout: 10_000 })
			expect(await listedAsSender(page, plain.name)).toBe(false)

			await gotoSenders(page)
			await page.waitForSelector(`[data-testid="sender-row"][data-sender-address="${sender.address}"]`, {
				visible: true,
				timeout: 10_000,
			})
			expect(await page.$(`[data-testid="sender-row"][data-sender-address="${plain.address}"]`)).toBeNull()

			await gotoContacts(page)
			const exported = JSON.parse(await exportContactsFile(page)) as { contacts: Array<{ address: string; isSender: boolean }> }
			const flag = (address: string) => exported.contacts.find((c) => c.address === address)?.isSender
			expect(flag(sender.address)).toBe(true)
			expect(flag(plain.address)).toBe(false)
			expect(await refusal.failures()).toEqual([])
		} finally {
			await refusal.stop()
		}
	},
)
