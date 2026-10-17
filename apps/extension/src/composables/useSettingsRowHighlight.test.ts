import { Flex, Icon, Text } from "@nulo/design"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { defineComponent, h, nextTick, ref, withDirectives } from "vue"
import { createMemoryHistory, createRouter, type RouteRecordRaw } from "vue-router"
import SettingItem from "@/components/ui/Settings/SettingItem.vue"
import { createPopupGuard } from "@/popup/route-guard"
import { useSettingsRowHighlight } from "./useSettingsRowHighlight"

const PAGE = "/popup/settings/display"

const shown = ref(true)
const late = ref(false)
const value = ref("Off")
let highlight: ReturnType<typeof useSettingsRowHighlight>

/** A settings page: two rows, an inset one, one behind a later `v-if`, and a real `SettingItem`. */
const Page = defineComponent({
	setup() {
		highlight = useSettingsRowHighlight()
		const row = (id: string, inset = false) =>
			withDirectives(h("div", { "data-testid": id }), [[highlight.vSettingsRow, id, undefined, inset ? { inset: true } : {}]])
		return () =>
			h("div", [
				row("a"),
				row("b"),
				row("boxed", true),
				shown.value ? row("toggled") : null,
				late.value ? row("late") : null,
				withDirectives(h(SettingItem, { title: "Item", value: value.value, "data-testid": "item" }), [
					[highlight.vSettingsRow, "item"],
				]),
			])
	},
})

let wrapper: VueWrapper | undefined
afterEach(() => {
	wrapper?.unmount()
	shown.value = true
	late.value = false
	value.value = "Off"
	vi.restoreAllMocks()
})

async function open(url: string, guard?: Parameters<ReturnType<typeof createRouter>["beforeEach"]>[0]) {
	const routes: RouteRecordRaw[] = [{ path: "/:path(.*)*", component: { render: () => null }, meta: { isAuthRequired: true } }]
	const router = createRouter({ history: createMemoryHistory(), routes })
	if (guard) router.beforeEach(guard)
	await router.push(url)
	const replace = vi.spyOn(router, "replace")
	const scrolled: Element[] = []
	vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element, arg) {
		expect(arg).toEqual({ block: "center" })
		scrolled.push(this)
	})
	wrapper = mount(Page, { attachTo: document.body, global: { plugins: [router], components: { Flex, Text, Icon } } })
	await flushPromises()
	const el = (id: string) => wrapper?.get(`[data-testid="${id}"]`).element as HTMLElement
	return { router, replace, scrolled, el }
}

describe("useSettingsRowHighlight", () => {
	test("the row the query names is outlined and scrolled to the centre; its sibling is only marked", async () => {
		const { scrolled, el } = await open(`${PAGE}?row=a`)
		expect(el("a").dataset.highlighted).toBe("")
		expect(el("b").dataset).toMatchObject({ settingsRow: "b" })
		expect(el("b").hasAttribute("data-highlighted")).toBe(false)
		expect(scrolled).toEqual([el("a")])
	})

	test("an inset row is outlined inset", async () => {
		const { el } = await open(`${PAGE}?row=boxed`)
		expect(el("boxed").dataset.highlighted).toBe("inset")
	})

	test("the query is dropped from the URL at once, so it is read once", async () => {
		const { router, replace } = await open(`${PAGE}?row=a`)
		expect(replace).toHaveBeenCalledExactlyOnceWith({ path: PAGE })
		expect(router.currentRoute.value.fullPath).toBe(PAGE)
	})

	test("an unknown id outlines nothing, and the query is still dropped", async () => {
		const { router, scrolled } = await open(`${PAGE}?row=nope`)
		expect(document.querySelectorAll("[data-highlighted]")).toHaveLength(0)
		expect(scrolled).toEqual([])
		expect(router.currentRoute.value.fullPath).toBe(PAGE)
	})

	test("no query: nothing outlined and no replace", async () => {
		const { replace } = await open(PAGE)
		expect(replace).not.toHaveBeenCalled()
		expect(document.querySelectorAll("[data-highlighted]")).toHaveLength(0)
		expect(document.querySelectorAll("[data-settings-row]")).toHaveLength(5)
	})

	test("a repeated query is no id: nothing outlined, and it is dropped", async () => {
		const { router } = await open(`${PAGE}?row=a&row=a`)
		expect(document.querySelectorAll("[data-highlighted]")).toHaveLength(0)
		expect(router.currentRoute.value.fullPath).toBe(PAGE)
	})

	test("a row that mounts later, behind a v-if, is outlined when it arrives", async () => {
		const { el } = await open(`${PAGE}?row=late`)
		late.value = true
		await nextTick()
		expect(el("late").dataset.highlighted).toBe("")
	})

	test("the target is spent on the first match: the same row mounting again is not outlined", async () => {
		const { el, scrolled } = await open(`${PAGE}?row=toggled`)
		expect(el("toggled").dataset.highlighted).toBe("")
		shown.value = false
		await nextTick()
		shown.value = true
		await nextTick()
		expect(el("toggled").hasAttribute("data-highlighted")).toBe(false)
		expect(scrolled).toHaveLength(1)
	})

	test("a query that arrives on a page already open outlines the row that mounts next", async () => {
		const { router, el } = await open(PAGE)
		await router.push(`${PAGE}?row=late`)
		await flushPromises()
		expect(router.currentRoute.value.fullPath).toBe(PAGE)
		late.value = true
		await nextTick()
		expect(el("late").dataset.highlighted).toBe("")
	})

	test("the outline survives a SettingItem re-render that changes its value", async () => {
		const { el } = await open(`${PAGE}?row=item`)
		expect(el("item").dataset).toMatchObject({ settingsRow: "item", highlighted: "" })
		value.value = "On"
		await nextTick()
		expect(el("item").textContent).toContain("On")
		expect(el("item").dataset).toMatchObject({ settingsRow: "item", highlighted: "" })
	})

	test("the replace passes the popup's route guard for a signed-in profile", async () => {
		const store = { isRegistered: true, isLogined: true, isSessionChecked: true, profile: { id: "p1", type: "password" } }
		const grace = { ready: vi.fn(async () => true), markProvisional: vi.fn(), settle: vi.fn(), replay: vi.fn() }
		const api = { getActiveProfile: vi.fn(), getProfiles: vi.fn() }
		const guard = vi.fn(
			createPopupGuard(
				() => store as never,
				() => api,
				grace as never,
			),
		)
		const { router, el } = await open(`${PAGE}?row=a`, guard)
		expect(guard).toHaveBeenCalledTimes(2)
		expect(router.currentRoute.value.fullPath).toBe(PAGE)
		expect(el("a").dataset.highlighted).toBe("")
		expect(api.getActiveProfile).not.toHaveBeenCalled()
	})
})
