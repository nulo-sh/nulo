import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { nextTick } from "vue"
import { sendEvent } from "../../../../../tests/helpers/send-event"
import {
	feeWarning,
	NO_FACTS,
	PAID_BY,
	type PayerDescriptor,
	type PayerKind,
	type PublishFacts,
	publishFacts,
	stripSentence,
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
const testidsInOrder = (w: W) =>
	Array.from(w.get('[data-testid="send-review"]').element.querySelectorAll("[data-testid]"))
		.map((el) => el.getAttribute("data-testid") ?? "")
		.filter((id) =>
			[
				"send-payee",
				"send-review-amount",
				"send-review-strip",
				"send-review-warning",
				"send-review-fee",
				"send-review-submit",
			].includes(id),
		)

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

	test("To, the amount, the strip, the fee row, then Send now; two Tab stops, the close and Send now", () => {
		w = mountSheet()
		expect(testidsInOrder(w)).toEqual([
			"send-payee",
			"send-review-amount",
			"send-review-strip",
			"send-review-fee",
			"send-review-submit",
		])
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
		expect(w.get('[data-testid="send-payee-check"]').text()).toBe("You have not paid this address before. Check its start and end.")
	})

	test("the amount with its symbol", () => {
		w = mountSheet()
		expect(w.get('[data-testid="send-review-amount"]').text()).toBe("25TST")
	})

	test("a public send: the strip reads sender, public, public and is heard as one sentence; no warning", () => {
		const facts = publishFacts("public", "public", "account")
		w = mountSheet({ facts, payerKind: "account", payerType: "fj", fee: { payer: "fj", display: PRICED } })
		const strip = w.get('[data-testid="send-review-strip"]')
		expect([strip.attributes("data-you"), strip.attributes("data-to"), strip.attributes("data-amount")]).toEqual([
			"public",
			"public",
			"public",
		])
		expect(w.get('[data-testid="send-review-strip-spoken"]').text()).toBe(stripSentence(facts, "Ana", "account"))
		expect(w.find('[data-testid="send-review-warning"]').exists()).toBe(false)
		expect(feeLines(w)).toEqual(["≈ $0.027 (0.00214 FJ), public Fee Juice"])
	})

	test("paid from private Fee Juice: the fee row reads as the form's line, label left and value right", () => {
		w = mountSheet()
		expect(feeRow(w).attributes("data-payer")).toBe("contract")
		expect(feeRow(w).element.firstElementChild?.textContent).toBe("Fee")
		expect(feeLines(w)).toEqual(["≈ $0.027 (0.00214 FJ), private Fee Juice"])
		expect(w.find('[data-testid="send-review-warning"]').exists()).toBe(false)
	})

	test.each([
		["private", "private", "private-private"],
		["private", "public", "private-public"],
	] as const)(
		"paid from public Fee Juice on a %s → %s send: the warning sits between the strip and the fee row",
		(origin, destination, shape) => {
			const facts = publishFacts(origin, destination, "account")
			w = mountSheet({ facts, payerKind: "account", payerType: "fj", fee: { payer: "fj", display: PRICED } })
			expect(w.get('[data-testid="send-review-strip"]').attributes("data-you")).toBe("exposed")
			const box = w.get('[data-testid="send-review-warning"]')
			expect(box.text()).toBe(feeWarning(facts, "Ana"))
			expect(box.attributes("data-notice-shape")).toBe(shape)
			expect(testidsInOrder(w)).toEqual([
				"send-payee",
				"send-review-amount",
				"send-review-strip",
				"send-review-warning",
				"send-review-fee",
				"send-review-submit",
			])
			expect(feeLines(w)).toEqual(["≈ $0.027 (0.00214 FJ), public Fee Juice"])
			expect(w.find("a").exists()).toBe(false)
		},
	)

	test("Sponsored: Nothing · Sponsored over the sponsor's cost, nothing struck", () => {
		w = mountSheet({ payerType: "fpc", fee: { payer: "sponsor", display: PRICED } })
		expect(feeLines(w)).toEqual(["Nothing · Sponsored", "The sponsor covers ≈ $0.027 (0.00214 FJ)"])
		expect(feeRow(w).find("s").exists()).toBe(false)
	})

	test("a hand-added sponsor: the strip cannot vouch, the sheet says so, and its cost is never named", () => {
		const facts = publishFacts("private", "private", "unvouched")
		w = mountSheet({
			facts,
			payerKind: "unvouched",
			payerType: "fpc",
			fee: { payer: "unvouched", payerName: "My FPC", display: PRICED },
		})
		expect(w.get('[data-testid="send-review-strip"]').attributes("data-you")).toBe("unknown")
		expect(w.get('[data-testid="send-review-unvouched"]').text()).toBe(UNVOUCHED_PUBLISH_SENTENCE)
		// Heard once, in the strip's sentence.
		expect(w.get('[data-testid="send-review-unvouched"]').attributes("aria-hidden")).toBe("true")
		expect(w.get('[data-testid="send-review-strip-spoken"]').text()).toContain(UNVOUCHED_PUBLISH_SENTENCE)
		expect(feeLines(w)).toEqual(["—, My FPC", UNVOUCHED_FEE_SENTENCE])
		expect(feeRow(w).text()).not.toContain("0.00214")
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
		expect(testidsInOrder(w)).toEqual([
			"send-payee",
			"send-review-amount",
			"send-review-strip",
			"send-review-fee",
			"send-review-submit",
		])
	})

	test("a re-asked send whose fee names the account carries the warning", () => {
		const facts = publishFacts("private", "private", "account")
		w = mountSheet({ ...REASK, facts, payerKind: "account", payerType: "fj" })
		expect(w.get('[data-testid="send-review-warning"]').text()).toBe(feeWarning(facts, null))
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
			w.get('[data-testid="send-review-strip"]').element,
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

	test("an Enter while Send now refuses is cancelled where it would click", () => {
		w = mountSheet({ ready: false })
		expect(sendEvent(submit(w).element, "keydown", { key: "Enter" })?.defaultPrevented).toBe(true)
		expect(w.emitted("send")).toBeUndefined()
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
