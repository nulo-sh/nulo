/**
 * Importing contacts through the real UI: the Contacts menu, the file chooser, the grouped popup,
 * choosing rows by pointer and by keyboard, an edit through the edit popup, Cancel and Escape, and
 * what lands in the book and the list. Every test runs in a fresh wallet, so each book starts empty
 * and every assertion on it is exact. The Testnet RPC is refused throughout, so no run depends on
 * the public endpoint.
 *
 * No confirmed sender row here: smoke's active network is the seeded Testnet, so registering one
 * would need a node. The sender line is checked on screen; registration through an import is
 * `network/senders-advanced.test.ts`.
 */
import type { Page } from "puppeteer"
import { afterAll, expect } from "vitest"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { trimAddress } from "@/utils/string"
import {
	clickByTestId,
	clickSelector,
	type ExtensionContext,
	launchExtension,
	openPopup,
	registerProfile,
	replaceInputValue,
	test,
	waitForHash,
} from "./fixtures/extension"
import { navigateToSettings } from "./fixtures/helpers"
import { settleClosedPopup } from "./fixtures/popup-leave"
import {
	book,
	closeImportWith,
	contactsFiles,
	exportContactsFile,
	importRow,
	listedAddress,
	pickContactsFile,
	pressRow,
	refuseTestnet,
	sectionCounts,
	senderLine,
	shownRows,
	storedContacts,
	tabWalk,
	toastAfter,
	waitForListed,
	waitForSelected,
} from "./helpers/contacts-import"
import { pressEscape } from "./helpers/pointer-probes"

const sel = (testid: string) => `[data-testid="${testid}"]`
/** Puppeteer's BiDi keyboard (Firefox) knows the space bar only by its key value. */
const SPACE = " "

// Wire-shaped: 0x + 64 hex, each the x coordinate of a Grumpkin point.
const ADDR = {
	a: "0x01904dba18e847d163097ce15dcd8597e763fb11fe19ef1273d266d6e959ec4a",
	b: "0x09c1c9d2ce72c53c2451f8e9add86ccb8cb284dd4dc4f0eaf301b40b38a9459b",
	c: "0x048b29517cddb7566a05a2a292624eb2c5350dbe44350763cefe4c9207344c10",
	d: "0x0402f387a230066a23abced99a2348c1ba902c95518bdc2f9447a0ca51e5cbe2",
	e: "0x02056523b85ea4e550facca78516f7270f18bddb0f5474177d406f6bf0e58617",
	f: "0x047bb28204a2545c566dff691c298d2023fe7cad44bb6468e3f7f1e633f8f7d2",
	g: "0x055145d8ad104260f2a5f750fcd8738438d8c33875c52f654202098ae1a8c12c",
}
// 0x + 64 hex that is not the x coordinate of a Grumpkin point.
const OFF_CURVE = "0x0895f3902a26c15e2f159778cd7848cf9048fce777ee8f41dc90a9fe6b50fc09"
const upper = (address: string) => `0x${address.slice(2).toUpperCase()}`
const FULL_NAME = "Bartholomew Featherstones"

const files = contactsFiles()
afterAll(files.cleanup)
const contactsFile = (contacts: unknown[]) => files.write({ version: 2, contacts })

/** Runs `body` on the Contacts page of `ctx` with the Testnet RPC refused, then checks the refusal
 *  held every request it had to and that no page threw. */
async function onContacts(ctx: ExtensionContext, body: (page: Page) => Promise<void>): Promise<void> {
	const refusal = await refuseTestnet(ctx)
	try {
		const page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general")
		await navigateToSettings(page, "contacts")
		await page.waitForSelector(sel("contacts-new-btn"), { visible: true, timeout: 10_000 })
		await body(page)
		expect(await refusal.failures()).toEqual([])
	} finally {
		await refusal.stop()
	}
	expect(ctx.pageErrors).toEqual([])
}

test("the addresses in this file are wire-shaped and on the curve, and the off-curve one is not", () => {
	expect(Object.values(ADDR).every(isValidAztecAddress)).toBe(true)
	expect(isValidAztecAddress(OFF_CURVE)).toBe(false)
})

test("new contacts: Cancel and Escape change nothing, Import selected saves what the screen showed, the same file again changes nothing", async ({
	registeredExtensionPerTest: ctx,
}) => {
	await onContacts(ctx, async (page) => {
		const file = contactsFile([
			{ name: `  ${FULL_NAME}  `, address: upper(ADDR.b) },
			{ name: "Zoë Ångström", address: ADDR.c },
			{ name: "Ana Lima", address: ADDR.a },
			{ name: "Sid Vale", address: ADDR.d, isSender: true },
			{ name: "Ana Lima", address: ADDR.e },
			{ name: "Other", address: ADDR.a },
		])
		const allNew = [FULL_NAME, "Zoë Ångström", "Ana Lima", "Sid Vale"].map((name) => ({ name, kind: "new", selected: true }))

		await pickContactsFile(page, file)
		expect(await shownRows(page)).toEqual(allNew)
		expect(await sectionCounts(page)).toEqual({ new: "4" })
		expect(await senderLine(page)).toBe("1 sender will be registered on Testnet.")
		await toastAfter(page, () => closeImportWith(page, "import-contacts-cancel"), "Contact import canceled")
		expect(await storedContacts(page)).toEqual([])

		await pickContactsFile(page, file)
		expect(await shownRows(page)).toEqual(allNew)
		await toastAfter(
			page,
			async () => {
				expect(await pressEscape(page)).toBe(true)
				await settleClosedPopup(page, "import-contacts-submit")
			},
			"Contact import canceled",
		)
		expect(await storedContacts(page)).toEqual([])
		await page.waitForSelector(sel("contacts-empty"), { visible: true, timeout: 5_000 })

		await pickContactsFile(page, file)
		await pressRow(page, "Sid Vale")
		await waitForSelected(page, "Sid Vale", false)
		expect(await senderLine(page)).toBeNull()
		await toastAfter(page, () => closeImportWith(page, "import-contacts-submit"), "Import completed successfully")
		await waitForListed(page, ["Ana Lima", FULL_NAME, "Zoë Ångström"])
		expect(await listedAddress(page, FULL_NAME)).toBe(trimAddress(ADDR.b))
		expect(await book(page)).toEqual({ "Ana Lima": ADDR.a, [FULL_NAME]: ADDR.b, "Zoë Ångström": ADDR.c })
		const saved = await storedContacts(page)

		await pickContactsFile(page, file)
		expect(await shownRows(page)).toEqual([
			{ name: "Sid Vale", kind: "new", selected: true },
			{ name: FULL_NAME, kind: "unchanged", selected: false },
			{ name: "Zoë Ångström", kind: "unchanged", selected: false },
			{ name: "Ana Lima", kind: "unchanged", selected: false },
		])
		await pressRow(page, "Sid Vale")
		await waitForSelected(page, "Sid Vale", false)
		await toastAfter(page, () => closeImportWith(page, "import-contacts-submit"), "No contacts selected for import")
		expect(await storedContacts(page)).toEqual(saved)
	})
}, 240_000)

test("changes to saved contacts apply only when chosen, by pointer or keyboard; rows that can't be imported never select; an edit re-judges its row", async ({
	registeredExtensionPerTest: ctx,
}) => {
	await onContacts(ctx, async (page) => {
		await pickContactsFile(
			page,
			contactsFile([
				{ name: "Alice", address: ADDR.a },
				{ name: "Bob", address: ADDR.b },
				{ name: "Carol", address: ADDR.c },
				{ name: "Dave", address: ADDR.d },
			]),
		)
		await toastAfter(page, () => closeImportWith(page, "import-contacts-submit"), "Import completed successfully")
		const seeded = { Alice: ADDR.a, Bob: ADDR.b, Carol: ADDR.c, Dave: ADDR.d }
		expect(await book(page)).toEqual(seeded)

		const changes = contactsFile([
			{ name: "Alice", address: ADDR.e },
			{ name: "Robert", address: ADDR.b },
			{ name: "Erin", address: ADDR.f },
			{ name: "Carol", address: ADDR.c },
			{ name: "Frank", address: OFF_CURVE },
			{ name: "Dave", address: ADDR.a },
			{ name: "Hank", address: "0x1234" },
		])

		await pickContactsFile(page, changes)
		expect(await shownRows(page)).toEqual([
			{ name: "Alice", kind: "address-change", selected: false },
			{ name: "Robert", kind: "name-change", selected: false },
			{ name: "Erin", kind: "new", selected: true },
			{ name: "Carol", kind: "unchanged", selected: false },
			{ name: "Frank", kind: "invalid", selected: false },
			{ name: "Dave", kind: "conflict", selected: false },
			{ name: "Hank", kind: "invalid", selected: false },
		])
		expect(await sectionCounts(page)).toEqual({ address: "1", name: "1", new: "1", saved: "1", skipped: "3" })
		await toastAfter(page, () => closeImportWith(page, "import-contacts-submit"), "Import completed successfully")
		await waitForListed(page, ["Alice", "Bob", "Carol", "Dave", "Erin"])
		expect(await book(page)).toEqual({ ...seeded, Erin: ADDR.f })

		await pickContactsFile(page, changes)
		await page.bringToFront()
		// The first Tab enters the popup at its first row.
		expect(await tabWalk(page, 1)).toEqual(["import-contact-target Alice"])
		for (const [key, selected] of [
			["Enter", true],
			["Enter", false],
			[SPACE, true],
		] as const) {
			await page.keyboard.press(key)
			await waitForSelected(page, "Alice", selected)
		}
		// Each edit button follows its row; a row that can't be imported holds no stop of its own.
		expect(await tabWalk(page, 12)).toEqual([
			"import-contact-edit Alice",
			"import-contact-target Robert",
			"import-contact-edit Robert",
			"import-contact-target Erin",
			"import-contact-edit Erin",
			"import-contact-target Carol",
			"import-contact-edit Carol",
			"import-contact-edit Frank",
			"import-contact-edit Dave",
			"import-contact-edit Hank",
			"import-contacts-cancel",
			"import-contacts-submit",
		])

		await pressRow(page, "Robert")
		await waitForSelected(page, "Robert", true)
		await toastAfter(page, () => pressRow(page, "Frank"), "To select, correct the address first")
		await toastAfter(page, () => pressRow(page, "Dave"), "This contact matches two saved contacts")

		await clickSelector(page, `${importRow("Hank")} ${sel("import-contact-edit")}`)
		await page.waitForSelector(sel("edit-contact-submit"), { visible: true, timeout: 5_000 })
		await page.waitForFunction(
			(s: string) => [...document.querySelectorAll<HTMLInputElement>(`${s} input`)].some((i) => i.value === "Hank"),
			{ timeout: 10_000, polling: 100 },
			sel("contact-name-input"),
		)
		await replaceInputValue(page, sel("contact-address-input"), ADDR.g)
		await clickByTestId(page, "edit-contact-submit")
		await settleClosedPopup(page, "edit-contact-submit")
		await waitForSelected(page, "Hank", true)

		expect(await shownRows(page)).toEqual([
			{ name: "Alice", kind: "address-change", selected: true },
			{ name: "Robert", kind: "name-change", selected: true },
			{ name: "Hank", kind: "new", selected: true },
			{ name: "Erin", kind: "unchanged", selected: false },
			{ name: "Carol", kind: "unchanged", selected: false },
			{ name: "Frank", kind: "invalid", selected: false },
			{ name: "Dave", kind: "conflict", selected: false },
		])
		await toastAfter(page, () => closeImportWith(page, "import-contacts-submit"), "Import completed successfully")
		await waitForListed(page, ["Alice", "Carol", "Dave", "Erin", "Hank", "Robert"])
		expect(await listedAddress(page, "Alice")).toBe(trimAddress(ADDR.e))
		expect(await listedAddress(page, "Robert")).toBe(trimAddress(ADDR.b))
		expect(await book(page)).toEqual({ Alice: ADDR.e, Robert: ADDR.b, Carol: ADDR.c, Dave: ADDR.d, Erin: ADDR.f, Hank: ADDR.g })
	})
}, 240_000)

test("export, then import: into the same wallet nothing changes, into a fresh wallet the book comes back", async ({
	registeredExtensionPerTest: ctx,
}) => {
	let exported = ""
	let first: Record<string, string> = {}
	await onContacts(ctx, async (page) => {
		await pickContactsFile(
			page,
			contactsFile([
				{ name: FULL_NAME, address: ADDR.a },
				{ name: "Zoë Ångström", address: ADDR.b },
				{ name: "Marco Rossi", address: upper(ADDR.c) },
			]),
		)
		await toastAfter(page, () => closeImportWith(page, "import-contacts-submit"), "Import completed successfully")
		await waitForListed(page, [FULL_NAME, "Marco Rossi", "Zoë Ångström"])
		const saved = await storedContacts(page)

		exported = await exportContactsFile(page)
		const payload = JSON.parse(exported) as { version: number; contacts: Array<{ name: string; address: string; isSender: boolean }> }
		expect(payload.version).toBe(2)
		expect([...payload.contacts].sort((x, y) => x.name.localeCompare(y.name))).toEqual([
			{ name: FULL_NAME, address: ADDR.a, isSender: false },
			{ name: "Marco Rossi", address: ADDR.c, isSender: false },
			{ name: "Zoë Ångström", address: ADDR.b, isSender: false },
		])

		await pickContactsFile(page, files.write(exported))
		expect((await shownRows(page)).every((r) => r.kind === "unchanged" && !r.selected)).toBe(true)
		expect(await sectionCounts(page)).toEqual({ saved: "3" })
		await toastAfter(page, () => closeImportWith(page, "import-contacts-submit"), "No contacts selected for import")
		expect(await storedContacts(page)).toEqual(saved)
		first = await book(page)
	})

	const fresh = await launchExtension()
	try {
		await registerProfile(fresh)
		await onContacts(fresh, async (page) => {
			await pickContactsFile(page, files.write(exported))
			expect((await shownRows(page)).every((r) => r.kind === "new" && r.selected)).toBe(true)
			await toastAfter(page, () => closeImportWith(page, "import-contacts-submit"), "Import completed successfully")
			await waitForListed(page, [FULL_NAME, "Marco Rossi", "Zoë Ångström"])
			expect(await book(page)).toEqual(first)
		})
	} finally {
		await fresh.close()
	}
}, 300_000)
