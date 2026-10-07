/**
 * Component tests for ImportContactsPopup: the grouped sections and what each row starts as, the
 * rows that cannot be imported, keyboard and assistive semantics, what confirming hands back, and
 * the counted sender-consent banner. Fixtures are wire-shaped: 0x + 64 hex, valid Aztec addresses.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { nextTick, reactive } from "vue"

// ── Mocks ────────────────────────────────────────────────────────────

const contactServiceMock = {
	getContacts: vi.fn().mockResolvedValue([]),
	disconnect: vi.fn(),
	onContactAdded: { add: vi.fn(), remove: vi.fn() },
	onContactUpdated: { add: vi.fn(), remove: vi.fn() },
	onContactDeleted: { add: vi.fn(), remove: vi.fn() },
}

const cacheStoreState: {
	importContacts: unknown[]
	importContact: unknown
	importPromise: { resolve: ReturnType<typeof vi.fn>; reject: ReturnType<typeof vi.fn> } | null
} = reactive({ importContacts: [], importContact: null, importPromise: null })

const openToastMock = vi.fn()
const popupOpenMock = vi.fn()

// Vitest 4 requires `function` expressions (not arrow functions) for mocks
// instantiated with `new`.
vi.mock("@/wallet/services/contact/client", () => ({
	ContactServiceClient: vi.fn(function () {
		return contactServiceMock
	}),
}))
const appStoreState: { network: { id: string; name: string } | null } = {
	network: { id: "net-1", name: "Testnet" },
}
vi.mock("@/stores/app.store", () => ({
	useAppStore: () => appStoreState,
}))
vi.mock("@/stores/cache.store", () => ({ useCacheStore: () => cacheStoreState }))
vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({ len: 1, popups: { import_contacts: { order: 1 } }, open: popupOpenMock }),
}))
vi.mock("@/composables/toast", () => ({
	useToast: () => ({ openToast: openToastMock }),
}))

const STUBS = {
	Popup: { props: ["show"], template: "<div v-if='show'><slot /></div>" },
	PopupCard: { template: "<div><slot /></div>" },
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: "<i />" },
	Button: { template: "<button><slot /></button>" },
	RowAction: { props: ["label"], template: "<button type='button' :aria-label='label' @click.stop><slot /></button>" },
	SectionLabel: {
		props: ["label", "count", "countTestid"],
		template: "<div><span>{{ label }}</span> <span :data-testid='countTestid'>{{ count }}</span></div>",
	},
	Transition: { template: "<div><slot /></div>" },
}

// Lazy import after vi.mock calls hoist
import ImportContactsPopup from "./ImportContactsPopup.vue"

const ADDR = {
	marcoSaved: "0x09c1c9d2ce72c53c2451f8e9add86ccb8cb284dd4dc4f0eaf301b40b38a9459b",
	marcoFile: "0x0402f387a230066a23abced99a2348c1ba902c95518bdc2f9447a0ca51e5cbe2",
	aliceSaved: "0x01904dba18e847d163097ce15dcd8597e763fb11fe19ef1273d266d6e959ec4a",
	aliceFile: "0x047bb28204a2545c566dff691c298d2023fe7cad44bb6468e3f7f1e633f8f7d2",
	tom: "0x048b29517cddb7566a05a2a292624eb2c5350dbe44350763cefe4c9207344c10",
	priya: "0x02056523b85ea4e550facca78516f7270f18bddb0f5474177d406f6bf0e58617",
	sam: "0x055145d8ad104260f2a5f750fcd8738438d8c33875c52f654202098ae1a8c12c",
	jon: "0x0020743f567f996bf9798d57f5304fc8f3652a6888fec4804616dcf847f7e1a7",
	hana: "0x077e0014c77c6aa87b49ca24d3c49e945fede32ccae9f1de8d89163827035429",
	ivo: "0x004c688fd6ed78e95b2a82b7a5ddc6bcd329393f23efb30aa853ab0fc8c5b7dc",
	rosaSaved: "0x05cad4e8aa006f7085e8d3d1f69f76774de72284ad82ab8210a13c6990c3462f",
	// Same 0x + 6 .. 4 short form as rosaSaved, different middle.
	rosaCrafted: "0x05cad482f291e850c328e318550cf64d3f47caa125d8737076f02cb46fec462f",
}
// 0x + 64 hex that is not the x coordinate of a Grumpkin point.
const OFF_CURVE = "0x0895f3902a26c15e2f159778cd7848cf9048fce777ee8f41dc90a9fe6b50fc09"

const SAVED = [
	{ id: "c1", name: "Marco Rossi", address: ADDR.marcoSaved },
	{ id: "c2", name: "Alice", address: ADDR.aliceSaved },
	{ id: "c3", name: "Tom Becker", address: ADDR.tom },
	{ id: "c4", name: "Jon", address: ADDR.jon },
	{ id: "c5", name: "Hana", address: ADDR.hana },
	{ id: "c6", name: "Ivo", address: ADDR.ivo.toUpperCase().replace("0X", "0x") },
]

/** One row of every kind, in file order. */
const FILE = [
	{ name: "Alice ", address: ADDR.aliceFile, isSender: false },
	{ name: "Marco Rossi", address: ADDR.marcoFile, isSender: false },
	{ name: "Priya Shah", address: ADDR.priya, isSender: false },
	{ name: "Jonathan", address: ADDR.jon, isSender: false },
	{ name: "Sam Ortiz", address: ADDR.sam, isSender: true },
	{ name: "Tom Becker", address: ADDR.tom, isSender: false },
	{ name: "Lena Fischer", address: OFF_CURVE, isSender: false },
	{ name: "Hana", address: ADDR.ivo, isSender: false },
]

async function mountWithStaged(staged: Array<Record<string, unknown>>, saved: unknown[] = []) {
	contactServiceMock.getContacts.mockResolvedValueOnce(saved)
	cacheStoreState.importContacts = staged.map((r) => ({ ...r }))
	const w = mount(ImportContactsPopup, { props: { show: false }, global: { stubs: STUBS } })
	await w.setProps({ show: true })
	await flushPromises()
	return w
}

const rows = (w: VueWrapper) => w.findAll('[data-testid="import-contact-row"]')
const rowNamed = (w: VueWrapper, text: string) => {
	const row = rows(w).find((r) => r.text().includes(text))
	if (!row) throw new Error(`no row for ${text}`)
	return row
}
const target = (row: ReturnType<typeof rowNamed>) => row.find("[data-row-target]")

beforeEach(() => {
	vi.clearAllMocks()
	appStoreState.network = { id: "net-1", name: "Testnet" }
	cacheStoreState.importContacts = []
	cacheStoreState.importPromise = { resolve: vi.fn(), reject: vi.fn() }
	cacheStoreState.importContact = null
})
afterEach(() => {
	vi.restoreAllMocks()
})

describe("ImportContactsPopup — grouped sections", () => {
	test("sections show in a fixed order, each with its count, and only when they hold rows", async () => {
		const w = await mountWithStaged(FILE, SAVED)
		const sections = w.findAll('[data-testid="import-contacts-section"]').map((s) => s.attributes("data-section"))
		expect(sections).toEqual(["address", "name", "new", "saved", "skipped"])
		expect(w.find('[data-testid="import-contacts-address-count"]').text()).toBe("2")
		expect(w.find('[data-testid="import-contacts-name-count"]').text()).toBe("1")
		expect(w.find('[data-testid="import-contacts-new-count"]').text()).toBe("2")
		expect(w.find('[data-testid="import-contacts-saved-count"]').text()).toBe("1")
		expect(w.find('[data-testid="import-contacts-skipped-count"]').text()).toBe("2")
		expect(rows(w).map((r) => r.attributes("data-row-kind"))).toEqual([
			"address-change",
			"address-change",
			"name-change",
			"new",
			"new",
			"unchanged",
			"invalid",
			"conflict",
		])

		const onlyNew = await mountWithStaged([FILE[2]], SAVED)
		expect(onlyNew.findAll('[data-testid="import-contacts-section"]').map((s) => s.attributes("data-section"))).toEqual(["new"])
	})

	test("an address change starts unselected and shows the saved address it replaces beside the incoming one", async () => {
		const w = await mountWithStaged(FILE, SAVED)
		const marco = rowNamed(w, "Marco Rossi")
		expect(marco.attributes("data-selected")).toBeUndefined()
		expect(marco.text()).toContain(trim(ADDR.marcoSaved))
		expect(marco.text()).toContain(trim(ADDR.marcoFile))
		expect(marco.text()).toMatch(new RegExp(`${esc(trim(ADDR.marcoSaved))}\\s*changes to\\s*${esc(trim(ADDR.marcoFile))}`))
	})

	test("an address change whose short forms agree shows both full addresses", async () => {
		const w = await mountWithStaged(
			[{ name: "Rosa", address: ADDR.rosaCrafted, isSender: false }],
			[...SAVED, { id: "c7", name: "Rosa", address: ADDR.rosaSaved }],
		)
		const rosa = rowNamed(w, "Rosa")
		expect(trim(ADDR.rosaSaved)).toBe(trim(ADDR.rosaCrafted))
		expect(rosa.text()).toMatch(new RegExp(`${ADDR.rosaSaved}\\s*changes to\\s*${ADDR.rosaCrafted}`))
		expect(rosa.text()).not.toContain("..")
	})

	test("a file name with outer spaces is matched trimmed: it is the saved contact's address change, not a new contact", async () => {
		const w = await mountWithStaged(FILE, SAVED)
		const alice = rowNamed(w, trim(ADDR.aliceFile))
		expect(alice.attributes("data-row-kind")).toBe("address-change")
		expect(alice.text()).toContain(trim(ADDR.aliceSaved))
	})

	test("a name change starts unselected and shows the saved name it replaces", async () => {
		const w = await mountWithStaged(FILE, SAVED)
		const jon = rowNamed(w, "Jonathan")
		expect(jon.attributes("data-row-kind")).toBe("name-change")
		expect(jon.attributes("data-selected")).toBeUndefined()
		expect(jon.text()).toMatch(/Jon\s*changes to\s*Jonathan/)
		expect(jon.text()).toContain(trim(ADDR.jon))
	})

	test("new contacts start selected; an exact duplicate starts unselected", async () => {
		const w = await mountWithStaged(FILE, SAVED)
		expect(rowNamed(w, "Priya Shah").attributes("data-selected")).toBe("true")
		expect(rowNamed(w, "Sam Ortiz").attributes("data-selected")).toBe("true")
		expect(rowNamed(w, "Tom Becker").attributes("data-selected")).toBeUndefined()
	})

	test("the header states the rule in plain words", async () => {
		const w = await mountWithStaged(FILE, SAVED)
		expect(w.text().replace(/\s+/g, " ")).toContain(
			"Selected contacts are added or updated. Address and name changes start unselected. Contacts that can't be imported are listed last.",
		)
	})
})

describe("ImportContactsPopup — rows that can't be imported", () => {
	test.each([
		["Lena Fischer", "Invalid address", "To select, correct the address first"],
		["Hana", "Matches two saved contacts", "This contact matches two saved contacts"],
	])("%s: greyed with its reason, out of the Tab order, and a press only explains", async (name, reason, toast) => {
		const w = await mountWithStaged(FILE, SAVED)
		const row = rowNamed(w, name)
		expect(row.text()).toContain(reason)
		expect(target(row).attributes("aria-disabled")).toBe("true")
		expect(target(row).attributes("tabindex")).toBe("-1")

		await target(row).trigger("click")

		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: toast })
		expect(row.attributes("data-selected")).toBeUndefined()
	})
})

describe("ImportContactsPopup — keyboard and assistive semantics", () => {
	test("each row's target is a native button that toggles, states its pressed state, and is named by the row", async () => {
		const w = await mountWithStaged(FILE, SAVED)
		const marco = rowNamed(w, "Marco Rossi")
		const button = target(marco)
		expect(button.element.tagName).toBe("BUTTON")
		expect(button.attributes("tabindex")).toBeUndefined()
		expect(button.attributes("aria-pressed")).toBe("false")
		const names = (button.attributes("aria-labelledby") ?? "").split(" ").map((id) => w.find(`[id="${id}"]`).text())
		expect(names.join(" ")).toContain("Marco Rossi")
		expect(names.join(" ")).toContain(trim(ADDR.marcoFile))
		expect(w.find(`[id="${button.attributes("aria-describedby")}"]`).text()).toContain("Address changes")

		await button.trigger("click")
		expect(button.attributes("aria-pressed")).toBe("true")
		expect(marco.attributes("data-selected")).toBe("true")
	})

	test("edit opens the row in the edit form without toggling it", async () => {
		const w = await mountWithStaged(FILE, SAVED)
		const priya = rowNamed(w, "Priya Shah")

		await priya.find('[data-testid="import-contact-edit"]').trigger("click")

		expect(popupOpenMock).toHaveBeenCalledWith("edit_contact")
		expect((cacheStoreState.importContact as { name: string }).name).toBe("Priya Shah")
		expect(priya.attributes("data-selected")).toBe("true")
	})

	test("every control carries its test id", async () => {
		const w = await mountWithStaged(FILE, SAVED)
		expect(w.findAll('[data-testid="import-contact-edit"]')).toHaveLength(FILE.length)
		expect(w.find('[data-testid="import-contacts-cancel"]').exists()).toBe(true)
		expect(w.find('[data-testid="import-contacts-submit"]').exists()).toBe(true)
	})
})

describe("ImportContactsPopup — confirming", () => {
	test("Import selected hands back exactly the selected rows that can be imported", async () => {
		const w = await mountWithStaged(FILE, SAVED)
		await target(rowNamed(w, "Marco Rossi")).trigger("click")
		await target(rowNamed(w, "Sam Ortiz")).trigger("click")
		await target(rowNamed(w, "Hana")).trigger("click")

		await w.find('[data-testid="import-contacts-submit"]').trigger("click")

		const resolved = cacheStoreState.importPromise?.resolve.mock.calls[0][0] as Array<{ name: string; address: string }>
		expect(resolved.map((r) => [r.name, r.address])).toEqual([
			["Marco Rossi", ADDR.marcoFile],
			["Priya Shah", ADDR.priya],
		])
	})

	test("an edited row is judged again, its selection follows its new kind, and it keeps its element", async () => {
		const w = await mountWithStaged(FILE, SAVED)
		const before = rowNamed(w, "Marco Rossi")
		expect(before.attributes("data-row-kind")).toBe("address-change")
		const element = before.element

		cacheStoreState.importContact = { ...FILE[1], idx: "1", kind: "address-change", selected: false, name: "Marco R", updated: true }
		await nextTick()

		const edited = rowNamed(w, "Marco R")
		expect(edited.attributes("data-row-kind")).toBe("new")
		expect(edited.attributes("data-selected")).toBe("true")
		expect(edited.element).toBe(element)
	})

	test("the first row (index 0) can be edited too", async () => {
		const w = await mountWithStaged(FILE, SAVED)

		cacheStoreState.importContact = { ...FILE[0], idx: "0", name: "Alicia", updated: true }
		await nextTick()

		expect(rowNamed(w, "Alicia").attributes("data-row-kind")).toBe("new")
	})
})

describe("ImportContactsPopup — counted sender banner", () => {
	test("states the exact number of senders that will be registered", async () => {
		const w = await mountWithStaged([
			{ name: "A", address: ADDR.priya, isSender: true },
			{ name: "B", address: ADDR.sam, isSender: true },
		])
		expect(w.text()).toContain("2")
		expect(w.text()).toContain("senders will be registered on")
		expect(w.text()).toContain("Testnet")
	})

	test("uses the singular form for one sender", async () => {
		const w = await mountWithStaged([
			{ name: "A", address: ADDR.priya, isSender: true },
			{ name: "B", address: ADDR.sam, isSender: false },
		])
		expect(w.text()).toContain("sender will be registered on")
		expect(w.text()).not.toContain("senders will be registered on")
	})

	test("counts only the senders confirming would write, not a selected row the import would refuse", async () => {
		const w = await mountWithStaged(
			[
				{ name: "Alice", address: ADDR.aliceFile, isSender: true },
				{ name: "Carol", address: ADDR.aliceSaved, isSender: true },
			],
			SAVED,
		)
		await target(rowNamed(w, "Alice")).trigger("click")
		await target(rowNamed(w, "Carol")).trigger("click")

		expect(w.text()).toContain("sender will be registered on")
		expect(w.text()).not.toContain("senders will be registered on")
	})

	test("no banner when nothing selected would register a sender, a sender-flagged change included", async () => {
		const w = await mountWithStaged([{ name: "Marco Rossi", address: ADDR.marcoFile, isSender: true }], SAVED)
		expect(w.text()).not.toContain("will be registered on")
	})

	test("a mixed-case saved address is matched: its lowercase import row is a name change, not a new contact", async () => {
		const w = await mountWithStaged([{ name: "Other", address: ADDR.ivo, isSender: false }], SAVED)
		expect(rows(w).map((r) => r.attributes("data-row-kind"))).toEqual(["name-change"])
		expect(w.text()).toMatch(/Ivo\s*changes to\s*Other/)
	})

	test("no active network: states that registrations will be skipped (not a contradictory network name)", async () => {
		appStoreState.network = null
		const w = await mountWithStaged([{ name: "A", address: ADDR.priya, isSender: true }])
		expect(w.text()).toContain("No active network. Sender registrations will be skipped.")
		expect(w.text()).not.toContain("will be registered on")
	})
})

describe("ImportContactsPopup — contact list reducers (no render reads the list after show)", () => {
	type Row = { id: string; name: string; address: string }
	const handler = (bus: { add: { mock: { calls: unknown[][] } } }) => bus.add.mock.calls[0][0] as (r: Row) => void
	const vmContacts = (w: ReturnType<typeof mount>) => (w.vm as unknown as { contacts: Row[] }).contacts

	test("update replaces the first listed match in place, or appends; delete filters every match into a new array", async () => {
		const w = await mountWithStaged(
			[{ name: "Other", address: ADDR.aliceSaved, isSender: false }],
			[
				{ id: "c1", name: "Alice", address: ADDR.aliceSaved },
				{ id: "c1", name: "Bob", address: ADDR.tom },
			],
		)
		const before = vmContacts(w)
		handler(contactServiceMock.onContactUpdated)({ id: "c1", name: "Carol", address: ADDR.aliceSaved })
		handler(contactServiceMock.onContactUpdated)({ id: "c9", name: "Dave", address: ADDR.tom })
		expect(vmContacts(w)).toBe(before)
		expect(vmContacts(w).map((c) => c.name)).toEqual(["Carol", "Bob", "Dave"])
		handler(contactServiceMock.onContactDeleted)({ id: "c1", name: "Carol", address: ADDR.aliceSaved })
		expect(vmContacts(w)).not.toBe(before)
		expect(vmContacts(w).map((c) => c.name)).toEqual(["Dave"])
		// The staged rows were classified at show and do not follow the list.
		await flushPromises()
		expect(rows(w).map((r) => r.attributes("data-row-kind"))).toEqual(["name-change"])
	})
})

function trim(address: string) {
	return `${address.substring(0, 8)}..${address.substring(address.length - 4)}`
}
function esc(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
