import { mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { BrutalistTitle } from "@nulo/design"
import OnboardingBackLink from "./OnboardingBackLink.vue"
import OnboardingStepHeader from "./OnboardingStepHeader.vue"

const wrappers: VueWrapper[] = []
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

function mountHeader(props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}, slot?: string) {
	const w = mount(OnboardingStepHeader, {
		attachTo: document.body,
		props: { current: "wallet", path: "password", main: "Create", sub: "Wallet", ...props },
		attrs,
		slots: slot ? { default: slot } : {},
		global: { components: { BrutalistTitle, OnboardingBackLink }, stubs: { StepIndicator: true, Icon: true } },
	})
	wrappers.push(w)
	return w
}

const backRow = (w: VueWrapper) => w.element.firstElementChild as HTMLElement

describe("OnboardingStepHeader", () => {
	test("a step without a back link keeps the same row, empty, above the step row", () => {
		const withBack = mountHeader({ back: "onboarding-create-back" })
		const without = mountHeader({ current: "phrase" })
		expect(backRow(withBack).querySelector('[data-testid="onboarding-create-back"]')).not.toBeNull()
		expect(backRow(without).className).toBe(backRow(withBack).className)
		expect(backRow(without).childElementCount).toBe(0)
		expect(backRow(without).nextElementSibling?.tagName).toBe("STEP-INDICATOR-STUB")
	})

	test("attributes and class land on the header, not on the root", () => {
		const w = mountHeader({}, { "data-testid": "legal-terms-page", tabindex: "-1", class: "page-space" })
		const header = w.get("header")
		expect(header.attributes("data-testid")).toBe("legal-terms-page")
		expect(header.attributes("tabindex")).toBe("-1")
		expect(header.classes()).toContain("page-space")
		expect(w.element.getAttribute("data-testid")).toBeNull()
		expect(w.element.classList.contains("page-space")).toBe(false)
	})

	test("align reaches the title: Ready centres it, every other step leaves it at the default", () => {
		expect(mountHeader({ align: "center" }).findComponent(BrutalistTitle).props("align")).toBe("center")
		expect(mountHeader().findComponent(BrutalistTitle).props("align")).toBeUndefined()
	})

	test("focus() focuses the header, the step's focus target", () => {
		const w = mountHeader({}, { tabindex: "-1" })
		w.vm.focus({ preventScroll: true })
		expect(document.activeElement).toBe(w.get("header").element)
	})

	test("the title carries the shared test hook, and the slot renders under the bar", () => {
		const w = mountHeader({}, {}, '<p data-testid="under">Restore from a recovery phrase.</p>')
		const children = [...w.get("header").element.children]
		expect(children[0].getAttribute("data-testid")).toBe("onboarding-step-title")
		expect(children[0].textContent).toContain("Create")
		expect(children.at(-1)?.getAttribute("data-testid")).toBe("under")
		expect(children).toHaveLength(3)
	})
})
