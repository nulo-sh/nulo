import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { defineComponent, ref } from "vue"
import SideChoice from "./SideChoice.vue"

const STUBS = {
	Icon: { template: '<i data-testid="stub-icon" :data-name="name" />', props: ["name", "size"] },
	Skeleton: { template: '<span data-testid="stub-bar" />' },
}
const WORDS = { private: "Private", public: "Public" }

const mountChoice = (props: Record<string, unknown> = {}) =>
	mount(SideChoice, {
		props: {
			label: "From your balance",
			words: WORDS,
			hints: { private: "12.5 USDC", public: "3 USDC" },
			testid: "send-from-type",
			prefix: "send-from",
			hintPrefix: undefined,
			modelValue: "private",
			...props,
		},
		global: { stubs: STUBS },
	})
const radio = (w: ReturnType<typeof mountChoice>, side: string) => w.get<HTMLInputElement>(`[data-testid="send-from-${side}"]`)

describe("composite/send/SideChoice", () => {
	test("a radiogroup named by its visible label", () => {
		const w = mountChoice()
		const group = w.get('[data-testid="send-from-type"]')
		expect(group.attributes("role")).toBe("radiogroup")
		const label = w.get(`#${group.attributes("aria-labelledby")}`)
		expect(label.text()).toBe("From your balance")
	})

	test("two native radios sharing one name, so the group is one Tab stop and the arrows rove", () => {
		const w = mountChoice()
		const radios = w.findAll<HTMLInputElement>('input[type="radio"]')
		expect(radios).toHaveLength(2)
		expect(new Set(radios.map((r) => r.element.name)).size).toBe(1)
		expect(radios[0].element.name).not.toBe("")
	})

	test("two groups on one page never share a name", () => {
		const page = defineComponent({
			components: { SideChoice },
			setup: () => ({ from: ref("private"), to: ref("public"), WORDS }),
			template: `<div>
				<SideChoice v-model="from" label="From" :words="WORDS" :hints="{}" testid="from" prefix="from" />
				<SideChoice v-model="to" label="To" :words="WORDS" :hints="{}" testid="to" prefix="to" />
			</div>`,
		})
		const w = mount(page, { global: { stubs: STUBS } })
		const names = w.findAll<HTMLInputElement>('input[type="radio"]').map((r) => r.element.name)
		expect(new Set(names).size).toBe(2)
	})

	test("the chosen side is checked, and the group says which", () => {
		const w = mountChoice({ modelValue: "public" })
		expect([radio(w, "private").element.checked, radio(w, "public").element.checked]).toEqual([false, true])
		expect(w.get('[data-testid="send-from-type"]').attributes("data-side")).toBe("public")
	})

	test("picking a side emits it", async () => {
		const w = mountChoice()
		await radio(w, "public").setValue(true)
		expect(w.emitted("update:modelValue")?.at(-1)).toEqual(["public"])
	})

	test("each choice carries its word and glyph", () => {
		const w = mountChoice({ words: { private: "Privately", public: "Publicly" } })
		expect(w.findAll("label").map((l) => l.text())).toEqual(["Privately12.5 USDC", "Publicly3 USDC"])
		expect(w.findAll('[data-testid="stub-icon"]').map((i) => i.attributes("data-name"))).toEqual(["private", "public"])
	})

	test("a side the token cannot take is a disabled radio, which the arrows skip", () => {
		const w = mountChoice({ disabled: { public: true } })
		expect(radio(w, "public").attributes("disabled")).toBeDefined()
		expect(radio(w, "private").attributes("disabled")).toBeUndefined()
	})

	test("each hint has its own testid", () => {
		const w = mountChoice()
		expect(w.find('[data-testid="send-from-private-balance"]').exists()).toBe(false)
		const hinted = mountChoice({ hintPrefix: "send-from-balance" })
		expect(hinted.get('[data-testid="send-from-balance-private"]').text()).toBe("12.5 USDC")
	})

	test("a hint still loading is a bar", () => {
		const w = mountChoice({ loading: { private: true } })
		expect(w.findAll('[data-testid="stub-bar"]')).toHaveLength(1)
		expect(w.findAll("label")[0].text()).toBe("Private")
	})

	test("a side with no hint shows none", () => {
		const w = mountChoice({ hints: { private: null, public: "3 USDC" } })
		expect(w.findAll("label")[0].text()).toBe("Private")
	})

	test("stacked rows give each hint a sentence's type", () => {
		const w = mountChoice({ rows: true, hints: { private: "Their address stays hidden", public: "Their address is shown" } })
		expect(w.get('[data-testid="send-from-type"]').classes().length).toBe(2)
		expect(w.findAll("label").map((l) => l.text())).toEqual(["PrivateTheir address stays hidden", "PublicTheir address is shown"])
	})
})
