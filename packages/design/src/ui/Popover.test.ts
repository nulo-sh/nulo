import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { type Component, defineComponent } from "vue"
import { useOutside } from "../composables/outside"
import Popover from "./Popover.vue"

vi.mock("../composables/outside", () => ({
	useOutside: vi.fn(() => () => {}),
}))

let popoverRoot: HTMLDivElement
/** An open popover keeps its document listeners until it unmounts, so no case may leave one mounted. */
const mounted: VueWrapper[] = []

const mountPopover = (props: Record<string, unknown> = {}, slots: Record<string, string | Component> = {}, stubs = {}) => {
	const w = mount(Popover, {
		props: { width: "200", ...props },
		slots: { default: "<button>trigger</button>", content: "Popover body", ...slots },
		attachTo: document.body,
		global: {
			stubs: {
				Flex: { template: '<div :class="$attrs.class"><slot /></div>', inheritAttrs: false },
				...stubs,
			},
		},
	})
	mounted.push(w)
	return w
}

describe("Popover", () => {
	beforeEach(() => {
		popoverRoot = document.createElement("div")
		popoverRoot.id = "popover"
		document.body.appendChild(popoverRoot)
		// jsdom has no `matchMedia`; the page is as wide as the popup unless a case says otherwise.
		vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }))
	})

	afterEach(() => {
		for (const w of mounted.splice(0)) if (w.exists()) w.unmount()
		popoverRoot.remove()
		vi.unstubAllGlobals()
	})

	test("renders the default slot (trigger)", () => {
		expect(mountPopover().find("button").text()).toBe("trigger")
	})

	test("does NOT teleport content when open=false", () => {
		mountPopover({ open: false })
		expect(popoverRoot.textContent).not.toContain("Popover body")
	})

	test("teleports content into #popover when open=true", async () => {
		const w = mountPopover({ open: false })
		await w.setProps({ open: true })
		await flushPromises()
		expect(popoverRoot.textContent).toContain("Popover body")
	})

	test.each([
		{ narrow: false, triggerRight: 600, left: "400px" },
		{ narrow: false, triggerRight: 132, left: "-68px" },
		{ narrow: true, triggerRight: 600, left: "400px" },
		{ narrow: true, triggerRight: 132, left: "8px" },
	])(
		"a left-side panel ends at its trigger's right edge; below 359px it starts no further left than 8px (narrow $narrow, $left)",
		async ({ narrow, triggerRight, left }) => {
			vi.stubGlobal("matchMedia", (query: string) => ({ matches: narrow && query === "(width < 359px)", media: query }))
			const w = mountPopover({ open: false, side: "left" })
			vi.spyOn(w.element.firstElementChild as HTMLElement, "getBoundingClientRect").mockReturnValue(
				new DOMRect(triggerRight - 80, 10, 80, 30),
			)
			await w.setProps({ open: true })
			await flushPromises()
			expect(popoverRoot.querySelector<HTMLElement>("[style*='top']")?.style.left).toBe(left)
		},
	)

	test("closing emits onClose when Escape is pressed", async () => {
		const w = mountPopover({ open: false })
		await w.setProps({ open: true })
		await flushPromises()
		document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }))
		await flushPromises()
		expect(w.emitted("onClose")).toBeTruthy()
	})

	describe("Escape", () => {
		const FIELD = { content: '<input data-testid="field" />' }
		const pressEscape = () => {
			const e = new KeyboardEvent("keydown", { code: "Escape", cancelable: true })
			document.dispatchEvent(e)
			return e
		}
		/** Opened from its focused trigger, as Enter on it does; the field then takes focus, as autofocus does. */
		async function openWithFieldFocused() {
			const w = mountPopover({ open: false }, FIELD)
			const trigger = w.get("button").element
			trigger.focus()
			await w.setProps({ open: true })
			await flushPromises()
			popoverRoot.querySelector<HTMLInputElement>('[data-testid="field"]')?.focus()
			return { w, trigger }
		}

		test("marks the key handled", async () => {
			await openWithFieldFocused()
			expect(pressEscape().defaultPrevented).toBe(true)
		})

		test("with focus in the panel, returns it to the trigger's control focused at open", async () => {
			const { w, trigger } = await openWithFieldFocused()
			pressEscape()
			expect(document.activeElement).toBe(trigger)
			expect(w.emitted("onClose")).toHaveLength(1)
		})

		test("with focus outside the panel, leaves it there", async () => {
			const { trigger } = await openWithFieldFocused()
			const elsewhere = document.createElement("button")
			document.body.appendChild(elsewhere)
			elsewhere.focus()
			pressEscape()
			expect(document.activeElement).toBe(elsewhere)
			expect(document.activeElement).not.toBe(trigger)
			elsewhere.remove()
		})

		test("an unmount while open leaves later Escapes unhandled", async () => {
			const { w } = await openWithFieldFocused()
			w.unmount()
			expect(pressEscape().defaultPrevented).toBe(false)
		})

		test("an outside press closes without moving focus", async () => {
			const { w } = await openWithFieldFocused()
			const field = popoverRoot.querySelector('[data-testid="field"]')
			const onOutside = vi.mocked(useOutside).mock.calls.at(-1)?.[1] as () => void
			onOutside()
			expect(w.emitted("onClose")).toHaveLength(1)
			expect(document.activeElement).toBe(field)
		})
	})

	describe("Tab", () => {
		const TWO = { content: '<button data-testid="a">a</button><button data-testid="b">b</button>' }
		const control = (testid: string) => popoverRoot.querySelector(`[data-testid="${testid}"]`) as HTMLElement
		const pressTab = (shiftKey = false) => {
			const e = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true })
			;(document.activeElement ?? document.body).dispatchEvent(e)
			return e
		}
		/** Opened as Enter on the focused trigger opens it, or, without `fromTrigger`, with focus elsewhere. */
		async function open(slots: Record<string, string | Component> = TWO, fromTrigger = true, stubs = {}) {
			const w = mountPopover({ open: false }, slots, stubs)
			const trigger = w.get("button").element
			if (fromTrigger) trigger.focus()
			await w.setProps({ open: true })
			await flushPromises()
			return { w, trigger }
		}
		function outsideButton(): HTMLButtonElement {
			const el = document.createElement("button")
			document.body.appendChild(el)
			return el
		}
		afterEach(() => {
			for (const el of document.body.querySelectorAll(":scope > button")) el.remove()
		})

		test("opened from its focused trigger, focus moves to the panel's first control", async () => {
			await open()
			expect(document.activeElement).toBe(control("a"))
		})

		test("content that took focus as it mounted keeps it", async () => {
			const SelfFocused = defineComponent({
				template: '<button data-testid="a">a</button><button ref="b" data-testid="b">b</button>',
				mounted() {
					;(this.$refs.b as HTMLElement).focus()
				},
			})
			await open({ content: SelfFocused })
			expect(document.activeElement).toBe(control("b"))
		})

		test("opened while focus is elsewhere, focus stays there", async () => {
			await open(TWO, false)
			expect(document.activeElement).toBe(document.body)
		})

		test("Tab on the last control hands focus to the trigger and leaves the key to the browser", async () => {
			const { w, trigger } = await open()
			control("b").focus()
			expect(pressTab().defaultPrevented).toBe(false)
			expect(document.activeElement).toBe(trigger)
			expect(w.emitted("onClose")).toHaveLength(1)
		})

		test("Shift+Tab on the first control closes back onto the trigger", async () => {
			const { w, trigger } = await open()
			expect(pressTab(true).defaultPrevented).toBe(true)
			expect(document.activeElement).toBe(trigger)
			expect(w.emitted("onClose")).toHaveLength(1)
		})

		test("a one-control panel hands off at both edges", async () => {
			const { w, trigger } = await open({ content: '<button data-testid="a">a</button>' })
			expect(pressTab().defaultPrevented).toBe(false)
			expect(document.activeElement).toBe(trigger)
			control("a").focus()
			expect(pressTab(true).defaultPrevented).toBe(true)
			expect(document.activeElement).toBe(trigger)
			expect(w.emitted("onClose")).toHaveLength(2)
		})

		test("opened while focus is elsewhere, Tab past the last control still reaches the trigger", async () => {
			const { trigger } = await open(TWO, false)
			control("b").focus()
			pressTab()
			expect(document.activeElement).toBe(trigger)
		})

		test("Tab between the panel's controls, or with focus outside them, is left to the browser", async () => {
			const { w } = await open()
			control("a").focus()
			expect(pressTab().defaultPrevented).toBe(false)
			expect(document.activeElement).toBe(control("a"))
			control("b").focus()
			expect(pressTab(true).defaultPrevented).toBe(false)
			expect(document.activeElement).toBe(control("b"))
			control("b").blur()
			expect(pressTab().defaultPrevented).toBe(false)
			expect(document.activeElement).toBe(document.body)
			expect(w.emitted("onClose")).toBeUndefined()
		})

		test("focus leaving the trigger and the panel closes it", async () => {
			const { w } = await open()
			control("b").focus()
			expect(w.emitted("onClose")).toBeUndefined()
			outsideButton().focus()
			expect(w.emitted("onClose")).toHaveLength(1)
		})

		test("a closed panel ignores focus elsewhere", async () => {
			const { w } = await open()
			await w.setProps({ open: false })
			await flushPromises()
			outsideButton().focus()
			expect(w.emitted("onClose")).toBeUndefined()
		})

		test("a closing panel is inert while it leaves", async () => {
			const { w } = await open(TWO, true, { transition: false })
			expect(control("a").closest("[inert]")).toBeNull()
			await w.setProps({ open: false })
			expect(control("a")?.isConnected).toBe(true)
			expect(control("a").closest("[inert]")).not.toBeNull()
		})
	})

	test("disabled prop applies the disabled CSS class on the wrapper", () => {
		expect(mountPopover({ disabled: true }).html()).toMatch(/disabled/)
	})

	test("teleportTo overrides the target root", async () => {
		const custom = document.createElement("div")
		custom.id = "custom-pop"
		document.body.appendChild(custom)
		try {
			const w = mountPopover({ open: false, teleportTo: "#custom-pop" })
			await w.setProps({ open: true })
			await flushPromises()
			expect(custom.textContent).toContain("Popover body")
			expect(popoverRoot.textContent).not.toContain("Popover body")
		} finally {
			custom.remove()
		}
	})
})
