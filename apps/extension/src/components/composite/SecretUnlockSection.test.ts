import { Flex, Icon, Input, Text } from "@nulo/design"
import { describe, expect, test } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { defineComponent, h } from "vue"
import { nativeInput } from "../../../tests/helpers/credential-pins"
import { sendEvent } from "../../../tests/helpers/send-event"
import SecretUnlockSection from "./SecretUnlockSection.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: '<span :data-name="name" />', props: ["name", "size", "color"] },
	Transition: { template: "<div><slot /></div>" },
	Input: {
		template:
			'<div data-input-stub :data-error="error" :data-aria-invalid="ariaInvalid"><input :type="type" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></div>',
		props: ["modelValue", "type", "label", "placeholder", "error", "ariaInvalid", "autofocus"],
		emits: ["update:modelValue"],
	},
}

const factory = (props: Record<string, unknown> = {}) => mount(SecretUnlockSection, { props, global: { stubs: STUBS } })

describe("composite/SecretUnlockSection", () => {
	test("renders the 'Unlock' section label", () => {
		const w = factory()
		expect(w.text()).toContain("Unlock")
	})

	test("forwards modelValue to the Input", () => {
		const w = factory({ modelValue: "secret" })
		expect(w.find("input").attributes("value")).toBe("secret")
	})

	test("typing emits update:modelValue + clearError", async () => {
		const w = factory({ error: true })
		await w.find("input").setValue("new-pwd")
		expect(w.emitted("update:modelValue")?.[0]).toEqual(["new-pwd"])
		expect(w.emitted("clearError")).toHaveLength(1)
	})

	test("clicking the Input wrapper emits clearError", async () => {
		const w = factory({ error: true })
		await w.find("[data-input-stub]").trigger("click")
		expect(w.emitted("clearError")).toHaveLength(1)
	})

	test("preserves the canonical 'unlock-password-input' testid", () => {
		const w = mount(SecretUnlockSection, {
			props: {},
			global: {
				stubs: {
					...STUBS,
					Input: {
						template: "<div :data-testid=\"$attrs['data-testid']\"></div>",
						props: ["modelValue", "type", "label", "placeholder", "error", "ariaInvalid", "autofocus"],
						inheritAttrs: false,
					},
				},
			},
		})
		expect(w.find('[data-testid="unlock-password-input"]').exists()).toBe(true)
	})

	test("error span carries role=alert + data-testid (a11y + e2e contract)", () => {
		const w = factory({ error: true })
		const errEl = w.find('[data-testid="unlock-error-text"]')
		expect(errEl.exists()).toBe(true)
		expect(errEl.attributes("role")).toBe("alert")
		expect(errEl.text()).toContain("Wrong password")
	})
})

describe("composite/SecretUnlockSection, real Input", () => {
	test("an input that leaves the value as it was still updates the model, then clears the error", async () => {
		const heard: string[] = []
		const Host = defineComponent(
			() => () =>
				h(SecretUnlockSection, {
					modelValue: "same",
					error: true,
					"onUpdate:modelValue": (v: string) => heard.push(`update:${v}`),
					onClearError: () => heard.push("clearError"),
				}),
		)
		const w = mount(Host, { global: { components: { Flex, Icon, Input, Text } } })
		const input = nativeInput(w, "unlock-password-input")
		expect(input.value).toBe("same")
		sendEvent(input, "input")
		await flushPromises()
		expect(heard).toEqual(["update:same", "clearError"])
		w.unmount()
	})
})
