import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { defineComponent } from "vue"

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

describe("LogsToolbar — the more menu", () => {
	test("the more button opens a menu with Export logs to CSV and Clear logs", async () => {
		const w = mountToolbar()
		expect(item("logs-export-csv")).toBeNull()
		await openMenu(w)
		expect(shownItem("logs-export-csv").textContent).toContain("Export logs to CSV")
		expect(shownItem("logs-clear").textContent).toContain("Clear logs")
	})

	test("each item emits its own event once", async () => {
		const w = mountToolbar()
		await openMenu(w)
		shownItem("logs-export-csv").click()
		await flushPromises()
		expect(w.emitted("exportCsv")).toHaveLength(1)
		expect(w.emitted("clearLogs")).toBeUndefined()

		await openMenu(w)
		shownItem("logs-clear").click()
		await flushPromises()
		expect(w.emitted("clearLogs")).toHaveLength(1)
		expect(w.emitted("exportCsv")).toHaveLength(1)
	})
})
