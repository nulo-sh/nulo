import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"

import StepIndicator from "./StepIndicator.vue"

const currents = (current: 1 | 2 | 3 | 4) =>
	mount(StepIndicator, { props: { current } })
		.findAll("nav > div")
		.map((cell) => cell.attributes("aria-current"))

describe("StepIndicator", () => {
	test("renders four cells, Terms first, so accepting reads as step one of the sequence", () => {
		const wrapper = mount(StepIndicator, { props: { current: 1 } })
		const cells = wrapper.findAll("nav > div").map((cell) => cell.text())
		expect(cells).toEqual(["01Terms", "02Create", "03Phrase", "04Ready"])
	})

	test("current=1 (Terms): only the first cell is aria-current", () => {
		expect(currents(1)).toEqual(["step", undefined, undefined, undefined])
	})

	test("current=3 (Phrase): only the third cell is aria-current", () => {
		expect(currents(3)).toEqual([undefined, undefined, "step", undefined])
	})

	test("current=4 (Ready): only the last cell is aria-current", () => {
		expect(currents(4)).toEqual([undefined, undefined, undefined, "step"])
	})

	test("nav element carries the a11y label", () => {
		const wrapper = mount(StepIndicator, { props: { current: 1 } })
		expect(wrapper.find("nav").attributes("aria-label")).toBe("Onboarding progress")
	})
})
