/**
 * TransactionCard (settled) — colocated unit tests.
 *
 * The settled card derives its two title-row chips from independent sources
 * (call shape → transferTypeLabel; tx.origin → originLabel), unlike the
 * journal-driven awaiting + terminal cards where the two are mutually
 * exclusive. This test pins the dApp-initiated-transfer case where BOTH
 * fields are set, to guard against a regression
 * (a `||` template silently dropped the dApp origin chip on dApp transfers).
 */

import { mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import { OriginType, TransferType, TxExecutionResult, TxStatus } from "@/wallet/services/transaction/spec"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { flushPromises } from "@vue/test-utils"
import { TEST_PRICED_TOKENS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"

// Bypass the real Pinia app store + its chrome.storage subscriptions —
// TransactionCard only reads `network.chainId` + `defaultExplorer` for the
// explorer URL computed; nothing in the chip-render path needs the store.
vi.mock("@/stores/app.store", () => ({
	useAppStore: () => ({ network: { chainId: CHAIN_IDS.TESTNET }, defaultExplorer: "aztecscan" }),
}))

// Controllable price feed for the D2 fiat case.
let mockQuotes: Record<string, unknown> = {}
vi.mock("@/wallet/services/price/client", () => ({
	PriceServiceClient: vi.fn(function () {
		return {
			disconnect: vi.fn(),
			onQuotesUpdated: { add: vi.fn(), remove: vi.fn() },
			onConnected: { add: vi.fn(), remove: vi.fn() },
			getQuotes: vi.fn(async () => ({ quotes: {}, pricedTokens: TEST_PRICED_TOKENS })),
			refreshIfStale: vi.fn().mockImplementation(async () => ({ quotes: mockQuotes, pricedTokens: TEST_PRICED_TOKENS })),
		}
	}),
}))

import { RowAction } from "@nulo/design"
import TransactionCard from "./TransactionCard.vue"

const STUBS = {
	Flex: { template: '<div :class="$attrs.class" v-bind="$attrs"><slot /></div>', inheritAttrs: false },
	Text: { template: "<span><slot /></span>" },
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" :data-color="color" />', props: ["name", "size", "color"] },
	TransactionCardLayout: {
		template: `
			<div :data-testid="testId" :data-tx-transfer-type="txTransferTypeLabel">
				<span class="title">{{ title }}</span>
				<slot name="title-trailing" />
				<slot name="badge" />
				<slot name="secondary" />
				<span class="amount">{{ amount }}</span>
				<span class="symbol">{{ amountSymbol }}</span>
				<span v-if="amountFiat" data-testid="activity-fiat">{{ amountFiat }}</span>
			</div>
		`,
		props: [
			"title",
			"icon",
			"amount",
			"amountSymbol",
			"amountFiat",
			"testId",
			"txAmountDisplay",
			"txTransferTypeLabel",
			"txStatus",
			"txHash",
			"to",
			"oneLineTitle",
		],
	},
}

const TX_HASH = `0x${"abcd1234".repeat(8)}`
const dappTransferTx = {
	hash: TX_HASH,
	status: TxStatus.Proposed,
	calls: [
		{
			contract: "0xtoken",
			method: "transfer_private_to_public",
			args: ["0xfrom", "0xto", "5000000"],
			transfers: [
				{
					token: { name: "USDC", symbol: "USDC", decimals: 6 },
					type: TransferType.PrivateToPublic,
					from: "0xfrom",
					to: "0xto",
					amount: "5000000",
				},
			],
		},
	],
	origin: { type: OriginType.DAPP, name: "example.dapp.io" },
}

const mountCard = (tx: Record<string, unknown>, props: Record<string, unknown> = {}) =>
	mount(TransactionCard, { props: { tx, ...props } as never, global: { stubs: STUBS, components: { RowAction } } })

describe("modules/activity/TransactionCard (settled)", () => {
	test.each([
		["mined", { status: TxStatus.Proposed, executionResult: TxExecutionResult.Success }, "square-check", "txt-success"],
		["reverted", { status: TxStatus.Proposed, executionResult: TxExecutionResult.AppLogicReverted }, "square-cross", "txt-danger"],
		["dropped", { status: TxStatus.Dropped }, "square-cross", "txt-danger"],
		["pending", { status: TxStatus.Pending }, "square-half", "gray"],
	])("a %s tx's status icon fills with its state's status text token", (_label, over, name, fill) => {
		const icon = mountCard({ ...dappTransferTx, ...over }).find(`[data-testid="activity-status-icon"][data-name="${name}"]`)
		expect(icon.attributes("data-color")).toBe(fill)
	})

	test("dApp-initiated transfer renders BOTH transferTypeLabel and originLabel chips (regression pin)", () => {
		const w = mountCard(dappTransferTx)
		// transferTypeLabel from call.transfers[0].type
		expect(w.text()).toContain("Private → Public")
		// originLabel from tx.origin.name — must NOT be silently dropped by
		// the `||` template when the call shape ALSO produces a transferType.
		expect(w.text()).toContain("example.dapp.io")
	})

	describe("the title row, with a dApp's function and host as the wire carries them", () => {
		const HOST = "staging-nemi-interface.nemi-e65.workers.dev"
		const dappCallTx = {
			hash: TX_HASH,
			status: TxStatus.Proposed,
			calls: [{ contract: "0xamm", method: "swap_exact_tokens_for_tokens_supporting_fee_on_transfer_tokens", args: [] }],
			origin: { type: OriginType.DAPP, name: HOST },
		}
		const layout = (w: ReturnType<typeof mountCard>) => w.findComponent(STUBS.TransactionCardLayout)

		test("a call names the dApp and no direction: its function title is cut to one line and the host sits in the app chip", () => {
			const w = mountCard(dappCallTx)
			expect(layout(w).props("title")).toBe("Swap Exact Tokens For Tokens Supporting Fee On Transfer Tokens")
			expect(layout(w).props("oneLineTitle")).toBe(true)
			expect(w.find('[data-testid="activity-app-chip"]').text()).toBe(HOST)
			expect(w.html()).not.toMatch(/chips/)
		})

		test("a transfer from the popup is never cut and has no app chip", () => {
			const { origin: _origin, ...popupTransfer } = dappTransferTx
			const w = mountCard(popupTransfer)
			expect(layout(w).props("oneLineTitle")).toBe(false)
			expect(w.find('[data-testid="activity-app-chip"]').exists()).toBe(false)
			expect(w.find('[data-testid="activity-direction-chip"]').text()).toBe("Private → Public")
			expect(w.html()).not.toMatch(/app_slot/)
		})

		test("a dApp's transfer keeps its symbol whole and groups the direction with a slot that holds the app chip", () => {
			const w = mountCard({ ...dappTransferTx, origin: { type: OriginType.DAPP, name: HOST } })
			expect(layout(w).props("oneLineTitle")).toBe(false)
			const slot = w.find('[data-testid="activity-app-chip"]').element.parentElement
			expect(slot?.className).toMatch(/app_slot/)
			expect(slot?.textContent).toBe(HOST)
			const group = slot?.parentElement
			expect(group?.className).toMatch(/chips/)
			expect([...(group?.children ?? [])]).toEqual([w.find('[data-testid="activity-direction-chip"]').element, slot])
			expect(group?.textContent).toBe(`Private → Public${HOST}`)
		})
	})

	describe("a dApp's mint, as the wire carries it", () => {
		const field = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`
		const TOKEN = `0x${"0a".repeat(32)}`
		const RECIPIENT = `0x${"0c".repeat(32)}`
		const CLASS = field(0xc1a55n)
		const tokens = [
			{
				id: 1,
				chainId: CHAIN_IDS.TESTNET,
				contract: TOKEN,
				classId: CLASS,
				name: "Test",
				symbol: "TST",
				decimals: 18,
				hasDecimals: true,
			},
		]
		const mintTx = (...amounts: bigint[]) => ({
			hash: "0xmint1",
			status: TxStatus.Proposed,
			calls: amounts.map((a) => ({ contract: TOKEN, method: "mint_to_public", args: [RECIPIENT, field(a)], classId: CLASS })),
			origin: { type: OriginType.DAPP, name: "example.dapp.io" },
		})

		test("of a listed 18-decimal token reads 1 and its symbol", () => {
			const w = mountCard(mintTx(10n ** 18n), { tokens })
			expect(w.find(".amount").text()).toBe("1")
			expect(w.find(".symbol").text()).toBe("TST")
		})

		test("of an unlisted token shows no amount", () => {
			const w = mountCard(mintTx(10n ** 18n))
			expect(w.find(".amount").text()).toBe("")
		})

		test("of 1,234,567 tokens reads the compact form", () => {
			const w = mountCard(mintTx(1_234_567n * 10n ** 18n), { tokens })
			expect(w.find(".amount").text()).toBe("1.23M")
		})

		test("with two mint calls shows no amount", () => {
			const w = mountCard(mintTx(10n ** 18n, 10n ** 18n), { tokens })
			expect(w.find(".amount").text()).toBe("")
		})
	})

	test("`to` reaches the layout, and the explorer link is a named action opening a new tab", () => {
		const w = mountCard(dappTransferTx, { to: `/popup/tx/${TX_HASH}` })
		expect(w.findComponent(STUBS.TransactionCardLayout).props("to")).toBe(`/popup/tx/${TX_HASH}`)
		const explorer = w.find('a[aria-label="Open in block explorer"]')
		expect(explorer.attributes("target")).toBe("_blank")
		expect(explorer.attributes("rel")).toBe("noopener noreferrer")
		expect(explorer.attributes("href")).toContain(TX_HASH)
	})
})

describe("TransactionCard fiat (D2 activity rows)", () => {
	const TEST_USDC = TEST_TOKENS.USDC
	const mkTransferTx = (contract: string) =>
		({
			hash: "0xfiat1",
			status: TxStatus.Proposed,
			origin: { type: OriginType.UI },
			calls: [
				{
					contract,
					method: "transfer",
					transfers: [
						{
							token: { name: "cUSD", symbol: "cUSD", decimals: 6 },
							type: TransferType.Private,
							from: "0xa",
							to: "0xb",
							amount: (125n * 10n ** 6n).toString(),
						},
					],
				},
			],
		}) as never

	test("priced transfer row renders the ≈ fiat under the amount", async () => {
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1.0, fetchedAt: Date.now(), providerUpdatedAt: null } }
		const w = mount(TransactionCard, { props: { tx: mkTransferTx(TEST_USDC) }, global: { stubs: STUBS } })
		await flushPromises()
		const fiat = w.find('[data-testid="activity-fiat"]')
		expect(fiat.exists()).toBe(true)
		expect(fiat.text()).toBe("≈ $125.00")
	})

	test("unpriced transfer row renders NO fiat element", async () => {
		mockQuotes = {}
		const w = mount(TransactionCard, { props: { tx: mkTransferTx("0xunmapped") }, global: { stubs: STUBS } })
		await flushPromises()
		expect(w.find('[data-testid="activity-fiat"]').exists()).toBe(false)
	})

	test.each([
		["unknown decimals: no figure and no fiat", false, { amount: "", fiat: false }],
		["known decimals (control): the figure and its fiat", true, { amount: "125", fiat: true }],
	])("a priced transfer of a listed token with %s; the title keeps the symbol", async (_label, hasDecimals, want) => {
		mockQuotes = { "usd-coin": { coingeckoId: "usd-coin", usd: 1.0, fetchedAt: Date.now(), providerUpdatedAt: null } }
		const tokens = [{ contract: TEST_USDC, symbol: "cUSD", decimals: hasDecimals ? 6 : 0, hasDecimals }]
		const w = mount(TransactionCard, { props: { tx: mkTransferTx(TEST_USDC), tokens } as never, global: { stubs: STUBS } })
		await flushPromises()
		expect({
			title: w.find(".title").text(),
			amount: w.find(".amount").text(),
			fiat: w.find('[data-testid="activity-fiat"]').exists(),
		}).toEqual({ title: "cUSD", ...want })
	})
})
