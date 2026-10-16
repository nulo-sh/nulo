/**
 * Every fact the approval card shows for a multi-call transaction stays within two presses of the
 * card at rest. The card is pressed open breadth first, only ever on a closed toggle, and each fact
 * is looked for in its own row: a value shown under another call does not count for this one.
 */

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { defineComponent } from "vue"
import AddressDisplay from "@/components/AddressDisplay.vue"
import { trimAddress } from "@/utils/string"
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
const shows = (w: VueWrapper, { row, text }: Fact): boolean =>
	w.findAll(row).some((el) => normalized(el.text()).includes(text) || el.findAll("[title]").some((t) => t.attributes("title") === text))

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

	test("control: a card that drops the transfer's recipient fails the same check", async () => {
		const missing = await unreached(await mountCard({ components: { AddressDisplay: dropping(RECIPIENT) } }), FACTS)
		expect(missing).toEqual([{ row: '[data-call-index="1"]', text: trimAddress(RECIPIENT) }])
	})
})
