import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, test } from "vitest"
import { defineComponent, nextTick, ref } from "vue"
import SearchField from "./SearchField.vue"

const ZWSP = String.fromCodePoint(0x200b)

/** The field as its consumers bind it: the parent's model, written back through `modelValue`. */
const Host = defineComponent({
	components: { SearchField },
	setup: () => ({ query: ref("") }),
	template: `<SearchField v-model="query" testid="search" />`,
})

const mounted: ReturnType<typeof mount>[] = []
const mountHost = () => {
	const w = mount(Host, { attachTo: document.body, global: { stubs: { Icon: true } } })
	mounted.push(w)
	return { w, el: w.get('[data-testid="search"]').element as HTMLInputElement }
}

afterEach(() => {
	for (const w of mounted.splice(0)) w.unmount()
})

describe("SearchField keeps no character the typed-text rule removes", () => {
	test("a strip inside the text keeps the caret after what preceded it", async () => {
		const { w, el } = mountHost()
		el.value = `ab${ZWSP}cd`
		el.setSelectionRange(4, 4)
		el.dispatchEvent(new Event("input"))
		await nextTick()
		expect(el.value).toBe("abcd")
		expect((w.vm as unknown as { query: string }).query).toBe("abcd")
		expect([el.selectionStart, el.selectionEnd]).toEqual([3, 3])
	})

	test("a composing input is emitted as typed and left in the field; the commit strips it", async () => {
		const { w, el } = mountHost()
		const query = () => (w.vm as unknown as { query: string }).query
		el.value = `a${ZWSP}b`
		el.dispatchEvent(new InputEvent("input", { isComposing: true }))
		await nextTick()
		expect(el.value).toBe(`a${ZWSP}b`)
		expect(query()).toBe(`a${ZWSP}b`)

		el.dispatchEvent(new CompositionEvent("compositionend"))
		await nextTick()
		expect(el.value).toBe("ab")
		expect(query()).toBe("ab")
	})
})
