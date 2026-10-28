import { Flex, Icon, Text } from "@nulo/design"
import { mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { nextTick } from "vue"
import { pressOn } from "../../../tests/helpers/press-key"
import OnboardingPhraseStep from "./OnboardingPhraseStep.vue"
import OnboardingSkipLink from "./OnboardingSkipLink.vue"
import OnboardingStepHeader from "./OnboardingStepHeader.vue"

const WORDS = Array.from({ length: 24 }, (_, i) => `w${i + 1}`)
const FIVE_MINUTES = 5 * 60_000

const wrappers: VueWrapper[] = []

function mountStep() {
	const w = mount(OnboardingPhraseStep, {
		props: { words: WORDS, path: "password" },
		attachTo: document.body,
		global: {
			components: { Flex, Icon, OnboardingSkipLink, OnboardingStepHeader, Text },
			stubs: {
				Button: { template: '<button v-bind="$attrs"><slot /></button>' },
				OnboardingPage: { template: "<main><slot /></main>" },
				StepIndicator: true,
			},
		},
	})
	wrappers.push(w)
	return w
}

const later = (w: VueWrapper) => w.get('[data-testid="onboarding-phrase-later"]')
const disableLink = (w: VueWrapper) => w.find('[data-testid="onboarding-phrase-disable-auto-close"]')

beforeEach(() => {
	vi.useFakeTimers()
})
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	vi.useRealTimers()
})

describe("OnboardingPhraseStep's auto-close", () => {
	test("Do it later counts down from 5:00, with Disable auto-close under it", async () => {
		const w = mountStep()
		await nextTick()
		expect(later(w).text()).toBe("Do it later · 5:00")
		expect(disableLink(w).text()).toBe("Disable auto-close")
		expect(later(w).element.compareDocumentPosition(disableLink(w).element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
		await vi.advanceTimersByTimeAsync(1_000)
		expect(later(w).text()).toBe("Do it later · 4:59")
	})

	test("at 5 minutes the step leaves once, as Do it later does", async () => {
		const w = mountStep()
		await vi.advanceTimersByTimeAsync(FIVE_MINUTES - 1)
		expect(w.emitted("later")).toBeUndefined()
		await vi.advanceTimersByTimeAsync(1)
		expect(w.emitted("later")).toHaveLength(1)
		await vi.advanceTimersByTimeAsync(FIVE_MINUTES)
		expect(w.emitted("later")).toHaveLength(1)
		expect(w.emitted("saved")).toBeUndefined()
	})

	test("Disable auto-close drops the time and the link, hands focus to Do it later, and the step stays", async () => {
		const w = mountStep()
		await vi.advanceTimersByTimeAsync(60_000)
		pressOn(disableLink(w).element as HTMLElement, "Enter")
		expect(document.activeElement).toBe(later(w).element)
		await nextTick()
		expect(later(w).text()).toBe("Do it later")
		expect(disableLink(w).exists()).toBe(false)
		await vi.advanceTimersByTimeAsync(2 * FIVE_MINUTES)
		expect(w.emitted("later")).toBeUndefined()
	})

	test("the Enter that pressed the link and lands on Do it later as a repeat leaves nothing; a fresh Enter leaves", async () => {
		const w = mountStep()
		pressOn(disableLink(w).element as HTMLElement, "Enter")
		expect(pressOn(document.activeElement as HTMLElement, "Enter", { repeat: true })).toEqual([false])
		expect(w.emitted("later")).toBeUndefined()
		pressOn(later(w).element as HTMLElement, "Enter")
		expect(w.emitted("later")).toHaveLength(1)
	})

	test("a step closed before 5 minutes leaves nothing behind", async () => {
		const w = mountStep()
		await vi.advanceTimersByTimeAsync(FIVE_MINUTES - 1_000)
		w.unmount()
		wrappers.splice(wrappers.indexOf(w), 1)
		expect(vi.getTimerCount()).toBe(0)
		await vi.advanceTimersByTimeAsync(FIVE_MINUTES)
		expect(w.emitted("later")).toBeUndefined()
	})
})
