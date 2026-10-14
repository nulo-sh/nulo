/**
 * A contacts import of sender rows, stopped mid-run by a lock from outside its page (what another
 * window's Lock does), against the local node: every contact it stored has its sender registered,
 * because each row registers its sender before its contact, and a re-run completes the book.
 * Composition tests fake both the PXE registration and the cross-port lock; only this run has the
 * real ones. Requires a running local Aztec node (PXE-backed sender registration).
 *
 * Identities are generated per test body: the extension fixture is file-scoped, so a retry starts
 * with the earlier attempt's contacts and senders still present.
 */
import { afterAll, expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { openPopup, test, waitForHash } from "../fixtures/extension"
import { ensureUnlocked, lockFromAnotherWindow, navigateByHash, registeredSenders, waitForLockScreen } from "../fixtures/helpers"
import {
	closeImportWith,
	contactsFiles,
	pickContactsFile,
	pressRow,
	refuseTestnet,
	shownRows,
	shownToast,
	storedContacts,
	toastAfter,
	waitForSelected,
	waitForStoredCount,
} from "../helpers/contacts"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

const ROWS = 60
const files = contactsFiles()
afterAll(files.cleanup)

async function freshSenderRows(): Promise<Array<{ name: string; address: string; isSender: true }>> {
	const { AztecAddress } = await import("@aztec-labs/aztec.js/addresses")
	const run = Math.random().toString(36).slice(2, 7)
	return Promise.all(
		Array.from({ length: ROWS }, async (_, i) => ({
			name: `Stop ${run} ${i}`,
			address: (await AztecAddress.random()).toString(),
			isSender: true as const,
		})),
	)
}

async function gotoContacts(page: Awaited<ReturnType<typeof openPopup>>): Promise<void> {
	await navigateByHash(page, "#/popup/settings/contacts")
	await page.waitForSelector('[data-testid="contacts-new-btn"]', { visible: true, timeout: 10_000 })
}

test.skipIf(!aztecConfig)(
	"a lock from another window stops an import between rows: every stored contact has its sender, and a re-run completes the book",
	{ timeout: 420_000 },
	async ({ localNetworkExtension: ctx }) => {
		const rows = await freshSenderRows()
		const ours = new Set(rows.map((r) => r.address.toLowerCase()))
		const file = files.write({ version: 2, contacts: rows })
		// The Contacts page asks every network for its senders; Testnet must not answer from the public endpoint.
		const refusal = await refuseTestnet(ctx)
		try {
			const page = await openPopup(ctx)
			await waitForHash(page, "#/popup/general")
			await gotoContacts(page)
			const before = (await storedContacts(page)).length
			const storedOurs = async () => (await storedContacts(page)).filter((c) => ours.has(c.address.toLowerCase()))

			await pickContactsFile(page, file)
			await closeImportWith(page, "import-contacts-submit")
			await waitForStoredCount(page, before + 2, 180_000)
			await lockFromAnotherWindow(page)
			await waitForLockScreen(page)
			const toast = await shownToast(page, "Import incomplete")
			const written = Number(/^Import incomplete · (\d+) of 60 contacts written$/.exec(toast)?.[1] ?? Number.NaN)
			expect(written).toBeGreaterThan(0)
			expect(written).toBeLessThan(ROWS)

			await ensureUnlocked(page)
			const stopped = await storedOurs()
			// A write whose reply the lock cut off is stored but not counted.
			expect([written, written + 1]).toContain(stopped.length)
			const senders = new Set((await registeredSenders(page)).map((a) => a.toLowerCase()))
			expect(stopped.filter((c) => !senders.has(c.address.toLowerCase()))).toEqual([])

			await gotoContacts(page)
			await pickContactsFile(page, file)
			const again = await shownRows(page)
			const saved = again.filter((r) => r.kind === "unchanged")
			expect(saved.map((r) => r.selected)).toEqual(stopped.map(() => false))
			expect(again.filter((r) => r.kind === "new" && r.selected)).toHaveLength(ROWS - stopped.length)
			await pressRow(page, saved[0].name)
			await waitForSelected(page, saved[0].name, true)
			const selected = ROWS - stopped.length + 1
			await toastAfter(
				page,
				() => closeImportWith(page, "import-contacts-submit"),
				`Contacts imported · ${selected} senders registered`,
				300_000,
			)

			expect(await storedOurs()).toHaveLength(ROWS)
			const finalSenders = new Set((await registeredSenders(page)).map((a) => a.toLowerCase()))
			expect([...ours].filter((a) => !finalSenders.has(a))).toEqual([])
			expect(await refusal.failures()).toEqual([])
		} finally {
			await refusal.stop()
		}
	},
)
