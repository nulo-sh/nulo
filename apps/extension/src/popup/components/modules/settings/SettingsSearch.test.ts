import { Flex, Icon, Input, Spinner, Text } from "@nulo/design"
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
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

/** A keydown on `el` as a browser sends it; true when no handler cancelled it. */
const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
	el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }))

describe("results", () => {
	test('"full" shows the Display caption over Full-height popups, then Open as Side Panel, each opening its row', async () => {
		const { w } = await mountSearch("full")
		expect(w.findAllComponents(ItemsContainer).map((g) => [g.props("title"), g.props("danger")])).toEqual([["Display", false]])
		expect(results(w).map((r) => [r.dataset.testid, r.getAttribute("href")])).toEqual([
			["settings-search-result-display-full-height", "/popup/settings/display?row=display-full-height"],
			["settings-search-result-display-side-panel", "/popup/settings/display?row=display-side-panel"],
		])
		expect(results(w)[0].textContent).toContain("Open popups to the full height")
		expect(w.find('[data-testid="settings-search-empty"]').exists()).toBe(false)
	})

	test("a result for a row of the Settings list opens that row's own page", async () => {
		const { w } = await mountSearch("seed")
		expect(w.findAllComponents(ItemsContainer).map((g) => g.props("title"))).toEqual(["Safety"])
		expect(results(w).map((r) => [r.dataset.testid, r.getAttribute("href")])).toEqual([
			["settings-search-result-hub-backup", "/popup/settings/security/export"],
		])
	})

	test("on a browser with no side panel, Full-height popups alone", async () => {
		const { w } = await mountSearch("full", false)
		expect(results(w).map((r) => r.dataset.testid)).toEqual(["settings-search-result-display-full-height"])
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

	test("typing replaces the results as the word changes", async () => {
		const { w } = await mountSearch()
		await w.get('[data-testid="settings-search-input"]').setValue("dust")
		expect(results(w).map((r) => r.dataset.testid)).toEqual(["settings-search-result-display-dust"])
	})
})

describe("keys", () => {
	test("ArrowDown walks from the field through the results and wraps to the field", async () => {
		const { w } = await mountSearch("full")
		field(w).focus()
		expect(key(field(w), "ArrowDown")).toBe(false)
		expect(document.activeElement).toBe(results(w)[0])
		key(results(w)[0], "ArrowDown")
		expect(document.activeElement).toBe(results(w)[1])
		key(results(w)[1], "ArrowDown")
		expect(document.activeElement).toBe(field(w))
	})

	test("ArrowUp from the field goes to the last result", async () => {
		const { w } = await mountSearch("full")
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
		const { w } = await mountSearch("full")
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
		const { w } = await mountSearch("full")
		field(w).focus()
		expect(key(field(w), "ArrowDown", { isComposing: true })).toBe(true)
		expect(key(field(w), "Escape", { keyCode: 229 })).toBe(true)
		expect(document.activeElement).toBe(field(w))
		expect(field(w).value).toBe("full")
	})

	test("a modified arrow or Enter keeps the field's own meaning", async () => {
		const { w, push } = await mountSearch("full")
		field(w).focus()
		expect(key(field(w), "ArrowUp", { shiftKey: true })).toBe(true)
		expect(key(field(w), "Enter", { ctrlKey: true })).toBe(true)
		expect(document.activeElement).toBe(field(w))
		expect(push).not.toHaveBeenCalled()
	})

	test("Enter in the field opens the first result; a repeat or composing Enter opens nothing", async () => {
		const { w, push } = await mountSearch("full")
		key(field(w), "Enter", { repeat: true })
		key(field(w), "Enter", { isComposing: true })
		expect(push).not.toHaveBeenCalled()
		expect(key(field(w), "Enter")).toBe(false)
		expect(push).toHaveBeenCalledExactlyOnceWith("/popup/settings/display?row=display-full-height")
	})

	test("Enter on a Settings-list result opens that row's own page", async () => {
		const { w, push } = await mountSearch("seed")
		key(field(w), "Enter")
		expect(push).toHaveBeenCalledExactlyOnceWith("/popup/settings/security/export")
	})
})
