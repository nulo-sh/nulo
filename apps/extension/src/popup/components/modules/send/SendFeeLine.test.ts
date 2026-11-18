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
/** The value column's rows: the figure row's words, then who pays, or null with no method row. */
const rows = (w: ReturnType<typeof mountLine>) => [
	w.get('[data-testid="send-fee-line-value"] > :first-child').text(),
	w.find('[data-testid="send-fee-line-method"]').exists() ? w.get('[data-testid="send-fee-line-method"]').text() : null,
]
const notes = (w: ReturnType<typeof mountLine>) => w.findAll('[data-testid="send-fee-line-note"] p').map((n) => n.text())
/** Each fee drawn whole, as `[where, its text]`: the line's value or a note under it. */
const figures = (w: ReturnType<typeof mountLine>) =>
	w.findAll('[data-testid="send-fee-figure"]').map((f) => [f.element.closest("p") ? "note" : "value", f.text()])

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

	test("a paid fee: the figure with its dollars, drawn whole, over who pays", () => {
		const w = mountLine()
		expect(rows(w)).toEqual(["~0.00214 FJ ($0.027)", "Private Fee Juice"])
		expect(figures(w)).toEqual([["value", "~0.00214 FJ ($0.027)"]])
		expect(notes(w)).toEqual([])
		expect(w.get('[data-testid="send-fee-line"]').attributes("data-payer")).toBe("private_fpc")
	})

	test("no price known: the Fee Juice alone, nothing reserved for dollars", () => {
		const w = mountLine({ payer: "fj", display: { amount: "0.00214", usd: null } })
		expect(rows(w)).toEqual(["~0.00214 FJ", "Public Fee Juice"])
		expect(figures(w)).toEqual([["value", "~0.00214 FJ"]])
		const sponsored = mountLine({ payer: "sponsor", display: { amount: "0.00214", usd: null } })
		expect(notes(sponsored)).toEqual(["The sponsor covers ~0.00214 FJ"])
	})

	test("Sponsored: Nothing over Sponsored, the sponsor's cost with its dollars under them", () => {
		const w = mountLine({ payer: "sponsor" })
		expect(rows(w)).toEqual(["Nothing", "Sponsored"])
		expect(notes(w)).toEqual(["The sponsor covers ~0.00214 FJ ($0.027)"])
		expect(figures(w)).toEqual([["note", "~0.00214 FJ ($0.027)"]])
	})

	test("a hand-added sponsor: a dash over its name, and why", () => {
		const w = mountLine({ payer: "unvouched", payerName: "Mine" })
		expect(rows(w)).toEqual(["—", "Mine"])
		expect(notes(w)).toEqual([UNVOUCHED_FEE_SENTENCE])
		expect(w.findAll("[data-term]").map((t) => [t.attributes("data-term"), t.text()])).toEqual([["fpc", "FPC"]])
	})

	test("estimating: a bar where the figure goes, over who pays", () => {
		const w = mountLine({ display: null, estimating: true })
		expect(w.find('[data-testid="send-fee-line-value"] > :first-child [data-testid="stub-bar"]').exists()).toBe(true)
		expect(rows(w)[1]).toBe("Private Fee Juice")
	})

	// jsdom has no layout: the steady height rests on the column holding both rows in every state.
	test.each([
		["priced", {}],
		["no price", { display: { amount: "0.00214", usd: null } }],
		["estimating", { display: null, estimating: true }],
		["slow", { display: null, estimating: true, slow: true }],
		["failed", { display: null, failed: true }],
		["no amount yet", { display: null }],
	])("%s: the method row holds its place under the figure row", (_name, props) => {
		const w = mountLine(props)
		expect(w.findAll('[data-testid="send-fee-line-value"] > *')).toHaveLength(2)
		expect(rows(w)[1]).toBe("Private Fee Juice")
	})

	test("slow and failed offer Try again, emitted as retry", async () => {
		const slow = mountLine({ display: null, estimating: true, slow: true })
		expect(rows(slow)[0]).toBe("Taking longer than usual.Try again")
		await slow.get('[data-testid="send-fee-line-retry"]').trigger("click")
		expect(slow.emitted("retry")).toHaveLength(1)

		const failed = mountLine({ display: null, failed: true })
		expect(rows(failed)[0]).toBe("Couldn't estimate fee.Try again")
		await failed.get('[data-testid="send-fee-line-retry"]').trigger("click")
		expect(failed.emitted("retry")).toHaveLength(1)
	})

	test("queued against a cap: the last fee over who pays, then the cap under them", () => {
		const w = mountLine({
			payer: "fj",
			display: null,
			estimating: true,
			queued: true,
			queuedCap: { about: PRICED, cap: { amount: "0.0024", usd: "$0.030" } },
		})
		expect(rows(w)).toEqual(["~0.00214 FJ ($0.027)", "Public Fee Juice"])
		expect(notes(w)).toEqual(["Goes out after your earlier send, for at most ~0.0024 FJ ($0.030)."])
		expect(figures(w)).toEqual([
			["value", "~0.00214 FJ ($0.027)"],
			["note", "~0.0024 FJ ($0.030)"],
		])
	})

	test("queued with Nulo's sponsor, and queued with no cap", () => {
		const sponsored = mountLine({ payer: "sponsor", display: null, estimating: true, queued: true, queuedSponsored: true })
		expect([rows(sponsored), notes(sponsored)]).toEqual([["Nothing", "Sponsored"], [QUEUED_SPONSORED_COPY]])
		const held = mountLine({ display: null, estimating: true, queued: true })
		expect(rows(held)).toEqual([QUEUED_FEE_COPY, "Private Fee Juice"])
	})

	test("the card's notices, two at once, in its order under the line, a fee one names drawn whole", () => {
		const shortfall = { text: "This send can cost up to ~0.0021 FJ ($0.015). You have 0.0015 FJ.", figure: "~0.0021 FJ ($0.015)" }
		const w = mountLine({ notices: [{ text: "first", figure: null }, shortfall] })
		expect(notes(w)).toEqual(["first", shortfall.text])
		expect(figures(w)).toEqual([
			["value", "~0.00214 FJ ($0.027)"],
			["note", "~0.0021 FJ ($0.015)"],
		])
		expect(w.get('[data-testid="send-fee-line-note"]').attributes("role")).toBe("status")
	})

	test("Change emits change", async () => {
		const w = mountLine()
		await w.get('[data-testid="send-fee-change"]').trigger("click")
		expect(w.emitted("change")).toHaveLength(1)
	})

	test("no payer yet reads a dash, with no method row", () => {
		const w = mountLine({ payer: null, display: null })
		expect(rows(w)).toEqual(["—", null])
		expect(w.findAll('[data-testid="send-fee-line-value"] > *')).toHaveLength(1)
	})
})
