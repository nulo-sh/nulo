import { Flex, Icon, Input, Spinner, Text } from "@nulo/design"
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { sendEvent } from "../../../../../tests/helpers/send-event"
import { settingsContext, settingsRouter } from "../../../../../tests/helpers/settings-rows"
import ItemsContainer from "@/components/ui/Settings/ItemsContainer.vue"
import SettingsSearch from "./SettingsSearch.vue"

let wrapper: VueWrapper | undefined
enableAutoUnmount(afterEach)

async function mountSearch(query = "", sidePanel = true) {
	const router = settingsRouter()
	await router.push("/popup/settings")
	const push = vi.spyOn(router, "push")
	wrapper = mount(SettingsSearch, {
		attachTo: document.body,
		props: {
			modelValue: query,
			"onUpdate:modelValue": (value: string) => wrapper?.setProps({ modelValue: value }),
			context: settingsContext({ sidePanel }),
		},
		global: { plugins: [router], components: { Flex, Icon, Input, Spinner, Text } },
	})
	await flushPromises()
	return { w: wrapper, push }
}

const field = (w: VueWrapper) => w.get<HTMLInputElement>('[data-testid="settings-search-input"]').element
const results = (w: VueWrapper) => w.findAll('[data-testid^="settings-search-result-"]').map((r) => r.element as HTMLElement)

/** A keydown on `el` through `sendEvent`, since the root's listener comes after the field's or the
 *  row link's; true when no handler cancelled it. */
function key(el: Element, k: string, init: KeyboardEventInit = {}) {
	const sent = sendEvent(el, "keydown", { key: k, ...init })
	if (!sent) throw new Error(`no keydown reached ${el.tagName} for ${k}`)
	return !sent.defaultPrevented
}

describe("results", () => {
	test('"ation" shows the Display caption over Disable animations, then Theme, each opening its row', async () => {
		const { w } = await mountSearch("ation")
		expect(w.findAllComponents(ItemsContainer).map((g) => [g.props("title"), g.props("danger")])).toEqual([["Display", false]])
		expect(results(w).map((r) => [r.dataset.testid, r.getAttribute("href")])).toEqual([
			["settings-search-result-display-animations", "/popup/settings/display?row=display-animations"],
			["settings-search-result-display-theme", "/popup/settings/display?row=display-theme"],
		])
		expect(results(w)[0].textContent).toContain("Minimize the use of animations")
		expect(w.find('[data-testid="settings-search-empty"]').exists()).toBe(false)
	})

	test("a result for a row of the Settings list opens that row's own page", async () => {
		const { w } = await mountSearch("seed")
		expect(w.findAllComponents(ItemsContainer).map((g) => g.props("title"))).toEqual(["Safety"])
		expect(results(w).map((r) => [r.dataset.testid, r.getAttribute("href")])).toEqual([
			["settings-search-result-hub-backup", "/popup/settings/security/export"],
		])
	})

	test('"full" finds Open as Side Panel, and on a browser with no side panel only the empty line', async () => {
		const withPanel = await mountSearch("full")
		expect(results(withPanel.w).map((r) => r.dataset.testid)).toEqual(["settings-search-result-display-side-panel"])
		withPanel.w.unmount()
		const { w } = await mountSearch("full", false)
		expect(results(w)).toEqual([])
		expect(w.get('[data-testid="settings-search-empty"]').text()).toBe("No settings found")
	})

	test("a word nothing matches shows the one line and no row", async () => {
		const { w } = await mountSearch("zzz")
		expect(w.get('[data-testid="settings-search-empty"]').text()).toBe("No settings found")
		expect(results(w)).toEqual([])
	})

	test("a blank field shows neither results nor the line", async () => {
		const { w } = await mountSearch(" ")
		expect(results(w)).toEqual([])
		expect(w.find('[data-testid="settings-search-empty"]').exists()).toBe(false)
	})

	test("a bidi control or zero-width space typed into the field is dropped, so the field and the search read the same", async () => {
		const { w } = await mountSearch()
		await w.get('[data-testid="settings-search-input"]').setValue(`${String.fromCodePoint(0x202e)}du${String.fromCodePoint(0x200b)}st`)
		expect(field(w).value).toBe("dust")
		expect(results(w).map((r) => r.dataset.testid)).toEqual(["settings-search-result-display-dust"])
	})

	test("typing replaces the results as the word changes", async () => {
		const { w } = await mountSearch()
		await w.get('[data-testid="settings-search-input"]').setValue("dust")
		expect(results(w).map((r) => r.dataset.testid)).toEqual(["settings-search-result-display-dust"])
	})
})

describe("keys", () => {
	// A still clock puts every raw dispatch in its mount's millisecond: a helper that skips `sendEvent`
	// fails every run, not one CI run in many.
	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(Date.now())
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	test("ArrowDown walks from the field through the results and wraps to the field", async () => {
		const { w } = await mountSearch("ation")
		field(w).focus()
		expect(key(field(w), "ArrowDown")).toBe(false)
		expect(document.activeElement).toBe(results(w)[0])
		key(results(w)[0], "ArrowDown")
		expect(document.activeElement).toBe(results(w)[1])
		key(results(w)[1], "ArrowDown")
		expect(document.activeElement).toBe(field(w))
	})

	test("ArrowUp from the field goes to the last result", async () => {
		const { w } = await mountSearch("ation")
		field(w).focus()
		key(field(w), "ArrowUp")
		expect(document.activeElement).toBe(results(w)[1])
	})

	test("an arrow with no results leaves the caret alone", async () => {
		const { w } = await mountSearch("zzz")
		field(w).focus()
		expect(key(field(w), "ArrowDown")).toBe(true)
		expect(document.activeElement).toBe(field(w))
	})

	test("Escape on a result empties the field, focuses it, and is handled", async () => {
		const { w } = await mountSearch("ation")
		results(w)[0].focus()
		expect(key(results(w)[0], "Escape")).toBe(false)
		await flushPromises()
		expect(field(w).value).toBe("")
		expect(document.activeElement).toBe(field(w))
		expect(results(w)).toEqual([])
	})

	test("on an empty field a fresh Escape is left to the browser and a held one is not", async () => {
		const { w } = await mountSearch()
		expect(key(field(w), "Escape")).toBe(true)
		expect(key(field(w), "Escape", { repeat: true })).toBe(false)
	})

	test("a composing arrow or Escape does nothing", async () => {
		const { w } = await mountSearch("ation")
		field(w).focus()
		expect(key(field(w), "ArrowDown", { isComposing: true })).toBe(true)
		expect(key(field(w), "Escape", { keyCode: 229 })).toBe(true)
		expect(document.activeElement).toBe(field(w))
		expect(field(w).value).toBe("ation")
	})

	test("a modified arrow or Enter keeps the field's own meaning", async () => {
		const { w, push } = await mountSearch("ation")
		field(w).focus()
		expect(key(field(w), "ArrowUp", { shiftKey: true })).toBe(true)
		expect(key(field(w), "Enter", { ctrlKey: true })).toBe(true)
		expect(document.activeElement).toBe(field(w))
		expect(push).not.toHaveBeenCalled()
	})

	test("Enter in the field opens the first result; a repeat or composing Enter opens nothing", async () => {
		const { w, push } = await mountSearch("ation")
		key(field(w), "Enter", { repeat: true })
		key(field(w), "Enter", { isComposing: true })
		expect(push).not.toHaveBeenCalled()
		expect(key(field(w), "Enter")).toBe(false)
		expect(push).toHaveBeenCalledExactlyOnceWith("/popup/settings/display?row=display-animations")
	})

	test("Enter on a Settings-list result opens that row's own page", async () => {
		const { w, push } = await mountSearch("seed")
		key(field(w), "Enter")
		expect(push).toHaveBeenCalledExactlyOnceWith("/popup/settings/security/export")
	})
})
