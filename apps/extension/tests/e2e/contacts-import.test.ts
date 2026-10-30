/**
 * Importing contacts through the real UI: the Contacts menu, the file chooser, the grouped popup,
 * choosing rows by pointer and by keyboard, an edit through the edit popup, Cancel and Escape, and
 * what lands in the book and the list. Every test runs in a fresh wallet, so each book starts empty
 * and every assertion on it is exact. No run depends on the public endpoint: the launch's stand-ins
 * answer the seeded nodes, and the Contacts page arms a refusal of the Testnet RPC.
 *
 * No confirmed sender row here: a new profile's active network is the seeded Mainnet, so registering
 * one would need a node. The sender line is checked on screen; registration through an import is
 * `network/senders-advanced.test.ts`.
 */
import type { Page } from "puppeteer"
import { afterAll, expect } from "vitest"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { trimAddress } from "@/utils/string"
import {
	clickByTestId,
	type ExtensionContext,
	launchExtension,
	openPopup,
	registerProfile,
	replaceInputValue,
	test,
	waitForHash,
} from "./fixtures/extension"
import { fillNewContactForm, navigateToSettings, setSessionTtlMs, waitForLockScreen } from "./fixtures/helpers"
import { settleClosedPopup } from "./fixtures/popup-leave"
import {
	book,
	closeImportWith,
	contactsFiles,
	exportContactsFile,
	importRow,
	listedAddress,
	LONG_IMPORT_ROWS,
	longImportContacts,
	pickContactsFile,
	pressRow,
	refuseTestnet,
	sectionCounts,
	senderLine,
	shownRows,
	rawContactRows,
	storedContacts,
	tabWalk,
	toastAfter,
	waitForFocusOn,
	waitForInputValue,
	waitForListed,
	waitForListedAddress,
	waitForSelected,
	waitForStoredCount,
	shownToast,
} from "./helpers/contacts"
import { shotSend } from "./fixtures/send-page"
import { pressEscape, SPACE } from "./helpers/pointer-probes"
import { bringToFront } from "./fixtures/browser"

const sel = (testid: string) => `[data-testid="${testid}"]`

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

const longImportFile = () => files.write(longImportContacts())
const lockChipDisabled = (page: Page) => page.$eval(sel("header-lock"), (button) => (button as HTMLButtonElement).disabled)

/** How a review taller than the frame fits it: the list scrolls inside the card, the card does not,
 *  and both answers stay on screen. Nested flex sizing only resolves in a real engine. */
const reviewFit = (page: Page) =>
	page.evaluate(() => {
		const inView = (id: string) => {
			const box = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect()
			return box !== undefined && box.top >= 0 && box.bottom <= window.innerHeight
		}
		const card = document
			.querySelector('[data-testid="import-contacts-submit"]')
			?.closest('[data-testid="popup-card-body"]')?.parentElement
		let list = document.querySelector('[data-testid="import-contacts-section"]')?.parentElement ?? null
		while (list && !/auto|scroll/.test(getComputedStyle(list).overflowY)) list = list.parentElement
		return {
			answersInView: inView("import-contacts-cancel") && inView("import-contacts-submit"),
			cardScrolls: card ? card.scrollHeight > card.clientHeight : null,
			listScrolls: list ? list.scrollHeight > list.clientHeight : null,
		}
	})

/** The count on the progress snack, once a settled card reads more than `above`; the card is marked
 *  the first time, and a later read requires the marked card, so a re-keyed card (a replayed
 *  entrance) fails it. */
async function progressAbove(page: Page, above: number): Promise<number> {
	const read = await page.waitForFunction(
		(n: number) => {
			const card = document.querySelector('[data-testid="snackbar"][data-kind="info"]') as HTMLElement | null
			if (!card || /enter|leave/.test(card.className)) return null
			const match = /^Importing contacts · (\d+) of 500$/.exec(
				card.querySelector('[data-testid="snackbar-title"]')?.textContent ?? "",
			)
			if (!match || Number(match[1]) <= n) return null
			const w = window as unknown as { __e2eProgressCard?: Element }
			w.__e2eProgressCard ??= card
			return w.__e2eProgressCard === card ? Number(match[1]) : -1
		},
		{ timeout: 30_000, polling: 50 },
		above,
	)
	const count = Number(await read.jsonValue())
	expect(count, "the progress snack was re-created instead of relabelled").toBeGreaterThan(0)
	return count
}

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
		expect(await senderLine(page)).toBe("1 sender will be registered on Alpha.")
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
		await bringToFront(page)
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

		// Opened from the keyboard, so the edit popup has a control to hand focus back to.
		const hankEdit = `${importRow("Hank")} ${sel("import-contact-edit")}`
		await page.focus(hankEdit)
		await page.keyboard.press("Enter")
		await page.waitForSelector(sel("edit-contact-submit"), { visible: true, timeout: 5_000 })
		await waitForInputValue(page, "contact-name-input", "Hank")
		await replaceInputValue(page, sel("contact-address-input"), ADDR.g)
		await clickByTestId(page, "edit-contact-submit")
		await settleClosedPopup(page, "edit-contact-submit")
		await waitForSelected(page, "Hank", true)
		// The row moved to New and kept its element, so focus is back on the button that opened the edit.
		await waitForFocusOn(page, hankEdit)

		// An edit left with Escape closes only the edit, and the row keeps its values and its choice.
		await pressRow(page, "Hank")
		await waitForSelected(page, "Hank", false)
		await page.focus(hankEdit)
		await page.keyboard.press("Enter")
		await page.waitForSelector(sel("edit-contact-submit"), { visible: true, timeout: 5_000 })
		await waitForInputValue(page, "contact-address-input", ADDR.g)
		await replaceInputValue(page, sel("contact-address-input"), ADDR.a)
		await waitForInputValue(page, "contact-address-input", ADDR.a)
		expect(await pressEscape(page)).toBe(true)
		await settleClosedPopup(page, "edit-contact-submit")
		await waitForFocusOn(page, hankEdit)
		await page.waitForSelector(sel("import-contacts-submit"), { visible: true, timeout: 5_000 })
		await waitForSelected(page, "Hank", false)
		await pressRow(page, "Hank")
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

test("a name that differs from a saved one only by case, spacing or invisible characters is that contact: the form refuses it as a duplicate, an import shows and keeps the saved spelling", async ({
	registeredExtensionPerTest: ctx,
}) => {
	await onContacts(ctx, async (page) => {
		await pickContactsFile(page, contactsFile([{ name: "Alice", address: ADDR.a }]))
		await toastAfter(page, () => closeImportWith(page, "import-contacts-submit"), "Import completed successfully")
		const saved = await storedContacts(page)

		await fillNewContactForm(page, "alice ", ADDR.f)
		await page.waitForSelector(sel("contact-name-exists"), { visible: true, timeout: 5_000 })
		expect(await page.$eval(sel("new-contact-submit"), (button) => (button as HTMLButtonElement).disabled)).toBe(true)
		expect(await pressEscape(page)).toBe(true)
		await settleClosedPopup(page, "new-contact-submit")
		expect(await storedContacts(page)).toEqual(saved)

		// HANGUL FILLER (U+3164) is invisible, so the second row repeats the first row's name and is dropped.
		await pickContactsFile(
			page,
			contactsFile([
				{ name: "  alice  ", address: ADDR.a },
				{ name: "AL\u3164ICE", address: ADDR.e },
			]),
		)
		expect(await shownRows(page)).toEqual([{ name: "Alice", kind: "unchanged", selected: false }])
		expect(await sectionCounts(page)).toEqual({ saved: "1" })
		await toastAfter(page, () => closeImportWith(page, "import-contacts-submit"), "No contacts selected for import")
		expect(await storedContacts(page)).toEqual(saved)

		await pickContactsFile(page, contactsFile([{ name: "ALI\u3164CE\u200B", address: ADDR.e }]))
		expect(await shownRows(page)).toEqual([{ name: "Alice", kind: "address-change", selected: false }])
		expect(await sectionCounts(page)).toEqual({ address: "1" })
		await pressRow(page, "Alice")
		await waitForSelected(page, "Alice", true)
		await toastAfter(page, () => closeImportWith(page, "import-contacts-submit"), "Import completed successfully")
		await waitForListed(page, ["Alice"])
		await waitForListedAddress(page, "Alice", trimAddress(ADDR.e))
		expect(await storedContacts(page)).toEqual([{ ...saved[0], address: ADDR.e }])
	})
}, 180_000)

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

// Fails if a 500-row review clips its answers or scrolls the card instead of its list, if leaving
// Contacts cuts off a running import (the page's clients rejected the row being written), if the
// real chip or the menu's Import item does not follow the running import, or if the import's
// progress snack does not reach the shell's region on every page as one card relabelled in place.
// Component tests mount stubs, fake clients and a mocked toast, so only the built popup's real
// layout, page unmount, Header, menu and snack region can show these.
test("an import holds Lock until it ends, counts on one snack on every page, and leaving Contacts does not disturb it", async ({
	registeredExtensionPerTest: ctx,
}) => {
	await onContacts(ctx, async (page) => {
		await pickContactsFile(page, longImportFile())
		expect(await reviewFit(page)).toEqual({ answersInView: true, cardScrolls: false, listScrolls: true })
		await shotSend(page, "sheet-import-contacts", "import-contacts-submit")
		await toastAfter(
			page,
			async () => {
				await closeImportWith(page, "import-contacts-submit")
				await waitForStoredCount(page, 1)
				expect(await lockChipDisabled(page)).toBe(true)
				const onContactsPage = await progressAbove(page, 0)
				// The menu's Import item is disabled while this import runs.
				await clickByTestId(page, "contacts-menu-trigger")
				await page.waitForSelector(sel("contacts-menu-import"), { visible: true, timeout: 5_000 })
				expect(await page.$eval(sel("contacts-menu-import"), (item) => item.getAttribute("aria-disabled"))).toBe("true")
				expect(await pressEscape(page)).toBe(true)
				await clickByTestId(page, "subpage-back")
				await waitForHash(page, "#/popup/settings")
				// Still disabled: the import was still running when the Contacts page unmounted (the hold
				// ends with it, or at its deadline).
				expect(await lockChipDisabled(page)).toBe(true)
				await progressAbove(page, onContactsPage)
			},
			"Import completed successfully",
			120_000,
		)
		await shownToast(page, "Import completed successfully")
		expect(await lockChipDisabled(page)).toBe(false)
		expect(await storedContacts(page)).toHaveLength(LONG_IMPORT_ROWS)
	})
}, 240_000)

// Fails if the worker's real expiry does not stop a running import, or if its result is lost to the
// lock screen; the unit layers fake the expiry, the seal and the toast's survival separately.
test("auto-lock mid-import locks the wallet and stops the import", async ({ registeredExtensionPerTest: ctx }) => {
	await onContacts(ctx, async (page) => {
		await pickContactsFile(page, longImportFile())
		await closeImportWith(page, "import-contacts-submit")
		await waitForStoredCount(page, 3)
		await setSessionTtlMs(page, 1_500)
		await waitForLockScreen(page)
		const toast = await shownToast(page, "Import incomplete")
		const written = Number(/^Import incomplete · (\d+) of 500 contacts written$/.exec(toast)?.[1] ?? Number.NaN)
		// Strictly inside, so a stop that missed the import fails loudly instead of passing.
		expect(written).toBeGreaterThan(0)
		expect(written).toBeLessThan(LONG_IMPORT_ROWS)
		// A write whose reply the stop cut off is stored but not counted. Counted at rest: the wallet
		// is locked, so its contact service reads nothing.
		expect([written, written + 1]).toContain((await rawContactRows(page)).length)
	})
}, 180_000)
