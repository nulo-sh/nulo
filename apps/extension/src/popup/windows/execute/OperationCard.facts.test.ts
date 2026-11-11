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
import type { Network } from "@/wallet/services/network/client"
import {
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
import OperationCard from "./OperationCard.vue"

const lookups = vi.hoisted(() => ({ accounts: [] as { name: string; address: string }[] }))
vi.mock("@/utils/core", () => ({ managers: { contact: { getContactByAddress: vi.fn(async () => null) } } }))
// The real store's setup opens chrome.storage; the card only needs its account list.
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ accounts: lookups.accounts }) }))
stubTokenSelectors()

const MAX_PRESSES = 2
const UNREACHED = Number.POSITIVE_INFINITY

const stubs = {
	Flex: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /></div>' },
	Text: { inheritAttrs: false, template: '<span v-bind="$attrs"><slot /></span>' },
	Icon: true,
	FeeSettingsCard: true,
}

const mountCard = async ({ vaultDecoded = true, components = { AddressDisplay } as Record<string, unknown> } = {}) => {
	const w = mount(OperationCard, {
		props: {
			op: fixtureOp() as never,
			index: 0,
			tokens: [USDC_TOKEN],
			feeEstimate: feeEstimateWith(AUTHWITS) as never,
			...(await decodeFixture({ vaultDecoded })),
		},
		global: { stubs, components: components as never },
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

/** The real `AddressDisplay`, except it renders nothing for `address`: a card that drops one row's field. */
const dropping = (address: string) =>
	defineComponent({
		inheritAttrs: false,
		components: { AddressDisplay },
		props: { address: { type: String, default: undefined } },
		setup: () => ({ dropped: address }),
		template: '<AddressDisplay v-if="address !== dropped" v-bind="$attrs" :address="address" />',
	})

beforeEach(() => {
	lookups.accounts.splice(0)
	lookups.accounts.push({ name: "Main", address: MAIN })
})

describe("OperationCard — every fact of a multi-call transaction within two presses", () => {
	test("each call's and each authorization's facts, the Vault authorization decoded", async () => {
		expect(await unreached(await mountCard(), [...FACTS, ...VAULT_DECODED_FACTS])).toEqual([])
	})

	test("each call's and each authorization's facts, the Vault authorization unreadable", async () => {
		const found = await depths(await mountCard({ vaultDecoded: false }), [...FACTS, ...VAULT_RAW_FACTS])
		// The Vault's raw fields sit behind two toggles, so the count must reach two to be a count at all.
		expect(Math.max(...found)).toBe(MAX_PRESSES)
	})

	test("a fixture's deepest leaf and every call's raw fields, within two presses", async () => {
		const account = { name: "Main", address: MAIN, chainId: 1 } as Account
		const facts = async (name: string, pick: (calls: { args: string[] }[]) => Fact[]) => {
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
				},
				global: { stubs, components: { AddressDisplay } as never },
			})
			await flushPromises()
			return { w, wanted: pick((f.operations[0] as unknown as { exec: { calls: { args: string[] }[] } }).exec.calls) }
		}
		const deep = await facts("deep", () => [{ row: '[data-call-index="0"]', text: "2020000000000000000" }])
		expect(await unreached(deep.w, deep.wanted)).toEqual([])
		const batch = await facts("batch", (calls) =>
			calls.flatMap((c, j) => titles(`[data-call-index="${j}"] [data-testid="execute-op-raw-args"]`, ...c.args)),
		)
		expect(batch.wanted.length).toBeGreaterThan(20)
		expect(await unreached(batch.w, batch.wanted)).toEqual([])
	})

	test("control: a card that drops the transfer's recipient fails the same check", async () => {
		const missing = await unreached(await mountCard({ components: { AddressDisplay: dropping(RECIPIENT) } }), FACTS)
		expect(missing).toEqual([{ row: '[data-call-index="1"]', text: trimAddress(RECIPIENT) }])
	})
})
