/**
 * Every address a send names reads as its chip, read through the card over the wire-shaped fixture
 * (32-byte hex fields, the real Token decode) and a reader built from the list as the worker sends
 * it: a token the list names on the request's chain by the list's symbol and picture, with the solid
 * seal; an address the person named (a contact, an account) by that name, with no seal; any other by
 * its short address; a flagged held token keeping its badge; every chip pending without a reader or
 * while the names load. The calls Nulo cannot read are named in one line after the steps, an
 * unreadable authorization in one line under its own, and a send carries no closing advice.
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
import type { ChipModel } from "@/components/composite/contract-chip"
import ContractChip from "@/components/composite/ContractChip.vue"
import { type NameBook, nameBookOf } from "./contract-chips"
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
			names: nameBookOf([], lookups.accounts),
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

/** The chip in `row` whose label carries `label`: its level, label, accessible name, mark and seal. */
const chipOf = (w: VueWrapper, row: string, label = CALL_LABEL) => {
	const chip = w.findAll(`${row} [data-testid="contract-chip"]`).find((c) => c.find(`[data-testid="${label}"]`).exists())
	if (!chip) throw new Error(`no chip labelled ${label} in ${row}`)
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

	test("a card given no list reader holds every chip pending: under its short address's name, no seal, no mark", async () => {
		const w = await mountLine({ marks: undefined })
		const chips = w.findAll('[data-testid="contract-chip"]').map((chip) => ({
			level: chip.attributes("data-level"),
			held: chip.attributes("data-held"),
			name: chip.attributes("aria-label"),
			marked: chip.find('[data-testid="token-mark"]').exists(),
			sealed: chip.find('[data-testid="contract-chip-seal"]').exists(),
		}))
		// The steps' contracts and parties, then each authorization's caller, consumer and parties.
		expect(chips).toEqual(
			[HUB, USDC, MAIN, RECIPIENT, UNKNOWN, HUB, USDC, MAIN, HUB, HUB, VAULT].map((address) => ({
				level: "pending",
				held: "true",
				name: trimAddress(address),
				marked: false,
				sealed: false,
			})),
		)
	})

	test("the caller, a sender and a recipient are chips: an account the person named by its name, a contact by @ and its name, any other by its short address", async () => {
		const names: NameBook = nameBookOf([{ name: "Hub team", address: HUB.toUpperCase().replace("0X", "0x") }], lookups.accounts)
		const w = await mountLine({ ...readerOf([]), names })
		const step = callChip(1).replace(' [data-testid="execute-op-call-to"]', "")
		const authwit = `[data-message-hash="${AUTHWITS[0]!.messageHash}"]`
		const named = (label: string) => ({ level: "none", label, name: `${label}, Unverified`, mark: null, seal: null })
		expect(chipOf(w, step, "execute-op-line-from")).toEqual(named("Main"))
		expect(chipOf(w, step, "execute-op-line-to")).toEqual({ ...unverified(RECIPIENT) })
		expect(chipOf(w, authwit, "execute-discovered-line-caller")).toEqual(named("@Hub team"))
		expect(chipOf(w, authwit, "execute-discovered-line-from")).toEqual(named("Main"))
		expect(chipOf(w, authwit, "execute-discovered-line-to")).toEqual(named("@Hub team"))
		expect(chipOf(w, callChip(0)), "a step's contract the person named reads by that name too").toEqual(named("@Hub team"))
	})

	test("while the names load, a chip that could take one is pending and one the list settles is not", async () => {
		const w = await mountLine({ ...readerOf([usdcListedOn(CHAIN)]), names: "loading" })
		expect(chipOf(w, callChip(1)).level).toBe("nulo")
		expect(chipOf(w, callChip(0))).toMatchObject({ level: "pending", name: trimAddress(HUB) })
		const step = callChip(1).replace(' [data-testid="execute-op-call-to"]', "")
		expect(chipOf(w, step, "execute-op-line-from")).toMatchObject({ level: "pending", name: trimAddress(MAIN) })
	})

	test("an unknown contract's chip has no mark and reads by its short address; a held token whose symbol reads as nothing gives base units", async () => {
		const unnamed = { ...USDC_TOKEN, symbol: String.fromCharCode(7) }
		const w = await mountLine({ ...readerOf([usdcListedOn(CHAIN + 1)]), tokens: [unnamed] })
		expect([chipOf(w, callChip(0)), chipOf(w, callChip(2)), chipOf(w, authwitChip(AUTHWITS[1]!.messageHash), CONSUMER_LABEL)]).toEqual([
			unverified(HUB),
			unverified(UNKNOWN),
			unverified(VAULT),
		])
		expect(sentenceOf(w, 1)).toEqual([`Transfer (private) 100000 base units ${trimAddress(USDC)}`, TRANSFER_LINE])
	})

	test("the name a decoded contract's code gives it reaches its unverified press, for a call and for an authorization; a Nulo verified press never repeats it", async () => {
		const w = await mountLine(readerOf([usdcListedOn(CHAIN)]))
		const unchecked = "Nulo hasn't checked this contract."
		const listed = ["Nulo knows this contract. Knowing it isn't a promise that it's safe.", "Nulo names it from its token list."]
		expect(w.findAllComponents(ContractChip).map((chip) => (chip.props("model") as ChipModel).lines)).toEqual([
			[unchecked, "The name Hub comes from the contract's code. Nulo hasn't checked it."],
			listed,
			[unchecked],
			[unchecked],
			[unchecked],
			[unchecked],
			listed,
			[unchecked],
			[unchecked],
			[unchecked],
			[unchecked, "The name Vault comes from the contract's code. Nulo hasn't checked it."],
		])
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
