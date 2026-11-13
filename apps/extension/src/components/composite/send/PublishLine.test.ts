import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { NO_FACTS, type PayerKind, publishFacts, type TransferSide, UNVOUCHED_PUBLISH_SENTENCE } from "./publish-facts"
import PublishLine from "./PublishLine.vue"

const BRIDGE = "https://bridge.example"
const STUBS = {
	Icon: { template: '<i data-testid="stub-icon" :data-name="name" />', props: ["name", "size"] },
	// The term's definition is its own test's; here only its key and its word.
	DottedTerm: { props: ["term", "testid"], template: '<span :data-testid="testid" :data-term="term"><slot /></span>' },
}

function mountLine(origin: TransferSide, arrival: TransferSide, payer: PayerKind, extra: Record<string, unknown> = {}) {
	return mount(PublishLine, {
		props: { facts: publishFacts(origin, arrival, payer), name: "Ana", payer, remedy: null, bridgeUrl: BRIDGE, ...extra },
		global: { stubs: STUBS },
	})
}
const line = (w: ReturnType<typeof mountLine>) => w.find('[data-testid="send-publish-line"]')
const warning = (w: ReturnType<typeof mountLine>) => w.find('[data-testid="send-fee-warning"]')
const fix = (w: ReturnType<typeof mountLine>) => w.find('[data-testid="send-fee-warning-fix"]')
const bridge = (w: ReturnType<typeof mountLine>) => w.find('[data-testid="send-fee-warning-bridge"]')

describe("composite/send/PublishLine", () => {
	test("a private send paid privately is one calm sentence", () => {
		const w = mountLine("private", "private", "contract")
		expect(line(w).text()).toBe("Nobody watching the chain can see who sent it, who got it or how much.")
		expect(warning(w).exists()).toBe(false)
	})

	test("a public arrival names the recipient and the amount, still calm", () => {
		expect(line(mountLine("private", "public", "contract")).text()).toBe("Anyone can see Ana's address and the amount.")
	})

	test("a public origin names your address as the sender", () => {
		expect(line(mountLine("public", "private", "account")).text()).toBe("Anyone can see your address as the sender and the amount.")
	})

	test("a private send paid from public Fee Juice is the warning, with its glyph, and no sentence", () => {
		const w = mountLine("private", "private", "account")
		expect(line(w).exists()).toBe(false)
		expect(warning(w).text()).toContain("Paying the fee from your public Fee Juice shows your address")
		expect(warning(w).get('[data-testid="stub-icon"]').attributes("data-name")).toBe("warning")
	})

	test("private Fee Juice that can pay is the fix, and a press emits fix", async () => {
		const w = mountLine("private", "public", "account", { remedy: "private_fpc" })
		expect(fix(w).text()).toBe("Pay it from private Fee Juice")
		expect(bridge(w).exists()).toBe(false)
		await fix(w).trigger("click")
		expect(w.emitted("fix")).toHaveLength(1)
	})

	test("when private Fee Juice cannot pay, the fix is the bridge, opened in a new tab", () => {
		const w = mountLine("private", "private", "account", { remedy: null })
		expect(fix(w).exists()).toBe(false)
		const link = bridge(w)
		expect(link.text()).toBe("Get private Fee Juice")
		expect(link.attributes()).toMatchObject({ href: BRIDGE, target: "_blank", rel: "noopener noreferrer" })
	})

	test("a send that warns of nothing offers no fix", () => {
		const w = mountLine("private", "private", "contract", { remedy: "private_fpc" })
		expect([fix(w).exists(), bridge(w).exists()]).toEqual([false, false])
	})

	test("an unresolved payer shows no line until the card names one", () => {
		const w = mountLine("private", "private", null)
		expect([line(w).exists(), warning(w).exists()]).toEqual([false, false])
	})

	test("a hand-added sponsor never reads as hiding the sender", () => {
		const w = mountLine("private", "public", "unvouched")
		expect(line(w).text()).toBe(`${UNVOUCHED_PUBLISH_SENTENCE} Anyone can see Ana's address and the amount.`)
		expect(line(w).text()).not.toContain("Nobody")
		// The sentence's "FPC" is the glossary's term; the name after it is not.
		expect(w.findAll("[data-term]").map((t) => [t.attributes("data-term"), t.text()])).toEqual([["fpc", "FPC"]])
	})

	test("an unnamed recipient is their address", () => {
		expect(line(mountLine("private", "public", "contract", { name: null })).text()).toBe("Anyone can see their address and the amount.")
	})

	test("the region stays mounted and says what it holds, so a change is announced", async () => {
		const w = mountLine("private", "private", null)
		const region = w.get('[role="status"]')
		expect(region.attributes("aria-live")).toBe("polite")
		await w.setProps({ facts: publishFacts("private", "private", "account"), payer: "account" })
		expect(w.get('[role="status"]').element).toBe(region.element)
		expect(region.attributes("data-you")).toBe("exposed")
	})

	test("no sendable token, no line", () => {
		const w = mount(PublishLine, {
			props: { facts: NO_FACTS, name: "Ana", payer: null, remedy: null, bridgeUrl: BRIDGE },
			global: { stubs: STUBS },
		})
		expect([line(w).exists(), warning(w).exists()]).toEqual([false, false])
	})
})
