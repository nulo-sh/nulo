import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { drawsFeeWhole } from "../../../../../tests/helpers/fee-whole"
import { UNVOUCHED_FEE_SENTENCE } from "@/components/composite/send/publish-facts"
import FeeLineText from "./FeeLineText.vue"

const STUBS = { DottedTerm: { props: ["term", "testid"], template: '<span :data-testid="testid" :data-term="term"><slot /></span>' } }
/** Inside a paragraph, as the line and the review draw it: the component's root is a fragment. */
const mountText = (text: string, figure: string | null) =>
	mount(
		{ components: { FeeLineText }, props: ["words"], template: '<p><FeeLineText :words="words" /></p>' },
		{ props: { words: { text, figure } }, global: { stubs: STUBS } },
	)

describe("modules/send/FeeLineText", () => {
	test("the fee is one element between the words around it, read as one sentence", () => {
		const w = mountText("The sponsor covers ~0.00214 FJ ($0.027)", "~0.00214 FJ ($0.027)")
		expect(w.text()).toBe("The sponsor covers ~0.00214 FJ ($0.027)")
		expect(w.findAll('[data-testid="send-fee-figure"]').map((f) => f.text())).toEqual(["~0.00214 FJ ($0.027)"])
		const after = mountText("~0.00214 FJ ($0.027), private Fee Juice", "~0.00214 FJ ($0.027)")
		expect(after.get('[data-testid="send-fee-figure"]').element.nextSibling?.textContent).toBe(", private Fee Juice")
	})

	test("words with no fee print as they are, a hand-added sponsor's FPC dotted", () => {
		const w = mountText(UNVOUCHED_FEE_SENTENCE, null)
		expect(w.find('[data-testid="send-fee-figure"]').exists()).toBe(false)
		expect(w.findAll("[data-term]").map((t) => t.text())).toEqual(["FPC"])
		expect(mountText("Nothing · Sponsored", null).text()).toBe("Nothing · Sponsored")
	})

	test("the fee never wraps inside itself, so its dollars stay on its line", () => {
		expect(drawsFeeWhole("FeeLineText.vue", "figure")).toBe(true)
	})
})
