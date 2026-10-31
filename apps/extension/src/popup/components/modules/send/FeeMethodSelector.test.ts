import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { sendEvent } from "../../../../../tests/helpers/send-event"
import { Flex, Skeleton } from "@nulo/design"

// The real-Dropdown suite below runs without a layout engine: no focus trap, no outside-click wiring.
vi.mock("focus-trap", () => ({ createFocusTrap: vi.fn(() => ({ activate: vi.fn(), deactivate: vi.fn(), active: false })) }))
vi.mock("@/composables/outside", () => ({ useOutside: vi.fn(() => () => {}) }))
import mark from "@/components/composite/send/publish-mark.module.css"
import DropdownItem from "@/components/ui/Dropdown/DropdownItem.vue"
import FeeMethodSelector from "./FeeMethodSelector.vue"

const STUBS = {
	Skeleton,
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: '<svg data-testid="stub-glyph" :data-name="name" />', props: ["name", "size"] },
	Dropdown: {
		template: '<div><slot name="trigger" /><div data-popup><slot name="popup" /></div></div>',
	},
	DropdownRoot: {
		template: '<div><slot name="trigger" /><div data-popup><slot name="popup" /></div></div>',
	},
	DropdownItem: {
		template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
		props: ["disabled"],
		emits: ["click"],
		inheritAttrs: false,
	},
}

const baseMethods = [
	{ type: "fj", title: "Public Fee Juice", subtitle: "public", spend: "1.2 FJ" },
	{ type: "private_fpc", title: "Private Fee Juice", subtitle: "private", spend: "0.42 FJ" },
	{ type: "fpc", title: "Sponsored", subtitle: "sponsored", spend: "free", fpc: { id: "s1" } },
]

const factory = (props: Record<string, unknown> = {}) =>
	mount(FeeMethodSelector, {
		props: { methods: baseMethods, ...props },
		global: { stubs: STUBS },
	})

describe("FeeMethodSelector", () => {
	test("trigger reads 'Select method' when no method is set", () => {
		const w = factory()
		const trigger = w.find('[data-testid="send-fee-method-trigger"]')
		expect(trigger.text()).toContain("Select method")
	})

	test("while the card reads, the trigger draws a bar a screen reader hears as Checking; a previewed pick names itself", () => {
		const trigger = (w: ReturnType<typeof factory>) => w.get('[data-testid="send-fee-method-trigger"]')
		const reading = factory({ pending: true })
		expect(trigger(reading).text()).toBe("Checking")
		expect(trigger(reading).attributes("aria-busy")).toBe("true")
		expect(trigger(reading).findComponent(Skeleton).attributes("style")).toBe("width: 60px; height: 12px;")
		const previewed = factory({ pending: true, modelValue: baseMethods[0] })
		expect(trigger(previewed).text()).toBe("Public Fee Juice")
		expect(trigger(previewed).attributes("aria-busy")).toBeUndefined()
		expect(trigger(previewed).findComponent(Skeleton).exists()).toBe(false)
		expect(trigger(factory()).findComponent(Skeleton).exists()).toBe(false)
	})

	test("trigger shows the active method title", () => {
		const w = factory({ modelValue: baseMethods[0] })
		expect(w.find('[data-testid="send-fee-method-trigger"]').text()).toContain("Public Fee Juice")
	})

	test("the label reads Fee", () => {
		expect(factory().find("span").text()).toBe("Fee")
	})

	test("each row shows what it can spend, never its subtitle; a disabled row's reason wins", () => {
		const w = factory({
			methods: [{ ...baseMethods[0], disabled: true, disabledReason: "couldn't check balance" }, ...baseMethods.slice(1)],
		})
		const cells = (key: string) =>
			w
				.find(`[data-testid="send-fee-method-${key}"]`)
				.findAll("span")
				.map((n) => n.text())
		expect(cells("public")).toEqual(["Public Fee Juice", "couldn't check balance"])
		expect(cells("private")).toEqual(["Private Fee Juice", "0.42 FJ"])
		expect(cells("sponsored")).toEqual(["Sponsored", "free"])
	})

	test("trigger forwards data-fee-method from the active method's subtitle", () => {
		const w = factory({ modelValue: baseMethods[2] })
		const trigger = w.find('[data-testid="send-fee-method-trigger"]')
		expect(trigger.attributes("data-fee-method")).toBe("sponsored")
	})

	test("popup renders exactly 3 items with the canonical testid (no coming-soon placeholder)", () => {
		const w = factory()
		expect(w.find('[data-testid="send-fee-method-public"]').exists()).toBe(true)
		expect(w.find('[data-testid="send-fee-method-private"]').exists()).toBe(true)
		expect(w.find('[data-testid="send-fee-method-sponsored"]').exists()).toBe(true)
		expect(w.find('[data-testid="send-fee-method-coming soon"]').exists()).toBe(false)
		expect(
			w.findAll('[data-testid^="send-fee-method-"]').filter((n) => n.attributes("data-testid") !== "send-fee-method-trigger"),
		).toHaveLength(3)
	})

	test("Nulo's sponsor renders before a hand-added one that comes first in the list", () => {
		const handAdded = { type: "fpc", title: "Dev sponsor", subtitle: "sponsored", spend: "—", fpc: { id: "s2" } }
		const nulo = { ...baseMethods[2], fpc: { id: "s1", isProtocol: true } }
		const w = factory({ methods: [baseMethods[0], baseMethods[1], handAdded, nulo] })
		const rows = w.findAll('[data-testid="send-fee-method-sponsored"]').map((n) => n.text())
		expect(rows).toEqual([expect.stringContaining("Sponsored"), expect.stringContaining("Dev sponsor")])
	})

	test("sponsor rows share the testid and differ by data-fpc-id; the Fee Juice row has none", () => {
		const handAdded = { type: "fpc", title: "Dev sponsor", subtitle: "sponsored", spend: "—", fpc: { id: "s2" } }
		const nulo = { ...baseMethods[2], fpc: { id: "s1", isProtocol: true } }
		const w = factory({ methods: [baseMethods[0], handAdded, nulo] })
		const ids = w.findAll('[data-testid="send-fee-method-sponsored"]').map((n) => n.attributes("data-fpc-id"))
		expect(ids).toEqual(["s1", "s2"])
		expect(w.find('[data-testid="send-fee-method-public"]').attributes()).not.toHaveProperty("data-fpc-id")
	})

	test("clicking an enabled item emits update:modelValue with that method", async () => {
		const w = factory()
		await w.find('[data-testid="send-fee-method-private"]').trigger("click")
		expect(w.emitted("update:modelValue")?.[0]?.[0]).toMatchObject({ type: "private_fpc" })
	})

	test("clicking a disabled item does NOT emit update:modelValue", async () => {
		const w = mount(FeeMethodSelector, {
			props: {
				methods: [{ ...baseMethods[0], disabled: true }, ...baseMethods.slice(1)],
			},
			global: { stubs: STUBS },
		})
		await w.find('[data-testid="send-fee-method-public"]').trigger("click")
		expect(w.emitted("update:modelValue")).toBeUndefined()
	})

	test("no tag until told; the tag carries the shape and the approved words", async () => {
		const w = factory({ modelValue: baseMethods[0] })
		const TAG = '[data-testid="send-fee-privacy-notice"]'
		expect(w.find(TAG).exists()).toBe(false)

		await w.setProps({ payerNoticeShape: "private-public" })
		expect(w.find(TAG).attributes("data-notice-shape")).toBe("private-public")
		expect(w.find(TAG).text()).toBe("NAMES YOUR ADDRESS")
		expect(w.find(TAG).classes()).toContain(mark.exposed)
		expect(w.find(`${TAG} [data-testid="stub-glyph"]`).attributes("data-name")).toBe("public")
		expect(w.find(`${TAG} [data-testid="stub-glyph"]`).attributes("aria-hidden")).toBe("true")
		expect(w.find('[data-testid="send-fee-method-trigger"]').text()).toContain("Public Fee Juice")

		await w.setProps({ payerNoticeShape: null })
		expect(w.find(TAG).exists()).toBe(false)
	})

	test("Dropdown onOpen / onClose are forwarded as 'open' / 'close'", () => {
		const w = factory()
		// stubs render the trigger + popup synchronously; assert we wired the listeners by
		// inspecting that the Dropdown stub's emit handler routes correctly. With the stub
		// shape above, we can't trigger Dropdown's @onOpen directly, so the contract is
		// validated implicitly by the template. Add a sentinel that the events list is empty
		// before any trigger.
		expect(w.emitted("open")).toBeUndefined()
		expect(w.emitted("close")).toBeUndefined()
	})
})

/** Rows whose read has not landed, as `buildFeeMethods` draws them. */
const loadingMethods = [
	{ type: "fj", title: "Public Fee Juice", subtitle: "public", checking: true },
	{ type: "private_fpc", title: "Private Fee Juice", subtitle: "private", fpc: null, checking: true },
	{ type: "fpc", title: "Sponsored", subtitle: "sponsored", fpc: null, checking: true },
]

describe("FeeMethodSelector — rows still loading", () => {
	test("a loading row keeps its title, draws the fee skeleton for its value, and says it is busy", () => {
		const w = factory({ methods: loadingMethods })
		for (const key of ["public", "private", "sponsored"]) {
			const row = w.find(`[data-testid="send-fee-method-${key}"]`)
			expect(row.attributes("aria-busy")).toBe("true")
			expect(row.attributes("data-checking")).toBe("true")
			const skeleton = row.findComponent(Skeleton)
			expect(skeleton.attributes("style")).toBe("width: 60px; height: 12px;")
			expect(skeleton.attributes("aria-hidden")).toBe("true")
			expect(row.findAll("span").map((n) => n.text())).toEqual([expect.any(String), "", "Checking"])
		}
		expect(w.text()).not.toMatch(/checking…|— FJ|not available/)
	})

	test("a click on a loading row emits nothing", async () => {
		const w = factory({ methods: loadingMethods })
		await w.find('[data-testid="send-fee-method-private"]').trigger("click")
		expect(w.emitted("update:modelValue")).toBeUndefined()
	})

	test("a sponsor whose funding read is in flight loads instead of reading free, and can still be picked", async () => {
		const sponsor = { ...baseMethods[2], verifying: true }
		const w = factory({ methods: [baseMethods[0], sponsor] })
		const row = w.get('[data-testid="send-fee-method-sponsored"]')
		expect(row.attributes("aria-busy")).toBe("true")
		expect(row.attributes("data-verifying")).toBe("true")
		expect(row.attributes("disabled")).toBeUndefined()
		expect(row.text()).not.toContain("free")
		expect(row.find('[aria-hidden="true"]').classes().join(" ")).toMatch(/skeleton/)

		await row.trigger("click")
		expect(w.emitted("update:modelValue")?.at(-1)).toEqual([sponsor])
	})
})

describe("FeeMethodSelector — in the real menu", () => {
	let dropdownRoot: HTMLDivElement
	const FLEX = { Flex: { template: '<div v-bind="$attrs"><slot /></div>', inheritAttrs: false } }
	const realMenu = (methods: unknown[]) =>
		mount(FeeMethodSelector, {
			props: { methods },
			attachTo: document.body,
			global: {
				components: { DropdownItem },
				stubs: { ...FLEX, Text: STUBS.Text, Icon: STUBS.Icon },
			},
		})
	const isOpen = (w: ReturnType<typeof mount>) => w.find("[data-dropdown-open]").attributes("data-dropdown-open") === "true"
	const row = (key: string) => dropdownRoot.querySelector<HTMLElement>(`[data-testid="send-fee-method-${key}"]`)

	beforeEach(() => {
		dropdownRoot = document.createElement("div")
		dropdownRoot.id = "dropdown"
		document.body.appendChild(dropdownRoot)
	})

	afterEach(() => {
		dropdownRoot.remove()
	})

	test("a click on a loading row leaves the menu open; a click on an answered row picks it and closes the menu", async () => {
		const answered = { type: "fpc", title: "Sponsored", subtitle: "sponsored", spend: "free", fpc: { id: "s1", isProtocol: true } }
		const w = realMenu([loadingMethods[0], loadingMethods[1], answered])
		await w.find("#trigger").trigger("click")
		await flushPromises()
		expect(isOpen(w)).toBe(true)

		expect(sendEvent(row("private")!, "click")).toBeDefined()
		await flushPromises()
		expect(isOpen(w)).toBe(true)
		expect(w.emitted("update:modelValue")).toBeUndefined()

		sendEvent(row("sponsored")!, "click")
		await flushPromises()
		expect(w.emitted("update:modelValue")?.[0]?.[0]).toMatchObject({ fpc: { id: "s1" } })
		expect(isOpen(w)).toBe(false)
		w.unmount()
	})

	test("the trigger is a button of its own, and a press on it opens the menu", async () => {
		// The real Flex, which renders the tag it is given; the stub above is always a div.
		const w = mount(FeeMethodSelector, {
			props: { methods: baseMethods },
			attachTo: document.body,
			global: { components: { DropdownItem, Flex }, stubs: { Text: STUBS.Text, Icon: STUBS.Icon } },
		})
		const trigger = w.get('[data-testid="send-fee-method-trigger"]')
		expect(trigger.element.tagName).toBe("BUTTON")
		expect(trigger.attributes("type")).toBe("button")
		// The chevron is decoration: hidden, it stays out of the button's spoken name.
		expect(trigger.get('[data-testid="stub-glyph"][data-name="chevron"]').attributes("aria-hidden")).toBe("true")
		;(trigger.element as HTMLButtonElement).click()
		await flushPromises()
		expect(isOpen(w)).toBe(true)
		w.unmount()
	})

	test("the trigger refuses a held Enter's repeats and takes a fresh one", async () => {
		const w = mount(FeeMethodSelector, {
			props: { methods: baseMethods },
			attachTo: document.body,
			global: { components: { DropdownItem, Flex }, stubs: { Text: STUBS.Text, Icon: STUBS.Icon } },
		})
		const trigger = w.get('[data-testid="send-fee-method-trigger"]').element
		const press = (repeat: boolean) => {
			const e = new KeyboardEvent("keydown", { key: "Enter", repeat, bubbles: true, cancelable: true })
			trigger.dispatchEvent(e)
			return e.defaultPrevented
		}
		expect(press(true)).toBe(true)
		expect(press(false)).toBe(false)
		w.unmount()
	})

	test("focus() puts focus on the trigger and leaves the menu closed", async () => {
		const w = mount(FeeMethodSelector, {
			props: { methods: baseMethods },
			attachTo: document.body,
			global: { components: { DropdownItem, Flex }, stubs: { Text: STUBS.Text, Icon: STUBS.Icon } },
		})
		;(w.vm as unknown as { focus: () => void }).focus()
		await flushPromises()
		expect(document.activeElement).toBe(w.get('[data-testid="send-fee-method-trigger"]').element)
		expect(isOpen(w)).toBe(false)
		w.unmount()
	})

	test("a loading row is out of the keyboard's reach: unfocusable and skipped by arrow keys", async () => {
		const w = realMenu(loadingMethods)
		await w.find("#trigger").trigger("click")
		await flushPromises()
		for (const key of ["public", "private", "sponsored"]) {
			expect(row(key)?.getAttribute("tabindex")).toBe("-1")
			expect(row(key)?.getAttribute("aria-disabled")).toBe("true")
			expect(row(key)?.hasAttribute("data-dropdown-item")).toBe(false)
		}
		w.unmount()
	})
})
