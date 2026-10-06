/**
 * Component tests for EditContactPopup, pinning the decoupled behavior:
 * editing a contact (including its ADDRESS) touches the contact service
 * ONLY — no sender toggle, no registration migration.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"

// ── Mocks ────────────────────────────────────────────────────────────

const contactServiceMock = {
	getContacts: vi.fn(),
	updateContact: vi.fn(),
	disconnect: vi.fn(),
	onContactAdded: { add: vi.fn(), remove: vi.fn() },
	onContactUpdated: { add: vi.fn(), remove: vi.fn() },
	onContactDeleted: { add: vi.fn(), remove: vi.fn() },
}

const openToastMock = vi.fn()

const cacheStoreState: { contactToEditIdx: string; importContact: unknown } = {
	contactToEditIdx: "",
	importContact: null,
}

// Vitest 4 requires `function` expressions (not arrow functions) for mocks
// instantiated with `new`.
vi.mock("@/wallet/services/contact/client", () => ({
	ContactServiceClient: vi.fn(function () {
		return contactServiceMock
	}),
}))

vi.mock("@/stores/cache.store", () => ({
	useCacheStore: () => cacheStoreState,
}))
vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({ len: 1, popups: { edit_contact: { order: 1 } } }),
}))

vi.mock("@/composables/toast", () => ({
	useToast: () => ({ openToast: openToastMock }),
}))

// ── Stubs ────────────────────────────────────────────────────────────

const STUBS = {
	FormPopup: {
		props: ["show", "submitLabel", "submitDisabled", "submitLoading", "title", "displaceIdx", "submitTestId"],
		emits: ["onClose", "submit"],
		template: `
			<div data-testid="form-popup" :data-submit-disabled="String(submitDisabled)">
				<slot />
				<slot name="aboveSubmit" />
				<slot name="belowSubmit" />
				<button data-testid="form-submit" :disabled="submitDisabled" @click="$emit('submit')">{{ submitLabel }}</button>
			</div>
		`,
	},
	Input: {
		props: ["modelValue"],
		emits: ["update:modelValue"],
		template: `<div><input data-testid="name-input" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><slot name="right" /></div>`,
	},
	AddressInput: {
		props: ["modelValue"],
		emits: ["update:modelValue"],
		template: `<div><input data-testid="address-input" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><slot name="right" /></div>`,
	},
	Icon: { template: "<i />" },
	Text: { template: "<span><slot /></span>" },
	Flex: { template: "<div><slot /></div>" },
	Tooltip: { template: "<div><slot /><slot name='content' /></div>" },
	Toggle: { template: "<button data-testid='stub-toggle' />" },
	Button: { template: "<button><slot /></button>" },
	Transition: { template: "<div><slot /></div>" },
}

// Lazy import after vi.mock calls hoist
import EditContactPopup from "./EditContactPopup.vue"

const OLD_ADDRESS = `0x2${"a".repeat(63)}`
const NEW_ADDRESS = `0x2${"b".repeat(63)}`
const CONTACT = { id: "c1", name: "Alice", address: OLD_ADDRESS }

const trackedWrappers: Array<ReturnType<typeof mount>> = []

async function mountAndOpen(contacts = [CONTACT], editId = "c1") {
	cacheStoreState.contactToEditIdx = editId
	const w = mount(EditContactPopup, {
		props: { show: false },
		global: { stubs: STUBS },
	})
	trackedWrappers.push(w)
	contactServiceMock.getContacts.mockResolvedValueOnce(contacts)
	await w.setProps({ show: true })
	await flushPromises()
	return w
}

beforeEach(() => {
	vi.clearAllMocks()
	cacheStoreState.contactToEditIdx = ""
	cacheStoreState.importContact = null
})
afterEach(() => {
	// Guaranteed net: unmount every tracked wrapper (scope cleanup removes the
	// document listener) even when an assertion aborted the test mid-way.
	for (const w of trackedWrappers.splice(0)) {
		try {
			w.unmount()
		} catch {
			/* already unmounted by the test */
		}
	}
	vi.restoreAllMocks()
})

describe("EditContactPopup — decoupled from sender registration", () => {
	test("prefills fields from the edited contact and disables submit while clean", async () => {
		const w = await mountAndOpen()
		expect((w.find('[data-testid="name-input"]').element as HTMLInputElement).value).toBe("Alice")
		expect((w.find('[data-testid="address-input"]').element as HTMLInputElement).value).toBe(OLD_ADDRESS)
		expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("true")
	})

	test("address edit calls updateContact only — no sender migration, no toggle", async () => {
		const w = await mountAndOpen()
		expect(w.find('[data-testid="edit-contact-sender-toggle"]').exists()).toBe(false)
		expect(w.text()).not.toContain("Register as sender")

		contactServiceMock.updateContact.mockResolvedValueOnce({ ...CONTACT, address: NEW_ADDRESS })
		await w.find('[data-testid="address-input"]').setValue(NEW_ADDRESS)
		await flushPromises()
		await w.find('[data-testid="form-submit"]').trigger("click")
		await flushPromises()

		expect(contactServiceMock.updateContact).toHaveBeenCalledWith("c1", "Alice", NEW_ADDRESS)
		expect(w.emitted("onClose")).toBeTruthy()
		expect(openToastMock).toHaveBeenCalledWith({ kind: "success", label: "Contact is updated" })
	})

	test("saves an edited address canonicalized to lowercase", async () => {
		const w = await mountAndOpen()
		contactServiceMock.updateContact.mockResolvedValueOnce({ ...CONTACT, address: NEW_ADDRESS })
		await w.find('[data-testid="address-input"]').setValue(NEW_ADDRESS.toUpperCase().replace("0X", "0x"))
		await flushPromises()
		await w.find('[data-testid="form-submit"]').trigger("click")
		await flushPromises()

		expect(contactServiceMock.updateContact).toHaveBeenCalledWith("c1", "Alice", NEW_ADDRESS)
	})

	test("name edit is trimmed on update", async () => {
		const w = await mountAndOpen()
		contactServiceMock.updateContact.mockResolvedValueOnce({ ...CONTACT, name: "Alicia" })
		await w.find('[data-testid="name-input"]').setValue(" Alicia ")
		await flushPromises()
		await w.find('[data-testid="form-submit"]').trigger("click")
		await flushPromises()
		expect(contactServiceMock.updateContact).toHaveBeenCalledWith("c1", "Alicia", OLD_ADDRESS)
	})

	test("updateContact failure surfaces the error toast and does not close", async () => {
		const w = await mountAndOpen()
		contactServiceMock.updateContact.mockRejectedValueOnce(new Error("boom"))
		await w.find('[data-testid="name-input"]').setValue("Alicia")
		await flushPromises()
		await w.find('[data-testid="form-submit"]').trigger("click")
		await flushPromises()

		expect(w.emitted("onClose")).toBeFalsy()
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Something went wrong" })
	})

	test("(RE-ENTRANCY PIN) repeated Enter during an in-flight update fires updateContact ONCE", async () => {
		const w = await mountAndOpen()
		contactServiceMock.updateContact.mockImplementation(() => new Promise(() => {}))
		await w.find('[data-testid="name-input"]').setValue("Alicia-Reentrant")
		await flushPromises()
		// The popup's keydown listener lives on `document`; the mounted tree is
		// detached, so dispatch from a real document-level input. (The tracked
		// afterEach net unmounts every prior wrapper, so only THIS instance is
		// listening; the unique-name filter below keeps the pin robust anyway.)
		const docInput = document.createElement("input")
		document.body.appendChild(docInput)
		docInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
		await flushPromises()
		docInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
		await flushPromises()
		// Count only THIS instance's calls (unique name typed above) — leaked
		// listeners from earlier tests answer the same document Enter but carry
		// their own field values, so they cannot pollute this count.
		const myCalls = contactServiceMock.updateContact.mock.calls.filter((c) => c[1] === "Alicia-Reentrant").length
		// Cleanup BEFORE the assertion: a failing expect must not skip the
		// unmount (scope cleanup removes the document listener) or the reset.
		w.unmount()
		contactServiceMock.updateContact.mockReset()
		docInput.remove()
		expect(myCalls).toBe(1)
	})

	test("Enter with a clean form is a no-op (dirty gate holds on the keyboard path)", async () => {
		const w = await mountAndOpen()
		const input = w.find('[data-testid="name-input"]').element as HTMLInputElement
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
		await flushPromises()

		expect(contactServiceMock.updateContact).not.toHaveBeenCalled()
		expect(w.emitted("onClose")).toBeFalsy()
		expect(openToastMock).not.toHaveBeenCalled()
	})

	test("import mode writes cacheStore.importContact and never calls the service", async () => {
		cacheStoreState.importContact = { id: "", name: "Staged", address: OLD_ADDRESS }
		const w = await mountAndOpen([], "")
		await w.find('[data-testid="name-input"]').setValue("Renamed")
		await flushPromises()
		await w.find('[data-testid="form-submit"]').trigger("click")
		await flushPromises()

		expect(contactServiceMock.updateContact).not.toHaveBeenCalled()
		expect((cacheStoreState.importContact as { name: string; updated: boolean }).name).toBe("Renamed")
		expect((cacheStoreState.importContact as { updated: boolean }).updated).toBe(true)
		expect(w.emitted("onClose")).toBeTruthy()
	})
})

describe("EditContactPopup — contact delete reducer and duplicate rules", () => {
	type Row = { id: string; name: string; address: string }
	const addr = (c: string) => `0x2${c.repeat(63)}`
	const vmContacts = (w: ReturnType<typeof mount>) => (w.vm as unknown as { contacts: Row[] }).contacts
	const BOB = { id: "c2", name: "Bob", address: addr("b") }

	test("a delete drops every row with its id, into a new array, and its name stops warning", async () => {
		const w = await mountAndOpen([CONTACT, BOB, { id: "c2", name: "Carl", address: addr("c") }])
		await w.find('[data-testid="name-input"]').setValue("Bob")
		await flushPromises()
		expect(w.text()).toContain("Already exist")
		const before = vmContacts(w)
		const onDeleted = contactServiceMock.onContactDeleted.add.mock.calls[0][0] as (r: Row) => void
		onDeleted(BOB)
		await flushPromises()
		expect(vmContacts(w)).not.toBe(before)
		expect(vmContacts(w).map((c) => c.name)).toEqual(["Alice"])
		expect(w.text()).not.toContain("Already exist")
	})

	test("the edited row's own name and address never read as duplicates", async () => {
		const w = await mountAndOpen([CONTACT, BOB])
		await w.find('[data-testid="address-input"]').setValue(OLD_ADDRESS.toUpperCase().replace("0X", "0x"))
		await w.find('[data-testid="name-input"]').setValue("Alice ")
		await flushPromises()
		expect(w.text()).not.toContain("Already exist")
	})

	test("another contact's name, trimmed, and its address in any case, read as duplicates", async () => {
		const w = await mountAndOpen([CONTACT, BOB])
		await w.find('[data-testid="name-input"]').setValue("Bob ")
		await flushPromises()
		expect(w.text()).toContain("Already exist")
		expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("true")
		await w.find('[data-testid="name-input"]').setValue("Bob")
		await flushPromises()
		expect(w.text()).toContain("Already exist")
		await w.find('[data-testid="name-input"]').setValue("Alicia")
		await w.find('[data-testid="address-input"]').setValue(addr("B"))
		await flushPromises()
		expect(w.text()).toContain("Already exist")
	})

	test("a stored name with an outer space beside the same name warns on open and blocks an address-only edit", async () => {
		const spaced = { id: "c2", name: "Alice ", address: addr("c") }
		const w = await mountAndOpen([CONTACT, spaced], "c2")
		expect(w.text()).toContain("Already exist")
		await w.find('[data-testid="address-input"]').setValue(NEW_ADDRESS)
		await flushPromises()
		expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("true")
		await w.find('[data-testid="form-submit"]').trigger("click")
		await flushPromises()
		expect(contactServiceMock.updateContact).not.toHaveBeenCalled()
	})

	const fieldText = (w: ReturnType<typeof mount>, id: string) =>
		(w.find(`[data-testid="${id}"]`).element.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim()

	test("the saved name beside its stored spaced twin: an address-only edit shows the name warning that blocks it", async () => {
		const w = await mountAndOpen([CONTACT, { id: "c2", name: "Alice ", address: addr("c") }])
		expect(fieldText(w, "name-input")).toBe("")
		await w.find('[data-testid="address-input"]').setValue(NEW_ADDRESS)
		await flushPromises()
		expect(fieldText(w, "name-input")).toBe("Already exist")
		expect(fieldText(w, "address-input")).toBe("")
		expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("true")
	})

	test("an address stored twice in different case: a name-only edit shows the address warning that blocks it", async () => {
		const w = await mountAndOpen([CONTACT, { id: "c2", name: "Bob", address: OLD_ADDRESS.replace(/a/g, "A") }])
		expect(fieldText(w, "address-input")).toBe("")
		await w.find('[data-testid="name-input"]').setValue("Alicia")
		await flushPromises()
		expect(fieldText(w, "address-input")).toBe("Already exist")
		expect(fieldText(w, "name-input")).toBe("")
		expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("true")
	})

	test("import mode stores the address lowercased", async () => {
		cacheStoreState.importContact = { id: "", name: "Staged", address: OLD_ADDRESS }
		const w = await mountAndOpen([], "")
		await w.find('[data-testid="address-input"]').setValue(addr("D"))
		await flushPromises()
		await w.find('[data-testid="form-submit"]').trigger("click")
		await flushPromises()
		expect((cacheStoreState.importContact as { address: string }).address).toBe(addr("d"))
	})
})
