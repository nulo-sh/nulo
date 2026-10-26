import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"

import type { OnboardingPath, OnboardingStep } from "../steps"
import StepIndicator from "./StepIndicator.vue"

const row = (current: OnboardingStep, path: OnboardingPath) => mount(StepIndicator, { props: { current, path } })
const texts = (current: OnboardingStep, path: OnboardingPath) =>
	row(current, path)
		.findAll("nav > div")
		.map((cell) => cell.text())
const currents = (current: OnboardingStep, path: OnboardingPath) =>
	row(current, path)
		.findAll("nav > div")
		.map((cell) => cell.attributes("aria-current"))

describe("StepIndicator", () => {
	test("a password wallet's path has four cells, Terms first and the phrase third", () => {
		expect(texts("terms", "password")).toEqual(["01Terms", "02Create", "03Phrase", "04Ready"])
	})

	test("a passkey wallet's path has the password path's four cells, the phrase third", () => {
		expect(texts("ready", "passkey")).toEqual(["01Terms", "02Create", "03Phrase", "04Ready"])
	})

	test("an import's path has three cells, and its second reads Import", () => {
		expect(texts("wallet", "import")).toEqual(["01Terms", "02Import", "03Ready"])
	})

	test("the count follows the path, so leaving Import for Create grows the row by the phrase cell", async () => {
		const wrapper = row("wallet", "import")
		expect(wrapper.findAll("nav > div")).toHaveLength(3)
		await wrapper.setProps({ path: "passkey" })
		expect(wrapper.findAll("nav > div").map((cell) => cell.text())).toEqual(["01Terms", "02Create", "03Phrase", "04Ready"])
	})

	test("only the current step's cell is aria-current, on either length", () => {
		expect(currents("phrase", "password")).toEqual([undefined, undefined, "step", undefined])
		expect(currents("ready", "import")).toEqual([undefined, undefined, "step"])
	})

	test("nav element carries the a11y label", () => {
		expect(row("terms", "passkey").find("nav").attributes("aria-label")).toBe("Onboarding progress")
	})
})
