import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { nextTick } from "vue"
import { sendEvent } from "../../../../../tests/helpers/send-event"
import {
	FACT_SENTENCES,
	feeWarning,
	NO_FACTS,
	noticeBodyFor,
	PAID_BY,
	type PayerDescriptor,
	type PayerKind,
	type PublishFacts,
	publishFacts,
	UNVOUCHED_FEE_SENTENCE,
	UNVOUCHED_PUBLISH_SENTENCE,
} from "@/components/composite/send/publish-facts"
import type { FeeLineState } from "./fee-line-words"
import SendFeeLine from "./SendFeeLine.vue"
import SendReviewSheet from "./SendReviewSheet.vue"

const STUBS = {
	Flex: { template: '<div v-bind="$attrs"><slot /></div>', inheritAttrs: false },
	Icon: { template: '<svg data-testid="stub-glyph" :data-name="name" :data-size="size" />', props: ["name", "size"] },
	Skeleton: { template: '<span data-testid="stub-bar" />' },
	// The term's definition is its own test's; here only its key and its word.
	DottedTerm: { props: ["term", "testid"], template: '<span :data-testid="testid" :data-term="term"><slot /></span>' },
	// The popup family is stubbed to what the sheet wires into it: the stack numbers, escape, initial focus, close.
	Popup: {
		name: "Popup",
		template:
			'<div v-if="show" data-testid="stub-popup" :data-order="displaceIdx" :data-escape="closeOnEscape" :data-focus="initialFocus"><slot /></div>',
		props: { show: Boolean, displaceIdx: Number, closeOnEscape: { type: Boolean, default: true }, initialFocus: [String, Boolean] },
		emits: ["onClose"],
	},
	PopupCard: {
		template: '<div data-testid="stub-card" :data-depth="displaceIdx"><slot /></div>',
		props: { displaceIdx: Number },
	},
	PopupHeader: {
		template:
			'<div><slot name="title" /><button v-if="closable" data-testid="popup-close-btn" @click="$emit(\'onClose\')">x</button></div>',
		props: { closable: { type: Boolean, default: false } },
		emits: ["onClose"],
	},
	// The real base sets `disabled` only from its prop; `loading` alone never does.
	Button: {
		template: '<button v-bind="$attrs" :disabled="disabled || null" @click="$emit(\'click\', $event)"><slot /></button>',
		props: ["variant", "size", "disabled", "loading", "wide"],
		emits: ["click"],
		inheritAttrs: false,
	},
}

/** Wire-shaped: `0x` and 64 hex digits, a point on the curve. */
const ADDRESS = "0x13c29548b3340707017c5d1a457c23d8b6c29548b3340706e39bf608a5aab172"
const PRICED = { amount: "0.00214", usd: "$0.027" }
const PAID_PRIVATE: FeeLineState = { payer: "private_fpc", display: PRICED }

type SheetProps = {
	show: boolean
	order: number
	depth: number
	facts: PublishFacts
	amount?: string
	symbol?: string
	fiat?: string | null
	recipientAddress?: string
	recipientName?: string | null
	sentenceName?: string | null
	known?: boolean
	payerKind: PayerKind
	payerType?: PayerDescriptor["type"]
	fee?: FeeLineState
	notices?: string[]
	queueing?: boolean
	canSend: boolean
	sending: boolean
	ready: boolean
	reask?: { now: string; cap: string }
}
/** Ana, 25 TST, private to private, paid from private Fee Juice. */
const BASE: SheetProps = {
	show: true,
	order: 0,
	depth: 1,
	facts: publishFacts("private", "private", "contract"),
	amount: "25",
	symbol: "TST",
	recipientName: "Ana",
	sentenceName: "Ana",
	recipientAddress: ADDRESS,
	payerKind: "contract",
	payerType: "private_fpc",
	fee: PAID_PRIVATE,
	canSend: true,
	sending: false,
	ready: true,
}

const mountSheet = (props: Partial<SheetProps> = {}) =>
	mount(SendReviewSheet, { props: { ...BASE, ...props }, global: { stubs: STUBS }, attachTo: document.body })
type W = ReturnType<typeof mountSheet>
const submit = (w: W) => w.get('[data-testid="send-review-submit"]')
const feeRow = (w: W) => w.get('[data-testid="send-review-fee"]')
/** The row's value and the notes under it, each on its own line. */
const feeLines = (w: W) =>
	Array.from(feeRow(w).element.querySelectorAll(":scope > span:last-child > span:not([class*=fee_state] span)")).map((el) =>
		(el.textContent ?? "").trim(),
	)
const ROW_IDS = ["send-review-row-you", "send-review-row-to", "send-review-row-amount"]
const testidsInOrder = (w: W) =>
	Array.from(w.get('[data-testid="send-review"]').element.querySelectorAll("[data-testid]"))
		.map((el) => el.getAttribute("data-testid") ?? "")
		.filter((id) =>
			["send-payee", "send-review-amount", ...ROW_IDS, "send-review-warning", "send-review-fee", "send-review-submit"].includes(id),
		)
/** Each "This send publishes" row: its visibility, then its words as a reader hears them, one space
 *  between text nodes. */
const rows = (w: W) =>
	ROW_IDS.map((id) => {
		const row = w.get(`[data-testid="${id}"]`)
		const parts: string[] = []
		const walk = document.createTreeWalker(row.element, NodeFilter.SHOW_TEXT)
		for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent?.trim()) parts.push(n.textContent.trim())
		return [row.attributes("data-visibility"), parts.join(" ")]
	})

describe("modules/send/SendReviewSheet", () => {
	let w: W | undefined
	afterEach(() => w?.unmount())

	test("joins the popup stack with the slot's order and its own depth, and opens on Send now", () => {
		w = mountSheet({ order: 2, depth: 3 })
		const popup = w.get('[data-testid="stub-popup"]')
		expect(popup.attributes("data-order")).toBe("2")
		expect(popup.attributes("data-focus")).toBe('[data-testid="send-review-submit"]')
		expect(popup.attributes("data-escape")).toBe("true")
		expect(w.get('[data-testid="stub-card"]').attributes("data-depth")).toBe("3")
		const dialog = w.get('[role="dialog"]')
		expect(dialog.attributes("aria-modal")).toBe("true")
		expect(dialog.attributes("aria-labelledby")).toBe("send-review-title")
		expect(w.get("#send-review-title").attributes("tabindex")).toBeUndefined()
	})

	test("the open marker stays in the page whether or not the popup renders", async () => {
		w = mountSheet({ show: false })
		expect(w.get('[data-testid="send-review-sheet"]').attributes("data-open")).toBe("false")
		expect(w.find('[data-testid="stub-popup"]').exists()).toBe(false)
		await w.setProps({ show: true })
		expect(w.get('[data-testid="send-review-sheet"]').attributes("data-open")).toBe("true")
	})

	test("To, the amount, the three publish rows, the fee row, then Send now; two Tab stops, the close and Send now", () => {
		w = mountSheet()
		expect(testidsInOrder(w)).toEqual(["send-payee", "send-review-amount", ...ROW_IDS, "send-review-fee", "send-review-submit"])
		expect(w.text()).toContain("This send publishes")
		const stops = w.get('[data-testid="send-review"]').findAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')
		expect(stops.map((s) => s.attributes("data-testid"))).toEqual(["popup-close-btn", "send-review-submit"])
		expect(w.text()).not.toMatch(/edit/i)
	})

	test("a named payee: To, the name and the whole address in its two lines, no check line", () => {
		w = mountSheet()
		expect(w.get('[data-testid="send-payee-name"]').text()).toBe("Ana")
		const halves = ["first", "second"].map((h) => w?.get(`[data-testid="send-payee-half-${h}"]`).text())
		expect(halves.map((h) => h?.length)).toEqual([33, 33])
		expect(halves.join("")).toBe(ADDRESS)
		expect(w.find('[data-testid="send-payee-check"]').exists()).toBe(false)
	})

	test("a pasted address nobody has paid: no name line, the address and its check line", () => {
		w = mountSheet({ recipientName: null, sentenceName: null, known: false })
		expect(w.find('[data-testid="send-payee-name"]').exists()).toBe(false)
		expect(w.get('[data-testid="send-payee-address"]').text().replace(/\s+/g, "")).toBe(ADDRESS)
		expect(w.get('[data-testid="send-payee-check"]').text()).toBe(
			"You have not paid this address before. Review it carefully before you send.",
		)
	})

	test("the amount with its symbol, and no dollar figure without a price", () => {
		w = mountSheet()
		expect(w.get('[data-testid="send-review-amount"]').text()).toBe("25TST")
		expect(w.find('[data-testid="send-review-amount-fiat"]').exists()).toBe(false)
	})

	test("with a price, the form's dollar figure follows the amount in the same line, heard after it", () => {
		w = mountSheet({ fiat: "≈ $43.20" })
		const amount = w.get('[data-testid="send-review-amount"]').element
		const fiat = w.get('[data-testid="send-review-amount-fiat"]').element
		expect(fiat.textContent).toBe("≈ $43.20")
		expect(amount.nextElementSibling).toBe(fiat)
		expect(fiat.closest("[aria-hidden]")).toBeNull()
		// An unfinished amount has no figure to price.
		w.unmount()
		w = mountSheet({ fiat: "≈ $43.20", amount: undefined })
		expect(w.find('[data-testid="send-review-amount-fiat"]').exists()).toBe(false)
	})

	test("a private send on a vouched payer: the three rows read hidden, with no sentence under them", () => {
		w = mountSheet()
		expect(rows(w)).toEqual([
			["hidden", "Your address HIDDEN"],
			["hidden", "Recipient HIDDEN"],
			["hidden", "Amount HIDDEN"],
		])
	})

	test("a public send: the rows read sender, public, public, each with its sentence; no warning", () => {
		const facts = publishFacts("public", "public", "account")
		w = mountSheet({ facts, payerKind: "account", payerType: "fj", fee: { payer: "fj", display: PRICED } })
		expect(rows(w)).toEqual([
			["public", `Your address SENDER ${FACT_SENTENCES.sender}`],
			["public", `Recipient PUBLIC ${FACT_SENTENCES.recipient}`],
			["public", `Amount PUBLIC ${FACT_SENTENCES.amount}`],
		])
		expect(w.find('[data-testid="send-review-warning"]').exists()).toBe(false)
		expect(feeLines(w)).toEqual(["~0.00214 FJ ($0.027), public Fee Juice"])
	})

	test("paid from private Fee Juice: the fee row reads as the form's line, label left and value right", () => {
		w = mountSheet()
		expect(feeRow(w).attributes("data-payer")).toBe("contract")
		expect(feeRow(w).element.firstElementChild?.textContent).toBe("Fee")
		expect(feeLines(w)).toEqual(["~0.00214 FJ ($0.027), private Fee Juice"])
		expect(w.find('[data-testid="send-review-warning"]').exists()).toBe(false)
	})

	test("the fee row's figure carries its dollars when priced, drawn whole; with no price, the Fee Juice alone", async () => {
		const sheet = mountSheet({ payerType: "fpc", fee: { payer: "sponsor", display: PRICED } })
		w = sheet
		const figures = () =>
			feeRow(sheet)
				.findAll('[data-testid="send-fee-figure"]')
				.map((f) => f.text())
		expect(figures()).toEqual(["~0.00214 FJ ($0.027)"])
		await sheet.setProps({ fee: { payer: "sponsor", display: { amount: "0.00214", usd: null } } })
		expect(feeLines(sheet)).toEqual(["Nothing · Sponsored", "The sponsor covers ~0.00214 FJ"])
		expect(figures()).toEqual(["~0.00214 FJ"])
	})

	test.each([
		["private", "private", "private-private"],
		["private", "public", "private-public"],
	] as const)(
		"paid from public Fee Juice on a %s → %s send: the rows name the fee payer, and the warning sits between them and the fee row",
		(origin, destination, shape) => {
			const facts = publishFacts(origin, destination, "account")
			w = mountSheet({ facts, payerKind: "account", payerType: "fj", fee: { payer: "fj", display: PRICED } })
			// The box says it once: the row keeps its name, its mark and its word, and no sentence.
			expect(rows(w)[0]).toEqual(["exposed", "Your address FEE PAYER"])
			expect(w.get('[data-testid="send-review-row-you"] [data-testid="stub-glyph"]').attributes("data-name")).toBe("public")
			expect(w.text()).not.toContain(noticeBodyFor(shape))
			const box = w.get('[data-testid="send-review-warning"]')
			expect(box.text()).toBe(feeWarning(facts, "Ana"))
			expect(w.text().split(box.text())).toHaveLength(2)
			expect(box.attributes("data-notice-shape")).toBe(shape)
			expect(testidsInOrder(w)).toEqual([
				"send-payee",
				"send-review-amount",
				...ROW_IDS,
				"send-review-warning",
				"send-review-fee",
				"send-review-submit",
			])
			expect(feeLines(w)).toEqual(["~0.00214 FJ ($0.027), public Fee Juice"])
			expect(w.find("a").exists()).toBe(false)
		},
	)

	test("the Your address row's sentence goes only while the warning shows, and comes back with the warning gone", async () => {
		w = mountSheet({
			facts: publishFacts("private", "public", "account"),
			payerKind: "account",
			payerType: "fj",
			fee: { payer: "fj", display: PRICED },
		})
		expect(w.find('[data-testid="send-review-warning"]').exists()).toBe(true)
		expect(rows(w)[0]).toEqual(["exposed", "Your address FEE PAYER"])
		await w.setProps({ facts: publishFacts("public", "public", "account") })
		expect(w.find('[data-testid="send-review-warning"]').exists()).toBe(false)
		expect(rows(w)[0]).toEqual(["public", `Your address SENDER ${FACT_SENTENCES.sender}`])
	})

	test("Sponsored: Nothing · Sponsored over the sponsor's cost, nothing struck", () => {
		w = mountSheet({ payerType: "fpc", fee: { payer: "sponsor", display: PRICED } })
		expect(feeLines(w)).toEqual(["Nothing · Sponsored", "The sponsor covers ~0.00214 FJ ($0.027)"])
		expect(feeRow(w).find("s").exists()).toBe(false)
	})

	test("a hand-added sponsor: Your address cannot be vouched for, its row says so in the form's words, and its cost is never named", () => {
		const facts = publishFacts("private", "private", "unvouched")
		w = mountSheet({
			facts,
			payerKind: "unvouched",
			payerType: "fpc",
			fee: { payer: "unvouched", payerName: "My FPC", display: PRICED },
		})
		expect(rows(w)[0]).toEqual(["unknown", `Your address — ${UNVOUCHED_PUBLISH_SENTENCE}`])
		expect(w.text().split(UNVOUCHED_PUBLISH_SENTENCE)).toHaveLength(2)
		expect(feeLines(w)).toEqual(["—, My FPC", UNVOUCHED_FEE_SENTENCE])
		expect(feeRow(w).text()).not.toContain("0.00214")
		// Each sentence's "FPC" is the glossary's term, the sponsor's own name never: two, the screen's cap.
		expect(w.findAll("[data-term]").map((t) => [t.attributes("data-term"), t.text()])).toEqual([
			["fpc", "FPC"],
			["fpc", "FPC"],
		])
	})

	const STATES: [string, FeeLineState, string[]][] = [
		["paid, private", PAID_PRIVATE, []],
		["paid, public, no quote", { payer: "fj", display: { amount: "0.00214", usd: null } }, []],
		["sponsored", { payer: "sponsor", display: PRICED }, []],
		["hand-added", { payer: "unvouched", payerName: "My FPC", display: PRICED }, []],
		["no payer yet", { payer: null, display: PRICED }, []],
		[
			"queued against a cap",
			{ payer: "private_fpc", display: null, estimating: true, queued: true, queuedCap: { about: PRICED, cap: PRICED } },
			[],
		],
		["queued, sponsored", { payer: "sponsor", display: null, estimating: true, queued: true, queuedSponsored: true }, []],
		["queued behind", { payer: "fj", display: null, estimating: true, queued: true }, []],
		["with the card's notices", PAID_PRIVATE, ["You have no Fee Juice yet"]],
	]
	test.each(STATES)("%s: the review's fee row says what the form's line says", (_name, fee, notices) => {
		w = mountSheet({ fee, notices })
		const line = mount(SendFeeLine, { props: { ...fee, notices }, global: { stubs: STUBS } })
		const formValue = line.get('[data-testid="send-fee-line-value"]').text()
		const formNotes = line.findAll('[data-testid="send-fee-line-note"] p').map((p) => p.text())
		expect(feeLines(w)).toEqual([formValue, ...formNotes])
		line.unmount()
	})

	test("queued: the cap's reading keeps its marker and the button queues; behind the sponsor likewise", async () => {
		w = mountSheet({ queueing: true, fee: STATES[5][1] })
		expect(feeRow(w).find('[data-testid="send-review-fee-cap"]').exists()).toBe(true)
		expect(submit(w).text()).toBe("Queue send")
		await submit(w).trigger("click")
		expect(w.emitted("send")).toEqual([[]])
		await w.setProps({ fee: STATES[6][1] })
		expect(feeRow(w).find('[data-testid="send-review-fee-queued"]').exists()).toBe(true)
	})

	test("estimating: the bar, and Send now says it waits; slow, Try again asks again and hands the keyboard to Send now", async () => {
		w = mountSheet({ canSend: false, fee: { payer: "private_fpc", display: null, estimating: true } })
		expect(feeRow(w).find('[data-testid="stub-bar"]').exists()).toBe(true)
		expect(submit(w).text()).toBe("Estimating fee")
		await w.setProps({ fee: { payer: "private_fpc", display: null, estimating: true, slow: true } })
		expect(feeRow(w).get('[data-testid="send-review-fee-slow"]').text()).toContain("Taking longer than usual.")
		const retry = w.get('[data-testid="send-review-fee-retry"]')
		;(retry.element as HTMLButtonElement).focus()
		await retry.trigger("click")
		expect(w.emitted("retry")).toEqual([[]])
		await w.setProps({ fee: { payer: "private_fpc", display: null, estimating: true } })
		await nextTick()
		expect(document.activeElement).toBe(submit(w).element)
	})

	test("an estimate that failed says so in the danger tint, with Try again", () => {
		w = mountSheet({ canSend: false, fee: { payer: "private_fpc", display: null, failed: true } })
		const said = feeRow(w).get(".color--txt-danger")
		expect(said.text()).toBe("Couldn't estimate fee.")
		expect(feeRow(w).find('[data-testid="send-review-fee-retry"]').exists()).toBe(true)
	})

	test("an unfinished form reads — and cannot send", () => {
		w = mountSheet({
			amount: undefined,
			recipientAddress: undefined,
			fee: undefined,
			canSend: false,
			payerKind: null,
			payerType: undefined,
			facts: NO_FACTS,
		})
		expect(w.get('[data-testid="send-review-amount"]').text()).toBe("—")
		expect(w.find('[data-testid="send-payee"]').exists()).toBe(false)
		expect(feeLines(w)).toEqual(["—"])
		expect(feeRow(w).attributes("data-payer")).toBe("none")
		expect(submit(w).attributes("aria-disabled")).toBe("true")
	})
})

describe("modules/send/SendReviewSheet — Home's re-ask review", () => {
	let w: W | undefined
	afterEach(() => w?.unmount())

	const REASK: Partial<SheetProps> = {
		recipientName: undefined,
		sentenceName: undefined,
		fee: undefined,
		reask: { now: "~0.88 FJ ($0.013)", cap: "~0.8 FJ ($0.012)" },
	}

	test.each([
		["account", "fj", PAID_BY.account],
		["contract", "private_fpc", PAID_BY.contract],
		["contract", "fpc", PAID_BY.sponsor],
	] as const)("payer %s / %s: the new fee against the accepted one, who pays under it, and Send", async (payerKind, payerType, paid) => {
		w = mountSheet({ ...REASK, payerKind, payerType, facts: publishFacts("private", "public", payerKind) })
		expect(feeRow(w).get('[data-testid="send-review-fee-reask"]').text()).toBe(
			`Fee is now ~0.88 FJ ($0.013), above the ~0.8 FJ ($0.012) you accepted.${paid}`,
		)
		expect(feeLines(w)).toEqual(["Fee is now ~0.88 FJ ($0.013), above the ~0.8 FJ ($0.012) you accepted.", paid])
		expect(submit(w).text()).toBe("Send")
		await submit(w).trigger("click")
		expect(w.emitted("send")).toEqual([[]])
	})

	test("To is the address alone, with no check line: the send was already made", () => {
		w = mountSheet({ ...REASK })
		expect(w.find('[data-testid="send-payee-name"]').exists()).toBe(false)
		expect(w.find('[data-testid="send-payee-check"]').exists()).toBe(false)
		expect(testidsInOrder(w)).toEqual(["send-payee", "send-review-amount", ...ROW_IDS, "send-review-fee", "send-review-submit"])
	})

	test("a re-asked send whose fee names the account carries the warning", () => {
		const facts = publishFacts("private", "private", "account")
		w = mountSheet({ ...REASK, facts, payerKind: "account", payerType: "fj" })
		expect(w.get('[data-testid="send-review-warning"]').text()).toBe(feeWarning(facts, null))
		expect(rows(w)[0]).toEqual(["exposed", "Your address FEE PAYER"])
	})
})

describe("modules/send/SendReviewSheet — Send now", () => {
	let w: W | undefined
	afterEach(() => w?.unmount())

	test("armed: enabled for the keyboard and the pointer, and a press sends", async () => {
		w = mountSheet()
		expect(submit(w).attributes("data-ready")).toBe("true")
		expect(submit(w).attributes("aria-disabled")).toBeUndefined()
		await submit(w).trigger("click")
		expect(w.emitted("send")).toEqual([[]])
	})

	test.each([
		["arming", { ready: false }],
		["cannot send", { canSend: false }],
		["already sending", { sending: true }],
	])(
		"%s: aria-disabled, never natively disabled, so it keeps focus; a press, a key or a programmatic click sends nothing",
		async (_name, props) => {
			w = mountSheet(props)
			const el = submit(w).element as HTMLButtonElement
			expect(submit(w).attributes("aria-disabled")).toBe("true")
			expect(el.disabled).toBe(false)
			el.focus()
			expect(document.activeElement).toBe(el)
			await submit(w).trigger("click")
			el.click()
			expect(w.emitted("send")).toBeUndefined()
		},
	)

	test("arming then armed: the press the wait refused is not replayed, a later one sends", async () => {
		w = mountSheet({ ready: false })
		await submit(w).trigger("click")
		await w.setProps({ ready: true })
		expect(w.emitted("send")).toBeUndefined()
		await submit(w).trigger("click")
		expect(w.emitted("send")).toEqual([[]])
	})

	test("no document-level Enter: an Enter anywhere but on Send now sends and closes nothing", () => {
		w = mountSheet()
		for (const target of [
			document.body,
			w.get('[data-testid="send-review"]').element,
			w.get('[data-testid="send-review-row-you"]').element,
		]) {
			sendEvent(target, "keydown", { key: "Enter" })
			sendEvent(target, "keyup", { key: "Enter" })
		}
		expect(w.emitted("send")).toBeUndefined()
		expect(w.emitted("close")).toBeUndefined()
	})

	test("Send now refuses the auto-repeat of an Enter or a Space; a new press is its own", () => {
		w = mountSheet()
		const el = submit(w).element
		const prevented = (key: string, repeat: boolean) => sendEvent(el, "keydown", { key, repeat })?.defaultPrevented
		expect([prevented("Enter", true), prevented(" ", true)]).toEqual([true, true])
		expect([prevented("Enter", false), prevented(" ", false)]).toEqual([false, false])
	})

	test("a Space pressed while Send now refuses is refused at its release too, even once armed; a press begun armed is not", async () => {
		w = mountSheet({ ready: false })
		const el = submit(w).element
		expect(sendEvent(el, "keydown", { key: " " })?.defaultPrevented).toBe(true)
		await w.setProps({ ready: true })
		expect(sendEvent(el, "keyup", { key: " " })?.defaultPrevented).toBe(true)

		expect(sendEvent(el, "keydown", { key: " " })?.defaultPrevented).toBe(false)
		expect(sendEvent(el, "keyup", { key: " " })?.defaultPrevented).toBe(false)
		await submit(w).trigger("click")
		expect(w.emitted("send")).toEqual([[]])
	})

	test("a press held across a re-arm never sends: Space is cancelled at its release, the pointer's click refused", async () => {
		w = mountSheet()
		const el = submit(w).element
		const rearm = async () => {
			await w?.setProps({ ready: false })
			await w?.setProps({ ready: true })
		}
		expect(sendEvent(el, "keydown", { key: " " })?.defaultPrevented).toBe(false)
		await rearm()
		expect(sendEvent(el, "keyup", { key: " " })?.defaultPrevented).toBe(true)

		sendEvent(el, "pointerdown")
		await rearm()
		await submit(w).trigger("click")
		expect(w.emitted("send")).toBeUndefined()

		sendEvent(el, "pointerdown")
		await submit(w).trigger("click")
		expect(w.emitted("send")).toEqual([[]])
	})

	test("an Enter while Send now refuses is cancelled where it would click, and ends at its release", async () => {
		w = mountSheet({ ready: false })
		expect(sendEvent(submit(w).element, "keydown", { key: "Enter" })?.defaultPrevented).toBe(true)
		sendEvent(submit(w).element, "keyup", { key: "Enter" })
		expect(w.emitted("send")).toBeUndefined()
		await w.setProps({ ready: true })
		await submit(w).trigger("click")
		expect(w.emitted("send")).toEqual([[]])
	})

	test("close comes from the header button and from the popup's own close paths", async () => {
		w = mountSheet()
		await w.get('[data-testid="popup-close-btn"]').trigger("click")
		expect(w.emitted("close")).toHaveLength(1)
		w.findComponent({ name: "Popup" }).vm.$emit("onClose")
		expect(w.emitted("close")).toHaveLength(2)
	})
})

// jsdom has no layout: a stand-in font measures the amount line at its full 30 px (digits and
// letters 15 px, separators 6 px), and `room` is the summary's width.
let room = 10_000
const standInWidth = (text: string) => [...text.replace(/\s/g, "")].reduce((w, c) => w + (c === "," || c === "." ? 6 : 15), 0)
vi.mock("@/utils/hero-ruler", () => ({
	heroRoom: () => room,
	rulerWidth: (el: Element, scale: number) => standInWidth(el.textContent ?? "") * scale,
}))

describe("modules/send/SendReviewSheet — the amount line fits", () => {
	let w: W | undefined
	afterEach(() => {
		w?.unmount()
		room = 10_000
	})

	// "1,235,567.123456789012345678" and "TST": 28 digits and letters, 3 separators, 438 px at 30 px.
	test.each([
		["keeps 30 px when it fits", 10_000, "1"],
		["shrinks to the largest scale that fits one line", 300, "0.68"],
		["stops at 60%, where the line wraps", 200, "0.6"],
	])("a long amount %s", async (_, width, scale) => {
		room = width
		w = mountSheet({ amount: "1,235,567.123456789012345678", symbol: "TST" })
		await nextTick()
		const line = w.get('[data-testid="send-review-amount"]')
		expect((line.element as HTMLElement).style.getPropertyValue("--hero-scale")).toBe(scale)
		expect(line.text()).toBe("1,235,567.123456789012345678TST")
	})
})

describe("modules/send/SendReviewSheet — the gap before the symbol", () => {
	let w: W | undefined
	afterEach(() => w?.unmount())
	const numbers = (sheet: W) => sheet.findAll("span").filter((s) => s.element.childElementCount === 0 && s.text() === "25")

	test("the 4 px gap ends the number and no longer starts the symbol, so a wrapped symbol starts flush", () => {
		// jsdom lays out no line, so the rule is read from the source.
		const source = readFileSync(resolve(__dirname, "SendReviewSheet.vue"), "utf8").replace(/\s+/g, " ")
		expect(source).toContain(".number { margin-right: 4px; }")
		expect(source).not.toMatch(/\.amount small \{[^}]*margin/)
	})

	test("the number carries the gap beside a symbol, in the line and its ruler alike, and none without one", () => {
		w = mountSheet()
		const [line, ruler] = numbers(w)
		expect(line?.classes()).toHaveLength(1)
		expect(ruler?.classes()).toEqual(line?.classes())
		w.unmount()
		w = mountSheet({ symbol: undefined })
		expect(numbers(w).map((s) => s.classes())).toEqual([[], []])
	})
})
