import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useOutside } from "../composables/outside"
import Popover from "./Popover.vue"

vi.mock("../composables/outside", () => ({
	useOutside: vi.fn(() => () => {}),
}))

let popoverRoot: HTMLDivElement
/** An open popover keeps its document listeners until it unmounts, so no case may leave one mounted. */
const mounted: VueWrapper[] = []

const mountPopover = (props: Record<string, unknown> = {}, slots: Record<string, string> = {}) => {
	const w = mount(Popover, {
		props: { width: "200", ...props },
		slots: { default: "<button>trigger</button>", content: "Popover body", ...slots },
		attachTo: document.body,
		global: {
			stubs: {
				Flex: { template: '<div :class="$attrs.class"><slot /></div>', inheritAttrs: false },
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
	})

	afterEach(() => {
		for (const w of mounted.splice(0)) if (w.exists()) w.unmount()
		popoverRoot.remove()
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
