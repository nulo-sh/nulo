/**
 * A multi-call transaction reads as its summary at rest: each call in order with the wallet's own
 * reading or an unreadable call's warning, one line under them naming the calls it decoded but did
 * not read, and every authorization's line. Each step and the authorizations' node open their own
 * details. Fed the wire-shaped fixture: 32-byte hex fields, real Token decodes.
 */

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { CLAIM_AND_END_SETUP, CLAIM_AND_END_SETUP_SELECTOR, FEE_JUICE_CONTRACT } from "@nulo/wallet-bridge"
import { beforeEach, describe, expect, test, vi } from "vitest"
import SectionLabel from "@nulo/design/ui/SectionLabel.vue"
import AddressDisplay from "@/components/AddressDisplay.vue"
import DottedTerm from "@/components/composite/DottedTerm.vue"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { GLOSSARY } from "@/utils/glossary"
import { trimAddress } from "@/utils/string"
import { vocabularySelector } from "@/utils/token-transfer-vocabulary"
import type { DecodedCall, DiscoveredAuthwit } from "@/wallet/services/execution/client"
import {
	AUTHWITS,
	CONSUMED,
	decodeAuthwit,
	decodeConsumed,
	decodeFixture,
	feeEstimateWith,
	field,
	fixtureOp,
	HUB,
	MAIN,
	openAllSteps,
	RECIPIENT,
	SAVINGS,
	stubTokenSelectors,
	UNKNOWN,
	USDC,
	USDC_TOKEN,
	VAULT,
} from "./execute.fixture"
import OperationCard from "./OperationCard.vue"
import SendTxSummary from "./SendTxSummary.vue"
import { declarationsOf, parseSource } from "../../../../scripts/type-roles/source-scan"
import { shownText } from "../../../../tests/helpers/shown-text"
import { sendEvent } from "../../../../tests/helpers/send-event"

const lookups = vi.hoisted(() => ({ accounts: [] as { name: string; address: string }[] }))
vi.mock("@/utils/core", () => ({ managers: { contact: { getContactByAddress: vi.fn(async () => null) } } }))
// The real store's setup opens chrome.storage; the card only needs its account list.
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ accounts: lookups.accounts }) }))
stubTokenSelectors()

const stubs = {
	Flex: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /></div>' },
	Text: { inheritAttrs: false, template: '<span v-bind="$attrs"><slot /></span>' },
	Icon: true,
	FeeSettingsCard: true,
}

const mountCard = async (props: Record<string, unknown>, op: unknown = fixtureOp()) => {
	const w = mount(OperationCard, {
		props: { op: op as never, index: 0, tokens: [USDC_TOKEN], ...props },
		global: { stubs, components: { AddressDisplay, SectionLabel } },
	})
	await flushPromises()
	return w
}
const mountFixture = async () => mountCard({ feeEstimate: feeEstimateWith(AUTHWITS), ...(await decodeFixture()) })

const read = (w: VueWrapper, testid: string): string[] => w.findAll(`[data-testid="${testid}"]`).map((el) => el.text().replace(/\s+/g, " "))
const steps = (w: VueWrapper) => w.findAll('[data-testid="execute-op-step-toggle"]')
const node = (w: VueWrapper) => w.get('[data-testid="execute-op-authwits-toggle"]')
const advice = (w: VueWrapper) => w.findAll('[data-testid$="-unverified-advice"]')
const testidOf = (el: Element | null | undefined) => el?.getAttribute("data-testid")
/** The advice closes the calls: list, line, advice when the line shows; list, advice otherwise. */
const afterTheCalls = (w: VueWrapper) => {
	const all = advice(w)
	const before = all[0]?.element.previousElementSibling
	const line = w.find('[data-testid="execute-op-summary-unchecked"]')
	return {
		count: all.length,
		inRow: all.some((a) => a.element.closest('[data-testid="execute-op-summary-call"]') !== null),
		after: line.exists()
			? before === line.element && testidOf(line.element.previousElementSibling) === "execute-op-summary-calls"
			: testidOf(before) === "execute-op-summary-calls",
	}
}
const unchecked = (w: VueWrapper) => read(w, "execute-op-summary-unchecked")
const AFTER_THE_CALLS = { count: 1, inRow: false, after: true }
const ADVICE = "Check what the app says this does before approving."
const UNREAD = (reason: "unknown-contract" | "unknown-function"): DecodedCall => ({ kind: "undecoded", reason })

/** A one-call send of `name(args)` on USDC, decoded as the Token interface spells `roles`. */
const tokenCall = (name: string, args: string[], roles: string[], extra: Record<string, unknown> = {}) => {
	const op = fixtureOp() as unknown as { exec: { calls: unknown[] } }
	const call = { name, to: USDC, selector: vocabularySelector(name, args.length), type: "private", isStatic: false, args }
	const kinds: Record<string, string> = { to: "address", from: "address", amount: "integer", authwit_nonce: "field" }
	const decoded: DecodedCall = {
		kind: "decoded",
		contract: "Token",
		fn: name,
		params: roles.map((role, i) => ({
			name: role,
			value: { kind: kinds[role], value: role === "amount" ? BigInt(args[i]).toString() : args[i] } as never,
		})),
	}
	return { op: { ...op, exec: { calls: [call] }, ...extra }, decodedCalls: [decoded] }
}

/** A Fee Juice claim as a dApp sends it, and the decode the bundled Fee Juice artifact gives it. */
const CLAIM_SECRET = `0x1c${"7a".repeat(31)}`
const CLAIM = {
	name: CLAIM_AND_END_SETUP,
	to: FEE_JUICE_CONTRACT,
	selector: CLAIM_AND_END_SETUP_SELECTOR,
	type: "private",
	isStatic: false,
	hideMsgSender: false,
	args: [MAIN, field(5_000_000n), CLAIM_SECRET, field(9n)],
}
const CLAIM_DECODE: DecodedCall = {
	kind: "decoded",
	contract: "FeeJuice",
	fn: CLAIM_AND_END_SETUP,
	params: [
		{ name: "to", value: { kind: "address", value: MAIN } },
		{ name: "amount", value: { kind: "integer", value: "5000000" } },
		{ name: "secret", value: { kind: "field", value: CLAIM_SECRET } },
		{ name: "message_leaf_index", value: { kind: "field", value: field(9n) } },
	],
}

beforeEach(() => {
	lookups.accounts.splice(0)
	lookups.accounts.push({ name: "Main", address: MAIN })
})

describe("OperationCard — a multi-call transaction's summary", () => {
	test("at rest: each call in order with the wallet's reading, one line naming the call it did not read, and both authorizations' lines", async () => {
		const w = await mountFixture()
		expect(read(w, "execute-op-summary-call-head")).toEqual([
			`Exit To L1 on ${trimAddress(HUB)}`,
			`Transfer (private) on ${trimAddress(USDC)}:`,
			`Checkpoint on ${trimAddress(UNKNOWN)}`,
		])
		expect(unchecked(w)).toEqual(["Nulo can only check transfers and mints of tokens in your list, so it can't say what call 1 does."])
		const line = w.get('[data-testid="execute-op-summary-unchecked"]').element
		expect(line.closest('[data-testid="execute-op-summary-call"]')).toBeNull()
		expect(line.closest('[data-testid="execute-op-summary-authwits-section"]')).toBeNull()
		expect(read(w, "execute-op-call-line")).toEqual([`0.1 USDC from Main to ${trimAddress(RECIPIENT)}`])
		expect(w.findAll('[data-testid="execute-op-call-line"]')[0]!.element.closest('[data-call-index="1"]')).not.toBeNull()
		const unreadable = w.get('[data-call-index="2"] [data-testid="execute-op-summary-unverified-args"]')
		expect(unreadable.text()).toContain("Can't read the arguments")
		expect(shownText(unreadable.get('[data-testid="execute-op-summary-unverified-reason"]').element)).toBe(
			"Nulo doesn't have this contract's interface.",
		)
		expect(read(w, "execute-discovered-authwit-line")).toEqual([
			`Lets ${trimAddress(HUB)} move 25 USDC from Main to ${trimAddress(HUB)}`,
			`Lets ${trimAddress(HUB)} call Withdraw For on ${trimAddress(VAULT)}`,
		])
		expect(shownText(w.get('[data-testid="execute-op-summary-authwits-section"]').element)).toMatch(/^Authorizations\s*2 Lets /)
		expect(w.findAll('[data-testid="execute-op-summary-call"]').map((li) => li.element.tagName)).toEqual(["LI", "LI", "LI"])
	})

	test("at rest each step and the node are closed rows; a press opens only its own details, the node every authorization's", async () => {
		const w = await mountFixture()
		expect(w.find('[data-testid="execute-op-details-toggle"]').exists()).toBe(false)
		expect(steps(w).map((row) => [row.element.tagName, row.attributes("type"), row.attributes("aria-expanded")])).toEqual(
			Array(3).fill(["BUTTON", "button", "false"]),
		)
		expect(steps(w).map((row) => row.attributes("data-step-index"))).toEqual(["0", "1", "2"])
		for (const row of [...steps(w), node(w)]) expect(row.attributes("aria-controls")).toBeUndefined()
		expect(w.find('[data-testid="execute-op-details"]').exists()).toBe(false)
		expect(w.find('[data-testid="execute-op-payload-row"]').exists()).toBe(false)

		await steps(w)[1]!.trigger("click")
		const panels = w.findAll('[data-testid="execute-op-details"]')
		expect(panels.map((panel) => panel.attributes("data-step-index"))).toEqual(["1"])
		expect(steps(w).map((row) => row.attributes("aria-expanded"))).toEqual(["false", "true", "false"])
		expect(steps(w)[1]!.attributes("aria-controls")).toBe(panels[0]!.attributes("id"))
		expect(panels[0]!.element.closest('[data-testid="execute-op-summary-call"]')?.getAttribute("data-call-index")).toBe("1")
		expect(w.findAll('[data-testid="execute-op-payload-row"]').map((row) => row.attributes("data-call-to"))).toEqual([USDC])
		expect(w.find('[data-testid="execute-discovered-authwit-details"]').exists()).toBe(false)

		await node(w).trigger("click")
		expect(node(w).attributes("aria-expanded")).toBe("true")
		const authwitPanels = w.findAll('[data-testid="execute-op-summary-authwit"] > [data-testid="execute-op-details"]')
		expect(authwitPanels).toHaveLength(2)
		expect(node(w).attributes("aria-controls")).toBe(authwitPanels.map((panel) => panel.attributes("id")).join(" "))
		expect(w.findAll('[data-testid="execute-discovered-authwit-details"]')).toHaveLength(2)
		expect(w.findAll('[data-testid="execute-op-payload-row"]')).toHaveLength(1)

		await steps(w)[1]!.trigger("click")
		expect(w.find('[data-testid="execute-op-payload-row"]').exists()).toBe(false)
		expect(w.findAll('[data-testid="execute-discovered-authwit-details"]')).toHaveLength(2)
	})

	test.each([
		[1, "Nulo can only check transfers and mints of tokens in your list, so it can't say what calls 1 and 3 do."],
		[2, "Nulo can only check transfers and mints of tokens in your list, so it can't say what calls 1, 3 and 4 do."],
	])(
		"a Fee Juice claim is named with the app's calls, never the transfer Nulo read beside them (%i app calls)",
		async (hubCalls, line) => {
			const [exit, transfer] = (fixtureOp() as unknown as { exec: { calls: unknown[] } }).exec.calls
			const { decodedCalls } = await decodeFixture()
			const op = { ...(fixtureOp() as object), exec: { calls: [CLAIM, transfer, ...Array(hubCalls).fill(exit)] } }
			const w = await mountCard({ decodedCalls: [CLAIM_DECODE, decodedCalls[1], ...Array(hubCalls).fill(decodedCalls[0])] }, op)
			expect(read(w, "execute-op-summary-call-title").slice(0, 2)).toEqual(["Claim Fee Juice", "Transfer (private)"])
			expect(unchecked(w)).toEqual([line])
		},
	)

	test("three unreadable calls then a readable one: each says why with interface dotted, and the advice reads once, after the calls", async () => {
		const [exit, transfer, checkpoint] = (fixtureOp() as unknown as { exec: { calls: unknown[] } }).exec.calls
		const { decodedCalls } = await decodeFixture()
		const op = { ...(fixtureOp() as object), exec: { calls: [checkpoint, checkpoint, exit, transfer] } }
		const decodes = [UNREAD("unknown-contract"), UNREAD("unknown-contract"), UNREAD("unknown-function"), decodedCalls[1]]
		const w = await mountCard({ decodedCalls: decodes }, op)

		const rows = w.findAll('[data-testid="execute-op-summary-call"]')
		expect(rows.map((row) => row.find('[data-testid="execute-op-summary-unverified-warning"]').exists())).toEqual([
			true,
			true,
			true,
			false,
		])
		expect(rows.slice(0, 3).map((row) => shownText(row.get('[data-testid="execute-op-summary-unverified-reason"]').element))).toEqual([
			"Nulo doesn't have this contract's interface.",
			"Nulo doesn't have this contract's interface.",
			"This function isn't in the interface Nulo has.",
		])
		const terms = w.findAllComponents(DottedTerm)
		expect(terms.map((t) => [t.props("term"), shownText(t.element)])).toEqual(Array(3).fill(["interface", "interface"]))
		const termIds = w.findAll('[data-testid="execute-op-summary-interface-term"]')
		expect(termIds).toHaveLength(3)
		for (const term of termIds) {
			expect(term.attributes("tabindex")).toBe("0")
			expect(w.element.querySelector(`[id="${term.attributes("aria-describedby")}"]`)?.textContent).toBe(
				GLOSSARY.interface.definition,
			)
		}
		expect(advice(w).map((a) => a.text())).toEqual([ADVICE])
		expect(afterTheCalls(w)).toEqual(AFTER_THE_CALLS)

		await openAllSteps(w)
		expect(afterTheCalls(w)).toEqual(AFTER_THE_CALLS)
		// Each reason reads once, under its step's sentence: an open step does not repeat it.
		expect(w.findAll('[data-testid$="-unverified-reason"]').map((r) => r.attributes("data-testid"))).toEqual(
			Array(3).fill("execute-op-summary-unverified-reason"),
		)
		expect(w.findAll('[data-testid="execute-op-raw-toggle"]')).toHaveLength(4)
	})

	test("an unreadable call and an unreadable authorization: the advice stays after the calls, with the details open", async () => {
		const w = await mountCard({ feeEstimate: feeEstimateWith(AUTHWITS), ...(await decodeFixture({ vaultDecoded: false })) })
		await openAllSteps(w)
		expect(w.findAll('[data-testid="execute-op-summary-authwit-unverified-reason"]')).toHaveLength(1)
		expect(w.find('[data-testid="execute-discovered-authwit-unverified-reason"]').exists()).toBe(false)
		expect(w.findAll('[data-testid="execute-discovered-authwit-raw-toggle"]')).toHaveLength(2)
		expect(afterTheCalls(w)).toEqual(AFTER_THE_CALLS)
	})

	test("an authorization Nulo cannot read says so under its line at rest, as a call's row does, with no advice there", async () => {
		const [, transfer] = (fixtureOp() as unknown as { exec: { calls: unknown[] } }).exec.calls
		const { decodedCalls, decodedAuthwits } = await decodeFixture()
		const [usdc, vault] = AUTHWITS as [DiscoveredAuthwit, DiscoveredAuthwit]
		const failed = { ...vault, messageHash: `0x${"3c".repeat(32)}` }
		const w = await mountCard(
			{
				feeEstimate: feeEstimateWith([vault, failed, usdc]),
				decodedCalls: [decodedCalls[1]],
				decodedAuthwits: new Map([
					[vault.messageHash, UNREAD("unknown-contract")],
					[failed.messageHash, { kind: "undecoded", reason: "unavailable" }],
					[usdc.messageHash, decodedAuthwits.get(usdc.messageHash)!],
				]),
			},
			{ ...(fixtureOp() as object), exec: { calls: [transfer] } },
		)
		const rows = w.findAll('[data-testid="execute-op-summary-authwit"]')
		const notice = (k: number) => rows[k]!.find('[data-testid="execute-op-summary-authwit-unverified-args"]')
		expect(rows.map((_, k) => notice(k).exists())).toEqual([true, true, false])
		expect([0, 1].map((k) => notice(k).attributes("data-reason"))).toEqual(["unknown-contract", "unavailable"])
		expect([0, 1].map((k) => notice(k).get('[data-testid="execute-op-summary-authwit-unverified-warning"]').text())).toEqual([
			"Can't read the arguments",
			"Can't read the arguments",
		])
		expect([0, 1].map((k) => shownText(notice(k).get('[data-testid="execute-op-summary-authwit-unverified-reason"]').element))).toEqual(
			["Nulo doesn't have this contract's interface.", "Nulo couldn't read the arguments right now."],
		)
		const term = w.get('[data-testid="execute-op-summary-authwit-interface-term"]')
		expect(term.attributes("tabindex")).toBe("0")
		expect(w.element.querySelector(`[id="${term.attributes("aria-describedby")}"]`)?.textContent).toBe(GLOSSARY.interface.definition)
		expect(advice(w)).toHaveLength(0)

		await openAllSteps(w)
		expect(
			advice(w).map((a) => a.element.closest('[data-testid="execute-op-discovered-authwit"]')?.getAttribute("data-message-hash")),
		).toEqual([failed.messageHash])
		// The warning reads once, under the line at rest; the advice reads alone in the details.
		expect(w.findAll('[data-testid="execute-discovered-authwit-unverified-warning"]')).toHaveLength(0)
	})

	test("a refusal that lands while the window is open takes the advice away and leaves every warning", async () => {
		const [, transfer] = (fixtureOp() as unknown as { exec: { calls: unknown[] } }).exec.calls
		const { decodedCalls } = await decodeFixture()
		const call = await mountCard(
			{ decodedCalls: [UNREAD("unknown-contract")] },
			{ ...(fixtureOp() as object), exec: { calls: [transfer] } },
		)
		expect(advice(call)).toHaveLength(1)
		await call.setProps({ refused: true })
		expect(advice(call)).toHaveLength(0)
		expect(call.find('[data-testid="execute-op-summary-unverified-warning"]').exists()).toBe(true)
		call.unmount()

		const vault = AUTHWITS[1]!
		const authwit = await mountCard(
			{
				feeEstimate: feeEstimateWith([vault]),
				decodedCalls: [decodedCalls[1]],
				decodedAuthwits: new Map([[vault.messageHash, UNREAD("unknown-contract")]]),
			},
			{ ...(fixtureOp() as object), exec: { calls: [transfer] } },
		)
		await openAllSteps(authwit)
		expect(advice(authwit)).toHaveLength(1)
		await authwit.setProps({ refused: true })
		expect(advice(authwit)).toHaveLength(0)
		expect(authwit.findAll('[data-testid$="-unverified-warning"]').map((n) => n.attributes("data-testid"))).toEqual([
			"execute-op-summary-authwit-unverified-warning",
		])
	})

	test("every call read: no line beside an app authorization, no advice and no dotted interface, until an unreadable authorization takes the advice, the last one still open", async () => {
		const [, transfer] = (fixtureOp() as unknown as { exec: { calls: unknown[] } }).exec.calls
		const { decodedCalls, decodedAuthwits } = await decodeFixture()
		const op = { ...(fixtureOp() as object), exec: { calls: [transfer] } }
		const readable = await mountCard({ feeEstimate: feeEstimateWith(AUTHWITS), decodedCalls: [decodedCalls[1]], decodedAuthwits }, op)
		expect(read(readable, "execute-discovered-authwit-line")).toContain(
			`Lets ${trimAddress(HUB)} call Withdraw For on ${trimAddress(VAULT)}`,
		)
		expect(unchecked(readable)).toEqual([])
		await openAllSteps(readable)
		expect(readable.find('[data-testid$="-unverified-args"]').exists()).toBe(false)
		expect(readable.findAllComponents(DottedTerm)).toHaveLength(0)
		expect(advice(readable)).toHaveLength(0)
		readable.unmount()

		const vault = AUTHWITS[1]!
		const second = { ...vault, messageHash: `0x${"3c".repeat(32)}` }
		const w = await mountCard(
			{
				feeEstimate: feeEstimateWith([vault, second]),
				decodedCalls: [decodedCalls[1]],
				decodedAuthwits: new Map([
					[vault.messageHash, UNREAD("unknown-contract")],
					[second.messageHash, UNREAD("unknown-contract")],
				]),
			},
			op,
		)
		await openAllSteps(w)
		const adviceIn = () => advice(w).map((a) => a.element.closest("[data-message-hash]")?.getAttribute("data-message-hash"))
		expect(adviceIn()).toEqual([second.messageHash])
		const closers = () => w.findAll('[data-testid="execute-discovered-authwit-toggle"]')
		await closers()[1]!.trigger("click")
		expect(adviceIn()).toEqual([vault.messageHash])
		await closers()[1]!.trigger("click")
		expect(adviceIn()).toEqual([second.messageHash])
	})

	test("a call still being read says so under its own name; once read, the transfer takes the wallet's label and line", async () => {
		const w = await mountCard({ feeEstimate: feeEstimateWith(AUTHWITS) })
		expect(read(w, "execute-op-summary-call-title")).toEqual(["Exit To L1", "Transfer Private To Private", "Checkpoint"])
		expect(read(w, "execute-op-summary-args-pending")).toEqual(["Reading arguments…", "Reading arguments…", "Reading arguments…"])
		expect(w.find('[data-testid="execute-op-call-line"]').exists()).toBe(false)
		expect(unchecked(w)).toEqual([])

		await w.setProps(await decodeFixture())
		expect(read(w, "execute-op-summary-call-title")).toEqual(["Exit To L1", "Transfer (private)", "Checkpoint"])
		expect(unchecked(w)).toEqual(["Nulo can only check transfers and mints of tokens in your list, so it can't say what call 1 does."])
		expect(w.find('[data-testid="execute-op-summary-args-pending"]').exists()).toBe(false)
		expect(read(w, "execute-op-summary-unverified-warning")).toEqual(["Can't read the arguments"])
	})

	test("a transfer the wallet does not read as one keeps the function's own name in its step, its decoded values under it", async () => {
		const { op, decodedCalls } = tokenCall(
			"transfer_public_to_public",
			[MAIN, RECIPIENT, field(5n), field(0n)],
			["from", "to", "amount", "_nonce"],
		)
		const w = await mountCard({ tokens: [], decodedCalls }, op)
		expect(read(w, "execute-op-summary-call-head")).toEqual([`Transfer Public To Public on ${trimAddress(USDC)}`])
		await openAllSteps(w)
		expect(w.get('[data-testid="execute-op-payload-row"]').attributes("data-intent-kind")).toBe("decoded")
		expect(w.findAll('[data-testid="execute-op-decoded-param"]').map((p) => p.attributes("data-param"))).toEqual([
			"from",
			"to",
			"amount",
			"_nonce",
		])
	})

	test("the line follows the token list: one unread call, two, then none once the token is listed", async () => {
		const one = tokenCall("transfer", [RECIPIENT, field(5_000_000n)], ["to", "amount"])
		const w = await mountCard({ tokens: [], decodedCalls: one.decodedCalls }, one.op)
		expect(unchecked(w)).toEqual([
			"Nulo can only check transfers and mints of tokens in your list, so it can't say what this call does.",
		])

		const twoCalls = { ...one.op, exec: { calls: [...one.op.exec.calls, ...one.op.exec.calls] } }
		const two = await mountCard({ tokens: [], decodedCalls: [...one.decodedCalls, ...one.decodedCalls] }, twoCalls)
		expect(unchecked(two)).toEqual([
			"Nulo can only check transfers and mints of tokens in your list, so it can't say what these calls do.",
		])

		await w.setProps({ tokens: [USDC_TOKEN] })
		await flushPromises()
		expect(read(w, "execute-op-call-line")).toEqual([`5 USDC from this account to ${trimAddress(RECIPIENT)}`])
		expect(unchecked(w)).toEqual([])
	})

	test("the sender reads as 'this account' when the account is the caller, as the account a transfer names, and the entrypoint's call names none", async () => {
		const own = tokenCall("transfer", [RECIPIENT, field(5_000_000n)], ["to", "amount"])
		expect(read(await mountCard({ decodedCalls: own.decodedCalls }, own.op), "execute-op-call-line")).toEqual([
			`5 USDC from this account to ${trimAddress(RECIPIENT)}`,
		])
		const entry = tokenCall("transfer", [RECIPIENT, field(5_000_000n)], ["to", "amount"], {
			executionMode: "default_entrypoint",
			feeSettings: { paymentMethod: { kind: "embedded" } },
		})
		expect(read(await mountCard({ decodedCalls: entry.decodedCalls }, entry.op), "execute-op-call-line")).toEqual([
			`5 USDC to ${trimAddress(RECIPIENT)}. Caller: none`,
		])
		// A delegated transfer keeps its explicit sender.
		lookups.accounts.push({ name: "First", address: VAULT })
		const theirs = tokenCall(
			"transfer_private_to_private",
			[VAULT, RECIPIENT, field(1_000_000n), field(1n)],
			["from", "to", "amount", "authwit_nonce"],
		)
		expect(read(await mountCard({ decodedCalls: theirs.decodedCalls }, theirs.op), "execute-op-call-line")).toEqual([
			`1 USDC from First to ${trimAddress(RECIPIENT)}`,
		])
	})

	test("a mint names no sender; a token whose symbol reads as nothing states base units", async () => {
		const mint = tokenCall("mint_to_private", [RECIPIENT, field(5_000_000n)], ["to", "amount"])
		expect(read(await mountCard({ decodedCalls: mint.decodedCalls }, mint.op), "execute-op-call-line")).toEqual([
			`5 USDC to ${trimAddress(RECIPIENT)}`,
		])
		const blank = { ...USDC_TOKEN, symbol: String.fromCharCode(7) }
		const own = tokenCall("transfer", [RECIPIENT, field(5_000_000n)], ["to", "amount"])
		expect(read(await mountCard({ tokens: [blank], decodedCalls: own.decodedCalls }, own.op), "execute-op-call-line")).toEqual([
			`5000000 base units from this account to ${trimAddress(RECIPIENT)}`,
		])
	})

	test("while the wallet is still finding the authorizations, the summary says so at rest", async () => {
		const op = { ...(fixtureOp() as object), executionMode: "default_entrypoint", feeSettings: { paymentMethod: { kind: "embedded" } } }
		const w = await mountCard({ isPreviewing: true, ...(await decodeFixture()) }, op)
		expect(read(w, "execute-op-authwits-pending")).toEqual(["Checking authorizations…"])
		expect(w.find('[data-testid="execute-op-details"]').exists()).toBe(false)
	})
})

describe("OperationCard — an authorization another account of the profile already gave", () => {
	beforeEach(() => {
		lookups.accounts.push({ name: "Savings", address: SAVINGS })
	})
	const mountListing = async (listed: readonly DiscoveredAuthwit[], op: unknown = fixtureOp()) => {
		const fixture = await decodeFixture()
		fixture.decodedAuthwits.set(CONSUMED.messageHash, await decodeConsumed())
		return mountCard({ feeEstimate: feeEstimateWith(listed), ...fixture }, op)
	}
	const rows = (w: VueWrapper) =>
		w.findAll('[data-testid="execute-op-summary-authwit"]').map((row) => {
			const line = row.find('[data-testid="execute-op-summary-authwit-on-behalf"]')
			return {
				hash: row.attributes("data-message-hash"),
				onBehalf: row.attributes("data-on-behalf"),
				line: line.exists() ? line.text().replace(/\s+/g, " ") : undefined,
			}
		})
	const OWN = AUTHWITS[0]!
	const OWN_ROW = { hash: OWN.messageHash, onBehalf: undefined, line: undefined }
	const CONSUMED_ROW = { hash: CONSUMED.messageHash, onBehalf: SAVINGS, line: "Already authorized by Savings." }

	test("at rest its row reads as the account's own and adds which account gave it; the account's own row adds nothing", async () => {
		expect([SAVINGS, ...CONSUMED.args.slice(0, 2), CONSUMED.caller].every(isValidAztecAddress)).toBe(true)
		const w = await mountListing([OWN, CONSUMED])
		expect(read(w, "execute-discovered-authwit-line")).toEqual([
			`Lets ${trimAddress(HUB)} move 25 USDC from Main to ${trimAddress(HUB)}`,
			`Lets Main move 1 USDC from Savings to ${trimAddress(RECIPIENT)}`,
		])
		expect(rows(w)).toEqual([OWN_ROW, CONSUMED_ROW])
	})

	test("the details list it apart from what the wallet will sign, naming the account that gave it", async () => {
		const w = await mountListing([OWN, CONSUMED])
		await openAllSteps(w)
		const hashesIn = (group: string) =>
			w
				.findAll(`[data-testid="${group}"] [data-testid="execute-op-discovered-authwit"]`)
				.map((row) => row.attributes("data-message-hash"))
		expect(hashesIn("execute-op-discovered-authwits")).toEqual([OWN.messageHash])
		expect(hashesIn("execute-op-consumed-authwits")).toEqual([CONSUMED.messageHash])
		expect(read(w, "execute-discovered-authorized-by")).toEqual(["Savings"])
	})

	test("an app-paid send lists it, and only it", async () => {
		const op = fixtureOp() as unknown as { exec: object }
		const appPaid = { ...op, exec: { ...op.exec, feePayer: VAULT } }
		expect(rows(await mountListing([CONSUMED], appPaid))).toEqual([CONSUMED_ROW])
		expect(rows(await mountListing([OWN, CONSUMED], appPaid))).toEqual([CONSUMED_ROW])
		expect(rows(await mountListing([OWN], appPaid))).toEqual([])
	})

	test("an app-paid send names the account's own attached authorization as the account's, in a details group of its own", async () => {
		const op = fixtureOp() as unknown as { exec: object }
		const appPaid = { ...op, exec: { ...op.exec, feePayer: VAULT } }
		const ATTACHED = { ...OWN, onBehalfOf: MAIN }
		const w = await mountListing([ATTACHED, CONSUMED], appPaid)
		expect(read(w, "execute-discovered-authwit-line")).toEqual([
			`Lets ${trimAddress(HUB)} move 25 USDC from Main to ${trimAddress(HUB)}`,
			`Lets Main move 1 USDC from Savings to ${trimAddress(RECIPIENT)}`,
		])
		expect(rows(w)).toEqual([{ hash: OWN.messageHash, onBehalf: MAIN, line: "Already authorized by Main." }, CONSUMED_ROW])
		await openAllSteps(w)
		const GROUPS = ["execute-op-discovered-authwits", "execute-op-sender-authwits", "execute-op-consumed-authwits"]
		const groups = w.findAll(GROUPS.map((id) => `[data-testid="${id}"]`).join(", ")).map((group) => ({
			group: group.attributes("data-testid"),
			label: group.find("span").text(),
			hashes: group.findAll('[data-testid="execute-op-discovered-authwit"]').map((row) => row.attributes("data-message-hash")),
		}))
		expect(groups).toEqual([
			{ group: "execute-op-sender-authwits", label: "Authorizations this account already gave", hashes: [OWN.messageHash] },
			{
				group: "execute-op-consumed-authwits",
				label: "Authorizations your other accounts already gave",
				hashes: [CONSUMED.messageHash],
			},
		])
		expect(read(w, "execute-discovered-authorized-by")).toEqual(["Main", "Savings"])
	})
})

describe("OperationCard — a default-entrypoint send whose authorization preview failed", () => {
	const noFrom = () => ({
		...(fixtureOp() as object),
		executionMode: "default_entrypoint",
		feeSettings: { paymentMethod: { kind: "embedded" } },
	})
	const failedLine = (w: VueWrapper) => w.find('[data-testid="execute-op-authwits-preview-failed"]')
	const retry = (w: VueWrapper) => w.get('[data-testid="execute-op-authwits-preview-retry"]')

	test("the list collapses to one line that says so; Try again asks the preview again, which reads as checking, then lists", async () => {
		const w = await mountCard({ previewFailed: true, ...(await decodeFixture()) }, noFrom())
		expect(failedLine(w).get(".color--txt-danger").text()).toBe("Authorizations couldn't be previewed")
		expect(retry(w).text()).toBe("Try again")
		expect(w.find('[data-testid="execute-op-summary-authwits-section"]').exists()).toBe(false)

		await retry(w).trigger("click")
		expect(w.emitted("retryPreview")).toEqual([[0]])
		await w.setProps({ previewFailed: false, isPreviewing: true })
		expect([failedLine(w).exists(), read(w, "execute-op-authwits-pending")]).toEqual([false, ["Checking authorizations…"]])
		await w.setProps({ isPreviewing: false, authwitPreview: { previewId: "pv", discoveredAuthwits: AUTHWITS } })
		expect(failedLine(w).exists()).toBe(false)
		expect(w.findAll('[data-testid="execute-op-summary-authwit"]')).toHaveLength(2)
	})

	test("a refused request, or one the wallet estimates instead, shows no line; the same failure unrefused does", async () => {
		const decoded = await decodeFixture()
		expect(failedLine(await mountCard({ previewFailed: true, refused: true, ...decoded }, noFrom())).exists()).toBe(false)
		expect(failedLine(await mountCard({ previewFailed: true, ...decoded })).exists()).toBe(false)
		expect(failedLine(await mountCard({ previewFailed: true, ...decoded }, noFrom())).exists()).toBe(true)
	})

	test("a keyboard press keeps its place on the authorizations' slot through the check and the list; a pointer press leaves focus", async () => {
		const w = mount(OperationCard, {
			props: { op: noFrom() as never, index: 0, tokens: [USDC_TOKEN], previewFailed: true, ...(await decodeFixture()) },
			global: { stubs, components: { AddressDisplay, SectionLabel } },
			attachTo: document.body,
		})
		await flushPromises()
		const slot = w.get('[data-testid="execute-op-authwits-slot"]').element as HTMLElement
		expect([slot.getAttribute("tabindex"), slot.getAttribute("role"), slot.getAttribute("aria-label")]).toEqual([
			"-1",
			"group",
			"Authorizations",
		])
		await retry(w).trigger("click")
		expect(document.activeElement).not.toBe(slot)

		vi.spyOn(retry(w).element, "matches").mockImplementation((selector) => selector === ":focus-visible")
		await retry(w).trigger("click")
		expect(w.emitted("retryPreview")).toEqual([[0], [0]])
		await w.setProps({ previewFailed: false, isPreviewing: true })
		expect(failedLine(w).exists()).toBe(false)
		expect([document.activeElement, slot.getAttribute("aria-busy")]).toEqual([slot, "true"])
		await w.setProps({ isPreviewing: false, authwitPreview: { previewId: "pv", discoveredAuthwits: AUTHWITS } })
		expect([document.activeElement, slot.getAttribute("aria-busy")]).toEqual([slot, null])
		expect(slot.contains(node(w).element)).toBe(true)

		// The slot is no control: a held Enter on it opens nothing and asks nothing again.
		sendEvent(slot, "keydown", { key: "Enter", repeat: true })
		sendEvent(slot, "keydown", { key: "Enter" })
		await flushPromises()
		expect([node(w).attributes("aria-expanded"), w.emitted("retryPreview")]).toEqual(["false", [[0], [0]]])
		w.unmount()
	})
})

describe("OperationCard — what leaves the account opens the fee section", () => {
	const TST = { ...USDC_TOKEN, id: 2, contract: VAULT, name: "Test", symbol: "TST", decimals: 18 }
	const kinds: Record<string, string> = { from: "address", to: "address", amount: "integer", authwit_nonce: "field" }
	/** `transfer_in_public(from, to, amount, nonce)` on `contract` as the wire carries it, with its Token decode. */
	const transfer = (contract: string, from: string, amount: bigint) => {
		const args = [from, RECIPIENT, field(amount), field(0n)]
		const roles = ["from", "to", "amount", "authwit_nonce"]
		const call = {
			name: "transfer_in_public",
			to: contract,
			selector: vocabularySelector("transfer_in_public", 4),
			type: "public",
			isStatic: false,
			args,
		}
		const decoded: DecodedCall = {
			kind: "decoded",
			contract: "Token",
			fn: "transfer_in_public",
			params: roles.map((role, i) => ({
				name: role,
				value: { kind: kinds[role], value: role === "amount" ? amount.toString() : args[i] } as never,
			})),
		}
		return { call, decoded }
	}
	const exit = {
		call: { name: "exit_to_l1", to: HUB, selector: "0x5a3e1b2c", type: "private", isStatic: false, args: [USDC, field(1n)] },
		decoded: {
			kind: "decoded",
			contract: "Hub",
			fn: "exit_to_l1",
			params: [{ name: "token", value: { kind: "address", value: USDC } }],
		} as DecodedCall,
	}
	const request = (parts: { call: unknown; decoded: DecodedCall }[]) => ({
		op: { ...(fixtureOp() as object), exec: { calls: parts.map((p) => p.call) } },
		decodedCalls: parts.map((p) => p.decoded),
	})
	const e18 = 10n ** 18n
	const leaves = (w: VueWrapper) => w.find('[data-testid="execute-op-leaves-account"]')
	const rows = (w: VueWrapper) => w.findAll('[data-testid="execute-op-leaves-row"]').map((r) => r.findAll("span").map((t) => t.text()))

	test("three transfers and a hub call: per token, how many transfers and their sum, after the calls and before the fee; the hub call adds no row", async () => {
		const { op, decodedCalls } = request([
			transfer(VAULT, MAIN, 4n * e18),
			exit,
			transfer(VAULT, MAIN, 2n * e18),
			transfer(USDC, MAIN, 10_000_000n),
		])
		const w = await mountCard({ tokens: [USDC_TOKEN, TST], decodedCalls }, op)
		expect(leaves(w).find("span").text()).toBe("Leaves your account")
		expect(rows(w)).toEqual([
			["2 transfers", "6 TST"],
			["1 transfer", "10 USDC"],
		])
		const summary = w.get('[data-testid="execute-op-summary"]').element
		const fee = w.get("fee-settings-card-stub").element
		expect(summary.compareDocumentPosition(leaves(w).element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
		expect(leaves(w).element.compareDocumentPosition(fee) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
	})

	test("nothing this account sends: no rows; a block a window draws in the fee's place: the rows open it", async () => {
		const others = request([transfer(VAULT, RECIPIENT, 4n * e18), exit])
		expect(leaves(await mountCard({ tokens: [TST], decodedCalls: others.decodedCalls }, others.op)).exists()).toBe(false)

		const own = request([transfer(VAULT, MAIN, 4n * e18)])
		const replaced = mount(OperationCard, {
			props: { op: own.op as never, index: 0, tokens: [TST], decodedCalls: own.decodedCalls },
			slots: { fee: '<div data-testid="refusal" />' },
			global: { stubs, components: { AddressDisplay, SectionLabel } },
		})
		await flushPromises()
		expect(rows(replaced)).toEqual([["1 transfer", "4 TST"]])
		const block = replaced.get('[data-testid="refusal"]').element
		expect(leaves(replaced).element.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
		replaced.unmount()
	})

	test("an authorization the account signs counts as one, from the estimate or the raised-fee window's list; another account's does not", async () => {
		const { decodedAuthwits } = await decodeFixture()
		decodedAuthwits.set(CONSUMED.messageHash, await decodeConsumed())
		const { op, decodedCalls } = request([exit])
		const estimated = await mountCard({ decodedCalls, decodedAuthwits, feeEstimate: feeEstimateWith([...AUTHWITS, CONSUMED]) }, op)
		expect(rows(estimated)).toEqual([["1 authorization", "25 USDC"]])
		// Another account's signature naming this account's tokens, called by a contract: still not this account's.
		const forged: DiscoveredAuthwit = { ...CONSUMED, caller: HUB, args: [MAIN, ...CONSUMED.args.slice(1)], messageHash: field(0xf0f0n) }
		decodedAuthwits.set(forged.messageHash, await decodeAuthwit(forged))
		const withForged = await mountCard({ decodedCalls, decodedAuthwits, feeEstimate: feeEstimateWith([...AUTHWITS, forged]) }, op)
		expect(rows(withForged)).toEqual([["1 authorization", "25 USDC"]])

		const raised = mount(OperationCard, {
			props: { op: op as never, index: 0, tokens: [USDC_TOKEN], decodedCalls, decodedAuthwits, approvedAuthwits: AUTHWITS },
			slots: { fee: '<div data-testid="raised-fee" />' },
			global: { stubs, components: { AddressDisplay, SectionLabel } },
		})
		await flushPromises()
		expect(rows(raised)).toEqual([["1 authorization", "25 USDC"]])
		raised.unmount()
	})

	test("on an app-paid send, the account's own authorization the app carries counts as one; another account's naming this account's tokens does not", async () => {
		const { decodedAuthwits } = await decodeFixture()
		const { op, decodedCalls } = request([exit])
		const appPaid = { ...op, exec: { ...op.exec, feePayer: VAULT } }
		// As the estimate lists a carried record of the sender's: named as given by the sending account.
		const carried: DiscoveredAuthwit = { ...AUTHWITS[0]!, onBehalfOf: MAIN }
		const forged: DiscoveredAuthwit = { ...CONSUMED, caller: HUB, args: [MAIN, ...CONSUMED.args.slice(1)], messageHash: field(0xf0f0n) }
		decodedAuthwits.set(forged.messageHash, await decodeAuthwit(forged))
		const w = await mountCard({ decodedCalls, decodedAuthwits, feeEstimate: feeEstimateWith([carried, forged]) }, appPaid)
		expect(rows(w)).toEqual([["1 authorization", "25 USDC"]])
		expect(rows(await mountCard({ decodedCalls, decodedAuthwits, feeEstimate: feeEstimateWith([forged]) }, appPaid))).toEqual([])
	})
})

describe("OperationCard — a step's chevron ends its sentence beside the last word", () => {
	const TAIL = (SendTxSummary as unknown as { __cssModules: { $style: Record<string, string> } }).__cssModules.$style.chevron_tail
	/** Vue inserts comment nodes for inactive branches and empty text anchors around fragments. */
	const tails = (w: VueWrapper) =>
		w.findAll('[data-testid="execute-op-summary-call"]').map((step) => {
			const line = step.find('[data-testid="execute-op-call-line"]')
			const sentence = (line.exists() ? line : step.get('[data-testid="execute-op-summary-call-head"]')).element
			const box = sentence.querySelector('icon-stub[name="chevron"]')?.parentElement
			let before = box?.previousSibling
			while (before && (before.nodeType === Node.COMMENT_NODE || before.textContent === "")) before = before.previousSibling
			return { box: box?.className, text: box?.textContent, touches: /\S$/.test(before?.textContent ?? "") }
		})
	const HELD = { box: TAIL, text: " ", touches: true }

	test("each chevron shares one nowrap box with the no-break space after the last word: a call's head, a transfer to a named account, a transfer whose caller is none", async () => {
		expect(declarationsOf(parseSource("apps/extension/src/popup/windows/execute/SendTxSummary.vue"), ".chevron_tail")).toEqual({
			"white-space": "nowrap",
		})
		lookups.accounts.push({ name: "Savings for the long winter", address: RECIPIENT })
		const fixture = tails(await mountFixture())
		expect(fixture.length).toBeGreaterThan(1)
		expect(fixture).toEqual(fixture.map(() => HELD))
		const entry = tokenCall("transfer", [RECIPIENT, field(5_000_000n)], ["to", "amount"], {
			executionMode: "default_entrypoint",
			feeSettings: { paymentMethod: { kind: "embedded" } },
		})
		const w = await mountCard({ decodedCalls: entry.decodedCalls }, entry.op)
		expect(read(w, "execute-op-call-line")).toEqual(["5 USDC to Savings for the long winter. Caller: none"])
		expect(tails(w)).toEqual([HELD])
	})
})
