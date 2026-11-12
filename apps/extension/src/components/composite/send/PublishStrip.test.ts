import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { NO_FACTS, type PayerKind, type PublishFacts, publishFacts, stripSentence } from "./publish-facts"
import mark from "./publish-mark.module.css"
import PublishStrip from "./PublishStrip.vue"

const STUBS = {
	Icon: { template: '<svg data-testid="stub-glyph" :data-name="name" :data-size="size" />', props: ["name", "size"] },
}

const mountStrip = (facts: PublishFacts, payer: PayerKind = null, name: string | null = null) =>
	mount(PublishStrip, { props: { facts, payer, name }, global: { stubs: STUBS } })
const strip = (w: ReturnType<typeof mountStrip>) => w.get('[data-testid="send-review-strip"]')
const cell = (w: ReturnType<typeof mountStrip>, attr: string) => w.get(`[data-cell="${attr}"]`)
const glyphOf = (w: ReturnType<typeof mountStrip>, attr: string) => {
	const glyph = cell(w, attr).find('[data-testid="stub-glyph"]')
	return glyph.exists() ? glyph.attributes("data-name") : null
}

describe("composite/send/PublishStrip", () => {
	test("draws the three visibilities and offers nothing to press", () => {
		const w = mountStrip(publishFacts("private", "public", "account"), "account")
		expect(w.findAll("button, a, [tabindex]")).toHaveLength(0)
		const el = strip(w)
		expect([el.attributes("data-you"), el.attributes("data-to"), el.attributes("data-amount")]).toEqual(["exposed", "public", "public"])
	})

	test.each<[string, PublishFacts, string, string | null, string]>([
		["you hidden", publishFacts("private", "private", "contract"), "you", "private", "HIDDEN"],
		["you public", publishFacts("public", "private", null), "you", "public", "SENDER"],
		["you exposed", publishFacts("private", "private", "account"), "you", "public", "FEE PAYER"],
		["you unknown", publishFacts("private", "private", null), "you", null, "—"],
		["to hidden", publishFacts("public", "private", null), "to", "private", "HIDDEN"],
		["to public", publishFacts("private", "public", "contract"), "to", "public", "PUBLIC"],
		["amount hidden", publishFacts("private", "private", "contract"), "amount", "private", "HIDDEN"],
		["amount public", publishFacts("public", "private", "contract"), "amount", "public", "PUBLIC"],
	])("%s: glyph, tone and word", (_name, facts, attr, glyph, word) => {
		const w = mountStrip(facts)
		const visibility = attr === "you" ? facts.you : attr === "to" ? facts.recipient : facts.amount
		expect(cell(w, attr).classes()).toContain(mark[visibility])
		expect(glyphOf(w, attr)).toBe(glyph)
		expect(cell(w, attr).get("span").text()).toBe(word)
	})

	test("a glyph is drawn at 10px inside its hidden cell: the sentence carries the meaning", () => {
		const w = mountStrip(publishFacts("private", "public", "contract"))
		const glyphs = w.findAll('[data-cell] [data-testid="stub-glyph"]')
		expect(glyphs).toHaveLength(3)
		for (const glyph of glyphs) expect(glyph.attributes("data-size")).toBe("10")
	})

	test("the cells keep their order and labels", () => {
		const w = mountStrip(publishFacts("public", "public", "account"))
		expect(w.findAll("[data-cell]").map((c) => c.attributes("data-cell"))).toEqual(["you", "to", "amount"])
		expect(w.findAll("[data-cell] b").map((b) => b.text())).toEqual(["You", "To", "Amount"])
	})

	test("a screen reader hears one sentence, the route and what anyone can see; every cell is hidden from it", () => {
		const facts = publishFacts("private", "public", "account")
		const w = mountStrip(facts, "account", "Ana")
		expect(w.get('[data-testid="send-review-strip-spoken"]').text()).toBe(stripSentence(facts, "Ana", "account"))
		expect(w.get('[data-testid="send-review-strip-spoken"]').text()).toBe(
			"From your private balance, received publicly: anyone can see your address as the fee payer, Ana's address and the amount.",
		)
		expect(w.findAll("[data-cell]").map((c) => c.attributes("aria-hidden"))).toEqual(["true", "true", "true"])
		expect(w.findAll('[data-testid="stub-glyph"]').map((g) => g.attributes("data-name"))).not.toContain("chevron")
	})

	test("a hand-added sponsor is heard as Nulo not knowing, never as hiding you", () => {
		const w = mountStrip(publishFacts("private", "private", "unvouched"), "unvouched")
		expect(w.get('[data-testid="send-review-strip-spoken"]').text()).toBe(
			"From your private balance, received privately: Nulo can't tell what this FPC publishes about you.",
		)
	})

	test("re-renders when the facts change", async () => {
		const w = mountStrip(publishFacts("private", "private", "contract"))
		expect(strip(w).attributes("data-you")).toBe("hidden")
		await w.setProps({ facts: publishFacts("private", "private", "account") })
		expect(strip(w).attributes("data-you")).toBe("exposed")
		expect(cell(w, "you").get("span").text()).toBe("FEE PAYER")
	})

	test("with nothing to send the you cell draws no glyph and reads —; nothing reads public", () => {
		const w = mountStrip(NO_FACTS)
		expect(glyphOf(w, "you")).toBeNull()
		expect(cell(w, "you").get("span").text()).toBe("—")
		expect([glyphOf(w, "to"), glyphOf(w, "amount")]).toEqual(["private", "private"])
	})
})
