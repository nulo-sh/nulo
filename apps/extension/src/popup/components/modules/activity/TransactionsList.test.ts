/**
 * The Archives list hands each row kind its detail route; the cards own the link.
 */
import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { flaggedKeysOf } from "@/utils/token-flag"
import { tokenIconsOf } from "@/utils/token-icon"
import { TEST_ICONS, TEST_LIST_ENTRIES_WITH_ICONS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"
import TransactionsList from "./TransactionsList.vue"

/** A field past the list's contracts: flagged on Testnet, and never listed. */
const FLAGGED = `0x${"0e".repeat(32)}`
const CUSTOM = `0x${"0c".repeat(32)}`

vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({ network: { chainId: CHAIN_IDS.TESTNET }, defaultExplorer: "aztecscan" }),
}))
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		const snapshot = async () => ({
			quotes: {},
			pricedTokens: {},
			flaggedTokens: flaggedKeysOf([{ chainId: CHAIN_IDS.TESTNET, address: FLAGGED }]),
			tokenIcons: tokenIconsOf(TEST_LIST_ENTRIES_WITH_ICONS),
		})
		return {
			disconnect: vi.fn(),
			onQuotesUpdated: { add: vi.fn(), remove: vi.fn() },
			onConnected: { add: vi.fn(), remove: vi.fn() },
			getQuotes: vi.fn(snapshot),
			refreshIfStale: vi.fn(snapshot),
		}
	}),
}))

const cardStub = (name: string) => ({
	name,
	props: ["to", "arriving"],
	template: `<div data-stub="${name}" :data-to="to" :data-arriving="arriving ? 'true' : undefined" />`,
})

const ROWS = [
	{ type: "tx", key: "tx:0xh1", sortKey: 3000, tx: { hash: "0xh1" } },
	{
		type: "journal",
		key: "journal:op-1",
		sortKey: 2000,
		op: { id: "op-1", kind: "transfer", terminalAt: 1, createdAt: 1, progress: { stage: "cancelled" } },
	},
	{ type: "incoming", key: "inc:r1", sortKey: 1000, inc: { id: "r1", kind: "note", amountRaw: "1", txHash: "0xh" } },
]

const mountList = (props: Record<string, unknown>) =>
	mount(TransactionsList, {
		props,
		global: {
			stubs: {
				Flex: { template: "<div><slot /></div>" },
				TransactionCard: cardStub("TransactionCard"),
				TransactionTerminalCard: cardStub("TransactionTerminalCard"),
				TransactionIncomingCard: cardStub("TransactionIncomingCard"),
			},
		},
	})

describe("modules/activity/TransactionsList", () => {
	test("each incoming row asks isArriving for its own receipt; with none, no row plays", () => {
		const second = { type: "incoming", key: "inc:r2", sortKey: 900, inc: { id: "r2", kind: "note", amountRaw: "1", txHash: "0xh" } }
		const isArriving = vi.fn((inc: { id: string }) => inc.id === "r2")
		const w = mountList({ rows: [...ROWS, second], isArriving })
		const played = w.findAll('[data-stub="TransactionIncomingCard"]').map((c) => c.attributes("data-arriving"))
		expect(played).toEqual([undefined, "true"])
		expect(isArriving.mock.calls.map(([inc]) => inc.id)).toEqual(["r1", "r2"])
		expect(mountList({ rows: ROWS }).find('[data-stub="TransactionIncomingCard"]').attributes("data-arriving")).toBeUndefined()
	})

	test("each row kind links to its detail route", () => {
		const w = mountList({ rows: ROWS })
		expect(w.find('[data-stub="TransactionCard"]').attributes("data-to")).toBe("/popup/tx/0xh1")
		expect(w.find('[data-stub="TransactionTerminalCard"]').attributes("data-to")).toBe("/popup/journal/op-1")
		expect(w.find('[data-stub="TransactionIncomingCard"]').attributes("data-to")).toBe("/popup/received/r1")
	})

	test("a settled row, a transfer row and a received row take their token from `tokens`", () => {
		const token = { id: 7, contract: "0xc", symbol: "TST", decimals: 6, hasDecimals: true }
		const op = {
			id: "op-2",
			kind: "transfer",
			tokenId: 7,
			amountRaw: "1500000",
			terminalAt: 1,
			createdAt: 1,
			progress: { stage: "cancelled" },
		}
		const inc = { id: "r3", kind: "note", tokenId: 7, contract: "0xc", amountRaw: "2000000", txHash: "0xh" }
		const w = mount(TransactionsList, {
			props: {
				rows: [
					{ type: "tx", key: "tx:0xh1", sortKey: 3000, tx: { hash: "0xh1" } },
					{ type: "journal", key: "journal:op-2", sortKey: 2000, op },
					{ type: "incoming", key: "inc:r3", sortKey: 1000, inc },
				],
				tokens: [token],
			},
			global: {
				stubs: {
					Flex: { template: "<div><slot /></div>" },
					TransactionCard: {
						props: ["tokens"],
						template: '<div data-stub="settled" :data-symbols="tokens.map((t) => t.symbol)" />',
					},
					TransactionTerminalCard: {
						props: ["title", "amount"],
						template: '<div data-stub="terminal" :data-title="title" :data-amount="amount" />',
					},
					TransactionIncomingCard: {
						props: ["tokenSymbol", "tokenDecimals"],
						template: '<div data-stub="incoming" :data-symbol="tokenSymbol" :data-decimals="tokenDecimals" />',
					},
				},
			},
		})
		expect(w.get('[data-stub="settled"]').attributes("data-symbols")).toBe("TST")
		expect(w.get('[data-stub="terminal"]').attributes()).toMatchObject({ "data-title": "TST", "data-amount": "1.5" })
		expect(w.get('[data-stub="incoming"]').attributes()).toMatchObject({ "data-symbol": "TST", "data-decimals": "6" })
	})

	test("History draws each row's token mark through the list: a custom token's initials, a listed one's logo, a flagged one's badge", async () => {
		const field = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`
		const token = (id: number, contract: string, symbol: string) => ({
			id,
			chainId: CHAIN_IDS.TESTNET,
			contract,
			symbol,
			name: symbol,
			decimals: 6,
			hasDecimals: true,
		})
		const settled = {
			hash: field(0x5e5en),
			status: 5,
			origin: { type: 0 },
			calls: [
				{
					contract: CUSTOM,
					method: "transfer_private_to_public",
					args: [field(0xa1n), field(0xb2n), field(1_500_000n)],
					transfers: [
						{
							token: { name: "cBTC", symbol: "cBTC", decimals: 6 },
							type: 1,
							from: field(0xa1n),
							to: field(0xb2n),
							amount: "1500000",
						},
					],
				},
			],
		}
		const op = {
			id: "op-3",
			kind: "transfer",
			tokenId: 1,
			amountRaw: "700000",
			transferType: 1,
			accountAddress: field(0xa1n),
			recipientAddress: field(0xb2n),
			progress: { stage: "failed" },
			error: { kind: "simulation", message: "reverted", normalizedRaw: null },
			terminalAt: 2,
			createdAt: 1,
			updatedAt: 2,
		}
		const inc = { id: "r4", kind: "note", tokenId: 3, contract: FLAGGED, amountRaw: "2500000", txHash: field(0x7a7an) }
		const w = mount(TransactionsList, {
			props: {
				rows: [
					{ type: "tx", key: "tx:settled", sortKey: 3000, tx: settled },
					{ type: "journal", key: "journal:op-3", sortKey: 2000, op },
					{ type: "incoming", key: "inc:r4", sortKey: 1000, inc },
				],
				tokens: [token(1, TEST_TOKENS.USDC, "USDC"), token(2, CUSTOM, "cBTC"), token(3, FLAGGED, "USDC")],
			},
			global: {
				stubs: {
					Flex: { template: '<div v-bind="$attrs"><slot /></div>', inheritAttrs: false },
					Icon: { template: '<span data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color"] },
					RowTarget: true,
					RowAction: true,
					Spinner: true,
				},
			},
		})
		await flushPromises()
		const marks = ["tx-card", "tx-terminal-card", "tx-incoming-card"].map((card) => {
			const mark = w.get(`[data-testid="${card}"] [data-testid="activity-title-row"] > [data-testid="token-mark"]`)
			return {
				kind: mark.attributes("data-kind"),
				src: mark.element.querySelector("img")?.getAttribute("src") ?? undefined,
				text: mark.text(),
				badge: mark.findAll('[data-testid="stub-icon"]').map((i) => i.attributes("data-name")),
			}
		})
		expect(marks).toEqual([
			{ kind: "initials", src: undefined, text: "C", badge: [] },
			{ kind: "logo", src: TEST_ICONS.USDC, text: "", badge: [] },
			{ kind: "initials", src: undefined, text: "U", badge: ["warning"] },
		])
	})
})
