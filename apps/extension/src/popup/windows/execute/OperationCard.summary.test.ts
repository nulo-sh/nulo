/**
 * A multi-call transaction reads as its summary at rest: each call in order with the wallet's own
 * reading or "Named by the app.", an unreadable call's warning, and every authorization's line. The
 * value rows open under one "Show all details". Fed the wire-shaped fixture: 32-byte hex fields,
 * real Token decodes.
 */

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import SectionLabel from "@nulo/design/ui/SectionLabel.vue"
import AddressDisplay from "@/components/AddressDisplay.vue"
import { trimAddress } from "@/utils/string"
import { vocabularySelector } from "@/utils/token-transfer-vocabulary"
import type { DecodedCall } from "@/wallet/services/execution/client"
import {
	AUTHWITS,
	decodeFixture,
	feeEstimateWith,
	field,
	fixtureOp,
	HUB,
	MAIN,
	RECIPIENT,
	stubTokenSelectors,
	UNKNOWN,
	USDC,
	USDC_TOKEN,
	VAULT,
} from "./execute.fixture"
import OperationCard from "./OperationCard.vue"

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
const toggle = (w: VueWrapper) => w.get('[data-testid="execute-op-details-toggle"]')

/** A one-call send of `name(args)` on USDC, decoded as the Token interface spells `roles`. */
const tokenCall = (name: string, args: string[], roles: string[], extra: Record<string, unknown> = {}) => {
	const op = fixtureOp() as unknown as { exec: { calls: unknown[] } }
	const call = { name, to: USDC, selector: vocabularySelector(name, args.length), type: "private", isStatic: false, args }
	const kinds: Record<string, string> = { to: "address", from: "address", amount: "integer" }
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

beforeEach(() => {
	lookups.accounts.splice(0)
	lookups.accounts.push({ name: "Main", address: MAIN })
})

describe("OperationCard — a multi-call transaction's summary", () => {
	test("at rest: each call in order with the wallet's reading or the app's naming, and both authorizations' lines", async () => {
		const w = await mountFixture()
		expect(read(w, "execute-op-summary-call-head")).toEqual([
			`Exit To L1 on ${trimAddress(HUB)}. Named by the app.`,
			`Transfer (private) on ${trimAddress(USDC)}:`,
			`Checkpoint on ${trimAddress(UNKNOWN)}`,
		])
		expect(read(w, "execute-op-call-line")).toEqual([`0.1 USDC from Main to ${trimAddress(RECIPIENT)}`])
		expect(w.findAll('[data-testid="execute-op-call-line"]')[0]!.element.closest('[data-call-index="1"]')).not.toBeNull()
		const unreadable = w.get('[data-call-index="2"] [data-testid="execute-op-summary-unverified-args"]')
		expect(unreadable.text()).toContain("Can't read the arguments")
		expect(unreadable.text()).toContain("Nulo doesn't have this contract's interface, so it can't read the arguments.")
		expect(read(w, "execute-discovered-authwit-line")).toEqual([
			`Lets ${trimAddress(HUB)} move 25 USDC from Main to ${trimAddress(HUB)}`,
			`Lets ${trimAddress(HUB)} call Withdraw For on ${trimAddress(VAULT)}`,
		])
		expect(w.get('[data-testid="execute-op-summary-authwits-section"]').text()).toMatch(/^Authorizations\s*2/)
		expect(w.findAll('[data-testid="execute-op-summary-call"]').map((li) => li.element.tagName)).toEqual(["LI", "LI", "LI"])
	})

	test("at rest the value rows are closed behind one button; one press opens them, each authorization's details open", async () => {
		const w = await mountFixture()
		expect(toggle(w).element.tagName).toBe("BUTTON")
		expect(toggle(w).attributes()).toMatchObject({ type: "button", "aria-expanded": "false" })
		expect(toggle(w).text()).toBe("Show all details")
		expect(w.find('[data-testid="execute-op-details"]').exists()).toBe(false)
		expect(w.find('[data-testid="execute-op-payload-row"]').exists()).toBe(false)

		await toggle(w).trigger("click")
		expect(toggle(w).attributes("aria-expanded")).toBe("true")
		expect(toggle(w).text()).toBe("Hide all details")
		expect(w.findAll('[data-testid="execute-op-payload-row"]')).toHaveLength(3)
		expect(w.findAll('[data-testid="execute-discovered-authwit-details"]')).toHaveLength(2)
		expect(w.findAll('[data-testid="execute-op-summary-call"]')).toHaveLength(3)
	})

	test("a call still being read says so under its own name; once read, the transfer takes the wallet's label and line", async () => {
		const w = await mountCard({ feeEstimate: feeEstimateWith(AUTHWITS) })
		expect(read(w, "execute-op-summary-call-title")).toEqual(["Exit To L1", "Transfer Private To Private", "Checkpoint"])
		expect(read(w, "execute-op-summary-args-pending")).toEqual(["Reading arguments…", "Reading arguments…", "Reading arguments…"])
		expect(w.find('[data-testid="execute-op-call-line"]').exists()).toBe(false)

		await w.setProps(await decodeFixture())
		expect(read(w, "execute-op-summary-call-title")).toEqual(["Exit To L1", "Transfer (private)", "Checkpoint"])
		expect(w.find('[data-testid="execute-op-summary-args-pending"]').exists()).toBe(false)
		expect(read(w, "execute-op-summary-unverified-warning")).toEqual(["Can't read the arguments"])
	})

	test("a transfer the wallet does not read as one keeps the function's own name, in the summary and in the rows", async () => {
		const { op, decodedCalls } = tokenCall(
			"transfer_public_to_public",
			[MAIN, RECIPIENT, field(5n), field(0n)],
			["from", "to", "amount", "_nonce"],
		)
		const w = await mountCard({ tokens: [], decodedCalls }, op)
		expect(read(w, "execute-op-summary-call-head")).toEqual([`Transfer Public To Public on ${trimAddress(USDC)}. Named by the app.`])
		await toggle(w).trigger("click")
		expect(read(w, "execute-op-payload-row")[0]).toMatch(/^Transfer Public To Public/)
	})

	test("the sender reads as 'this account' when the account is the caller, and the entrypoint's call names none", async () => {
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
