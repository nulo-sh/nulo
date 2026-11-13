import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { sendEvent } from "../../../../../tests/helpers/send-event"
import { QUEUED_FEE_COPY, QUEUED_SPONSORED_COPY, UNVOUCHED_FEE_SENTENCE } from "@/components/composite/send/publish-facts"
import SendFeeLine from "./SendFeeLine.vue"

const PRICED = { amount: "0.00214", usd: "$0.027" }
const STUBS = {
	Skeleton: { template: '<span data-testid="stub-bar" />' },
	// The term's definition is its own test's; here only its key and its word.
	DottedTerm: { props: ["term", "testid"], template: '<span :data-testid="testid" :data-term="term"><slot /></span>' },
}

const mountLine = (props: Record<string, unknown> = {}) =>
	mount(SendFeeLine, { props: { payer: "private_fpc", display: PRICED, ...props }, global: { stubs: STUBS } })
const value = (w: ReturnType<typeof mountLine>) => w.get('[data-testid="send-fee-line-value"]').text()
const notes = (w: ReturnType<typeof mountLine>) => w.findAll('[data-testid="send-fee-line-note"] p').map((n) => n.text())

describe("modules/send/SendFeeLine", () => {
	test("a focused Try again that the retry replaces hands the keyboard to Change; an unfocused one moves nothing", async () => {
		const w = mount(SendFeeLine, {
			props: {
				payer: "private_fpc" as const,
				display: null,
				failed: true,
				onRetry: () => w.setProps({ failed: false, estimating: true }),
			},
			global: { stubs: STUBS },
			attachTo: document.body,
		})
		const retry = w.get('[data-testid="send-fee-line-retry"]').element as HTMLButtonElement
		retry.focus()
		await w.get('[data-testid="send-fee-line-retry"]').trigger("click")
		await w.vm.$nextTick()
		expect(w.find('[data-testid="send-fee-line-retry"]').exists()).toBe(false)
		expect(document.activeElement).toBe(w.get('[data-testid="send-fee-change"]').element)

		await w.setProps({ estimating: false, failed: true })
		const outside = document.body.appendChild(document.createElement("button"))
		outside.focus()
		await w.get('[data-testid="send-fee-line-retry"]').trigger("click")
		await w.vm.$nextTick()
		expect(document.activeElement).toBe(outside)
		w.unmount()
		outside.remove()
	})

	test("Change says it opens a dialog, and whether it is open", async () => {
		const w = mountLine()
		const change = () => w.get('[data-testid="send-fee-change"]')
		expect([change().attributes("aria-haspopup"), change().attributes("aria-expanded")]).toEqual(["dialog", "false"])
		await w.setProps({ open: true })
		expect(change().attributes("aria-expanded")).toBe("true")
	})

	test("Change refuses the auto-repeat of an Enter that moved focus onto it; a new press is its own", () => {
		const w = mountLine()
		const change = w.get('[data-testid="send-fee-change"]').element
		const repeat = sendEvent(change, "keydown", { key: "Enter", repeat: true })
		const press = sendEvent(change, "keydown", { key: "Enter" })
		expect([repeat?.defaultPrevented, press?.defaultPrevented]).toEqual([true, false])
	})

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
		expect(w.findAll("[data-term]").map((t) => [t.attributes("data-term"), t.text()])).toEqual([["fpc", "FPC"]])
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
