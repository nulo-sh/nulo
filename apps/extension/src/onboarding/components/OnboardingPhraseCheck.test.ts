import { BrutalistTitle, Flex, Text } from "@nulo/design"
import { mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { nextTick } from "vue"
import { buildPhraseCheck, type PhraseQuestion } from "../phrase-check"
import OnboardingPhraseCheck from "./OnboardingPhraseCheck.vue"
import OnboardingSkipLink from "./OnboardingSkipLink.vue"
import OnboardingStepHeader from "./OnboardingStepHeader.vue"

const WORDS = Array.from({ length: 24 }, (_, i) => `w${i + 1}`)
const QUESTIONS: PhraseQuestion[] = [
	{ position: 3, phraseWord: "w3", phraseChoices: ["w9", "w3", "w1", "w20"] },
	{ position: 11, phraseWord: "w11", phraseChoices: ["w11", "w2", "w7", "w5"] },
	{ position: 20, phraseWord: "w20", phraseChoices: ["w4", "w8", "w20", "w3"] },
]

const wrappers: VueWrapper[] = []

function mountCheck(questions: readonly PhraseQuestion[] = QUESTIONS) {
	const w = mount(OnboardingPhraseCheck, {
		props: { questions, path: "password" },
		attachTo: document.body,
		global: {
			components: { BrutalistTitle, Flex, OnboardingSkipLink, OnboardingStepHeader, Text },
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

afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	vi.restoreAllMocks()
})

const questionsOf = (w: VueWrapper) => w.findAll('[data-testid="onboarding-phrase-check-question"]')
const choicesOf = (w: VueWrapper, position: number) =>
	w.findAll(
		`[data-testid="onboarding-phrase-check-question"][data-position="${position}"] [data-testid="onboarding-phrase-check-choice"]`,
	)
const confirmButton = (w: VueWrapper) => w.get('[data-testid="onboarding-phrase-check-confirm"]')
const errorLine = (w: VueWrapper) => w.find('[data-testid="onboarding-phrase-check-error"]')

async function choose(w: VueWrapper, position: number, word: string) {
	const choice = choicesOf(w, position).find((c) => (c.element as HTMLInputElement).value === word)
	if (!choice) throw new Error(`no choice ${word} at word ${position}`)
	await choice.setValue(true)
}

async function chooseAll(w: VueWrapper, words: readonly string[]) {
	for (const [i, word] of words.entries()) await choose(w, QUESTIONS[i].position, word)
}

describe("OnboardingPhraseCheck", () => {
	test("the owner's words: title, line, one group per position in order, Confirm and Do it later", () => {
		const w = mountCheck()
		expect(w.getComponent(BrutalistTitle).props()).toMatchObject({ main: "Check your", sub: "Phrase" })
		expect(w.text()).toContain("Pick 3 words by their position.")
		expect(questionsOf(w).map((q) => [q.attributes("data-position"), q.get("legend").text()])).toEqual([
			["3", "Word 3"],
			["11", "Word 11"],
			["20", "Word 20"],
		])
		expect(choicesOf(w, 11).map((c) => (c.element as HTMLInputElement).value)).toEqual(["w11", "w2", "w7", "w5"])
		expect(confirmButton(w).text()).toBe("Confirm")
		expect(w.get('[data-testid="onboarding-phrase-check-later"]').text()).toBe("Do it later")
		expect(w.get("step-indicator-stub").attributes()).toMatchObject({ current: "phrase", path: "password" })
	})

	test("a built check shows at most 12 of the phrase's words and never the whole phrase", () => {
		for (let run = 0; run < 50; run++) {
			const w = mountCheck(buildPhraseCheck(WORDS))
			const shown = new Set(w.findAll("label").map((label) => label.text()))
			expect(shown.size).toBeLessThanOrEqual(12)
			expect(w.find('[data-testid="onboarding-phrase-word"]').exists()).toBe(false)
			w.unmount()
			wrappers.splice(wrappers.indexOf(w), 1)
		}
	})

	test("each group is one radio group of its own, inside no form, its words kept from page translation", () => {
		const w = mountCheck()
		const names = QUESTIONS.map(({ position }) => new Set(choicesOf(w, position).map((c) => c.attributes("name"))))
		for (const set of names) expect(set.size).toBe(1)
		expect(new Set(names.map((set) => [...set][0])).size).toBe(3)
		for (const choice of choicesOf(w, 3)) expect(choice.attributes("type")).toBe("radio")
		expect(w.find("form").exists()).toBe(false)
		for (const q of questionsOf(w)) expect(q.get('[translate="no"]').findAll("input")).toHaveLength(4)
	})

	test("Confirm stays disabled until every group has a pick", async () => {
		const w = mountCheck()
		expect(confirmButton(w).attributes("disabled")).toBeDefined()
		await choose(w, 3, "w3")
		await choose(w, 11, "w11")
		expect(confirmButton(w).attributes("disabled")).toBeDefined()
		await choose(w, 20, "w20")
		expect(confirmButton(w).attributes("disabled")).toBeUndefined()
	})

	test("the right word at each position passes once, with no refusal", async () => {
		const w = mountCheck()
		await chooseAll(w, ["w3", "w11", "w20"])
		await confirmButton(w).trigger("click")
		expect(w.emitted("passed")).toHaveLength(1)
		expect(errorLine(w).exists()).toBe(false)
		expect(w.emitted("later")).toBeUndefined()
	})

	test("a wrong word refuses in plain words, passes nothing, and the next pick clears the refusal", async () => {
		const w = mountCheck()
		await chooseAll(w, ["w3", "w11", "w8"])
		await confirmButton(w).trigger("click")
		expect(w.emitted("passed")).toBeUndefined()
		expect(errorLine(w).text()).toBe("Words don't match. Try again.")
		expect(errorLine(w).attributes("role")).toBe("alert")
		expect(errorLine(w).element.compareDocumentPosition(confirmButton(w).element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

		await choose(w, 20, "w20")
		expect(errorLine(w).exists()).toBe(false)
		await confirmButton(w).trigger("click")
		expect(w.emitted("passed")).toHaveLength(1)
	})

	test("Do it later leaves without passing", async () => {
		const w = mountCheck()
		await w.get('[data-testid="onboarding-phrase-check-later"]').trigger("click")
		expect(w.emitted("later")).toHaveLength(1)
		expect(w.emitted("passed")).toBeUndefined()
	})

	test("it opens at the top with the focus on its title, where a held Enter presses nothing", async () => {
		// jsdom has no scrolling element; the page's own is a stand-in that records the scroll.
		const scrollTo = vi.fn()
		Object.defineProperty(document, "scrollingElement", { configurable: true, get: () => ({ scrollTo }) })
		try {
			const w = mountCheck()
			await nextTick()
			expect(scrollTo).toHaveBeenCalledExactlyOnceWith(0, 0)
			expect(document.activeElement).toBe(w.get('[data-testid="onboarding-phrase-check-title"]').element)
		} finally {
			Reflect.deleteProperty(document, "scrollingElement")
		}
	})

	test("a repeat Enter on Confirm is cancelled, so it cannot press it", async () => {
		const w = mountCheck()
		await chooseAll(w, ["w3", "w11", "w20"])
		const repeat = new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true, cancelable: true })
		expect(confirmButton(w).element.dispatchEvent(repeat)).toBe(false)
		const fresh = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
		expect(confirmButton(w).element.dispatchEvent(fresh)).toBe(true)
	})
})
