/**
 * Every fact the approval card shows for a multi-call transaction stays within two presses of the
 * card at rest. The card is pressed open breadth first, only ever on a closed toggle, and each fact
 * is looked for in its own row: a value shown under another call does not count for this one. Text
 * counts only as visible text; a whole value on hover counts only as a title.
 */

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { defineComponent } from "vue"
import AddressDisplay from "@/components/AddressDisplay.vue"
import { executeFixture } from "@/e2e/execute-fixture"
import { trimAddress } from "@/utils/string"
import type { Account } from "@/wallet/services/account/client"
import type { DecodedValue } from "@/wallet/services/execution/client"
import type { Network } from "@/wallet/services/network/client"
import {
	answeredList,
	AUTHWITS,
	decodeFixture,
	type Fact,
	FACTS,
	feeEstimateWith,
	fixtureOp,
	MAIN,
	RECIPIENT,
	stubTokenSelectors,
	titles,
	USDC_TOKEN,
	VAULT_DECODED_FACTS,
	VAULT_RAW_FACTS,
} from "./execute.fixture"
import { valueText } from "./call-surface"
import { type NameBook, nameBookOf } from "./contract-chips"
import OperationCard from "./OperationCard.vue"

const lookups = vi.hoisted(() => ({ accounts: [] as { name: string; address: string }[] }))
vi.mock("@/utils/core", () => ({ managers: { contact: { getContactByAddress: vi.fn(async () => null) } } }))
// The real store's setup opens chrome.storage; the card only needs its account list.
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ accounts: lookups.accounts }) }))
stubTokenSelectors()

const MAX_PRESSES = 2
const UNREACHED = Number.POSITIVE_INFINITY

/** A send names its unreadable calls once, in the line after the steps, never under a call. */
const NOT_IN_ROW = ["Can't read the arguments", "Nulo doesn't have this contract's interface"]

const stubs = {
	Flex: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /></div>' },
	Text: { inheritAttrs: false, template: '<span v-bind="$attrs"><slot /></span>' },
	Icon: true,
	FeeSettingsCard: true,
}

/** The card as the window gives it: an answered list and the person's names, the account's included. */
const settled = (names: NameBook = nameBookOf([], lookups.accounts)) => ({ marks: answeredList(), names })

const mountCard = async ({ vaultDecoded = true, drop = undefined as string | undefined } = {}) => {
	const w = mount(OperationCard, {
		props: {
			op: fixtureOp() as never,
			index: 0,
			tokens: [USDC_TOKEN],
			feeEstimate: feeEstimateWith(AUTHWITS) as never,
			...(await decodeFixture({ vaultDecoded })),
			...settled(),
		},
		global: drop
			? { stubs: { ...stubs, ContractChip: droppingChip(drop) }, components: { AddressDisplay: dropping(drop) } as never }
			: { stubs, components: { AddressDisplay } as never },
	})
	await flushPromises()
	return w
}

const normalized = (text: string): string => text.replace(/\s+/g, " ")
const shows = (w: VueWrapper, { row, text, title }: Fact): boolean =>
	w
		.findAll(row)
		.some((el) => (title ? el.findAll("[title]").some((t) => t.attributes("title") === text) : normalized(el.text()).includes(text)))

/** The press count at which each fact first shows: every closed toggle is pressed once per round. */
const depths = async (w: VueWrapper, facts: readonly Fact[]): Promise<number[]> => {
	const found = facts.map(() => UNREACHED)
	for (let depth = 0; depth <= MAX_PRESSES; depth++) {
		facts.forEach((fact, i) => {
			if (found[i] === UNREACHED && shows(w, fact)) found[i] = depth
		})
		for (const toggle of w.findAll('button[aria-expanded="false"]')) await toggle.trigger("click")
		await flushPromises()
	}
	return found
}

const unreached = async (w: VueWrapper, facts: readonly Fact[]): Promise<Fact[]> => {
	const found = await depths(w, facts)
	return facts.filter((_, i) => found[i] > MAX_PRESSES)
}

/** Every row a decoded value draws, as the tree prints it: a branch's name, a leaf's name and value,
 *  an address as `AddressDisplay` shows it. Read in its own row, so a raw field cannot answer it. */
const treeRows = (row: string, name: string, v: DecodedValue): Fact[] => {
	const own = `${row} [data-testid="execute-op-decoded-param"][data-param="${name}"]`
	const children =
		v.kind === "struct"
			? v.fields.map((f) => [f.name, f.value] as const)
			: v.kind === "array"
				? v.items.map((item, i) => [`[${i}]`, item] as const)
				: []
	if (children.length) return [{ row: own, text: `${name}:` }, ...children.flatMap(([n, c]) => treeRows(row, n, c))]
	if (v.kind === "address") return [{ row: own, text: v.value === MAIN ? "Main" : trimAddress(v.value) }]
	const text = v.kind === "struct" ? "{}" : v.kind === "array" ? "[]" : valueText(v)
	return [{ row: own, text: `${name}:${text}` }]
}

/** The real `AddressDisplay`, except it renders nothing for `address`: a card that drops one row's field. */
const dropping = (address: string) =>
	defineComponent({
		inheritAttrs: false,
		components: { AddressDisplay },
		props: { address: { type: String, default: undefined } },
		setup: () => ({ dropped: address }),
		template: '<AddressDisplay v-if="address !== dropped" v-bind="$attrs" :address="address" />',
	})

/** A chip that prints its label, and nothing for `address`. */
const droppingChip = (address: string) =>
	defineComponent({
		props: { model: { type: Object, required: true } },
		setup: () => ({ dropped: address }),
		template: '<span v-if="model.address !== dropped">{{ model.label }}</span>',
	})

beforeEach(() => {
	lookups.accounts.splice(0)
	lookups.accounts.push({ name: "Main", address: MAIN })
})

describe("OperationCard — every fact of a multi-call transaction within two presses", () => {
	test("each call's and each authorization's facts, the Vault authorization decoded", async () => {
		const w = await mountCard()
		expect(await unreached(w, [...FACTS, ...VAULT_DECODED_FACTS])).toEqual([])
		expect(NOT_IN_ROW.filter((text) => normalized(w.text()).includes(text))).toEqual([])
	})

	test("each call's and each authorization's facts, the Vault authorization unreadable", async () => {
		const found = await depths(await mountCard({ vaultDecoded: false }), [...FACTS, ...VAULT_RAW_FACTS])
		// The Vault's raw fields sit behind two toggles, so the count must reach two to be a count at all.
		expect(Math.max(...found)).toBe(MAX_PRESSES)
	})

	test.each(["one", "batch", "deep", "raw"])(
		"%s: every call's decoded values and raw fields and every authorization's raw fields, within two presses",
		async (name) => {
			const account = { name: "Main", address: MAIN, chainId: 1 } as Account
			const f = executeFixture(name, account, { id: "net-1", chainId: 1, name: "N" } as Network)
			if (!f) throw new Error(name)
			const w = mount(OperationCard, {
				props: {
					op: f.operations[0] as never,
					index: 0,
					tokens: f.tokens,
					feeEstimate: f.feeEstimates[0] as never,
					decodedCalls: f.decodedCalls[0] as never,
					decodedAuthwits: f.decodedAuthwits as never,
					...settled(),
				},
				global: { stubs, components: { AddressDisplay } as never },
			})
			await flushPromises()
			const calls = (f.operations[0] as unknown as { exec: { calls: { args: string[] }[] } }).exec.calls
			// A token's own calls read as the wallet's transfer rows; every other decode prints its tree.
			const decoded = f.decodedCalls[0]!.flatMap((d, j) =>
				d.kind === "decoded" && d.contract !== "Token"
					? d.params.flatMap((p) => treeRows(`[data-call-index="${j}"]`, p.name, p.value))
					: [],
			)
			const wanted = [
				...decoded,
				...calls.flatMap((c, j) => titles(`[data-call-index="${j}"] [data-testid="execute-op-raw-args"]`, ...c.args)),
				...(f.feeEstimates[0]!.discoveredAuthwits ?? []).flatMap((a) =>
					titles(`[data-message-hash="${a.messageHash}"] [data-testid="execute-discovered-authwit-raw-args"]`, ...a.args),
				),
			]
			expect(wanted.length).toBeGreaterThan(calls.length)
			expect(await unreached(w, wanted)).toEqual([])
		},
	)

	test("control: a card that drops the transfer's recipient fails the same check", async () => {
		const missing = await unreached(await mountCard({ drop: RECIPIENT }), FACTS)
		expect(missing).toEqual([{ row: '[data-call-index="1"]', text: trimAddress(RECIPIENT) }])
	})
})
