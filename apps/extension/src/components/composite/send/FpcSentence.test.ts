import { Tooltip } from "@nulo/design"
import { enableAutoUnmount, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { defineComponent, h } from "vue"
import { GLOSSARY } from "@/utils/glossary"
import FpcSentence from "./FpcSentence.vue"
import { UNVOUCHED_FEE_SENTENCE, UNVOUCHED_PUBLISH_SENTENCE } from "./publish-facts"

enableAutoUnmount(afterEach)

const Host = defineComponent({
	props: { text: { type: String, required: true } },
	setup: (props) => () => h("p", { "data-testid": "host" }, [h(FpcSentence, { text: props.text })]),
})
const mountSentence = (text: string) => mount(Host, { props: { text }, attachTo: document.body, global: { components: { Tooltip } } })
type W = ReturnType<typeof mountSentence>

/** What the line shows: its text without the term's hidden description. */
function seen(w: W): string {
	const copy = w.element.cloneNode(true) as Element
	for (const el of copy.querySelectorAll("[hidden]")) el.remove()
	return copy.textContent ?? ""
}
const terms = (w: W) => w.findAll('[data-testid="send-fpc-term"]')

describe("composite/send/FpcSentence", () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="tooltip"></div>'
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
		document.body.innerHTML = ""
	})

	test.each([
		["publishes", UNVOUCHED_PUBLISH_SENTENCE],
		["charges", UNVOUCHED_FEE_SENTENCE],
	])("the sentence on what a hand-added FPC %s reads as before, its FPC the one dotted word", (_, sentence) => {
		const w = mountSentence(sentence)
		expect(seen(w)).toBe(sentence)
		expect(terms(w).map((t) => t.text())).toEqual(["FPC"])
	})

	test.each([
		["another sentence", "Anyone can see Ana's address and the amount."],
		["a sentence naming an FPC elsewhere", "The FPC you added cannot pay this fee."],
		["nothing", ""],
	])("%s stays plain text", (_, text) => {
		const w = mountSentence(text)
		expect(seen(w)).toBe(text)
		expect(terms(w)).toHaveLength(0)
	})

	test("a name after the sentence is never dotted, even one that says FPC", () => {
		const text = `${UNVOUCHED_PUBLISH_SENTENCE} Anyone can see FPC Fan's address and the amount.`
		const w = mountSentence(text)
		expect(seen(w)).toBe(text)
		expect(terms(w)).toHaveLength(1)
	})

	test("the term is a Tab stop described by the glossary's fpc entry", () => {
		const w = mountSentence(UNVOUCHED_FEE_SENTENCE)
		const term = terms(w)[0]
		expect(term.attributes("tabindex")).toBe("0")
		const described = document.getElementById(term.attributes("aria-describedby") ?? "")
		expect(described?.textContent).toBe(GLOSSARY.fpc.definition)
	})

	test("the term defines and does nothing else: a span in the sentence, never a button", () => {
		const w = mountSentence(UNVOUCHED_PUBLISH_SENTENCE)
		expect(terms(w)[0].element.tagName).toBe("SPAN")
		expect(w.find("button").exists()).toBe(false)
	})

	test("focus shows the glossary's definition, not text of its own", async () => {
		const w = mountSentence(UNVOUCHED_PUBLISH_SENTENCE)
		await terms(w)[0].trigger("focusin")
		expect(document.querySelector('[data-testid="tooltip-text"]')?.textContent?.trim()).toBe(GLOSSARY.fpc.definition)
	})

	test("a sentence that changes is dotted or plain as it now reads", async () => {
		const w = mountSentence("Anyone can see their address and the amount.")
		expect(terms(w)).toHaveLength(0)
		await w.setProps({ text: UNVOUCHED_PUBLISH_SENTENCE })
		expect(terms(w)).toHaveLength(1)
		await w.setProps({ text: "Nobody watching the chain can see who sent it, who got it or how much." })
		expect(terms(w)).toHaveLength(0)
	})
})
