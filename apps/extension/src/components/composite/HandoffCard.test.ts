import { mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, test } from "vitest"
import { declarationsOf, parseSource } from "../../../scripts/type-roles/source-scan"
import Button from "../ui/Button.vue"
import HandoffCard from "./HandoffCard.vue"

const SOURCE = "apps/extension/src/components/composite/HandoffCard.vue"
const IconStub = { name: "Icon", props: ["name", "size"], template: "<i data-icon :data-name='name' :data-size='size' />" }
const PROPS = { title: "Pick the contacts file" }
const WHY = "Firefox closes the panel when a file picker opens, so the pick runs here."

let mounted: VueWrapper | undefined

function mountCard(props: Record<string, unknown> = {}): VueWrapper {
	mounted = mount(HandoffCard, {
		props: { ...PROPS, ...props },
		attachTo: document.body,
		global: { stubs: { Icon: IconStub } },
	})
	return mounted
}

const choose = (w: VueWrapper) => w.get<HTMLButtonElement>('[data-testid="handoff-card-choose"]')
const cancel = (w: VueWrapper) => w.get<HTMLButtonElement>('[data-testid="handoff-card-cancel"]')

afterEach(() => {
	mounted?.unmount()
	mounted = undefined
})

describe("HandoffCard", () => {
	test("the title is the heading that names the card", () => {
		const w = mountCard()
		const heading = w.get("h1")
		expect(heading.text()).toBe(PROPS.title)
		expect(w.get('[data-testid="handoff-card"]').attributes("aria-labelledby")).toBe(heading.attributes("id"))
	})

	test("the line under the title says why the pick runs here, unless the page words its own", () => {
		expect(mountCard().get("p").text()).toBe(WHY)
		mounted?.unmount()
		expect(mountCard({ description: "Another line." }).get("p").text()).toBe("Another line.")
	})

	test("Choose file then Cancel, as real buttons in that order", () => {
		const w = mountCard()
		const buttons = w.findAll("button")
		expect(buttons.map((b) => b.text())).toEqual(["Choose file", "Cancel"])
		expect(buttons.map((b) => b.attributes("data-testid"))).toEqual(["handoff-card-choose", "handoff-card-cancel"])
		expect(buttons.map((b) => b.attributes("tabindex"))).toEqual(["0", "0"])
	})

	test("Choose file has focus as the card mounts, so Enter or Space opens the picker", () => {
		const w = mountCard()
		expect(document.activeElement).toBe(choose(w).element)
	})

	test("a press on Choose file emits choose", async () => {
		const w = mountCard()
		await choose(w).trigger("click")
		expect(w.emitted("choose")).toHaveLength(1)
		expect(w.emitted("cancel")).toBeUndefined()
	})

	test("a press on Cancel emits cancel", async () => {
		const w = mountCard()
		await cancel(w).trigger("click")
		expect(w.emitted("cancel")).toHaveLength(1)
		expect(w.emitted("choose")).toBeUndefined()
	})

	test("busy disables both buttons, out of the Tab path, and a press emits nothing", async () => {
		const w = mountCard({ busy: true })
		for (const button of [choose(w), cancel(w)]) {
			expect(button.element.disabled).toBe(true)
			expect(button.attributes("tabindex")).toBe("-1")
			await button.trigger("click")
		}
		expect(w.emitted()).not.toHaveProperty("choose")
		expect(w.emitted()).not.toHaveProperty("cancel")
	})

	test("both buttons come back when the card is no longer busy", async () => {
		const w = mountCard({ busy: true })
		await w.setProps({ busy: false })
		expect(choose(w).element.disabled).toBe(false)
		expect(cancel(w).element.disabled).toBe(false)
	})

	test("the upload glyph is decoration, hidden from assistive technology", () => {
		const icon = mountCard().get("[data-icon]")
		expect(icon.attributes()).toMatchObject({ "data-name": "upload", "data-size": "24", "aria-hidden": "true" })
	})

	test("Choose file is the page's call to action; Cancel the quiet partner", () => {
		const w = mountCard()
		const [chooseButton, cancelButton] = w.findAllComponents(Button)
		expect(chooseButton.props()).toMatchObject({ variant: "cta", size: "compact" })
		expect(cancelButton.props()).toMatchObject({ variant: "secondary", size: "large", wide: true })
	})

	test("the title is the row-title role at 16px, the line the body role", () => {
		const scan = parseSource(SOURCE)
		expect(declarationsOf(scan, ".title")).toMatchObject({ composes: "type--row-title from global", "font-size": "16px" })
		expect(declarationsOf(scan, ".description")).toMatchObject({ composes: "type--body from global", "max-width": "280px" })
	})
})
