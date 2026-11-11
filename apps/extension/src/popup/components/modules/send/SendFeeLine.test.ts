import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { QUEUED_FEE_COPY, QUEUED_SPONSORED_COPY, UNVOUCHED_FEE_SENTENCE } from "@/components/composite/send/publish-facts"
import SendFeeLine from "./SendFeeLine.vue"

const PRICED = { amount: "0.00214", usd: "$0.027" }
const STUBS = { Skeleton: { template: '<span data-testid="stub-bar" />' } }

const mountLine = (props: Record<string, unknown> = {}) =>
	mount(SendFeeLine, { props: { payer: "private_fpc", display: PRICED, ...props }, global: { stubs: STUBS } })
const value = (w: ReturnType<typeof mountLine>) => w.get('[data-testid="send-fee-line-value"]').text()
const notes = (w: ReturnType<typeof mountLine>) => w.findAll('[data-testid="send-fee-line-note"] p').map((n) => n.text())

describe("modules/send/SendFeeLine", () => {
	test("a paid fee: dollars first, then who pays", () => {
		const w = mountLine()
		expect(value(w)).toBe("≈ $0.027 (0.00214 FJ), private Fee Juice")
		expect(notes(w)).toEqual([])
		expect(w.get('[data-testid="send-fee-line"]').attributes("data-payer")).toBe("private_fpc")
	})

	test("Sponsored: Nothing · Sponsored over the sponsor's cost", () => {
		const w = mountLine({ payer: "sponsor" })
		expect(value(w)).toBe("Nothing · Sponsored")
		expect(notes(w)).toEqual(["The sponsor covers ≈ $0.027 (0.00214 FJ)"])
	})

	test("a hand-added sponsor: no figure, its name, and why", () => {
		const w = mountLine({ payer: "unvouched", payerName: "Mine" })
		expect(value(w)).toBe("—, Mine")
		expect(notes(w)).toEqual([UNVOUCHED_FEE_SENTENCE])
	})

	test("estimating: a bar where the figure goes", () => {
		const w = mountLine({ display: null, estimating: true })
		expect(w.find('[data-testid="stub-bar"]').exists()).toBe(true)
	})

	test("slow and failed offer Try again, emitted as retry", async () => {
		const slow = mountLine({ display: null, estimating: true, slow: true })
		expect(value(slow)).toContain("Taking longer than usual.")
		await slow.get('[data-testid="send-fee-line-retry"]').trigger("click")
		expect(slow.emitted("retry")).toHaveLength(1)

		const failed = mountLine({ display: null, failed: true })
		expect(value(failed)).toContain("Couldn't estimate fee.")
		await failed.get('[data-testid="send-fee-line-retry"]').trigger("click")
		expect(failed.emitted("retry")).toHaveLength(1)
	})

	test("queued against a cap: the last fee, then the cap on the line under it", () => {
		const w = mountLine({
			payer: "fj",
			display: null,
			estimating: true,
			queued: true,
			queuedCap: { about: PRICED, cap: { amount: "0.0024", usd: "$0.030" } },
		})
		expect(value(w)).toBe("≈ $0.027 (0.00214 FJ), public Fee Juice")
		expect(notes(w)).toEqual(["Goes out after your earlier send, for at most $0.030 (0.0024 FJ)."])
	})

	test("queued with Nulo's sponsor, and queued with no cap", () => {
		const sponsored = mountLine({ payer: "sponsor", display: null, estimating: true, queued: true, queuedSponsored: true })
		expect([value(sponsored), notes(sponsored)]).toEqual(["Nothing · Sponsored", [QUEUED_SPONSORED_COPY]])
		const held = mountLine({ display: null, estimating: true, queued: true })
		expect(value(held)).toBe(QUEUED_FEE_COPY)
	})

	test("the card's notices, two at once, in its order under the line", () => {
		const w = mountLine({ notices: ["first", "second"] })
		expect(notes(w)).toEqual(["first", "second"])
		expect(w.get('[data-testid="send-fee-line-note"]').attributes("role")).toBe("status")
	})

	test("Change emits change", async () => {
		const w = mountLine()
		await w.get('[data-testid="send-fee-change"]').trigger("click")
		expect(w.emitted("change")).toHaveLength(1)
	})

	test("no payer yet reads a dash", () => {
		expect(value(mountLine({ payer: null, display: null }))).toBe("—")
	})
})
