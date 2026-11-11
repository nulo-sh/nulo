/**
 * The transfer line's token mark, read through the card that threads the list's reading to it, over
 * the wire-shaped fixture (32-byte hex fields, the real Token decode): the logo for a listed contract,
 * initials for a known custom one, nothing for an unknown contract or an amount in base units, the
 * badge for a flagged one, and no logo for the same contract on another chain. The words stay as they are.
 */

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import SectionLabel from "@nulo/design/ui/SectionLabel.vue"
import AddressDisplay from "@/components/AddressDisplay.vue"
import { trimAddress } from "@/utils/string"
import { flaggedKeysOf, isFlaggedToken, listKeyOf } from "@/utils/token-flag"
import { tokenIconFor } from "@/utils/token-icon"
import { TEST_ICONS } from "@/wallet/services/token-list/list.fixture"
import {
	AUTHWITS,
	decodeFixture,
	feeEstimateWith,
	fixtureOp,
	MAIN,
	RECIPIENT,
	stubTokenSelectors,
	USDC,
	USDC_TOKEN,
} from "./execute.fixture"
import OperationCard from "./OperationCard.vue"

vi.mock("@/utils/core", () => ({ managers: { contact: { getContactByAddress: vi.fn(async () => null) } } }))
const lookups = vi.hoisted(() => ({ accounts: [] as { name: string; address: string }[] }))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ accounts: lookups.accounts }) }))
stubTokenSelectors()
lookups.accounts.push({ name: "Main", address: MAIN })

const stubs = {
	Flex: { inheritAttrs: false, template: '<div v-bind="$attrs"><slot /></div>' },
	Text: { inheritAttrs: false, template: '<span v-bind="$attrs"><slot /></span>' },
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color"] },
	FeeSettingsCard: true,
}

/** The fixture runs on chain 1; the list's reading is keyed as the worker keys it. */
const CHAIN = fixtureOp().network?.chainId as number
const listed = (chainId: number) => {
	const icons = { [listKeyOf(chainId, USDC)]: TEST_ICONS.USDC }
	return { iconFor: (t?: { chainId?: number; contract?: string }) => tokenIconFor(icons, t), isFlagged: () => false }
}
const flagged = () => {
	const keys = new Set(flaggedKeysOf([{ chainId: CHAIN, address: USDC }]))
	return { iconFor: () => undefined, isFlagged: (t?: { chainId?: number; contract?: string }) => isFlaggedToken(keys, t) }
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

/** The transfer line's mark, and its words with the mark taken out. */
const lineOf = (w: VueWrapper) => {
	const line = w.get('[data-call-index="1"] [data-testid="execute-op-call-line"]')
	const mark = line.find('[data-testid="token-mark"]')
	const words = line.element.cloneNode(true) as Element
	for (const m of words.querySelectorAll('[data-testid="token-mark"]')) m.remove()
	return {
		mark: mark.exists()
			? {
					kind: mark.attributes("data-kind"),
					src: mark.element.querySelector("img")?.getAttribute("src") ?? undefined,
					initials: mark.element.querySelector("img") ? "" : mark.text(),
					badge: mark.findAll('[data-testid="stub-icon"]').map((i) => i.attributes("data-name")),
					size: mark.attributes("style"),
					before: mark.element.nextElementSibling?.getAttribute("data-testid"),
				}
			: null,
		words: (words.textContent ?? "").replace(/\s+/g, " ").trim(),
	}
}

const WORDS = `0.1 USDC from Main to ${trimAddress(RECIPIENT)}`
const MARK = { size: "width: 16px; height: 16px;", before: "execute-op-line-amount" }

describe("execute/SendTxSummary — the transfer line's token mark", () => {
	test("a listed contract draws the list's logo before the amount, and the line's words are unchanged", async () => {
		expect(lineOf(await mountLine(listed(CHAIN)))).toEqual({
			mark: { kind: "logo", src: TEST_ICONS.USDC, initials: "", badge: [], ...MARK },
			words: WORDS,
		})
	})

	test("a known custom contract draws its initials; the same contract listed on another chain gets no logo", async () => {
		const custom = { mark: { kind: "initials", src: undefined, initials: "U", badge: [], ...MARK }, words: WORDS }
		expect(lineOf(await mountLine({}))).toEqual(custom)
		expect(lineOf(await mountLine(listed(CHAIN + 1)))).toEqual(custom)
	})

	test("a flagged contract's mark carries the badge", async () => {
		expect(lineOf(await mountLine(flagged())).mark).toMatchObject({ kind: "initials", badge: ["warning"] })
	})

	test("an unknown contract's call draws no mark, nor does a known token's amount in base units", async () => {
		const unknown = await mountLine({ tokens: [], ...listed(CHAIN) })
		expect(unknown.find('[data-call-index="1"] [data-testid="execute-op-call-line"]').exists()).toBe(false)
		expect(unknown.findAll('[data-testid="execute-op-summary"] [data-testid="token-mark"]')).toHaveLength(0)
		const unnamed = { ...USDC_TOKEN, symbol: String.fromCharCode(7) }
		expect(lineOf(await mountLine({ tokens: [unnamed], ...listed(CHAIN) }))).toEqual({
			mark: null,
			words: `100000 base units from Main to ${trimAddress(RECIPIENT)}`,
		})
	})
})
