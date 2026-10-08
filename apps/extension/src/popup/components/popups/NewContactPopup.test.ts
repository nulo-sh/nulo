/**
 * Component tests for NewContactPopup, pinning the decoupled behavior:
 * saving a contact touches the contact service ONLY — no sender
 * registration surface (no toggle, no account-state client).
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"

// ── Mocks ────────────────────────────────────────────────────────────

const contactServiceMock = {
	getContacts: vi.fn(),
	addContact: vi.fn(),
	disconnect: vi.fn(),
	onContactAdded: { add: vi.fn(), remove: vi.fn() },
	onContactUpdated: { add: vi.fn(), remove: vi.fn() },
	onContactDeleted: { add: vi.fn(), remove: vi.fn() },
}

const openToastMock = vi.fn()

// Vitest 4 requires `function` expressions (not arrow functions) for mocks
// instantiated with `new`.
vi.mock("@/wallet/services/contact/client", () => ({
	ContactServiceClient: vi.fn(function () {
		return contactServiceMock
	}),
}))

vi.mock("@/stores/popup.store", () => ({
	usePopupStore: () => ({ len: 1, popups: { new_contact: { order: 1 } } }),
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
	Transition: { template: "<div><slot /></div>" },
}

// Lazy import after vi.mock calls hoist
import NewContactPopup from "./NewContactPopup.vue"

const VALID_ADDRESS = `0x2${"a".repeat(63)}`

const trackedWrappers: Array<ReturnType<typeof mount>> = []

async function mountAndOpen(existing: Array<{ id: string; name: string; address: string }> = []) {
	const w = mount(NewContactPopup, {
		props: { show: false },
		global: { stubs: STUBS },
	})
	trackedWrappers.push(w)
	contactServiceMock.getContacts.mockResolvedValueOnce(existing)
	await w.setProps({ show: true })
	await flushPromises()
	return w
}

async function fill(w: ReturnType<typeof mount>, name: string, address: string) {
	await w.find('[data-testid="name-input"]').setValue(name)
	await w.find('[data-testid="address-input"]').setValue(address)
	await flushPromises()
}

beforeEach(() => {
	vi.clearAllMocks()
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

describe("NewContactPopup — decoupled from sender registration", () => {
	test("(RE-ENTRANCY PIN) repeated Enter during an in-flight add fires addContact ONCE", async () => {
		const w = await mountAndOpen()
		contactServiceMock.addContact.mockImplementation(() => new Promise(() => {}))
		await fill(w, "Alice-Reentrant", VALID_ADDRESS)
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
		const myCalls = contactServiceMock.addContact.mock.calls.filter((c) => c[0] === "Alice-Reentrant").length
		// Cleanup BEFORE the assertion: a failing expect must not skip the
		// unmount (scope cleanup removes the document listener) or the reset.
		w.unmount()
		contactServiceMock.addContact.mockReset()
		docInput.remove()
		expect(myCalls).toBe(1)
	})

	test("submit calls addContact with trimmed name + address, closes, and toasts success", async () => {
		const w = await mountAndOpen()
		contactServiceMock.addContact.mockResolvedValueOnce({ id: "c1" })
		await fill(w, "  Alice ", VALID_ADDRESS)
		await w.find('[data-testid="form-submit"]').trigger("click")
		await flushPromises()

		expect(contactServiceMock.addContact).toHaveBeenCalledWith("Alice", VALID_ADDRESS)
		expect(w.emitted("onClose")).toBeTruthy()
		expect(openToastMock).toHaveBeenCalledWith({ kind: "success", label: "Contact is added" })
	})

	test("saves the address canonicalized to lowercase", async () => {
		const w = await mountAndOpen()
		contactServiceMock.addContact.mockResolvedValueOnce({ id: "c1" })
		await fill(w, "Alice", `0x2${"A".repeat(63)}`)
		await w.find('[data-testid="form-submit"]').trigger("click")
		await flushPromises()

		expect(contactServiceMock.addContact).toHaveBeenCalledWith("Alice", `0x2${"a".repeat(63)}`)
	})

	test("renders NO register-as-sender toggle", async () => {
		const w = await mountAndOpen()
		expect(w.find('[data-testid="new-contact-register-sender"]').exists()).toBe(false)
		expect(w.text()).not.toContain("Register as sender")
	})

	test("addContact failure surfaces the error toast and does not close", async () => {
		const w = await mountAndOpen()
		contactServiceMock.addContact.mockRejectedValueOnce(new Error("boom"))
		await fill(w, "Alice", VALID_ADDRESS)
		await w.find('[data-testid="form-submit"]').trigger("click")
		await flushPromises()

		expect(w.emitted("onClose")).toBeFalsy()
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Something went wrong" })
	})

	test("duplicate name or address disables submit", async () => {
		const w = await mountAndOpen([{ id: "c1", name: "Alice", address: VALID_ADDRESS }])
		await fill(w, "Alice", `0x2${"b".repeat(63)}`)
		expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("true")

		await fill(w, "Bob", VALID_ADDRESS)
		expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("true")

		// Hex is case-insensitive — an uppercase rendering of a saved address
		// is the same contact.
		await fill(w, "Bob", `0x2${"A".repeat(63)}`)
		expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("true")

		await fill(w, "Bob", `0x2${"b".repeat(63)}`)
		expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("false")
	})

	test("a well-formed address off the curve disables submit and saves nothing", async () => {
		const w = await mountAndOpen([])
		await fill(w, "Bob", "0x24f20fb6e501242936eb1f47e2f51610f15e6c07486ed62012774e5f14ebd583")
		expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("true")
		await w.find('[data-testid="address-input"]').trigger("keydown", { key: "Enter" })
		await flushPromises()
		expect(contactServiceMock.addContact).not.toHaveBeenCalled()

		await fill(w, "Bob", VALID_ADDRESS)
		expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("false")
	})

	test("closing disconnects the contact service only", async () => {
		const w = await mountAndOpen()
		await w.setProps({ show: false })
		await flushPromises()
		expect(contactServiceMock.disconnect).toHaveBeenCalled()
	})
})

describe("NewContactPopup — contact list reducers and duplicate rules", () => {
	type Row = { id: string; name: string; address: string }
	const addr = (c: string) => `0x2${c.repeat(63)}`
	const handler = (bus: { add: { mock: { calls: unknown[][] } } }) => bus.add.mock.calls[0][0] as (r: Row) => void
	const vmContacts = (w: ReturnType<typeof mount>) => (w.vm as unknown as { contacts: Row[] }).contacts
	async function nameWarns(w: ReturnType<typeof mount>, name: string) {
		await w.find('[data-testid="name-input"]').setValue(name)
		await w.find('[data-testid="address-input"]').setValue("")
		await flushPromises()
		return w.text().includes("Already exist")
	}

	test("an update for a listed id replaces its first row in place", async () => {
		const w = await mountAndOpen([
			{ id: "c1", name: "Alice", address: addr("a") },
			{ id: "c1", name: "Bob", address: addr("b") },
		])
		const before = vmContacts(w)
		handler(contactServiceMock.onContactUpdated)({ id: "c1", name: "Carol", address: addr("c") })
		expect(vmContacts(w)).toBe(before)
		expect(vmContacts(w).map((c) => c.name)).toEqual(["Carol", "Bob"])
		expect(await nameWarns(w, "Alice")).toBe(false)
		expect(await nameWarns(w, "Carol")).toBe(true)
		expect(await nameWarns(w, "Bob")).toBe(true)
	})

	test("an update for an unlisted id appends it in place", async () => {
		const w = await mountAndOpen([{ id: "c1", name: "Alice", address: addr("a") }])
		const before = vmContacts(w)
		handler(contactServiceMock.onContactUpdated)({ id: "c9", name: "Dave", address: addr("d") })
		expect(vmContacts(w)).toBe(before)
		expect(vmContacts(w).map((c) => c.name)).toEqual(["Alice", "Dave"])
		expect(await nameWarns(w, "Dave")).toBe(true)
	})

	test("an add appends in place, even for a listed id", async () => {
		const w = await mountAndOpen([{ id: "c1", name: "Alice", address: addr("a") }])
		const before = vmContacts(w)
		handler(contactServiceMock.onContactAdded)({ id: "c1", name: "Alice", address: addr("a") })
		expect(vmContacts(w)).toBe(before)
		expect(vmContacts(w)).toHaveLength(2)
	})

	test("a delete drops every row with its id, into a new array", async () => {
		const w = await mountAndOpen([
			{ id: "c1", name: "Alice", address: addr("a") },
			{ id: "c2", name: "Bob", address: addr("b") },
			{ id: "c1", name: "Carl", address: addr("c") },
		])
		const before = vmContacts(w)
		handler(contactServiceMock.onContactDeleted)({ id: "c1", name: "Alice", address: addr("a") })
		expect(vmContacts(w)).not.toBe(before)
		expect(vmContacts(w).map((c) => c.name)).toEqual(["Bob"])
		expect(await nameWarns(w, "Alice")).toBe(false)
		expect(await nameWarns(w, "Carl")).toBe(false)
		expect(await nameWarns(w, "Bob")).toBe(true)
	})

	test("a name stored as a saved one, differing only by case, spacing, invisible characters or what the cut drops, is a duplicate; another letter is not", async () => {
		const w = await mountAndOpen([
			{ id: "c1", name: "Alice", address: addr("a") },
			{ id: "c2", name: "Bob ", address: addr("c") },
			{ id: "c3", name: "Abcdefghijklmnopqrstuvwxy", address: addr("d") },
		])
		for (const name of ["Alice", "Alice ", " alice", "ALI\u3164CE\u200B", "Bob", "bob", "abcdefghijklmnopqrstuvwxyz"])
			expect(await nameWarns(w, name)).toBe(true)
		for (const name of ["Al ice", "Alicia", "\u0410lice"]) expect(await nameWarns(w, name)).toBe(false)
	})

	test("a name that matches only once trimmed blocks the submit, by click and by Enter", async () => {
		const w = await mountAndOpen([{ id: "c1", name: "Alice", address: addr("a") }])
		await fill(w, "Alice ", addr("b"))
		expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("true")
		await w.find('[data-testid="form-submit"]').trigger("click")
		// The popup's Enter listener lives on `document`; the mounted tree is detached.
		const docInput = document.createElement("input")
		document.body.appendChild(docInput)
		const enter = async () => {
			docInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
			await flushPromises()
		}
		await enter()
		const blocked = contactServiceMock.addContact.mock.calls.length
		await fill(w, "Carol", addr("b"))
		await enter()
		docInput.remove()
		expect(blocked).toBe(0)
		expect(contactServiceMock.addContact).toHaveBeenCalledWith("Carol", addr("b"))
	})

	test("a name with nothing visible, whitespace or invisible characters only, never warns and keeps submit disabled", async () => {
		// The second row is older data: a saved name of invisible characters only.
		const w = await mountAndOpen([
			{ id: "c1", name: "Alice", address: addr("a") },
			{ id: "c2", name: "\u3164", address: addr("c") },
		])
		for (const name of ["   ", "\u3164\u200B "]) {
			expect(await nameWarns(w, name)).toBe(false)
			await fill(w, name, addr("b"))
			expect(w.find('[data-testid="form-popup"]').attributes("data-submit-disabled")).toBe("true")
		}
	})

	test("the address check ignores hex case", async () => {
		const w = await mountAndOpen([{ id: "c1", name: "Alice", address: addr("a") }])
		await fill(w, "Bob", addr("A"))
		expect(w.text()).toContain("Already exist")
		await fill(w, "Bob", addr("b"))
		expect(w.text()).not.toContain("Already exist")
	})
})
