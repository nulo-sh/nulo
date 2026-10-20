import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { defineComponent } from "vue"
import { sendEvent } from "../../../tests/helpers/send-event"

vi.mock("focus-trap", () => ({
	createFocusTrap: vi.fn(() => ({ activate: vi.fn(), deactivate: vi.fn(), active: false })),
}))
vi.mock("@/composables/outside", () => ({ useOutside: vi.fn(() => () => {}) }))

import { Flex } from "@nulo/design"
import DropdownItem from "@/components/ui/Dropdown/DropdownItem.vue"
import LogsToolbar from "./LogsToolbar.vue"

const passThrough = (tag: string) => defineComponent({ template: `<${tag}><slot /></${tag}>` })

/** The names the extension build resolves for this template, and no `Dropdown`: none is
 *  registered under that name, so the toolbar must import it. */
const REGISTERED = {
	DropdownItem,
	Flex,
	Popover: passThrough("div"),
	Icon: passThrough("span"),
	Text: passThrough("span"),
	Input: passThrough("div"),
}

let dropdownRoot: HTMLDivElement
let wrapper: VueWrapper | undefined

beforeEach(() => {
	dropdownRoot = document.createElement("div")
	dropdownRoot.id = "dropdown"
	document.body.appendChild(dropdownRoot)
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = undefined
	dropdownRoot.remove()
})

function mountToolbar(): VueWrapper {
	wrapper = mount(LogsToolbar, {
		props: {
			popovers: { source: false, level: false },
			filters: { source: {}, level: {} },
			allOptionsSelected: { source: true, level: true },
		},
		attachTo: document.body,
		global: { components: REGISTERED },
	})
	return wrapper
}

async function openMenu(w: VueWrapper): Promise<void> {
	await w.find('[data-testid="logs-more-trigger"]').trigger("click")
	await flushPromises()
}

const item = (testid: string) => dropdownRoot.querySelector<HTMLElement>(`[data-testid="${testid}"]`)

function shownItem(testid: string): HTMLElement {
	const el = item(testid)
	if (!el) throw new Error(`the open menu has no ${testid}`)
	return el
}

describe("LogsToolbar — the triggers", () => {
	test("Source, Level and more are native buttons in that order, the icon-only one named", () => {
		const w = mountToolbar()
		const triggers = w.findAll("button")
		expect(triggers.map((b) => b.attributes("data-testid"))).toEqual(["logs-filter-source", "logs-filter-level", "logs-more-trigger"])
		expect(triggers.every((b) => b.attributes("type") === "button")).toBe(true)
		expect(triggers[2]?.attributes("aria-label")).toBe("Log actions")
	})

	test("a click on Source or Level asks for its own panel", async () => {
		const w = mountToolbar()
		await w.get('[data-testid="logs-filter-source"]').trigger("click")
		await w.get('[data-testid="logs-filter-level"]').trigger("click")
		expect(w.emitted("openPopover")).toEqual([["source"], ["level"]])
	})
})

describe("LogsToolbar — the more menu", () => {
	test("the more button opens a menu with Export logs to CSV and Clear logs", async () => {
		const w = mountToolbar()
		expect(item("logs-export-csv")).toBeNull()
		await openMenu(w)
		expect(shownItem("logs-export-csv").textContent).toContain("Export logs to CSV")
		expect(shownItem("logs-clear").textContent).toContain("Clear logs")
	})

	test("both items set their words in the body role beside a 12 px icon, 8 px apart", async () => {
		const w = mountToolbar()
		await openMenu(w)
		for (const testid of ["logs-export-csv", "logs-clear"]) {
			const row = shownItem(testid).firstElementChild as HTMLElement
			expect(row.classList.contains("gap--8")).toBe(true)
			expect(row.querySelector("[name]")?.getAttribute("size")).toBe("12")
			expect(row.querySelector("[variant]")?.getAttribute("variant")).toBe("body")
			expect(row.querySelector("[style]")).toBeNull()
		}
	})

	test("each item emits its own event once", async () => {
		const w = mountToolbar()
		await openMenu(w)
		sendEvent(shownItem("logs-export-csv"), "click")
		await flushPromises()
		expect(w.emitted("exportCsv")).toHaveLength(1)
		expect(w.emitted("clearLogs")).toBeUndefined()

		await openMenu(w)
		sendEvent(shownItem("logs-clear"), "click")
		await flushPromises()
		expect(w.emitted("clearLogs")).toHaveLength(1)
		expect(w.emitted("exportCsv")).toHaveLength(1)
	})
})

describe("LogsToolbar — the filter rows", () => {
	/** Renders each panel's rows in place; the shared mount's `Popover` stub renders no panel. */
	const PopoverWithPanel = defineComponent({ template: '<div><slot /><slot name="content" /></div>' })

	function mountRows(): VueWrapper {
		wrapper = mount(LogsToolbar, {
			props: {
				popovers: { source: true, level: true },
				filters: { source: { pxe: true, "pxe-client": false }, level: { DEBUG: true, ERROR: false } },
				allOptionsSelected: { source: false, level: true },
			},
			attachTo: document.body,
			global: { components: { ...REGISTERED, Popover: PopoverWithPanel } },
		})
		return wrapper
	}

	test("each row and Select All is a native toggle button pressed as its filter reads", () => {
		const w = mountRows()
		const pressed = (testid: string) => {
			const row = w.get(`[data-testid="${testid}"]`)
			expect(row.element.tagName).toBe("BUTTON")
			expect(row.attributes("type")).toBe("button")
			return row.attributes("aria-pressed")
		}
		expect(pressed("logs-filter-source-all")).toBe("false")
		expect(pressed("logs-filter-source-item-pxe")).toBe("true")
		expect(pressed("logs-filter-source-item-pxe-client")).toBe("false")
		expect(pressed("logs-filter-level-all")).toBe("true")
		expect(pressed("logs-filter-level-item-DEBUG")).toBe("true")
		expect(pressed("logs-filter-level-item-ERROR")).toBe("false")
		const sourceList = w.get('[data-testid="logs-filter-source-all"]').element.parentElement
		expect(sourceList?.getAttribute("tabindex")).toBe("-1")
	})

	test("a click on a row or Select All emits its toggle", async () => {
		const w = mountRows()
		await w.get('[data-testid="logs-filter-level-item-ERROR"]').trigger("click")
		await w.get('[data-testid="logs-filter-source-all"]').trigger("click")
		expect(w.emitted("toggleFilter")).toEqual([["level", "ERROR"]])
		expect(w.emitted("selectAll")).toEqual([["source"]])
	})

	test("a row refuses a held Enter's repeats and leaves a fresh Enter to the button", () => {
		const w = mountRows()
		const enter = (repeat: boolean) => {
			const e = new KeyboardEvent("keydown", { key: "Enter", repeat, bubbles: true, cancelable: true })
			w.get('[data-testid="logs-filter-level-all"]').element.dispatchEvent(e)
			return e.defaultPrevented
		}
		expect(enter(true)).toBe(true)
		expect(enter(false)).toBe(false)
	})
})
