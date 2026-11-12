/**
 * Each contract a send names reads as its chip, read through the card over the wire-shaped fixture
 * (32-byte hex fields, the real Token decode) and a reader built from the list as the worker sends
 * it: a token the list names on the request's chain by the list's symbol and picture, with the solid
 * seal; any other contract by its short address, with no seal and no name of the person's; a flagged
 * held token keeping its badge; every chip pending without a reader. The calls Nulo cannot read are
 * named in one line after the steps, an unreadable authorization in one line under its own, and a
 * send carries no closing advice.
 */

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { ref } from "vue"
import { BUNDLED_TOKEN_CLASS_IDS, type TokenListEntry, type TokenListPair } from "@nulo/token-list"
import SectionLabel from "@nulo/design/ui/SectionLabel.vue"
import AddressDisplay from "@/components/AddressDisplay.vue"
import type { ListReader } from "@/utils/contract-level"
import { trimAddress } from "@/utils/string"
import { flaggedKeysOf, isFlaggedToken, listKeyOf } from "@/utils/token-flag"
import { listedTokensOf, tokenIconFor, tokenIconsOf } from "@/utils/token-icon"
import { TEST_ICONS } from "@/wallet/services/token-list/list.fixture"
import { shownText } from "../../../../tests/helpers/shown-text"
import {
	AUTHWITS,
	decodeFixture,
	feeEstimateWith,
	fixtureOp,
	HUB,
	MAIN,
	openAllSteps,
	RECIPIENT,
	stubTokenSelectors,
	UNKNOWN,
	USDC,
	USDC_TOKEN,
	VAULT,
} from "./execute.fixture"
import OperationCard from "./OperationCard.vue"

vi.mock("@/utils/core", () => ({ managers: { contact: { getContactByAddress: vi.fn(async () => null) } } }))
const lookups = vi.hoisted(() => ({ accounts: [] as { name: string; address: string }[] }))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ accounts: lookups.accounts }) }))
stubTokenSelectors()

const stubs = {
	Flex: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /></div>' },
	Text: { inheritAttrs: false, template: '<span v-bind="$attrs"><slot /></span>' },
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" :data-color="color" />', props: ["name", "size", "color"] },
	FeeSettingsCard: true,
}

/** The fixture runs on chain 1. */
const CHAIN = fixtureOp().network?.chainId as number
const usdcListedOn = (chainId: number): TokenListEntry => ({
	chainId,
	address: USDC,
	classId: BUNDLED_TOKEN_CLASS_IDS[0],
	symbol: "USDC",
	decimals: 6,
	name: "USD Coin",
	icon: TEST_ICONS.USDC,
})
/** The list's reader as `useTokenFlags` gives it once the list has answered. */
const readerOf = (entries: readonly TokenListEntry[], flagged: readonly TokenListPair[] = []): { marks: ListReader } => {
	const icons = tokenIconsOf(entries)
	const listed = listedTokensOf(entries)
	const flags = new Set(flaggedKeysOf(flagged))
	return {
		marks: {
			mapped: ref(true),
			isFlagged: (t) => isFlaggedToken(flags, t),
			iconFor: (t) => tokenIconFor(icons, t),
			listedAt: (t) => {
				if (typeof t?.chainId !== "number" || typeof t.contract !== "string") return undefined
				const key = listKeyOf(t.chainId, t.contract)
				return Object.hasOwn(listed, key) ? listed[key] : undefined
			},
		},
	}
}

const mountLine = async (props: Record<string, unknown>) => {
	const w = mount(OperationCard, {
		props: {
			op: fixtureOp() as never,
			index: 0,
			tokens: [USDC_TOKEN],
			feeEstimate: feeEstimateWith(AUTHWITS),
			...(await decodeFixture()),
			...props,
		},
		global: { stubs, components: { AddressDisplay, SectionLabel } },
	})
	await flushPromises()
	return w
}

const CALL_LABEL = "execute-op-summary-call-to"
const CONSUMER_LABEL = "execute-discovered-line-consumer"
const callChip = (j: number) => `[data-call-index="${j}"] [data-testid="execute-op-call-to"]`
const authwitChip = (hash: string) => `[data-message-hash="${hash}"] [data-testid="execute-discovered-authwit-line"]`

/** The chip inside `row`: its level, label, accessible name, mark and seal. */
const chipOf = (w: VueWrapper, row: string, label = CALL_LABEL) => {
	const chip = w.get(`${row} [data-testid="contract-chip"]`)
	const mark = chip.find('[data-testid="token-mark"]')
	const seal = chip.find('[data-testid="contract-chip-seal"]')
	return {
		level: chip.attributes("data-level"),
		label: chip.get(`[data-testid="${label}"]`).text(),
		name: chip.attributes("aria-label"),
		mark: mark.exists()
			? {
					kind: mark.attributes("data-kind"),
					src: mark.element.querySelector("img")?.getAttribute("src") ?? undefined,
					initials: mark.element.querySelector("img") ? "" : mark.text(),
					badge: mark.findAll('[data-testid="stub-icon"]').map((i) => [i.attributes("data-name"), i.attributes("data-color")]),
					size: mark.attributes("style"),
					before: mark.element.nextElementSibling?.getAttribute("data-testid"),
				}
			: null,
		seal: seal.exists() ? [seal.attributes("data-name"), seal.attributes("data-color")] : null,
	}
}
/** A step's sentence: its head, then its line when the wallet read a movement. */
const sentenceOf = (w: VueWrapper, j: number): string[] =>
	w
		.findAll(
			`[data-call-index="${j}"] [data-testid="execute-op-summary-call-head"], [data-call-index="${j}"] [data-testid="execute-op-call-line"]`,
		)
		.map((el) => shownText(el.element))
const unparsed = (w: VueWrapper): string[] => w.findAll('[data-testid="execute-op-summary-unparsed"]').map((l) => l.text())
const advice = (w: VueWrapper) => w.findAll('[data-testid$="-unverified-advice"]')

const MARK = { size: "width: 16px; height: 16px;", before: CALL_LABEL }
const unverified = (address: string) => ({
	level: "none",
	label: trimAddress(address),
	name: `${trimAddress(address)}, Unverified`,
	mark: null,
	seal: null,
})
const TRANSFER_LINE = `from Main to ${trimAddress(RECIPIENT)}`
const wireCalls = () => (fixtureOp() as unknown as { exec: { calls: unknown[] } }).exec.calls

beforeEach(() => {
	lookups.accounts.splice(0)
	lookups.accounts.push({ name: "Main", address: MAIN })
})

describe("execute/SendTxSummary — the contract chip", () => {
	test("a token the list names on the chain reads by the list's symbol, its picture inside the chip and the solid seal", async () => {
		// The person's own symbol differs, so the label can only be the list's.
		const w = await mountLine({ ...readerOf([usdcListedOn(CHAIN)]), tokens: [{ ...USDC_TOKEN, symbol: "MYUSD" }] })
		const listed = (label: string) => ({
			level: "nulo",
			label: "USDC",
			name: "USDC, Nulo verified",
			mark: { kind: "logo", src: TEST_ICONS.USDC, initials: "", badge: [], ...MARK, before: label },
			seal: ["seal-solid", "primary"],
		})
		expect(chipOf(w, callChip(1))).toEqual(listed(CALL_LABEL))
		expect(chipOf(w, authwitChip(AUTHWITS[0]!.messageHash), CONSUMER_LABEL)).toEqual(listed(CONSUMER_LABEL))
		expect(sentenceOf(w, 1)).toEqual(["Transfer (private) 0.1 USDC", TRANSFER_LINE])
		expect(
			w.get('[data-call-index="1"] [data-testid="execute-op-summary-call-head"] [data-testid="execute-op-line-amount"]').text(),
		).toBe("0.1")
	})

	test("a held token the list does not name keeps neither its symbol nor its initials, and the same address listed on another chain reads the same", async () => {
		for (const reader of [readerOf([]), readerOf([usdcListedOn(CHAIN + 1)])]) {
			const w = await mountLine(reader)
			expect(chipOf(w, callChip(1))).toEqual(unverified(USDC))
			expect(sentenceOf(w, 1)).toEqual([`Transfer (private) 0.1 ${trimAddress(USDC)}`, TRANSFER_LINE])
		}
	})

	test("a flagged held token's chip keeps its mark with the red badge and draws no seal", async () => {
		const w = await mountLine(readerOf([], [{ chainId: CHAIN, address: USDC }]))
		expect(chipOf(w, callChip(1))).toEqual({
			...unverified(USDC),
			mark: { kind: "initials", src: undefined, initials: "U", badge: [["warning", "red"]], ...MARK },
		})
	})

	test("a card given no list reader draws every chip pending: its short address alone, no seal, no mark", async () => {
		const w = await mountLine({})
		const chips = w.findAll('[data-testid="contract-chip"]').map((chip) => ({
			level: chip.attributes("data-level"),
			name: chip.attributes("aria-label"),
			label: chip.get(`[data-testid="${CALL_LABEL}"], [data-testid="${CONSUMER_LABEL}"]`).text(),
			marked: chip.find('[data-testid="token-mark"]').exists(),
			sealed: chip.find('[data-testid="contract-chip-seal"]').exists(),
		}))
		expect(chips).toEqual(
			[HUB, USDC, UNKNOWN, USDC, VAULT].map((address) => {
				const label = trimAddress(address)
				return { level: "pending", name: label, label, marked: false, sealed: false }
			}),
		)
	})

	test("an unknown contract's chip has no mark and never an account's name; a held token whose symbol reads as nothing gives base units", async () => {
		lookups.accounts.push({ name: "Checkpoints", address: UNKNOWN })
		const unnamed = { ...USDC_TOKEN, symbol: String.fromCharCode(7) }
		const w = await mountLine({ ...readerOf([usdcListedOn(CHAIN + 1)]), tokens: [unnamed] })
		expect([chipOf(w, callChip(0)), chipOf(w, callChip(2)), chipOf(w, authwitChip(AUTHWITS[1]!.messageHash), CONSUMER_LABEL)]).toEqual([
			unverified(HUB),
			unverified(UNKNOWN),
			unverified(VAULT),
		])
		expect(sentenceOf(w, 1)).toEqual([`Transfer (private) 100000 base units ${trimAddress(USDC)}`, TRANSFER_LINE])
	})

	test("one unreadable call among readable ones: one line after the steps names its step, and no advice, open or not", async () => {
		const [, transfer, checkpoint] = wireCalls()
		const { decodedCalls } = await decodeFixture()
		const w = await mountLine({
			op: { ...(fixtureOp() as object), exec: { calls: [transfer, checkpoint, transfer] } },
			decodedCalls: [decodedCalls[1], decodedCalls[2], decodedCalls[1]],
		})
		expect(unparsed(w)).toEqual(["Nulo can't parse the call from step 2."])
		const line = w.get('[data-testid="execute-op-summary-unparsed"]').element
		expect(line.previousElementSibling?.getAttribute("data-testid")).toBe("execute-op-summary-calls")
		expect(w.find('[data-call-index="1"] [data-testid$="-unverified-args"]').exists()).toBe(false)
		expect(advice(w)).toHaveLength(0)
		await openAllSteps(w)
		expect([unparsed(w), advice(w).length]).toEqual([["Nulo can't parse the call from step 2."], 0])
	})

	test("an unreadable call and an unreadable authorization: the line names the call, the authorization has its own one line, and no advice anywhere", async () => {
		const [, transfer, checkpoint] = wireCalls()
		const { decodedCalls, decodedAuthwits } = await decodeFixture({ vaultDecoded: false })
		const w = await mountLine({
			op: { ...(fixtureOp() as object), exec: { calls: [transfer, checkpoint] } },
			decodedCalls: [decodedCalls[1], decodedCalls[2]],
			decodedAuthwits,
		})
		const authwitLines = () =>
			w
				.findAll('[data-testid="execute-op-summary-authwit"]')
				.map((row) => row.findAll('[data-testid$="-unparsed"]').map((l) => l.text()))
		expect(unparsed(w)).toEqual(["Nulo can't parse the call from step 2."])
		expect(authwitLines()).toEqual([[], ["Nulo can't parse this authorization."]])
		expect(advice(w)).toHaveLength(0)
		await openAllSteps(w)
		expect([unparsed(w), authwitLines(), advice(w).length]).toEqual([
			["Nulo can't parse the call from step 2."],
			[[], ["Nulo can't parse this authorization."]],
			0,
		])
	})
})
