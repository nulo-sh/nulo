/**
 * Combined tests for the Settings family — ItemsContainer, SettingItem,
 * SettingField. Each component gets ≥5 cases.
 */
import { describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { h } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"
import { RowAction } from "@nulo/design"

import ItemsContainer from "./ItemsContainer.vue"
import SettingItem from "./SettingItem.vue"
import SettingField from "./SettingField.vue"

const STUBS = {
	Flex: { template: '<div :class="$attrs.class" v-bind="$attrs"><slot /></div>', inheritAttrs: false },
	Text: { template: '<span :class="$attrs.class" v-bind="$attrs"><slot /></span>', inheritAttrs: false },
	Icon: {
		template: '<span data-testid="stub-icon" :data-name="name" :data-size="size" :data-color="color" />',
		props: ["name", "size", "color"],
	},
	Spinner: { template: '<span data-testid="stub-spinner" />' },
	RouterLink: { template: '<a :href="to"><slot /></a>', props: ["to"] },
}

describe("ui/Settings — ItemsContainer", () => {
	test("renders default slot content", () => {
		const w = mount(ItemsContainer, { slots: { default: "<div>child</div>" }, global: { stubs: STUBS } })
		expect(w.text()).toContain("child")
	})

	test("title prop renders above the slot", () => {
		const w = mount(ItemsContainer, {
			props: { title: "Profile" },
			slots: { default: "<div />" },
			global: { stubs: STUBS },
		})
		expect(w.text()).toContain("Profile")
	})

	test("description prop renders below the slot", () => {
		const w = mount(ItemsContainer, {
			props: { description: "Hint text" },
			slots: { default: "<div />" },
			global: { stubs: STUBS },
		})
		expect(w.text()).toContain("Hint text")
	})

	test("flat=true applies the wrapper_flat class (no background/border)", () => {
		const w = mount(ItemsContainer, {
			props: { flat: true },
			slots: { default: "<div />" },
			global: { stubs: STUBS },
		})
		expect(w.html()).toMatch(/wrapper_flat/)
	})

	test("flat=false (default) does NOT apply the wrapper_flat class", () => {
		const w = mount(ItemsContainer, { slots: { default: "<div />" }, global: { stubs: STUBS } })
		expect(w.html()).not.toMatch(/wrapper_flat/)
	})

	test("danger fences the rows in red and leaves the title's class alone; absent, no fence", () => {
		const fenced = mount(ItemsContainer, {
			props: { title: "Danger zone", danger: true },
			slots: { default: '<div data-testid="row" />' },
			global: { stubs: STUBS },
		})
		const fence = fenced.get('[data-testid="row"]').element.parentElement as HTMLElement
		expect(fence.className).toMatch(/wrapper_danger/)
		const title = fenced.get("span")
		expect(title.text()).toBe("Danger zone")
		expect(title.classes()).toHaveLength(1)
		expect(title.classes()[0]).toMatch(/title/)

		const plain = mount(ItemsContainer, { props: { title: "Help" }, slots: { default: "<div />" }, global: { stubs: STUBS } })
		expect(plain.html()).not.toMatch(/wrapper_danger/)
	})
})

describe("ui/Settings — SettingItem", () => {
	const { RouterLink: _link, ...ROW_STUBS } = STUBS
	const makeRouter = () =>
		createRouter({ history: createMemoryHistory(), routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }] })
	const space = (shiftKey = false) => new KeyboardEvent("keydown", { key: " ", shiftKey, bubbles: true, cancelable: true })
	const enter = () => new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })

	async function mountItem(props: Record<string, unknown>, attrs: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
		const router = makeRouter()
		await router.push("/start")
		const push = vi.spyOn(router, "push")
		const w = mount(SettingItem, { props, attrs, slots, global: { stubs: ROW_STUBS, plugins: [router] }, attachTo: document.body })
		return { w, router, push }
	}

	test("renders title and description", async () => {
		const { w } = await mountItem({ title: "Account", description: "subline" })
		expect(w.text()).toContain("Account")
		expect(w.text()).toContain("subline")
		w.unmount()
	})

	test("link mode: an anchor root with the route's href, no tabindex; a click and Space each navigate once, Shift+Space not at all", async () => {
		const { w, router, push } = await mountItem({ title: "X", to: "/popup/general" }, { "data-testid": "row" })
		expect(w.element.tagName).toBe("A")
		expect(w.attributes("href")).toBe("/popup/general")
		expect(w.attributes("data-testid")).toBe("row")
		expect(w.attributes("tabindex")).toBeUndefined()
		expect(w.find("[data-row-target]").exists()).toBe(false)

		await w.trigger("click")
		await flushPromises()
		expect(push).toHaveBeenCalledTimes(1)
		expect(router.currentRoute.value.path).toBe("/popup/general")

		await router.push("/start")
		push.mockClear()
		const plain = space()
		w.element.dispatchEvent(plain)
		await flushPromises()
		expect(plain.defaultPrevented).toBe(true)
		expect(push).toHaveBeenCalledTimes(1)

		push.mockClear()
		const shifted = space(true)
		w.element.dispatchEvent(shifted)
		await flushPromises()
		expect(shifted.defaultPrevented).toBe(false)
		expect(push).not.toHaveBeenCalled()
		w.unmount()
	})

	test("external mode: a new-tab anchor; a bare Space presses it once and prevents the scroll, a modified Space does neither", async () => {
		const { w } = await mountItem({ title: "X", to: "https://example.com", external: true })
		expect(w.element.tagName).toBe("A")
		expect(w.attributes("target")).toBe("_blank")
		expect(w.attributes("rel")).toBe("noopener noreferrer")
		expect(w.attributes("href")).toBe("https://example.com")
		expect(w.attributes("tabindex")).toBeUndefined()
		const click = vi.spyOn(w.element as HTMLAnchorElement, "click").mockImplementation(() => {})

		const plain = space()
		w.element.dispatchEvent(plain)
		expect(click).toHaveBeenCalledTimes(1)
		expect(plain.defaultPrevented).toBe(true)

		const shifted = space(true)
		w.element.dispatchEvent(shifted)
		expect(click).toHaveBeenCalledTimes(1)
		expect(shifted.defaultPrevented).toBe(false)
		w.unmount()
	})

	test("click mode: a div root holding a button target named by the title; the target's press runs the handler once", async () => {
		const onClick = vi.fn()
		const { w } = await mountItem({ title: "Manage" }, { onClick })
		expect(w.element.tagName).toBe("DIV")
		expect(w.attributes("tabindex")).toBeUndefined()
		const target = w.find("[data-row-target]")
		expect(target.element.tagName).toBe("BUTTON")
		expect(w.find(`#${target.attributes("aria-labelledby")}`).text()).toBe("Manage")
		expect(w.html()).toMatch(/interactive/)

		await target.trigger("click")
		expect(onClick).toHaveBeenCalledTimes(1)
		w.unmount()
	})

	test("click mode with a nested RowAction: the action fires and the row handler does not", async () => {
		const onClick = vi.fn()
		const onCopy = vi.fn()
		const { w } = await mountItem(
			{ title: "Alice" },
			{ onClick },
			{ right: () => h(RowAction, { label: "Copy account address", "data-testid": "copy", onClick: onCopy }, () => "c") },
		)
		const action = w.find('[data-testid="copy"]')
		expect(action.element.tagName).toBe("BUTTON")
		expect(w.find("[data-row-target]").find('[data-testid="copy"]').exists()).toBe(false)
		await action.trigger("click")
		expect(onCopy).toHaveBeenCalledTimes(1)
		expect(onClick).not.toHaveBeenCalled()
		w.unmount()
	})

	/** A CSS module class's local name, without the test build's `_name_hash` decoration. */
	const localNames = (classes: string[]) => classes.map((name) => name.replace(/^_(.+)_[0-9a-z]+$/i, "$1")).sort()

	test("link mode without controls keeps its shape: the root is the link with the row's classes and attributes, its first child the row body", async () => {
		const { w } = await mountItem({ title: "X", to: "/popup/general" }, { "data-testid": "row", class: "extra" })
		expect(w.element.tagName).toBe("A")
		expect(w.attributes("href")).toBe("/popup/general")
		expect(w.attributes("data-testid")).toBe("row")
		expect(localNames(w.classes())).toEqual(["extra", "interactive", "medium", "wrapper"])
		expect(w.element.firstElementChild?.matches("[data-row-target]")).toBe(false)
		expect(localNames([...(w.element.firstElementChild?.classList ?? [])])).toEqual(["main"])
		w.unmount()
	})

	test("link mode with controls: a div root keeps the class and style; the stretched link alone carries the other attributes and the title's name; a control beside it presses once and never navigates", async () => {
		const onPress = vi.fn()
		const { w, router, push } = await mountItem(
			{ title: "Testnet", to: "/popup/settings/networks/tn", controls: true },
			{ "data-testid": "row", "data-network-id": "tn", class: "extra", style: "color: red" },
			// No stopPropagation, unlike RowAction: a press that bubbles must still not navigate.
			{ right: () => h("button", { type: "button", "data-testid": "control", onClick: onPress }, "Switch") },
		)
		expect(w.element.tagName).toBe("DIV")
		expect(w.classes()).toContain("extra")
		expect(w.attributes("style")).toBe("color: red;")
		expect(document.querySelectorAll('[data-testid="row"]')).toHaveLength(1)
		const link = w.get("[data-row-target]")
		expect(link.element.tagName).toBe("A")
		expect(link.attributes()).toMatchObject({ "data-testid": "row", "data-network-id": "tn", href: "/popup/settings/networks/tn" })
		expect(link.classes()).not.toContain("extra")
		expect(link.attributes("style")).toBeUndefined()
		expect(w.find(`#${link.attributes("aria-labelledby")}`).text()).toBe("Testnet")

		const control = w.get('[data-testid="control"]')
		expect(link.element.contains(control.element)).toBe(false)
		expect(link.element.compareDocumentPosition(control.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
		await control.trigger("click")
		await flushPromises()
		expect(onPress).toHaveBeenCalledTimes(1)
		expect(push).not.toHaveBeenCalled()

		await link.trigger("click")
		await flushPromises()
		expect(push).toHaveBeenCalledTimes(1)
		expect(router.currentRoute.value.path).toBe("/popup/settings/networks/tn")

		await router.push("/start")
		push.mockClear()
		link.element.dispatchEvent(space())
		await flushPromises()
		expect(push).toHaveBeenCalledTimes(1)
		w.unmount()
	})

	test("inert mode: no target, no tabindex, no pointer class", async () => {
		const { w } = await mountItem({ title: "Version", raw: true })
		expect(w.element.tagName).toBe("DIV")
		expect(w.find("[data-row-target]").exists()).toBe(false)
		expect(w.find("[tabindex]").exists()).toBe(false)
		expect(w.html()).not.toMatch(/interactive/)
		w.unmount()
	})

	test.each([
		["to", { to: "/popup/x" }, {}],
		["@click", {}, { onClick: vi.fn() }],
	])(
		"a disabled row with %s is inert: no a, button, target or tabindex, and Enter neither navigates nor calls the handler",
		async (_name, props, attrs) => {
			const { w, push } = await mountItem({ title: "X", disabled: true, ...props }, attrs)
			expect(w.element.tagName).toBe("DIV")
			expect(w.html()).toMatch(/disabled/)
			expect(w.find("a, button, [data-row-target], [tabindex]").exists()).toBe(false)
			expect(w.attributes("href")).toBeUndefined()

			w.element.dispatchEvent(enter())
			await w.trigger("click")
			await flushPromises()
			expect(push).not.toHaveBeenCalled()
			if ("onClick" in attrs) expect(attrs.onClick).not.toHaveBeenCalled()
			w.unmount()
		},
	)

	test("size=small applies the small class", async () => {
		const { w } = await mountItem({ title: "X", size: "small" })
		expect(w.html()).toMatch(/small/)
		w.unmount()
	})

	test("loading + icon shows a Spinner (instead of the icon)", async () => {
		const { w } = await mountItem({ title: "X", icon: "user", loading: true })
		expect(w.find('[data-testid="stub-spinner"]').exists()).toBe(true)
		w.unmount()
	})

	test("trailingIcon draws its glyph where the chevron sits, after the title, 18 px secondary, and no chevron", async () => {
		const { w } = await mountItem({ title: "Name", trailingIcon: "edit" }, { onClick: vi.fn() })
		const icons = w.findAll('[data-testid="stub-icon"]')
		expect(icons.map((icon) => [icon.attributes("data-name"), icon.attributes("data-size"), icon.attributes("data-color")])).toEqual([
			["edit", "18", "secondary"],
		])
		const title = w.get('[data-testid="setting-title"]')
		expect(title.element.compareDocumentPosition(icons[0].element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
		w.unmount()
	})

	test.each([
		["a link", { to: "/popup/settings/lock" }, ["chevron"]],
		["an explicit chevron", { chevron: true }, ["chevron"]],
		["an external link", { to: "https://example.com", external: true }, ["open"]],
		["a plain row", {}, []],
	])("without trailingIcon, %s keeps its trailing glyph", async (_case, props, names) => {
		const { w } = await mountItem({ title: "X", ...props })
		expect(w.findAll('[data-testid="stub-icon"]').map((icon) => icon.attributes("data-name"))).toEqual(names)
		w.unmount()
	})

	test("value renders in setting-value, before the default chevron", async () => {
		const { w } = await mountItem({ title: "Lock", to: "/popup/settings/lock", value: "1 h 30 min" })
		const value = w.get('[data-testid="setting-value"]')
		expect(value.text()).toBe("1 h 30 min")
		const chevron = w.get('[data-name="chevron"]')
		expect(value.element.compareDocumentPosition(chevron.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
		w.unmount()
	})

	test.each([
		["absent", {}],
		["empty", { value: "" }],
	])("value %s: no setting-value element, and the row renders as before", async (_name, props) => {
		const { w } = await mountItem({ title: "Lock", to: "/popup/settings/lock", ...props })
		expect(w.find('[data-testid="setting-value"]').exists()).toBe(false)
		expect(w.find('[data-name="chevron"]').exists()).toBe(true)
		w.unmount()
	})

	test.each([
		["default", {}, "row-title", true],
		["name", { titleVariant: "name" }, "name", true],
		["meta", { titleVariant: "meta" }, "meta", false],
	])("titleVariant %s: the title carries its role, and the row's 14px only with a site-sized one", async (_name, props, role, sized) => {
		const { w } = await mountItem({ title: "Alice", ...props })
		const title = w.get('[data-testid="setting-title"]')
		expect(title.attributes("variant")).toBe(role)
		expect(title.text()).toBe("Alice")
		expect(title.classes().some((name) => /title_size/.test(name))).toBe(sized)
		w.unmount()
	})

	test.each([
		["default", {}, "caption"],
		["meta", { descriptionVariant: "meta" }, "meta"],
	])("descriptionVariant %s: the description carries its role", async (_name, props, role) => {
		const { w } = await mountItem({ title: "Alice", description: "0x12...cdef", ...props })
		expect(w.get('[data-testid="setting-description"]').attributes("variant")).toBe(role)
		w.unmount()
	})

	test("the trailing value carries value", async () => {
		const { w } = await mountItem({ title: "Lock", value: "1 h" })
		expect(w.get('[data-testid="setting-value"]').attributes("variant")).toBe("value")
		w.unmount()
	})

	test("the variant validators accept only their roles", () => {
		const { titleVariant, descriptionVariant } = SettingItem.props as Record<string, { validator: (value: string) => boolean }>
		expect(["row-title", "name", "meta"].every(titleVariant.validator)).toBe(true)
		expect(["caption", "data"].some(titleVariant.validator)).toBe(false)
		expect(["caption", "meta"].every(descriptionVariant.validator)).toBe(true)
		expect(["name", "data"].some(descriptionVariant.validator)).toBe(false)
	})

	test("icon box: a prop or #dot icon keeps the fixed 20x20 box; only a filled #icon gets the relaxed one", async () => {
		const iconBoxOf = (w: Awaited<ReturnType<typeof mountItem>>["w"], selector: string) =>
			(w.get(selector).element.parentElement as HTMLElement).className

		const prop = await mountItem({ title: "Display", icon: "user" })
		expect(iconBoxOf(prop.w, '[data-name="user"]')).toMatch(/icon_wrapper/)
		expect(iconBoxOf(prop.w, '[data-name="user"]')).not.toMatch(/icon_slotted/)
		prop.w.unmount()

		const dot = await mountItem({ title: "Alpha" }, {}, { dot: () => h("i", { "data-testid": "dot" }) })
		expect(iconBoxOf(dot.w, '[data-testid="dot"]')).not.toMatch(/icon_slotted/)
		dot.w.unmount()

		const slotted = await mountItem({ title: "Primary" }, {}, { icon: () => h("i", { "data-testid": "avatar" }) })
		expect(iconBoxOf(slotted.w, '[data-testid="avatar"]')).toMatch(/icon_wrapper/)
		expect(iconBoxOf(slotted.w, '[data-testid="avatar"]')).toMatch(/icon_slotted/)
		slotted.w.unmount()
	})
})

describe("ui/Settings — SettingField", () => {
	test("renders label and value props", () => {
		const w = mount(SettingField, {
			props: { label: "Network", value: "Testnet" },
			global: { stubs: STUBS },
		})
		expect(w.text()).toContain("Network")
		expect(w.text()).toContain("Testnet")
	})

	test("icon prop renders an Icon stub", () => {
		const w = mount(SettingField, {
			props: { label: "X", value: "Y", icon: "chevron" },
			global: { stubs: STUBS },
		})
		expect(w.find('[data-name="chevron"]').exists()).toBe(true)
	})

	test("no icon prop → no Icon stub", () => {
		const w = mount(SettingField, {
			props: { label: "X", value: "Y" },
			global: { stubs: STUBS },
		})
		expect(w.find('[data-testid="stub-icon"]').exists()).toBe(false)
	})

	test("disabled prop applies the disabled class", () => {
		const w = mount(SettingField, {
			props: { label: "X", value: "Y", disabled: true },
			global: { stubs: STUBS },
		})
		expect(w.html()).toMatch(/disabled/)
	})

	test("the key carries label-section and the value name, sized by its own class", () => {
		const w = mount(SettingField, {
			props: { label: "Name", value: "Alice" },
			global: { stubs: STUBS },
		})
		const [key, value] = w.findAll("span")
		expect(key.attributes("variant")).toBe("label-section")
		expect(value.attributes("variant")).toBe("name")
		expect(value.classes().some((name) => /value_size/.test(name))).toBe(true)
	})

	test("non-disabled has no disabled class", () => {
		const w = mount(SettingField, {
			props: { label: "X", value: "Y" },
			global: { stubs: STUBS },
		})
		expect(w.html()).not.toMatch(/disabled/)
	})
})
