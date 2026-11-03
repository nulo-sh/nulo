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

describe("SearchField keeps only the address of a padded address", () => {
	const ADDRESS = "0x04d7bb8a4a0239077d7d246279076fdab66f5ed6167bd01882fad6131199457a"
	const query = (w: ReturnType<typeof mount>) => (w.vm as unknown as { query: string }).query
	const paste = (el: HTMLInputElement, text: string) => {
		const e = new Event("paste", { cancelable: true }) as Event & { clipboardData: unknown }
		e.clipboardData = { getData: () => text }
		el.dispatchEvent(e)
		return e
	}

	test("white space and a joiner at the ends go, and the caret ends the address", async () => {
		const { w, el } = mountHost()
		el.value = `\u00A0${ADDRESS} \u200D`
		el.dispatchEvent(new Event("input"))
		await nextTick()
		expect(el.value).toBe(ADDRESS)
		expect(query(w)).toBe(ADDRESS)
		expect([el.selectionStart, el.selectionEnd]).toEqual([66, 66])
	})

	test("a name keeps its trailing space, and an address with a joiner inside keeps it", async () => {
		const { w, el } = mountHost()
		for (const typed of ["usdc ", `${ADDRESS.slice(0, 30)}\u200D${ADDRESS.slice(30)}`]) {
			el.value = typed
			el.dispatchEvent(new Event("input"))
			await nextTick()
			expect(el.value).toBe(typed)
			expect(query(w)).toBe(typed)
		}
	})

	test("a padded address longer than the field's limit is taken whole, not cut to the limit", async () => {
		const { w, el } = mountHost()
		const e = paste(el, `${"\u00A0".repeat(15)}${ADDRESS}`)
		await nextTick()
		expect(e.defaultPrevented).toBe(true)
		expect(el.value).toBe(ADDRESS)
		expect(query(w)).toBe(ADDRESS)
	})

	test("a paste within the limit, or one that is no address, is left to the browser", () => {
		const { el } = mountHost()
		expect(paste(el, ` ${ADDRESS} `).defaultPrevented).toBe(false)
		expect(paste(el, `${"x".repeat(15)}${ADDRESS}`).defaultPrevented).toBe(false)
	})
})
