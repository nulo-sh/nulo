import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, test } from "vitest"
import { defineComponent, h, ref } from "vue"
import { sendEvent } from "../../../../../tests/helpers/send-event"
import FeePriorityRow from "./FeePriorityRow.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
}

const factory = (props: Record<string, unknown> = { modelValue: "normal" }) => mount(FeePriorityRow, { props, global: { stubs: STUBS } })

type Level = "normal" | "fast" | "urgent"

const wrappers: VueWrapper[] = []
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

/** Mounts under a parent that owns the model, as `FeeSettingsCard` does. */
function mountOwned(initial: Level) {
	const level = ref<Level>(initial)
	const emitted: Level[] = []
	const Host = defineComponent(
		() => () =>
			h(FeePriorityRow, {
				modelValue: level.value,
				"onUpdate:modelValue": (v: Level) => {
					emitted.push(v)
					level.value = v
				},
			}),
	)
	const w = mount(Host, { attachTo: document.body, global: { stubs: STUBS } })
	wrappers.push(w)
	return { w, level, emitted }
}

const tab = (w: VueWrapper, level: Level) => w.get(`[data-testid="send-fee-priority-${level}"]`).element as HTMLElement

/** Focuses `from`, presses `key` on it and lets the host re-render; the event it sent. */
async function press(w: VueWrapper, from: Level, key: string) {
	tab(w, from).focus()
	const event = sendEvent(tab(w, from), "keydown", { key })
	await flushPromises()
	return event
}

describe("FeePriorityRow", () => {
	test("renders the three priority buttons with stable testids", () => {
		const w = factory()
		expect(w.find('[data-testid="send-fee-priority-normal"]').exists()).toBe(true)
		expect(w.find('[data-testid="send-fee-priority-fast"]').exists()).toBe(true)
		expect(w.find('[data-testid="send-fee-priority-urgent"]').exists()).toBe(true)
	})

	test("the active button gets the priority_active class", () => {
		const w = factory({ modelValue: "fast" })
		const cls = w.find('[data-testid="send-fee-priority-fast"]').attributes("class") || ""
		expect(cls).toContain("priority_active")
	})

	test("inactive buttons don't get priority_active", () => {
		const w = factory({ modelValue: "fast" })
		const cls = w.find('[data-testid="send-fee-priority-normal"]').attributes("class") || ""
		expect(cls).not.toContain("priority_active")
	})

	test("clicking a button emits update:modelValue with that level", async () => {
		const w = factory({ modelValue: "normal" })
		await w.find('[data-testid="send-fee-priority-urgent"]').trigger("click")
		expect(w.emitted("update:modelValue")?.[0]).toEqual(["urgent"])
	})

	test("renders the 'Priority' section label", () => {
		const w = factory()
		expect(w.text()).toContain("Priority")
	})

	test("is a tablist named by its label, the chosen level its one selected tab and Tab stop", () => {
		const w = factory({ modelValue: "fast" })
		const labelledBy = w.get('[role="tablist"]').attributes("aria-labelledby")
		expect(labelledBy).toBeTruthy()
		expect(w.get(`[id="${labelledBy}"]`).text()).toBe("Priority")
		expect(
			w
				.findAll('[role="tab"]')
				.map((t) => [t.attributes("data-testid"), t.attributes("type"), t.attributes("aria-selected"), t.attributes("tabindex")]),
		).toEqual([
			["send-fee-priority-normal", "button", "false", "-1"],
			["send-fee-priority-fast", "button", "true", "0"],
			["send-fee-priority-urgent", "button", "false", "-1"],
		])
	})

	test("ArrowRight and ArrowLeft choose the neighbouring level and move focus to it", async () => {
		const { w, level, emitted } = mountOwned("normal")
		expect((await press(w, "normal", "ArrowRight"))?.defaultPrevented).toBe(true)
		expect(level.value).toBe("fast")
		expect(document.activeElement).toBe(tab(w, "fast"))
		expect(tab(w, "fast").getAttribute("tabindex")).toBe("0")
		expect((await press(w, "fast", "ArrowLeft"))?.defaultPrevented).toBe(true)
		expect(level.value).toBe("normal")
		expect(document.activeElement).toBe(tab(w, "normal"))
		expect(emitted).toEqual(["fast", "normal"])
	})

	test("the arrows wrap: past Urgent comes Normal, before Normal comes Urgent", async () => {
		const { w, level } = mountOwned("urgent")
		await press(w, "urgent", "ArrowRight")
		expect(level.value).toBe("normal")
		expect(document.activeElement).toBe(tab(w, "normal"))
		await press(w, "normal", "ArrowLeft")
		expect(level.value).toBe("urgent")
		expect(document.activeElement).toBe(tab(w, "urgent"))
	})

	test("other keys are left to the page: Enter, ArrowUp and Home are not prevented and choose nothing", async () => {
		const { w, emitted } = mountOwned("fast")
		for (const key of ["Enter", "ArrowUp", "Home"]) expect((await press(w, "fast", key))?.defaultPrevented, key).toBe(false)
		expect(emitted).toEqual([])
		expect(document.activeElement).toBe(tab(w, "fast"))
	})
})
