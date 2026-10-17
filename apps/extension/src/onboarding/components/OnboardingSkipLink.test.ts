import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import OnboardingSkipLink from "./OnboardingSkipLink.vue"

describe("OnboardingSkipLink", () => {
	test("is a plain button carrying the page's testid and label", () => {
		const w = mount(OnboardingSkipLink, { props: { testid: "onboarding-phrase-later" }, slots: { default: "Do it later" } })
		expect(w.element.tagName).toBe("BUTTON")
		expect(w.attributes("type")).toBe("button")
		expect(w.attributes("data-testid")).toBe("onboarding-phrase-later")
		expect(w.text()).toBe("Do it later")
	})

	test("a click emits once", async () => {
		const w = mount(OnboardingSkipLink, { props: { testid: "onboarding-other-skip" } })
		await w.trigger("click")
		expect(w.emitted("click")).toHaveLength(1)
	})
})
