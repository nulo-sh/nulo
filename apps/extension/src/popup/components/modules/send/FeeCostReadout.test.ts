import { describe, expect, test } from "vitest"
import { mount, type VueWrapper } from "@vue/test-utils"
import { Skeleton } from "@nulo/design"
import { QUEUED_FEE_COPY, QUEUED_SPONSORED_COPY } from "@/components/composite/send/publish-facts"
import FeeCostReadout from "./FeeCostReadout.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: "<i />" },
	Skeleton,
}

const factory = (props: Record<string, unknown> = {}) => mount(FeeCostReadout, { props, global: { stubs: STUBS } })

function textOf(root: Node): string {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
	const parts: string[] = []
	while (walker.nextNode()) {
		const text = walker.currentNode.textContent?.trim()
		if (text) parts.push(text)
	}
	return parts.join(" ")
}

const without = (w: VueWrapper, selector: string) => {
	const clone = w.element.cloneNode(true) as Element
	for (const node of clone.querySelectorAll(selector)) node.remove()
	return textOf(clone)
}
const spoken = (w: VueWrapper) => without(w, '[aria-hidden="true"]')
const drawn = (w: VueWrapper) => without(w, '[class*="visually_hidden"]')

const ESTIMATE = { amount: "3.577824", usd: "$0.215" }

describe("FeeCostReadout", () => {
	test("idle (no estimate, not estimating) shows the simulation hint", () => {
		const w = factory()
		expect(w.text()).toContain("Fee estimated after simulation")
	})

	test("estimating without a result shows the label + skeleton", () => {
		const w = factory({ isEstimating: true })
		expect(w.text()).toBe("You pay")
		expect(w.findComponent(Skeleton).attributes("style")).toBe("width: 60px; height: 12px;")
	})

	test("pending with an amount typed, the bar stands for any estimate or queue still on the props", async () => {
		const queuedCap = { about: ESTIMATE, cap: { amount: "4.47228", usd: "$0.269" } }
		const queued = factory({ pending: true, amountTyped: true, isEstimating: true, isQueued: true, queuedCap })
		expect(queued.text()).toBe("You pay")
		expect(queued.findComponent(Skeleton).attributes("style")).toBe("width: 60px; height: 12px;")
		await queued.setProps({ pending: false })
		expect(queued.find('[data-testid="fee-estimate-queued-cap-line"]').exists()).toBe(true)

		const landed = factory({ pending: true, amountTyped: true, estimate: ESTIMATE })
		expect(landed.text()).toBe("You pay")
		await landed.setProps({ pending: false })
		expect(drawn(landed)).toBe("You pay ~3.577824 FJ ($0.215)")
	})

	test("pending with no amount typed, the row reads the hint, whatever estimate or queue is still on the props", async () => {
		const queuedCap = { about: ESTIMATE, cap: { amount: "4.47228", usd: "$0.269" } }
		const stale = factory({ pending: true, estimate: ESTIMATE, isEstimating: true, isQueued: true, queuedCap })
		expect(stale.text()).toBe("Fee estimated after simulation")
		expect(stale.findComponent(Skeleton).exists()).toBe(false)
		await stale.setProps({ amountTyped: true })
		expect(stale.text()).toBe("You pay")
		expect(stale.findComponent(Skeleton).exists()).toBe(true)
	})

	test("estimate takes precedence over the estimating skeleton", () => {
		const w = factory({ estimate: { amount: "1.0" }, isEstimating: true })
		expect(w.text()).toContain("~1.0 FJ")
	})

	test("queued with a cap: You pay about the last fee, and the cap the send goes out under; without one, the queued line", () => {
		const queuedCap = { about: ESTIMATE, cap: { amount: "4.47228", usd: "$0.269" } }
		const w = factory({ isEstimating: true, isQueued: true, queuedCap })
		expect(w.find('[data-testid="fee-estimate-queued"]').exists()).toBe(false)
		expect(drawn(w).startsWith("You pay About ~3.577824 FJ ($0.215) Goes out")).toBe(true)
		expect(w.get('[data-testid="fee-estimate-queued-cap-line"]').text()).toBe(
			"Goes out after your earlier send, for at most ~4.47228 FJ ($0.269).",
		)
		expect(w.find('[data-testid="fee-estimate-usd"]').text()).toBe("($0.215)")
		const unpriced = factory({
			isEstimating: true,
			isQueued: true,
			queuedCap: { about: { amount: "1.0", usd: null }, cap: { amount: "1.25", usd: null } },
		})
		expect(unpriced.find('[data-testid="fee-estimate-queued-cap-line"]').text()).toBe(
			"Goes out after your earlier send, for at most ~1.25 FJ.",
		)
		expect(drawn(factory({ isEstimating: true, isQueued: true }))).toBe(`You pay ${QUEUED_FEE_COPY}`)
	})

	test("queued with Nulo's sponsor paying: You pay nothing and it goes out after the earlier send; a hand-added sponsor keeps the queued line", () => {
		const w = factory({ isEstimating: true, isQueued: true, payer: "sponsor" })
		expect(drawn(w)).toBe(`You pay Nothing ${QUEUED_SPONSORED_COPY}`)
		expect(w.get('[data-testid="fee-estimate-queued-sponsored-line"]').text()).toBe("Goes out after your earlier send.")
		expect(w.find('[data-testid="fee-estimate-queued"]').exists()).toBe(false)
		const handAdded = factory({ isEstimating: true, isQueued: true, payer: "unvouched" })
		expect(handAdded.find('[data-testid="fee-estimate-queued-sponsored"]').exists()).toBe(false)
		expect(drawn(handAdded)).toBe(`You pay ${QUEUED_FEE_COPY}`)
	})

	test("a surface that holds a queued send shows only the queued line, whoever pays and whatever cap", () => {
		const queuedCap = { about: ESTIMATE, cap: { amount: "4.47228", usd: "$0.269" } }
		for (const props of [{ payer: "sponsor" }, { queuedCap }, { payer: "self" }]) {
			const w = factory({ isEstimating: true, isQueued: true, offersQueue: false, ...props })
			expect(w.find('[data-testid="fee-estimate-queued"]').exists()).toBe(true)
			expect(drawn(w)).toBe(`You pay ${QUEUED_FEE_COPY}`)
		}
	})

	test("a queued estimate shows the queued line in place of the skeleton; the estimate replaces it", () => {
		const queued = factory({ isEstimating: true, isQueued: true })
		expect(queued.find('[data-testid="fee-estimate-queued"]').exists()).toBe(true)
		expect(drawn(queued)).toBe(`You pay ${QUEUED_FEE_COPY}`)
		expect(queued.find('[class*="skeleton"]').exists()).toBe(false)
		const landed = factory({ estimate: { amount: "1.0" }, isEstimating: false, isQueued: true })
		expect(landed.find('[data-testid="fee-estimate-queued"]').exists()).toBe(false)
		expect(landed.text()).toContain("~1.0 FJ")
		expect(factory({ isQueued: true }).text()).toContain("Fee estimated after simulation")
	})
})

describe("FeeCostReadout · paying yourself", () => {
	test("priced: the amount, then the dollars beside it at today's rate; drawn and spoken alike", () => {
		const w = factory({ estimate: ESTIMATE })
		expect(drawn(w)).toBe("You pay ~3.577824 FJ ($0.215)")
		expect(spoken(w)).toBe(drawn(w))
		const usd = w.find('[data-testid="fee-estimate-usd"]')
		expect(usd.text()).toBe("($0.215)")
		expect(usd.attributes("title")).toContain("today's")
		expect(w.find("s").exists()).toBe(false)
	})

	test("unpriced: FJ only, no fake dollar figure", () => {
		const w = factory({ estimate: { amount: "0.0035", usd: null } })
		expect(drawn(w)).toBe("You pay ~0.0035 FJ")
		expect(w.find('[data-testid="fee-estimate-usd"]').exists()).toBe(false)
		expect(w.text()).not.toContain("$")
	})
})

describe("FeeCostReadout · Nulo's sponsor", () => {
	test("priced: Nothing, then the fee struck through; spoken as its own sentence only", () => {
		const w = factory({ estimate: ESTIMATE, payer: "sponsor" })
		expect(drawn(w)).toBe("You pay Nothing ~3.577824 FJ ($0.215)")
		expect(w.find("s").text()).toBe("~3.577824 FJ ($0.215)")
		expect(w.find('s [data-testid="fee-estimate-usd"]').text()).toBe("($0.215)")
		expect(spoken(w)).toBe("You pay nothing. The sponsor covers about $0.215.")
	})

	test("unpriced: the struck fee in FJ, and the sentence says FJ", () => {
		const w = factory({ estimate: { amount: "3.577824", usd: null }, payer: "sponsor" })
		expect(w.find("s").text()).toBe("~3.577824 FJ")
		expect(w.find('[data-testid="fee-estimate-usd"]').exists()).toBe(false)
		expect(spoken(w)).toBe("You pay nothing. The sponsor covers about 3.577824 FJ.")
	})

	test("under a tenth of a cent: the bound is said in words", () => {
		const w = factory({ estimate: { amount: "0.004", usd: "<$0.001" }, payer: "sponsor" })
		expect(w.find("s").text()).toBe("~0.004 FJ (<$0.001)")
		expect(spoken(w)).toBe("You pay nothing. The sponsor covers less than $0.001.")
	})
})

describe("FeeCostReadout · a sponsor added by hand", () => {
	test("a dash, spoken as what Nulo can't tell; no amount and no Nothing", () => {
		const w = factory({ estimate: ESTIMATE, payer: "unvouched" })
		expect(drawn(w)).toBe("You pay —")
		expect(spoken(w)).toBe("You pay Nulo can't tell what this fee contract charges you.")
		expect(w.text()).not.toContain("Nothing")
		expect(w.text()).not.toContain("3.577824")
		expect(w.find('[data-testid="fee-estimate-usd"]').exists()).toBe(false)
	})
})
