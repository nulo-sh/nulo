import { mount } from "@vue/test-utils"
import { nextTick } from "vue"
import { afterEach, describe, expect, test } from "vitest"
import { START_GRACE_MS } from "@/popup/start-grace"
import { isServiceReady } from "@/utils/core"
import StartBar from "./StartBar.vue"
import source from "./StartBar.vue?raw"

const bar = '[data-testid="start-pending"]'

describe("StartBar", () => {
	afterEach(() => {
		isServiceReady.value = false
	})

	test("shows while the service has not said Ready and the boot check has not given up", () => {
		const wrapper = mount(StartBar)
		expect(wrapper.find(bar).exists()).toBe(true)
		expect(wrapper.find(bar).attributes("aria-hidden")).toBe("true")
	})

	test("goes at Ready and comes back when that port drops", async () => {
		const wrapper = mount(StartBar)
		isServiceReady.value = true
		await nextTick()
		expect(wrapper.find(bar).exists()).toBe(false)
		isServiceReady.value = false
		await nextTick()
		expect(wrapper.find(bar).exists()).toBe(true)
	})

	test("gives way to the boot check's verdict, and shows again when a RETRY clears it", async () => {
		const wrapper = mount(StartBar, { props: { bootOutcome: "unreachable" } })
		expect(wrapper.find(bar).exists()).toBe(false)
		await wrapper.setProps({ bootOutcome: "" })
		expect(wrapper.find(bar).exists()).toBe(true)
	})

	test("stays transparent for the start grace, and is static under reduced motion", () => {
		expect(source).toContain(`animation: show 0s linear ${START_GRACE_MS}ms forwards`)
		expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.bar::before \{[^}]*animation: none;/)
	})
})
