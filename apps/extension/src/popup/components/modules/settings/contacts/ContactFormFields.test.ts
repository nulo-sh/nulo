import { Input } from "@nulo/design"
import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { CONTACT_NAME_MAX } from "@/utils/contact-name"
import ContactFormFields from "./ContactFormFields.vue"

const STUBS = {
	Input: {
		props: ["modelValue", "placeholder", "maxLength"],
		emits: ["update:modelValue"],
		template: `<div><input data-testid="name-input" :placeholder="placeholder" :data-max-length="maxLength" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><slot name="right" /></div>`,
	},
	AddressInput: {
		props: ["modelValue", "placeholder"],
		emits: ["update:modelValue"],
		template: `<div><input data-testid="address-input" :placeholder="placeholder" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><slot name="right" /></div>`,
	},
	Icon: { template: "<i />" },
	Text: { template: "<span><slot /></span>" },
	Flex: { template: "<div><slot /></div>" },
	Transition: { template: "<div><slot /></div>" },
}

function mountFields(props: Record<string, unknown> = {}) {
	return mount(ContactFormFields, {
		props: { name: "", address: "", addressValid: false, ...props },
		global: { stubs: STUBS },
	})
}

describe("ContactFormFields", () => {
	test("name input round-trips through the name model", async () => {
		const w = mountFields()
		await w.find('[data-testid="name-input"]').setValue("Alice")
		expect(w.emitted("update:name")?.at(-1)).toEqual(["Alice"])
	})

	test("address input round-trips through the address model", async () => {
		const w = mountFields()
		await w.find('[data-testid="address-input"]').setValue("0xabc")
		expect(w.emitted("update:address")?.at(-1)).toEqual(["0xabc"])
	})

	test("placeholders are verbatim, and the name takes no more than a stored name holds", () => {
		const w = mountFields()
		expect(w.find('[data-testid="name-input"]').attributes("data-max-length")).toBe(String(CONTACT_NAME_MAX))
		expect(w.find('[data-testid="name-input"]').attributes("placeholder")).toBe("New contact")
		expect(w.find('[data-testid="address-input"]').attributes("placeholder")).toBe(
			"0x15c4ac6afcffdf59aa8a1fb3317ff0c86aee3eb02f9e52c3612e1163d4701446",
		)
	})

	test("name duplicate warning follows nameExists", async () => {
		const w = mountFields({ nameExists: true })
		expect(w.text()).toContain("Already exist")
		await w.setProps({ nameExists: false })
		expect(w.text()).not.toContain("Already exist")
	})

	test("invalid-address warning needs a non-empty address", async () => {
		const w = mountFields({ address: "nothex", addressValid: false })
		expect(w.text()).toContain("Invalid address")
		await w.setProps({ address: "" })
		expect(w.text()).not.toContain("Invalid address")
	})

	test("address duplicate warning only when the address is valid", () => {
		const w = mountFields({ address: "0xdup", addressValid: true, addressExists: true })
		expect(w.text()).toContain("Already exist")
		expect(w.text()).not.toContain("Invalid address")
	})

	test("invalid wins over duplicate on the address field", () => {
		const w = mountFields({ address: "0xdup", addressValid: false, addressExists: true })
		expect(w.text()).toContain("Invalid address")
		expect(w.text()).not.toContain("Already exist")
	})

	test("no warnings on a clean valid state", () => {
		const w = mountFields({ address: "0xok", addressValid: true })
		expect(w.text()).not.toContain("Already exist")
		expect(w.text()).not.toContain("Invalid address")
	})
})

describe("ContactFormFields — the name field keeps what a stored name holds", () => {
	async function typed(text: string): Promise<unknown> {
		const { Input: _stub, ...stubs } = STUBS
		const w = mount(ContactFormFields, {
			props: { name: "", address: "", addressValid: false },
			global: { stubs, components: { Input } },
		})
		await w.find('[data-testid="contact-name-input"]').setValue(text)
		return w.emitted("update:name")?.at(-1)?.[0]
	}

	test("whitespace becomes a space, invisible characters cost nothing, a word break can be typed, and the cut never splits a letter", async () => {
		expect(await typed("Ali\u00A0ce\u200B")).toBe("Ali ce")
		expect(await typed("Alice ")).toBe("Alice ")
		expect(await typed(`\u3164${"a".repeat(30)}`)).toBe("a".repeat(CONTACT_NAME_MAX))
		expect(await typed(`${"a".repeat(CONTACT_NAME_MAX - 1)}\u{20000}`)).toBe("a".repeat(CONTACT_NAME_MAX - 1))
	})
})
